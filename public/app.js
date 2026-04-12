/* ================================================================
   TranscriptGrab — Frontend Logic
   ================================================================ */

(() => {
  /* ── DOM refs ──────────────────────────────────────────── */
  const $  = (s) => document.getElementById(s);
  const urlInput        = $('urlInput');
  const fetchBtn        = $('fetchBtn');
  const errorBanner     = $('errorBanner');
  const errorText       = $('errorText');
  const videoPreview    = $('videoPreview');
  const thumbnail       = $('thumbnail');
  const videoTitle      = $('videoTitle');
  const videoChannel    = $('videoChannel');
  const toolbar         = $('toolbar');
  const copyBtn         = $('copyBtn');
  const downloadTxt     = $('downloadTxt');
  const downloadSrt     = $('downloadSrt');
  const searchInput     = $('searchInput');
  const timestampToggle = $('timestampToggle');
  const container       = $('transcriptContainer');
  const lines           = $('transcriptLines');
  const stats           = $('stats');
  const wordCountEl     = $('wordCount');
  const charCountEl     = $('charCount');
  const lineCountEl     = $('lineCount');
  const durationEl      = $('duration');
  const toast           = $('toast');

  let transcriptData = [];    // raw data from API
  let currentVideoId = '';
  let currentTitle   = '';

  /* ── Events ────────────────────────────────────────────── */
  fetchBtn.addEventListener('click', handleFetch);
  urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleFetch(); });
  copyBtn.addEventListener('click', handleCopy);
  downloadTxt.addEventListener('click', () => handleDownload('txt'));
  downloadSrt.addEventListener('click', () => handleDownload('srt'));
  searchInput.addEventListener('input', handleSearch);
  timestampToggle.addEventListener('change', handleTimestampToggle);

  // Auto-paste from clipboard on focus (if empty)
  urlInput.addEventListener('focus', async () => {
    if (urlInput.value) return;
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && isYouTubeUrl(clip)) {
        urlInput.value = clip;
        urlInput.select();
      }
    } catch (_) { /* clipboard permission denied */ }
  });

  /* ── Fetch Transcript ──────────────────────────────────── */
  async function handleFetch() {
    const url = urlInput.value.trim();
    if (!url) { showError('Please paste a YouTube URL.'); urlInput.focus(); return; }

    hideError();
    setLoading(true);

    try {
      const res = await fetch(`/api/transcript?url=${encodeURIComponent(url)}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      transcriptData = data.transcript;
      currentVideoId = data.videoId;
      currentTitle   = data.title || 'transcript';

      // Video preview
      if (data.videoId) {
        thumbnail.src = `https://img.youtube.com/vi/${data.videoId}/hqdefault.jpg`;
        videoTitle.textContent = data.title || 'Untitled Video';
        videoChannel.textContent = data.author || '';
        videoPreview.hidden = false;
      }

      renderTranscript(transcriptData);
      updateStats(transcriptData);
      toolbar.hidden = false;
      container.hidden = false;
      stats.hidden = false;
      searchInput.value = '';

    } catch (err) {
      showError(err.message || 'Something went wrong.');
      hideResults();
    } finally {
      setLoading(false);
    }
  }

  /* ── Render Transcript ─────────────────────────────────── */
  function renderTranscript(data, highlight = '') {
    if (!data.length) {
      lines.innerHTML = '<div class="empty-state">No transcript lines found.</div>';
      return;
    }

    const frag = document.createDocumentFragment();

    data.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'transcript-line';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'line-time';
      timeSpan.textContent = formatTime(item.offset / 1000);

      const textSpan = document.createElement('span');
      textSpan.className = 'line-text';

      let text = decodeHTML(item.text);
      if (highlight) {
        const re = new RegExp(`(${escapeRegex(highlight)})`, 'gi');
        text = text.replace(re, '<mark>$1</mark>');
      }
      textSpan.innerHTML = text;

      div.appendChild(timeSpan);
      div.appendChild(textSpan);
      frag.appendChild(div);
    });

    lines.innerHTML = '';
    lines.appendChild(frag);
  }

  /* ── Skeleton Loader ───────────────────────────────────── */
  function showSkeleton() {
    container.hidden = false;
    let html = '';
    for (let i = 0; i < 8; i++) {
      const w = 40 + Math.random() * 50;
      html += `<div class="skeleton-line">
        <div class="skeleton-block skeleton-time"></div>
        <div class="skeleton-block skeleton-text" style="width:${w}%"></div>
      </div>`;
    }
    lines.innerHTML = html;
  }

  /* ── Search ────────────────────────────────────────────── */
  function handleSearch() {
    const q = searchInput.value.trim();
    if (!q) {
      renderTranscript(transcriptData);
      return;
    }
    renderTranscript(transcriptData, q);

    // Hide non-matching lines
    const allLines = lines.querySelectorAll('.transcript-line');
    allLines.forEach((el) => {
      const text = el.querySelector('.line-text').textContent.toLowerCase();
      el.classList.toggle('hidden', !text.includes(q.toLowerCase()));
    });
  }

  /* ── Toggle Timestamps ─────────────────────────────────── */
  function handleTimestampToggle() {
    container.classList.toggle('hide-timestamps', !timestampToggle.checked);
  }

  /* ── Copy ───────────────────────────────────────────────── */
  async function handleCopy() {
    const text = buildPlainText(timestampToggle.checked);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('copied');
      showToast('Copied to clipboard!');
      setTimeout(() => copyBtn.classList.remove('copied'), 2000);
    } catch (_) {
      showToast('Failed to copy.');
    }
  }

  /* ── Download ──────────────────────────────────────────── */
  function handleDownload(fmt) {
    const safeName = currentTitle.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 60) || 'transcript';
    let content, mime, ext;

    if (fmt === 'srt') {
      content = buildSRT();
      mime = 'application/x-subrip';
      ext = 'srt';
    } else {
      content = buildPlainText(timestampToggle.checked);
      mime = 'text/plain';
      ext = 'txt';
    }

    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(`Downloaded ${safeName}.${ext}`);
  }

  /* ── Build Plain Text ──────────────────────────────────── */
  function buildPlainText(withTimestamps) {
    return transcriptData.map((item) => {
      const text = decodeHTML(item.text);
      if (withTimestamps) {
        return `[${formatTime(item.offset / 1000)}] ${text}`;
      }
      return text;
    }).join('\n');
  }

  /* ── Build SRT ─────────────────────────────────────────── */
  function buildSRT() {
    return transcriptData.map((item, i) => {
      const startSec = item.offset / 1000;
      const endSec   = startSec + (item.duration / 1000);
      return `${i + 1}\n${srtTime(startSec)} --> ${srtTime(endSec)}\n${decodeHTML(item.text)}\n`;
    }).join('\n');
  }

  /* ── Update Stats ──────────────────────────────────────── */
  function updateStats(data) {
    const allText = data.map((d) => decodeHTML(d.text)).join(' ');
    const words = allText.split(/\s+/).filter(Boolean).length;
    const chars = allText.length;
    const lastItem = data[data.length - 1];
    const totalSec = (lastItem.offset + lastItem.duration) / 1000;

    wordCountEl.textContent = words.toLocaleString();
    charCountEl.textContent = chars.toLocaleString();
    lineCountEl.textContent = data.length.toLocaleString();
    durationEl.textContent  = formatTime(totalSec);
  }

  /* ── Helpers ───────────────────────────────────────────── */
  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function srtTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms).padStart(3,'0')}`;
  }

  function decodeHTML(str) {
    const el = document.createElement('textarea');
    el.innerHTML = str;
    return el.value;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isYouTubeUrl(str) {
    return /youtube\.com|youtu\.be/i.test(str);
  }

  /* ── UI Helpers ────────────────────────────────────────── */
  function setLoading(on) {
    fetchBtn.classList.toggle('loading', on);
    fetchBtn.disabled = on;
    urlInput.disabled = on;
    if (on) showSkeleton();
  }

  function showError(msg) {
    errorText.textContent = msg;
    errorBanner.hidden = false;
  }

  function hideError() {
    errorBanner.hidden = true;
  }

  function hideResults() {
    videoPreview.hidden = true;
    toolbar.hidden = true;
    container.hidden = true;
    stats.hidden = true;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }
})();
