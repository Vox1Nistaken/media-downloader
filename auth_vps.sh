#!/bin/bash
echo "🔐 MEDIA DOWNLOADER AUTHENTICATION WIZARD"
echo "=========================================="
echo "Use this to link your VPS to a Google Account."
echo "This solves 'Sign in to confirm you are not a bot' errors."
echo ""
echo "INSTRUCTIONS:"
echo "1. The script will show a CODE (e.g., ABCD-EFGH)."
echo "2. It will tell you to go to https://www.google.com/device"
echo "3. Go there on your PHONE or PC, enter the code."
echo "4. Allow access."
echo "5. Come back here and waiting will finish."
echo ""
echo "⚠️  Starting Auth Process..."

# Ensure we use the global yt-dlp we installed
/usr/local/bin/yt-dlp --username oauth2 --password '' --extractor-args 'youtube:player_client=tv' https://www.youtube.com/watch?v=dQw4w9WgXcQ 

echo ""
echo "✅ Authentication Complete!"
echo "Assuming you approved the request, the credentials are now cached."
echo "Restarting server to apply..."
pm2 restart downloader
echo "🚀 Server Restarted. Try downloading now."
