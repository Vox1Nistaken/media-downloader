document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const urlInput = document.getElementById('urlInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const resultArea = document.getElementById('resultArea');
    const statusMsg = document.getElementById('statusMsg');
    const statusBar = document.getElementById('statusBar');
    const qualitySelect = document.getElementById('qualitySelect');

    // --- 1. HEALTH CHECK REMOVED ---
    // User requested to hide the "Engine/Auth" bar.
    // Logic is kept simple.

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

        // V6.4: INSTAGRAM BLOCK (User Request)
        if (url.includes('instagram.com')) {
            showError('⚠️ Service disabled upon request by Meta.');
            return;
        }

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
        // FIX: The native <select> is gone. We read the text from our custom dropdown UI.
        const qLabel = document.getElementById('selectedQualityText').textContent;

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

    // --- 3. COOKIES REMOVED (Admin Panel Hidden) ---
    // User requested to remove the UI. Logic requires manual server access if needed.
});

// --- CUSTOM DROPDOWN LOGIC ---
// Exposed to global scope for onclick events in HTML
window.toggleDropdown = function () {
    const dropdown = document.getElementById('customQualityDropdown');
    dropdown.classList.toggle('open');
};

window.selectQuality = function (value, text) {
    // 1. Update UI Text
    document.getElementById('selectedQualityText').textContent = text;

    // 2. Update Hidden Input Value (which the downloader reads)
    document.getElementById('qualitySelect').value = value;

    // 3. Update Active Styling
    const items = document.querySelectorAll('.dropdown-item');
    items.forEach(item => item.classList.remove('active'));
    event.target.classList.add('active');

    // 4. Close Dropdown
    document.getElementById('customQualityDropdown').classList.remove('open');
};

// Close dropdown if clicking outside
window.onclick = function (event) {
    if (!event.target.closest('.custom-dropdown')) {
        const dropdown = document.getElementById('customQualityDropdown');
        if (dropdown && dropdown.classList.contains('open')) {
            dropdown.classList.remove('open');
        }
    }
};

// V6.4: INSTAGRAM ICON HANDLER
// When user clicks the Instagram icon, show the warning.
document.addEventListener('DOMContentLoaded', () => {
    const igIcon = document.querySelector('.fa-instagram');
    if (igIcon) {
        igIcon.style.cursor = 'pointer'; // Make it look clickable
        igIcon.onclick = () => {
            const statusMsg = document.getElementById('statusMsg');
            statusMsg.textContent = '⚠️ Service disabled upon request by Meta.';
            statusMsg.className = 'status-msg error';
            statusMsg.classList.remove('hidden');

            // Auto-hide after 3s
            setTimeout(() => {
                statusMsg.classList.add('hidden');
            }, 3000);
        };
    }
});
