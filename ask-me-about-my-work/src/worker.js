// "Ask me about my work": the server half. POST /api/ask takes the conversation so far and
// returns a short, speakable answer from Claude, grounded only in knowledge.md.
// Everything else is served from public/.

import Anthropic from '@anthropic-ai/sdk';
import knowledge from '../knowledge.md';

// Make it yours: who the voice speaks for, and where it sends people it can't help.
const PERSON = 'Gustav Arnetz';
const EMAIL = 'gustav.arnetz@gmail.com';

const MAX_QUESTION = 500;
const MAX_TURNS = 6;

// Stable across requests, so prompt caching keeps repeat questions cheap.
const SYSTEM = `You are the voice on ${PERSON}'s portfolio site. Visitors talk to you to learn about ${PERSON}'s work. Answer as their assistant, in the third person.

Your answers are read aloud, so:
- Keep them short: two to four sentences, under 80 words.
- Plain spoken English. No lists, markdown, emoji or URLs.
- If a question needs more depth, give the short answer and suggest the case study or emailing ${PERSON}.

Stick to the facts below. If something isn't covered, say you don't know and suggest emailing ${EMAIL}. Never invent numbers, clients, dates or quotes. Some case studies are private: share only what's below, and say the full case is available on request. If someone asks about anything unrelated to ${PERSON}'s work, steer back politely.

${knowledge}`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

// Keep only well-formed, alternating user/assistant turns that end with a user turn.
function cleanHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const turns = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_QUESTION) }))
    .filter((m) => m.content)
    .slice(-MAX_TURNS);
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return null;
  return turns;
}

async function ask(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'offline' }, 503);

  const body = await request.json().catch(() => null);
  const messages = cleanHistory(body?.messages);
  if (!messages) return json({ error: 'Send a question.' }, 400);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 1024,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      messages,
    });
    if (response.stop_reason === 'refusal') {
      return json({ answer: `I can only talk about ${PERSON}'s work. What would you like to know about it?` });
    }
    const answer = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ')
      .trim();
    return json({ answer: answer || 'Sorry, I didn’t catch that. Could you ask again?' });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (error instanceof Anthropic.APIError) return json({ error: 'upstream', status: error.status }, 502);
    return json({ error: 'network' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/ask') return env.ASSETS.fetch(request);
    // Only this site's own page may call it, and each visitor gets a few questions a minute.
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (env.ASK_LIMITER && !(await env.ASK_LIMITER.limit({ key: ip })).success) return json({ error: 'busy' }, 429);
    return ask(request, env);
  },
};
