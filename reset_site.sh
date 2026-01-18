#!/bin/bash
echo "🔥 STARTING V3 FACTORY RESET..."
echo "This will delete old dependencies and install the new Bulletproof engine."

# 1. Stop Server
pm2 stop downloader || true

# 2. Clean Slate
echo "🧹 Cleaning old modules..."
rm -rf node_modules
rm package-lock.json

# 3. Install Dependencies (including ffmpeg-static)
echo "📦 Installing V3 Engine (This may take 1-2 minutes)..."
npm install

# 4. Permissions (Just in case)
chmod -R 777 temp

# 5. Restart
echo "🚀 Igniting V3 Engine..."
pm2 restart server.js --name downloader

echo "✅ DONE! V3 IS LIVE."
echo "Please refresh your browser (Ctrl+F5) and try downloading."
