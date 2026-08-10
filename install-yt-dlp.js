import { existsSync, chmodSync, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import https from "https";

const URL = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const DEST = "/usr/local/bin/yt-dlp";

async function main() {
    if (existsSync(DEST)) {
        console.log("yt-dlp already installed at", DEST);
        return;
    }
    console.log("Downloading yt-dlp from", URL);
    await new Promise((resolve, reject) => {
        const download = (url) => https.get(url, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
                return download(res.headers.location);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const file = createWriteStream(DEST);
            pipeline(res, file).then(resolve, reject);
        }).on("error", reject);
        download(URL);
    });
    chmodSync(DEST, 0o755);
    console.log("yt-dlp installed at", DEST);
}

main().catch((e) => {
    console.error("Install failed:", e.message);
    process.exit(1);
});
