// The clips teach form, so a wrong pose is a bug. These checks run on every
// clip at 41 moments of the movement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BONE, CYCLE, dot, len, mix, phase, solve, sub } from '../src/figure.js';
import { MUSCLES, STRIDE, build, createMesh } from '../src/body.js';
import { FORM } from '../src/form.js';
import { EXERCISES, ROUTINES } from '../src/seed.js';

const TIMES = Array.from({ length: 41 }, (_, i) => i / 40);
const each = (fn) => {
  for (const [id, clip] of Object.entries(FORM)) for (const t of TIMES) fn(id, solve(clip.pose(t)), t, clip);
};
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
const dist = (a, b) => len(sub(a, b));
const bendDeg = (a, joint, b) => (Math.acos(dot(sub(a, joint), sub(b, joint)) / dist(a, joint) / dist(b, joint)) * 180) / Math.PI;
const flat = (p) => [p[0], p[1], 0];

test('every starter exercise has a clip, and every clip is complete', () => {
  for (const it of ROUTINES.flatMap((r) => r.items)) assert.ok(FORM[it.ex], `${it.ex} has a clip`);
  const ids = new Set(EXERCISES.map((x) => x.id));
  for (const [id, f] of Object.entries(FORM)) {
    assert.ok(ids.has(id), `${id} is in the library`);
    assert.equal(f.steps.length, 3, `${id} has three steps`);
    assert.doesNotMatch(f.steps[2], /^Do not/, `${id}: the last step is already labelled Avoid`);
    assert.ok(f.works.length, `${id} says what it works`);
    for (const m of [...f.works, ...(f.helps ?? [])]) assert.ok(MUSCLES.includes(m), `${id}: ${m} can be drawn`);
  }
});

test('bones keep their length, so every hand and foot position is reachable', () => {
  each((id, j, t) => {
    const at = `${id} at ${t}`;
    for (let i = 0; i < 3; i++) near(dist(j.spine[i], j.spine[i + 1]), BONE.spine, 1e-6, `${at} spine`);
    near(dist(j.shoulder, j.elbow), BONE.upper, 1e-3, `${at} upper arm`);
    near(dist(j.elbow, j.hand), BONE.fore, 1e-3, `${at} forearm`);
    near(dist(j.hip, j.knee), BONE.thigh, 1e-3, `${at} thigh`);
    near(dist(j.knee, j.ankle), BONE.shin, 1e-3, `${at} shin`);
    for (const p of [j.head, j.elbow, j.knee, j.hand]) assert.ok(p.every(Number.isFinite), `${at} is finite`);
  });
});

test('knees bend backward only', () => {
  each((id, j, t) => {
    const thigh = sub(j.knee, j.hip);
    const shin = sub(j.ankle, j.knee);
    assert.ok(thigh[0] * shin[1] - thigh[1] * shin[0] < 1, `${id} at ${t}`);
  });
});

const meshes = Object.fromEntries(Object.entries(FORM).map(([id, clip]) => [id, (t) => {
  const m = (meshes[id].m ??= createMesh());
  return build(m, clip, solve(clip.pose(t)), t);
}]));

test('nothing goes through the floor', () => {
  for (const [id, at] of Object.entries(meshes)) {
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const m = at(t);
      for (let i = 0; i < m.n; i++) assert.ok(m.v[i * STRIDE + 1] > -2, `${id} at ${t}: ${m.v[i * STRIDE + 1]}`);
    }
  }
});

test('what should stay still stays still', () => {
  each((id, j, t, clip) => {
    const j0 = solve(clip.pose(0));
    if (id !== 'rdl') near(dist(j.hip, j0.hip), 0, 1e-6, `${id} hips at ${t}`);
    if (!['leg-press', 'leg-curl'].includes(id)) near(dist(j.ankle, j0.ankle), 0, 1e-6, `${id} feet at ${t}`);
    if (id === 'leg-curl') near(dist(j.knee, j0.knee), 0, 0.6, `knee pivot at ${t}`);
    if (id === 'db-curl') near(dist(j.elbow, j0.elbow), 0, 0.2, `elbow at ${t}`);
  });
});

test('movement is smooth: no joint jumps between moments', () => {
  for (const [id, clip] of Object.entries(FORM)) {
    const js = TIMES.map((t) => solve(clip.pose(t)));
    for (const part of ['head', 'elbow', 'hand', 'knee', 'ankle']) {
      for (let i = 1; i < js.length; i++) assert.ok(dist(js[i][part], js[i - 1][part]) < 4, `${id} ${part} at ${TIMES[i]}`);
    }
  }
});

test('the clips show what the steps say', () => {
  const at = (id, t) => solve(FORM[id].pose(t));
  // Leg press: to 90 degrees, never locked.
  near(bendDeg(at('leg-press', 1).hip, at('leg-press', 1).knee, at('leg-press', 1).ankle), 90, 3, 'leg press bottom');
  for (const t of TIMES) assert.ok(bendDeg(at('leg-press', t).hip, at('leg-press', t).knee, at('leg-press', t).ankle) < 165, 'knees stay unlocked');
  // Presses: nearly straight at the end, not locked.
  for (const id of ['chest-press', 'db-shoulder-press', 'incline-db-press']) {
    const j = at(id, 1);
    const a = bendDeg(j.shoulder, j.elbow, j.hand);
    assert.ok(a > 140 && a < 172, `${id} ends at ${a} degrees`);
    // Elbows stay below the shoulders at the start.
    const s = at(id, 0);
    assert.ok(s.elbow[1] < s.shoulder[1], `${id} elbows start below the shoulders`);
  }
  for (const id of ['db-shoulder-press', 'incline-db-press']) {
    const s = at(id, 0);
    assert.ok(dot(sub(s.hand, s.elbow), [0, 1, 0]) / BONE.fore > 0.95, `${id} forearms start upright`);
  }
  near(at('db-shoulder-press', 0).hand[1], at('db-shoulder-press', 0).head[1], 5, 'dumbbells start at ear height');
  // Row: elbows end behind the body, torso barely moves.
  assert.ok(at('seated-row', 1).elbow[0] < at('seated-row', 1).spine[1][0] - 5, 'elbows end behind the spine');
  // Pulldown: the bar stays in front of the face and ends at the upper chest.
  for (const t of TIMES) {
    const j = at('lat-pulldown', t);
    assert.ok(dist(flat(j.hand), flat(j.head)) > 10, `bar clears the head at ${t}`);
    assert.ok(j.hand[0] > j.head[0], `bar in front at ${t}`);
  }
  near(at('lat-pulldown', 1).hand[1], at('lat-pulldown', 1).spine[3][1], 5, 'bar ends at the upper chest');
  assert.ok(at('lat-pulldown', 1).elbow[1] < at('lat-pulldown', 1).shoulder[1] - 12, 'elbows driven down');
  // Romanian deadlift: straight back, straight arms, bar close, knees soft.
  for (const t of TIMES) {
    const j = at('rdl', t);
    assert.ok(dist(j.shoulder, j.hand) > 0.985 * 46, 'arms straight');
    near(dot(j.front[0], j.front[2]), 1, 1e-9, 'back straight');
    assert.ok(bendDeg(j.hip, j.knee, j.ankle) > 130, `knees soft at ${t}`);
    const leg = j.hand[1] > j.knee[1] ? mix(j.hip, j.knee, (j.hip[1] - j.hand[1]) / (j.hip[1] - j.knee[1])) : mix(j.knee, j.ankle, (j.knee[1] - j.hand[1]) / (j.knee[1] - j.ankle[1]));
    assert.ok(Math.abs(j.hand[0] - leg[0]) < 16, `bar close to the legs at ${t}: ${j.hand[0] - leg[0]}`);
  }
  assert.ok(at('rdl', 1).hip[0] < at('rdl', 0).hip[0] - 18, 'hips go back');
  // Crunch: the spine rounds, the elbows come to the thighs.
  const c = at('cable-crunch', 1);
  assert.ok(dot(c.front[0], c.front[2]) < 0.2, 'spine is rounded');
  assert.ok(dist(flat(c.elbow), flat(mix(c.hip, c.knee, 0.5))) < 22, 'elbows reach the thighs');
  // Leg curl: from nearly straight to well past a right angle.
  assert.ok(bendDeg(at('leg-curl', 0).hip, at('leg-curl', 0).knee, at('leg-curl', 0).ankle) > 165);
  assert.ok(bendDeg(at('leg-curl', 1).hip, at('leg-curl', 1).knee, at('leg-curl', 1).ankle) < 85);
  // Curl: hands end at shoulder height.
  near(at('db-curl', 1).hand[1], at('db-curl', 1).shoulder[1], 9, 'curl ends at the shoulder');
});

test('machine levers keep their length', () => {
  const lever = TIMES.map((t) => dist(flat(solve(FORM['chest-press'].pose(t)).hand), [104, 6, 0]));
  for (const l of lever) near(l, lever[0], 1e-6, 'chest press lever');
});

test('the body is whole: finite, outward normals, both sides alike', () => {
  for (const [id, at] of Object.entries(meshes)) {
    for (const t of [0, 0.5, 1]) {
      const m = at(t);
      assert.ok(m.n < 14000 && m.m % 3 === 0 && m.m > 30000, `${id} size: ${m.n} points`);
      let blue = 0;
      let z = 0;
      for (let i = 0; i < m.n; i++) {
        const o = i * STRIDE;
        for (let a = 0; a < STRIDE; a++) assert.ok(Number.isFinite(m.v[o + a]), `${id} at ${t}, point ${i}`);
        near(Math.hypot(m.v[o + 3], m.v[o + 4], m.v[o + 5]), 1, 1e-3, `${id} normal ${i}`);
        if (m.v[o + 8] > 0.8 && m.v[o + 6] < 0.45) blue++;
        z += m.v[o + 2];
      }
      assert.ok(Math.abs(z / m.n) < 0.4, `${id} is the same on both sides: ${z / m.n}`);
      assert.ok(blue > 30, `${id} shows the working muscle: ${blue} points`);
    }
  }
});

test('hands hold the weight', () => {
  for (const id of ['db-shoulder-press', 'incline-db-press', 'db-curl', 'rdl', 'lat-pulldown']) {
    each((name, j, t, clip) => {
      if (name !== id) return;
      const onto = (g) => {
        const ab = sub(g.b, g.a);
        const k = Math.min(1, Math.max(0, dot(sub(j.hand, g.a), ab) / dot(ab, ab)));
        return dist(j.hand, mix(g.a, g.b, k));
      };
      assert.ok(clip.gear(j, t).some((g) => g.shape === 'rod' && onto(g) < 0.5), `${id} at ${t}`);
    });
  }
});

test('a repetition loops: lift in 1.2 s, lower in 2.4 s, with the words in step', () => {
  const press = FORM['chest-press'];
  const { rdl } = FORM;
  assert.deepEqual(phase(press, 0), { part: 0, k: 0, t: 0 });
  near(phase(press, CYCLE - 1e-9).t, 0, 1e-6, 'loop closes');
  near(phase(press, 0.7 + 0.6).t, 0.5, 1e-9, 'half way up');
  assert.equal(phase(press, 0.7 + 1.2 + 0.1).part, 2, 'holding at the end');
  near(phase(press, CYCLE - 1.2).t, 0.5, 1e-9, 'half way through a slow return');
  near(phase(rdl, 0.7 + 1.2).t, 0.5, 1e-9, 'a deadlift lowers first');
  for (const [id, f] of Object.entries(FORM)) assert.equal(f.say?.length, 2, `${id} says what to do`);
});
