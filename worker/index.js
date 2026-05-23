/* ═══════════════════════════════════════════════════════════
   TranscriptGrab — Cloudflare Worker API
   Fetches YouTube transcripts via direct page scraping.
   Deploy: npx wrangler deploy
   ═══════════════════════════════════════════════════════════ */

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Route: /api/transcript?url=...
    if (url.pathname === '/api/transcript') {
      return handleTranscript(url.searchParams.get('url'));
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }
};

async function handleTranscript(videoUrl) {
  if (!videoUrl) {
    return jsonResponse({ success: false, error: 'URL required' }, 400);
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    return jsonResponse({ success: false, error: 'Invalid YouTube URL.' }, 400);
  }

  // Fetch metadata
  let [title, author] = ['Untitled Video', 'Unknown Channel'];
  try {
    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (oembedRes.ok) {
      const info = await oembedRes.json();
      title = info.title || title;
      author = info.author_name || author;
    }
  } catch (_) {}

  // Try fetching transcript
  let transcript = null;
  let errorMsg = '';

  try {
    transcript = await fetchTranscriptDirect(videoId);
  } catch (err) {
    const msg = err.message || '';
    if (msg === 'CAPTIONS_DISABLED') {
      errorMsg = 'Transcripts are disabled for this video.';
    } else if (msg === 'VIDEO_UNAVAILABLE') {
      errorMsg = 'This video is unavailable or does not exist.';
    } else if (msg === 'CAPTIONS_NOT_AVAILABLE' || msg === 'CAPTIONS_EMPTY') {
      errorMsg = 'No captions/transcript available for this video.';
    } else if (msg.includes('429')) {
      errorMsg = 'YouTube is rate-limiting requests. Please try again in a moment.';
    } else {
      errorMsg = 'Could not extract transcript. Please try again.';
    }
  }

  return jsonResponse({
    success: !!transcript,
    transcript: transcript || [],
    videoId,
    title,
    author,
    error: transcript ? null : errorMsg,
  });
}

async function fetchTranscriptDirect(videoId) {
  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  // Step 1: Fetch YouTube video page
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': ua,
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!pageRes.ok) {
    throw new Error(`YouTube page returned ${pageRes.status}`);
  }

  const html = await pageRes.text();

  // Step 2: Extract captions from playerResponse
  const captionsMatch = html.match(
    /"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s
  );

  if (!captionsMatch) {
    if (html.includes('"playabilityStatus"') && html.includes('"reason"')) {
      throw new Error('VIDEO_UNAVAILABLE');
    }
    throw new Error('CAPTIONS_NOT_AVAILABLE');
  }

  let captionsData;
  try {
    captionsData = JSON.parse(captionsMatch[1]);
  } catch {
    throw new Error('CAPTIONS_PARSE_ERROR');
  }

  const tracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('CAPTIONS_DISABLED');
  }

  // Step 3: Pick best English track
  let track = tracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
  if (!track) track = tracks.find(t => t.languageCode === 'en');
  if (!track) track = tracks.find(t => t.languageCode?.startsWith('en'));
  if (!track) track = tracks[0];

  // Step 4: Fetch transcript JSON from timedtext CDN
  const captionRes = await fetch(track.baseUrl + '&fmt=json3', {
    headers: { 'User-Agent': ua },
  });

  if (!captionRes.ok) {
    throw new Error(`Caption fetch returned ${captionRes.status}`);
  }

  const captionData = await captionRes.json();
  const events = captionData?.events;
  if (!events || events.length === 0) {
    throw new Error('CAPTIONS_EMPTY');
  }

  // Step 5: Parse into standard format
  const transcript = events
    .filter(e => e.segs && e.segs.length > 0)
    .map(e => ({
      text: e.segs.map(s => s.utf8).join('').trim(),
      offset: e.tStartMs || 0,
      duration: e.dDurationMs || 0,
      lang: track.languageCode,
    }))
    .filter(t => t.text.length > 0);

  if (transcript.length === 0) {
    throw new Error('CAPTIONS_EMPTY');
  }

  return transcript;
}

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
  if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
