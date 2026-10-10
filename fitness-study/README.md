# Research to prototype: a fitness study

One design loop, start to finish, made with Claude Code and the [Mobbin](https://mobbin.com) MCP: search real apps, read every screen, pull the patterns into a moodboard, turn them into a visual language and six guidelines, then build a prototype that follows them. The prototype doesn't use my portfolio's style. Its look comes from the research.

## Process

1. **Brief.** A general fitness and health app. Find out what these apps say to you on an ordinary day.
2. **Search.** Four plain-language searches on Mobbin, eight iOS screens each:
   - `daily activity summary with progress rings or bars for steps, workouts and sleep`
   - `workout in progress screen with large timer, current exercise and next exercise`
   - `recovery or readiness score screen with explanation of sleep and heart rate variability`
   - `workout complete summary screen with duration, effort and a short reflection`
3. **Read.** Claude looked at all 32 screens from 22 apps (among them Apple Fitness, Garmin Connect, Fitbit, Oura, WHOOP, Bevel, Visible, Gentler Streak, Peloton, Ladder, Runna, Hevy and Strava) and named what kept repeating.
4. **Moodboard.** Eight patterns, sketched, each linked to its screens on Mobbin. No screenshots are stored here; the screens belong to their makers.
5. **Visual language.** What the apps share became the look: a light grey ground with white 20px cards, a black session screen, one lime accent, big bold rounded numbers, pill buttons, a floating tab bar, and rest in blue.
6. **Guidelines.** Where the apps differ, six rules pick a side:
   - Say it in words first.
   - Compare to your usual, not to a goal.
   - Three reasons, in plain rows.
   - Time, now, next.
   - Rest is a state, not a wait.
   - End with a question, not confetti.
7. **Prototype.** Three screens (Today, Session, Done) for three sample mornings. Your answer to "How did that feel?" changes the next day's suggestion. All data is sample data.

## Kept, changed, cut

- **Kept:** the ring, light cards, the black session screen, the segmented bar, the "next" row, pill buttons and the floating tab bar.
- **Changed:** the score became a word, the goal became your usual, rest got its own colour, and confetti became a question.
- **Cut:** calories, streak counters, share sheets, trainer video, three rings at once and long lists of metrics.

## Run it

Open `index.html` in a browser. There are no libraries and no build step.

- `index.html` holds the write-up and the prototype's screens.
- `study.js` holds the moodboard tiles, the sample mornings and the session timer.
