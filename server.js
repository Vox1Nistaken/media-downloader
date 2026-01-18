const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all routes (though we are mostly serving static files)
app.use(cors({ origin: '*' }));

// Serve static files from the current directory
app.use(express.static(path.join(__dirname, '/')));

// Catch-all route to serve index.html for SPA-like behavior (optional but good resilience)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Frontend Server running at http://0.0.0.0:${PORT}`);
});
