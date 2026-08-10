import express from "express";
import { spawn } from "child_process";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 9000;

app.get("/", (req, res) => {
    res.json({
        name: "yt-downloader",
        status: "running",
        endpoints: ["/api/download"]
    });
});

app.post("/api/download", async (req, res) => {
    const { url, format = "mp4", quality = "1080" } = req.body || {};
    if (!url) return res.status(400).json({ error: "URL required" });

    try {
        const filename = `${Date.now()}.${format}`;
        const ydlArgs = [
            url,
            "-o", `/tmp/${filename}`,
            "-f", format === "mp3" ? "bestaudio" : `bestvideo[height<=${quality}]+bestaudio/best`,
            "--merge-output-format", format,
            "--no-playlist",
            "--no-warnings",
        ];
        if (format === "mp3") {
            ydlArgs.push("-x", "--audio-format", "mp3");
        }

        const proc = spawn("yt-dlp", ydlArgs);
        let stderr = "";
        proc.stderr.on("data", (d) => stderr += d.toString());

        proc.on("close", (code) => {
            if (code !== 0) {
                return res.status(500).json({ error: stderr });
            }
            res.download(`/tmp/${filename}`, filename, (err) => {
                if (err) console.error("Send error:", err);
            });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`yt-downloader listening on ${PORT}`));
