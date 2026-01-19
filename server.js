const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const ytDlp = require('yt-dlp-exec');

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

// --- API: HEALTH CHECK (The "Engine Light") ---
app.get('/api/health', (req, res) => {
    let ffmpegStatus = 'missing';
    let authStatus = 'missing';
    let ipStatus = 'unknown';

    // 1. Check FFmpeg
    try {
        if (fs.existsSync(ffmpegPath)) {
            // Ensure executable
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
        version: 'v4.5.0'
    });
});

// --- API: STATS (New for Admin Panel) ---
app.get('/api/stats', (req, res) => {
    res.json(systemStats);
});

// --- API: INFO FETCH ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log(`[V4 Info] Fetching: ${url}`);

        const args = {
            dumpSingleJson: true,
            noPlaylist: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
            forceIpv4: true
        };

        // Use TV client if authenticated, else Android (to avoid login wall for public data)
        const hasCookies = fs.existsSync(COOKIE_PATH);
        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

        // V6.1: GLOBAL COOKIE SUPPORT (Fix for Instagram/Twitter Login Errors)
        // We pass the cookie file for ALL sites if it exists. 
        // This allows 'cookies.txt' to contain Netscape cookies for IG, X, generic sites, etc.
        if (hasCookies) {
            args.cookies = COOKIE_PATH;
        }

        if (isYoutube) {
            if (hasCookies) {
                // args.cookies is already set above
                args.extractorArgs = 'youtube:player_client=android';
            } else {
                args.extractorArgs = 'youtube:player_client=android'; // Always use Android
            }
        } else {
            // V6.3: MOBILE SPOOFING (Better for IG/TikTok)
            // Mobile pages are often less strict on login walls for Reels.
            args.userAgent = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
            // Removed Referer as it can trigger anti-bot checks if mismatching.
        }

        const output = await ytDlp(url, args);

        const formats = (output.formats || []).map(f => ({
            quality: f.format_note || f.resolution || 'unknown',
            ext: f.ext,
            url: f.url,
            hasAudio: f.acodec !== 'none',
            hasVideo: f.vcodec !== 'none',
            height: f.height
        })).filter(f => f.url);

        return res.json({
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration,
            formats: formats,
            platform: 'YouTube' // Simplified for now
        });

    } catch (error) {
        console.error('[Info Error]', error);
        res.status(500).json({ error: error.message || 'Failed to fetch video info' });
    }
});

// --- API: UPDATE COOKIES (The "Nuclear" Button) ---
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

// --- SSE INFRASTRUCTURE (V8: Real-Time Progress) ---
const activeClients = new Map(); // Store SSE responses: clientId -> res

// SSE Endpoint: Frontend connects here to listen
app.get('/api/progress/:clientId', (req, res) => {
    const { clientId } = req.params;

    // Headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Register client
    activeClients.set(clientId, res);

    // Remove on close
    req.on('close', () => {
        activeClients.delete(clientId);
    });
});

// Helper to send progress
function sendProgress(clientId, data) {
    const client = activeClients.get(clientId);
    if (client) {
        client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
}

// --- API: DOWNLOAD (Strict Mode - RESTORED) ---
app.get('/api/download', async (req, res) => {
    const { url, quality, title, clientId } = req.query; // Added clientId
    if (!url) return res.status(400).send('URL required');

    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const hasCookies = fs.existsSync(COOKIE_PATH);

    console.log(`[V4 Download] ${url} [${quality}] (Client: ${clientId || 'None'})`);

    const tempFilename = `${Date.now()}_${safeTitle}.mp4`;
    const tempPath = path.join(tempDir, tempFilename);

    // RESTORED ARGUMENTS (From Step 30 logs)
    const args = [
        url,
        '--merge-output-format', 'mp4',
        '-o', tempPath,
        '--no-playlist',
        '--no-check-certificates', // Re-adding as it was in the original "working" version
        '--force-ipv4',
        '--ffmpeg-location', ffmpegPath,
        '--verbose', // Debugging helpful
        // V6.5 PERFORMANCE TUNING
        '-N', '8', // Restoring 8
        '--buffer-size', '16M',
        '--ignore-errors',
        '--no-warnings',
        '--progress', // Force progress
        '--newline'   // Critical for parsing
    ];

    if (quality === 'audio') {
        args.push('-f', 'bestaudio/best');
    } else {
        // V9: RELIABLE 2K MAX (User Request) + ANDROID
        // "bestvideo[height<=1440]+bestaudio/best[height<=1440]"
        // This asks for the best possible video that is NOT 4K/8K, but up to 2K.
        args.push('-f', 'bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best[height<=1440]');

        // Force merge to mp4 just in case
        args.push('--merge-output-format', 'mp4');

        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYoutube) {
            // FORCE ANDROID CLIENT (Signature Safe)
            args.push('--extractor-args', 'youtube:player_client=android');

            if (hasCookies) {
                args.push('--cookies', COOKIE_PATH);
            }
        } else {
            if (hasCookies) args.push('--cookies', COOKIE_PATH);
            args.push('--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
        }
    }

    try {
        const ytDlpBinary = path.join(__dirname, 'node_modules', 'yt-dlp-exec', 'bin', 'yt-dlp');
        const binary = fs.existsSync(ytDlpBinary) ? ytDlpBinary : 'yt-dlp';

        console.log(`[V4 Exec] ${binary} ${args.join(' ')}`);

        // Spawn process
        const process = spawn(binary, args);
        let errorLog = '';

        // V8: CAPTURE STDOUT FOR PROGRESS
        process.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            for (const line of lines) {
                // Strip ANSI codes
                const cleanLine = line.replace(/\x1B\[[0-9;]*[JKmsu]/g, '').trim();

                // Regex: [download]  25.0% of 10.00MiB at  2.00MiB/s ETA 00:05
                // Support variations: ~10.00MiB, missing fields
                const match = cleanLine.match(/(\d+\.?\d*)%\s+of\s+~?([\d\.]+\w+)(?:\s+at\s+([\d\.]+\w+\/s))?(?:\s+ETA\s+([\d:]+))?/);

                if (match && clientId) {
                    const percent = match[1];
                    const size = match[2];
                    const speed = match[3] || '0MiB/s';
                    const eta = match[4] || '--:--';

                    sendProgress(clientId, {
                        status: 'downloading',
                        percent: percent,
                        text: `${size} • ${speed} • ETA ${eta}`
                    });
                } else if (clientId && cleanLine.length > 5) {
                    // DEBUG MODE: Send raw line if regex fails but line has content
                    // This helps us see what yt-dlp is actually outputting
                    sendProgress(clientId, {
                        status: 'downloading',
                        percent: 0, // Keep 0 to avoid confusing jumps, or maybe 50?
                        text: `[RAW] ${cleanLine.substring(0, 40)}...`
                    });
                }
            }
        });

        process.stderr.on('data', d => errorLog += d.toString());

        process.on('error', (spawnErr) => {
            console.error('[Spawn Error]', spawnErr);
            if (!res.headersSent) {
                res.status(500).json({ error: `Spawn Failed: ${spawnErr.message}` });
            }
        });

        process.on('close', code => {
            if (code === 0) {
                if (clientId) sendProgress(clientId, { status: 'complete', percent: 100, text: 'Finalizing...' });

                console.log(`[Download Complete] ${tempPath}`);

                // Update Stats
                systemStats.totalDownloads++;
                addActivity('download', url, 'Success');
                saveStats();

                if (!fs.existsSync(tempPath)) {
                    if (!res.headersSent) res.status(500).json({ error: 'File missing after successful download process' });
                    return;
                }
                res.download(tempPath, `${safeTitle}.mp4`, err => {
                    if (err) console.error('Send Error:', err);
                    setTimeout(() => {
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    }, 60000);
                });
            } else {
                console.error(`[Download Error] Exited with ${code}`);
                console.error('STDERR:', errorLog);

                if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                if (clientId) sendProgress(clientId, { status: 'error', text: 'Failed' });

                addActivity('download', url, 'Failed');
                saveStats();

                const err = errorLog.toLowerCase();
                if (err.includes('sign in') || err.includes('login required')) {
                    if (!res.headersSent) res.status(403).json({ error: 'RESTRICTED_CONTENT' });
                    return;
                }

                if (!res.headersSent) res.status(500).json({ error: errorLog || `Process exited with code ${code}` });
            }
        });

    } catch (e) {
        console.error('Download Endpoint Error:', e);
        if (!res.headersSent) res.status(500).send(`Internal Server Error: ${e.message}`);
    }
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Phoenix V4 Engine running on ${PORT}`);
    console.log(`FFmpeg: ${ffmpegPath}`);
});

// V7.1: INFINITE PATIENCE (Fix for >2min downloads)
server.setTimeout(0); // 0 = no timeout

