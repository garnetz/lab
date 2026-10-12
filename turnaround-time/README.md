# Turnaround time

Halfway up a mountain, the real question is when to turn back. This takes your pace so far, the climb ahead and the daylight left, and gives a time, along with how sure it is.

It's a study in designing for safety and uncertainty. One time leads, because that's the decision. Ranges and chances follow, in words before numbers, the way you'd want an AI to say what it doesn't know.

## How it works

- **Effort** follows Naismith's rule (an hour per 5 km, plus 10 minutes per 100 m up) with Langmuir's addition for descents (10 minutes per 300 m down). How long your effort so far took becomes your pace.
- **Uncertainty**: `turnaround.js` plays out the rest of the day 2 000 times. Each run has a pace that wanders around yours (less, the more you've walked), tiredness that builds, and descents that vary more than climbs. The random numbers are seeded, so the same inputs always give the same answer.
- **The turnaround** is the latest minute when turning back, from wherever you'd be by then, still gets you down before sunset minus your margin in the share of runs you ask for (90% by default).
- **Sunset where you are** is worked out on the device (NOAA's simplified formula). Your location is never sent anywhere.

It's a planning aid, not a promise. Weather, terrain and how you feel matter more.

There are no libraries, no build step and no keys.

Made with Claude Code.
