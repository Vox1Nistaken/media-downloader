const https = require('https');

const data = JSON.stringify({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    videoQuality: '720'
});

const options = {
    hostname: 'cobalt-backend.canine.tools',
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
};

const req = https.request(options, (res) => {
    console.log(`STATUS: ${res.statusCode}`);
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log('BODY:', body);
    });
});

req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
