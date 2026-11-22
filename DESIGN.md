# Reps: design

A workout tracker for one person, built as a PWA (a website added to the iPhone Home Screen that opens full screen and works offline).

## What it must do well

Three things broke consistency before: no plan at the gym, logging was a chore, progress was invisible. So:

1. Open the app and see exactly what to do today.
2. Log a set that matches the suggestion in one tap. No typing after the first session.
3. See a win after every session.

## Decisions

| Topic | Decision |
|---|---|
| Platform | PWA on GitHub Pages. Native iOS was dropped: no Xcode on the Mac and too little disk for it. |
| Headline number | Weeks on target out of the last 12. No streak, so one bad week does not wipe it out. |
| What counts as a session | Any finished session with at least one thing logged. |
| Schedule | Any days. The app offers the next routine in rotation. |
| Program | Two routines, A and B, alternating. 3 sets of 8 to 12. 4 core exercises, 1 optional, optional cardio. |
| First weights | The user picks: a weight they could lift about 15 times, then does 10. |
| Progress | The summary leads with wins against last time. |
| After a break | 14 days or more away: about 10 percent lighter. |
| Swap | One tap to an exercise with the same movement, for today or for good. |
| Rest | A quiet counter of time since the last set. No alarm. |
| Form help | One-line cue plus a link to a YouTube search for the exercise. |
| Cardio | One optional line per session: type and minutes. |
| Layout | One home screen. Past sessions and Edit program behind two links. No tab bar. |
| Data | IndexedDB on the device only. Backup is a JSON file the user exports. |

Not built on purpose: body tracking, reminders, fixed schedule, countdown timer, charts, Apple Health, accounts, sync.

## Suggestion rules

In `src/progression.js`, covered by `test/progression.test.js`. Deterministic, no model. Checked in this order for a weighted exercise:

1. No history: no weight, aim for 10 (or the bottom of the range if 10 is outside it).
2. 14 days or more since it was last done: about 10 percent lighter, bottom of the range.
3. First set below the bottom of the range two sessions running: about 10 percent lighter.
4. First set 3 or more reps past the top: two weight steps up.
5. Every planned set at the top: one step up.
6. Otherwise: same weight, one more rep on the first set below the top.

Details that are easy to get wrong:

- "10 percent lighter" is rounded down to the weight step and is always at least one step.
- The working weight of a session is the weight of its last set. Only sets at that weight count.
- A win is more weight, or the same weight with more total reps.
- Bodyweight exercises use rules 1, 2 and 6 on reps only.
- The week runs Monday to Sunday in local time. The current week counts toward the hit rate only once it is on target.

## Code shape

- Plain ES modules, no build step, no runtime dependencies. Playwright is the only dev dependency.
- `src/progression.js` is pure. `src/store.js` owns IndexedDB and the in-memory `state`. `src/log.js` joins the two. `src/views/` render DOM with the `h()` helper in `src/dom.js`.
- Weights are stored in kg and converted for display in `src/units.js`. Rules run on display units, so pounds use pound steps.
- Views re-render whole on structural changes (a set done, an exercise opened) inside a view transition. Stepper taps patch text only, so nothing re-renders under the finger.
- `sw.js` caches every file on install and serves cache first, refreshing in the background. `test/sw.test.js` fails if a file is missing from its list.

## Tried and dropped

- Horizontal scrolling chips for the cardio type: the selected chip could sit off screen. They wrap now.
- Re-rendering on every stepper tap: replaced with text patching, to keep taps reliable.
- Filtering history by "before now" when planning: a session started in the same millisecond was left out. History is unfiltered when planning; only comparisons against "last time" filter by session start.

## Not verifiable from the Mac

Add to Home Screen, status bar and safe-area fit, the share sheet used by Export backup, and how it feels mid-workout all need a real iPhone.
