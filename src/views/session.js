// The logging screen: read on top, act at the bottom. The plan scrolls; the
// deck with weight, reps and Done is fixed, so Done never moves and a set
// that matches the suggestion is one tap.
import { h, icon, back, up, replace, redirect, refresh, sheet, stepper, topbar } from '../dom.js';
import { state, saveSession, saveRoutine } from '../store.js';
import { toDisplay, toKg, stepFor, fmt } from '../units.js';
import { unit, kindOf, doneSets, makeEntry, newCardio, finish, historyFor, setsText, cardioTypes } from '../log.js';
import { EQUIPMENT } from '../seed.js';
import { swapCounts } from '../smart.js';
import { pickExercise } from './picker.js';
import { nums, statusMark, setupLine } from './parts.js';
import { formGuide, hasGuide, videoSearch } from './clip.js';

let sid = null;    // session the state below belongs to
let openAt = null; // index of the open exercise, 'cardio', or null
let stamped = -1;  // set just logged in the open exercise, for a one-off animation
let timer = null;

const todo = (e) => e.sets.some((x) => !x.done);

// The next unfinished core exercise after `from`, wrapping to the first.
function nextOpen(s, from = -1) {
  const left = s.entries.map((_, i) => i).filter((i) => todo(s.entries[i]) && !s.entries[i].optional);
  return left.find((i) => i > from) ?? left[0] ?? null;
}

const open = (at) => {
  openAt = at;
  refresh();
};

export default function session(editId) {
  clearInterval(timer);
  const s = editId ? state.sessions.find((x) => x.id === editId && x.end) : state.sessions.find((x) => !x.end);
  if (!s) {
    redirect('/');
    return h('main');
  }
  if (sid !== s.id) {
    sid = s.id;
    openAt = nextOpen(s);
  }
  s.cardio ??= newCardio();
  const save = () => saveSession(s);
  const end = () => {
    sid = null;
    const past = s.end;
    const to = finish(s) ? `/s/${s.id}` : '/';
    // A corrected session goes back to its summary; a finished one is replaced
    // by it, so a swipe back from the summary leads Home.
    if (past && to !== '/') back(to);
    else if (to === '/') up('/');
    else replace(to);
  };
  const add = () => pickExercise('Add exercise', (id) => {
    s.entries.push(makeEntry({ ex: id, sets: 3, min: 8, max: 12 }));
    save();
    open(s.entries.length - 1);
  }, new Set(s.entries.map((e) => e.ex)));
  const live = { weights: [], reps: null }; // text the deck patches as its steppers move

  return h('main.session',
    topbar(s.end ? `#/s/${s.id}` : '#/', s.name, rest(s), h('button.chip', { onclick: end }, s.end ? 'Save' : 'Finish')),
    h('div.entries',
      s.entries.map((e, i) => (i === openAt ? openEntry(s, e, i, save, live) : row(e, i))),
      cardio(s, save, live)),
    h('button.add', { onclick: add }, icon('plus'), 'Add exercise'),
    deck(s, save, end, live),
  );
}

// Time since the last logged set. Quiet: no alarm, nothing to dismiss.
function rest(s) {
  if (s.end) return null;
  const clock = h('span');
  const el = h('span.rest.d', { hidden: true }, clock, h('small', ' rest'));
  const tick = () => {
    if (!location.hash.startsWith('#/session')) return clearInterval(timer);
    const t = Math.max(0, s.cardio?.t || 0, ...s.entries.flatMap((e) => e.sets.map((x) => x.t || 0)));
    const sec = Math.floor((Date.now() - t) / 1000);
    el.hidden = !t || sec >= 3600;
    clock.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  tick();
  timer = setInterval(tick, 1000);
  return el;
}

const shown = (x, weighted) => ({ w: weighted ? toDisplay(x.w, unit()) ?? '?' : null, r: x.r });

// A closed exercise: what was done, or what is planned.
function row(e, i) {
  const ex = state.exercises.get(e.ex);
  const weighted = kindOf(ex) === 'weight';
  const done = doneSets(e);
  const el = h('button', { class: done.length ? 'row done' : 'row', onclick: () => open(i) },
    statusMark(done.length, e.sets.length),
    h('span.row-main', h('span.name', ex.name), e.optional && h('span.opt', 'optional')),
    nums((done.length ? done : e.sets).map((x) => shown(x, weighted))),
  );
  el.style.viewTransitionName = `entry-${i}`;
  return el;
}

// The open exercise: what to beat, one cell per set, and its tools.
function openEntry(s, e, i, save, live) {
  const ex = state.exercises.get(e.ex);
  const weighted = kindOf(ex) === 'weight';
  const u = unit();
  const active = e.sets.findIndex((x) => !x.done);
  const last = historyFor(e.ex, s.start, 1)[0];
  const routine = state.routines.find((r) => r.id === s.routineId);
  const origin = e.swapped && routine?.items.find((it) => it.ex === e.swapped);
  const lastSet = e.sets[e.sets.length - 1];

  const keep = () => {
    origin.ex = e.ex;
    saveRoutine(routine);
    delete e.swapped;
    e.kept = routine.name;
    save();
    refresh(false);
  };

  const cell = (x, n) => {
    const w = weighted && h('b', x.w == null ? '?' : fmt(toDisplay(x.w, u)));
    const r = h('span.cr.d', String(x.r));
    const body = [h('span.cw', weighted ? [w, ` ${u}`] : 'reps'), r];
    if (x.done) {
      const reopen = () => { x.done = false; delete x.t; save(); refresh(false); };
      return h('button', {
        class: n === stamped ? 'cell done just' : 'cell done',
        'aria-label': `Set ${n + 1} logged: ${setsText([{ w: toDisplay(x.w, u), r: x.r }])}. Tap to change.`,
        onclick: reopen,
      }, body, icon('check'));
    }
    if (w) live.weights.push(w);
    if (n !== active) return h('div.cell', body);
    live.reps = r;
    return h('div.cell.now', body);
  };

  const el = h('section.row.open',
    h('button.open-head', { 'aria-expanded': 'true', onclick: () => open(null) },
      h('h2.d', ex.name), e.optional && h('span.opt', 'optional'), icon('up')),
    e.swapped && h('p.swap-note',
      `In for ${state.exercises.get(e.swapped).name} today.`, ' ',
      origin && h('button.quiet', { onclick: keep }, `Keep in ${routine.name}`)),
    e.kept && h('p.swap-note', `${e.kept} now uses this exercise.`),
    h('p.aim', e.reason),
    last && h('p.last', `Last time ${setsText(last.sets)}`),
    setupLine(ex),
    h('div.cells', h('div.cellgrid', e.sets.map(cell)),
      h('div.setadj',
        h('button', { 'aria-label': 'Add a set', onclick: () => { e.sets.push({ w: lastSet.w, r: lastSet.r, done: false }); save(); refresh(false); } }, icon('plus')),
        h('button', { 'aria-label': 'Remove a set', disabled: e.sets.length < 2 || lastSet.done, onclick: () => { e.sets.pop(); if (!todo(e)) openAt = nextOpen(s, i); save(); refresh(false); } }, icon('minus')))),
    ex.cue && h('p.cue', ex.cue),
    h('div.tools',
      hasGuide(ex)
        ? h('button.chip', { onclick: () => sheet(ex.name, formGuide(ex)) }, icon('play'), 'Form')
        : videoSearch(ex, 'Watch form'),
      !doneSets(e).length && h('button.chip', { onclick: () => swap(s, i, save) }, icon('swap'), 'Swap'),
    ),
  );
  stamped = -1;
  el.style.viewTransitionName = `entry-${i}`;
  return el;
}

// The fixed controls for the next set of the open exercise. With nothing
// left to log there, it offers to finish.
function deck(s, save, end, live) {
  const finishBtn = h('button.btn.go', { onclick: end }, s.end ? 'Save changes' : 'Finish session');

  if (openAt === 'cardio' && !s.cardio.done) {
    const c = s.cardio;
    return h('div.dock.deck',
      h('p.deck-title', 'Cardio'),
      h('div.steppers',
        stepper({ value: c.min, step: 5, min: 5, max: 600, label: 'minutes', suffix: 'min', required: true, onChange: (v) => { c.min = v; live.reps.textContent = v; save(); } })),
      h('button.btn.go', { onclick: () => { c.done = true; c.t = Date.now(); openAt = null; save(); refresh(); } }, 'Done'));
  }

  const e = s.entries[openAt];
  const n = e ? e.sets.findIndex((x) => !x.done) : -1;
  if (n < 0) return h('div.dock.deck', finishBtn);

  const x = e.sets[n];
  const ex = state.exercises.get(e.ex);
  const weighted = kindOf(ex) === 'weight';
  const u = unit();
  const mark = () => {
    x.done = true;
    x.t = Date.now();
    const stay = todo(e);
    if (stay) stamped = n;
    else openAt = nextOpen(s, openAt);
    save();
    refresh(!stay);
  };
  const doneBtn = h('button.btn.go', { disabled: weighted && x.w == null, onclick: mark }, 'Done');
  // A weight change carries to the sets still to do. Only text is patched,
  // so nothing re-renders under the finger.
  const setWeight = (v) => {
    for (const y of e.sets.slice(n)) if (!y.done) y.w = toKg(v, u);
    for (const node of live.weights) node.textContent = v == null ? '?' : fmt(v);
    doneBtn.disabled = v == null;
    save();
  };
  const setReps = (v) => {
    x.r = v;
    live.reps.textContent = v;
    save();
  };
  return h('div.dock.deck',
    h('p.deck-title', `${ex.name}, set ${n + 1} of ${e.sets.length}`),
    h('div.steppers',
      weighted && stepper({ value: toDisplay(x.w, u), step: stepFor(ex, u), decimal: true, label: 'weight', suffix: u, onChange: setWeight }),
      stepper({ value: x.r, min: 1, max: 999, label: 'reps', suffix: 'reps', required: true, onChange: setReps }),
    ),
    doneBtn);
}

// Offer exercises with the same movement, guided equipment first.
function swap(s, i, save) {
  const e = s.entries[i];
  const cur = state.exercises.get(e.ex);
  const used = new Set(s.entries.map((x) => x.ex));
  const free = [...state.exercises.values()].filter((x) => !x.hidden && x.equip !== 'cardio' && !used.has(x.id));
  let alts = free.filter((x) => cur.group && x.group === cur.group);
  if (!alts.length) alts = free.filter((x) => x.muscle === cur.muscle);
  // What you swapped to before comes first, then guided equipment.
  const counts = swapCounts(state.sessions, cur.id);
  const times = (x) => counts.get(x.id) || 0;
  alts = [...new Set([...free.filter(times), ...alts])];
  alts.sort((a, b) => times(b) - times(a) || EQUIPMENT.indexOf(a.equip) - EQUIPMENT.indexOf(b.equip));
  const choose = (id) => {
    const from = e.swapped ?? e.ex;
    s.entries[i] = makeEntry({ ex: id, sets: e.sets.length, min: e.min, max: e.max, optional: e.optional });
    if (id !== from) s.entries[i].swapped = from;
    save();
    refresh();
  };
  const d = sheet(`Swap ${cur.name}`,
    h('div.pick-list',
      alts.map((x, n) => h('button.pick', { onclick: () => { d.close(); choose(x.id); } },
        h('span.name', x.name), h('span.sub', n === 0 && times(x) >= 2 ? 'your usual swap' : x.equip))),
      h('button.pick', { onclick: () => { d.close(); pickExercise(`Swap ${cur.name}`, choose, used); } }, h('span.name', 'All exercises'), icon('next')),
    ),
  );
}

function cardio(s, save, live) {
  const c = s.cardio;
  const name = state.exercises.get(c.ex)?.name ?? 'Cardio';
  let el;
  if (openAt !== 'cardio') {
    el = h('button', { class: c.done ? 'row done' : 'row', onclick: () => open('cardio') },
      statusMark(c.done ? 1 : 0, 1),
      h('span.row-main', h('span.name', 'Cardio'), h('span.opt', c.done ? name : 'optional')),
      c.done && h('span.nums.d', h('span.w', String(c.min), h('small', ' min'))),
    );
  } else {
    const before = state.sessions.filter((o) => o.start < s.start && o.cardio?.done).pop()?.cardio;
    const minutes = h('span', String(c.min));
    const body = [h('span.cw', name), h('span.cr.d', minutes, h('small', ' min'))];
    live.reps = minutes;
    const reopen = () => { c.done = false; delete c.t; save(); refresh(false); };
    el = h('section.row.open',
      h('button.open-head', { 'aria-expanded': 'true', onclick: () => open(null) },
        h('h2.d', 'Cardio'), h('span.opt', 'optional'), icon('up')),
      before && h('p.last', `Last time ${state.exercises.get(before.ex)?.name ?? 'cardio'}, ${before.min} min`),
      h('div.cells', c.done
        ? h('button.cell.done', { 'aria-label': `Cardio logged: ${name}, ${c.min} minutes. Tap to change.`, onclick: reopen }, body, icon('check'))
        : h('div.cell.now', body)),
      !c.done && h('div.chips', { style: 'margin-top:14px' }, cardioTypes().map((t) =>
        h('button', { class: t.id === c.ex ? 'chip on' : 'chip', onclick: () => { c.ex = t.id; save(); refresh(false); } }, t.name))),
    );
  }
  el.style.viewTransitionName = 'entry-cardio';
  return el;
}
