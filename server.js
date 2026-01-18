const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ytDlp = require('yt-dlp-exec');

// --- V3 CORE: STATIC FFMPEG ENGINE ---
// This guarantees we have a working ffmpeg binary, regardless of VPS OS.
const ffmpegPath = require('ffmpeg-static');
console.log(`[V3 Engine] ffmpeg-static loaded at: ${ffmpegPath}`);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Temp Directory for High Quality Merge operations
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// --- API: Get Video Info ---
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL required' });

        console.log(`[Info] Fetching metadata for: ${url}`);

        const output = await ytDlp(url, {
            dumpSingleJson: true,
            noPlaylist: true,
            noCheckCertificates: true,
            noWarnings: true,
            preferFreeFormats: true,
            extractorArgs: 'youtube:player_client=android', // Spoof Android
            forceIpv4: true // Bypass 403
        });

        // Simplified Video/Audio mapping
        const formats = (output.formats || []).map(f => ({
            quality: f.format_note || f.resolution || 'unknown',
            ext: f.ext,
            url: f.url,
            hasAudio: f.acodec !== 'none',
            hasVideo: f.vcodec !== 'none'
        })).filter(f => f.url);

        return res.json({
            platform: 'yt-dlp',
            title: output.title,
            thumbnail: output.thumbnail,
            duration: output.duration,
            formats: formats,
            originalUrl: url
        });

    } catch (error) {
        console.error('[Yt-Dlp Error]:', error);
        res.status(500).json({ error: 'Failed to fetch media. ' + error.message });
    }
});

// --- API: High Quality Download (V3 Engine) ---
app.get('/api/download', async (req, res) => {
    const { url, quality, title } = req.query;
    if (!url) return res.status(400).send('URL required');

    console.log(`[Download] Starting V3 Task: ${url} [${quality}]`);

    // 1. Determine Format Strategy - STRICT MODE (No Fallbacks)
    // ChatGPT explanation was correct: We need 'bv*+ba' (Best Video + Best Audio) to get 4K/1080p.
    // We intentionally removed failure fallbacks to ensure we don't get 144p silently.
    let formatArg = 'bv*+ba/b';

    // Strict resolution filters
    if (quality === '1080p') formatArg = 'bv*[height=1080]+ba';
    else if (quality === '720p') formatArg = 'bv*[height=720]+ba';
    else if (quality === '480p') formatArg = 'bv*[height=480]+ba';
    else if (quality === 'audio') formatArg = 'ba/b';

    // 2. Output Path
    const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const tempFilename = `${Date.now()}_${safeTitle}.mkv`;
    const tempPath = path.join(tempDir, tempFilename);

    // Ensure Permissions on ffmpeg-static
    try { fs.chmodSync(ffmpegPath, '755'); } catch (e) { }

    // Check for cookies.txt
    const cookiePath = path.join(__dirname, 'cookies.txt');
    const hasCookies = fs.existsSync(cookiePath);
    if (hasCookies) console.log('[V3 Engine] Using cookies.txt for auth');

    // 3. Construct arguments for yt-dlp
    const args = [
        url,
        '-f', formatArg,
        '--merge-output-format', 'mkv',
        '-o', tempPath,
        '--no-playlist',
        '--no-check-certificates',
        '--extractor-args', 'youtube:player_client=tv',
        '--force-ipv4',
        '--ffmpeg-location', ffmpegPath,
        '--verbose'
    ];

    if (hasCookies) {
        args.push('--cookies', cookiePath);
    }
    // Note: If using OAuth2 cache, yt-dlp picks it up automatically from ~/.cache/yt-dlp
    // We don't need to pass an arg for that, just ensure the process has access.

    console.log(`[V3 Engine] Executing with format: ${formatArg}`);

    try {
        const process = spawn('yt-dlp', args);

        // Capture logs with timestamp
        let processLog = '';
        process.stderr.on('data', (d) => {
            const msg = d.toString();
            // console.log(msg); 
            processLog += msg;
        });

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`[V3 Error] Process exited with code ${code}`);
                // Return last 1500 chars of log to user
                const errDetails = processLog.slice(-1500).replace(/\n/g, ' ');
                return res.status(500).send(`Engine Error: ${errDetails}`);
            }

            if (!fs.existsSync(tempPath)) {
                return res.status(500).send('Error: Output file not found after download.');
            }

            console.log(`[V3 Success] Sending file: ${tempPath}`);
            res.download(tempPath, `${safeTitle}.mkv`, (err) => {
                if (err) console.error('Send Error:', err);
                // Cleanup
                fs.unlink(tempPath, (e) => { if (e) console.error('Cleanup Warning:', e); });
            });
        });

    } catch (err) {
        console.error('Spawn Error:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Start Server & Self-Test
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n=== MEDIA DOWNLOADER V3.1 ENGINE STARTED ===`);
    console.log(`Port: ${PORT}`);
    console.log(`FFmpeg Path: ${ffmpegPath}`);

    // Self-Test: Verification of FFmpeg
    try {
        const { execSync } = require('child_process');
        // Ensure executable
        try { fs.chmodSync(ffmpegPath, '755'); } catch (e) { }

        const version = execSync(`${ffmpegPath} -version`).toString().split('\n')[0];
        console.log(`✅ FFmpeg Verified: ${version}`);
    } catch (e) {
        console.error(`❌ FFmpeg Verification FAILED: ${e.message}`);
        console.error(`CRITICAL: High Quality merges will fail.`);
    }
    console.log(`============================================\n`);
});
