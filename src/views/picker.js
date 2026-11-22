import { h, sheet } from '../dom.js';
import { state } from '../store.js';
import { MUSCLES } from '../seed.js';

// A searchable sheet of strength exercises. Calls onPick with the chosen id.
export function pickExercise(title, onPick, exclude = new Set()) {
  const all = [...state.exercises.values()].filter((x) => !x.hidden && x.equip !== 'cardio' && !exclude.has(x.id));
  const list = h('div.pick-list');
  const fill = (q) => {
    list.replaceChildren(...MUSCLES.flatMap((m) => {
      const found = all.filter((x) => x.muscle === m && x.name.toLowerCase().includes(q));
      if (!found.length) return [];
      return [h('h3', m), ...found.map((x) => h('button.pick', { onclick: () => { d.close(); onPick(x.id); } },
        h('span.name', x.name), h('span.sub', x.equip)))];
    }));
  };
  const d = sheet(title,
    h('input.search', { type: 'search', placeholder: 'Search', 'aria-label': 'Search exercises', oninput: (e) => fill(e.target.value.trim().toLowerCase()) }),
    list,
  );
  fill('');
  return d;
}
