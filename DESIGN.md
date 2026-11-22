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
| Form help | A drawn clip, three steps and the muscles worked, stored in the app. The ten starter exercises have one; the rest show a one-line cue and a YouTube search. |
| Cardio | One optional line per session: type and minutes. |
| Layout | One home screen. Past, Exercises and Program behind three buttons. No tab bar. |
| Logging | Read on top, act at the bottom. The plan scrolls; a fixed deck holds weight, reps and Done, so Done never moves. |
| Home top | A punch card of the last 12 weeks: a column per week, a square per session. The count is written above it. |
| Data | localStorage on the device only, read before the first frame. Backup is a JSON file the user exports. |

## Look: Placard

Modelled on the label of a gym machine.

- **Colours:** black, white, pastel yellow and pastel blue only, plus greys derived from black.
  - Yellow `#ffe98f` is the one main action on a screen, the set you are on, and this week's open sessions.
  - Blue `#c3d4ff` means done or beaten: logged sets, finished exercises, weeks on target, wins in the summary.
  - Both are surfaces only. Text on them is always black, and no text is coloured, because pastel text on white is unreadable.
  - On white, each pastel carries a slightly deeper rim of its own hue so it stays visible.
  - Light theme is black on white, dark theme is white on true black.
- **Type:** DIN Condensed Bold, upper case, for numbers, names and buttons. San Francisco for sentences. Both ship with iOS, so no font file is downloaded.
- DIN Condensed sits high in its line box. Elements that must look centred carry a small `padding-top` in em.
- **Numbers** are shown as weight once, then reps per set (`40 kg  11 10 10`), in fixed columns so rows line up.
- **Sizes:** main buttons 62 px tall, deck steppers 68 px, body text 17 px.
- **Motion:** only in answer to a tap. The current set cell settles in, a logged cell stamps, screens cross-fade.

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

## Smart rules

In `src/smart.js`, covered by `test/smart.test.js`. All deterministic and on the device. Chosen because they act at the two points where consistency broke before (mid-week, and when progress felt invisible), and because a search did not turn them up in Hevy, Strong or Fitbod. That search read marketing pages only.

- **Week plan.** Home says what it takes to still hit the target: sessions to go, days left, and which days. Days are chosen to prefer the user's usual days, then a rest day in between, then the earliest, so the week is not left to its last day. Before the first session ever there is no pressure.
- **Catch-up.** When the target is out of reach (more sessions to go than days left) and the user has not trained today, Home offers and pre-selects one session of four exercises: legs, push, pull, legs, taking turns between the routines and preferring what the week has not trained. It counts as one session and does not move the rotation.
- **15 minutes.** Always available: the core exercise closest to a weight increase and the closest one from a different family, two sets each. Counts as a session and moves the rotation.
- **Forecast.** In the summary: the next round weights with a date. Strength is estimated as weight x (1 + reps / 30) from the first set, fitted with a straight line over the last 8 sessions of the exercise. Needs 4 sessions. It looks at most twice as far ahead as the history it is built on, never past half a year. A flat or falling trend is stated plainly; a rising trend with no goal in range says nothing.
- **Habits.** From the last 12 weeks, once there are 6 sessions: a weekday is usual with at least 3 sessions and a fifth of the total; a time of day with six in ten. No notifications, since a web app on iPhone cannot send them without a server.
- **Usual swap.** The swap sheet lists what the user swapped to before first, and labels it after two swaps.

Not built, by the user's choice: adjusting the rest of an exercise from the first set.

## Form clips

`src/figure.js` is the skeleton (fixed bone lengths), `src/body.js` gives it a body, clothes and equipment as one mesh, `src/stage.js` draws it with WebGL 2 (one light, soft shadows), `src/form.js` holds poses, steps, words and muscles per exercise, `src/views/clip.js` is the player. Nothing is downloaded.

- A pose gives hips, torso, hands and ankles; elbows and knees are solved (two-bone inverse kinematics), so limbs cannot stretch.
- Every part is a sweep of rings along a path. Outlines and colours are worked out once per clip; only positions change, about 0.2 ms per frame on the Mac.
- Working muscles are tinted blue on the body, helping ones light blue. Weights are yellow.
- Words, breath and a bar follow the rep: lift 1.2 s, lower 2.4 s, hold 0.7 s at each end. Drag turns the figure, a tap pauses it. With Reduce Motion, start and end are shown as stills.
- One graphics context is shared by the whole app and copied to the page's canvas. WebKit allows 16, and does not free them when a page is left.
- `test/form.test.js` checks every clip at 41 moments: bone lengths, knees, floor, hands on the weight, what must stay still, smoothness, both sides alike, and that the clip shows what its steps say. A new clip needs the same.
- Start and end poses were compared with photo pairs from free-exercise-db (reference only, not shipped). Not reviewed by a trainer.

## Native feel: what a web app cannot do on iOS

- Remove browser chrome in a Safari tab (only the Home Screen icon does), share data between Safari and the icon, shorten iOS's own launch time, send notifications without a server, or open YouTube without its toolbar.
- Declined by the user: keeping the screen awake, an install-only screen in Safari, haptics.
- iOS reads launch images and the status bar style when the icon is added. Changing them needs a re-install.
- localStorage in WebKit held 5.24 million characters when measured (Playwright WebKit on the Mac). A full store shows "Could not save".

## Routine builder

In `src/build.js`, covered by `test/build.test.js`. The user picks exercises they know; the app builds Routine A and Routine B around them.

- Each routine has four core slots and one optional slot:
  - A: squat or leg press, chest press, row, overhead press, optional core.
  - B: hip hinge, pulldown or pull-up, second push, hamstrings, optional arms.
- Picks go in first, in the order picked: into the slot for their exact movement, else into a free slot of the same family (legs, push, pull, or extras).
- Free slots are filled with the default exercise for that slot, or the next visible one with that movement, machines first. Each added exercise shows why it was added.
- Picks that fit no slot are still included, as optional, in the shorter routine.
- Saving replaces the current routines. Sessions and exercise history are untouched, so known exercises keep their weights.

## Code shape

- Plain ES modules, no build step, no runtime dependencies. Playwright is the only dev dependency.
- `src/progression.js` is pure. `src/store.js` owns localStorage and the in-memory `state`. `src/log.js` joins the two. `src/views/` render DOM with the `h()` helper in `src/dom.js`.
- Weights are stored in kg and converted for display in `src/units.js`. Rules run on display units, so pounds use pound steps.
- Views re-render whole on structural changes (a set done, an exercise opened) inside a view transition. Stepper taps patch text only, so nothing re-renders under the finger.
- `sw.js` caches every file on install and serves only from the cache. At each launch, and on return to the foreground after 6 hours, it re-checks all files and swaps in changes together, so a launch never mixes versions. New code takes over by reloading, only on Home with no session open. `test/sw.test.js` fails if a file is missing from its list, from the preload list, or if a launch image has the wrong size.
- Navigation keeps the position of each history entry (`src/dom.js`). The back arrow really goes back; finishing a session replaces its entry; an iOS edge swipe skips our cross-fade.

## Tried and dropped

- Flat black silhouettes for the form clips, drawn on a 2D canvas: the user found them crude and hard to read. Overlapping limbs merged and grip could not be shown.
- One graphics context per clip, released on leaving: WebKit still ran out after 16 pages.
- Saturated yellow `#ffd60a` and cobalt blue `#1a4fe0` with white text on blue: replaced by pastels at the user's request.
- First look: cream background, terracotta accent, a big number with a small label, thin grey text. Generic, and hard to read at arm's length.
- First logging layout: an accordion with the Done button inside the list. Done moved down the screen with every set.
- Add and remove set as chips under the cue: four chips did not fit one line. They sit beside the set cells now.
- Horizontal scrolling chips for the cardio type: the selected chip could sit off screen. They wrap now. The explorer's filters do scroll, and bring the chosen one into view.
- IndexedDB: its answer arrives after the first frame, so the app opened empty for a moment.
- Refreshing each cached file on its own in the background: a launch could mix old and new files.
- Re-rendering on every stepper tap: replaced with text patching, to keep taps reliable.
- Filtering history by "before now" when planning: a session started in the same millisecond was left out. History is unfiltered when planning; only comparisons against "last time" filter by session start.

## Not verifiable from the Mac

Add to Home Screen, status bar and safe-area fit, the share sheet used by Export backup, and how it feels mid-workout all need a real iPhone.

## Polish run 2026-11-21 (branch polish/2026-11-21, from f89232e)

Focus: the 3D model, materials and motion clips. At most 3 iterations.

1. Kept: a paused clip no longer has a play disc over the middle of the figure. The disc is smaller and sits in the bottom right corner, so pausing and turning to study a position works. Found by a character artist who lifts, all ten clips, after a tap to pause. Proof: an end-to-end check on where the disc is (old: 64 px at 163, 180; it failed there), and screenshots in light, dark and at 320 px. Limit, measured by the review: on the starting angle it is clear of the figure in all ten clips from 375 px up; at 320 px it touches a shoe toe (Incline Press) and a machine post (Cable Crunch). Turned, Seated Row's post can pass behind it.
2. Kept: in the Seated Cable Row clip the arms are straight at the reach, as its first step says (elbow 165 degrees, was 126). Found by a character artist who lifts, Seated Row, the hold before the pull. Proof: a form test that failed at 126 degrees on the old pose; the end of the pull is unchanged. Trade-off, measured by the review: the elbow leaves straight faster (peak 2.5 degrees per frame, was 1.6, the same as Incline Press) and the handle meets the cable at 10.6 degrees (was 7.7).
3. Kept: in all ten clips the arms grow out of the chest with a sloped shoulder, instead of capsules pushed into the shirt. Overhead they no longer hang beside the neck, and standing the shoulders no longer rise above the collar. In Lat Pulldown the skin of the arms no longer snaps round mid-rep (largest step of any point in 1/80 of a rep: 11.9 to 0.9 units). Found by a character artist who lifts, all clips; the snap by my own measurement. Proof: two form tests that failed on the old code, and before and after renders from four sides. The joint sits 1.6 units lower; incline, pulldown, row and chest press were re-fitted to keep their elbow angles within 2 degrees. Shoulder Press ends straighter (158 degrees, was 143), closer to its step. The review's other findings, left as they are: at the top of the pulldown the upper arm still has a visible outline over the back, the shoulder tint is now a band round the sleeve, and from the exact side the arm sits low.
