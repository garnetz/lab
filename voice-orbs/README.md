# Voice orbs

Twelve visual directions for a voice assistant's presence, all reacting to the same moments of a conversation: ready, listening, a natural pause, thinking, speaking and mic off. Pick a moment, play a short scripted conversation, or turn on your microphone, and tap any look to see it large.

In a voice conversation the screen has one job: show whose turn it is. This is a visual exploration of how many ways that job can be done while every look follows the same rules.

## The design

- **Colour says whose turn it is.** Cool while you talk, warm while the assistant talks, neutral at rest. Turn off "Colour by voice" to judge motion alone.
- **Each moment moves differently.** Listening follows your voice. A pause slows to breathing. Thinking gathers inward. Speaking glows from the centre. Mic off goes grey and nearly still, so it can't be mistaken.
- **Breath, not bounce.** At rest every look breathes four seconds in and six out. State changes ease over about 800ms, and voice level is smoothed so nothing jitters.
- **Calm when asked.** With reduced motion on, the shapes hold still and each moment shows through light and colour alone.

## How it works

- `orbs.js`: one small WebGL engine with a fragment shader per look. Every look gets the same inputs: breath, voice level, thinking, speaking and mic off, each eased between states. Colours are read from CSS custom properties (`--orb-deep`, `--orb-mid`, `--orb-main`, `--orb-light`, `--orb-listen`, `--orb-speak`).
- `index.html`: the gallery. Voice is simulated as syllables with natural gaps. With the microphone on, the level is measured in the browser only. Nothing is recorded or sent.

No libraries and no build step.

## Run it

Serve the folder with any static server (`npx serve .`) and open it. The microphone needs `localhost` or HTTPS.

## Make it yours

```js
const orb = VoiceOrb.create(canvas, { tokens: document.body, look: 'halo' });
orb.setState('listening');   // ready, listening, pause, thinking, speaking, muted
orb.kick(0.8);               // one syllable of simulated voice
orb.setLevel(0.4);           // or a live level from 0 to 1, null to stop
```

Change the six `--orb-*` colours to put it in your own palette.
