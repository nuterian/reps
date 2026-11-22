// Builds a two-routine program around exercises the user already knows.
// Pure: no storage, no DOM. Each routine has four core slots (legs, a push, a
// pull and one more) and one optional slot. Picks go in first; the gaps are
// filled so the program stays balanced.
import { EQUIPMENT } from './seed.js';

// r: routine index. groups: the movements that fit the slot exactly.
// cat: the wider family a spare pick may also fill. fill: the default
// exercise when nothing was picked. why: shown next to an added exercise.
const SLOTS = [
  { r: 0, groups: ['squat'], cat: 'legs', fill: 'leg-press', why: 'no squat or leg press yet' },
  { r: 0, groups: ['hpush'], cat: 'push', fill: 'chest-press', why: 'no chest press yet' },
  { r: 0, groups: ['hpull'], cat: 'pull', fill: 'seated-row', why: 'no row yet' },
  { r: 0, groups: ['vpush'], cat: 'push', fill: 'db-shoulder-press', why: 'no overhead press yet' },
  { r: 0, groups: ['abs', 'rotate'], cat: 'extra', optional: true, fill: 'cable-crunch', why: 'core' },
  { r: 1, groups: ['hinge'], cat: 'legs', fill: 'rdl', why: 'no hip hinge yet' },
  { r: 1, groups: ['vpull'], cat: 'pull', fill: 'lat-pulldown', why: 'no pulldown or pull-up yet' },
  { r: 1, groups: ['incpush'], cat: 'push', fill: 'incline-db-press', why: 'a second push' },
  { r: 1, groups: ['kneeflex'], cat: 'legs', fill: 'leg-curl', why: 'hamstrings' },
  { r: 1, groups: ['curl', 'triceps'], cat: 'extra', optional: true, fill: 'db-curl', why: 'arms' },
];

const FAMILY = {
  squat: 'legs', hinge: 'legs', kneeflex: 'legs', kneeext: 'legs', glute: 'legs', calf: 'legs', abduct: 'legs', adduct: 'legs',
  hpush: 'push', incpush: 'push', vpush: 'push', fly: 'push',
  hpull: 'pull', vpull: 'pull', reardelt: 'pull', shrug: 'pull',
};
const BY_MUSCLE = { Legs: 'legs', Chest: 'push', Shoulders: 'push', Back: 'pull' };
// Custom exercises have no movement group, so they go by muscle.
export const family = (ex) => FAMILY[ex.group] ?? (ex.group ? 'extra' : BY_MUSCLE[ex.muscle] ?? 'extra');

const NAMES = ['Routine A', 'Routine B'];

// picks: exercises in the order the user chose them. all: every exercise.
// Returns [{ name, items: [{ ex, sets, min, max, optional?, added? }] }];
// `added` holds the reason for an exercise the user did not pick.
export function buildProgram(picks, all) {
  const item = (ex, extra) => ({ ex: ex.id, sets: 3, min: 8, max: 12, ...extra });
  const placed = SLOTS.map(() => null);
  const left = picks.filter((p, i) => p.equip !== 'cardio' && picks.indexOf(p) === i);
  const place = (fits) => {
    for (const p of [...left]) {
      const i = SLOTS.findIndex((s, k) => !placed[k] && fits(s, p));
      if (i < 0) continue;
      placed[i] = p;
      left.splice(left.indexOf(p), 1);
    }
  };
  place((s, p) => s.groups.includes(p.group)); // the exact movement first
  place((s, p) => s.cat === family(p));        // then any slot of the same family

  // Fill what is still empty: the default if it is free, else the first
  // visible exercise with that movement, guided equipment first.
  const used = new Set(picks.map((p) => p.id));
  const byId = new Map(all.map((x) => [x.id, x]));
  const free = (x) => x && !x.hidden && !used.has(x.id);
  const routines = NAMES.map((name) => ({ name, items: [] }));
  SLOTS.forEach((s, i) => {
    const flags = s.optional && { optional: true };
    if (placed[i]) return routines[s.r].items.push(item(placed[i], flags));
    const fill = [byId.get(s.fill), ...all
      .filter((x) => s.groups.includes(x.group))
      .sort((a, b) => EQUIPMENT.indexOf(a.equip) - EQUIPMENT.indexOf(b.equip))].find(free);
    if (!fill) return;
    used.add(fill.id);
    routines[s.r].items.push(item(fill, { ...flags, added: s.why }));
  });

  // Picks that fit no slot still belong: optional, in the shorter routine.
  for (const p of left) {
    const shorter = routines[1].items.length < routines[0].items.length ? routines[1] : routines[0];
    shorter.items.push(item(p, { optional: true }));
  }
  return routines;
}
