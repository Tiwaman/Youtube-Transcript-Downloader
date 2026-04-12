import express from 'express';
import { YoutubeTranscript } from './node_modules/youtube-transcript/dist/youtube-transcript.esm.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(express.static(path.join(__dirname, 'public')));

/* ── Transcript API ─────────────────────────────────────── */
app.get('/api/transcript', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: 'YouTube URL is required' });
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return res.status(400).json({ success: false, error: 'Invalid YouTube URL' });
    }

    // Fetch transcript
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);

    // Fetch video metadata via oEmbed
    let title = '', author = '';
    try {
      const canonical = `https://www.youtube.com/watch?v=${videoId}`;
      const oembedRes = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`
      );
      const info = await oembedRes.json();
      title = info.title || '';
      author = info.author_name || '';
    } catch (_) { /* metadata is optional */ }

    res.json({ success: true, transcript, title, author, videoId });
  } catch (err) {
    const msg = err.message || 'Failed to fetch transcript. The video may not have captions.';
    res.status(400).json({ success: false, error: msg });
  }
});

/* ── Helpers ─────────────────────────────────────────────── */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.trim().match(p);
    if (m) return m[1];
  }
  return null;
}

/* ── Start ───────────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n  🎬 TranscriptGrab running at http://localhost:${PORT}\n`);
});
