import express from "express";
import { execFile } from "child_process";
import path from "path";
import { existsSync, unlinkSync, readdirSync, chmodSync, createWriteStream, statSync } from "fs";
import { pipeline } from "stream/promises";
import https from "https";
import { execSync } from "child_process";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 8080;
const YTDLP_BIN = "/usr/local/bin/yt-dlp";

async function downloadYtDlp() {
    // Check if existing binary works (it might be the Python-dependent one)
    if (existsSync(YTDLP_BIN)) {
        try {
            const v = execSync(YTDLP_BIN + " --version", { timeout: 5000 }).toString().trim();
            console.log("yt-dlp already exists and works:", v);
            return;
        } catch (e) {
            console.log("yt-dlp exists but broken, removing:", e.message);
            try { unlinkSync(YTDLP_BIN); } catch {}
        }
    }
    console.log("Downloading yt-dlp (Linux standalone binary)...");
    const url = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
    const download = (u) => new Promise((resolve, reject) => {
        https.get(u, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return download(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) return reject(new Error("HTTP " + res.statusCode));
            const file = createWriteStream(YTDLP_BIN);
            pipeline(res, file).then(resolve, reject);
        }).on("error", reject);
    });
    await download(url);
    chmodSync(YTDLP_BIN, 0o755);
    const size = statSync(YTDLP_BIN).size;
    console.log(`yt-dlp installed (${(size / 1024 / 1024).toFixed(2)} MB).`);
}

downloadYtDlp().then(() => {
    app.get("/", (req, res) => {
        res.json({ name: "yt-downloader", status: "running" });
    });

    app.post("/api/download", (req, res) => {
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
}).catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
});
