const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// --- V4 CORE: SYSTEM DEPENDENCIES ---
const ffmpegPath = require('ffmpeg-static');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, '/')));

// Temp Directory
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Auth File Path
const COOKIE_PATH = path.join(__dirname, 'cookies.txt');
const STATS_PATH = path.join(__dirname, 'stats.json');

// --- STATS SYSTEM ---
let systemStats = { totalDownloads: 0, recentRequests: [] };

// Load Stats
if (fs.existsSync(STATS_PATH)) {
    try {
        systemStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    } catch (e) { console.error('Stats load invalid', e); }
}

function saveStats() {
    try { fs.writeFileSync(STATS_PATH, JSON.stringify(systemStats, null, 2)); } catch (e) { }
}

function addActivity(type, url, status) {
    systemStats.recentRequests.unshift({ timestamp: Date.now(), type, url, status });
    if (systemStats.recentRequests.length > 50) systemStats.recentRequests.pop();
    saveStats();
}

// --- API: HEALTH CHECK ---
app.get('/api/health', (req, res) => {
    let ffmpegStatus = 'missing';
    let authStatus = 'missing';

    // 1. Check FFmpeg
    try {
        if (fs.existsSync(ffmpegPath)) {
            try { fs.chmodSync(ffmpegPath, '755'); } catch (e) { }
            ffmpegStatus = 'ready';
        }
    } catch (e) { ffmpegStatus = 'error'; }

    // 2. Check Auth (Cookies)
    if (fs.existsSync(COOKIE_PATH)) {
        const cookies = fs.readFileSync(COOKIE_PATH, 'utf8');
        if (cookies.length > 10) authStatus = 'active';
    }

    res.json({
        status: 'online',
        ffmpeg: ffmpegStatus,
        auth: authStatus,
        version: 'v5.0.0-NATIVE'
    });
});

// --- API: STATS ---
app.get('/api/stats', (req, res) => {
    res.json(systemStats);
});

// --- API: INFO FETCH (Native Spawn) ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log(`[V5 Info] Fetching: ${url}`);

        // Native yt-dlp arguments
        const args = [
            url,
            '--dump-single-json',
            '--no-playlist',
            '--no-check-certificates',
            '--force-ipv4',
            '--extractor-args', 'youtube:player_client=web',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        if (fs.existsSync(COOKIE_PATH)) {
            args.push('--cookies', COOKIE_PATH);
        }

        const ytDlpProcess = spawn('yt-dlp', args);
        let stdout = '';
        let stderr = '';

        ytDlpProcess.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        ytDlpProcess.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        ytDlpProcess.on('close', (code) => {
            if (code !== 0) {
                console.error('[Info Error]', stderr);
                return res.status(500).json({ error: 'Failed to fetch video info. Check cookies or update yt-dlp.' });
            }

            try {
                const output = JSON.parse(stdout);

                // Manually filter formats
                const formats = (output.formats || []).map(f => ({
                    quality: f.format_note || f.resolution || 'unknown',
                    ext: f.ext,
                    url: f.url,
                    hasAudio: f.acodec !== 'none',
                    hasVideo: f.vcodec !== 'none',
                    height: f.height
                })).filter(f => f.url);

                res.json({
                    title: output.title,
                    thumbnail: output.thumbnail,
                    duration: output.duration,
                    formats: formats,
                    platform: 'YouTube'
                });
            } catch (jsonErr) {
                console.error('[JSON Parse Error]', jsonErr);
                res.status(500).json({ error: 'Failed to parse video info' });
            }
        });

    } catch (error) {
        console.error('[Info Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// --- API: UPDATE COOKIES ---
app.post('/api/admin/cookies', (req, res) => {
    try {
        const { cookies } = req.body;
        if (!cookies) return res.status(400).json({ error: 'No content' });

        fs.writeFileSync(COOKIE_PATH, cookies, 'utf8');
        console.log('[Auth] Cookies updated manually via Admin Panel');
        res.json({ success: true, message: 'Cookies updated! V5 Engine is ready.' });
    } catch (e) {
        console.error('Cookie Write Error', e);
        res.status(500).json({ error: 'Failed to save cookies' });
    }
});

// --- SSE INFRASTRUCTURE ---
const activeClients = new Map();

app.get('/api/progress/:clientId', (req, res) => {
    const { clientId } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    activeClients.set(clientId, res);
    req.on('close', () => activeClients.delete(clientId));
});

function sendProgress(clientId, data) {
    const client = activeClients.get(clientId);
    if (client) client.write(`data: ${JSON.stringify(data)}\n\n`);
}

// --- API: DOWNLOAD (Native Spawn) ---
app.get('/api/download', async (req, res) => {
    const { url, title, clientId } = req.query;
    if (!url) return res.status(400).send('URL required');

    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const tempFilename = `${Date.now()}_${safeTitle}.mp4`;
    const tempPath = path.join(tempDir, tempFilename);

    console.log(`[V5 Download] ${url} (Client: ${clientId || 'None'})`);

    const args = [
        url,
        '-f', 'bv*+ba/b', // Best video+audio
        '--merge-output-format', 'mp4',
        '-o', tempPath,
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--ffmpeg-location', ffmpegPath,
        '--extractor-args', 'youtube:player_client=web',
        '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--verbose',
        '-N', '8',
        '--buffer-size', '16M',
        '--progress',
        '--newline'
    ];

    if (fs.existsSync(COOKIE_PATH)) {
        args.push('--cookies', COOKIE_PATH);
    }

    try {
        const process = spawn('yt-dlp', args);
        let errorLog = '';

        process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                const cleanLine = line.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').trim();
                const match = cleanLine.match(/(\d+\.?\d*)%\s+of\s+~?([\d\.]+\w+)(?:\s+at\s+([\d\.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/);

                if (match && clientId) {
                    sendProgress(clientId, {
                        status: 'downloading',
                        percent: match[1],
                        text: `${match[2]} • ${match[3] || '0MiB/s'} • ETA ${match[4] || '--:--'}`
                    });
                }
            }
        });

        process.stderr.on('data', d => errorLog += d.toString());

        process.on('close', code => {
            if (code === 0) {
                if (clientId) sendProgress(clientId, { status: 'complete', percent: 100, text: 'Finalizing...' });
                console.log(`[Download Complete] ${tempPath}`);

                systemStats.totalDownloads++;
                addActivity('download', url, 'Success');
                saveStats();

                if (!fs.existsSync(tempPath)) {
                    if (!res.headersSent) res.status(500).json({ error: 'File missing after download' });
                    return;
                }

                res.download(tempPath, `${safeTitle}.mp4`, err => {
                    if (err) console.error('Send Error:', err);
                    setTimeout(() => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    }, 60000);
                });
            } else {
                console.error(`[Download Error] ${code}`);
                console.error(errorLog);

                if (clientId) sendProgress(clientId, { status: 'error', text: 'Failed' });
                addActivity('download', url, 'Failed');
                saveStats();

                if (!res.headersSent) res.status(500).json({ error: 'Download failed. Check logs.' });
            }
        });

    } catch (e) {
        console.error('Spawn Error:', e);
        if (!res.headersSent) res.status(500).send(`Internal Error: ${e.message}`);
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Phoenix V5 (Native) Engine running on ${PORT}`);
});

server.setTimeout(0);
