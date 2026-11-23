// Session logic on top of the store: building a session from a routine,
// finishing it, and comparing it with last time.
import { state, saveSession, deleteSession } from './store.js';
import { suggest, perf, compare, nextRoutine, weekStart } from './progression.js';
import { toDisplay, toKg, stepFor, fmt } from './units.js';
import { family } from './build.js';
import { habits, weekPlan, catchUp, pickShort, forecast, gain, backupDue } from './smart.js';

export const unit = () => state.settings.unit;
export const kindOf = (ex) => (ex.equip === 'cardio' ? 'time' : ex.equip === 'bodyweight' ? 'reps' : 'weight');
export const doneSets = (entry) => entry.sets.filter((s) => s.done);
export const logged = (s) => s.entries.some((e) => doneSets(e).length) || !!s.cardio?.done;
export const finished = () => state.sessions.filter((s) => s.end);
export const activeSession = () => state.sessions.find((s) => !s.end);
export const upNext = () => nextRoutine(state.routines, state.sessions);
export const cardioTypes = () => [...state.exercises.values()].filter((e) => e.equip === 'cardio' && !e.hidden);

// Past performances of one exercise, most recent first, in display units.
export function historyFor(exId, before = Infinity, limit = 2) {
  const out = [];
  for (let i = state.sessions.length - 1; i >= 0 && out.length < limit; i--) {
    const s = state.sessions[i];
    if (s.start >= before) continue;
    const sets = s.entries
      .filter((e) => e.ex === exId)
      .flatMap(doneSets)
      .map((x) => ({ w: toDisplay(x.w, unit()), r: x.r }));
    if (sets.length) out.push({ date: s.start, sets });
  }
  return out;
}

// The heaviest set ever logged, most reps first among equals.
export function bestSet(exId) {
  return historyFor(exId, Infinity, Infinity)
    .flatMap((p) => p.sets.map((set) => ({ set, date: p.date })))
    .reduce((a, b) => (!a || (b.set.w ?? 0) > (a.set.w ?? 0) || (b.set.w === a.set.w && b.set.r > a.set.r) ? b : a), null);
}

// The suggestion for a routine item, in display units.
export function plan(item, now = Date.now()) {
  const ex = state.exercises.get(item.ex);
  return suggest({
    history: historyFor(item.ex),
    sets: item.sets,
    min: item.min,
    max: item.max,
    step: stepFor(ex, unit()),
    weighted: kindOf(ex) === 'weight',
    now,
  });
}

export function makeEntry(item, now = Date.now()) {
  const p = plan(item, now);
  const w = toKg(p.weight, unit());
  return {
    ex: item.ex,
    min: item.min,
    max: item.max,
    ...(item.optional && { optional: true }),
    reason: p.reason,
    sets: p.reps.map((r) => ({ w, r, done: false })),
  };
}

export function newCardio() {
  for (let i = state.sessions.length - 1; i >= 0; i--) {
    const c = state.sessions[i].cardio;
    if (c?.done) return { ex: c.ex, min: c.min, done: false };
  }
  return { ex: cardioTypes()[0]?.id ?? null, min: 10, done: false };
}

// plan: { routineId, name, items }. A catch-up has no routine, so it does not
// move the rotation on.
export function startSession({ routineId, name, items }) {
  const now = Date.now();
  const s = {
    id: 's' + now.toString(36),
    routineId,
    name,
    start: now,
    end: null,
    entries: items.map((it) => makeEntry(it, now)),
    cardio: newCardio(),
  };
  saveSession(s);
  return s;
}

// Keep only what was actually done. A session with nothing logged is dropped.
export function finish(s) {
  for (const e of s.entries) e.sets = doneSets(e);
  s.entries = s.entries.filter((e) => e.sets.length);
  if (!s.cardio?.done) s.cardio = null;
  if (!logged(s)) {
    deleteSession(s);
    return false;
  }
  const times = [...s.entries.flatMap((e) => e.sets.map((x) => x.t)), s.cardio?.t].filter(Boolean);
  s.end ??= times.length ? Math.max(...times) : Date.now();
  saveSession(s);
  return true;
}

// Each logged exercise against the session before, plus the next target when
// this is the most recent session for that exercise.
export function review(s) {
  const rows = s.entries.filter((e) => doneSets(e).length).map((e) => {
    const ex = state.exercises.get(e.ex);
    const weighted = kindOf(ex) === 'weight';
    const sets = doneSets(e).map((x) => ({ w: toDisplay(x.w, unit()), r: x.r }));
    const cmp = compare(perf(historyFor(e.ex, s.start, 1)[0]?.sets), perf(sets), weighted);
    const latest = !state.sessions.some((o) => o.start > s.start && o.entries.some((x) => x.ex === e.ex && doneSets(x).length));
    // The plan for next time follows the routine this exercise lives in.
    const own = state.routines.find((r) => r.id === s.routineId);
    const item = [own, ...state.routines].flatMap((r) => r?.items ?? []).find((i) => i.ex === e.ex)
      ?? { ex: e.ex, sets: e.sets.length, min: e.min, max: e.max };
    return { ex, weighted, sets, cmp, next: latest ? plan(item) : null, pace: latest && weighted ? paceText(e.ex) : null };
  });
  const compared = rows.filter((r) => r.cmp.status !== 'first');
  return { rows, wins: compared.filter((r) => r.cmp.status === 'win').length, of: compared.length };
}

// This week so far: the plan to still hit the target, and the user's habits.
export function week(now = Date.now()) {
  const times = finished().map((s) => s.start);
  const usual = habits(times, now);
  const plan = weekPlan({
    count: times.filter((t) => weekStart(t) === weekStart(now)).length,
    target: state.settings.weeklyTarget,
    now,
    last: times[times.length - 1] ?? null,
    usual: usual?.days ?? [],
  });
  return { plan, usual };
}

const familyOf = (id) => family(state.exercises.get(id));

// One session drawn from every routine, for a week that is out of reach.
export function catchUpItems(now = Date.now()) {
  const done = new Set(finished()
    .filter((s) => weekStart(s.start) === weekStart(now))
    .flatMap((s) => s.entries.map((e) => e.ex)));
  return catchUp(state.routines, Math.max(0, state.routines.indexOf(upNext())), familyOf, done);
}

// The 15-minute version of a routine.
export function shortItems(routine) {
  return pickShort(routine.items.filter((it) => !it.optional).map((it) => {
    const last = perf(historyFor(it.ex, Infinity, 1)[0]?.sets);
    const reps = last && Array.from({ length: it.sets }, (_, i) => last.reps[i] ?? it.min);
    return {
      item: it,
      fam: familyOf(it.ex),
      gap: reps ? reps.reduce((sum, r) => sum + Math.max(0, it.max - r), 0) : Infinity,
    };
  }));
}

// The working weight and first-set reps of the last sessions of an exercise, oldest first.
const points = (exId, limit) => historyFor(exId, Infinity, limit).reverse().map((h) => {
  const p = perf(h.sets);
  return { t: h.date, w: p.w, r: p.reps[0] };
});

// Every exercise with enough history, the one that has come furthest first.
export function gains(now = Date.now()) {
  const done = new Set(finished().flatMap((s) => s.entries.map((e) => e.ex)));
  return [...done].flatMap((id) => {
    const g = gain(points(id, Infinity), now);
    return g ? [{ ex: state.exercises.get(id), ...g }] : [];
  }).sort((a, b) => b.ratio - a.ratio);
}

// "30 to 40 kg", "40 kg, 10 to 12 reps" or "10 to 12 reps".
export function gainText({ from, to }) {
  const span = (a, b) => (a === b ? fmt(b) : `${fmt(a)} to ${fmt(b)}`);
  if (to.w == null) return `${span(from.r, to.r)} reps`;
  return from.w === to.w ? `${fmt(to.w)} ${unit()}, ${span(from.r, to.r)} reps` : `${span(from.w, to.w)} ${unit()}`;
}

// Days without a backup when it is time to make one, else null.
export function backupDays(now = Date.now()) {
  const all = finished();
  return all.length ? backupDue({ first: all[0].start, last: all[all.length - 1].end, backedUp: state.settings.backedUp, now }) : null;
}

// "On pace for 45 kg around 3 Dec." from the trend of one exercise.
export function paceText(exId, now = Date.now()) {
  const f = forecast(points(exId, 8), { round: unit() === 'lb' ? 10 : 5, now });
  if (!f) return null;
  const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  if (!f.rising) return `No upward trend over the last ${f.sessions} sessions.`;
  // Rising, but the next round weight is further off than it can honestly say.
  if (!f.goals.length) return null;
  return `On pace for ${f.goals.map((g) => `${fmt(g.weight)} ${unit()} around ${day(g.t)}`).join(', ')}.`;
}

// "40 kg × 10, 10, 9", or "10, 10, 9 reps" without weight.
export function setsText(sets) {
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.w === s.w) g.reps.push(s.r);
    else groups.push({ w: s.w, reps: [s.r] });
  }
  return groups
    .map((g) => (g.w == null ? `${g.reps.join(', ')} reps` : `${fmt(g.w)} ${unit()} × ${g.reps.join(', ')}`))
    .join(', then ');
}

// A suggestion as sets, for display. '?' marks a weight still to be picked.
export const planSets = (p, weighted) =>
  p.reps.map((r) => ({ w: weighted ? p.weight ?? '?' : null, r }));

export function deltaText(cmp) {
  const reps = (n) => `${n} rep${n === 1 ? '' : 's'}`;
  if (cmp.status === 'first') return 'first time';
  if (cmp.status === 'same') return 'same as last time';
  const sign = cmp.status === 'win' ? '+' : '−';
  return cmp.dw != null ? `${sign}${fmt(Math.abs(cmp.dw))} ${unit()}` : `${sign}${reps(Math.abs(cmp.dr))}`;
}
