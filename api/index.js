import express from 'express';
import { YoutubeTranscript } from 'youtube-transcript';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { getSubtitles } = require('youtube-captions-scraper');

const app = express();

const HEADER_POOL = [
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/'
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept-Language': 'en-GB,en;q=0.8',
    'Referer': 'https://www.google.com/'
  },
  {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.youtube.com/'
  }
];

/* ── Transcript API ─────────────────────────────────────── */
app.get('/api/transcript', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ success: false, error: 'URL required' });

    const videoId = extractVideoId(url);
    if (!videoId) return res.status(400).json({ success: false, error: 'Invalid YouTube URL. Please paste a valid YouTube link or video ID.' });

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

    // 2. Try fetching transcript (Method 1) with language fallbacks
    let transcript = null;
    let errorMsg = '';
    const langs = ['en', 'en-US', 'en-GB'];

    try {
      console.log(`[Method 1] Fetching transcript for ${videoId}`);
      transcript = await YoutubeTranscript.fetchTranscript(videoId, {
        lang: 'en'
      });
    } catch (err1) {
      console.warn(`[Method 1] Failed: ${err1.message}`);

      // 3. Fallback (Method 2) — try multiple languages
      for (const lang of langs) {
        try {
          console.log(`[Method 2] Trying lang=${lang} for ${videoId}`);
          const subs = await getSubtitles({ videoID: videoId, lang });
          if (subs && subs.length > 0) {
            transcript = subs.map(t => ({
              text: t.text,
              offset: parseFloat(t.start) * 1000,
              duration: parseFloat(t.dur) * 1000
            }));
            break;
          }
        } catch (err2) {
          console.warn(`[Method 2] lang=${lang} failed: ${err2.message}`);
        }
      }

      if (!transcript) {
        // Determine error type from the original error
        const msg = err1.message || '';
        if (msg.includes('disabled') || msg.includes('Disabled')) {
          errorMsg = 'Transcripts are disabled for this video.';
        } else if (msg.includes('unavailable') || msg.includes('Unavailable')) {
          errorMsg = 'This video is unavailable or does not exist.';
        } else if (msg.includes('Too many') || msg.includes('too many') || msg.includes('429')) {
          errorMsg = 'YouTube is rate-limiting requests from this server. Please try again later or run the app locally.';
        } else if (msg.includes('not available') || msg.includes('Not Available')) {
          errorMsg = 'No transcript/captions available for this video.';
        } else {
          errorMsg = 'Could not extract transcript. YouTube may be blocking this server — try running the app locally.';
        }
      }
    }

    return res.json({
      success: !!transcript,
      transcript: transcript || [],
      videoId,
      title,
      author,
      error: transcript ? null : errorMsg
    });

  } catch (unexpectedErr) {
    console.error('Unexpected error:', unexpectedErr);
    return res.status(500).json({
      success: false,
      error: 'An unexpected server error occurred. Please try again.'
    });
  }
});

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.trim().match(p);
    if (m) return m[1];
  }
  // Raw 11-char video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

export default app;
