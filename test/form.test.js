// The clips teach form, so a wrong pose is a bug. These checks run on every
// clip at 41 moments of the movement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BONE, CYCLE, add, cross, dot, len, mix, phase, solve, sub, unit } from '../src/figure.js';
import { CAP, MUSCLES, STRIDE, build, createMesh } from '../src/body.js';
import { FORM } from '../src/form.js';
import { EXERCISES, ROUTINES } from '../src/seed.js';

const TAU = 2 * Math.PI;
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
  // Row: arms straight at the reach, elbows end behind the body.
  const reach = at('seated-row', 0);
  assert.ok(bendDeg(reach.shoulder, reach.elbow, reach.hand) > 160, `row reaches with arms at ${bendDeg(reach.shoulder, reach.elbow, reach.hand).toFixed(0)} degrees`);
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
      assert.ok(m.n <= CAP && m.m % 3 === 0 && m.m > 30000, `${id} size: ${m.n} points`);
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

test('arms grow out of the chest, however high they reach', () => {
  for (const [id, at] of Object.entries(meshes)) {
    for (const t of [0, 0.5, 1]) {
      const m = at(t);
      const j = solve(FORM[id].pose(t));
      // The arms are the parts with 22 points to a ring.
      const sleeves = m.parts.filter((p) => p.cols === 22);
      assert.equal(sleeves.length, 2, 'two arms');
      for (const { base } of sleeves) {
        const tip = [...m.v.slice(base * STRIDE, base * STRIDE + 3)];
        const chest = Math.min(...[0, 0.25, 0.5, 0.75, 1].map((k) => dist(tip, mix(j.spine[2], j.spine[3], k))));
        assert.ok(chest < 8, `${id} at ${t}: the arm starts ${chest.toFixed(1)} from the spine`);
      }
    }
  }
});

test('no point of the body or the machine snaps from place to place', () => {
  for (const [id, at] of Object.entries(meshes)) {
    let before;
    for (const t of TIMES) {
      const m = at(t);
      for (let i = 0; before && i < m.n; i++) {
        const o = i * STRIDE;
        const step = Math.hypot(m.v[o] - before[o], m.v[o + 1] - before[o + 1], m.v[o + 2] - before[o + 2]);
        assert.ok(step < 6, `${id} at ${t}: a point moves ${step.toFixed(1)}`);
      }
      before = m.v.slice(0, m.n * STRIDE);
    }
  }
});

// Whether a point is inside a closed part of the mesh: whether the part wraps around it.
function inside({ v }, { base, rows, cols }, q) {
  const all = Array.from({ length: rows * cols }, (_, i) => sub(v.subarray((base + i) * STRIDE, (base + i) * STRIDE + 3), q));
  for (const a of [0, 1, 2]) if (all.every((p) => p[a] > 0) || all.every((p) => p[a] < 0)) return false;
  let wraps = 0;
  const tri = (a, b, c) => {
    const [la, lb, lc] = [len(a), len(b), len(c)];
    wraps += Math.atan2(dot(a, cross(b, c)), la * lb * lc + dot(a, b) * lc + dot(b, c) * la + dot(c, a) * lb) / TAU;
  };
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols; k++) {
      const [a, b, c, d] = [[r, k], [r, k + 1], [r + 1, k], [r + 1, k + 1]].map(([row, col]) => all[row * cols + (col % cols)]);
      tri(a, c, b);
      tri(b, c, d);
    }
  }
  return Math.abs(wraps) > 0.5;
}

test('no cable or rope goes through the body', () => {
  // Parts by their points to a ring.
  const body = { 40: 'head', 38: 'hair', 22: 'arm', 24: 'leg', 36: 'torso' };
  const found = new Set();
  for (const [id, clip] of Object.entries(FORM)) {
    for (const t of [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]) {
      const m = meshes[id](t);
      const j = solve(clip.pose(t));
      for (const cols of Object.keys(body)) assert.ok(m.parts.some((p) => p.cols === +cols), `the ${body[cols]} is found`);
      const hands = [j.hand, [j.hand[0], j.hand[1], -j.hand[2]]];
      for (const g of clip.gear(j, t)) {
        if (!['cable', 'rope'].includes(g.kind)) continue;
        const line = unit(sub(g.b, g.a));
        const x = unit(cross(line, Math.abs(line[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1]));
        const y = cross(line, x);
        for (let i = 0; i <= 24; i++) {
          const c = mix(g.a, g.b, i / 24);
          if (hands.some((h) => dist(h, c) < 5)) continue; // the hand closes around it
          for (const [cos, sin] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
            const q = c.map((n, a) => n + (x[a] * cos + y[a] * sin) * g.r);
            for (const part of m.parts) {
              if (body[part.cols] && inside(m, part, q)) found.add(`${id}: the ${g.kind} is in the ${body[part.cols]} at ${t}`);
            }
          }
        }
      }
    }
  }
  assert.deepEqual([...found], []);
});

test('the head has a face, and the hair covers it', () => {
  for (const id of ['rdl', 'cable-crunch', 'incline-db-press']) {
    const m = meshes[id](0.5);
    const j = solve(FORM[id].pose(0.5));
    const front = [j.headUp[1], -j.headUp[0], 0];
    // A point in the head's own terms: forward, up, to the side.
    const point = (i) => {
      const p = sub(m.v.subarray(i * STRIDE, i * STRIDE + 3), j.head);
      return [dot(p, front), dot(p, j.headUp), p[2]];
    };
    const [skin, hair] = [40, 38].map((cols) => m.parts.find((p) => p.cols === cols));
    const points = Array.from({ length: skin.rows * skin.cols }, (_, i) => point(skin.base + i));
    // The profile, from the chin up.
    const line = points.filter(([x, , z]) => x > 2 && Math.abs(z) < 0.01);
    const most = (lo, hi) => Math.max(...line.filter(([, y]) => y > lo && y < hi).map(([x]) => x));
    const least = (lo, hi) => Math.min(...line.filter(([, y]) => y > lo && y < hi).map(([x]) => x));
    assert.ok(most(-3.2, -1.8) > most(1.5, 3) + 1.2, `${id}: the nose stands out from the brow`);
    assert.ok(least(-0.5, 1.5) < most(1.5, 3) - 0.1, `${id}: the nose starts below the brow`);
    assert.ok(least(-5.3, -4.7) < Math.min(most(-4.8, -4.1), most(-6, -5.2)) - 0.1, `${id}: the mouth is a line between two lips`);
    assert.ok(least(-6.8, -5.8) < Math.min(most(-6, -5.2), most(-8, -6.8)) - 0.1, `${id}: there is a chin below the lips`);
    // Eyes: white with a dark middle, in front of the skin around them.
    const tone = (i) => m.v.subarray(i * STRIDE + 6, i * STRIDE + 9);
    const whites = Array.from({ length: m.n }, (_, i) => i).filter((i) => Math.min(...tone(i)) > 0.9 && dist(point(i), [5.2, 0.5, Math.sign(point(i)[2]) * 2.4]) < 1.4);
    assert.ok(whites.some((i) => point(i)[2] > 0) && whites.some((i) => point(i)[2] < 0), `${id}: two eyes`);
    const darks = Array.from({ length: m.n }, (_, i) => i).filter((i) => Math.max(...tone(i)) < 0.25 && Math.abs(point(i)[1] - 0.5) < 0.3 && Math.abs(Math.abs(point(i)[2]) - 2.45) < 0.4 && point(i)[0] > 3);
    assert.ok(darks.length > 20, `${id}: a dark middle in each`);
    // Light falls on the outside: no point of the head faces into it.
    for (const part of m.parts.slice(m.parts.indexOf(skin), m.parts.indexOf(hair) + 1)) {
      for (let i = part.base; i < part.base + part.rows * part.cols; i++) {
        const r = Math.floor((i - part.base) / part.cols);
        if (part === hair && r < 2) continue; // the buried edge of an open shell
        if (part.rows > 15 && r > 1 && r < part.rows - 2) continue; // the ends are where it is hard to tell
        const o = i * STRIDE;
        const out = add(m.v.subarray(o, o + 3), m.v.subarray(o + 3, o + 6), 0.04);
        assert.ok(!inside(m, part, out), `${id}: part ${m.parts.indexOf(part)}, ring ${r} faces inward`);
      }
    }
    // Eyes lie in the face: nothing around them stands off the skin.
    for (const part of m.parts.slice(m.parts.indexOf(skin) + 1, m.parts.indexOf(hair))) {
      for (let i = part.base; i < part.base + part.rows * part.cols; i++) {
        const p = point(i);
        if (p[0] < 3 || Math.abs(p[1] - 0.5) > 1.2) continue;
        const off = Math.min(...points.map((q) => dist(p, q)));
        assert.ok(off < 0.4, `${id}: part of an eye is ${off.toFixed(2)} off the face`);
      }
    }
    for (const [x, y, z] of points) {
      if (y < 7) continue;
      const at = add(add(add(j.head, front, x), j.headUp, y), [0, 0, z]);
      assert.ok(inside(m, hair, at), `${id}: the scalp shows at ${[x, y, z].map((n) => n.toFixed(1))}`);
    }
  }
});
