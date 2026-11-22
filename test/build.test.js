import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProgram } from '../src/build.js';
import { EXERCISES } from '../src/seed.js';

const byId = new Map(EXERCISES.map((x) => [x.id, x]));
const pick = (...ids) => ids.map((id) => byId.get(id));
// "leg-press" for a pick, "+seated-row" for one the builder added, "?" for optional.
const shape = (program) => program.map((r) => r.items.map((it) => (it.added ? '+' : '') + it.ex + (it.optional ? '?' : '')));
const ids = (program) => program.flatMap((r) => r.items.map((it) => it.ex));

test('five known exercises: picks go in first, gaps are filled for balance', () => {
  const program = buildProgram(pick('bench-press', 'lat-pulldown', 'leg-press', 'db-curl', 'cable-crunch'), EXERCISES);
  assert.deepEqual(program.map((r) => r.name), ['Routine A', 'Routine B']);
  assert.deepEqual(shape(program), [
    ['leg-press', 'bench-press', '+seated-row', '+db-shoulder-press', 'cable-crunch?'],
    ['+rdl', 'lat-pulldown', '+incline-db-press', '+leg-curl', 'db-curl?'],
  ]);
  const row = program[0].items[2];
  assert.deepEqual(row, { ex: 'seated-row', sets: 3, min: 8, max: 12, added: 'no row yet' });
});

test('no picks gives the starter program, all of it added', () => {
  assert.deepEqual(shape(buildProgram([], EXERCISES)), [
    ['+leg-press', '+chest-press', '+seated-row', '+db-shoulder-press', '+cable-crunch?'],
    ['+rdl', '+lat-pulldown', '+incline-db-press', '+leg-curl', '+db-curl?'],
  ]);
});

test('several picks with the same movement spread over slots of the same family', () => {
  const program = buildProgram(pick('bench-press', 'chest-press', 'db-bench'), EXERCISES);
  // Bench takes the chest slot; the other two take the overhead and second-push slots.
  assert.deepEqual(shape(program), [
    ['+leg-press', 'bench-press', '+seated-row', 'chest-press', '+cable-crunch?'],
    ['+rdl', '+lat-pulldown', 'db-bench', '+leg-curl', '+db-curl?'],
  ]);
});

test('every pick is included once, however many there are', () => {
  const many = pick('back-squat', 'leg-press', 'hack-squat', 'goblet-squat', 'deadlift', 'calf-raise',
    'db-curl', 'hammer-curl', 'cable-curl', 'lateral-raise', 'pull-up', 'bench-press');
  const program = buildProgram(many, EXERCISES);
  const all = ids(program);
  for (const p of many) assert.equal(all.filter((id) => id === p.id).length, 1, `${p.id} appears once`);
  assert.equal(new Set(all).size, all.length, 'nothing is listed twice');
  // Picks beyond the slots are optional, so the core stays four per routine.
  for (const r of program) assert.equal(r.items.filter((it) => !it.optional).length, 4);
});

test('a pick listed twice and cardio picks are ignored', () => {
  const program = buildProgram(pick('leg-press', 'leg-press', 'treadmill'), EXERCISES);
  assert.equal(ids(program).filter((id) => id === 'leg-press').length, 1);
  assert.equal(ids(program).includes('treadmill'), false);
});

test('a hidden default is skipped for the next exercise with that movement', () => {
  const all = EXERCISES.map((x) => (x.id === 'leg-curl' ? { ...x, hidden: true } : x));
  const program = buildProgram([], all);
  assert.equal(program[1].items[3].ex, 'seated-leg-curl');
  assert.equal(program[1].items[3].added, 'hamstrings');
});

test('a custom exercise without a movement group is placed by its muscle', () => {
  const sled = { id: 'c1', name: 'Sled Push', muscle: 'Legs', equip: 'machine', custom: true };
  const program = buildProgram([sled], [...EXERCISES, sled]);
  assert.equal(program[0].items[0].ex, 'c1');
  assert.equal(program[0].items[0].added, undefined);
});
