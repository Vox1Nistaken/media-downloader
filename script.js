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
            // Shuffle instances for load balancing
            const shuffledInstances = [...cobaltInstances].sort(() => 0.5 - Math.random());
            let success = false;
            let finalData = null;
            let errors = [];

            // Try instances one by one
            for (const instance of shuffledInstances) {
                try {
                    console.log(`Trying: ${instance.url}`);
                    const apiTarget = `${instance.url}${instance.endpoint}`;

                    const response = await fetch(apiTarget, {
                        method: 'POST',
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            url: url,
                            vCodec: 'h264',
                            vQuality: 'max',
                            aFormat: 'mp3',
                            filenamePattern: 'basic'
                        })
                    });

                    const data = await response.json();

                    if (data && (data.url || data.picker || data.audio)) {
                        console.log('Success via:', instance.url);
                        success = true;

                        // Normalize data structure for UI
                        finalData = {
                            platform: 'Social Media (Detected)',
                            title: 'Media Download',
                            thumbnail: 'https://placehold.co/600x400/000000/FFF?text=Media+Found', // Default placebo
                            formats: []
                        };

                        if (data.picker) {
                            finalData.formats = data.picker.map(p => ({
                                quality: p.type === 'video' ? 'Best Video' : 'Audio',
                                itag: 'cobalt',
                                container: 'mp4',
                                url: p.url,
                                type: p.type
                            }));
                        } else if (data.url) {
                            finalData.formats.push({
                                quality: 'Best Available',
                                itag: 'cobalt',
                                container: 'mp4',
                                url: data.url,
                                type: 'video'
                            });
                        } else if (data.audio) {
                            finalData.formats.push({
                                quality: 'Audio Only',
                                itag: 'cobalt_audio',
                                container: 'mp3',
                                url: data.audio,
                                type: 'audio'
                            });
                        }

                        // Try to fetch real title/thumb if available (rare in Cobalt simplified, but sometimes present)
                        // Cobalt often doesn't return metadata unless requested differently, 
                        // but let's stick to simple download first.
                        break; // Stop loop on success
                    } else {
                        throw new Error(`Invalid response key from ${instance.url}`);
                    }

                } catch (e) {
                    console.warn(`Failed ${instance.url}:`, e);
                    errors.push(e.message);
                }
            }

            if (!success || !finalData) {
                throw new Error('All download servers failed. Please try again later. Details: ' + errors.slice(0, 3).join(', '));
            }

            // Show Result
            showResult(finalData);

        } catch (error) {
            console.error('Download Logic Error:', error);
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
