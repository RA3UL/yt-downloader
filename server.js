import express from "express";
import { execFile } from "child_process";
import path from "path";
import { existsSync, unlinkSync, readdirSync } from "fs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 9000;

// yt-dlp is downloaded by postinstall script (see package.json)
// It lives at /usr/local/bin/yt-dlp on the deployed container
const YTDLP_BIN = "/usr/local/bin/yt-dlp";

app.get("/", (req, res) => {
    res.json({
        name: "yt-downloader",
        status: "running",
        message: "POST /api/download with body { url, format?, quality? }",
    });
});

app.post("/api/download", async (req, res) => {
    if (!existsSync(YTDLP_BIN)) {
        return res.status(500).json({ error: "yt-dlp binary not found at " + YTDLP_BIN });
    }

    const { url, format = "mp4", quality = "720" } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL required" });

    const id = Date.now();
    const outTemplate = `/tmp/dl_${id}.%(ext)s`;

    const args = [
        "--no-playlist",
        "--no-warnings",
        "-o", outTemplate,
        "--extractor-args", "youtube:player_client=android,web",
    ];

    if (format === "mp3") {
        args.push("-x", "--audio-format", "mp3");
    } else {
        args.push("-f", `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]/best`);
        args.push("--merge-output-format", "mp4");
    }
    args.push(url);

    execFile(YTDLP_BIN, args, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
            console.error("yt-dlp error:", stderr);
            return res.status(500).json({ error: stderr || error.message });
        }
        const files = readdirSync("/tmp").filter(f => f.startsWith(`dl_${id}`));
        if (!files.length) return res.status(500).json({ error: "File not found after download" });

        const filepath = path.join("/tmp", files[0]);
        res.download(filepath, files[0], (err) => {
            if (err) console.error("Send error:", err);
            try { unlinkSync(filepath); } catch {}
        });
    });
});

app.listen(PORT, () => console.log(`yt-downloader listening on ${PORT}`));
