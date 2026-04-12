import express from 'express';
import { YoutubeTranscript } from 'youtube-transcript';

const app = express();

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
    // We use the static method directly from the class
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

// Export the app for Vercel
export default app;
