# Shaders for interfaces

Six shaders, each placed in a real screen and driven by what that screen is doing:

- **Grain gradient** behind a sign-in screen. It settles and darkens while you type.
- **Glass** in a dialog over a moving feed. It frosts in as the dialog opens, and its edge turns to the accent when the action fails.
- **Spotlight** on a call to action. It drifts until you arrive, finds the button, and gathers when you press.
- **Shimmer** on a loading list. It slows and says so when loading runs long, and the real rows land exactly where the skeleton was.
- **Dither** on a photo that loads progressively, from coarse blocks to real tones.
- **Ripple** on a pay button. Success rings calm, and a decline rings twice in the accent.

Each screen works on its own (type, press, tap), has state buttons, and can play its states through. The dials and the shader code are folded underneath.

## The design

- **A shader serves a moment.** Each one exists for a state of the screen (waiting, typing, confirming, failing), never just as wallpaper.
- **The words stay readable.** When text sits on top, the shader calms and darkens behind it.
- **States ease, never cut.** Every change blends over about 0.8 seconds on the same easing curve as the rest of the interface.
- **Cheap to run.** Each is one pass with no textures, and nothing draws while it's off screen.
- **Calm when asked.** With reduced motion on, nothing moves on its own, but a state change still shows and a tap still gets its answer.

## How it works

- `shaders.js` holds the six shaders and a small WebGL runner. Every shader gets the same inputs: resolution, time, an eased pointer position and hover amount, the last tap, three dials (`uA`, `uB`, `uC`) and two state values (`uK`, `uE`), all from 0 to 1. The runner eases every value toward its target, so a state change is a transition.
- `index.html` holds the screens. Each study lists its states (what the shader eases to and what the interface shows) and a short script that plays them through.

There are no libraries and no build step.

## Run it

Open `index.html` in a browser, or serve the folder with any static server.

## Make it yours

```js
const s = Shaders.mount(canvas, 'glass', { a: 0.6, b: 0.4, c: 0.3 });
s.to({ k: 1 });         // open the dialog
s.to({ e: 1 });         // show an error
s.set('a', 0.8);        // turn a dial
s.tap(0.5, 0.5);        // send a tap (the ripple)
s.still(true);          // stop moving on its own
```

To retheme everything, change the colour constants `INK`, `PAPER` and `ACCENT` at the top of the shader code.
