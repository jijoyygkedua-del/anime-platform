
const fs = require("fs");
const path = require("path");

module.exports = function registerDeleteEpisodes({
    app,
    pool,
    requireAnimeAdmin,
    animeUploadDir
}) {
    app.delete(
        "/api/episodes/:id",
        requireAnimeAdmin,
        async (req, res) => {
            try {
                const id = req.params.id;

                if (!/^\d+$/.test(id)) {
                    return res.status(400).json({
                        success: false,
                        error: "ID episod tidak sah."
                    });
                }

                const found = await pool.query(
                    "SELECT id, filename FROM anime_episodes WHERE id = $1",
                    [id]
                );

                if (found.rows.length === 0) {
                    return res.status(404).json({
                        success: false,
                        error: "Episod tidak dijumpai."
                    });
                }

                const episode = found.rows[0];

                await pool.query(
                    "DELETE FROM anime_episodes WHERE id = $1",
                    [id]
                );

                const filename = path.basename(episode.filename);
                const filePath = path.join(animeUploadDir, filename);

                try {
                    await fs.promises.unlink(filePath);
                } catch (err) {
                    if (err.code !== "ENOENT") {
                        console.error("Gagal memadam fail video:", err);
                    }
                }

                return res.json({
                    success: true,
                    message: "Episod berjaya dipadam."
                });
            } catch (err) {
                console.error("Delete episode error:", err);

                return res.status(500).json({
                    success: false,
                    error: "Gagal memadam episod."
                });
            }
        }
    );
};