const express = require('express');
const cors = require('cors');
const path = require('path');
const { youtubedl, tiktokdl, twitterdl, savefrom } = require('@bochilteam/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// --- API: INFO ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log('Fetching info for:', url);
        let data;

        // Platform detection and scraping
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            // Try youtubedl first (usually robust)
            try {
                data = await youtubedl(url);
            } catch (e) {
                console.log('youtubedl failed, trying savefrom...');
                data = await savefrom(url);
                // normalize savefrom to look like youtube structure if needed, or handle in frontend
            }
        } else if (url.includes('tiktok.com')) {
            data = await tiktokdl(url);
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
            data = await twitterdl(url);
        } else if (url.includes('instagram.com')) {
            // @bochilteam/scraper might have instagramdl, check docs or use savefrom
            try {
                const { instagramdl } = require('@bochilteam/scraper');
                data = await instagramdl(url);
            } catch (e) {
                data = await savefrom(url);
            }
        } else {
            // General fallback
            data = await savefrom(url);
        }

        if (!data) throw new Error('No data returned from scraper');

        // Normalize Data for Frontend
        // This part depends heavily on the structure returned by @bochilteam/scraper
        // We will send the raw data mostly and let the frontend adapt, OR normalize here.
        // Let's normalize slightly to match previous contract.

        // Note: Actual structure needs to be verified. 
        // Assuming standard structure for now.

        return res.json({
            platform: 'Scraper',
            title: data.title || data.meta?.title || 'Unknown Title',
            thumbnail: data.thumbnail || data.meta?.thumbnail || 'https://placehold.co/600x400',
            formats: mapFormats(data)
        });

    } catch (error) {
        console.error('Scraper Error:', error);
        res.status(500).json({ error: 'Scraping failed: ' + error.message });
    }
});

function mapFormats(data) {
    const formats = [];

    // Youtubedl structure from bochil usually has .video and .audio arrays or similar
    if (data.video) {
        Object.entries(data.video).forEach(([quality, widthOrDetails]) => {
            // Sometimes it returns simple object { 'auto': 'link', '360p': 'link' }
            // Or complex object. Accessing .download() usually gives link.
            // Let's assume simplest: key is quality, value is async func or awaitable.
            // Check docs: await youtubedl(url) -> returns object where values are promises or direct?
            // Actually bochil youtubedl returns metadata + .video, .audio objects with download methods.
            formats.push({
                quality: quality,
                itag: quality, // verify
                url: 'WILL_RESOLVE_ON_DOWNLOAD', // We might need to resolve now or proxy?
                // Be careful: resolving now might expire links.
                // Better: Frontend requests specific quality -> Backend resolves -> Redirect.
                type: 'video'
            });
        });
    }

    // Simpler approach: savefrom usually returns direct links array
    if (Array.isArray(data)) {
        data.forEach(item => {
            if (item.url) {
                formats.push({
                    quality: item.quality || item.subname || 'Unknown',
                    url: item.url,
                    type: 'video'
                });
            }
        });
    }

    // Default fallback if structure is unknown (pass raw for debug if needed)
    if (formats.length === 0 && data.url) {
        formats.push({ quality: 'Default', url: data.url, type: 'video' });
    }

    return formats;
}

// --- API: DOWNLOAD ---
// Since link expiration is an issue, we resolve link here if needed
app.get('/api/download', async (req, res) => {
    const { url, quality } = req.query;
    try {
        // Re-scrape to get fresh link
        // Re-scrape to get fresh link
        if (url.includes('youtube')) {
            const data = await youtubedl(url);
            // Check if quality exists in video object
            if (data.video && data.video[quality]) {
                const downloadMethod = data.video[quality].download;
                if (typeof downloadMethod === 'function') {
                    const link = await downloadMethod();
                    if (link) return res.redirect(link);
                }
            }
        } else {
            // For others, we try savefrom again or similar
            const data = await savefrom(url);
            if (Array.isArray(data)) {
                const match = data.find(item => item.quality === quality || item.url);
                if (match && match.url) return res.redirect(match.url);
            }
        }
        // Fallback
        res.status(400).send('Download link generation failed');
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Scraper running at http://0.0.0.0:${PORT}`);
});
