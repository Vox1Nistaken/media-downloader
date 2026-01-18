const express = require('express');
const cors = require('cors');
const path = require('path');
const ytDlp = require('yt-dlp-exec');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// API: Get Info
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log('Fetching info for:', url);

        // Get video info as JSON
        const output = await ytDlp(url, {
            dumpSingleJson: true,
            noPlaylist: true, // Prevent processing entire playlists
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            addHeader: [
                'referer:twitter.com',
                'user-agent:googlebot'
            ]
        });

        // Filter and map formats
        // We select "best" video and audio usually, but let's send available formats to frontend
        const formats = output.formats || [];

        // Simplify for frontend
        const simplifiedFormats = formats.map(f => ({
            quality: f.format_note || f.resolution || 'unknown',
            ext: f.ext,
            url: f.url,
            hasAudio: f.acodec !== 'none',
            hasVideo: f.vcodec !== 'none'
        })).filter(f => f.url); // Ensure URL exists

        return res.json({
            platform: 'yt-dlp',
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration,
            formats: simplifiedFormats,
            // Direct video link (best quality usually)
            downloadUrl: output.url // Sometimes present directly
        });

    } catch (error) {
        console.error('yt-dlp Error:', error);
        res.status(500).json({ error: 'Failed to fetch media. ' + error.message });
    }
});

// API: High Quality Download (Download to Temp -> Merge -> Send -> Delete)
const { spawn } = require('child_process');
const fs = require('fs');

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

app.get('/api/download', async (req, res) => {
    const { url, quality, title } = req.query;
    if (!url) return res.status(400).send('URL required');

    console.log(`Starting HQ Download: ${url} [${quality}]`);

    // Determine Format - FORCE HQ, Remove fallback to 'best' to prevent 144p
    // If ffmpeg is missing, this will fail, which is better than silence.
    let formatArg = 'bestvideo+bestaudio'; // Strict merge

    if (quality === '1080p') formatArg = 'bestvideo[height<=1080]+bestaudio';
    else if (quality === '720p') formatArg = 'bestvideo[height<=720]+bestaudio';
    else if (quality === '480p') formatArg = 'bestvideo[height<=480]+bestaudio';
    else if (quality === 'audio') formatArg = 'bestaudio';

    // Generate Safe Filename
    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const tempFilename = `${Date.now()}_${safeTitle}.mp4`;
    const tempPath = path.join(tempDir, tempFilename);

    try {
        console.log(`Using strict format: ${formatArg}`);

        // Spawn yt-dlp - Rely on PATH for ffmpeg (safer than hardcoded path if installed via apt)
        const args = [
            url,
            '-f', formatArg,
            '--merge-output-format', 'mp4',
            '-o', tempPath,
            '--no-playlist',
            '--no-check-certificates',
            '--extractor-args', 'youtube:player_client=android',
            '--force-ipv4',
            '--verbose'
        ];

        const ytProcess = spawn('yt-dlp', args);

        // Logging & Error Capture
        let errorLog = '';
        ytProcess.stderr.on('data', (data) => {
            const msg = data.toString();
            console.log(`yt-dlp prog: ${msg}`);
            errorLog += msg;
        });

        ytProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Download failed with code ${code}`);
                // Send the specific errorlog to the user to help debug
                // Limit log size to avoid huge headers/body
                const cleanLog = errorLog.slice(-500).replace(/\n/g, ' ');
                return res.status(500).send(`Server Error: ${cleanLog}`);
            }

            // Check if file exists
            if (!fs.existsSync(tempPath)) {
                return res.status(500).send('File not created. Check logs.');
            }

            // Send File to User
            const userFilename = `${safeTitle}.mp4`;
            res.download(tempPath, userFilename, (err) => {
                if (err) console.error('Send Error:', err);

                // Delete file after sending (or error)
                fs.unlink(tempPath, (unlinkErr) => {
                    if (unlinkErr) console.error('Cleanup Error:', unlinkErr);
                    else console.log('Temp file cleaned up:', tempPath);
                });
            });
        });

    } catch (error) {
        console.error('Download Setup Error:', error);
        if (!res.headersSent) res.status(500).send('Server Error');
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on port ${PORT}`);
});
