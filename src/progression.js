// Pure rules: what to aim for next time, what counts as a win, which routine
// is next, and how many weeks hit the target. No storage, no DOM.
import { round2 } from './units.js';

const DAY = 86400000;
export const GAP_DAYS = 14;

// One past performance of an exercise, reduced to its working weight (the
// weight of the last set) and the reps done at that weight.
export function perf(sets) {
  if (!sets?.length) return null;
  const w = sets[sets.length - 1].w ?? null;
  const reps = sets.filter((s) => (s.w ?? null) === w).map((s) => s.r);
  return { w, reps, total: reps.reduce((a, b) => a + b, 0) };
}

// history: [{ date, sets: [{ w, r }] }], most recent first, in display units.
// Returns { rule, weight, reps: target per set, reason }.
export function suggest({ history, sets, min, max, step, weighted, now }) {
  const fill = (r) => Array(sets).fill(r);
  const last = perf(history[0]?.sets);

  if (!last) {
    if (!weighted) return { rule: 'first', weight: null, reps: fill(min), reason: `Start with ${min} clean reps per set.` };
    const target = Math.min(max, Math.max(min, 10));
    return {
      rule: 'first',
      weight: null,
      reps: fill(target),
      reason: `Pick a weight you could lift about ${target + 5} times, then do ${target}.`,
    };
  }

  const away = Math.floor((now - history[0].date) / DAY);
  const reps = last.reps.slice(0, sets);
  while (reps.length < sets) reps.push(min);
  const bump = () => {
    let i = reps.findIndex((r) => r < max);
    if (i < 0) i = 0;
    reps[i] += 1;
    return i + 1;
  };

  if (!weighted) {
    if (away >= GAP_DAYS) {
      return { rule: 'back', weight: null, reps: reps.map((r) => Math.max(1, Math.floor(r * 0.9))), reason: `${away} days away. A little easier today.` };
    }
    return { rule: 'rep', weight: null, reps, reason: `One more rep on set ${bump()}.` };
  }

  // About 10 percent lighter, on the step grid, and at least one step down.
  const lighter = last.w > step
    ? round2(Math.min(last.w - step, Math.floor(round2(last.w * 0.9) / step) * step))
    : last.w;

  if (away >= GAP_DAYS) {
    return { rule: 'back', weight: lighter, reps: fill(min), reason: `${away} days away. About 10 percent lighter to ease back in.` };
  }
  const first = last.reps[0];
  const before = perf(history[1]?.sets);
  if (first < min && before && before.reps[0] < min && lighter < last.w) {
    return { rule: 'down', weight: lighter, reps: fill(min), reason: `Below ${min} reps two sessions running. Drop about 10 percent and build back.` };
  }
  if (first >= max + 3) {
    return { rule: 'up2', weight: round2(last.w + 2 * step), reps: fill(min), reason: `${first} reps is well past ${max}. Jump two steps, aim for ${min}.` };
  }
  if (last.reps.length >= sets && last.reps.every((r) => r >= max)) {
    return { rule: 'up', weight: round2(last.w + step), reps: fill(min), reason: `Every set reached ${max}. Add weight, aim for ${min}.` };
  }
  return { rule: 'rep', weight: last.w, reps, reason: `Same weight. One more rep on set ${bump()}.` };
}

// prev and cur are perf() results. A win is more weight, or the same weight
// with more total reps.
export function compare(prev, cur, weighted) {
  if (!prev) return { status: 'first' };
  if (weighted && cur.w !== prev.w) {
    return { status: cur.w > prev.w ? 'win' : 'less', dw: round2(cur.w - prev.w) };
  }
  const dr = cur.total - prev.total;
  return { status: dr > 0 ? 'win' : dr < 0 ? 'less' : 'same', dr };
}

// The routine after the one most recently finished, in rotation order.
export function nextRoutine(routines, sessions) {
  if (!routines.length) return null;
  const ids = routines.map((r) => r.id);
  const last = sessions
    .filter((s) => s.end && ids.includes(s.routineId))
    .reduce((a, b) => (!a || b.start > a.start ? b : a), null);
  return last ? routines[(ids.indexOf(last.routineId) + 1) % routines.length] : routines[0];
}

// Local midnight on the Monday of the week containing ts.
export function weekStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

// Weeks on target out of the last `span`. The current week counts only once
// it has hit the target, so an unfinished week is never held against you.
// Before `span` weeks of history exist, counting starts at the first session.
export function hitRate(times, target, now, span = 12) {
  const counts = new Map();
  for (const t of times) counts.set(weekStart(t), (counts.get(weekStart(t)) || 0) + 1);
  const cur = weekStart(now);
  const first = times.length ? Math.min(...counts.keys()) : cur;
  const weeks = [];
  const d = new Date(cur);
  while (weeks.length <= span && d.getTime() >= first) {
    const count = counts.get(d.getTime()) || 0;
    weeks.unshift({ start: d.getTime(), count, hit: count >= target });
    d.setDate(d.getDate() - 7);
  }
  const current = weeks[weeks.length - 1];
  const scored = current.hit ? weeks.slice(-span) : weeks.slice(0, -1).slice(-span);
  return { weeks: scored, current, hit: scored.filter((w) => w.hit).length, of: scored.length };
}
