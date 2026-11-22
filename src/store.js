// All data lives in IndexedDB on this device. It is loaded once into `state`
// and every change is written straight back.
import { EXERCISES, ROUTINES, SETTINGS } from './seed.js';

const STORES = ['exercises', 'routines', 'sessions', 'meta'];
let db;

export const state = { exercises: new Map(), routines: [], sessions: [], settings: { ...SETTINGS } };

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('reps', 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) req.result.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    const out = fn(t);
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

const write = (store, fn) =>
  tx(store, 'readwrite', (t) => fn(t.objectStore(store))).catch((err) => {
    console.error(err);
    alert('Could not save. Your last change may be lost.');
  });

// IndexedDB hands exercises back in id order. Lists read better by name.
const byName = (list) => new Map(list.sort((a, b) => a.name.localeCompare(b.name)).map((e) => [e.id, e]));

function fill({ exercises, routines, sessions, settings }) {
  state.exercises = byName(exercises);
  state.routines = routines.sort((a, b) => a.order - b.order);
  state.sessions = sessions.sort((a, b) => a.start - b.start);
  state.settings = { ...SETTINGS, ...settings };
}

async function read() {
  const reqs = await tx(STORES, 'readonly', (t) => STORES.map((s) => t.objectStore(s).getAll()));
  const [exercises, routines, sessions, meta] = reqs.map((r) => r.result);
  return { exercises, routines, sessions, settings: meta.find((m) => m.key === 'settings') };
}

function replace(data) {
  return tx(STORES, 'readwrite', (t) => {
    for (const s of STORES) t.objectStore(s).clear();
    for (const e of data.exercises) t.objectStore('exercises').put(e);
    for (const r of data.routines) t.objectStore('routines').put(r);
    for (const s of data.sessions) t.objectStore('sessions').put(s);
    t.objectStore('meta').put({ ...data.settings, key: 'settings' });
  });
}

export async function load() {
  db = await open();
  let data = await read();
  if (!data.settings) {
    await replace({ exercises: EXERCISES, routines: ROUTINES, sessions: [], settings: SETTINGS });
    data = await read();
  }
  fill(data);
  navigator.storage?.persist?.();
}

export function saveSession(s) {
  if (!state.sessions.includes(s)) state.sessions.push(s);
  return write('sessions', (o) => o.put(s));
}

export function deleteSession(s) {
  state.sessions = state.sessions.filter((x) => x !== s);
  return write('sessions', (o) => o.delete(s.id));
}

export function saveExercise(e) {
  state.exercises = byName([...state.exercises.values()].filter((x) => x.id !== e.id).concat(e));
  return write('exercises', (o) => o.put(e));
}

export function saveRoutine(r) {
  if (!state.routines.includes(r)) state.routines.push(r);
  state.routines.forEach((x, i) => (x.order = i));
  return write('routines', (o) => state.routines.forEach((x) => o.put(x)));
}

export function deleteRoutine(r) {
  state.routines = state.routines.filter((x) => x !== r);
  return write('routines', (o) => o.delete(r.id));
}

export function saveSettings() {
  return write('meta', (o) => o.put({ ...state.settings, key: 'settings' }));
}

export const exportData = () => ({
  app: 'reps',
  version: 1,
  exported: new Date().toISOString(),
  exercises: [...state.exercises.values()],
  routines: state.routines,
  sessions: state.sessions,
  settings: state.settings,
});

export async function importData(data) {
  const ok = data?.app === 'reps' && [data.exercises, data.routines, data.sessions].every(Array.isArray) && data.settings;
  if (!ok) throw new Error('This is not a Reps backup file.');
  await replace(data);
  fill(await read());
}
