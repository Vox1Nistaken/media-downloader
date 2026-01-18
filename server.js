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
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Temp Directory
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Auth File Path
const COOKIE_PATH = path.join(__dirname, 'cookies.txt');

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
        version: 'v4.0.0'
    });
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
        if (hasCookies) {
            args.cookies = COOKIE_PATH;
            args.extractorArgs = 'youtube:player_client=tv';
        } else {
            args.extractorArgs = 'youtube:player_client=android';
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

// --- API: DOWNLOAD (Strict Mode) ---
app.get('/api/download', async (req, res) => {
    const { url, quality, title } = req.query;
    if (!url) return res.status(400).send('URL required');

    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const tempFilename = `${Date.now()}_${safeTitle}.mkv`;
    const tempPath = path.join(tempDir, tempFilename);
    const hasCookies = fs.existsSync(COOKIE_PATH);

    console.log(`[V4 Download] ${url} [${quality}] (Auth: ${hasCookies})`);

    // 1. Format Selection (Relaxed Strict)
    // We use <= to catch "Best available up to X". 
    // e.g. If 1080p is missing but 720p exists, 1080p request will get 720p instead of crashing.
    let formatArg = 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4] / bv*+ba/b';

    // Use <= to be safe. "Strict" meant "Don't fall back to 144p", not "Fail if pixel exact match missing"
    if (quality === '1080p') formatArg = 'bv*[height<=1080]+ba/b';
    else if (quality === '720p') formatArg = 'bv*[height<=720]+ba/b';
    else if (quality === '480p') formatArg = 'bv*[height<=480]+ba/b';
    else if (quality === 'audio') formatArg = 'ba';

    // 2. Build Args
    const args = [
        url,
        '-f', formatArg,
        '--merge-output-format', 'mkv',
        '-o', tempPath,
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--ffmpeg-location', ffmpegPath,
        '--verbose'
    ];

    // V4.1 FORCE TV CLIENT + OAUTH2
    // We must explicitly tell yt-dlp to use the "oauth2" account we authenticated with.
    // Otherwise it acts as a Guest TV and gets blocked.
    args.push('--extractor-args', 'youtube:player_client=tv');
    args.push('--username', 'oauth2');
    args.push('--password', '');

    if (hasCookies) {
        args.push('--cookies', COOKIE_PATH);
    }
    // implicitly uses ~/.cache/yt-dlp for OAuth tokens if no cookies file

    // 3. Execute
    try {
        console.log(`[V4 Exec] yt-dlp ${args.join(' ')}`); // Log command for debug
        const process = spawn('yt-dlp', args);
        let errorLog = '';

        process.stderr.on('data', d => errorLog += d.toString());

        process.on('close', code => {
            if (code !== 0) {
                console.error(`[Download Fail] Code: ${code}`);
                // Sanitize log
                const safeLog = errorLog.slice(-1000).replace(/\n/g, ' ');
                return res.status(500).send(`Server Error: ${safeLog}`);
            }

            if (!fs.existsSync(tempPath)) return res.status(500).send('File missing after download');

            res.download(tempPath, `${safeTitle}.mkv`, err => {
                if (err) console.error('Send Error', err);
                fs.unlink(tempPath, () => { });
            });
        });

    } catch (e) {
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Phoenix V4 Engine running on ${PORT}`);
    console.log(`FFmpeg: ${ffmpegPath}`);
});
