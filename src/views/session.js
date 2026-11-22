// The logging screen. One exercise is open at a time; its next set shows
// steppers and a Done button, so a set that matches the suggestion is one tap.
import { h, icon, go, refresh, sheet, stepper, topbar } from '../dom.js';
import { state, saveSession, saveRoutine } from '../store.js';
import { toDisplay, toKg, stepFor, fmt } from '../units.js';
import { unit, kindOf, doneSets, makeEntry, newCardio, finish, historyFor, setsText, cardioTypes } from '../log.js';
import { EQUIPMENT } from '../seed.js';
import { pickExercise } from './picker.js';

let sid = null;    // session the open state below belongs to
let openAt = null; // index of the open exercise, 'cardio', or null
let timer = null;

const todo = (e) => e.sets.some((x) => !x.done);

// The next unfinished core exercise after `from`, wrapping to the first.
function nextOpen(s, from = -1) {
  const left = s.entries.map((_, i) => i).filter((i) => todo(s.entries[i]) && !s.entries[i].optional);
  return left.find((i) => i > from) ?? left[0] ?? null;
}

export default function session(editId) {
  clearInterval(timer);
  const s = editId ? state.sessions.find((x) => x.id === editId && x.end) : state.sessions.find((x) => !x.end);
  if (!s) {
    go('/');
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
    go(finish(s) ? `/s/${s.id}` : '/');
  };
  const add = () => pickExercise('Add exercise', (id) => {
    s.entries.push(makeEntry({ ex: id, sets: 3, min: 8, max: 12 }));
    openAt = s.entries.length - 1;
    save();
    refresh();
  }, new Set(s.entries.map((e) => e.ex)));
  const coreLeft = s.entries.some((e) => !e.optional && todo(e));

  return h('main.session',
    topbar(s.end ? `#/s/${s.id}` : '#/', s.name, rest(s)),
    h('div.entries', s.entries.map((e, i) => entry(s, e, i, save)), cardio(s, save)),
    h('button.add', { onclick: add }, icon('plus'), 'Add exercise'),
    h('div.dock',
      h('button', { class: coreLeft ? 'secondary' : 'primary', onclick: end }, s.end ? 'Save changes' : 'Finish session'),
    ),
  );
}

// Time since the last logged set. Quiet: no alarm, nothing to dismiss.
function rest(s) {
  if (s.end) return null;
  const el = h('span.rest');
  const tick = () => {
    if (!location.hash.startsWith('#/session')) return clearInterval(timer);
    const t = Math.max(0, s.cardio?.t || 0, ...s.entries.flatMap((e) => e.sets.map((x) => x.t || 0)));
    const sec = Math.floor((Date.now() - t) / 1000);
    el.textContent = t && sec < 3600 ? `Rest ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : '';
  };
  tick();
  timer = setInterval(tick, 1000);
  return el;
}

function statusMark(done, total) {
  return done >= total
    ? h('span.status.done', icon('check'))
    : h('span.status', done ? `${done}/${total}` : '');
}

function entry(s, e, i, save) {
  const ex = state.exercises.get(e.ex);
  const weighted = kindOf(ex) === 'weight';
  const u = unit();
  const shown = (x) => ({ w: toDisplay(x.w, u), r: x.r });
  const done = doneSets(e);
  const head = [
    statusMark(done.length, e.sets.length),
    h('span.entry-main',
      h('span.name', ex.name, e.optional && h('span.tag', 'optional')),
      openAt !== i && h('span.sub',
        done.length ? setsText(done.map(shown))
          : weighted && e.sets[0].w == null ? 'pick a weight'
            : setsText(e.sets.map(shown))),
    ),
  ];

  if (openAt !== i) {
    const el = h('button.entry', { onclick: () => { openAt = i; refresh(); } }, head);
    el.style.viewTransitionName = `entry-${i}`;
    return el;
  }

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

  const row = (x, n) => {
    if (x.done) {
      const undo = () => { x.done = false; delete x.t; save(); refresh(); };
      return h('li.set.done',
        h('button', { 'aria-label': `Set ${n + 1} logged. Tap to change.`, onclick: undo },
          h('span.n', n + 1), h('span.val', setsText([shown(x)])), icon('check')));
    }
    if (n !== active) {
      return h('li.set.todo', h('span.n', n + 1),
        h('span.val', weighted && [h('span.w', x.w == null ? '–' : fmt(toDisplay(x.w, u))), ` ${u} × `], String(x.r), !weighted && ' reps'));
    }
    const mark = () => {
      x.done = true;
      x.t = Date.now();
      if (!todo(e)) openAt = nextOpen(s, i);
      save();
      refresh();
    };
    const doneBtn = h('button.primary', { disabled: weighted && x.w == null, onclick: mark }, 'Done');
    // A weight change carries to the sets still to do. Only text is patched,
    // so nothing re-renders under the finger.
    const setWeight = (v) => {
      for (const y of e.sets.slice(n)) if (!y.done) y.w = toKg(v, u);
      el.querySelectorAll('.set.todo .w').forEach((node) => (node.textContent = v == null ? '–' : fmt(v)));
      doneBtn.disabled = v == null;
      save();
    };
    return h('li.set.active',
      h('span.n', n + 1),
      h('div.steppers',
        weighted && stepper({ value: toDisplay(x.w, u), step: stepFor(ex, u), decimal: true, label: 'weight', suffix: u, onChange: setWeight }),
        stepper({ value: x.r, min: 1, max: 999, label: 'reps', suffix: 'reps', required: true, onChange: (v) => { x.r = v; save(); } }),
      ),
      doneBtn);
  };

  const el = h('section.entry.open',
    h('button.entry-head', { 'aria-expanded': 'true', onclick: () => { openAt = null; refresh(); } }, head),
    ex.cue && h('p.cue', ex.cue),
    h('div.tools',
      h('a.quiet', {
        href: `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' form')}`,
        target: '_blank',
        rel: 'noopener',
      }, 'Watch form', icon('out')),
      !done.length && h('button.quiet', { onclick: () => swap(s, i, save) }, icon('swap'), 'Swap'),
    ),
    e.swapped && h('p.swap-note',
      `In for ${state.exercises.get(e.swapped).name} today.`,
      origin && h('button.quiet', { onclick: keep }, `Keep in ${routine.name}`)),
    e.kept && h('p.swap-note', `${e.kept} now uses this exercise.`),
    h('p.aim', e.reason),
    last && h('p.last', `Last time ${setsText(last.sets)}`),
    h('ol.sets', e.sets.map(row)),
    h('div.tools',
      h('button.quiet', { onclick: () => { e.sets.push({ w: lastSet.w, r: lastSet.r, done: false }); save(); refresh(false); } }, icon('plus'), 'Set'),
      e.sets.length > 1 && !lastSet.done && h('button.quiet', { onclick: () => { e.sets.pop(); if (!todo(e)) openAt = nextOpen(s, i); save(); refresh(false); } }, icon('minus'), 'Set'),
    ),
  );
  el.style.viewTransitionName = `entry-${i}`;
  return el;
}

// Offer exercises with the same movement, guided equipment first.
function swap(s, i, save) {
  const e = s.entries[i];
  const cur = state.exercises.get(e.ex);
  const used = new Set(s.entries.map((x) => x.ex));
  const free = [...state.exercises.values()].filter((x) => !x.hidden && x.equip !== 'cardio' && !used.has(x.id));
  let alts = free.filter((x) => cur.group && x.group === cur.group);
  if (!alts.length) alts = free.filter((x) => x.muscle === cur.muscle);
  alts.sort((a, b) => EQUIPMENT.indexOf(a.equip) - EQUIPMENT.indexOf(b.equip));
  const choose = (id) => {
    const from = e.swapped ?? e.ex;
    s.entries[i] = makeEntry({ ex: id, sets: e.sets.length, min: e.min, max: e.max, optional: e.optional });
    if (id !== from) s.entries[i].swapped = from;
    save();
    refresh();
  };
  const d = sheet(`Swap ${cur.name}`,
    h('div.pick-list',
      alts.map((x) => h('button.pick', { onclick: () => { d.close(); choose(x.id); } }, h('span.name', x.name), h('span.sub', x.equip))),
      h('button.pick', { onclick: () => { d.close(); pickExercise(`Swap ${cur.name}`, choose, used); } }, h('span.name', 'All exercises'), icon('next')),
    ),
  );
}

function cardio(s, save) {
  const c = s.cardio;
  const name = state.exercises.get(c.ex)?.name ?? 'Cardio';
  const head = [
    statusMark(c.done ? 1 : 0, 1),
    h('span.entry-main',
      h('span.name', 'Cardio', h('span.tag', 'optional')),
      openAt !== 'cardio' && h('span.sub', `${name} · ${c.min} min`),
    ),
  ];
  if (openAt !== 'cardio') {
    const el = h('button.entry', { onclick: () => { openAt = 'cardio'; refresh(); } }, head);
    el.style.viewTransitionName = 'entry-cardio';
    return el;
  }
  const before = state.sessions.filter((o) => o.start < s.start && o.cardio?.done).pop()?.cardio;
  const el = h('section.entry.open',
    h('button.entry-head', { 'aria-expanded': 'true', onclick: () => { openAt = null; refresh(); } }, head),
    h('div.chips', cardioTypes().map((t) =>
      h('button', { class: t.id === c.ex ? 'chip on' : 'chip', disabled: c.done, onclick: () => { c.ex = t.id; save(); refresh(false); } }, t.name))),
    before && h('p.last', `Last time ${state.exercises.get(before.ex)?.name ?? 'cardio'} · ${before.min} min`),
    h('ol.sets', c.done
      ? h('li.set.done',
        h('button', { 'aria-label': 'Cardio logged. Tap to change.', onclick: () => { c.done = false; delete c.t; save(); refresh(); } },
          h('span.val', `${name} · ${c.min} min`), icon('check')))
      : h('li.set.active',
        h('div.steppers',
          stepper({ value: c.min, step: 5, min: 5, max: 600, label: 'minutes', suffix: 'min', required: true, onChange: (v) => { c.min = v; save(); } })),
        h('button.primary', { onclick: () => { c.done = true; c.t = Date.now(); openAt = null; save(); refresh(); } }, 'Done'))),
  );
  el.style.viewTransitionName = 'entry-cardio';
  return el;
}
