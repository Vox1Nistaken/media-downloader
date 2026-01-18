document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('urlInput');
    const pasteBtn = document.getElementById('pasteBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const formatRadios = document.getElementsByName('format');
    const qualityGroup = document.getElementById('qualityGroup');
    const resultArea = document.getElementById('resultArea');

    // Platform Logic
    const platformBtns = document.querySelectorAll('.platform-btn');
    const heroTitle = document.querySelector('.hero h1');
    let currentPlatform = 'youtube';

    const platformConfig = {
        youtube: {
            title: 'YouTube <span class="gradient-text">Downloader</span>',
            placeholder: 'Paste YouTube video link here...',
            color: '#ff0000'
        },
        tiktok: {
            title: 'TikTok <span class="gradient-text">No Watermark</span>',
            placeholder: 'Paste TikTok video link here...',
            color: '#00f2ea'
        },
        instagram: {
            title: 'Instagram <span class="gradient-text">Reels & Video</span>',
            placeholder: 'Paste Instagram link here...',
            color: '#bc2a8d'
        },
        facebook: {
            title: 'Facebook <span class="gradient-text">Video HD</span>',
            placeholder: 'Paste Facebook video link here...',
            color: '#1877f2'
        },
        twitter: {
            title: 'X (Twitter) <span class="gradient-text">Video</span>',
            placeholder: 'Paste X / Twitter link here...',
            color: '#000000'
        }
    };

    platformBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            platformBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            currentPlatform = btn.dataset.platform;
            const config = platformConfig[currentPlatform];

            heroTitle.innerHTML = config.title;
            urlInput.placeholder = config.placeholder;
        });
    });

    // Paste
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            alert('Please allow clipboard access or paste manually.');
        }
    });

    // Toggle Quality
    formatRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'audio') {
                qualityGroup.style.opacity = '0.5';
                qualityGroup.style.pointerEvents = 'none';
            } else {
                qualityGroup.style.opacity = '1';
                qualityGroup.style.pointerEvents = 'all';
            }
        });
    });

    // List of Cobalt instances to try (Client-Side)
    const cobaltInstances = [
        { url: 'https://api.cobalt.tools', endpoint: '/' }, // Official (strict)
        { url: 'https://cobalt.154.53.56.156.nip.io', endpoint: '/api/json' },
        { url: 'https://cobalt.dani.guru', endpoint: '/api/json' },
        { url: 'https://cobalt.nao.2020.day', endpoint: '/api/json' },
        { url: 'https://dl.khub.win', endpoint: '/api/json' },
        { url: 'https://cobalt.q13.sbs', endpoint: '/api/json' },
        { url: 'https://c.haber.lol', endpoint: '/api/json' },
        { url: 'https://cobalt.kwiatekmiki.pl', endpoint: '/api/json' },
        { url: 'https://api.cobalt.best', endpoint: '/' },
        { url: 'https://co.wuk.sh', endpoint: '/api/json' },
        { url: 'https://cobalt.publications.wiki', endpoint: '/api/json' },
        { url: 'https://cobalt-api.kwiatekmiki.pl', endpoint: '/api/json' }
    ];

    // Download Button
    downloadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please enter a valid URL');
            return;
        }

        startLoading();

        try {
            const response = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const errorMessage = errorData.error || errorData.details || 'API Request Failed';
                throw new Error(errorMessage);
            }

            const data = await response.json();
            showResult(data);

        } catch (error) {
            console.error('Fetch Error Details:', error);
            alert('Error: ' + error.message);
        } finally {
            stopLoading();
        }
    });

    function startLoading() {
        downloadBtn.classList.add('processing');
        downloadBtn.disabled = true;
        resultArea.classList.add('hidden');
        resultArea.innerHTML = '';

        const processingMsg = document.createElement('div');
        processingMsg.id = 'processingMsg';
        processingMsg.style.textAlign = 'center';
        processingMsg.style.marginTop = '1rem';
        processingMsg.style.color = '#e2e8f0';
        processingMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching best server...';
        document.querySelector('.downloader-card').appendChild(processingMsg);
    }

    function stopLoading() {
        downloadBtn.classList.remove('processing');
        downloadBtn.disabled = false;
        const msg = document.getElementById('processingMsg');
        if (msg) msg.remove();
    }

    function showResult(data) {
        resultArea.classList.remove('hidden');

        // Simple single result for now (since we bypassed backend detailed parsing)
        const format = data.formats[0];
        const downloadLink = format.url;

        // Since we don't have detailed metadata from Cobalt easily without backend scraping,
        // We show a generic "Download Ready" card.

        resultArea.innerHTML = `
            <div style="text-align: center; margin-top: 2rem; color: #fff;">
                <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">${data.title}</h3>
                <div style="background: rgba(255,255,255,0.05); padding: 20px; border-radius: 10px; margin-bottom: 1rem;">
                    <i class="fa-solid fa-circle-check" style="font-size: 3rem; color: #4ade80; margin-bottom: 10px;"></i>
                    <p>Media found successfully via public cloud.</p>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    ${data.formats.map(f => `
                        <a href="${f.url}" target="_blank" class="primary-btn" style="display: inline-block; width: auto; padding: 0.8rem 1.5rem; text-decoration: none; font-size: 0.9rem;">
                            <i class="fa-solid fa-download"></i> Download ${f.quality}
                        </a>
                    `).join('')}
                </div>
            </div>
        `;

        // Hide standard quality selector as we render buttons dynamically now
        // Or keep it if we map it back. Buttons are easier for this direct mode.
    }

    // Support Modal Logic
    const modal = document.getElementById('supportModal');
    const openBtn = document.querySelector('.support-btn');
    const closeBtn = document.querySelector('.close-modal');
    const copyBtcBtn = document.getElementById('copyBtcBtn');
    const btcInput = document.getElementById('btcAddress');

    if (openBtn && modal) {
        openBtn.addEventListener('click', (e) => {
            e.preventDefault();
            modal.classList.add('show');
            modal.classList.remove('hidden');
        });

        closeBtn.addEventListener('click', () => {
            modal.classList.remove('show');
            setTimeout(() => modal.classList.add('hidden'), 300); // Wait for transition
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                setTimeout(() => modal.classList.add('hidden'), 300);
            }
        });

        // Copy Feature
        if (copyBtcBtn && btcInput) {
            copyBtcBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(btcInput.value);
                    const originalIcon = copyBtcBtn.innerHTML;
                    copyBtcBtn.innerHTML = '<i class="fa-solid fa-check" style="color: #4ade80;"></i>';
                    setTimeout(() => {
                        copyBtcBtn.innerHTML = originalIcon;
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy', err);
                }
            });
        }
    }
});
