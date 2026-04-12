import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { YoutubeTranscript } = require('youtube-transcript');
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();

const HEADER_POOL = [
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/'
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.8',
    'Referer': 'https://www.google.com/'
  }
];

/* ── Transcript API ─────────────────────────────────────── */
app.get('/api/transcript', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ success: false, error: 'Invalid URL' });

  const headers = HEADER_POOL[Math.floor(Math.random() * HEADER_POOL.length)];
  
  // 1. Fetch Metadata first to ensure UI has something to show
  let [title, author] = ['Untitled Video', 'Unknown Channel'];
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const info = await oembedRes.json();
      title = info.title || title;
      author = info.author_name || author;
    }
  } catch (err) {
    console.error('Metadata fetch error:', err.message);
  }

  // 2. Try fetching transcript (Method 1)
  let transcript = null;
  let errorMsg = 'Extraction restricted by YouTube.';

  try {
    console.log(`[Method 1] Fetching ${videoId}`);
    transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      config: { headers }
    });
  } catch (err1) {
    console.warn(`[Method 1] Failed: ${err1.message}`);
    
    // 3. Fallback (Method 2)
    try {
      console.log(`[Method 2] Fetching ${videoId}`);
      const subs = await getSubtitles({ videoID: videoId, lang: 'en' });
      transcript = subs.map(t => ({
        text: t.text,
        offset: parseFloat(t.start) * 1000,
        duration: parseFloat(t.dur) * 1000
      }));
    } catch (err2) {
      console.error(`[Method 2] Failed: ${err2.message}`);
      errorMsg = 'YouTube has blocked requests from this server. Please try running the app locally where your IP is safe.';
    }
  }

  // 4. Return result
  // If we have transcript, it's a success
  // If we don't, we still return the metadata so the UI isn't broken
  return res.json({
    success: !!transcript,
    transcript: transcript || [],
    videoId,
    title,
    author,
    error: transcript ? null : errorMsg
  });
});

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (url.length === 11 ? url : null);
}

export default app;
