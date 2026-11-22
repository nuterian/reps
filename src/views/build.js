// Build a program around exercises you already know: pick them, see the two
// routines the app made, then use them.
import { h, up, refresh, topbar } from '../dom.js';
import { state, replaceRoutines } from '../store.js';
import { MUSCLES } from '../seed.js';
import { buildProgram } from '../build.js';
import { statusMark } from './parts.js';

let picked = [];    // exercise ids, in the order they were picked
let program = null; // the built routines, once Build is pressed

export default function build() {
  return program ? result() : choose();
}

function choose() {
  const all = [...state.exercises.values()].filter((x) => !x.hidden && x.equip !== 'cardio');
  picked = picked.filter((id) => all.some((x) => x.id === id));
  const buildBtn = h('button.btn.go', {
    onclick: () => {
      program = buildProgram(picked.map((id) => state.exercises.get(id)), [...state.exercises.values()]);
      refresh();
      scrollTo(0, 0); // the result is a new page in the same place
    },
  });
  const label = () => {
    buildBtn.disabled = !picked.length;
    buildBtn.textContent = !picked.length ? 'Pick an exercise'
      : `Build with ${picked.length} ${picked.length === 1 ? 'exercise' : 'exercises'}`;
  };
  const list = h('div.pick-list');
  let query = '';
  // Only the list is redrawn on a tap, so the search text and scroll stay put.
  const fill = () => {
    list.replaceChildren(...MUSCLES.flatMap((m) => {
      const found = all.filter((x) => x.muscle === m && x.name.toLowerCase().includes(query));
      if (!found.length) return [];
      return [h('h3', m), ...found.map((x) => {
        const on = picked.includes(x.id);
        const toggle = () => {
          picked = on ? picked.filter((id) => id !== x.id) : [...picked, x.id];
          label();
          fill();
        };
        return h('button.pick.tick', { 'aria-pressed': String(on), onclick: toggle },
          statusMark(on ? 1 : 0, 1), h('span.name', x.name), h('span.sub', x.equip));
      })];
    }));
  };
  label();
  fill();
  return h('main',
    topbar('#/program', 'Build a program'),
    h('p.note', 'Pick the exercises you know well. Reps builds two routines around them and fills the gaps.'),
    h('input.search', {
      type: 'search',
      placeholder: 'Search',
      'aria-label': 'Search exercises',
      oninput: (e) => { query = e.target.value.trim().toLowerCase(); fill(); },
    }),
    list,
    h('div.dock', buildBtn),
  );
}

function result() {
  const use = () => {
    if (state.routines.length && !confirm('Replace your current routines with this program? Logged sessions and weights are kept.')) return;
    const stamp = Date.now().toString(36);
    replaceRoutines(program.map((r, i) => ({
      id: `r${stamp}${i}`,
      name: r.name,
      items: r.items.map(({ added, ...item }) => item),
    })));
    picked = [];
    program = null;
    up('/');
  };
  return h('main',
    topbar('#/program', 'Your program'),
    h('p.note', 'Built around your picks. Every exercise starts at 3 sets of 8 to 12. You can change anything later in Program.'),
    program.map((r) => [
      h('h3', r.name),
      h('ul.plan.built', r.items.map((it) => h('li',
        h('span.name', state.exercises.get(it.ex).name, it.optional && h('span.opt', 'optional')),
        it.added ? h('span.added', `added: ${it.added}`) : h('span.mine', 'yours')))),
    ]),
    h('div.tools.end', h('button.btn.line.sm', { onclick: () => { program = null; refresh(); scrollTo(0, 0); } }, 'Change picks')),
    h('div.dock', h('button.btn.go', { onclick: use }, 'Use this program')),
  );
}
