// Small pieces shared by the screens.
import { h, icon } from '../dom.js';
import { fmt } from '../units.js';
import { unit } from '../log.js';
import { state, saveExercise, saveSettings, exportData } from '../store.js';

// A ring that fills in: empty, "1/3", then a blue check.
export function statusMark(done, total) {
  return done >= total
    ? h('span.status.done', icon('check'))
    : h('span.status', done ? `${done}/${total}` : '');
}

// Weight once, then the reps of each set: "40 kg  11 10 10".
// sets: [{ w, r }] in display units. w is null without weight, '?' when the
// weight is still to be picked.
export function nums(sets) {
  const groups = [];
  for (const s of sets) {
    const g = groups[groups.length - 1];
    if (g && g.w === s.w) g.reps.push(s.r);
    else groups.push({ w: s.w, reps: [s.r] });
  }
  return h('span.nums.d', groups.map((g) => [
    g.w != null && h('span.w', g.w === '?' ? '?' : fmt(g.w), h('small', ` ${unit()}`)),
    ' ',
    h('span.r', g.reps.join(' ')),
    ' ',
  ]));
}

// What to set on the machine, kept with the exercise. Saved as it is typed.
export function setupLine(ex) {
  return h('label.setup', h('span', 'Setup'), h('input', {
    type: 'text',
    value: ex.setup ?? '',
    placeholder: 'Seat, pin, grip',
    maxLength: 60,
    autocomplete: 'off',
    enterKeyHint: 'done',
    oninput: (e) => {
      const text = e.target.value.trim();
      if (text) ex.setup = text;
      else delete ex.setup;
      saveExercise(ex);
    },
    onkeydown: (e) => e.key === 'Enter' && e.target.blur(),
  }));
}

// Hands the backup to the share sheet, or downloads it where there is none.
// Returns what happened, or null when the share sheet was dismissed.
export async function saveBackup() {
  const name = `reps-backup-${new Date().toLocaleDateString('sv')}.json`; // 2026-11-05
  const file = new File([JSON.stringify(exportData())], name, { type: 'application/json' });
  let said = `Saved ${name}.`;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      said = 'Backup shared.';
    } catch {
      return null;
    }
  } else {
    const url = URL.createObjectURL(file);
    h('a', { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  state.settings.backedUp = Date.now();
  saveSettings();
  return said;
}
