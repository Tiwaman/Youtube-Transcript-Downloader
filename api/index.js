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
    'Referer': 'https://www.youtube.com/',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"'
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.8',
    'Referer': 'https://www.google.com/',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="120", "Chromium";v="120"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"'
  }
];

/* ── Transcript API ─────────────────────────────────────── */
app.get('/api/transcript', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ success: false, error: 'URL required' });

  const videoId = extractVideoId(url);
  if (!videoId) return res.status(400).json({ success: false, error: 'Invalid URL' });

  const headers = HEADER_POOL[Math.floor(Math.random() * HEADER_POOL.length)];
  
  // 1. ALWAYS try to fetch metadata first (usually works even if blocked)
  let [title, author] = ['', ''];
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    const info = await oembedRes.json();
    title = info.title;
    author = info.author_name;
  } catch (_) {}

  // 2. Try fetching transcript (Method 1)
  try {
    console.log(`[Method 1] Fetching for ${videoId}`);
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, {
      config: { headers }
    });
    return res.json({ success: true, transcript, title, author, videoId });
  } catch (err1) {
    console.warn(`[Method 1] Failed: ${err1.message}`);
    
    // 3. Fallback (Method 2)
    try {
      console.log(`[Method 2] Fallback for ${videoId}`);
      const transcript = await getSubtitles({ videoID: videoId, lang: 'en' });
      const normalized = transcript.map(t => ({
        text: t.text,
        offset: parseFloat(t.start) * 1000,
        duration: parseFloat(t.dur) * 1000
      }));
      return res.json({ success: true, transcript: normalized, title, author, videoId });
    } catch (err2) {
      console.error(`[All Methods] Failed for ${videoId}`);
      // Return partial success (metadata) but success:false for transcript
      return res.status(200).json({ 
        success: false, 
        videoId, title, author,
        error: 'YouTube blocked the transcript request. Try again later or use the local version.' 
      });
    }
  }
});

function extractVideoId(url) {
  const m = url.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : (url.length === 11 ? url : null);
}

export default app;
