document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const urlInput = document.getElementById('urlInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const resultArea = document.getElementById('resultArea');
    const statusMsg = document.getElementById('statusMsg');
    const statusBar = document.getElementById('statusBar');
    const qualitySelect = document.getElementById('qualitySelect');

    // --- 1. HEALTH CHECK ---
    checkSystemHealth();
    async function checkSystemHealth() {
        try {
            statusBar.classList.remove('hidden');
            const res = await fetch('/api/health');
            const data = await res.json();

            // FFmpeg Status
            const engineSpan = document.getElementById('engineStatus');
            if (data.ffmpeg === 'ready') {
                engineSpan.textContent = 'Ready (V3.1)';
                engineSpan.className = 'ok';
            } else {
                engineSpan.textContent = 'Missing!';
                engineSpan.className = 'err';
                showError('CRITICAL: Backend engine missing. Contact Admin.');
            }

            // Auth Status
            const authSpan = document.getElementById('authStatus');
            if (data.auth === 'active') {
                authSpan.textContent = 'Active (4K Ready)';
                authSpan.className = 'ok';
            } else {
                authSpan.textContent = 'Guest (Limited)';
                authSpan.className = '';
            }

        } catch (e) {
            console.error('Health check failed', e);
            document.getElementById('engineStatus').textContent = 'Offline';
            document.getElementById('engineStatus').className = 'err';
        }
    }

    // --- 2. PASTE ---
    const pasteBtn = document.getElementById('pasteBtn');
    if (pasteBtn) {
        pasteBtn.onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                urlInput.value = text;
            } catch (e) { }
        };
    }

    // --- 3. DOWNLOAD FLOW ---
    downloadBtn.onclick = async () => {
        const url = urlInput.value.trim();
        if (!url) return showError('Please enter a valid URL');

        setLoading(true);
        resultArea.classList.add('hidden');
        statusMsg.classList.add('hidden');

        try {
            // A. Analyze Video
            const res = await fetch('/api/info', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!res.ok) throw new Error((await res.json()).error || 'Fetch failed');
            const data = await res.json();

            // B. Show Result
            renderResult(data);

        } catch (error) {
            showError(error.message);
        } finally {
            setLoading(false);
        }
    };

    function renderResult(data) {
        resultArea.classList.remove('hidden');

        const q = qualitySelect.value;
        const qLabel = qualitySelect.options[qualitySelect.selectedIndex].text;

        // Build Download Logic
        const dlUrl = `/api/download?url=${encodeURIComponent(data.originalUrl || urlInput.value)}&quality=${q}&title=${encodeURIComponent(data.title)}`;

        resultArea.innerHTML = `
            <img src="${data.thumbnail}" class="result-thumb" alt="thumb">
            <div class="result-info">
                <h3>${data.title}</h3>
                <p style="color:var(--text-muted); font-size:0.9rem;">
                    <i class="fa-regular fa-clock"></i> ${formatDuration(data.duration)} • 
                    Target: <span style="color:#00ff88">${qLabel}</span>
                </p>
                
                <button id="realDownloadBtn" class="dl-link primary-btn" style="text-align:center; margin-top:15px; width:auto; padding:10px 30px;">
                    <i class="fa-solid fa-download"></i> Download Now
                </button>
                <div id="dlStatus" class="status-msg hidden" style="margin-top:10px;"></div>
            </div>
        `;

        // Handle Real Download Click
        document.getElementById('realDownloadBtn').onclick = async () => {
            const btn = document.getElementById('realDownloadBtn');
            const status = document.getElementById('dlStatus');

            // DYNAMICALLY GET VALUE (Fixes the "Ignoring Selection" bug)
            const currentQ = qualitySelect.value;
            const dynamicDlUrl = `/api/download?url=${encodeURIComponent(data.originalUrl || urlInput.value)}&quality=${currentQ}&title=${encodeURIComponent(data.title)}`;

            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
            status.classList.add('hidden');

            try {
                // Check Access First
                const res = await fetch(dynamicDlUrl);

                if (res.status === 403) {
                    const json = await res.json();
                    if (json.error === 'RESTRICTED_CONTENT') {
                        status.textContent = '🔒 Restricted Video: YouTube blocked this request (Age/Region). Try Admin Cookies.';
                        status.className = 'status-msg error';
                        status.classList.remove('hidden');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-download"></i> Retry';
                        return;
                    }
                }

                if (!res.ok) throw new Error('Server Error');

                // Trigger Blob Download
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;

                // Adjust extension based on type
                let ext = 'mp4';
                if (currentQ === 'audio') ext = 'mp3'; // Hint for the filename (though server sends .mp4 container usually)

                a.download = `${data.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}.${ext}`;
                document.body.appendChild(a);
                a.click();
                a.remove();

                btn.innerHTML = '✅ Complete';
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-download"></i> Download Again';
                }, 3000);

            } catch (e) {
                console.error(e);
                status.textContent = 'Server Error: Check logs or try another video.';
                status.className = 'status-msg error';
                status.classList.remove('hidden');
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-download"></i> Retry';
            }
        };
    }

    // --- UTILITY FUNCTIONS ---
    function setLoading(bool) {
        const btn = downloadBtn;
        const txt = btn.querySelector('.btn-content');
        const loader = btn.querySelector('.loader');

        btn.disabled = bool;
        if (bool) {
            txt.classList.add('hidden');
            loader.classList.remove('hidden');
        } else {
            txt.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }

    function showError(msg) {
        statusMsg.textContent = msg;
        statusMsg.className = 'status-msg error';
        statusMsg.classList.remove('hidden');
    }

    function formatDuration(sec) {
        if (!sec) return '--:--';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // --- 4. ADMIN: COOKIE SAVE ---
    const saveCookiesBtn = document.getElementById('saveCookiesBtn');
    if (saveCookiesBtn) {
        saveCookiesBtn.onclick = async () => {
            const content = document.getElementById('cookieInput').value;
            const msg = document.getElementById('cookieMsg');

            if (content.length < 50) {
                msg.textContent = 'Error: Cookie content too short!';
                msg.style.color = 'red';
                return;
            }

            saveCookiesBtn.disabled = true;
            saveCookiesBtn.textContent = 'Saving...';

            try {
                const res = await fetch('/api/admin/cookies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cookies: content })
                });

                if (res.ok) {
                    msg.textContent = 'Saved!';
                    saveCookiesBtn.textContent = '✅ Success! Refreshing...';
                    setTimeout(() => location.reload(), 2000);
                } else {
                    throw new Error('Save failed');
                }
            } catch (e) {
                saveCookiesBtn.textContent = 'Error';
                msg.textContent = 'Failed to save.';
                msg.style.color = 'red';
            }
        };
    }
});
