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

// API: Proxy Download (Streams directly to user)
const { spawn } = require('child_process');

app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    console.log('Starting stream download for:', url);

    try {
        res.header('Content-Disposition', 'attachment; filename="video.mp4"');
        res.header('Content-Type', 'video/mp4');

        // Use npx to locate the local yt-dlp binary from node_modules
        // We use 'best[ext=mp4]' to avoid complex merging that might fail over pipe
        const args = [
            url,
            '-o', '-',
            '-f', 'best[ext=mp4]/best',
            '--no-playlist',
            '--no-check-certificates',
            '--prefer-free-formats',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            '--referer', 'https://www.google.com/'
        ];

        // spawn is robust for streaming
        const ytProcess = spawn('npx', ['yt-dlp', ...args]);

        ytProcess.stdout.pipe(res);

        ytProcess.stderr.on('data', (data) => {
            console.error('yt-dlp stderr:', data.toString());
        });

        ytProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp process exited with code ${code}`);
                if (!res.headersSent) res.status(500).send('Download Server Error');
            }
        });

        req.on('close', () => {
            ytProcess.kill();
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
