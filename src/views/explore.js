// The exercise explorer: a list to search and filter, and a page per exercise
// with its form clip and the user's own history.
import { h, icon, go, redirect, sheet, fmtDate, topbar } from '../dom.js';
import { state, saveRoutine } from '../store.js';
import { MUSCLES, EQUIPMENT } from '../seed.js';
import { historyFor, bestSet, paceText, setsText } from '../log.js';
import { formGuide, videoSearch } from './clip.js';
import { nums } from './parts.js';

const filter = { query: '', muscle: null, equip: null };
let scroll = 0; // where the list was when an exercise was opened

const fits = (x, f) =>
  (!f.muscle || x.muscle === f.muscle) && (!f.equip || x.equip === f.equip) && x.name.toLowerCase().includes(f.query);

export function explore() {
  const all = [...state.exercises.values()];
  const list = h('div');
  const chips = h('div.filters');

  // Only the list and chips are redrawn, so typing and scrolling are not disturbed.
  const fill = () => {
    const row = (label, key, options) => h('div.chips.scroll', { role: 'group', 'aria-label': label }, options.map((o) => {
      const on = filter[key] === o;
      return h('button', {
        class: on ? 'chip on' : 'chip',
        'aria-pressed': String(on),
        // Offer only what would leave something in the list.
        disabled: !on && !all.some((x) => fits(x, { ...filter, [key]: o })),
        onclick: () => { filter[key] = on ? null : o; fill(); },
      }, o);
    }));
    const at = [...chips.children].map((r) => r.scrollLeft);
    chips.replaceChildren(row('Muscle', 'muscle', MUSCLES), row('Equipment', 'equip', EQUIPMENT));
    [...chips.children].forEach((r, i) => (r.scrollLeft = at[i] ?? 0));
    const found = all.filter((x) => fits(x, filter));
    list.replaceChildren(...MUSCLES.flatMap((m) => {
      const group = found.filter((x) => x.muscle === m);
      if (!group.length) return [];
      return [h('h3', m, h('span', String(group.length))), h('ul.list', group.map((x) => h('li', { class: x.hidden ? 'dim' : '' },
        h('a', { href: `#/exercise/${x.id}`, onclick: () => (scroll = scrollY) },
          h('span.entry-main',
            h('span.name', x.name),
            h('span.sub', [x.equip, x.custom && 'custom', x.hidden && 'hidden'].filter(Boolean).join(', '))),
          icon('next')))))];
    }));
    if (!found.length) list.replaceChildren(h('p.note', 'No exercise matches. Clear a filter, or add your own.'));
  };
  fill();

  const el = h('main',
    topbar('#/', 'Exercises'),
    h('input.search', {
      type: 'search',
      placeholder: 'Search',
      'aria-label': 'Search exercises',
      value: filter.query,
      oninput: (e) => { filter.query = e.target.value.trim().toLowerCase(); fill(); },
    }),
    chips,
    h('a.add', { href: '#/exercise/new' }, icon('plus'), 'New exercise'),
    list,
  );
  el.startAt = scroll;
  scroll = 0;
  // A chosen filter is never left out of sight at the end of its row.
  requestAnimationFrame(() => chips.querySelectorAll('.on').forEach((c) => c.scrollIntoView({ block: 'nearest', inline: 'center' })));
  return el;
}

export function exercisePage(id) {
  const ex = state.exercises.get(id);
  if (!ex) {
    redirect('/library');
    return h('main');
  }
  const addBtn = h('button.btn.go', { onclick: () => addTo(ex, addBtn) }, 'Add to a routine');
  return h('main.exercise',
    topbar('#/library', ex.name, h('a.chip', { href: `#/exercise/${id}/edit` }, 'Edit')),
    formGuide(ex) ?? (ex.cue && h('p.aim', ex.cue)),
    h('h3', 'Your history'),
    ex.equip === 'cardio' ? cardioHistory(id) : liftHistory(id),
    h('div.tools.end', videoSearch(ex, 'More on YouTube')),
    ex.equip !== 'cardio' && h('div.dock', addBtn),
  );
}

function liftHistory(id) {
  const past = historyFor(id, Infinity, 5);
  if (!past.length) return h('p.note', 'Nothing logged yet.');
  const best = bestSet(id);
  const pace = paceText(id);
  return [
    h('p.best', h('span', 'Best set'), h('b', setsText([best.set])), h('span.sub', fmtDate(best.date))),
    h('ul.plan', past.map((p) => h('li', h('span.sub', fmtDate(p.date)), nums(p.sets)))),
    pace && h('p.note', pace),
  ];
}

function cardioHistory(id) {
  const past = state.sessions.filter((s) => s.cardio?.done && s.cardio.ex === id).slice(-5).reverse();
  if (!past.length) return h('p.note', 'Nothing logged yet.');
  return h('ul.plan', past.map((s) => h('li',
    h('span.sub', fmtDate(s.start)),
    h('span.nums.d', h('span.w', String(s.cardio.min), h('small', ' min'))))));
}

function addTo(ex, button) {
  if (!state.routines.length) return go('/program');
  const d = sheet(`Add ${ex.name}`, h('div.pick-list', state.routines.map((r) => {
    const has = r.items.some((it) => it.ex === ex.id);
    return h('button.pick', {
      disabled: has,
      onclick: () => {
        r.items.push({ ex: ex.id, sets: 3, min: 8, max: 12 });
        saveRoutine(r);
        d.close();
        button.textContent = `Added to ${r.name}`;
      },
    }, h('span.name', r.name), h('span.sub', has ? 'already in it' : `${r.items.length} exercises`));
  })));
}
