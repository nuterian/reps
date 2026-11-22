// All data lives in localStorage on this device. It is read once, before the
// first frame, into `state`, and every change is written straight back.
// Sessions have a key each, so logging a set writes that session and no more.
import { EXERCISES, ROUTINES, SETTINGS } from './seed.js';

const PREFIX = 'reps:';
const SESSION = `${PREFIX}s:`;

export const state = { exercises: new Map(), routines: [], sessions: [], settings: { ...SETTINGS } };

const get = (key) => JSON.parse(localStorage.getItem(PREFIX + key));
const ours = () => Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));

function put(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch (err) {
    console.error(err);
    alert('Could not save. Your last change may be lost.');
  }
}

const byName = (list) => new Map(list.sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, e]));

function read() {
  state.exercises = byName(get('exercises'));
  state.routines = get('routines').sort((a, b) => a.order - b.order);
  state.sessions = ours()
    .filter((k) => k.startsWith(SESSION))
    .map((k) => JSON.parse(localStorage.getItem(k)))
    .sort((a, b) => a.start - b.start);
  state.settings = { ...SETTINGS, ...get('settings') };
}

// Swaps in a whole new set of data, or leaves everything as it was.
function replace({ exercises, routines, sessions, settings }) {
  const before = ours().map((k) => [k, localStorage.getItem(k)]);
  const wipe = () => ours().forEach((k) => localStorage.removeItem(k));
  try {
    wipe();
    for (const s of sessions) localStorage.setItem(SESSION + s.id, JSON.stringify(s));
    localStorage.setItem(`${PREFIX}exercises`, JSON.stringify(exercises));
    localStorage.setItem(`${PREFIX}routines`, JSON.stringify(routines));
    localStorage.setItem(`${PREFIX}settings`, JSON.stringify(settings));
  } catch (err) {
    console.error(err);
    wipe();
    for (const [k, v] of before) localStorage.setItem(k, v);
    throw new Error('Not enough space on this phone for this backup. Nothing was changed.');
  }
}

export function load() {
  if (!get('settings')) {
    replace({ exercises: EXERCISES, routines: ROUTINES, sessions: [], settings: SETTINGS });
    // Left behind by versions before 22 Nov 2026.
    globalThis.indexedDB?.deleteDatabase('reps');
  }
  read();
  navigator.storage?.persist?.();
}

const saveRoutines = () => {
  state.routines.forEach((r, i) => (r.order = i));
  put('routines', state.routines);
};

export function saveSession(s) {
  if (!state.sessions.includes(s)) state.sessions.push(s);
  put(`s:${s.id}`, s);
}

export function deleteSession(s) {
  state.sessions = state.sessions.filter((x) => x !== s);
  localStorage.removeItem(SESSION + s.id);
}

export function saveExercise(e) {
  state.exercises = byName([...state.exercises.values()].filter((x) => x.id !== e.id).concat(e));
  put('exercises', [...state.exercises.values()]);
}

export function saveRoutine(r) {
  if (!state.routines.includes(r)) state.routines.push(r);
  saveRoutines();
}

export function replaceRoutines(list) {
  state.routines = list.map((r) => ({ ...r }));
  saveRoutines();
}

export function deleteRoutine(r) {
  state.routines = state.routines.filter((x) => x !== r);
  saveRoutines();
}

export const saveSettings = () => put('settings', state.settings);

// Space used, in megabytes. WebKit stops at about 5 million plain characters.
export const usedMB = () => ours().reduce((n, k) => n + k.length + localStorage.getItem(k).length, 0) / 1048576;

export const exportData = () => ({
  app: 'reps',
  version: 1,
  exported: new Date().toISOString(),
  exercises: [...state.exercises.values()],
  routines: state.routines,
  sessions: state.sessions,
  settings: state.settings,
});

export function importData(data) {
  const ok = data?.app === 'reps' && [data.exercises, data.routines, data.sessions].every(Array.isArray) && data.settings;
  if (!ok) throw new Error('This is not a Reps backup file.');
  replace(data);
  read();
}
