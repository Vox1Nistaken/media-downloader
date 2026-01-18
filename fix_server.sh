#!/bin/bash
echo "🚀 Starting Ultimate Fix..."

# 1. Update System & Install FFmpeg (Critical for 1080p/4K)
echo "📦 Installing FFmpeg..."
sudo apt-get update
sudo apt-get install -y ffmpeg python3 python-is-python3

# 2. Update yt-dlp to latest
echo "📥 Updating yt-dlp..."
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp

# 3. Create Temp Directory with permissions
echo "📂 Fixing Permissions..."
mkdir -p /var/www/media-downloader/temp
chmod 777 /var/www/media-downloader/temp

# 4. Pull latest code
echo "⬇️ Pulling latest code..."
cd /var/www/media-downloader
git pull

# 5. Restart Server
echo "Fg Restarting Server..."
pm2 restart downloader

echo "✅ DONE! Try downloading now."
