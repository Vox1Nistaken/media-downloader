const express = require('express');
const cors = require('cors');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Browser Management
async function getBrowser() {
    return await puppeteer.launch({
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        headless: 'new',
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });
}

// Scrape Logic (Targeting SaveFrom via UI)
async function scrapeVideo(videoUrl) {
    let browser = null;
    try {
        console.log('🚀 Launching Puppeteer for:', videoUrl);
        browser = await getBrowser();
        const page = await browser.newPage();

        // Block heavy resources
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Go to SaveFrom
        await page.goto('https://en.savefrom.net/1-youtube-video-downloader-360/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        // Type URL
        await page.type('#sf_url', videoUrl);
        await page.click('#sf_submit');

        // Wait for result
        console.log('⏳ Waiting for download links...');

        // Wait for the result box to appear (timeout 15s)
        await page.waitForSelector('.def-btn-box', { timeout: 15000 });

        // Extract Links
        const results = await page.evaluate(() => {
            const links = [];
            // Primary link
            const mainBtn = document.querySelector('.link-download');
            if (mainBtn) {
                links.push({
                    quality: 'Best',
                    url: mainBtn.getAttribute('href'),
                    type: 'video'
                });
            }

            // Other links (sometimes in drop-down)
            // SaveFrom structure is complex, often main button is enough.
            return links;
        });

        if (!results || results.length === 0) {
            throw new Error('No links found on page');
        }

        const title = await page.evaluate(() => {
            const titleEl = document.querySelector('.title, .info-box');
            return titleEl ? titleEl.innerText.trim() : 'Video';
        });

        return {
            title: title,
            thumbnail: 'https://placehold.co/600x400?text=Puppeteer+Success',
            formats: results
        };

    } catch (error) {
        console.error('Puppeteer Error:', error.message);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
}

// --- API: INFO ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        const data = await scrapeVideo(url);

        return res.json({
            platform: 'Puppeteer',
            title: data.title,
            thumbnail: data.thumbnail,
            formats: data.formats
        });

    } catch (error) {
        console.error('Final Error:', error);
        res.status(500).json({ error: 'Failed to fetch media. ' + error.message });
    }
});

// --- API: DOWNLOAD ---
// Redirect to the direct link fetched by Puppeteer
app.get('/api/download', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL missing');

    // Puppeteer already returns direct links, frontend should use them directly.
    // But if we need to proxy...
    try {
        const data = await scrapeVideo(url);
        if (data.formats && data.formats.length > 0) {
            return res.redirect(data.formats[0].url);
        }
        res.status(404).send('Link expired or not found');
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend Puppeteer Service running at http://0.0.0.0:${PORT}`);
});
