# Darkroom

Six shaders that work on real photographs, the way a lens, a film stock or a darkroom would:

- **Relight** moves a light across a room. Where brightness changes, the shader guesses a surface, so edges and the floor catch the light.
- **Halation** lets bright lights bleed a red-orange glow into the film around them, like cinema stock at night.
- **Tilt-shift** keeps one band sharp and lets the rest fall out of focus, so a real coastline reads like a model. Your pointer moves the band.
- **Film** adds a split tone, lifted blacks and grain that sits in the mid-tones.
- **Sun rays** marches light out from the sun through the trees. Your pointer is the sun.
- **Golden hour** re-times a photo from blue hour to golden hour, with glowing highlights and haze.

Each study runs live on the photo. Hold to compare with the original, and open "Dials and code" for three dials and the shader itself.

## Use your own photo

"Use your own photo" puts your picture into every study. It's read in your browser and never uploaded.

## The photos

The sample photos come from [Unsplash](https://unsplash.com/?utm_source=arnetz_lab&utm_medium=referral) and are used under the [Unsplash licence](https://unsplash.com/license). Each study credits its photographer and links to the photo. They're loaded from Unsplash's image CDN, not copied into this repo.

| Study | Photo by |
| --- | --- |
| Relight | [Brian Patrick Tagalog](https://unsplash.com/@briantagalog?utm_source=arnetz_lab&utm_medium=referral) |
| Halation | [Valentin Beauvais](https://unsplash.com/@valentinbvs?utm_source=arnetz_lab&utm_medium=referral) |
| Tilt-shift | [Kiril Dobrev](https://unsplash.com/@kirildobrev?utm_source=arnetz_lab&utm_medium=referral) |
| Film | [Paul Pastourmatzis](https://unsplash.com/@paulpastourmatzis?utm_source=arnetz_lab&utm_medium=referral) |
| Sun rays | [Sebastian Unrau](https://unsplash.com/@sebastian_unrau?utm_source=arnetz_lab&utm_medium=referral) |
| Golden hour | [qiwei yang](https://unsplash.com/@qiweiyang?utm_source=arnetz_lab&utm_medium=referral) |

### Live photos from the Unsplash API

The set is curated on purpose. A later version could search Unsplash live (for example "fog" or "neon") through the Unsplash API. That needs an access key, which belongs in a server secret (a Worker that proxies the search), never in this repo or the page.

## How it works

- `darkroom.js` holds the six shaders and a small WebGL runner. Every shader gets the photo as a texture plus the same inputs: resolution, the photo's size, an eased pointer position and hover amount, time, three dials (`uA`, `uB`, `uC`) and a compare amount. The photo is fitted like `object-fit: cover`.
- Each shader is one pass. Blurs and glows sample in a golden-angle spiral, so a few dozen taps look smooth.
- Without a pointer, the light drifts slowly on its own. With "Reduce motion" on, nothing moves unless you move it.
- Nothing draws while a study is off screen.

There are no libraries and no build step.

## Run it

Serve the folder with any static server and open `index.html`.

## Make it yours

```js
const d = Darkroom.mount(canvas, 'halation', imageElement, { a: 0.5, b: 0.6, c: 0.5 });
d.set('c', 0.8);    // ease a dial
d.compare(true);    // show the original
d.photo(otherImage); // swap the photo
```

Made with Claude Code.
