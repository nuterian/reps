import { test } from 'node:test';
import assert from 'node:assert/strict';
import { habits, habitText, weekPlan, weekText, catchUp, pickShort, forecast, swapCounts } from '../src/smart.js';
import { family } from '../src/build.js';
import { EXERCISES, ROUTINES } from '../src/seed.js';

const DAY = 86400000;
const nov = (day, hour = 10) => new Date(2026, 10, day, hour).getTime(); // 2 Nov 2026 is a Monday
const oct = (day, hour = 18) => new Date(2026, 9, day, hour).getTime();  // 5 Oct 2026 is a Monday

test('habits: usual weekdays and time of day, once there is enough to go on', () => {
  const times = [5, 7, 9, 12, 14, 16, 19, 21, 23, 26, 28, 30].map((d) => oct(d)); // Mon, Wed, Fri evenings
  const h = habits(times, nov(2));
  assert.deepEqual(h, { days: [0, 2, 4], when: 'evening' });
  assert.equal(habitText(h), 'You usually train on Monday, Wednesday and Friday evenings.');
  assert.equal(habits(times.slice(0, 5), nov(2)), null, 'five sessions is too few');
  const scattered = [5, 6, 7, 8, 9, 10, 11].map((d) => oct(d));
  assert.equal(habits(scattered, nov(2)), null, 'no weekday stands out');
  const mixed = times.map((t, i) => t - (i % 2 ? 10 : 0) * 3600000); // half at 8:00
  assert.equal(habits(mixed, nov(2)).when, null, 'no time of day stands out');
  assert.equal(habitText({ days: [1], when: null }), 'You usually train on Tuesday.');
  assert.equal(habits(times, oct(30) + 100 * DAY), null, 'sessions older than 12 weeks do not count');
});

const plan = (o) => weekPlan({ target: 3, ...o });
const said = (o) => weekText(plan(o), 3, o.now);

test('week plan: before the first session there is no pressure', () => {
  assert.equal(plan({ count: 0, now: nov(7) }).state, 'new');
  assert.equal(said({ count: 0, now: nov(7) }), 'Train any 3 days this week. Weeks run Monday to Sunday.');
});

test('week plan: suggests days with a rest day between, as early as possible', () => {
  // Monday, just trained: Wednesday and Friday, not left to the weekend.
  assert.deepEqual(plan({ count: 1, now: nov(2, 11), last: nov(2) }).days, [2, 4]);
  assert.equal(said({ count: 1, now: nov(2, 11), last: nov(2) }), '2 to go, 6 days left. Wednesday and Friday would make 3.');
  // Wednesday, trained Monday.
  assert.equal(said({ count: 1, now: nov(4, 18), last: nov(2) }), '2 to go, 5 days left. Today and Friday would make 3.');
  // A new week.
  assert.equal(said({ count: 0, now: nov(9), last: nov(6) }), '3 to go, 7 days left. Today, Wednesday and Friday would make 3.');
  // Trained yesterday, one to go: rest today.
  assert.equal(said({ count: 2, now: nov(5), last: nov(4) }), '1 to go, 4 days left. Tomorrow would make 3.');
});

test('week plan: prefers the days you usually train', () => {
  const p = plan({ count: 0, now: nov(3), last: oct(30), usual: [0, 2, 4] }); // a Tuesday
  assert.deepEqual(p.days, [1, 3, 5]);
  assert.equal(weekText(p, 3, nov(3)), '3 to go, 6 days left. Tomorrow, Friday and Sunday would make 3.');
  assert.deepEqual(plan({ count: 0, now: nov(3), last: oct(30) }).days, [0, 2, 4], 'without habits it spreads from today');
});

test('week plan: tight, out of reach and done', () => {
  const sat = plan({ count: 1, now: nov(14), last: nov(9) });
  assert.equal(sat.state, 'tight');
  assert.equal(weekText(sat, 3, nov(14)), '2 to go, 2 days left. Today and tomorrow would make 3.');
  const sun = plan({ count: 1, now: nov(15), last: nov(9) });
  assert.deepEqual([sun.state, sun.left, sun.daysLeft], ['out', 2, 1]);
  assert.equal(weekText(sun, 3, nov(15)), '3 is out of reach this week.');
  assert.equal(plan({ count: 2, now: nov(15, 12), last: nov(15) }).state, 'out', 'trained today, so Sunday is used up');
  assert.equal(said({ count: 3, now: nov(6, 12), last: nov(6) }), 'Week on target.');
  assert.equal(plan({ count: 4, now: nov(7), last: nov(6) }).state, 'done');
});

const fam = (id) => family(EXERCISES.find((x) => x.id === id));

test('catch-up: takes turns between routines and prefers what the week missed', () => {
  const routines = structuredClone(ROUTINES);
  routines[1].items[0].ex = 'db-rdl';
  assert.deepEqual(catchUp(routines, 0, fam, new Set(['db-rdl'])).map((i) => i.ex),
    ['leg-press', 'incline-db-press', 'seated-row', 'leg-curl']);
  assert.deepEqual(catchUp(ROUTINES, 1, fam, new Set()).map((i) => i.ex),
    ['rdl', 'chest-press', 'lat-pulldown', 'leg-press']);
  const item = catchUp(ROUTINES, 0, fam, new Set())[0];
  assert.deepEqual(item, { ex: 'leg-press', sets: 3, min: 8, max: 12 }, 'optional flag and extras are dropped');
  // A program with no leg or pull work still gets four exercises.
  const pushOnly = [{ items: ['chest-press', 'db-shoulder-press', 'incline-db-press', 'pec-deck', 'db-bench'].map((ex) => ({ ex, sets: 3, min: 8, max: 12 })) }];
  assert.equal(catchUp(pushOnly, 0, fam, new Set()).length, 4);
});

test('short version: closest to a weight increase, then a different family', () => {
  const c = (ex, gap, f) => ({ item: { ex, sets: 3, min: 8, max: 12 }, gap, fam: f });
  const cands = [c('leg-press', 4, 'legs'), c('chest-press', 4, 'push'), c('seated-row', 0, 'pull'), c('db-shoulder-press', 7, 'push')];
  assert.deepEqual(pickShort(cands), [
    { ex: 'leg-press', sets: 2, min: 8, max: 12 },
    { ex: 'seated-row', sets: 2, min: 8, max: 12 },
  ]);
  const fresh = cands.map((x) => ({ ...x, gap: Infinity }));
  assert.deepEqual(pickShort(fresh).map((i) => i.ex), ['leg-press', 'chest-press'], 'no history: the first two families');
  const same = [c('chest-press', 3, 'push'), c('incline-db-press', 1, 'push')];
  assert.deepEqual(pickShort(same).map((i) => i.ex), ['chest-press', 'incline-db-press']);
  assert.deepEqual(pickShort([c('leg-press', 2, 'legs')]).length, 1);
});

test('forecast: next round weights with dates, from the trend', () => {
  // 40 kg for 10, 11, 12, 13 reps a week apart: estimated strength rises
  // 40/30 per week from 40 x (1 + 13/30). 45 kg needs 9/8 of that level.
  const t0 = nov(2);
  const pts = [10, 11, 12, 13].map((r, i) => ({ t: t0 + i * 7 * DAY, w: 40, r }));
  const now = pts[3].t;
  const f = forecast(pts, { round: 5, now });
  assert.deepEqual([f.weight, f.sessions, f.rising], [40, 4, true]);
  // 45 kg is 37.625 days out, inside twice the 21 days of history. 50 kg is
  // 75.25 days out, which is further than it will look.
  assert.deepEqual(f.goals.map((g) => g.weight), [45]);
  assert.ok(Math.abs((f.goals[0].t - now) / DAY - 37.625) < 1e-6);
  // Same rate over 8 sessions (49 days of history): both goals are in range.
  const long = Array.from({ length: 8 }, (_, i) => ({ t: t0 + i * 7 * DAY, w: 40, r: 6 + i }));
  const g = forecast(long, { round: 5, now: long[7].t }).goals;
  assert.deepEqual(g.map((x) => x.weight), [45, 50]);
  assert.ok(Math.abs((g[0].t - long[7].t) / DAY - 37.625) < 1e-6, '45 kg date');
  assert.ok(Math.abs((g[1].t - long[7].t) / DAY - 75.25) < 1e-6, '50 kg date');
});

test('forecast: stays quiet or plain when there is nothing to project', () => {
  const pts = (reps, w = 40) => reps.map((r, i) => ({ t: nov(2) + i * 7 * DAY, w, r }));
  const now = nov(2) + 21 * DAY;
  assert.equal(forecast(pts([10, 11, 12]), { round: 5, now }), null, 'three sessions is too few');
  assert.equal(forecast(pts([10, 10, 10, 10], null), { round: 5, now }), null, 'no weight, no forecast');
  assert.deepEqual(forecast(pts([10, 10, 10, 10]), { round: 5, now }), { weight: 40, sessions: 4, rising: false, goals: [] }, 'flat trend');
  assert.equal(forecast(pts([12, 11, 10, 9]), { round: 5, now }).rising, false, 'falling trend');
  const slow = [10, 10, 10, 11].map((r, i) => ({ t: nov(2) + i * 60 * DAY, w: 40, r }));
  const far = forecast(slow, { round: 5, now: slow[3].t });
  assert.deepEqual([far.rising, far.goals], [true, []], 'rising, but more than half a year away');
  // A fast first fortnight does not get to promise months: 4 sessions in 6 days.
  const burst = [10, 11, 12, 13].map((r, i) => ({ t: nov(2) + i * 2 * DAY, w: 40, r }));
  assert.deepEqual(forecast(burst, { round: 5, now: burst[3].t }).goals.map((x) => x.weight), [45], '45 kg is 10.75 days out, 50 kg 21.5 days');
  // Round steps: 42.5 kg heads for 45, 135 lb for 140.
  assert.equal(forecast(pts([10, 11, 12, 13], 42.5), { round: 5, now }).goals[0].weight, 45);
  assert.equal(forecast(pts([10, 11, 12, 13], 135), { round: 10, now }).goals[0].weight, 140);
  // A date already behind us is shown as a few days out, never in the past.
  const late = forecast(pts([10, 11, 12, 13]), { round: 5, now: now + 80 * DAY });
  assert.ok(late.goals.every((g) => g.t >= now + 83 * DAY));
});

test('swap counts: how often each exercise stood in for another', () => {
  const s = (...entries) => ({ entries });
  const sessions = [
    s({ ex: 'db-rdl', swapped: 'rdl' }, { ex: 'lat-pulldown' }),
    s({ ex: 'db-rdl', swapped: 'rdl' }),
    s({ ex: 'back-extension', swapped: 'rdl' }, { ex: 'hack-squat', swapped: 'leg-press' }),
  ];
  assert.deepEqual([...swapCounts(sessions, 'rdl')], [['db-rdl', 2], ['back-extension', 1]]);
  assert.equal(swapCounts(sessions, 'chest-press').size, 0);
});
