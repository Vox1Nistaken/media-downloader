document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const urlInput = document.getElementById('urlInput');
    const downloadBtn = document.getElementById('downloadBtn');
    const resultArea = document.getElementById('resultArea');
    const pasteBtn = document.getElementById('pasteBtn');
    const historySection = document.getElementById('historySection');
    const historyGrid = document.getElementById('historyGrid');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const platformBtns = document.querySelectorAll('.platform-btn');

    // State
    const API_URL = '/api/info'; // VPS Backend

    // Init
    loadHistory();

    // Event Listeners
    downloadBtn.addEventListener('click', handleDownload);
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            urlInput.value = text;
        } catch (err) {
            alert('Failed to read clipboard');
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('dlHistory');
        loadHistory();
    });

    // Detect Platform
    urlInput.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase();
        platformBtns.forEach(btn => btn.classList.remove('active'));

        if (val.includes('youtube') || val.includes('youtu.be')) activatePlatform('youtube');
        else if (val.includes('tiktok')) activatePlatform('tiktok');
        else if (val.includes('instagram')) activatePlatform('instagram');
        else if (val.includes('facebook') || val.includes('fb.watch')) activatePlatform('facebook');
        else if (val.includes('twitter') || val.includes('x.com')) activatePlatform('twitter');
    });

    function activatePlatform(name) {
        document.querySelector(`.platform-btn[data-platform="${name}"]`)?.classList.add('active');
    }

    // --- Main Logic ---

    async function handleDownload() {
        const url = urlInput.value.trim();
        if (!url) {
            alert('Please enter a valid URL');
            return;
        }

        // Set Loading State with Animation
        setLoading(true);
        resultArea.innerHTML = '';
        resultArea.classList.add('hidden');

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to fetch video info');
            }

            const data = await response.json();
            renderResult(data);
            addToHistory(data);

        } catch (error) {
            console.error(error);
            resultArea.innerHTML = `<div style="color:red; text-align:center; margin-top:1rem;">
                <i class="fa-solid fa-circle-exclamation"></i> ${error.message}
            </div>`;
            resultArea.classList.remove('hidden');
        } finally {
            setLoading(false);
        }
    }

    // --- Modern Loading Animation ---
    function setLoading(isLoading) {
        const btnText = downloadBtn.querySelector('.btn-text');
        const loader = downloadBtn.querySelector('.loader');

        if (isLoading) {
            downloadBtn.classList.add('processing');
            downloadBtn.disabled = true;
            // Simple text update for "Animation" effect
            let steps = ['Analyzing...', 'Fetching Media...', 'Generating Link...'];
            let i = 0;
            btnText.textContent = steps[0];

            // This interval is just visual, the real await happens in handleDownload
            downloadBtn.dataset.interval = setInterval(() => {
                i = (i + 1) % steps.length;
                // We don't update text here because CSS hides it .processing
                // But if we wanted text next to loader we could.
            }, 800);

        } else {
            downloadBtn.classList.remove('processing');
            downloadBtn.disabled = false;
            clearInterval(downloadBtn.dataset.interval);
            btnText.textContent = 'Analyze & Download';
        }
    }

    // --- G2A Style Result Rendering ---
    function renderResult(data) {
        resultArea.classList.remove('hidden');

        // Filter formats: Prefer mp4, separate Audio
        const videoFormats = data.formats.filter(f => f.hasVideo);
        const bestVideo = videoFormats[0] || {};

        let formatsHTML = '';

        // Add a few key buttons
        // 1. Download Button (High Quality Proxy)
        const qualitySelect = document.getElementById('qualitySelect');
        const selectedQuality = qualitySelect ? qualitySelect.value : 'highest';
        const safeTitle = encodeURIComponent(data.title || 'video');

        const downloadLink = `/api/download?url=${encodeURIComponent(data.originalUrl || urlInput.value)}&quality=${selectedQuality}&title=${safeTitle}`;

        formatsHTML += `<a href="${downloadLink}" target="_blank" class="dl-btn">
             <i class="fa-solid fa-video"></i> Download Video (${selectedQuality === 'highest' ? 'Best' : selectedQuality})
        </a>`;

        /* 
        // 2. Audio Option (Future update)
        // For now let's focus on video working 100%
        */

        const html = `
            <div class="result-card">
                <img src="${data.thumbnail}" alt="${data.title}" class="result-thumbnail">
                <div class="result-info">
                    <div>
                        <h3 class="result-title">${data.title}</h3>
                        <div class="result-meta">
                            <span class="quality-badge">${data.platform}</span>
                            <span><i class="fa-regular fa-clock"></i> ${formatDuration(data.duration)}</span>
                        </div>
                    </div>
                    <div class="download-options">
                        ${formatsHTML}
                    </div>
                </div>
            </div>
        `;

        resultArea.innerHTML = html;

        // Scroll to result
        resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function formatDuration(seconds) {
        if (!seconds) return '00:00';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // --- History Feature ---
    function addToHistory(data) {
        let history = JSON.parse(localStorage.getItem('dlHistory') || '[]');

        // Avoid duplicates (by title)
        history = history.filter(item => item.title !== data.title);

        // Add new to top
        history.unshift({
            title: data.title,
            thumbnail: data.thumbnail,
            platform: data.platform,
            date: new Date().toLocaleDateString()
        });

        // Keep max 5
        if (history.length > 5) history.pop();

        localStorage.setItem('dlHistory', JSON.stringify(history));
        loadHistory();
    }

    function loadHistory() {
        const history = JSON.parse(localStorage.getItem('dlHistory') || '[]');

        if (history.length === 0) {
            historySection.classList.add('hidden');
            return;
        }

        historySection.classList.remove('hidden');
        historyGrid.innerHTML = history.map(item => `
            <div class="history-card">
                <img src="${item.thumbnail}" alt="thumb" class="history-thumb">
                <div class="history-info">
                    <div class="history-title" title="${item.title}">${item.title}</div>
                    <div class="history-date">${item.date} • ${item.platform}</div>
                </div>
                <div class="history-actions">
                    <button class="icon-btn" onclick="document.getElementById('urlInput').value = '${item.title}'; document.getElementById('urlInput').focus();" title="Search Again"><i class="fa-solid fa-rotate-left"></i></button>
                    <!-- <button class="icon-btn"><i class="fa-solid fa-download"></i></button> --> 
                    <!-- Note: Cannot save Direct Links for long term as they expire. Best to just re-search -->
                </div>
            </div>
        `).join('');
    }

    // Modal Handling (Support)
    const modal = document.getElementById('supportModal');
    const btn = document.querySelector('.support-btn');
    const close = document.querySelector('.close-modal');

    if (btn) btn.onclick = () => modal.classList.add('show');
    if (close) close.onclick = () => modal.classList.remove('show');
    window.onclick = (e) => {
        if (e.target == modal) modal.classList.remove('show');
    }

    // Copy Crypto Address
    const copyBtn = document.getElementById('copyBtcBtn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const copyText = document.getElementById("btcAddress");
            copyText.select();
            navigator.clipboard.writeText(copyText.value);
            alert("Address copied: " + copyText.value);
        }
    }
});
