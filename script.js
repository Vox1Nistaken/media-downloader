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

    // Download Button
    downloadBtn.addEventListener('click', async () => {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please enter a valid URL');
            return;
        }

        startLoading();

        try {
            const response = await fetch('http://localhost:3000/api/info', {
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

            if (data.platform === 'Unknown' && (!data.formats || data.formats.length === 0)) {
                alert('Platform not supported or video found.');
                return;
            }

            showResult(data);

        } catch (error) {
            console.error(error);
            alert(`Error: ${error.message}`);
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
        processingMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching Info...';
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

        let downloadLink = '#';
        let safeTitle = (data.title || 'video').replace(/[^a-zA-Z0-9 \-_]/g, "").substring(0, 50);
        const type = document.querySelector('input[name="format"]:checked').value;

        // Generic logic for ALL platforms
        if (data.formats && data.formats.length > 0) {
            const format = data.formats[0];
            downloadLink = `http://localhost:3000/api/download?url=${encodeURIComponent(urlInput.value)}&itag=${format.itag}&type=${type}&title=${encodeURIComponent(safeTitle)}`;

            // Dynamic Update
            setTimeout(() => {
                const qualitySelect = document.getElementById('qualitySelect');

                if (data.formats.length > 0) {
                    qualitySelect.innerHTML = '';
                    data.formats.forEach(f => {
                        if (f.height || f.quality.includes('p') || f.quality) {
                            const option = document.createElement('option');
                            option.value = f.itag;
                            option.text = `${f.quality} ${f.container ? '(' + f.container + ')' : ''}`;
                            qualitySelect.appendChild(option);
                        }
                    });

                    downloadLink = `http://localhost:3000/api/download?url=${encodeURIComponent(urlInput.value)}&itag=${data.formats[0].itag}&type=${type}&title=${encodeURIComponent(safeTitle)}`;
                    document.querySelector('#resultArea a.primary-btn').href = downloadLink;
                }

                qualitySelect.onchange = () => {
                    const selectedItag = qualitySelect.value;
                    const currentType = document.querySelector('input[name="format"]:checked').value;
                    const updatedLink = `http://localhost:3000/api/download?url=${encodeURIComponent(urlInput.value)}&itag=${selectedItag}&type=${currentType}&title=${encodeURIComponent(safeTitle)}`;
                    document.querySelector('#resultArea a.primary-btn').href = updatedLink;
                };
            }, 100);
        } else {
            alert('Video details found but no download formats available.');
        }

        resultArea.innerHTML = `
            <div style="text-align: center; margin-top: 2rem; color: #fff;">
                <h3 style="margin-bottom: 1rem; font-size: 1.2rem;">${data.title}</h3>
                <img src="${data.thumbnail}" alt="Thumbnail" style="width: 200px; border-radius: 10px; margin-bottom: 1rem; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                <p style="color: #94a3b8; margin-bottom: 1rem;">Platform: <span style="color: #a855f7; font-weight: bold;">${data.platform}</span></p>
                <a href="${downloadLink}" target="_blank" class="primary-btn" style="display: inline-block; width: auto; padding: 0.8rem 2rem; text-decoration: none;">Download Now</a>
            </div>
        `;
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
