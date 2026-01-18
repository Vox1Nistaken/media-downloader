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

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on port ${PORT}`);
});
