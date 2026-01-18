# Google Cloud VPS Kurulum Rehberi

Bu komutları Google Cloud terminaline (SSH penceresi) sırasıyla kopyalayıp yapıştırın. Bu komutlar sunucunuzu video indirme makinesine dönüştürecek.

## 1. Yönetici Hesabına Geçiş ve Güncelleme
Önce sistemi güncelleyelim.
```bash
sudo -i
apt-get update && apt-get upgrade -y
```

## 2. Gerekli Araçların Kurulumu (yt-dlp, python, ffmpeg)
Video indirme motorunu ve yardımcılarını kuralım.
```bash
apt-get install -y python3 python3-pip ffmpeg git unzip curl
```

`yt-dlp`'yi (motoru) en güncel haliyle kuralım:
```bash
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp
```

## 3. Node.js Kurulumu (Web Sunucusu)
Sitenizin çalışması için Node.js kuralım.
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

## 4. Projenin Kurulumu
Şimdi projenizi sunucuya çekelim (GitHub'dan).
*(Aşağıdaki `[GITHUB_LINKINIZ]` kısmına kendi repo adresinizi yazacaksınız. Eğer repo özel (private) ise token gerekebilir, açıksa direkt çalışır.)*
```bash
# Örnek klasör oluştur
mkdir -p /var/www/media-downloader
cd /var/www/media-downloader

# Dosyaları çek (Burayı kendi reponuzla değiştirin!)
# Örneğin: git clone https://github.com/kullaniciadi/proje.git .
# Şimdilik dosyaları elle oluşturacağınızı varsayalım veya git clone yapın.
```

Eğer Git ile uğraşmak istemiyorsanız, dosyaları manuel yüklemek için basit bir yöntem:
*   Bilgisayarınızdaki `package.json` ve `server.js` içeriğini kopyalayın.
*   Terminalde `nano package.json` yazın, yapıştırın, `CTRL+X -> Y -> Enter` ile kaydedin.
*   Aynısını `nano server.js` için yapın.

## 5. Başlatma
Proje klasöründeyken (`/var/www/media-downloader`):
```bash
npm install
npm install -g pm2
pm2 start server.js --name "downloader"
pm2 save
pm2 startup
```

Artık siteniz `http://[SUNUCU_IP_ADRESI]:3000` adresinde çalışıyor olacak!
