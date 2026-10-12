# Trail card

A trail view for the moments a normal map app fails: no signal, cold hands in gloves, a battery at 9%. The rules come from designing for cars, where people also get a few seconds to look and have a lot else going on. Made with Claude Code.

## The design

- **Two-second glances.** Four cards, each answering one question with one big number. Way: how far to the top or back to the start, plus the climb, the time and which way to head. Map: where you are on the route. Light: time to sunset, and whether turning back now gets you down before it. Help: your position, in a form you can read out or text.
- **Made for gloves.** Targets are at least 72 points tall. There's nothing to pinch, swipe or hold. Tap anywhere on a card for the next one. The keys 1 to 4 work too.
- **Packed, not streamed.** While you still have signal, the route, its heights, the sunset and a picture of the contour map are worked out once and kept on the phone in localStorage. A service worker keeps the page itself, so it opens with no network.
- **Easy on the battery.** A black screen with no animation. The battery saver asks for your position once a minute, without high accuracy, instead of following it all the time, and the Help card says how old the last fix is.
- **Night mode is red,** to keep your eyes used to the dark.
- **Off the route, said plainly.** More than 40 m from the line, the Way card turns to the accent colour and points back to the route.
- **Your position stays on the phone.** Nothing is sent anywhere. "Text my position" opens your own messages app with the coordinates filled in. A text often gets through when calls and data don't.

## How it works

- `index.html`: the page and the card UI.
- `card.js`:
  - packs the route: heights from Terrain Tiles if the GPX has none, climb with a 3 m deadband, a JPEG of the contour map with its projection;
  - finds where you are on the route;
  - works out the times (Naismith, plus Langmuir for the way down) and the sunset (NOAA's formula).
- `map.js`: the contour map from [Contour map of anywhere](../contour-map), used once to take the picture.
- `trail.js`: GPX reading from [Photo trail](../photo-trail).
- `sample-route.js`: the real Reinebringen trail above Reine, Lofoten, from OpenStreetMap, with heights from Terrain Tiles.
- `sw.js`: keeps the page's own files for offline use.

On the page, a slider stands in for walking the sample, and "Step off the route" puts you 90 m to the side. "Use my location" and "Use your own GPX" switch to the real thing.

## Data and credits

- Sample route © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, ODbL.
- Elevation from [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) by Mapzen on AWS Open Data.
- Times and sunset are estimates. Take a real map and a light.
