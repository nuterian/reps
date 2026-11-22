import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggest, compare, perf, nextRoutine, weekStart, hitRate } from '../src/progression.js';
import { toDisplay, toKg, stepFor } from '../src/units.js';

const DAY = 86400000;
const NOW = new Date(2026, 10, 6, 10).getTime(); // Fri 6 Nov 2026
const at = (w, ...reps) => reps.map((r) => ({ w, r }));
const past = (daysAgo, sets) => ({ date: NOW - daysAgo * DAY, sets });
const run = (history, o = {}) =>
  suggest({ history, sets: 3, min: 8, max: 12, step: 5, weighted: true, now: NOW, ...o });

test('no history: no weight, aim for 10', () => {
  const s = run([]);
  assert.equal(s.rule, 'first');
  assert.equal(s.weight, null);
  assert.deepEqual(s.reps, [10, 10, 10]);
  assert.match(s.reason, /about 15 times, then do 10/);
});

test('no history with a range that excludes 10 uses the bottom of the range', () => {
  const s = run([], { min: 12, max: 15 });
  assert.deepEqual(s.reps, [12, 12, 12]);
  assert.match(s.reason, /about 17 times, then do 12/);
});

test('every set at the top: one step up, bottom of the range', () => {
  const s = run([past(2, at(40, 12, 12, 12))]);
  assert.equal(s.rule, 'up');
  assert.equal(s.weight, 45);
  assert.deepEqual(s.reps, [8, 8, 8]);
});

test('top of range on fewer sets than planned is not enough to add weight', () => {
  const s = run([past(2, at(40, 12, 12))]);
  assert.equal(s.rule, 'rep');
  assert.equal(s.weight, 40);
  assert.deepEqual(s.reps, [12, 12, 9]);
});

test('first set 3 or more past the top: two steps up', () => {
  const s = run([past(2, at(40, 15, 10, 10))]);
  assert.equal(s.rule, 'up2');
  assert.equal(s.weight, 50);
  assert.deepEqual(s.reps, [8, 8, 8]);
  assert.equal(run([past(2, at(40, 14, 10, 10))]).rule, 'rep');
});

test('otherwise: same weight, one more rep on the first set below the top', () => {
  let s = run([past(2, at(40, 11, 10, 9))]);
  assert.equal(s.rule, 'rep');
  assert.equal(s.weight, 40);
  assert.deepEqual(s.reps, [12, 10, 9]);
  assert.match(s.reason, /set 1/);
  s = run([past(2, at(40, 12, 10, 9))]);
  assert.deepEqual(s.reps, [12, 11, 9]);
  assert.match(s.reason, /set 2/);
});

test('first set below the bottom twice running: about 10 percent lighter', () => {
  const s = run([past(2, at(40, 6, 6, 5)), past(4, at(40, 7, 6, 6))]);
  assert.equal(s.rule, 'down');
  assert.equal(s.weight, 35);
  assert.deepEqual(s.reps, [8, 8, 8]);
  assert.equal(run([past(2, at(40, 6, 6, 5)), past(4, at(40, 7, 6, 6))], { step: 2.5 }).weight, 35);
});

test('one bad session alone does not drop the weight', () => {
  const s = run([past(2, at(40, 7, 6, 5)), past(4, at(40, 8, 8, 8))]);
  assert.equal(s.rule, 'rep');
  assert.deepEqual(s.reps, [8, 6, 5]);
});

test('a drop is always at least one step and never below one step', () => {
  // 10 percent of 20 is 2, less than a 5 step, so drop a full step.
  assert.equal(run([past(2, at(20, 5, 5, 5)), past(4, at(20, 5, 5, 5))]).weight, 15);
  // Already at one step: nothing lighter exists, so keep chasing reps.
  const s = run([past(2, at(5, 5, 5, 5)), past(4, at(5, 5, 5, 5))]);
  assert.equal(s.rule, 'rep');
  assert.equal(s.weight, 5);
});

test('14 days away: lighter and bottom of the range, 13 days is not a break', () => {
  const s = run([past(14, at(40, 12, 12, 12))]);
  assert.equal(s.rule, 'back');
  assert.equal(s.weight, 35);
  assert.deepEqual(s.reps, [8, 8, 8]);
  assert.match(s.reason, /^14 days away/);
  assert.equal(run([past(13, at(40, 12, 12, 12))]).rule, 'up');
});

test('pounds use the pound step', () => {
  assert.equal(run([past(2, at(135, 12, 12, 12))]).weight, 140);
  assert.equal(run([past(20, at(135, 10, 10, 10))]).weight, 120);
});

test('a weight change mid-session: the last weight used is the working weight', () => {
  const sets = [...at(40, 10), ...at(45, 8, 8)];
  assert.deepEqual(perf(sets), { w: 45, reps: [8, 8], total: 16 });
  const s = run([past(2, sets)]);
  assert.equal(s.weight, 45);
  assert.deepEqual(s.reps, [9, 8, 8]);
});

test('bodyweight: reps only', () => {
  const bw = (history) => run(history, { weighted: false });
  assert.deepEqual(bw([]).reps, [8, 8, 8]);
  assert.deepEqual(bw([past(2, at(null, 8, 7, 6))]).reps, [9, 7, 6]);
  assert.deepEqual(bw([past(2, at(null, 12, 12, 12))]).reps, [13, 12, 12]);
  const back = bw([past(20, at(null, 10, 10, 9))]);
  assert.equal(back.rule, 'back');
  assert.deepEqual(back.reps, [9, 9, 8]);
  assert.equal(back.weight, null);
});

test('compare: more weight wins, same weight needs more total reps', () => {
  const p = (w, ...reps) => perf(at(w, ...reps));
  assert.deepEqual(compare(null, p(40, 10, 10, 10), true), { status: 'first' });
  assert.deepEqual(compare(p(40, 12, 12, 12), p(45, 8, 8, 8), true), { status: 'win', dw: 5 });
  assert.deepEqual(compare(p(40, 10, 10, 10), p(40, 11, 10, 10), true), { status: 'win', dr: 1 });
  assert.deepEqual(compare(p(40, 10, 10, 10), p(40, 10, 10, 10), true), { status: 'same', dr: 0 });
  assert.deepEqual(compare(p(40, 10, 10, 10), p(40, 9, 10, 10), true), { status: 'less', dr: -1 });
  assert.deepEqual(compare(p(40, 8, 8, 8), p(35, 12, 12, 12), true), { status: 'less', dw: -5 });
  assert.deepEqual(compare(p(null, 8, 8, 8), p(null, 9, 8, 8), false), { status: 'win', dr: 1 });
});

test('next routine rotates and ignores unfinished or deleted routines', () => {
  const routines = [{ id: 'a' }, { id: 'b' }];
  const s = (routineId, start, end = start + 1) => ({ routineId, start, end });
  assert.equal(nextRoutine([], []), null);
  assert.equal(nextRoutine(routines, []).id, 'a');
  assert.equal(nextRoutine(routines, [s('a', 1)]).id, 'b');
  assert.equal(nextRoutine(routines, [s('a', 1), s('b', 2)]).id, 'a');
  assert.equal(nextRoutine(routines, [s('b', 2), s('a', 1)]).id, 'a');
  assert.equal(nextRoutine(routines, [s('a', 1), s('b', 2, null)]).id, 'b');
  assert.equal(nextRoutine(routines, [s('a', 1), s('gone', 2)]).id, 'b');
});

test('weeks run Monday to Sunday in local time', () => {
  const mon = new Date(2026, 10, 2).getTime();
  assert.equal(weekStart(new Date(2026, 10, 2, 0, 0).getTime()), mon);
  assert.equal(weekStart(new Date(2026, 10, 8, 23, 59).getTime()), mon);
  assert.equal(weekStart(new Date(2026, 10, 9, 0, 0).getTime()), new Date(2026, 10, 9).getTime());
  // The week of 26 Oct 2026 contains the US clock change.
  assert.equal(weekStart(new Date(2026, 10, 1, 15).getTime()), new Date(2026, 9, 26).getTime());
});

test('hit rate: the current week counts only once it is on target', () => {
  const d = (day, hour = 10) => new Date(2026, 10, day, hour).getTime();
  const times = [d(2), d(4)];
  let r = hitRate(times, 3, d(4, 12));
  assert.deepEqual([r.hit, r.of, r.current.count, r.current.hit], [0, 0, 2, false]);
  times.push(d(6));
  r = hitRate(times, 3, d(6, 12));
  assert.deepEqual([r.hit, r.of, r.current.count, r.current.hit], [1, 1, 3, true]);
  times.push(d(9));
  r = hitRate(times, 3, d(30));
  assert.deepEqual([r.hit, r.of, r.current.count], [1, 4, 0]);
  assert.deepEqual(r.weeks.map((w) => w.count), [3, 1, 0, 0]);
});

test('hit rate: no sessions at all', () => {
  const r = hitRate([], 3, NOW);
  assert.deepEqual([r.hit, r.of, r.current.count], [0, 0, 0]);
});

test('hit rate: window is 12 weeks and weeks stay contiguous across a clock change', () => {
  const times = [];
  for (let w = 0; w < 20; w++) times.push(new Date(2026, 5, 1 + w * 7, 10).getTime()); // 20 Mondays
  const now = times[19] + 3600000;
  let r = hitRate(times, 1, now);
  assert.deepEqual([r.hit, r.of], [12, 12]);
  r = hitRate(times, 2, now);
  assert.deepEqual([r.hit, r.of, r.current.count], [0, 12, 1]);
  r = hitRate([new Date(2026, 9, 20, 10).getTime(), new Date(2026, 10, 3, 10).getTime()], 1, new Date(2026, 10, 3, 12).getTime());
  assert.deepEqual(r.weeks.map((w) => w.hit), [true, false, true]);
});

test('units: pounds round to the half pound and survive a round trip', () => {
  assert.equal(toDisplay(toKg(135, 'lb'), 'lb'), 135);
  assert.equal(toDisplay(toKg(47.5, 'lb'), 'lb'), 47.5);
  assert.equal(toDisplay(32.5, 'kg'), 32.5);
  assert.equal(toDisplay(null, 'kg'), null);
  assert.equal(stepFor({ equip: 'barbell' }, 'kg'), 2.5);
  assert.equal(stepFor({ equip: 'dumbbell' }, 'kg'), 2);
  assert.equal(stepFor({ equip: 'machine' }, 'lb'), 10);
  assert.equal(stepFor({ equip: 'machine', step: { kg: 2.5 } }, 'kg'), 2.5);
});
