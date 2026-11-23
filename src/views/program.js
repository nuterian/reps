// Everything behind "Program": routines, the form to edit an exercise,
// settings and backup.
import { h, icon, go, back, up, replace, redirect, boot, refresh, stepper, topbar } from '../dom.js';
import { state, saveRoutine, deleteRoutine, saveExercise, saveSettings, importData, usedMB } from '../store.js';
import { MUSCLES, EQUIPMENT } from '../seed.js';
import { stepFor } from '../units.js';
import { unit } from '../log.js';
import { pickExercise } from './picker.js';
import { saveBackup } from './parts.js';

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
    const said = await saveBackup();
    if (said) say(said);
  };
  const importBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm('Replace everything on this phone with this backup?')) return;
      importData(data);
      say(`Backup restored: ${state.sessions.length} sessions.`);
    } catch (err) {
      say(err instanceof SyntaxError ? 'This is not a Reps backup file.' : err.message);
    }
  };

  return h('main',
    topbar('#/', 'Program'),
    h('h3', 'Routines, in rotation order'),
    h('ul.list', routines.map((r, i) => h('li',
      h('a', { href: `#/routine/${r.id}` },
        h('span.entry-main', h('span.name', r.name), h('span.sub', `${r.items.length} exercises`))),
      h('button.icon-btn', { disabled: i === 0, 'aria-label': `Move ${r.name} up`, onclick: () => move(i, -1) }, icon('up')),
      h('button.icon-btn', { disabled: i === routines.length - 1, 'aria-label': `Move ${r.name} down`, onclick: () => move(i, 1) }, icon('down')),
    ))),
    h('button.add', { onclick: newRoutine }, icon('plus'), 'New routine'),
    h('a.add', { href: '#/build' }, icon('swap'), 'Build from exercises you know'),

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
      h('button.btn.line.sm', { onclick: exportBackup }, 'Export backup'),
      h('label.btn.line.sm', 'Import backup',
        h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: importBackup }))),
    notice && h('p.note.notice', { role: 'status' }, notice),
    h('p.note', `Opened in ${Math.round(boot.ms ?? 0)} ms. Using ${usedMB().toFixed(1)} of about 5 MB.`),
  );
}

export function routine(id) {
  const r = state.routines.find((x) => x.id === id);
  if (!r) {
    redirect('/program');
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
    back('/program');
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
    h('div.tools.end', h('button.btn.line.sm', { onclick: remove }, 'Delete routine')),
  );
}

let draft = null; // the exercise being edited, kept across redraws of the form

export function exerciseForm(id) {
  const isNew = id === 'new';
  const saved = state.exercises.get(id);
  if (!isNew && !saved) {
    redirect('/library');
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
    if (isNew) replace(`/exercise/${out.id}`);
    else back(`/exercise/${out.id}`);
  };
  const toggle = () => {
    saved.hidden = !saved.hidden;
    if (!saved.hidden) delete saved.hidden;
    saveExercise(saved);
    draft = null;
    up('/library');
  };

  return h('main',
    topbar(isNew ? '#/library' : `#/exercise/${id}`, isNew ? 'New exercise' : 'Edit exercise'),
    h('label.field', h('span', 'Name'),
      h('input', { type: 'text', value: d.name, placeholder: 'Exercise name', oninput: (e) => (d.name = e.target.value) })),
    h('label.field', h('span', 'Muscle group'), select('muscle', MUSCLES)),
    h('label.field', h('span', 'Equipment'), select('equip', EQUIPMENT)),
    h('label.field', h('span', 'Form cue'),
      h('textarea', { rows: 3, value: d.cue || '', placeholder: 'One line to remember', oninput: (e) => (d.cue = e.target.value) })),
    weighted && h('div.setting', h('span', 'Weight step'),
      stepper({ value: step, step: u === 'lb' ? 2.5 : 0.5, min: 0.5, max: 50, decimal: true, label: 'weight step', suffix: u, required: true, onChange: (v) => (step = v) })),
    !isNew && h('div.tools.end', h('button.btn.line.sm', { onclick: toggle }, saved.hidden ? 'Show in lists again' : 'Hide from lists')),
    h('div.dock', h('button.btn.go', { onclick: save }, 'Save')),
  );
}
