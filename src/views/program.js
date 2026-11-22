// Everything behind "Edit program": routines, the exercise library, settings
// and backup.
import { h, icon, go, refresh, stepper, topbar } from '../dom.js';
import { state, saveRoutine, deleteRoutine, saveExercise, saveSettings, exportData, importData } from '../store.js';
import { MUSCLES, EQUIPMENT } from '../seed.js';
import { stepFor } from '../units.js';
import { unit } from '../log.js';
import { pickExercise } from './picker.js';

let notice = ''; // last backup result, shown under the backup buttons

export function program() {
  const { routines, settings } = state;
  const move = (i, dir) => {
    [routines[i], routines[i + dir]] = [routines[i + dir], routines[i]];
    saveRoutine(routines[i]);
    refresh(false);
  };
  const newRoutine = () => {
    const r = { id: 'r' + Date.now().toString(36), name: 'New routine', items: [] };
    saveRoutine(r);
    go(`/routine/${r.id}`);
  };
  const say = (text) => {
    notice = text;
    refresh(false);
  };
  const exportBackup = async () => {
    const name = `reps-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(exportData())], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        say('Backup shared.');
      } catch { /* share sheet dismissed */ }
      return;
    }
    const url = URL.createObjectURL(file);
    h('a', { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say(`Saved ${name}.`);
  };
  const importBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Replace everything on this phone with this backup?')) return;
      await importData(data);
      say(`Backup restored: ${state.sessions.length} sessions.`);
    } catch (err) {
      say(err instanceof SyntaxError ? 'This is not a Reps backup file.' : err.message);
    }
  };
  const count = [...state.exercises.values()].filter((x) => !x.hidden).length;

  return h('main',
    topbar('#/', 'Edit program'),
    h('h3', 'Routines, in rotation order'),
    h('ul.list', routines.map((r, i) => h('li',
      h('a', { href: `#/routine/${r.id}` },
        h('span.entry-main', h('span.name', r.name), h('span.sub', `${r.items.length} exercises`))),
      h('button.icon-btn', { disabled: i === 0, 'aria-label': `Move ${r.name} up`, onclick: () => move(i, -1) }, icon('up')),
      h('button.icon-btn', { disabled: i === routines.length - 1, 'aria-label': `Move ${r.name} down`, onclick: () => move(i, 1) }, icon('down')),
    ))),
    h('button.add', { onclick: newRoutine }, icon('plus'), 'New routine'),

    h('h3', 'Exercises'),
    h('ul.list', h('li', h('a', { href: '#/library' },
      h('span.entry-main', h('span.name', 'Exercise library'), h('span.sub', `${count} exercises`)),
      icon('next')))),

    h('h3', 'Settings'),
    h('div.setting', h('span', 'Weight unit'),
      h('div.seg', ['kg', 'lb'].map((u) => h('button', {
        class: u === settings.unit ? 'on' : '',
        'aria-pressed': String(u === settings.unit),
        onclick: () => { settings.unit = u; saveSettings(); refresh(false); },
      }, u)))),
    h('div.setting', h('span', 'Sessions per week'),
      stepper({ value: settings.weeklyTarget, min: 1, max: 7, label: 'sessions per week', required: true, onChange: (v) => { settings.weeklyTarget = v; saveSettings(); } })),

    h('h3', 'Backup'),
    h('p.note', 'Your data lives only on this phone. Removing the app from the Home Screen deletes it, so export a copy now and then.'),
    h('div.pair',
      h('button.secondary', { onclick: exportBackup }, 'Export backup'),
      h('label.secondary', 'Import backup',
        h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importBackup }))),
    notice && h('p.note.notice', { role: 'status' }, notice),
  );
}

export function routine(id) {
  const r = state.routines.find((x) => x.id === id);
  if (!r) {
    go('/program');
    return h('main');
  }
  const save = () => saveRoutine(r);
  const redraw = () => { save(); refresh(false); };
  const move = (i, dir) => {
    [r.items[i], r.items[i + dir]] = [r.items[i + dir], r.items[i]];
    redraw();
  };
  const remove = () => {
    if (!confirm(`Delete ${r.name}? Logged sessions are kept.`)) return;
    deleteRoutine(r);
    go('/program');
  };

  return h('main',
    topbar('#/program', 'Routine'),
    h('label.field', h('span', 'Name'),
      h('input', { type: 'text', value: r.name, oninput: (e) => { r.name = e.target.value.trim() || 'Routine'; save(); } })),
    h('ul.items', r.items.map((it, i) => {
      const name = state.exercises.get(it.ex).name;
      // Keep the range valid: moving one end past the other drags it along.
      const range = (key, v) => {
        it[key] = v;
        if (it.min > it.max) {
          it[key === 'min' ? 'max' : 'min'] = v;
          return redraw();
        }
        save();
      };
      return h('li',
        h('div.item-head',
          h('span.name', name),
          h('button.icon-btn', { disabled: i === 0, 'aria-label': `Move ${name} up`, onclick: () => move(i, -1) }, icon('up')),
          h('button.icon-btn', { disabled: i === r.items.length - 1, 'aria-label': `Move ${name} down`, onclick: () => move(i, 1) }, icon('down')),
          h('button.icon-btn', { 'aria-label': `Remove ${name}`, onclick: () => { r.items.splice(i, 1); redraw(); } }, icon('x'))),
        h('div.setting', h('span', 'Sets'),
          stepper({ value: it.sets, min: 1, max: 10, label: `sets of ${name}`, required: true, onChange: (v) => { it.sets = v; save(); } })),
        h('div.setting', h('span', 'Reps, from'),
          stepper({ value: it.min, min: 1, max: 100, label: `fewest reps of ${name}`, required: true, onChange: (v) => range('min', v) })),
        h('div.setting', h('span', 'Reps, to'),
          stepper({ value: it.max, min: 1, max: 100, label: `most reps of ${name}`, required: true, onChange: (v) => range('max', v) })),
        h('label.check',
          h('input', { type: 'checkbox', checked: !!it.optional, onchange: (e) => { if (e.target.checked) it.optional = true; else delete it.optional; save(); } }),
          'Optional, for days with more time'),
      );
    })),
    h('button.add', {
      onclick: () => pickExercise('Add exercise', (ex) => { r.items.push({ ex, sets: 3, min: 8, max: 12 }); redraw(); }, new Set(r.items.map((it) => it.ex))),
    }, icon('plus'), 'Add exercise'),
    h('div.tools.end', h('button.quiet.danger', { onclick: remove }, 'Delete routine')),
  );
}

export function library() {
  const all = [...state.exercises.values()];
  const list = h('div');
  const fill = (q) => {
    list.replaceChildren(...MUSCLES.flatMap((m) => {
      const found = all.filter((x) => x.muscle === m && x.name.toLowerCase().includes(q));
      if (!found.length) return [];
      return [h('h3', m), h('ul.list', found.map((x) => h('li', { class: x.hidden ? 'dim' : '' },
        h('a', { href: `#/exercise/${x.id}` },
          h('span.entry-main',
            h('span.name', x.name),
            h('span.sub', [x.equip, x.custom && 'custom', x.hidden && 'hidden'].filter(Boolean).join(' · '))),
          icon('next')))))];
    }));
  };
  fill('');
  return h('main',
    topbar('#/program', 'Exercises'),
    h('input.search', { type: 'search', placeholder: 'Search', 'aria-label': 'Search exercises', oninput: (e) => fill(e.target.value.trim().toLowerCase()) }),
    h('a.add', { href: '#/exercise/new' }, icon('plus'), 'New exercise'),
    list,
  );
}

let draft = null; // the exercise being edited, kept across redraws of the form

export function exercise(id) {
  const isNew = id === 'new';
  const saved = state.exercises.get(id);
  if (!isNew && !saved) {
    go('/library');
    return h('main');
  }
  if (draft?.id !== id) {
    draft = isNew
      ? { id, name: '', muscle: 'Legs', equip: 'machine', cue: '', custom: true }
      : structuredClone(saved);
  }
  const d = draft;
  const u = unit();
  const weighted = d.equip !== 'bodyweight' && d.equip !== 'cardio';
  let step = stepFor(d, u);

  const select = (key, options) => h('select', {
    onchange: (e) => { d[key] = e.target.value; refresh(false); },
  }, options.map((o) => h('option', { value: o, selected: o === d[key] }, o)));

  const save = () => {
    d.name = d.name.trim();
    if (!d.name) return document.querySelector('.field input').focus();
    const { step: _, ...rest } = d;
    const custom = step !== stepFor(rest, u);
    const out = { ...rest, ...(weighted && (custom || d.step) && { step: { ...d.step, [u]: step } }) };
    if (isNew) out.id = 'c' + Date.now().toString(36);
    saveExercise(out);
    draft = null;
    go('/library');
  };
  const toggle = () => {
    saved.hidden = !saved.hidden;
    if (!saved.hidden) delete saved.hidden;
    saveExercise(saved);
    draft = null;
    go('/library');
  };

  return h('main',
    topbar('#/library', isNew ? 'New exercise' : 'Exercise'),
    h('label.field', h('span', 'Name'),
      h('input', { type: 'text', value: d.name, placeholder: 'Exercise name', oninput: (e) => (d.name = e.target.value) })),
    h('label.field', h('span', 'Muscle group'), select('muscle', MUSCLES)),
    h('label.field', h('span', 'Equipment'), select('equip', EQUIPMENT)),
    h('label.field', h('span', 'Form cue'),
      h('textarea', { rows: 3, value: d.cue || '', placeholder: 'One line to remember', oninput: (e) => (d.cue = e.target.value) })),
    weighted && h('div.setting', h('span', 'Weight step'),
      stepper({ value: step, step: u === 'lb' ? 2.5 : 0.5, min: 0.5, max: 50, decimal: true, label: 'weight step', suffix: u, required: true, onChange: (v) => (step = v) })),
    h('div.tools.end', !isNew && h('button.quiet', { onclick: toggle }, saved.hidden ? 'Show in lists again' : 'Hide from lists')),
    h('div.dock', h('button.primary', { onclick: save }, 'Save')),
  );
}
