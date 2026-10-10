# Shaders for interfaces

Six small fragment shaders an interface could actually use: a grain gradient for backgrounds, a glass panel, a spotlight that follows the pointer, a loading shimmer, ordered dithering, and a ripple that answers a tap. Each one runs live with three dials, and its code sits underneath.

## The design

- **Quiet by default.** They're slow, low in contrast and dark, so whatever sits on top stays the point. Colour comes from one accent.
- **Answer people.** The pointer, a tap or a press changes something. A surface that reacts feels like a material, not a video.
- **Cheap to run.** Each is one pass with no textures, and nothing draws while it's off screen.
- **Calm when asked.** With reduced motion on, nothing moves on its own, but a tap still gets its answer.

## How it works

- `shaders.js` holds the six shaders and a small WebGL runner. Every shader gets the same inputs: resolution, time, an eased pointer position and hover amount, the last tap, and three dials (`uA`, `uB`, `uC`, each 0 to 1).
- `index.html` is the page. It builds a card for each study, with its dials and code.

There are no libraries and no build step.

## Run it

Open `index.html` in a browser, or serve the folder with any static server.

## Make it yours

```js
const s = Shaders.mount(canvas, 'glass', { a: 0.6, b: 0.4, c: 0.3 });
s.set('a', 0.8);   // turn a dial
s.still(true);     // stop moving on its own
```

To retheme everything, change the colour constants `INK`, `PAPER` and `ACCENT` at the top of the shader code.
