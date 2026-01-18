const express = require('express');
const cors = require('cors');
const instagramDl = require('instagram-url-direct');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
}

// Path to yt-dlp
const isWin = process.platform === 'win32';
const ytDlpPath = path.join(__dirname, isWin ? 'yt-dlp.exe' : 'yt-dlp');

// Stats
const stats = {
    totalDownloads: 0,
    recentRequests: []
};

function logRequest(url, type, status) {
    stats.totalDownloads++;
    stats.recentRequests.unshift({
        timestamp: new Date(),
        url: url.substring(0, 50) + '...',
        type: type || 'video',
        status: status
    });
    if (stats.recentRequests.length > 50) stats.recentRequests.pop();
}

// Helper: Run yt-dlp command
function runYtDlp(args) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(ytDlpPath)) {
            return reject(new Error('yt-dlp.exe Not Found! Please restart server.'));
        }

        // Force IPv4 to avoid common YouTube blocks on IPv6
        const enhancedArgs = ['--force-ipv4', ...args];
        console.log('Running yt-dlp:', enhancedArgs.join(' '));

        const process = spawn(ytDlpPath, enhancedArgs);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
            console.log('yt-dlp out:', data.toString());
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            console.error('yt-dlp err:', data.toString());
            stderr += data.toString();
        });

        process.on('close', (code) => {
            if (code !== 0) {
                console.error(`yt-dlp Error (Code ${code}):`, stderr);
                // Only resolve if we really have a JSON-like stdout despite error (warnings)
                if (stdout && stdout.trim().length > 0 && stdout.trim() !== 'null') {
                    console.warn('Resolving stdout despite non-zero exit code:', code);
                    resolve(stdout);
                } else {
                    reject(new Error(`yt-dlp failed (code ${code}): ${stderr || 'Unknown error'}`));
                }
            } else {
                resolve(stdout);
            }
        });
    });
}

// Helper: Parse formats for UI
function parseFormats(formats, platform) {
    // 1. Sort by quality (height) descending
    formats.sort((a, b) => (b.height || 0) - (a.height || 0));

    const clean = [];
    const seenQualities = new Set();

    // 2. Pre-define common qualities we want to show
    const targetQualities = [2160, 1440, 1080, 720, 480, 360];

    // 3. Audio Option (Always add if available)
    if (formats.some(f => f.vcodec === 'none' && f.acodec !== 'none')) {
        clean.push({
            quality: 'Audio Only',
            itag: 'audio',
            container: 'mp3',
            type: 'audio'
        });
    }

    // 4. Video Options
    if (platform === 'YouTube') {
        // For YouTube, we synthesize options based on resolution because we merge video+audio later
        for (const q of targetQualities) {
            // Check if there is ANY video stream with at least this resolution
            const hasQuality = formats.some(f => f.height && f.height >= q);
            if (hasQuality && !seenQualities.has(q)) {
                clean.push({
                    quality: `${q}p ${q >= 2160 ? '(4K)' : q === 1440 ? '(2K)' : '(HD)'}`,
                    itag: `res:${q}`, // Special format ID for our downloader logic
                    container: 'mp4',
                    height: q,
                    type: 'video'
                });
                seenQualities.add(q);
            }
        }
        // Add "Best Available" if not empty
        if (clean.length > 0 && !seenQualities.has('best')) {
            clean.unshift({
                quality: 'Best Available (Max)',
                itag: 'best',
                container: 'mp4',
                type: 'video'
            });
        }

    } else {
        // For other platforms, stick to raw formats but relax filters
        const valid = formats.filter(f => f.vcodec !== 'none' || f.acodec !== 'none');
        for (const f of valid) {
            let label = f.format_note || (f.height ? `${f.height}p` : 'Unknown');
            if (f.vcodec === 'none') continue; // Skip audio-only here (added above)

            // dedupe roughly
            const key = label + f.ext;
            if (!seenQualities.has(key)) {
                seenQualities.add(key);
                clean.push({
                    quality: label,
                    itag: f.format_id,
                    container: f.ext,
                    height: f.height,
                    type: 'video'
                });
            }
        }
    }

    return clean;
}

// API: Get Info
app.post('/api/info', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'URL is required' });

        // Platform Detection
        let platform = 'Unknown';
        if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'YouTube';
        else if (url.includes('tiktok.com')) platform = 'TikTok';
        else if (url.includes('facebook.com') || url.includes('fb.watch')) platform = 'Facebook';
        else if (url.includes('instagram.com')) platform = 'Instagram';
        else if (url.includes('twitter.com') || url.includes('x.com')) platform = 'Twitter';

        // Run yt-dlp
        // Specific args for robustness
        const args = [
            '--dump-single-json',
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats',
            '--geo-bypass',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            url
        ];

        const outputJSON = await runYtDlp(args);
        const output = JSON.parse(outputJSON);

        if (!output) {
            console.error('yt-dlp returned null. Raw:', outputJSON);
            throw new Error("yt-dlp returned null JSON. Raw length: " + outputJSON.length);
        }

        // Fallback for missing formats
        if (!output.formats) {
            console.error('No formats found in output:', JSON.stringify(output, null, 2));
            if (output.url) {
                output.formats = [{ format_id: 'default', url: output.url, ext: output.ext || 'mp4', height: 0 }];
            } else {
                throw new Error(`No formats found. Video ID: ${output.id || 'N/A'}`);
            }
        }

        const formats = parseFormats(output.formats, platform);

        return res.json({
            platform: platform,
            title: output.title,
            thumbnail: output.thumbnail,
            formats: formats
        });

    } catch (error) {
        console.error('Info Error:', error);
        res.status(500).json({ error: 'Failed to fetch info. ' + error.message });
    }
});

// API: Download
app.get('/api/download', async (req, res) => {
    const reqId = Date.now() + Math.floor(Math.random() * 1000);

    try {
        const { url, itag, title } = req.query;
        if (!url) return res.status(400).send('URL required');

        const isAudio = req.query.type === 'audio';

        const safeTitle = (title || 'video').replace(/[^a-zA-Z0-9 \-_]/g, "").trim();
        const cleanTitle = safeTitle || `download-${reqId}`;

        logRequest(url, req.query.type, 'Processing');

        if (itag === 'ig') {
            const result = await instagramDl(url);
            if (result.url_list && result.url_list.length > 0) return res.redirect(result.url_list[0]);
            return res.status(404).send('Media not found');
        }

        // Common Args
        const args = [
            '--no-check-certificates',
            '--no-warnings',
            '--geo-bypass',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--ffmpeg-location', ffmpegPath,
            '--output', path.join(tempDir, `download-${reqId}.%(ext)s`),
            url
        ];

        // Format Selection Logic
        if (isAudio || itag === 'audio') {
            args.push('--extract-audio');
            args.push('--audio-format', 'mp3');
        } else {
            // YouTube Resolution based selection
            if (itag && itag.startsWith('res:')) {
                const height = itag.split(':')[1];
                // Download best video with height <= requested + best audio, OR best fallback
                args.push('-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`);
                args.push('--merge-output-format', 'mp4');
            }
            // "Best" selection
            else if (itag === 'best') {
                args.push('-f', `bestvideo+bestaudio/best`);
                args.push('--merge-output-format', 'mp4');
            }
            // Raw itag (other platforms or specific IDs)
            else if (itag && itag !== 'undefined' && itag !== 'null') {
                args.push('-f', `${itag}+bestaudio/best`);
                args.push('--merge-output-format', 'mp4');
            }
            // Default fallback
            else {
                args.push('-f', `bestvideo+bestaudio/best`);
                args.push('--merge-output-format', 'mp4');
            }
        }

        await runYtDlp(args);

        let actualFile = '';
        const files = fs.readdirSync(tempDir);
        for (const f of files) {
            // Find the file starting with our ID
            if (f.startsWith(`download-${reqId}`)) {
                actualFile = path.join(tempDir, f);
                break;
            }
        }

        if (actualFile && fs.existsSync(actualFile)) {
            const ext = (isAudio || itag === 'audio') ? "mp3" : "mp4";
            const downloadFilename = `${cleanTitle}.${ext}`;

            res.download(actualFile, downloadFilename, (err) => {
                try { fs.unlinkSync(actualFile); } catch (e) { }
                logRequest(url, req.query.type, 'Success');
            });
        } else {
            // Fallback: Sometimes merger fails and leaves .mkv or .webm, try finding any file with that ID
            throw new Error('Output file not found. Download might have failed or file format issue.');
        }

    } catch (error) {
        logRequest('Error', 'N/A', 'Failed');
        if (!res.headersSent) res.status(500).send(`Download failed: ${error.message}`);
    }
});

app.get('/api/stats', (req, res) => res.json(stats));
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log('Server Updated: v1.1 (Fixes applied)');
});
