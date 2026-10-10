# Playlist from a photo

Drop in a photo. Claude reads it the way a photographer would (the light, the colour, the time of day, the mood) and picks ten songs that sound the way it looks. Each song plays as a 30-second preview, one after another. Made with Claude Code.

## The design

- **Light first.** The prompt asks Claude to look at the light before anything else: its direction, softness and colour temperature. A grey morning and a late summer evening should sound different.
- **One reason per song.** Each pick says what in the photo it answers, in under 14 words, so the choices feel read, not random.
- **The photo stays the hero.** The page shows the photo large, with its own colours pulled out underneath (worked out in the browser, not by the model).
- **Only songs you can hear.** Every pick is looked up on iTunes, and songs without a preview are dropped.
- **Private by default.** The photo is shrunk in the browser to 1280px and sent once. Nothing is stored.

## How it works

- `public/index.html` and `public/app.js`: the page. It shrinks the photo, reads its colours, calls the API and plays the previews. No libraries.
- `src/worker.js`: a Cloudflare Worker. `POST /api/playlist` sends the photo to Claude with a tool that returns a name, a sentence about the light, three mood words and ten songs, then finds each song on the iTunes Search API.

Guardrails: photos are capped at 1.5 MB, each visitor gets 5 photos a minute, and only the page's own origin can call the API.

## Run it

You need Node and an [Anthropic API key](https://console.anthropic.com/).

```sh
npm install
echo 'ANTHROPIC_API_KEY=your-key' > .dev.vars   # local only, ignored by git
npm run dev
```

To put it online:

```sh
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```
