# Ask the map

Ask for a walk in plain words, like "a three-hour loop near Stockholm with a lake and a sunset view". Real, marked trails come back on a contour map, with up to three picks. What the map can measure is kept apart from what Claude is guessing, so you always know which is which. Made with Claude Code.

## The design

- **Facts and guesses never mix.** Each pick has a "From the map" list (length, climb, walking time, lakes and viewpoints along the way, the land toward the sunset), measured in the browser. Claude's part is a short "why" and a list of guesses, each marked with ~ and worded as a guess.
- **Claude only sees the facts.** The page finds and measures the trails first. Claude picks from that list and can't add a trail, a place or a number. Its answers are checked against the list before they're shown.
- **The numbers on screen are the page's, not Claude's.** Even when Claude writes a sentence, the stats beside it come straight from the data.
- **Sunset, honestly.** The page works out when and where the sun sets, then looks along that direction from points on each trail to see how high the land rises. Elevation data has no trees or buildings, so the page says that too.
- **Honest when it can't.** If no trail fits part of the request, it says which part. Anything a map can't tell (mud, crowds, dogs) is named as such.
- **Works without Claude.** With no API key, the request is read with simple patterns and the trails ranked by the facts alone, and the page says so.

## How it works

1. `POST /api/ask-the-map/read`: Claude turns the request into a place, a radius, a length, loop or not, and what to pass (structured output, so the shape is fixed).
2. The browser finds the place with [Nominatim](https://nominatim.org/), then the marked hiking and walking routes nearby from the [Overpass API](https://overpass-api.de/) (OpenStreetMap route relations), shortlists about ten by length, and fetches their full paths and what lies within 150–200 m: named lakes, the sea, viewpoints, peaks, shelters, bathing places.
3. The browser measures climb from the open [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), walking time by Naismith's rule (5 km an hour plus 10 minutes per 100 m up), and sunset time and direction by NOAA's formula.
4. `POST /api/ask-the-map/pick`: Claude gets the request and those facts for up to eight trails, and returns picks with a reason, guesses and a caution.

Files:

- `public/index.html`, `public/app.js`: the page.
- `public/routes.js`: places, trails, geometry, elevation and the sun. Everything the page states as fact comes from here.
- `public/map.js`: the contour map from [Contour map of anywhere](../contour-map).
- `src/worker.js`: a Cloudflare Worker with the two Claude calls.

Guardrails: requests are capped at 300 characters, each visitor gets 6 calls a minute (about three questions), and only the page's own origin can call the API. Nothing is stored.

## Data and credits

- Trails and places © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, under the ODbL, through the Overpass API and Nominatim. Please keep to their usage policies: one search per question.
- Elevation: Terrain Tiles by Mapzen on AWS Open Data, from SRTM, EU-DEM, USGS and other open sources.
- Trail coverage is only as good as what people have mapped. Where few trails are marked in OpenStreetMap, there's little to pick from.

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
