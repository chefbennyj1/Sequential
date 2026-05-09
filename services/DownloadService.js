const fs = require('fs');
const path = require('path');
const axios = require('axios');

class DownloadService {
    constructor() {
        this.activeDownloads = new Map();
    }

    async downloadFile(url, destPath, type, io) {
        if (this.activeDownloads.has(type)) {
            throw new Error(`Download for ${type} is already in progress.`);
        }

        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

        console.log(`[Downloader] Starting download: ${url} -> ${destPath}`);
        this.activeDownloads.set(type, true);

        try {
            const response = await axios({
                method: 'get',
                url: url,
                responseType: 'stream'
            });

            const totalLength = response.headers['content-length'];
            let downloadedLength = 0;

            const writer = fs.createWriteStream(destPath);

            response.data.on('data', (chunk) => {
                downloadedLength += chunk.length;
                if (totalLength && io) {
                    const percentage = Math.round((downloadedLength / totalLength) * 100);
                    io.emit('model_download_progress', { type, percentage });
                }
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    this.activeDownloads.delete(type);
                    console.log(`[Downloader] Download complete: ${type}`);
                    resolve();
                });
                writer.on('error', (err) => {
                    this.activeDownloads.delete(type);
                    reject(err);
                });
            });
        } catch (err) {
            this.activeDownloads.delete(type);
            throw err;
        }
    }
}

module.exports = new DownloadService();
