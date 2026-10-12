// "Ask the map": the server half. Claude does two small jobs here, and nothing else:
//   POST /api/ask-the-map/read  turns a request in plain words into things a map can check.
//   POST /api/ask-the-map/pick  picks from trails the page already found and measured, and says what's a guess.
// The trails, distances, climb and sunset all come from open map data, worked out in the browser.
// Everything else is served from public/.

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
const WANTS = ['lake', 'sea', 'view', 'sunset', 'sunrise', 'summit', 'swim', 'shelter', 'forest'];
const MAX_REQUEST = 300; // characters
const MAX_CANDIDATES = 8;

const READ_SYSTEM = `You turn a request for a walk or hike into things a map can check. The page will search OpenStreetMap for marked trails, so be literal.

- place: the place to search near, written so a geocoder finds it, with the country when you know it ("Stockholm, Sweden"). Empty if the request names no place.
- radius_km: how far from that place to look. "In" a small place: 5 to 10. "Near" a city: about 25. "Outside" or "within an hour of": 40. Never more than 40.
- hours and km: the walk's length if the request gives one, otherwise null. "Half a day" is 4 hours, "an afternoon" 3, "a short walk" 1.5.
- shape: loop if they want to end where they start, one-way if they say so, otherwise any.
- wants: only what they asked for, from the list.
- date: YYYY-MM-DD if they name a day ("tomorrow", "Saturday"), using today's date given below, otherwise null.
- start: HH:MM if they say when they start, otherwise null.
- time_zone: the IANA time zone of the place, like Europe/Stockholm.
- cannot_check: anything they asked for that a map of trails can't tell (crowds, mud, dogs allowed, how pretty, prams), in a few words each.
- understood: one plain sentence saying what you'll look for, starting with a verb. No exclamation marks.
If it isn't a request for a walk or hike, set place to empty and say so in understood.`;

const READ_SCHEMA = {
  type: 'object',
  properties: {
    place: { type: 'string' },
    radius_km: { type: 'number' },
    hours: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    km: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    shape: { type: 'string', enum: ['loop', 'one-way', 'any'] },
    wants: { type: 'array', items: { type: 'string', enum: WANTS } },
    date: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    start: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    time_zone: { type: 'string' },
    cannot_check: { type: 'array', items: { type: 'string' } },
    understood: { type: 'string' },
  },
  required: ['place', 'radius_km', 'hours', 'km', 'shape', 'wants', 'date', 'start', 'time_zone', 'cannot_check', 'understood'],
  additionalProperties: false,
};

const PICK_SYSTEM = `You help someone choose a walk. You get their request and up to ${MAX_CANDIDATES} marked trails from OpenStreetMap, each with facts the page measured from open map and elevation data: length, walking time by Naismith's rule, climb, whether it's a loop, named lakes and sea within 200 metres, viewpoints, peaks, shelters, bathing places, and for sunset, how high the land rises toward the setting sun from the trail's most open point.

Pick the best one to three. Be honest about the line between what the map says and what you're guessing.

- why: one sentence, under 22 words, on how it fits the request. Use only the facts given. Don't repeat the numbers; the page shows them.
- guesses: up to three things that matter for the request but that the map can't confirm, each under 18 words and worded as a guess ("Probably…", "Likely…", "May…"). Trees blocking the view, a lake you see but can't reach, crowds near the city, wet ground, whether the sunset is actually visible. Never state a guess as a fact.
- watch: one short practical caution if the facts suggest one (one-way so you need a way back, longer than asked, steep climb, sunset before you'd finish), otherwise null.
- summary: one or two plain sentences on the choice as a whole.
- missing: if nothing fits part of the request well, say which part and why in one sentence, otherwise null.
Never invent trail names, places, facilities or numbers. No exclamation marks, no superlatives.`;

const PICK_SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          why: { type: 'string' },
          guesses: { type: 'array', items: { type: 'string' } },
          watch: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['id', 'why', 'guesses', 'watch'],
        additionalProperties: false,
      },
    },
    summary: { type: 'string' },
    missing: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
  required: ['picks', 'summary', 'missing'],
  additionalProperties: false,
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const text = (v, max) => String(v ?? '').slice(0, max);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

// One call to Claude that must answer in the given JSON shape. Returns the parsed object or throws.
async function ask(env, { system, schema, user, maxTokens }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system,
    messages: [{ role: 'user', content: user }],
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('cut off'), { code: 'empty' });
  const out = response.content.find((b) => b.type === 'text')?.text;
  if (!out) throw Object.assign(new Error('no answer'), { code: 'empty' });
  return JSON.parse(out);
}

async function read(body, env) {
  const q = text(body?.q, MAX_REQUEST).trim();
  if (!q) return json({ error: 'Say what kind of walk you want.' }, 400);
  const today = /^\d{4}-\d\d-\d\d$/.test(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
  const r = await ask(env, {
    system: READ_SYSTEM,
    schema: READ_SCHEMA,
    user: `Today is ${today}.\n\nRequest: ${q}`,
    maxTokens: 1024,
  });
  return json({
    place: text(r.place, 120),
    radius_km: num(r.radius_km, 2, 40) ?? 25,
    hours: num(r.hours, 0.25, 14),
    km: num(r.km, 0.5, 60),
    shape: ['loop', 'one-way', 'any'].includes(r.shape) ? r.shape : 'any',
    wants: (r.wants || []).filter((w) => WANTS.includes(w)),
    date: /^\d{4}-\d\d-\d\d$/.test(r.date) ? r.date : null,
    start: /^\d\d:\d\d$/.test(r.start) ? r.start : null,
    time_zone: /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(r.time_zone) ? r.time_zone : null,
    cannot_check: (r.cannot_check || []).slice(0, 4).map((s) => text(s, 60)),
    understood: text(r.understood, 240),
  });
}

async function pick(body, env) {
  const q = text(body?.q, MAX_REQUEST).trim();
  const candidates = Array.isArray(body?.candidates) ? body.candidates.slice(0, MAX_CANDIDATES) : [];
  if (!q || !candidates.length) return json({ error: 'Nothing to pick from.' }, 400);
  // The facts come from the page; keep what the prompt needs and nothing larger.
  const facts = JSON.stringify(candidates, (k, v) => (typeof v === 'string' ? v.slice(0, 160) : v)).slice(0, 12000);
  const r = await ask(env, {
    system: PICK_SYSTEM,
    schema: PICK_SCHEMA,
    user: `Request: ${q}\n\nWhat the page looked for: ${text(JSON.stringify(body.read || {}), 800)}\n\nTrails:\n${facts}`,
    maxTokens: 2048,
  });
  const ids = new Set(candidates.map((c) => String(c.id)));
  const seen = new Set();
  const picks = (r.picks || [])
    .filter((p) => ids.has(String(p.id)) && !seen.has(String(p.id)) && seen.add(String(p.id)))
    .slice(0, 3)
    .map((p) => ({
      id: String(p.id),
      why: text(p.why, 200),
      guesses: (p.guesses || []).slice(0, 3).map((g) => text(g, 160)),
      watch: p.watch ? text(p.watch, 160) : null,
    }));
  return json({ picks, summary: text(r.summary, 400), missing: r.missing ? text(r.missing, 240) : null });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = url.pathname.match(/^\/api\/ask-the-map\/(read|pick)$/)?.[1];
    if (!route) return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
    // Only this site's own page may call it, and each visitor gets a few requests a minute.
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.MAP_LIMITER && !(await env.MAP_LIMITER.limit({ key: ip })).success) return json({ error: 'busy' }, 429);
    // Without a key the page still works: it ranks by the map facts alone.
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'offline' }, 503);
    const body = await request.json().catch(() => null);
    try {
      return await (route === 'read' ? read(body, env) : pick(body, env));
    } catch (error) {
      if (error.code === 'refused') return json({ error: 'refused' }, 422);
      if (error instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
      if (error instanceof Anthropic.APIError) return json({ error: 'upstream', status: error.status }, 502);
      return json({ error: error.code || 'network' }, 502);
    }
  },
};
