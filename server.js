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
                args.extractorArgs = 'youtube:player_client=tv';
            } else {
                args.extractorArgs = 'youtube:player_client=android'; // For info fetching, Android is still okay usually
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

// --- API: DOWNLOAD (Strict Mode) ---
app.get('/api/download', async (req, res) => {
    const { url, quality, title } = req.query;
    if (!url) return res.status(400).send('URL required');

    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const hasCookies = fs.existsSync(COOKIE_PATH);

    console.log(`[V4 Download] ${url} [${quality}] (Auth: ${hasCookies})`);

    // V5.1: ROBUST QUALITY SORTING (Fix for "144p stuck" issue)
    // The previous 'android' spoofing constrained us to legacy streams (144p).
    // The previous format selection fell back to '/best' (video) even for audio.

    // We clear 'formatArg' defaults and use '-S' (Sorting) or specific '-f' logic.
    const tempFilename = `${Date.now()}_${safeTitle}.mp4`; // Ext is .mp4 now
    const tempPath = path.join(tempDir, tempFilename);

    const args = [
        url,
        '--merge-output-format', 'mp4',
        '-o', tempPath,
        '--no-playlist',
        '--no-check-certificates',
        '--force-ipv4',
        '--ffmpeg-location', ffmpegPath,
        '--verbose',
        '--no-input', // Prevent hanging on prompts
        // V6.5 PERFORMANCE TUNING
        '-N', '4', // Reduced from 8 to 4 for better stability
        '--buffer-size', '16M'
    ];

    // QUALITY LOGIC
    if (quality === 'audio') {
        // STRICT AUDIO: No fallback to video.
        args.push('-f', 'bestaudio[ext=m4a]/bestaudio');
    } else {
        // VIDEO LOGIC: Use Sorting (-S) instead of strict format strings.
        // This tells yt-dlp: "Give me the best video closer to this res, standard codec."
        // res:1080 means "Best resolution, capped at 1080" roughly, but we force limits.

        let resLimit = 'res:1080';
        if (quality === 'highest') resLimit = 'res:1440'; // 2K
        if (quality === '720p') resLimit = 'res:720';

        // "vcodec:h264" ensures MP4 compatibility. "+acodec:m4a" ensures good audio.
        args.push('-S', `${resLimit},vcodec:h264,acodec:m4a`);

        // Also strictly cap height to avoid mistakes if sorting fails
        // CLIENT STRATEGY: DYNAMIC
        // We only apply YouTube-specific 'player_client' args if the URL is actually YouTube.
        // For TikTok, IG, FB, etc., we let yt-dlp use its default extractors.
        const isYoutube = url.includes('youtube.com') || url.includes('youtu.be');

        if (isYoutube) {
            if (hasCookies) {
                args.push('--cookies', COOKIE_PATH);
                args.push('--extractor-args', 'youtube:player_client=tv');
            } else {
                // Guest YT: Default Web client is safest now.
            }
        } else {
            // Other Platforms (TikTok, IG, Twitter, FB)
            // Usually don't need cookies or specific clients, but if 'cookies.txt' contains them, passing it is fine.
            if (hasCookies) args.push('--cookies', COOKIE_PATH);

            // V6.3: MOBILE SPOOFING FOR DOWNLOADS
            args.push('--user-agent', 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36');
        }
    }

    // Resilience Flags
    args.push('--ignore-errors'); // Don't crash on minor playlist/subs errors
    args.push('--no-warnings');

    // 3. Execute
    try {
        console.log(`[V4 Exec] yt-dlp ${args.join(' ')}`); // Log command for debug
        const process = spawn('yt-dlp', args);
        let errorLog = '';

        process.stderr.on('data', d => errorLog += d.toString());

        process.on('close', code => {
            if (code !== 0) {
                // ANALYZE ERROR - Graceful Degradation
                const err = errorLog.toLowerCase();

                if (err.includes('sign in') || err.includes('login required') || err.includes('content is not available')) {
                    console.warn(`[Restricted] Video requires auth: ${url}`);
                    return res.status(403).json({ error: 'RESTRICTED_CONTENT' });
                }

                // Genuine Failure
                console.error(`[Download Fail] Code: ${code}`);
                const safeLog = errorLog.slice(-500).replace(/\n/g, ' ');
                return res.status(500).send(`Server Error: ${safeLog}`);
            }

            if (!fs.existsSync(tempPath)) return res.status(500).send('File missing after download');

            res.download(tempPath, `${safeTitle}.mp4`, err => {
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
