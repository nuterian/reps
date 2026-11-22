// Session logic on top of the store: building a session from a routine,
// finishing it, and comparing it with last time.
import { state, saveSession, deleteSession } from './store.js';
import { suggest, perf, compare, nextRoutine } from './progression.js';
import { toDisplay, toKg, stepFor, fmt } from './units.js';

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

export function startSession(routine) {
  const now = Date.now();
  const s = {
    id: 's' + now.toString(36),
    routineId: routine.id,
    name: routine.name,
    start: now,
    end: null,
    entries: routine.items.map((it) => makeEntry(it, now)),
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
    const item = state.routines.find((r) => r.id === s.routineId)?.items.find((i) => i.ex === e.ex)
      ?? { ex: e.ex, sets: e.sets.length, min: e.min, max: e.max };
    return { ex, weighted, sets, cmp, next: latest ? plan(item) : null };
  });
  const compared = rows.filter((r) => r.cmp.status !== 'first');
  return { rows, wins: compared.filter((r) => r.cmp.status === 'win').length, of: compared.length };
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
    .join(' · ');
}

export const planText = (p, weighted) =>
  weighted && p.weight == null
    ? `${p.reps.length} × ${p.reps[0]}, pick a weight`
    : setsText(p.reps.map((r) => ({ w: p.weight, r })));

export function deltaText(cmp) {
  const reps = (n) => `${n} rep${n === 1 ? '' : 's'}`;
  if (cmp.status === 'first') return 'first time';
  if (cmp.status === 'same') return 'same as last time';
  const sign = cmp.status === 'win' ? '+' : '−';
  return cmp.dw != null ? `${sign}${fmt(Math.abs(cmp.dw))} ${unit()}` : `${sign}${reps(Math.abs(cmp.dr))}`;
}
