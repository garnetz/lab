# Ask me about my work

A voice prototype for a portfolio. Tap the circle, ask a question out loud, and hear a short answer grounded in the portfolio's public content. Built with Claude Code; answers come from Claude.

Live: [arnetz.design/ask](https://arnetz.design/ask) · Write-up: [arnetz.design/lab/ask-me-about-my-work](https://arnetz.design/lab/ask-me-about-my-work)

## The design

Voice mode is where a lot of AI products succeed or fail. The interesting work is in the moments between the words:

- **Clear states.** Listening, thinking and speaking each look different, so you always know whose turn it is.
- **Interrupting.** Tap while it's talking and it stops and listens. Being able to cut in is what makes voice feel like a conversation.
- **Short answers.** Spoken answers are kept to a few sentences. Anything longer points you to the case study.
- **Honest limits.** It only knows what's in `knowledge.md`, says so when it doesn't know, and never shares private cases.
- **A way out.** Where the browser can't do speech, you can type, and suggested questions help you start.

## How it works

- `public/index.html`: the page. The browser's speech recognition turns speech into text, and its speech synthesis reads the answer aloud. No libraries.
- `src/worker.js`: a Cloudflare Worker. `POST /api/ask` sends the last few turns to Claude with a system prompt built for speech, plus `knowledge.md`.
- `knowledge.md`: everything the voice knows. Plain Markdown, public information only.

Guardrails: questions are capped at 500 characters and 6 turns, each visitor gets 10 questions a minute, only the page's own origin can call the API, and the system prompt tells the model never to invent facts.

## Run it

You need Node and an [Anthropic API key](https://console.anthropic.com/).

```sh
npm install
echo 'ANTHROPIC_API_KEY=your-key' > .dev.vars   # local only, ignored by git
npm run dev
```

Open the local URL in Chrome or Safari (speech recognition needs one of them). To put it online:

```sh
npx wrangler secret put ANTHROPIC_API_KEY
npm run deploy
```

## Make it yours

1. Replace `knowledge.md` with your own public facts.
2. Change `PERSON` and `EMAIL` at the top of `src/worker.js`.
3. Change the starter questions in `public/index.html`.
