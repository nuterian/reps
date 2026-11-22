// The rules that make the app act on what it has seen: planning the rest of
// the week, shorter sessions, forecasts and habits. Pure: no storage, no DOM.
import { round2 } from './units.js';

const DAY = 86400000;
const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayIndex = (ts) => (new Date(ts).getDay() + 6) % 7; // 0 is Monday
const dayStart = (ts) => new Date(ts).setHours(0, 0, 0, 0);
const daysApart = (a, b) => Math.round((dayStart(b) - dayStart(a)) / DAY);
const list = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The weekdays and time of day the user really trains on, from the last 12
// weeks. Says nothing until there are 6 sessions to go on.
export function habits(times, now) {
  const recent = times.filter((t) => t <= now && now - t < 84 * DAY);
  if (recent.length < 6) return null;
  const perDay = Array(7).fill(0);
  const parts = { morning: 0, afternoon: 0, evening: 0 };
  for (const t of recent) {
    perDay[dayIndex(t)] += 1;
    const hour = new Date(t).getHours();
    parts[hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'] += 1;
  }
  const days = perDay.flatMap((n, i) => (n >= 3 && n / recent.length >= 0.2 ? [i] : []));
  if (!days.length) return null;
  return { days, when: Object.keys(parts).find((k) => parts[k] / recent.length >= 0.6) ?? null };
}

export const habitText = (h) =>
  `You usually train on ${list(h.days.map((d) => NAMES[d]))}${h.when ? ` ${h.when}s` : ''}.`;

// What it takes to still hit the weekly target. `last` is the start of the
// most recent session, `usual` the weekdays from habits().
// state: 'new' (never trained), 'done', 'open', 'tight' (no day to spare) or
// 'out' (out of reach). days: suggested day offsets from today.
export function weekPlan({ count, target, now, last = null, usual = [] }) {
  const today = dayIndex(now);
  const trainedToday = last != null && daysApart(last, now) === 0;
  const free = [];
  for (let o = trainedToday ? 1 : 0; today + o <= 6; o++) free.push(o);
  const left = Math.max(0, target - count);
  const state = last == null ? 'new' : !left ? 'done' : left > free.length ? 'out' : left === free.length ? 'tight' : 'open';
  const plan = { state, left, daysLeft: free.length, trainedToday, days: [] };
  if (state !== 'open' && state !== 'tight') return plan;

  // Choose the days: usual days first, then a rest day in between where
  // possible, then the earliest, so the week is not left to its last day.
  const anchor = daysApart(last, now) < 7 ? [-daysApart(last, now)] : [];
  const score = (days) => {
    const all = [...anchor, ...days];
    const gap = Math.min(2, ...all.slice(1).map((d, i) => d - all[i]));
    return [days.filter((o) => usual.includes(today + o)).length, gap, -days.reduce((a, b) => a + b, 0)];
  };
  const better = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return false;
  };
  const walk = (from, chosen) => {
    if (chosen.length === left) {
      if (!plan.days.length || better(score(chosen), score(plan.days))) plan.days = chosen;
      return;
    }
    for (let i = from; i < free.length; i++) walk(i + 1, [...chosen, free[i]]);
  };
  walk(0, []);
  return plan;
}

export function weekText(plan, target, now) {
  if (plan.state === 'new') return `Train any ${target} days this week. Weeks run Monday to Sunday.`;
  if (plan.state === 'done') return 'Week on target.';
  if (plan.state === 'out') return `${target} is out of reach this week.`;
  const name = (o) => (o === 0 ? 'today' : o === 1 ? 'tomorrow' : NAMES[dayIndex(now) + o]);
  const days = `${plan.daysLeft} ${plan.daysLeft === 1 ? 'day' : 'days'} left`;
  return `${plan.left} to go, ${days}. ${cap(list(plan.days.map(name)))} would make ${target}.`;
}

// One session that touches both leg patterns, a push and a pull, taking turns
// between the routines and preferring what was not trained this week.
// familyOf: exercise id -> 'legs' | 'push' | 'pull' | 'extra'. done: ids
// already trained this week. start: index of the routine next in rotation.
export function catchUp(routines, start, familyOf, done) {
  const picked = [];
  const core = (r) => r.items.filter((it) => !it.optional && !picked.some((p) => p.ex === it.ex));
  const take = (pool) => {
    const it = pool.find((x) => !done.has(x.ex)) ?? pool[0];
    if (it) picked.push({ ex: it.ex, sets: it.sets, min: it.min, max: it.max });
  };
  const turn = (k) => routines.map((_, i) => routines[(start + k + i) % routines.length]);
  ['legs', 'push', 'pull', 'legs'].forEach((fam, k) => take(turn(k).flatMap(core).filter((it) => familyOf(it.ex) === fam)));
  while (picked.length < 4 && turn(0).flatMap(core).length) take(turn(0).flatMap(core));
  return picked;
}

// The short version of a routine: the exercise closest to a weight increase
// and the closest one from a different family, two sets each.
// cands: [{ item, gap, fam }] in routine order; gap is reps still missing
// before the weight goes up (Infinity without history).
export function pickShort(cands) {
  if (!cands.length) return [];
  const byGap = [...cands].sort((a, b) => (a.gap === b.gap ? 0 : a.gap < b.gap ? -1 : 1));
  const first = byGap[0];
  const second = byGap.find((c) => c !== first && c.fam !== first.fam) ?? byGap[1];
  return cands.filter((c) => c === first || c === second).map((c) => ({ ...c.item, sets: 2 }));
}

// Where the trend is heading. points: [{ t, w, r }] oldest first: time,
// working weight and first-set reps of each session. Strength is estimated
// as weight x (1 + reps / 30), fitted with a straight line over the last 8
// sessions, and assumed to keep rising at that rate.
// It looks at most twice as far ahead as the history it is built on (and
// never past half a year), so a fast first fortnight cannot promise months.
// Returns null with fewer than 4 sessions, else
// { weight, sessions, rising, goals }. goals: the next two round weights
// with a date, as far as the horizon allows.
export function forecast(points, { round, now }) {
  const pts = points.filter((p) => p.w > 0).slice(-8);
  if (pts.length < 4) return null;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const x = pts.map((p) => p.t);
  const y = pts.map((p) => p.w * (1 + p.r / 30));
  const mx = mean(x);
  const my = mean(y);
  const spread = x.reduce((a, v) => a + (v - mx) ** 2, 0);
  const slope = spread ? x.reduce((a, v, i) => a + (v - mx) * (y[i] - my), 0) / spread : 0;
  const last = pts[pts.length - 1];
  const level = my + slope * (last.t - mx);
  const out = { weight: last.w, sessions: pts.length, rising: slope > 0 && level > 0, goals: [] };
  if (!out.rising) return out;
  const horizon = Math.min(182 * DAY, 2 * (last.t - pts[0].t));
  let goal = (Math.floor(round2(last.w / round)) + 1) * round;
  for (let n = 0; n < 2; n++, goal += round) {
    const t = last.t + (level * (goal / last.w) - level) / slope;
    if (t - last.t > horizon) break;
    out.goals.push({ weight: round2(goal), t: Math.max(t, now + 3 * DAY) });
  }
  return out;
}

// How often each exercise was swapped in for `from`: Map of id -> count.
export function swapCounts(sessions, from) {
  const counts = new Map();
  for (const s of sessions) {
    for (const e of s.entries) if (e.swapped === from) counts.set(e.ex, (counts.get(e.ex) || 0) + 1);
  }
  return counts;
}
