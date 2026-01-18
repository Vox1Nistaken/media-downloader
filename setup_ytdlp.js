const fs = require('fs');
const path = require('path');
const axios = require('axios');

const platform = process.platform;
const isWin = platform === 'win32';

const fileName = isWin ? 'yt-dlp.exe' : 'yt-dlp';
const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${fileName}`;
const dest = path.join(__dirname, fileName);

async function downloadFile() {
    console.log(`Downloading yt-dlp.exe from ${url}...`);
    try {
        const writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                if (!isWin) {
                    try {
                        const { execSync } = require('child_process');
                        execSync(`chmod +x ${dest}`);
                        console.log('Set executable permissions for yt-dlp');
                    } catch (e) {
                        console.error('Failed to set permissions:', e.message);
                    }
                }
                resolve();
            });
            writer.on('error', reject);
        });
    } catch (error) {
        console.error('Download failed:', error.message);
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
    }
}

downloadFile().then(() => console.log('Download completed: yt-dlp.exe'));
