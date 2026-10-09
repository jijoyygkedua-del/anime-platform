require("dotenv").config({
    path: require("path").join(__dirname, "../.env")
});

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { Pool } = require("pg");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");

const animeUploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(animeUploadDir)) {
    fs.mkdirSync(animeUploadDir, { recursive: true });
}

const animeStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, animeUploadDir);
    },
    filename: (req, file, callback) => {
        callback(null, crypto.randomUUID() + ".mp4");
    }
});

const animeUpload = multer({
    storage: animeStorage,
    limits: {
        fileSize: 1024 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
        const isMp4 =
            path.extname(file.originalname).toLowerCase() === ".mp4";

        if (!isMp4) {
            return callback(new Error("Hanya fail MP4 dibenarkan."));
        }

        callback(null, true);
    }
});

const app = express();
const PORT = 3000;

// =========================
// DATABASE
// =========================


const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: true
    }
});

pool.on("error", (error) => {
    console.error("PostgreSQL Pool Error:", error.message);
});

pool.on("error", (error) => {
    console.error("PostgreSQL Pool Error:", error);

    pool.query("SELECT NOW()")
    .then((result) => {
        console.log("Neon database connected!");
        console.log("Database time:", result.rows[0].now);
    })
    .catch((error) => {
        console.error("Neon connection failed:", error.message);
    });
});

// =========================
// MIDDLEWARE
// =========================

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());

app.use(express.urlencoded({
    extended: true
}));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        secure: false,
        maxAge: 7 * 24 * 60 * 60 * 1000
    }
}));

app.use(
    "/uploads",
    express.static(animeUploadDir, {
        setHeaders: (res) => {
            res.setHeader("X-Content-Type-Options", "nosniff");
        }
    })
);

// =========================
// FRONTEND
// =========================

app.use(
    express.static(
        path.join(__dirname, "../frontend")
    )
);

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "../frontend/index.html"
        )
    );
});

// =========================
// AUTH HELPER
// =========================

function requireLogin(req, res, next) {

    if (!req.session.userId) {

        return res.status(401).json({
            success: false,
            error: "Anda belum login."
        });
    }

    next();
}

// =========================
// DISCORD LOGIN
// =========================

app.get("/auth/discord", (req, res) => {

    const params = new URLSearchParams({
        client_id:
            process.env.DISCORD_CLIENT_ID,

        redirect_uri:
            process.env.DISCORD_REDIRECT_URI,

        response_type:
            "code",

        scope:
            "identify email"
    });

    res.redirect(
        `https://discord.com/oauth2/authorize?${params.toString()}`
    );
});

// =========================
// DISCORD CALLBACK
// =========================

app.get(
    "/auth/discord/callback",
    async (req, res) => {

        try {

            const { code } = req.query;

            if (!code) {

                return res.status(400).send(
                    "Discord authorization code tidak ada."
                );
            }

            const tokenResponse =
                await fetch(
                    "https://discord.com/api/oauth2/token",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body:
                            new URLSearchParams({
                                client_id:
                                    process.env.DISCORD_CLIENT_ID,

                                client_secret:
                                    process.env.DISCORD_CLIENT_SECRET,

                                grant_type:
                                    "authorization_code",

                                code,

                                redirect_uri:
                                    process.env.DISCORD_REDIRECT_URI
                            })
                    }
                );

            const tokenData =
                await tokenResponse.json();

            if (!tokenResponse.ok) {

                console.error(
                    "Discord token error:",
                    tokenData
                );

                return res.status(500).send(
                    "Discord login gagal."
                );
            }

            const userResponse =
                await fetch(
                    "https://discord.com/api/users/@me",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${tokenData.access_token}`
                        }
                    }
                );

            const discordUser =
                await userResponse.json();

            if (!userResponse.ok) {

                console.error(
                    "Discord user error:",
                    discordUser
                );

                return res.status(500).send(
                    "Gagal mengambil data Discord."
                );
            }

            const avatarUrl =
                discordUser.avatar
                    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
                    : "https://cdn.discordapp.com/embed/avatars/0.png";

            const accountResult =
                await pool.query(
                    `
                    SELECT user_id
                    FROM oauth_accounts
                    WHERE provider = $1
                    AND provider_user_id = $2
                    LIMIT 1
                    `,
                    [
                        "discord",
                        discordUser.id
                    ]
                );

            let userId;

            if (
                accountResult.rows.length > 0
            ) {

                userId =
                    accountResult.rows[0].user_id;

                await pool.query(
                    `
                    UPDATE users

                    SET
                        username = $1,
                        display_name = $2,
                        avatar_url = $3,
                        email = $4,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $5
                    `,
                    [
                        discordUser.username,

                        discordUser.global_name ||
                            discordUser.username,

                        avatarUrl,

                        discordUser.email ||
                            null,

                        userId
                    ]
                );

            } else {

                const userResult =
                    await pool.query(
                        `
                        
                        (
                            username,
                            display_name,
                            avatar_url,
                            email
                        )

                        VALUES
                        ($1, $2, $3, $4)

                        RETURNING id
                        `,
                        [
                            discordUser.username,

                            discordUser.global_name ||
                                discordUser.username,

                            avatarUrl,

                            discordUser.email ||
                                null
                        ]
                    );

                userId =
                    userResult.rows[0].id;

                await pool.query(
                    `INSERT INTO users
                    INSERT INTO oauth_accounts
                    (
                        user_id,
                        provider,
                        provider_user_id
                    )

                    VALUES
                    ($1, $2, $3)

                    ON CONFLICT
                    (provider, provider_user_id)

                    DO NOTHING
                    `,
                    [
                        userId,
                        "discord",
                        discordUser.id
                    ]
                );
            }

            await pool.query(
                `
                INSERT INTO user_data
                (
                    user_id,
                    anim_gems
                )

                VALUES
                ($1, 0)

                ON CONFLICT (user_id)
                DO NOTHING
                `,
                [userId]
            );

            req.session.userId =
                userId;

            req.session.discord =
                discordUser;

            console.log(
                `Discord login berhasil: ${discordUser.username}`
            );

            res.redirect("/");

        } catch (error) {

            console.error(
                "Discord callback error:",
                error
            );

            res.status(500).send(
                "Discord login error."
            );
        }
    }
);

// =========================
// GOOGLE LOGIN
// =========================

app.get("/auth/google", (req, res) => {

    const params = new URLSearchParams({

        client_id:
            process.env.GOOGLE_CLIENT_ID,

        redirect_uri:
            process.env.GOOGLE_REDIRECT_URI,

        response_type:
            "code",

        scope:
            "openid email profile",

        access_type:
            "offline",

        prompt:
            "select_account"
    });

    res.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
});

// =========================
// GOOGLE CALLBACK
// =========================

app.get(
    "/auth/google/callback",
    async (req, res) => {

        try {

            const { code } = req.query;

            if (!code) {

                return res.status(400).send(
                    "Google authorization code tidak ada."
                );
            }

            const tokenResponse =
                await fetch(
                    "https://oauth2.googleapis.com/token",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body:
                            new URLSearchParams({

                                client_id:
                                    process.env.GOOGLE_CLIENT_ID,

                                client_secret:
                                    process.env.GOOGLE_CLIENT_SECRET,

                                code,

                                grant_type:
                                    "authorization_code",

                                redirect_uri:
                                    process.env.GOOGLE_REDIRECT_URI
                            })
                    }
                );

            const tokenData =
                await tokenResponse.json();

            if (!tokenResponse.ok) {

                console.error(
                    "Google token error:",
                    tokenData
                );

                return res.status(500).send(
                    "Google login gagal."
                );
            }

            const userResponse =
                await fetch(
                    "https://www.googleapis.com/oauth2/v2/userinfo",
                    {
                        headers: {
                            Authorization:
                                `Bearer ${tokenData.access_token}`
                        }
                    }
                );

            const googleUser =
                await userResponse.json();

            if (!userResponse.ok) {

                console.error(
                    "Google user error:",
                    googleUser
                );

                return res.status(500).send(
                    "Gagal mengambil data Google."
                );
            }

            const accountResult =
                await pool.query(
                    `
                    SELECT user_id

                    FROM oauth_accounts

                    WHERE
                        provider = $1

                        AND provider_user_id = $2

                    LIMIT 1
                    `,
                    [
                        "google",
                        googleUser.id
                    ]
                );

            let userId;

            if (
                accountResult.rows.length > 0
            ) {

                userId =
                    accountResult.rows[0].user_id;

                await pool.query(
                    `
                    UPDATE users

                    SET
                        username = $1,
                        display_name = $2,
                        avatar_url = $3,
                        email = $4,
                        updated_at = CURRENT_TIMESTAMP

                    WHERE id = $5
                    `,
                    [

                        googleUser.email
                            ? googleUser.email.split("@")[0]
                            : `google_${googleUser.id}`,

                        googleUser.name ||
                            "Google User",

                        googleUser.picture ||
                            null,

                        googleUser.email ||
                            null,

                        userId
                    ]
                );

            } else {

                let emailUser =
                    null;

                if (googleUser.email) {

                    const emailResult =
                        await pool.query(
                            `
                            SELECT id

                            FROM users

                            WHERE email = $1

                            LIMIT 1
                            `,
                            [
                                googleUser.email
                            ]
                        );

                    if (
                        emailResult.rows.length > 0
                    ) {

                        emailUser =
                            emailResult.rows[0];
                    }
                }

                if (emailUser) {

                    userId =
                        emailUser.id;

                } else {

                    const userResult =
                        await pool.query(
                            `
                            INSERT INTO users
                            (
                                username,
                                display_name,
                                avatar_url,
                                email
                            )

                            VALUES
                            ($1, $2, $3, $4)

                            RETURNING id
                            `,
                            [

                                googleUser.email
                                    ? googleUser.email.split("@")[0]
                                    : `google_${googleUser.id}`,

                                googleUser.name ||
                                    "Google User",

                                googleUser.picture ||
                                    null,

                                googleUser.email ||
                                    null
                            ]
                        );

                    userId =
                        userResult.rows[0].id;
                }

                await pool.query(
                    `
                    INSERT INTO oauth_accounts
                    (
                        user_id,
                        provider,
                        provider_user_id
                    )

                    VALUES
                    ($1, $2, $3)

                    ON CONFLICT
                    (provider, provider_user_id)

                    DO NOTHING
                    `,
                    [
                        userId,
                        "google",
                        googleUser.id
                    ]
                );
            }

            await pool.query(
                `
                INSERT INTO user_data
                (
                    user_id,
                    anim_gems
                )

                VALUES
                ($1, 0)

                ON CONFLICT (user_id)
                DO NOTHING
                `,
                [userId]
            );

            req.session.userId =
                userId;

            req.session.google =
                googleUser;

            console.log(
                `Google login berhasil: ${googleUser.email}`
            );

            res.redirect("/");

        } catch (error) {

            console.error(
                "Google callback error:",
                error
            );

            res.status(500).send(
                "Google login error."
            );
        }
    }
);

// =========================
// API ME
// =========================

app.get(
    "/api/me",
    async (req, res) => {

        try {

            if (!req.session.userId) {

                return res.json({
                    loggedIn: false
                });
            }

            const result =
                await pool.query(
                    `
                    SELECT

                        u.id,
                        u.username,
                        u.display_name,
                        u.avatar_url,
                        u.email,

                        COALESCE(
                            d.anim_gems,
                            0
                        ) AS anim_gems,

                        d.premium_until,

                        CASE

                            WHEN
                                d.premium_until IS NOT NULL

                                AND
                                d.premium_until > CURRENT_TIMESTAMP

                            THEN TRUE

                            ELSE FALSE

                        END AS premium_active

                    FROM users u

                    LEFT JOIN user_data d
                        ON d.user_id = u.id

                    WHERE u.id = $1

                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                req.session.destroy(
                    () => {}
                );

                return res.json({
                    loggedIn: false
                });
            }

            const user =
                result.rows[0];

            const premiumActive =
                user.premium_active === true;

            await pool.query(
                `
                UPDATE user_data

                SET
                    verified_badge = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE user_id = $2
                `,
                [
                    premiumActive,
                    req.session.userId
                ]
            );

            res.json({

                loggedIn: true,

                user: {

                    id:
                        String(
                            user.id
                        ),

                    username:
                        user.username,

                    displayName:
                        user.display_name,

                    avatar:
                        user.avatar_url,

                    email:
                        user.email
                },

                saveData: {

                    animGems:
                        Number(
                            user.anim_gems || 0
                        ),

                    premiumUntil:
                        user.premium_until
                            ? new Date(
                                user.premium_until
                            ).toISOString()
                            : null,

                    verifiedBadge:
                        premiumActive
                }
            });

        } catch (error) {

            console.error(
                "GET /api/me error:",
                error
            );

            res.status(500).json({

                loggedIn: false,

                error:
                    "Gagal mengambil data user."
            });
        }
    }
);

// =========================
// PREMIUM PLANS
// =========================

app.get(
    "/api/premium/plans",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        id,
                        name,
                        duration_days,
                        price_idr,
                        bonus_anim_gems,
                        is_best_value

                    FROM premium_plans

                    WHERE
                        is_active = TRUE

                    ORDER BY
                        duration_days ASC
                    `
                );

            res.json({

                success: true,

                plans:
                    result.rows.map(
                        plan => ({
                            id:
                                String(
                                    plan.id
                                ),

                            name:
                                plan.name,

                            duration_days:
                                Number(
                                    plan.duration_days
                                ),

                            price_idr:
                                Number(
                                    plan.price_idr
                                ),

                            bonus_anim_gems:
                                Number(
                                    plan.bonus_anim_gems
                                ),

                            is_best_value:
                                plan.is_best_value === true
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Premium plans error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Premium Plans."
            });
        }
    }
);

// =========================
// PREMIUM STATUS
// =========================

app.get(
    "/api/premium/status",
    requireLogin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        anim_gems,
                        premium_until

                    FROM user_data

                    WHERE user_id = $1

                    LIMIT 1
                    `,
                    [
                        req.session.userId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "User data tidak ditemukan."
                });
            }

            const data =
                result.rows[0];

            const active =
                data.premium_until &&
                new Date(
                    data.premium_until
                ) > new Date();

            await pool.query(
                `
                UPDATE user_data

                SET
                    verified_badge = $1,
                    updated_at = CURRENT_TIMESTAMP

                WHERE user_id = $2
                `,
                [
                    Boolean(active),
                    req.session.userId
                ]
            );

            res.json({

                success: true,

                premium: {

                    active:
                        Boolean(active),

                    premium_until:
                        data.premium_until,

                    verified_badge:
                        Boolean(active)
                },

                anim_gems:
                    Number(
                        data.anim_gems || 0
                    )
            });

        } catch (error) {

            console.error(
                "Premium status error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Premium status."
            });
        }
    }
);

// =========================
// FRIEND LIST
// =========================

app.get(
    "/api/friends",
    requireLogin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        f.id AS friendship_id,

                        u.id AS user_id,
                        u.username,
                        u.display_name,
                        u.avatar_url

                    FROM friendships f

                    JOIN users u

                        ON u.id =
                            CASE

                                WHEN
                                    f.requester_id = $1

                                THEN
                                    f.receiver_id

                                ELSE
                                    f.requester_id

                            END

                    WHERE

                        (
                            f.requester_id = $1

                            OR

                            f.receiver_id = $1
                        )

                        AND

                        f.status = 'accepted'

                    ORDER BY
                        u.display_name ASC
                    `,
                    [
                        req.session.userId
                    ]
                );

            res.json({

                success: true,

                friends:
                    result.rows.map(
                        friend => ({

                            friendship_id:
                                String(
                                    friend.friendship_id
                                ),

                            user_id:
                                String(
                                    friend.user_id
                                ),

                            username:
                                friend.username,

                            display_name:
                                friend.display_name,

                            avatar_url:
                                friend.avatar_url
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Friends list error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Friend List."
            });
        }
    }
);

// =========================
// FRIEND REQUESTS
// =========================

app.get(
    "/api/friends/requests",
    requireLogin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        f.id AS friendship_id,

                        u.id AS user_id,
                        u.username,
                        u.display_name,
                        u.avatar_url,

                        f.created_at

                    FROM friendships f

                    JOIN users u

                        ON u.id =
                            f.requester_id

                    WHERE

                        f.receiver_id = $1

                        AND

                        f.status = 'pending'

                    ORDER BY
                        f.created_at DESC
                    `,
                    [
                        req.session.userId
                    ]
                );

            res.json({

                success: true,

                requests:
                    result.rows.map(
                        request => ({

                            friendship_id:
                                String(
                                    request.friendship_id
                                ),

                            user_id:
                                String(
                                    request.user_id
                                ),

                            username:
                                request.username,

                            display_name:
                                request.display_name,

                            avatar_url:
                                request.avatar_url,

                            created_at:
                                request.created_at
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Friend requests error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Friend Requests."
            });
        }
    }
);

// =========================
// ADD FRIEND
// =========================

app.post(
    "/api/friends/request",
    requireLogin,
    async (req, res) => {

        try {

            const senderId =
                Number(
                    req.session.userId
                );

            const receiverId =
                Number(
                    req.body.userId
                );

            if (
                !Number.isInteger(
                    receiverId
                ) ||
                receiverId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "User ID tidak valid."
                });
            }

            if (
                senderId === receiverId
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Anda tidak boleh add diri sendiri."
                });
            }

            const userCheck =
                await pool.query(
                    `
                    SELECT id

                    FROM users

                    WHERE id = $1
                    `,
                    [
                        receiverId
                    ]
                );

            if (
                userCheck.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "User tidak ditemukan."
                });
            }

            const existing =
                await pool.query(
                    `
                    SELECT

                        id,
                        requester_id,
                        receiver_id,
                        status

                    FROM friendships

                    WHERE

                        (
                            requester_id = $1
                            AND receiver_id = $2
                        )

                        OR

                        (
                            requester_id = $2
                            AND receiver_id = $1
                        )

                    LIMIT 1
                    `,
                    [
                        senderId,
                        receiverId
                    ]
                );

            if (
                existing.rows.length > 0
            ) {

                const friendship =
                    existing.rows[0];

                if (
                    friendship.status ===
                    "accepted"
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "User ini sudah menjadi Friend."
                    });
                }

                if (
                    friendship.status ===
                    "pending"
                ) {

                    return res.status(400).json({

                        success: false,

                        error:
                            "Friend Request sudah ada."
                    });
                }

                await pool.query(
                    `
                    UPDATE friendships

                    SET

                        requester_id = $1,
                        receiver_id = $2,
                        status = 'pending',
                        created_at = CURRENT_TIMESTAMP

                    WHERE id = $3
                    `,
                    [
                        senderId,
                        receiverId,
                        friendship.id
                    ]
                );

            } else {

                await pool.query(
                    `
                    INSERT INTO friendships
                    (
                        requester_id,
                        receiver_id,
                        status
                    )

                    VALUES
                    ($1, $2, 'pending')
                    `,
                    [
                        senderId,
                        receiverId
                    ]
                );
            }

            res.json({

                success: true,

                message:
                    "Friend Request berjaya dihantar."
            });

        } catch (error) {

            console.error(
                "Add friend error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal menghantar Friend Request."
            });
        }
    }
);

// =========================
// ACCEPT FRIEND
// =========================

app.post(
    "/api/friends/accept",
    requireLogin,
    async (req, res) => {

        try {

            const friendshipId =
                Number(
                    req.body.friendshipId
                );

            if (
                !Number.isInteger(
                    friendshipId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Friendship ID tidak valid."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE friendships

                    SET
                        status = 'accepted'

                    WHERE

                        id = $1

                        AND receiver_id = $2

                        AND status = 'pending'

                    RETURNING id
                    `,
                    [
                        friendshipId,
                        req.session.userId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Friend Request tidak ditemukan."
                });
            }

            res.json({

                success: true,

                message:
                    "Friend Request diterima."
            });

        } catch (error) {

            console.error(
                "Accept friend error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal menerima Friend Request."
            });
        }
    }
);

// =========================
// DECLINE FRIEND
// =========================

app.post(
    "/api/friends/decline",
    requireLogin,
    async (req, res) => {

        try {

            const friendshipId =
                Number(
                    req.body.friendshipId
                );

            if (
                !Number.isInteger(
                    friendshipId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Friendship ID tidak valid."
                });
            }

            const result =
                await pool.query(
                    `
                    UPDATE friendships

                    SET
                        status = 'declined'

                    WHERE

                        id = $1

                        AND receiver_id = $2

                        AND status = 'pending'

                    RETURNING id
                    `,
                    [
                        friendshipId,
                        req.session.userId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Friend Request tidak ditemukan."
                });
            }

            res.json({

                success: true,

                message:
                    "Friend Request ditolak."
            });

        } catch (error) {

            console.error(
                "Decline friend error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal menolak Friend Request."
            });
        }
    }
);

// =========================
// REMOVE FRIEND
// =========================

app.delete(
    "/api/friends/:friendId",
    requireLogin,
    async (req, res) => {

        try {

            const friendId =
                Number(
                    req.params.friendId
                );

            if (
                !Number.isInteger(
                    friendId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Friend ID tidak valid."
                });
            }

            const result =
                await pool.query(
                    `
                    DELETE FROM friendships

                    WHERE

                        status = 'accepted'

                        AND

                        (
                            (
                                requester_id = $1

                                AND

                                receiver_id = $2
                            )

                            OR

                            (
                                requester_id = $2

                                AND

                                receiver_id = $1
                            )
                        )

                    RETURNING id
                    `,
                    [
                        req.session.userId,
                        friendId
                    ]
                );

            if (
                result.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Friend tidak ditemukan."
                });
            }

            res.json({

                success: true,

                message:
                    "Friend berjaya dibuang."
            });

        } catch (error) {

            console.error(
                "Remove friend error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal membuang Friend."
            });
        }
    }
);

// =====================================================
// GUILD SYSTEM
// =====================================================

const GUILD_CREATE_COST = 1000;

// =========================
// GET MY GUILD
// =========================

app.get(
    "/api/guilds/mine",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.session.userId
                );

            const result =
                await pool.query(
                    `
                    SELECT

                        g.id,
                        g.name,
                        g.description,
                        g.icon_url,
                        g.owner_id,
                        g.level,
                        g.xp,
                        g.treasury,
                        gm.role,
                        gm.joined_at

                    FROM guild_members gm

                    JOIN guilds g
                        ON g.id = gm.guild_id

                    WHERE gm.user_id = $1

                    LIMIT 1
                    `,
                    [userId]
                );

            if (
                result.rows.length === 0
            ) {

                return res.json({
                    success: true,
                    guild: null
                });
            }

            const guild =
                result.rows[0];

            res.json({

                success: true,

                guild: {

                    id:
                        String(
                            guild.id
                        ),

                    name:
                        guild.name,

                    description:
                        guild.description,

                    icon_url:
                        guild.icon_url,

                    owner_id:
                        String(
                            guild.owner_id
                        ),

                    level:
                        Number(
                            guild.level
                        ),

                    xp:
                        Number(
                            guild.xp
                        ),

                    treasury:
                        Number(
                            guild.treasury
                        ),

                    role:
                        guild.role,

                    joined_at:
                        guild.joined_at
                }
            });

        } catch (error) {

            console.error(
                "GET /api/guilds/mine error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Guild."
            });
        }
    }
);

// =========================
// GET ALL GUILDS
// =========================

app.get(
    "/api/guilds",
    requireLogin,
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        g.id,
                        g.name,
                        g.description,
                        g.icon_url,
                        g.owner_id,
                        g.level,
                        g.xp,
                        g.treasury,

                        COUNT(gm.id)::INTEGER
                            AS member_count

                    FROM guilds g

                    LEFT JOIN guild_members gm
                        ON gm.guild_id = g.id

                    GROUP BY g.id

                    ORDER BY
                        g.level DESC,
                        g.created_at DESC
                    `
                );

            res.json({

                success: true,

                guilds:
                    result.rows.map(
                        guild => ({

                            id:
                                String(
                                    guild.id
                                ),

                            name:
                                guild.name,

                            description:
                                guild.description,

                            icon_url:
                                guild.icon_url,

                            owner_id:
                                String(
                                    guild.owner_id
                                ),

                            level:
                                Number(
                                    guild.level
                                ),

                            xp:
                                Number(
                                    guild.xp
                                ),

                            treasury:
                                Number(
                                    guild.treasury
                                ),

                            member_count:
                                Number(
                                    guild.member_count
                                )
                        })
                    )
            });

        } catch (error) {

            console.error(
                "GET /api/guilds error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil daftar Guild."
            });
        }
    }
);


// =========================
// GUILD XP & LEVEL SYSTEM
// =========================

const GUILD_MAX_LEVEL = 100;

// XP diperlukan untuk naik ke level seterusnya
function getGuildXpRequired(level) {
    return level * 1000;
}

// Tambah XP dan naikkan level secara automatik
async function addGuildXp(guildId, amount) {
    const xpAmount = Number(amount);

    if (
        !Number.isSafeInteger(xpAmount) ||
        xpAmount <= 0 ||
        xpAmount > 1000000
    ) {
        throw new Error("Jumlah Guild XP tidak sah.");
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            `SELECT id, level, xp
             FROM guilds
             WHERE id = $1
             FOR UPDATE`,
            [guildId]
        );

        if (result.rowCount === 0) {
            throw new Error("Guild tidak dijumpai.");
        }

        let { level, xp } = result.rows[0];

        level = Number(level);
        xp = Number(xp);

        if (level >= GUILD_MAX_LEVEL) {
            await client.query("COMMIT");

            return {
                level,
                xp,
                leveledUp: false,
                maxLevel: true
            };
        }

        xp += xpAmount;

        let leveledUp = false;

        while (
            level < GUILD_MAX_LEVEL &&
            xp >= getGuildXpRequired(level)
        ) {
            xp -= getGuildXpRequired(level);
            level++;
            leveledUp = true;
        }

        if (level >= GUILD_MAX_LEVEL) {
            xp = 0;
        }

        await client.query(
            `UPDATE guilds
             SET level = $1, xp = $2
             WHERE id = $3`,
            [level, xp, guildId]
        );

        await client.query("COMMIT");

        return {
            level,
            xp,
            leveledUp,
            maxLevel: level >= GUILD_MAX_LEVEL
        };

    } catch (error) {
        await client.query("ROLLBACK");
        throw error;

    } finally {
        client.release();
    }
}


// ======================================
// GUILD TREASURY API
// ======================================

// POST /api/guilds/:guildId/treasury/deposit
// Semua ahli Guild boleh deposit AnimGems.

app.post(
    "/api/guilds/:guildId/treasury/deposit",
    requireLogin,
    async (req, res) => {
        const client = await pool.connect();

        try {
            const guildId = req.params.guildId;
            const userId = req.session.userId;
            const amount = Number(req.body.amount);

            if (
                !/^\d+$/.test(String(req.body.amount)) ||
                !Number.isSafeInteger(amount) ||
                amount <= 0 ||
                amount > 1000000000
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Jumlah deposit tidak sah."
                });
            }

            await client.query("BEGIN");

            // Kunci Guild dahulu supaya transaksi serentak selamat.
            const guildResult = await client.query(
                `SELECT id
                 FROM guilds
                 WHERE id = $1
                 FOR UPDATE`,
                [guildId]
            );

            if (guildResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    error: "Guild tidak dijumpai."
                });
            }

            // Pastikan pengguna ialah ahli Guild.
            const memberResult = await client.query(
                `SELECT role
                 FROM guild_members
                 WHERE guild_id = $1 AND user_id = $2`,
                [guildId, userId]
            );

            if (memberResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    error: "Kau bukan ahli Guild ini."
                });
            }

            // Tolak AnimGems daripada baki pengguna.
            const debitResult = await client.query(
                `UPDATE user_data
                 SET anim_gems = anim_gems - $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $2
                   AND anim_gems >= $1`,
                [amount, userId]
            );

            if (debitResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    error: "AnimGems tidak mencukupi."
                });
            }

            // Tambah AnimGems ke Treasury Guild.
            await client.query(
                `UPDATE guilds
                 SET treasury = treasury + $1
                 WHERE id = $2`,
                [amount, guildId]
            );

            // Rekod transaksi AnimGems pengguna.
            await client.query(
                `INSERT INTO anim_gems_transactions
                    (user_id, amount, type, description)
                 VALUES ($1, $2, $3, $4)`,
                [
                    userId,
                    -amount,
                    "guild_deposit",
                    `Deposit ke Guild ID ${guildId}`
                ]
            );

            await client.query("COMMIT");

            return res.json({
                success: true,
                message: "Deposit berjaya.",
                deposited: amount
            });

        } catch (error) {
            await client.query("ROLLBACK");

            console.error(
                "Guild Treasury Deposit Error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                error: "Deposit gagal."
            });

        } finally {
            client.release();
        }
    }
);


// POST /api/guilds/:guildId/treasury/withdraw
// Hanya Owner atau admin Guild boleh mengeluarkan AnimGems.

app.post(
    "/api/guilds/:guildId/treasury/withdraw",
    requireLogin,
    async (req, res) => {
        const client = await pool.connect();

        try {
            const guildId = req.params.guildId;
            const userId = req.user.id;
            const amount = Number(req.body.amount);

            if (
                !/^\d+$/.test(String(req.body.amount)) ||
                !Number.isSafeInteger(amount) ||
                amount <= 0 ||
                amount > 1000000000
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Jumlah pengeluaran tidak sah."
                });
            }

            await client.query("BEGIN");

            // Kunci Guild sepanjang transaksi.
            const guildResult = await client.query(
                `SELECT id, treasury
                 FROM guilds
                 WHERE id = $1
                 FOR UPDATE`,
                [guildId]
            );

            if (guildResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(404).json({
                    success: false,
                    error: "Guild tidak dijumpai."
                });
            }

            // Semak role sebenar daripada database.
            const memberResult = await client.query(
                `SELECT role
                 FROM guild_members
                 WHERE guild_id = $1 AND user_id = $2`,
                [guildId, userId]
            );

            if (
                memberResult.rowCount === 0 ||
                !["owner", "admin"].includes(
                    memberResult.rows[0].role
                )
            ) {
                await client.query("ROLLBACK");

                return res.status(403).json({
                    success: false,
                    error:
                        "Hanya Owner atau admin Guild boleh mengeluarkan AnimGems."
                });
            }

            // Tolak jumlah daripada Treasury jika baki mencukupi.
            const treasuryResult = await client.query(
                `UPDATE guilds
                 SET treasury = treasury - $1
                 WHERE id = $2
                   AND treasury >= $1`,
                [amount, guildId]
            );

            if (treasuryResult.rowCount === 0) {
                await client.query("ROLLBACK");

                return res.status(400).json({
                    success: false,
                    error: "Baki Treasury tidak mencukupi."
                });
            }

            // Masukkan AnimGems kembali ke akaun Owner/admin.
            const creditResult = await client.query(
                `UPDATE user_data
                 SET anim_gems = anim_gems + $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE user_id = $2`,
                [amount, userId]
            );

            if (creditResult.rowCount === 0) {
                throw new Error(
                    "Rekod user_data tidak dijumpai."
                );
            }

            // Rekod transaksi.
            await client.query(
                `INSERT INTO anim_gems_transactions
                    (user_id, amount, type, description)
                 VALUES ($1, $2, $3, $4)`,
                [
                    userId,
                    amount,
                    "guild_withdraw",
                    `Pengeluaran dari Guild ID ${guildId}`
                ]
            );

            await client.query("COMMIT");

            return res.json({
                success: true,
                message: "Pengeluaran berjaya.",
                withdrawn: amount
            });

        } catch (error) {
            await client.query("ROLLBACK");

            console.error(
                "Guild Treasury Withdraw Error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                error: "Pengeluaran gagal."
            });

        } finally {
            client.release();
        }
    }
);



// =========================
// GET GUILD BY ID
// =========================
// PENTING:
// Route /mine berada di atas route /:id.

app.get(
    "/api/guilds/:id",
    requireLogin,
    async (req, res) => {

        try {

            const guildId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    guildId
                ) ||
                guildId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid guild ID."
                });
            }

            const guildResult =
                await pool.query(
                    `
                    SELECT

                        g.id,
                        g.name,
                        g.description,
                        g.icon_url,
                        g.owner_id,
                        g.level,
                        g.xp,
                        g.treasury,
                        g.created_at

                    FROM guilds g

                    WHERE g.id = $1

                    LIMIT 1
                    `,
                    [guildId]
                );

            if (
                guildResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Guild tidak ditemukan."
                });
            }

            const membersResult =
                await pool.query(
                    `
                    SELECT

                        u.id,
                        u.username,
                        u.display_name,
                        u.avatar_url,

                        gm.role,
                        gm.joined_at

                    FROM guild_members gm

                    JOIN users u
                        ON u.id = gm.user_id

                    WHERE gm.guild_id = $1

                    ORDER BY

                        CASE

                            WHEN gm.role = 'owner'
                                THEN 1

                            WHEN gm.role = 'admin'
                                THEN 2

                            ELSE 3

                        END,

                        gm.joined_at ASC
                    `,
                    [guildId]
                );

            const guild =
                guildResult.rows[0];

            res.json({

                success: true,

                guild: {

                    id:
                        String(
                            guild.id
                        ),

                    name:
                        guild.name,

                    description:
                        guild.description,

                    icon_url:
                        guild.icon_url,

                    owner_id:
                        String(
                            guild.owner_id
                        ),

                    level:
                        Number(
                            guild.level
                        ),

                    xp:
                        Number(
                            guild.xp
                        ),

                    treasury:
                        Number(
                            guild.treasury
                        ),

                    created_at:
                        guild.created_at
                },

                members:
                    membersResult.rows.map(
                        member => ({

                            id:
                                String(
                                    member.id
                                ),

                            username:
                                member.username,

                            display_name:
                                member.display_name,

                            avatar_url:
                                member.avatar_url,

                            role:
                                member.role,

                            joined_at:
                                member.joined_at
                        })
                    )
            });

        } catch (error) {

            console.error(
                "GET /api/guilds/:id error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil data Guild."
            });
        }
    }
);

// =========================
// CREATE GUILD
// =========================

app.post(
    "/api/guilds",
    requireLogin,
    async (req, res) => {

        const client =
            await pool.connect();

        try {

            const userId =
                Number(
                    req.session.userId
                );

            const name =
                String(
                    req.body.name || ""
                ).trim();

            const description =
                String(
                    req.body.description || ""
                ).trim();

            if (
                name.length < 2 ||
                name.length > 50
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Nama Guild harus 2-50 karakter."
                });
            }

            if (
                description.length > 255
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Deskripsi maksimal 255 karakter."
                });
            }

            await client.query("BEGIN");

            // =========================
            // CHECK ALREADY IN GUILD
            // =========================

            const existingMember =
                await client.query(
                    `
                    SELECT id

                    FROM guild_members

                    WHERE user_id = $1

                    LIMIT 1
                    `,
                    [userId]
                );

            if (
                existingMember.rows.length > 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Kamu sudah berada dalam Guild."
                });
            }

            // =========================
            // CHECK NAME
            // =========================

            const duplicateGuild =
                await client.query(
                    `
                    SELECT id

                    FROM guilds

                    WHERE LOWER(name) =
                        LOWER($1)

                    LIMIT 1
                    `,
                    [name]
                );

            if (
                duplicateGuild.rows.length > 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Nama Guild sudah digunakan."
                });
            }

            // =========================
            // LOCK USER GEMS
            // =========================

            const gemsResult =
                await client.query(
                    `
                    SELECT anim_gems

                    FROM user_data

                    WHERE user_id = $1

                    FOR UPDATE
                    `,
                    [userId]
                );

            if (
                gemsResult.rows.length === 0
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        "Data AnimGems tidak ditemukan."
                });
            }

            const gems =
                Number(
                    gemsResult.rows[0].anim_gems
                );

            if (
                gems < GUILD_CREATE_COST
            ) {

                await client.query(
                    "ROLLBACK"
                );

                return res.status(400).json({

                    success: false,

                    error:
                        `AnimGems tidak cukup. Membuat Guild membutuhkan ${GUILD_CREATE_COST.toLocaleString()} AnimGems.`
                });
            }

            // =========================
            // DEDUCT GEMS
            // =========================

            await client.query(
                `
                UPDATE user_data

                SET

                    anim_gems =
                        anim_gems - $1,

                    updated_at =
                        CURRENT_TIMESTAMP

                WHERE user_id = $2
                `,
                [
                    GUILD_CREATE_COST,
                    userId
                ]
            );

            // =========================
            // GEMS TRANSACTION
            // =========================

            await client.query(
                `
                INSERT INTO anim_gems_transactions
                (
                    user_id,
                    amount,
                    type,
                    description
                )

                VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4
                )
                `,
                [
                    userId,
                    -GUILD_CREATE_COST,
                    "guild_create",
                    "Membuat Guild"
                ]
            );

            // =========================
            // CREATE GUILD
            // =========================

            const guildResult =
                await client.query(
                    `
                    INSERT INTO guilds
                    (
                        name,
                        description,
                        owner_id,
                        level,
                        xp,
                        treasury
                    )

                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        1,
                        0,
                        0
                    )

                    RETURNING *
                    `,
                    [
                        name,
                        description,
                        userId
                    ]
                );

            const guild =
                guildResult.rows[0];

            // =========================
            // ADD OWNER
            // =========================

            await client.query(
                `
                INSERT INTO guild_members
                (
                    guild_id,
                    user_id,
                    role
                )

                VALUES
                (
                    $1,
                    $2,
                    'owner'
                )
                `,
                [
                    guild.id,
                    userId
                ]
            );

            await client.query(
                "COMMIT"
            );

            console.log(
                `Guild created: ${guild.name} by user ${userId}`
            );

            res.json({

                success: true,

                guild: {

                    id:
                        String(
                            guild.id
                        ),

                    name:
                        guild.name,

                    description:
                        guild.description,

                    icon_url:
                        guild.icon_url,

                    owner_id:
                        String(
                            guild.owner_id
                        ),

                    level:
                        Number(
                            guild.level
                        ),

                    xp:
                        Number(
                            guild.xp
                        ),

                    treasury:
                        Number(
                            guild.treasury
                        )
                }
            });

        } catch (error) {

            try {
                await client.query(
                    "ROLLBACK"
                );
            } catch {}

            console.error(
                "POST /api/guilds error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal membuat Guild."
            });

        } finally {

            client.release();
        }
    }
);

// =========================
// JOIN GUILD
// =========================

app.post(
    "/api/guilds/:id/join",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.session.userId
                );

            const guildId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(guildId) ||
                guildId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid guild ID."
                });
            }

            const existingMember =
                await pool.query(
                    `
                    SELECT id

                    FROM guild_members

                    WHERE user_id = $1

                    LIMIT 1
                    `,
                    [userId]
                );

            if (
                existingMember.rows.length > 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Kamu sudah berada dalam Guild."
                });
            }

            const guildResult =
                await pool.query(
                    `
                    SELECT id

                    FROM guilds

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [guildId]
                );

            if (
                guildResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Guild tidak ditemukan."
                });
            }

            await pool.query(
                `
                INSERT INTO guild_members
                (
                    guild_id,
                    user_id,
                    role
                )

                VALUES
                (
                    $1,
                    $2,
                    'member'
                )
                `,
                [
                    guildId,
                    userId
                ]
            );

            res.json({

                success: true,

                message:
                    "Berhasil bergabung ke Guild."
            });

        } catch (error) {

            console.error(
                "POST /api/guilds/:id/join error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal bergabung ke Guild."
            });
        }
    }
);

// =========================
// LEAVE GUILD
// =========================

app.post(
    "/api/guilds/:id/leave",
    requireLogin,
    async (req, res) => {

        try {

            const userId =
                Number(
                    req.session.userId
                );

            const guildId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(guildId) ||
                guildId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid guild ID."
                });
            }

            const memberResult =
                await pool.query(
                    `
                    SELECT role

                    FROM guild_members

                    WHERE

                        guild_id = $1

                        AND user_id = $2

                    LIMIT 1
                    `,
                    [
                        guildId,
                        userId
                    ]
                );

            if (
                memberResult.rows.length === 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Kamu bukan anggota Guild ini."
                });
            }

            if (
                memberResult.rows[0].role ===
                "owner"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Owner tidak boleh keluar. Transfer ownership atau hapus Guild terlebih dahulu."
                });
            }

            await pool.query(
                `
                DELETE FROM guild_members

                WHERE

                    guild_id = $1

                    AND user_id = $2
                `,
                [
                    guildId,
                    userId
                ]
            );

            res.json({

                success: true,

                message:
                    "Berhasil keluar dari Guild."
            });

        } catch (error) {

            console.error(
                "POST /api/guilds/:id/leave error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal keluar dari Guild."
            });
        }
    }
);


 // =========================
 // DELETE GUILD (OWNER ONLY)
 // =========================

app.delete(
    "/api/guilds/:id",
    requireLogin,
    async (req, res) => {
        const client = await pool.connect();
        let transactionStarted = false;

        try {
            const userId = Number(req.session.userId);
            const guildId = Number(req.params.id);

            if (
                !Number.isSafeInteger(guildId) ||
                guildId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    error: "Guild ID tidak valid."
                });
            }

            await client.query("BEGIN");
            transactionStarted = true;

            const result = await client.query(
                `SELECT id, owner_id
                 FROM guilds
                 WHERE id = $1
                 FOR UPDATE`,
                [guildId]
            );

            if (result.rows.length === 0) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return res.status(404).json({
                    success: false,
                    error: "Guild tidak ditemukan."
                });
            }

            if (
                String(result.rows[0].owner_id) !==
                String(userId)
            ) {
                await client.query("ROLLBACK");
                transactionStarted = false;

                return res.status(403).json({
                    success: false,
                    error: "Hanya Owner boleh memadam Guild ini."
                });
            }

            // Padam semua ahli Guild dahulu
            await client.query(
                `DELETE FROM guild_members
                 WHERE guild_id = $1`,
                [guildId]
            );

            // Kemudian padam Guild
            await client.query(
                `DELETE FROM guilds
                 WHERE id = $1`,
                [guildId]
            );

            await client.query("COMMIT");
            transactionStarted = false;

            console.log(
                `Guild ${guildId} deleted by owner ${userId}`
            );

            return res.json({
                success: true,
                message: "Guild berjaya dipadam."
            });

        } catch (error) {
            if (transactionStarted) {
                await client.query("ROLLBACK").catch(() => {});
            }

            console.error("Delete Guild error:", error);

            return res.status(500).json({
                success: false,
                error: "Guild gagal dipadam. Semak rekod berkaitan dalam database."
            });
        } finally {
            client.release();
        }
    }
);

// =========================
// KICK GUILD MEMBER
// =========================

app.delete(
    "/api/guilds/:id/members/:userId",
    requireLogin,
    async (req, res) => {

        try {

            const requesterId =
                Number(
                    req.session.userId
                );

            const guildId =
                Number(
                    req.params.id
                );

            const targetUserId =
                Number(
                    req.params.userId
                );

            if (
                !Number.isInteger(guildId) ||
                guildId <= 0 ||
                !Number.isInteger(targetUserId) ||
                targetUserId <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Invalid ID."
                });
            }

            const requesterResult =
                await pool.query(
                    `
                    SELECT role

                    FROM guild_members

                    WHERE

                        guild_id = $1

                        AND user_id = $2

                    LIMIT 1
                    `,
                    [
                        guildId,
                        requesterId
                    ]
                );

            if (
                requesterResult.rows.length === 0
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Kamu bukan anggota Guild."
                });
            }

            const requesterRole =
                requesterResult.rows[0].role;

            if (
                requesterRole !== "owner" &&
                requesterRole !== "admin"
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Kamu tidak memiliki permission."
                });
            }

            const targetResult =
                await pool.query(
                    `
                    SELECT role

                    FROM guild_members

                    WHERE

                        guild_id = $1

                        AND user_id = $2

                    LIMIT 1
                    `,
                    [
                        guildId,
                        targetUserId
                    ]
                );

            if (
                targetResult.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Member tidak ditemukan."
                });
            }

            const targetRole =
                targetResult.rows[0].role;

            if (
                targetRole === "owner"
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Owner tidak boleh di-kick."
                });
            }

            if (
                requesterRole === "admin" &&
                targetRole === "admin"
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Admin tidak boleh kick Admin lain."
                });
            }

            await pool.query(
                `
                DELETE FROM guild_members

                WHERE

                    guild_id = $1

                    AND user_id = $2
                `,
                [
                    guildId,
                    targetUserId
                ]
            );

            res.json({

                success: true,

                message:
                    "Member berhasil dikeluarkan."
            });

        } catch (error) {

            console.error(
                "DELETE /api/guilds/:id/members/:userId error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengeluarkan member."
            });
        }
    }
);

// =========================
// GIFT PLANS
// =========================

app.get(
    "/api/gifts/plans",
    async (req, res) => {

        try {

            const result =
                await pool.query(
                    `
                    SELECT

                        id,
                        name,
                        duration_days,
                        price_idr

                    FROM premium_gift_plans

                    WHERE
                        is_active = TRUE

                    ORDER BY
                        duration_days ASC
                    `
                );

            res.json({

                success: true,

                plans:
                    result.rows.map(
                        plan => ({

                            id:
                                String(
                                    plan.id
                                ),

                            name:
                                plan.name,

                            duration_days:
                                Number(
                                    plan.duration_days
                                ),

                            price_idr:
                                Number(
                                    plan.price_idr
                                )
                        })
                    )
            });

        } catch (error) {

            console.error(
                "Gift plans error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal mengambil Gift Plans."
            });
        }
    }
);

// =========================
// CREATE PREMIUM GIFT
// =========================

app.post(
    "/api/gifts/create",
    requireLogin,
    async (req, res) => {

        try {

            const senderId =
                Number(
                    req.session.userId
                );

            const receiverId =
                Number(
                    req.body.receiverId
                );

            const giftPlanId =
                Number(
                    req.body.giftPlanId
                );

            if (
                !Number.isInteger(
                    receiverId
                ) ||
                !Number.isInteger(
                    giftPlanId
                )
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Data gift tidak valid."
                });
            }

            if (
                senderId === receiverId
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Tidak boleh gift kepada diri sendiri."
                });
            }

            const friendship =
                await pool.query(
                    `
                    SELECT id

                    FROM friendships

                    WHERE

                        status = 'accepted'

                        AND

                        (
                            (
                                requester_id = $1

                                AND

                                receiver_id = $2
                            )

                            OR

                            (
                                requester_id = $2

                                AND

                                receiver_id = $1
                            )
                        )

                    LIMIT 1
                    `,
                    [
                        senderId,
                        receiverId
                    ]
                );

            if (
                friendship.rows.length === 0
            ) {

                return res.status(403).json({

                    success: false,

                    error:
                        "Anda hanya boleh gift Premium kepada Friend."
                });
            }

            const plan =
                await pool.query(
                    `
                    SELECT

                        id,
                        name,
                        duration_days,
                        price_idr

                    FROM premium_gift_plans

                    WHERE

                        id = $1

                        AND is_active = TRUE

                    LIMIT 1
                    `,
                    [
                        giftPlanId
                    ]
                );

            if (
                plan.rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    error:
                        "Gift Plan tidak ditemukan."
                });
            }

            const gift =
                plan.rows[0];

            if (
                Number(gift.price_idr) <= 0
            ) {

                return res.status(400).json({

                    success: false,

                    error:
                        "Harga Gift belum ditetapkan."
                });
            }

            const result =
                await pool.query(
                    `
                    INSERT INTO premium_gifts
                    (
                        sender_id,
                        receiver_id,
                        gift_plan_id,
                        amount_idr,
                        status
                    )

                    VALUES
                    (
                        $1,
                        $2,
                        $3,
                        $4,
                        'pending'
                    )

                    RETURNING
                        id,
                        created_at
                    `,
                    [
                        senderId,
                        receiverId,
                        gift.id,
                        gift.price_idr
                    ]
                );

            res.json({

                success: true,

                gift: {

                    id:
                        String(
                            result.rows[0].id
                        ),

                    receiver_id:
                        String(
                            receiverId
                        ),

                    plan:
                        gift.name,

                    duration_days:
                        Number(
                            gift.duration_days
                        ),

                    amount_idr:
                        Number(
                            gift.price_idr
                        ),

                    status:
                        "pending",

                    created_at:
                        result.rows[0]
                            .created_at
                }
            });

        } catch (error) {

            console.error(
                "Create gift error:",
                error
            );

            res.status(500).json({

                success: false,

                error:
                    "Gagal membuat Gift."
            });
        }
    }
);

// =========================
// LOGOUT
// =========================

// POST

app.post(
    "/auth/logout",
    (req, res) => {

        req.session.destroy(
            (error) => {

                if (error) {

                    console.error(
                        "Logout error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error:
                            "Logout gagal."
                    });
                }

                res.clearCookie(
                    "connect.sid"
                );

                res.json({
                    success: true
                });
            }
        );
    }
);

// GET

app.get(
    "/auth/logout",
    (req, res) => {

        req.session.destroy(
            (error) => {

                if (error) {

                    console.error(
                        "Logout error:",
                        error
                    );

                    return res.status(500).json({

                        success: false,

                        error:
                            "Logout gagal."
                    });
                }

                res.clearCookie(
                    "connect.sid"
                );

                res.json({
                    success: true
                });
            }
        );
    }
);


/* =====================================================
   GLOBAL CHAT
   PostgreSQL + polling
   ===================================================== */

// Buat jadual jika belum wujud
async function initializeGlobalChat() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS global_chat_messages (
            id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
            message VARCHAR(500) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_global_chat_messages_id
        ON global_chat_messages(id);
    `);

    console.log("Global Chat database ready.");
}

// GET: Ambil mesej terbaru
app.get(
    "/api/global-chat/messages",
    requireLogin,
    async (req, res) => {
        try {
            const after = req.query.after
                ? String(req.query.after)
                : "0";

            if (!/^\d+$/.test(after)) {
                return res.status(400).json({
                    success: false,
                    error: "Message cursor tidak sah."
                });
            }

            const result = await pool.query(
                `
                SELECT
                    m.id,
                    m.message,
                    m.created_at,
                    u.id AS user_id,
                    u.username,
                    u.display_name,
                    u.avatar_url
                FROM global_chat_messages m
                JOIN users u ON u.id = m.user_id
                WHERE m.id > $1::BIGINT
                ORDER BY m.id ASC
                LIMIT 100
                `,
                [after]
            );

            res.json({
                success: true,
                messages: result.rows.map(row => ({
                    id: String(row.id),
                    user_id: String(row.user_id),
                    username: row.username,
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                    message: row.message,
                    created_at: row.created_at
                }))
            });
        } catch (error) {
            console.error("Global Chat fetch error:", error);

            res.status(500).json({
                success: false,
                error: "Gagal mengambil mesej Global Chat."
            });
        }
    }
);

// POST: Hantar mesej
app.post(
    "/api/global-chat/messages",
    requireLogin,
    async (req, res) => {
        try {
            const userId = req.session.userId;
            const message = String(req.body.message || "").trim();

            if (!message) {
                return res.status(400).json({
                    success: false,
                    error: "Mesej tidak boleh kosong."
                });
            }

            if (message.length > 500) {
                return res.status(400).json({
                    success: false,
                    error: "Mesej maksimum 500 karakter."
                });
            }

            // Hadkan penghantaran untuk mengurangkan spam:
            // sekurang-kurangnya 1 saat antara mesej bagi setiap pengguna.
            const previous = await pool.query(
                `
                SELECT created_at
                FROM global_chat_messages
                WHERE user_id = $1
                ORDER BY id DESC
                LIMIT 1
                `,
                [userId]
            );

            if (previous.rows.length > 0) {
                const lastSent = new Date(
                    previous.rows[0].created_at
                ).getTime();

                if (Date.now() - lastSent < 1000) {
                    return res.status(429).json({
                        success: false,
                        error: "Tunggu sebentar sebelum menghantar mesej lagi."
                    });
                }
            }

            const result = await pool.query(
                `
                INSERT INTO global_chat_messages
                    (user_id, message)
                VALUES
                    ($1, $2)
                RETURNING id, message, created_at
                `,
                [userId, message]
            );

            res.status(201).json({
                success: true,
                message: {
                    id: String(result.rows[0].id),
                    message: result.rows[0].message,
                    created_at: result.rows[0].created_at
                }
            });
        } catch (error) {
            console.error("Global Chat send error:", error);

            res.status(500).json({
                success: false,
                error: "Gagal menghantar mesej Global Chat."
            });
        }
    }
);


/* =========================
   ANIME EPISODES API
   ========================= */

async function initializeAnimeEpisodes() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS anime_episodes (
            id BIGSERIAL PRIMARY KEY,
            anime_title VARCHAR(150) NOT NULL,
            title VARCHAR(150) NOT NULL,
            filename VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ NOT NULL
                DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("Anime Episodes database ready.");
}

// Dapatkan senarai episod
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
        console.error("Get episodes error:", error);

        res.status(500).json({
            success: false,
            error: "Gagal mengambil senarai episod."
        });
    }
});

const animeAdminDiscordIds = (
    process.env.ANIME_ADMIN_DISCORD_IDS || ""
)
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

async function requireAnimeAdmin(req, res, next) {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({
                success: false,
                error: "Sila log masuk dahulu."
            });
        }

        if (animeAdminDiscordIds.length === 0) {
            return res.status(403).json({
                success: false,
                error: "Admin upload belum dikonfigurasi."
            });
        }

        const result = await pool.query(
            `SELECT provider_user_id
             FROM oauth_accounts
             WHERE user_id = $1
               AND provider = 'discord'
             LIMIT 1`,
            [req.session.userId]
        );

        const discordId = result.rows[0]?.provider_user_id;

        if (!discordId || !animeAdminDiscordIds.includes(String(discordId))) {
            return res.status(403).json({
                success: false,
                error: "Hanya admin dibenarkan memuat naik episod."
            });
        }

        next();
    } catch (error) {
        console.error("Anime admin check error:", error);

        return res.status(500).json({
            success: false,
            error: "Gagal mengesahkan akses admin."
        });
    }
}

// ========================================
// ANIME EPISODES API
// ========================================

// Ambil senarai episod
app.get("/api/episodes", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, anime_title, title, filename, created_at
            FROM anime_episodes
            ORDER BY id DESC
        `);

        res.json({
            success: true,
            episodes: result.rows.map(episode => ({
                id: String(episode.id),
                animeTitle: episode.anime_title,
                title: episode.title,
                videoUrl: "/uploads/" + encodeURIComponent(episode.filename),
                createdAt: episode.created_at
            }))
        });
    } catch (error) {
        console.error("Get episodes error:", error);

        res.status(500).json({
            success: false,
            error: "Gagal mengambil senarai episod."
        });
    }
});

// Upload episod MP4 (admin sahaja)
app.post(
    "/api/episodes/upload",
    requireAnimeAdmin,
    (req, res, next) => {
        animeUpload.single("video")(req, res, error => {
            if (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message || "Upload gagal."
                });
            }

            next();
        });
    },
    async (req, res) => {
        let filename;

        try {
            const animeTitle = String(req.body.animeTitle || "").trim();
            const title = String(req.body.title || "").trim();

            if (!req.file) {
                return res.status(400).json({
                    success: false,
                    error: "Sila pilih fail MP4."
                });
            }

            filename = req.file.filename;

            if (!animeTitle || !title ||
                animeTitle.length > 150 || title.length > 150) {
                fs.unlink(
                    path.join(animeUploadDir, filename),
                    () => {}
                );

                return res.status(400).json({
                    success: false,
                    error: "Isi nama anime dan tajuk episod (maksimum 150 aksara)."
                });
            }

            const result = await pool.query(
                `INSERT INTO anime_episodes
                    (anime_title, title, filename)
                 VALUES ($1, $2, $3)
                 RETURNING id, anime_title, title, filename, created_at`,
                [animeTitle, title, filename]
            );

            const episode = result.rows[0];

            res.status(201).json({
                success: true,
                message: "Episod berjaya dimuat naik.",
                episode: {
                    id: String(episode.id),
                    animeTitle: episode.anime_title,
                    title: episode.title,
                    videoUrl: "/uploads/" +
                        encodeURIComponent(episode.filename),
                    createdAt: episode.created_at
                }
            });
        } catch (error) {
            console.error("Upload episode error:", error);

            if (filename) {
                fs.unlink(
                    path.join(animeUploadDir, filename),
                    () => {}
                );
            }

            res.status(500).json({
                success: false,
                error: "Gagal menyimpan episod."
            });
        }
    }
);

// =========================
// 404 API
// =========================

app.use(
    "/api",
    (req, res) => {

        res.status(404).json({

            success: false,

            error:
                "API endpoint tidak ditemukan."
        });
    }
);


 // =========================
// START SERVER
// =========================

async function startServer() {
    try {
        // Pastikan jadual Global Chat wujud dahulu.
        await initializeGlobalChat();
        await initializeAnimeEpisodes();

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
            console.log("Database-backed user data enabled.");
            console.log("Guild API enabled.");
            console.log("Global Chat API enabled.");
        });
    } catch (error) {
        console.error("Server startup failed:", error);
        process.exit(1);
    }
}

startServer();

require("./delete-episodes")({
    app,
    pool,
    requireAnimeAdmin,
    animeUploadDir
});