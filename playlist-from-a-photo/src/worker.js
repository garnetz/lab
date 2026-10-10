// "Playlist from a photo": the server half. POST /api/playlist takes one photo, asks Claude to read
// its light and mood and pick songs for it, then finds a 30-second preview of each song on iTunes.
// Everything else is served from public/.

import Anthropic from '@anthropic-ai/sdk';

const MAX_BYTES = 1_500_000; // the page sends a JPEG no larger than 1280px, well under this
const SONGS = 10;

const SYSTEM = `You make playlists from photographs. Look at the photo the way a photographer would: the light (its direction, softness, colour temperature, time of day), the colours, the place, the season and the feeling. Then pick ${SONGS} songs that sound the way the photo looks.

- Pick real, released songs that are easy to find on Apple Music. Name the original artist and the exact song title.
- Mix well-known songs with a few less obvious ones, across decades and genres where the mood allows.
- No two songs by the same artist.
- Order them like a playlist that flows: a way in, a middle, a way out.
- For each song, one short reason tied to something you can see in the photo, under 14 words.
- Name the playlist in two to five words, lowercase, like a title a person would give it.
- Describe the photo's light in one sentence, under 20 words, plainly. No poetry.
If the image is not a photo or you can't see it clearly, still do your best with what is there.`;

const TOOL = {
  name: 'playlist',
  description: 'Return the playlist for the photo.',
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Playlist name, two to five words, lowercase.' },
      light: { type: 'string', description: 'One plain sentence about the light in the photo.' },
      words: { type: 'array', items: { type: 'string' }, description: 'Three single words for the mood.' },
      songs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            artist: { type: 'string' },
            why: { type: 'string' },
          },
          required: ['title', 'artist', 'why'],
        },
      },
    },
    required: ['name', 'light', 'words', 'songs'],
  },
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Finds a song on iTunes and returns its preview, artwork and link, or null.
async function findSong({ title, artist }) {
  const term = encodeURIComponent(`${artist} ${title}`);
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&entity=song&limit=5`);
    if (!res.ok) return null;
    const { results = [] } = await res.json();
    const low = (s) => String(s).toLowerCase();
    const same = (r) => low(r.artistName).includes(low(artist)) || low(artist).includes(low(r.artistName));
    const hit = results.find((r) => r.previewUrl && same(r)) || results.find((r) => r.previewUrl);
    if (!hit) return null;
    return {
      title: hit.trackName,
      artist: hit.artistName,
      preview: hit.previewUrl,
      artwork: hit.artworkUrl100?.replace('100x100', '300x300'),
      link: hit.trackViewUrl,
    };
  } catch {
    return null;
  }
}

async function playlist(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'offline' }, 503);

  const body = await request.json().catch(() => null);
  const match = typeof body?.image === 'string' && body.image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return json({ error: 'Send a photo.' }, 400);
  if (match[2].length * 0.75 > MAX_BYTES) return json({ error: 'That photo is too large.' }, 413);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let picked;
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2048,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'playlist' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } },
          { type: 'text', text: 'Make a playlist for this photo.' },
        ],
      }],
    });
    picked = response.content.find((b) => b.type === 'tool_use')?.input;
    if (!picked?.songs?.length) return json({ error: 'empty' }, 502);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (error instanceof Anthropic.APIError) return json({ error: 'upstream', status: error.status }, 502);
    return json({ error: 'network' }, 502);
  }

  // Keep only the songs that have a preview, in Claude's order.
  const found = await Promise.all(picked.songs.slice(0, SONGS).map(async (s) => {
    const hit = await findSong(s);
    return hit && { ...hit, why: String(s.why).slice(0, 140) };
  }));
  return json({
    name: String(picked.name).slice(0, 60),
    light: String(picked.light).slice(0, 200),
    words: (picked.words || []).slice(0, 3).map((w) => String(w).slice(0, 20)),
    songs: found.filter(Boolean),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/playlist') return env.ASSETS.fetch(request);
    // Only this site's own page may call it, and each visitor gets a few photos a minute.
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.PHOTO_LIMITER && !(await env.PHOTO_LIMITER.limit({ key: ip })).success) return json({ error: 'busy' }, 429);
    return playlist(request, env);
  },
};
