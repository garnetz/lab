# Shader study

Eight small fragment shaders, one technique each: Flow, Contours, Cells, Blobs, Halftone, Dither, Moiré and Grain. They share the same inputs, one slider and the same three colours, so the only thing that changes between them is the idea. Pick one, move your pointer over it, and read its code right on the page.

## The design

- **One contract.** Every shader is a single function, `vec3 shade(vec2 uv, vec2 m)`. It gets the pixel, the pointer, the time, one `uAmount` slider from 0 to 1, and three colours. Nothing else.
- **Three colours, two colourways.** Paper, ink and one accent, in Ink (light on black) or Paper (dark on white). The accent is used sparingly: a few contour lines, the rim of a blob, the cells near your pointer.
- **Your pointer is part of it.** Over the big stage the pointer steers the light, raises a hill, adds a blob or moves a ring centre. Let go and it drifts on its own.
- **Short enough to read.** Each shader is under 20 lines, shown under the controls with a Copy button.
- **Calm when asked.** With reduced motion on, everything starts frozen. Freeze toggles it either way.

## How it works

- `shaders.js`: one tiny WebGL engine and the eight `shade()` functions. Shared helpers (value noise, fbm, a Bayer matrix, anti-aliasing) sit above them. Each canvas only draws while it's on screen. Colours come from CSS custom properties: `--sh-paper`, `--sh-ink`, `--sh-accent`.
- `study.js`: wires up the page (stage, cards, slider, colourways, source view).
- `index.html`: the page.

No libraries and no build step.

## Run it

Serve the folder with any static server (`npx serve .`) and open it.

## Make it yours

```js
const s = ShaderStudy.create(canvas, { shader: 'contours', tokens: document.body });
s.setAmount(0.7);        // the slider, 0 to 1
s.setPointer(0.5, 0.5);  // 0 to 1, y up; null lets it drift
s.setStill(true);        // freeze
```

To add a study, write one more `shade()` in `SHADERS` in `shaders.js`.
