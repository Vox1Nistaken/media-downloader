const express = require('express');
const cors = require('cors');
const instagramDl = require('instagram-url-direct');
const { downloadTiktok } = require('@mrnima/tiktok-downloader');
const { TwitterDL } = require('twitter-downloader');
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

// Path to binaries (Docker system installed)
const ytDlpPath = 'yt-dlp'; // System command
const ffmpegPath = 'ffmpeg'; // System command

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
        // Force IPv4 and non-interactive mode
        const enhancedArgs = ['--force-ipv4', '--no-interactive', ...args];
        console.log('Running yt-dlp:', enhancedArgs.join(' '));

        const process = spawn(ytDlpPath, enhancedArgs);
        let stdout = '';
        let stderr = '';

        // Timeout Logic (30 seconds)
        const timeout = setTimeout(() => {
            process.kill();
            reject(new Error('yt-dlp Timed Out (30s)'));
        }, 30000); // 30 seconds

        process.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        process.on('close', (code) => {
            clearTimeout(timeout);
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

        console.log(`Fetching info for ${platform}: ${url}`);

        // Specialized Handlers
        if (platform === 'TikTok') {
            try {
                const data = await downloadTiktok(url);
                if (data && data.status && data.result) {
                    const formats = [];
                    const r = data.result;

                    if (r.dl_link && r.dl_link.download_mp4_hd) {
                        formats.push({ quality: 'HD Video', itag: 'tiktok_hd', container: 'mp4', url: r.dl_link.download_mp4_hd });
                    }
                    if (r.dl_link && r.dl_link.download_mp4_1) {
                        formats.push({ quality: 'SD Video', itag: 'tiktok_sd', container: 'mp4', url: r.dl_link.download_mp4_1 });
                    }
                    if (r.dl_link && r.dl_link.download_mp3) {
                        formats.push({ quality: 'Audio', itag: 'tiktok_audio', container: 'mp3', url: r.dl_link.download_mp3 });
                    }

                    if (formats.length > 0) {
                        return res.json({
                            platform: 'TikTok',
                            title: r.title || 'TikTok Video',
                            thumbnail: r.image,
                            formats: formats
                        });
                    }
                }
            } catch (e) {
                console.error('TikTok lib failed, falling back to yt-dlp:', e.message);
            }
        }

        if (platform === 'Twitter') {
            try {
                const data = await TwitterDL(url);
                if (data && data.status === 'success' && data.result) {
                    const result = data.result;
                    const formats = [];

                    // Handle video
                    if (result.media && result.media.length > 0) {
                        result.media.forEach(m => {
                            if (m.type === 'video' && m.videos) {
                                m.videos.forEach(v => {
                                    formats.push({
                                        quality: v.quality || 'Unknown',
                                        itag: 'twitter_direct', // We might need to handle specific quality selection better
                                        container: 'mp4',
                                        url: v.url
                                    });
                                });
                            }
                        });
                    }

                    if (formats.length > 0) {
                        return res.json({
                            platform: 'Twitter',
                            title: result.description || 'Twitter Video',
                            thumbnail: result.media[0]?.cover || result.media[0]?.image,
                            formats: formats
                        });
                    }
                }
            } catch (e) {
                console.error('Twitter lib failed, falling back to yt-dlp:', e.message);
            }
        }

        // Standard logic (yt-dlp) for YouTube, FB, or fallback
        // Run yt-dlp
        // Specific args for robustness
        const args = [
            '--dump-single-json',
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats',
            '--geo-bypass',
            '--extractor-args', 'youtube:player_client=ios',
        ];

        // Cookies Support
        const localCookies = path.join(__dirname, 'cookies.txt');
        const renderCookies = '/etc/secrets/cookies.txt';

        if (fs.existsSync(localCookies)) {
            console.log('✅ Found local cookies.txt');
            args.push('--cookies', localCookies);
        } else if (fs.existsSync(renderCookies)) {
            console.log('✅ Found Render secret cookies.txt');
            args.push('--cookies', renderCookies);
        }

        // Add User-Agent
        args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        args.push(url);

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

        // Specialized Redirects
        if (itag === 'ig') {
            const result = await instagramDl(url);
            if (result.url_list && result.url_list.length > 0) return res.redirect(result.url_list[0]);
            return res.status(404).send('Media not found');
        }

        // TikTok Redirect
        if (itag && itag.startsWith('tiktok_')) {
            const data = await downloadTiktok(url);
            if (data && data.status && data.result && data.result.dl_link) {
                if (itag === 'tiktok_audio' && data.result.dl_link.download_mp3) return res.redirect(data.result.dl_link.download_mp3);
                if (itag === 'tiktok_hd' && data.result.dl_link.download_mp4_hd) return res.redirect(data.result.dl_link.download_mp4_hd);
                if (data.result.dl_link.download_mp4_1) return res.redirect(data.result.dl_link.download_mp4_1);
            }
        }

        // Twitter Redirect
        if (itag === 'twitter_direct') {
            // For simplicity, just re-fetch to get fresh link or use yt-dlp if simpler. 
            // Note: Twitter links expire. 
            const data = await TwitterDL(url);
            if (data && data.status === 'success' && data.result && data.result.media) {
                // Try to find the best quality or match
                const video = data.result.media.find(m => m.type === 'video');
                if (video && video.videos && video.videos.length > 0) {
                    // Sort by bitrate descending
                    video.videos.sort((a, b) => b.bitrate - a.bitrate);
                    return res.redirect(video.videos[0].url);
                }
            }
        }

        // Fallback to yt-dlp download mechanism
        // Common Args
        const args = [
            '--no-check-certificates',
            '--no-warnings',
            '--geo-bypass',
            '--extractor-args', 'youtube:player_client=ios',
            // '--ffmpeg-location', ffmpegPath, // Not needed if ffmpeg is in PATH
            '--output', path.join(tempDir, `download-${reqId}.%(ext)s`),
        ];

        // Cookies Support
        const localCookies = path.join(__dirname, 'cookies.txt');
        const renderCookies = '/etc/secrets/cookies.txt';
        if (fs.existsSync(localCookies)) {
            args.push('--cookies', localCookies);
        } else if (fs.existsSync(renderCookies)) {
            args.push('--cookies', renderCookies);
        }

        // Add User-Agent
        args.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        args.push(url);

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
            // Log directory contents to see what happened
            console.error(`Download failed. Temp dir contents:`, fs.readdirSync(tempDir));
            throw new Error('Output file not found. Download might have failed or file format issue.');
        }

    } catch (error) {
        logRequest('Error', 'N/A', 'Failed');
        if (!res.headersSent) res.status(500).send(`Download failed: ${error.message}`);
    }
});

app.get('/api/stats', (req, res) => res.json(stats));
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    console.log('Server Updated: v2.1 (Docker Fix + Error Handling)');
});

// Global Error Handlers to prevent crash
process.on('uncaughtException', (err) => {
    console.error('CRITICAL ERROR (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL ERROR (Unhandled Rejection):', reason);
});
