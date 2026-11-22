// Small pieces shared by the screens.
import { h, icon } from '../dom.js';
import { fmt } from '../units.js';
import { unit } from '../log.js';

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
