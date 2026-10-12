# Photo trail

Drop in the photos from a hike. Each one goes on the map where it was taken, using the location and time saved in the photo, and the day plays back with every photo pinned at its spot. Add a GPX track from a watch or app for the real path. With a track, photos that have a time but no location are placed where you were at that moment.

Your photos never leave your browser. Nothing is uploaded or stored.

## What it does

- **Reads the photo itself.** `trail.js` parses the JPEG's EXIF data: GPS position and height, GPS time (UTC), and the camera's own clock with its time zone when one was saved.
- **Places by time.** With a timed GPX track, a photo without a location goes where the track was at the moment it was taken. If the camera clock was set to another zone, the "Camera clock" control shifts it until the photos land right.
- **Honest about misses.** A photo with no location and no time inside the track isn't guessed onto the map. It's listed with the reason.
- **Replays the day.** Play runs the day in about 24 seconds and pauses briefly at each photo. You can also scrub or tap a photo in the strip.
- **The map** is the [Contour map](../contour-map) engine (`map.js`, copied here with a hook for drawing the route on top).

There are no libraries, no build step and no keys. HEIC photos can't be read yet. Most phones can export JPEG.

## The sample

The sample is the real Reinebringen trail above Reine in Lofoten, from OpenStreetMap, with heights from Terrain Tiles. The photos are from Unsplash, by other photographers, placed and timed by hand to show how the replay works. Walking times are estimated with Naismith's rule.

## Credits

- Route: © OpenStreetMap contributors, under the [ODbL](https://www.openstreetmap.org/copyright)
- Elevation: [Terrain Tiles](https://registry.opendata.aws/terrain-tiles/) by Mapzen on AWS Open Data. Its sources are listed in [contour-map/README.md](../contour-map/README.md#data-and-credits)
- Sample photos on [Unsplash](https://unsplash.com/?utm_source=arnetz_lab&utm_medium=referral), used under the Unsplash licence: Fabian Jung, Daniel (@danieluvegard), Dinuka Lankaloka and Sébastien Goldberg

Made with Claude Code.
