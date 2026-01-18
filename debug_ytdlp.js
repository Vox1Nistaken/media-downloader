const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ytDlpPath = path.join(__dirname, 'yt-dlp.exe');
const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // Rick Roll as test

if (!fs.existsSync(ytDlpPath)) {
    console.error('yt-dlp.exe not found!');
    process.exit(1);
}

console.log('Running yt-dlp...');
const args = [
    '--dump-single-json',
    '--no-check-certificates',
    '--no-warnings',
    '--prefer-free-formats',
    '--geo-bypass',
    '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    url
];

const proc = spawn(ytDlpPath, args);
let stdout = '';
let stderr = '';

proc.stdout.on('data', (data) => stdout += data.toString());
proc.stderr.on('data', (data) => stderr += data.toString());

proc.on('close', (code) => {
    console.log(`Exit code: ${code}`);
    if (stderr) console.log('STDERR:', stderr);
    console.log('STDOUT Length:', stdout.length);
    if (stdout.length < 500) console.log('STDOUT Preview:', stdout);

    try {
        const json = JSON.parse(stdout);
        console.log('JSON Parse Success');
        console.log('Title:', json.title);
        console.log('Formats count:', json.formats ? json.formats.length : 'Missing');
    } catch (e) {
        console.error('JSON Parse Failed:', e.message);
        console.log('Raw output meant for JSON:', stdout);
    }
});
