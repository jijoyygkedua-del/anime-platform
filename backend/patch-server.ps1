
$ErrorActionPreference = "Stop"

$serverPath = Join-Path $PSScriptRoot "server.js"

if (-not (Test-Path $serverPath)) {
    throw "server.js tidak ditemukan dalam folder ini."
}

$original = [System.IO.File]::ReadAllText($serverPath)

# Elakkan skrip dijalankan dua kali.
if ($original.Contains("ANIME_UPLOAD_SYSTEM_V1")) {
    throw "Sistem upload sudah ditambah. Tiada perubahan dibuat."
}

# Pastikan semua bahagian asal yang diperlukan wujud.
$required = @(
    'const fs = require("fs");',
    '// FRONTEND',
    '// DISCORD LOGIN',
    '// 404 API',
    '// START SERVER'
)

foreach ($marker in $required) {
    if (-not $original.Contains($marker)) {
        throw "Bahagian server.js tidak sepadan: $marker. Tiada perubahan dibuat."
    }
}

# Sandaran fail asal.
$backupPath = "$serverPath.backup"
Copy-Item $serverPath $backupPath -Force

# 1. Tambah konfigurasi upload.
$uploadSetup = @'

// ANIME_UPLOAD_SYSTEM_V1
const crypto = require("crypto");

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const videoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        cb(null, `${crypto.randomUUID()}.mp4`);
    }
});

const videoUpload = multer({
    storage: videoStorage,
    limits: {
        fileSize: 1024 * 1024 * 1024,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname).toLowerCase();

        if (
            extension !== ".mp4" ||
            !["video/mp4", "application/octet-stream"].includes(file.mimetype)
        ) {
            return cb(new Error("Sila pilih fail video MP4 yang sah."));
        }

        cb(null, true);
    }
});

'@

$original = $original.Replace(
    'const fs = require("fs");',
    'const fs = require("fs");' + $uploadSetup
)

# 2. Hidangkan video melalui /uploads/.
$uploadStatic = @'
app.use("/uploads", express.static(uploadDir, {
    dotfiles: "deny",
    index: false,
    setHeaders: (res) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
    }
}));

'@

$original = $original.Replace(
    '// FRONTEND',
    $uploadStatic + '// FRONTEND'
)

# 3. Middleware admin. Admin dikenal pasti melalui Discord ID.
$adminMiddleware = @'

// ANIME UPLOAD ADMIN CHECK
function requireAnimeAdmin(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({
            success: false,
            error: "Sila login dahulu."
        });
    }

    const adminIds = (process.env.ANIME_ADMIN_DISCORD_IDS || "")
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);

    if (adminIds.length === 0) {
        return res.status(503).json({
            success: false,
            error: "Admin belum dikonfigurasi dalam fail .env."
        });
    }

    pool.query(
        `SELECT provider_user_id
         FROM oauth_accounts
         WHERE user_id = $1
           AND provider = 'discord'
         LIMIT 1`,
        [req.session.userId]
    ).then(result => {
        const discordId = result.rows[0]?.provider_user_id;

        if (!discordId || !adminIds.includes(String(discordId))) {
            return res.status(403).json({
                success: false,
                error: "Upload hanya dibenarkan untuk admin."
            });
        }

        next();
    }).catch(error => {
        console.error("Anime admin check error:", error);

        res.status(500).json({
            success: false,
            error: "Gagal mengesahkan admin."
        });
    });
}

'@

$original = $original.Replace(
    '// DISCORD LOGIN',
    $adminMiddleware + '// DISCORD LOGIN'
)

# 4. Jadual episod dan API.
$episodeRoutes = @'

// =========================
// ANIME EPISODES API
// =========================

async function initializeAnimeEpisodes() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS anime_episodes (
            id BIGSERIAL PRIMARY KEY,
            anime_title VARCHAR(150) NOT NULL,
            title VARCHAR(150) NOT NULL,
            filename VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Anime Episodes database ready.");
}

// Senarai episod untuk watch.html.
app.get("/api/episodes", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, anime_title, title, filename, created_at
            FROM anime_episodes
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            episodes: result.rows.map(row => ({
                id: String(row.id),
                animeTitle: row.anime_title,
                title: row.title,
                videoUrl: "/uploads/" + encodeURIComponent(row.filename),
                createdAt: row.created_at
            }))
        });
    } catch (error) {
        console.error("Get anime episodes error:", error);

        res.status(500).json({
            success: false,
            error: "Gagal mengambil senarai episod."
        });
    }
});

// Upload MP4: medan form mesti bernama animeTitle, title dan video.
app.post(
    "/api/episodes/upload",
    requireAnimeAdmin,
    (req, res, next) => {
        videoUpload.single("video")(req, res, error => {
            if (!error) return next();

            const message = error instanceof multer.MulterError
                ? error.code === "LIMIT_FILE_SIZE"
                    ? "Saiz video melebihi had 1 GB."
                    : "Upload video gagal: " + error.message
                : error.message || "Fail video tidak sah.";

            return res.status(400).json({
                success: false,
                error: message
            });
        });
    },
    async (req, res) => {
        let savedFile = null;

        try {
            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Sila pilih fail video MP4."
                });
            }

            savedFile = req.file.path;

            const animeTitle = String(req.body.animeTitle || "").trim();
            const title = String(req.body.title || "").trim();

            if (
                animeTitle.length < 1 ||
                animeTitle.length > 150 ||
                title.length < 1 ||
                title.length > 150
            ) {
                fs.unlink(savedFile, () => {});

                return res.status(400).json({
                    success: false,
                    error: "Tajuk anime dan episod mesti 1–150 aksara."
                });
            }

            const result = await pool.query(
                `INSERT INTO anime_episodes
                    (anime_title, title, filename)
                 VALUES ($1, $2, $3)
                 RETURNING id, anime_title, title, filename, created_at`,
                [animeTitle, title, req.file.filename]
            );

            const episode = result.rows[0];

            return res.status(201).json({
                success: true,
                message: "Video berjaya dimuat naik.",
                episode: {
                    id: String(episode.id),
                    animeTitle: episode.anime_title,
                    title: episode.title,
                    videoUrl: "/uploads/" + encodeURIComponent(episode.filename),
                    createdAt: episode.created_at
                }
            });
        } catch (error) {
            if (savedFile) {
                fs.unlink(savedFile, () => {});
            }

            console.error("Anime upload error:", error);

            return res.status(500).json({
                success: false,
                error: "Gagal menyimpan episod ke database."
            });
        }
    }
);

'@

$original = $original.Replace(
    '// 404 API',
    $episodeRoutes + '// 404 API'
)

# 5. Gantikan bahagian startup hingga akhir fail.
# Ini juga membuang app.listen() berganda dalam fail asal.
$startMarker = '// START SERVER'
$startIndex = $original.IndexOf($startMarker)

$newStartup = @'
// START SERVER

async function startServer() {
    try {
        await initializeGlobalChat();
        await initializeAnimeEpisodes();

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log("Database-backed user data enabled.");
            console.log("Guild API enabled.");
            console.log("Global Chat API enabled.");
            console.log("Anime Episodes API enabled.");
        });
    } catch (error) {
        console.error("Server startup failed:", error);
        process.exit(1);
    }
}

startServer();
'@

$original = $original.Substring(0, $startIndex) + $newStartup

# Simpan sebagai UTF-8 tanpa BOM.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($serverPath, $original, $utf8NoBom)

Write-Host ""
Write-Host "Berjaya! server.js telah dikemas kini." -ForegroundColor Green
Write-Host "Sandaran asal: $backupPath"
Write-Host "Sistem upload anime dan API episod telah ditambah."
Write-Host "Pastikan konfigurasi admin dalam .env dibuat sebelum upload."