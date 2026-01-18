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
app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL required');

    try {
        console.log('Starting stream download for:', url);

        // Set headers for download
        res.header('Content-Disposition', 'attachment; filename="video.mp4"');

        // Use yt-dlp to stream output
        // We use the same ytDlp function but with 'exec' to get the process
        const process = ytDlp.exec(url, {
            output: '-',
            format: 'best',
            noPlaylist: true,
            noCheckCertificates: true,
            refer: 'https://www.google.com/',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        });

        // Pipe stdout to response
        process.stdout.pipe(res);

        process.stderr.on('data', (data) => {
            // Log stderr but don't break the stream
            console.error('Stream stderr:', data.toString());
        });

        req.on('close', () => {
            // connection closed, kill process
            process.kill();
        });

    } catch (error) {
        console.error('Download Error:', error);
        if (!res.headersSent) res.status(500).send('Download Failed');
    }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on port ${PORT}`);
});
