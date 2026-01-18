#!/bin/bash
echo "🚀 INITIATING PROJECT PHOENIX (V4) DEPLOYMENT..."

# 1. Stop Server
pm2 stop all || true

# 2. Upgrade Dependencies
echo "📦 Installing V4 Engines..."
rm -rf node_modules
npm install

# 3. Start Server
echo "🔥 Starting V4 Server..."
pm2 restart server.js --name downloader --update-env

echo "✅ V4 DEPLOYED SUCCESSFULLY."
echo "------------------------------------------------"
echo "⚠️  CRITICAL STEP: AUTHENTICATION"
echo "To unlock 4K downloads, we must link this server to YouTube."
echo "Starting Auth Wizard now..."
echo "------------------------------------------------"
sleep 2

./auth_vps.sh
