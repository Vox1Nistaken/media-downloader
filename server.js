const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios'); // Ensure axios is required
const { youtubedl, tiktokdl, twitterdl, savefrom } = require('@bochilteam/scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Cobalt Mirror List (Backend-side)
const COBALT_INSTANCES = [
    'https://api.cobalt.tools',
    'https://cobalt.154.53.56.156.nip.io',
    'https://cobalt.dani.guru',
    'https://cobalt.nao.2020.day',
    'https://dl.khub.win',
    'https://cobalt.q13.sbs',
    'https://c.haber.lol',
    'https://cobalt.kwiatekmiki.pl',
    'https://api.cobalt.best',
    'https://co.wuk.sh'
];

async function fallbackToCobalt(url) {
    console.log('🔄 Attempting Cobalt Fallback (Backend)...');

    // Shuffle
    const instances = [...COBALT_INSTANCES].sort(() => 0.5 - Math.random());

    for (const domain of instances) {
        try {
            const apiTarget = domain.endsWith('/') ? `${domain}api/json` : `${domain}/api/json`;
            console.log(`Backend trying Cobalt: ${domain}`);

            const response = await axios.post(apiTarget, {
                url: url,
                vCodec: 'h264',
                vQuality: 'max',
                aFormat: 'mp3',
                filenamePattern: 'basic'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000 // 8s timeout
            });

            const data = response.data;
            if (data && (data.url || data.picker || data.audio)) {
                return data;
            }
        } catch (e) {
            // silent fail per instance
        }
    }
    throw new Error('All Cobalt backend instances failed');
}

function mapCobaltFormats(data) {
    const formats = [];
    if (data.url) formats.push({ quality: 'Best', url: data.url, type: 'video' });
    if (data.picker) {
        data.picker.forEach(p => {
            formats.push({ quality: 'Select', url: p.url, type: p.type });
        });
    }
    if (data.audio) formats.push({ quality: 'Audio', url: data.audio, type: 'audio' });
    return formats;
}

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

// --- API: INFO ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log('Fetching info for:', url);
        let data;

        // 1. Try Scraper First
        try {
            if (url.includes('youtube.com') || url.includes('youtu.be')) {
                // Try youtubedl first
                try {
                    data = await youtubedl(url);
                } catch (e) {
                    console.log('youtubedl failed, trying savefrom...');
                    data = await savefrom(url);
                }
            } else if (url.includes('tiktok.com')) {
                data = await tiktokdl(url);
            } else if (url.includes('twitter.com') || url.includes('x.com')) {
                data = await twitterdl(url);
            } else if (url.includes('instagram.com')) {
                try {
                    const { instagramdl } = require('@bochilteam/scraper');
                    data = await instagramdl(url);
                } catch (e) {
                    data = await savefrom(url);
                }
            } else {
                data = await savefrom(url);
            }
        } catch (scraperError) {
            console.warn('Primary Scraper Failed:', scraperError.message);
        }

        // 2. If Scraper Failed or Empty, Try Cobalt Fallback
        if (!data || (!data.title && !data.url)) {
            try {
                const cobaltData = await fallbackToCobalt(url);
                // Map Cobalt data to our format
                return res.json({
                    platform: 'Cobalt Fallback',
                    title: 'Media Download', // Cobalt simplified metadata
                    thumbnail: 'https://placehold.co/600x400?text=Ready',
                    formats: mapCobaltFormats(cobaltData)
                });
            } catch (cobaltError) {
                console.error('Cobalt Fallback Failed:', cobaltError.message);
                if (!data) throw new Error('Both Scraper and Fallback systems failed.');
            }
        }

        if (!data) throw new Error('No data returned from scraper');

        return res.json({
            platform: 'Scraper',
            title: data.title || data.meta?.title || 'Unknown Title',
            thumbnail: data.thumbnail || data.meta?.thumbnail || 'https://placehold.co/600x400',
            formats: mapFormats(data)
        });

    } catch (error) {
        console.error('Final Error:', error);
        res.status(500).json({ error: 'Failed to fetch media. ' + error.message });
    }
});


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
