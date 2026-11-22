// The clips teach form, so a wrong pose is a bug. These checks run on every
// clip at 41 moments of the movement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BONE, CYCLE, STILL, add, alive, cross, dir, dot, len, mix, phase, solve, sub, unit } from '../src/figure.js';
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
      let red = 0;
      let z = 0;
      for (let i = 0; i < m.n; i++) {
        const o = i * STRIDE;
        for (let a = 0; a < STRIDE; a++) assert.ok(Number.isFinite(m.v[o + a]), `${id} at ${t}, point ${i}`);
        near(Math.hypot(m.v[o + 3], m.v[o + 4], m.v[o + 5]), 1, 1e-3, `${id} normal ${i}`);
        if (m.v[o + 6] - m.v[o + 7] > 0.35 && m.v[o + 8] < 0.35) red++;
        z += m.v[o + 2];
      }
      assert.ok(Math.abs(z / m.n) < 0.4, `${id} is the same on both sides: ${z / m.n}`);
      assert.ok(red > 30, `${id} shows the working muscle: ${red} points`);
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

test('thighs grow out of the hips, with no shelf, notch or fold where they meet', () => {
  for (const [id, at] of Object.entries(meshes)) {
    for (const t of [0, 0.5, 1]) {
      const m = at(t);
      const j = solve(FORM[id].pose(t));
      const torso = m.parts.find((p) => p.cols === 36);
      const thighs = m.parts.filter((p) => p.cols === 24);
      assert.equal(thighs.length, 2, 'two legs');
      const { base, cols } = thighs[0];
      const point = (r, k) => [...m.v.subarray((base + r * cols + (k % cols)) * STRIDE, (base + r * cols + (k % cols)) * STRIDE + 3)];
      const deep = Math.min(...[0, 0.25, 0.5, 0.75, 1].map((k) => dist(point(0, 0), mix(j.spine[0], j.spine[1], k))));
      assert.ok(deep < 7, `${id} at ${t}: the thigh starts ${deep.toFixed(1)} from the spine`);
      // The end of the tube is inside the body, and the skin never folds back over itself outside it.
      const top = Array.from({ length: cols }, (_, k) => point(2, k));
      for (let k = 0; k < cols; k += 4) assert.ok(inside(m, torso, top[k]), `${id} at ${t}: the top of a thigh shows`);
      const ways = [];
      for (let r = 1; r < 24; r++) {
        const ring = Array.from({ length: cols }, (_, k) => point(r, k));
        const middle = [0, 1, 2].map((n) => ring.reduce((sum, q) => sum + q[n], 0) / cols);
        ring.forEach((q, k) => ways.push([dot(cross(sub(point(r, k + 1), q), sub(point(r + 1, k), q)), sub(q, middle)), q]));
      }
      const out = Math.sign(ways.reduce((sum, [way]) => sum + way, 0));
      for (const [way, q] of ways) if (way * out < 0) assert.ok(inside(m, torso, q), `${id} at ${t}: the thigh folds at ${q.map((n) => n.toFixed(0))}`);
    }
  }
  // Standing, the outline of the hips widens gradually on the way down, and
  // behind, the seat is one curve in every clip that starts with straight hips.
  const outline = (id) => {
    const m = meshes[id](0);
    const j = solve(FORM[id].pose(0));
    const all = m.parts.filter((p) => [36, 24].includes(p.cols) && !p.want).flatMap(({ base, rows, cols }) => Array.from({ length: rows * cols }, (_, i) => {
      const d = sub(m.v.subarray((base + i) * STRIDE, (base + i) * STRIDE + 3), j.spine[0]);
      return [dot(d, dir(j.angles[0])), -dot(d, j.front[0]), d[2]];
    }));
    return Array.from({ length: 21 }, (_, i) => 8 - i).map((h) => {
      const near = all.filter((p) => Math.abs(p[0] - h) < 0.9);
      return { back: Math.max(...near.map((p) => p[1])), side: Math.max(...near.map((p) => p[2])) };
    });
  };
  const hips = outline('db-curl');
  for (let i = 1; i < 14; i++) assert.ok(hips[i].side - hips[i - 1].side < 1, `the hips step out by ${(hips[i].side - hips[i - 1].side).toFixed(1)}`);
  for (const id of ['db-curl', 'rdl', 'cable-crunch', 'leg-curl']) {
    const back = outline(id).map((o) => o.back);
    back.forEach((b, i) => {
      const dent = Math.min(Math.max(...back.slice(0, i + 1)), Math.max(...back.slice(i))) - b;
      assert.ok(dent < 0.15, `${id}: a notch ${dent.toFixed(2)} deep behind the hips`);
    });
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

// The parts of the body with those names, and the box each is in now, so that
// most points need no closer look.
function solids(m, names) {
  return m.parts.filter((p) => names[p.cols] && !p.want).map((part) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = part.base; i < part.base + part.rows * part.cols; i++) {
      for (const a of [0, 1, 2]) {
        lo[a] = Math.min(lo[a], m.v[i * STRIDE + a]);
        hi[a] = Math.max(hi[a], m.v[i * STRIDE + a]);
      }
    }
    return { name: names[part.cols], holds: (q) => q.every((n, a) => n > lo[a] && n < hi[a]) && inside(m, part, q) };
  });
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
      const parts = solids(m, body);
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
            for (const p of parts) if (p.holds(q)) found.add(`${id}: the ${g.kind} is in the ${p.name} at ${t}`);
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

test('a muscle is a sheet in its own place, not a tint on the skin', () => {
  // Every muscle on the figure standing straight, seen from its hips and shoulders.
  const { rdl } = FORM;
  const j = solve(rdl.pose(0));
  for (const name of MUSCLES) {
    const clip = { ...rdl, works: [name], helps: [] };
    const m = build(createMesh(), clip, j, 0);
    const sheets = m.parts.filter((p) => p.want);
    assert.ok(sheets.length >= 2 && sheets.length % 2 === 0, `${name} has sheets on both sides`);
    let sum = [0, 0, 0];
    let n = 0;
    for (const { base, rows, cols } of sheets) {
      for (let i = base; i < base + rows * cols; i++, n++) sum = add(sum, m.v.subarray(i * STRIDE, i * STRIDE + 3));
      // It lies on the body: the middle of it is never under the skin.
      const middle = m.v.subarray((base + (rows >> 1) * cols + (cols >> 1)) * STRIDE);
      for (const part of m.parts.filter((p) => [36, 22, 24].includes(p.cols))) {
        assert.ok(!inside(m, part, [middle[0], middle[1], middle[2]]), `${name} shows`);
      }
    }
    const [x, y] = sum.map((v) => v / n);
    const [hip, knee, ankle, neck] = [j.hip[1], j.knee[1], j.ankle[1], j.spine[3][1]];
    const where = {
      quads: [1, knee, hip], hamstrings: [-1, knee, hip], glutes: [-1, knee, hip + 8], calves: [-1, ankle, knee],
      chest: [1, j.spine[1][1], neck], abs: [1, hip, j.spine[2][1]], lats: [-1, hip, neck], 'upper back': [-1, j.spine[1][1], neck + 4], 'lower back': [-1, hip, j.spine[2][1]],
      shoulders: [0, j.elbow[1], neck], biceps: [1, j.elbow[1], j.shoulder[1]], triceps: [-1, j.elbow[1], j.shoulder[1]], forearms: [0, j.hand[1], j.elbow[1]],
    }[name];
    assert.ok(y > where[1] && y < where[2], `${name} is at ${y.toFixed(0)}, not between ${where[1].toFixed(0)} and ${where[2].toFixed(0)}`);
    const line = ['biceps', 'triceps'].includes(name) ? mix(j.shoulder, j.elbow, 0.5) : name === 'calves' ? mix(j.knee, j.ankle, 0.3) : ['quads', 'hamstrings'].includes(name) ? mix(j.hip, j.knee, 0.5) : mix(j.spine[0], j.spine[3], Math.min(1, Math.max(0, (y - hip) / (neck - hip))));
    if (where[0]) assert.ok((x - line[0]) * where[0] > 2, `${name} is on the ${where[0] > 0 ? 'front' : 'back'}`);
  }
  // A muscle never slides on the body: the skin under its middle is the same all through.
  for (const [id, at] of Object.entries(meshes)) {
    const under = (t) => {
      const m = at(t);
      const skin = m.parts.filter((p) => [36, 22, 24].includes(p.cols));
      return m.parts.filter((p) => p.want).map(({ base, rows, cols }) => {
        const o = (base + (rows >> 1) * cols + (cols >> 1)) * STRIDE;
        const p = [m.v[o], m.v[o + 1], m.v[o + 2]];
        let best = [Infinity];
        for (const q of skin) for (let i = q.base; i < q.base + q.rows * q.cols; i++) {
          const d = dist(p, m.v.subarray(i * STRIDE, i * STRIDE + 3));
          if (d < best[0]) best = [d, q.cols, Math.floor((i - q.base) / q.cols), (i - q.base) % q.cols];
        }
        return best;
      });
    };
    const start = under(0);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      under(t).forEach(([, cols, , col], n) => {
        if (start[n][1] !== cols) return; // another part lies nearer, as in a bent hip
        const round = Math.abs(col - start[n][3]);
        assert.ok(Math.min(round, cols - round) <= cols / 8, `${id}: sheet ${n} slid ${((Math.min(round, cols - round) / cols) * 360).toFixed(0)} degrees round by ${t}`);
      });
    }
  }
  // The glutes lie on the hips: few of their points are under the skin, none far off it.
  for (const id of ['rdl', 'leg-press']) {
    const m = meshes[id](1);
    const skin = m.parts.filter((p) => [36, 24].includes(p.cols) && !p.want);
    const glutes = m.parts.find((p) => p.want === 'works' && p.many === 8);
    let under = 0;
    for (let i = glutes.base; i < glutes.base + glutes.rows * glutes.cols; i++) {
      const q = [...m.v.subarray(i * STRIDE, i * STRIDE + 3)];
      let off = Infinity;
      for (const p of skin) for (let k = p.base; k < p.base + p.rows * p.cols; k++) off = Math.min(off, (m.v[k * STRIDE] - q[0]) ** 2 + (m.v[k * STRIDE + 1] - q[1]) ** 2 + (m.v[k * STRIDE + 2] - q[2]) ** 2);
      assert.ok(Math.sqrt(off) < 3.65, `${id}: the glutes stand ${Math.sqrt(off).toFixed(1)} off the body`);
      if (i % 2 && skin.some((p) => inside(m, p, q))) under++;
    }
    assert.ok(under < 6, `${id}: ${under} points of the glutes are under the skin`);
  }
  // Where the shoulder sits on the arm: on top as a press starts, on the side of the head overhead.
  const cap = (t) => {
    const m = meshes['db-shoulder-press'](t);
    const k = solve(FORM['db-shoulder-press'].pose(t));
    const arm = unit(sub(k.elbow, k.shoulder));
    let sum = [0, 0, 0];
    for (const { base, rows, cols } of m.parts.filter((p) => p.want === 'works')) {
      for (let i = base; i < base + rows * cols; i++) {
        const from = sub(m.v.subarray(i * STRIDE, i * STRIDE + 3), k.shoulder);
        if (m.v[i * STRIDE + 2] > 0) sum = add(sum, sub(from, arm.map((v) => v * dot(from, arm))));
      }
    }
    return unit(sum);
  };
  assert.ok(cap(0)[1] > 0.6, `shoulder on top at the start: ${cap(0)}`);
  assert.ok(cap(1)[2] < -0.5, `shoulder beside the head at the end: ${cap(1)}`);
  // Cloth and skin keep their own colour, and the key under the clip has the colour of the muscle.
  const css = readFileSync(new URL('../src/ui.css', import.meta.url), 'utf8');
  for (const [id, at] of Object.entries(meshes)) {
    const m = at(0);
    for (const p of m.parts.filter((q) => [36, 22, 24].includes(q.cols))) {
      for (let i = p.base; i < p.base + p.rows * p.cols; i++) {
        const [r, g, b] = m.v.subarray(i * STRIDE + 6, i * STRIDE + 9);
        assert.ok(r - g < 0.25 && b - r < 0.25, `${id}: the skin is tinted`);
      }
    }
    for (const want of ['works', ...(FORM[id].helps ? ['helps'] : [])]) {
      const hex = css.match(new RegExp(`--clip-${want}: (#[0-9a-f]{6})`))[1];
      const key = [1, 3, 5].map((n) => parseInt(hex.slice(n, n + 2), 16) / 255);
      const part = m.parts.find((p) => p.want === want);
      const colors = Array.from({ length: part.rows * part.cols }, (_, i) => m.v.subarray((part.base + i) * STRIDE + 6, (part.base + i) * STRIDE + 9));
      assert.ok(colors.some((c) => dist(c, key) < 0.02), `${id}: the key for ${want} has the colour of the muscle`);
    }
  }
});

test('no weight goes into the body', () => {
  const body = { 36: 'torso', 24: 'leg' };
  const found = new Set();
  for (const id of ['db-curl', 'rdl', 'db-shoulder-press', 'incline-db-press', 'chest-press', 'lat-pulldown']) {
    for (const t of [0, 0.05, 0.125, 0.25, 0.5, 0.75, 1]) {
      const m = meshes[id](t);
      const j = solve(FORM[id].pose(t));
      const bodies = solids(m, body);
      const held = (g) => g.shape === 'rod' && dist(j.hand, mix(g.a, g.b, Math.min(1, Math.max(0, dot(sub(j.hand, g.a), sub(g.b, g.a)) / dot(sub(g.b, g.a), sub(g.b, g.a)))))) < 0.5;
      for (const g of FORM[id].gear(j, t)) {
        if (g.shape !== 'head' && !held(g)) continue;
        const line = unit(sub(g.b, g.a));
        const x = unit(cross(line, Math.abs(line[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
        const y = cross(line, x);
        // Along it every 1.5 units, at its rim and halfway in, so the ends are covered too.
        const parts = Math.max(3, Math.ceil(dist(g.a, g.b) / 1.5));
        for (let i = 0; i <= parts; i++) {
          for (let k = 0; k < 16; k++) {
            const a = (k / 8) * TAU;
            const q = mix(g.a, g.b, i / parts).map((n, c) => n + (x[c] * Math.cos(a) + y[c] * Math.sin(a)) * g.r * (k < 8 ? 1 : 0.5));
            for (const p of bodies) if (p.holds(q)) found.add(`${id}: the ${g.shape} is in the ${p.name} at ${t}`);
          }
        }
      }
    }
  }
  assert.deepEqual([...found], []);
});

test('the upper arm does not twist as a curl starts', () => {
  const facing = TIMES.map((t) => {
    const j = solve(FORM['db-curl'].pose(t));
    const along = unit(sub(j.elbow, j.shoulder));
    const f = sub([0, 0, 0], unit(sub(j.elbowWay, along.map((v) => v * dot(j.elbowWay, along)))));
    return (Math.atan2(f[2], f[0]) * 180) / Math.PI; // 0 is biceps forward
  });
  for (const f of facing) near(f, 0, 5, 'biceps facing forward');
});

test('the figure lives: it breathes as the words say, works its muscles, blinks, and never sways', () => {
  const FRAMES = Array.from({ length: CYCLE * 30 }, (_, i) => i / 30);
  for (const [id, clip] of Object.entries(FORM)) {
    const m = createMesh();
    const lifting = clip.lowersFirst ? 3 : 1;
    const held = clip.lowersFirst ? 0 : 2; // the hold at the end of the lift
    let before;
    for (const s of FRAMES) {
      const now = alive(clip, s);
      const j = solve(clip.pose(now.t), now);
      // Only the head moves, so what is checked of the plain figure holds for this one.
      const plain = solve(clip.pose(now.t));
      for (const part of ['shoulder', 'hip', 'knee', 'ankle', ...(id === 'cable-crunch' ? [] : ['elbow', 'hand'])]) near(dist(j[part], plain[part]), 0, 1e-9, `${id} ${part} at ${s}`);
      j.spine.forEach((p, i) => near(dist(p, plain.spine[i]), 0, 1e-9, `${id}: the trunk sways at ${s}`));
      const back = dot(sub(j.head, plain.head), j.front[2]);
      assert.ok(back < 1e-9 && back > -1, `${id}: the head is drawn back, not let forward, at ${s}`);
      if (now.part === lifting && Math.abs(now.k - 0.5) < 0.05) assert.ok(back < -0.5, `${id}: and is on the drive`);
      for (const [k, hi] of [['breath', 1.25], ['effort', 1.25], ['strain', 4], ['blink', 1]]) assert.ok(now[k] >= 0 && now[k] <= hi, `${id} ${k} at ${s}: ${now[k]}`);
      build(m, clip, j, now.t);
      const v = m.v.slice(0, m.n * STRIDE);
      let step = 0;
      for (let i = 0; before && i < v.length; i += 3 * STRIDE) step = Math.max(step, (v[i] - before[i]) ** 2 + (v[i + 1] - before[i + 1]) ** 2 + (v[i + 2] - before[i + 2]) ** 2);
      assert.ok(step < 6.5 ** 2, `${id} at ${s.toFixed(2)}: a point jumps ${Math.sqrt(step).toFixed(1)}`);
      before = v;
    }
    // Out on the lift, in on the way down, and no value jumps, at the ends of a part either.
    for (let i = 1; i <= CYCLE * 240; i++) {
      const [was, now] = [alive(clip, (i - 1) / 240), alive(clip, i / 240)];
      for (const [k, most] of [['t', 0.01], ['breath', 0.02], ['effort', 0.02], ['strain', 0.1]]) assert.ok(Math.abs(now[k] - was[k]) < most, `${id}: ${k} jumps at ${(i / 240).toFixed(2)}`);
      if (was.part !== now.part || now.part % 2 === 0) continue;
      assert.ok((now.breath - was.breath) * (now.part === lifting ? -1 : 1) >= -1e-9, `${id} breathes the wrong way at ${(i / 240).toFixed(2)}`);
    }
    // Hard where the lift ends, hardest on the way there, slack where it starts.
    const start = (part) => [0, 0.7, 0.7 + (clip.lowersFirst ? 2.4 : 1.2), 1.4 + (clip.lowersFirst ? 2.4 : 1.2)][part];
    const [low, high] = [alive(clip, start(2 - held) + 0.02), alive(clip, start(held) + 0.02)];
    const peak = Math.max(...FRAMES.map((s) => alive(clip, s)).filter((x) => x.part === lifting).map((x) => x.effort));
    assert.ok(low.effort < 0.1 && high.effort > 0.6 && peak > high.effort + 0.05, `${id}: effort ${low.effort}, ${peak}, ${high.effort}`);
    // In the hold at the end of the lift the weight sinks a little, and comes back; before the lift it waits.
    const sunk = Math.abs(alive(clip, start(held) + 0.35).t - (clip.lowersFirst ? 0 : 1));
    assert.ok(sunk > 0.003 && sunk < 0.01, `${id}: the weight sinks by ${sunk} in the hold`);
    for (const k of [0.1, 0.35, 0.6]) assert.equal(alive(clip, start(2 - held) + k).t, clip.lowersFirst ? 1 : 0, `${id}: no false start`);

    // Every working muscle stands out further where the lift ends than where it starts, breath and all.
    const plain = build(createMesh(), clip, solve(clip.pose(0.5)), 0.5);
    const out = (life) => {
      build(m, clip, solve(clip.pose(0.5), { ...STILL, ...life }), 0.5);
      return plain.parts.filter((p) => p.want).map((p) => {
        const o = (p.base + (p.rows >> 1) * p.cols + (p.cols >> 1)) * STRIDE;
        return [p.want, [0, 1, 2].reduce((sum, a) => sum + (m.v[o + a] - plain.v[o + a]) * plain.v[o + 3 + a], 0)];
      });
    };
    const ends = [out({ breath: high.breath, effort: high.effort }), out({ breath: low.breath, effort: low.effort })];
    ends[0].forEach(([want, far], i) => assert.ok(want === 'helps' || far > ends[1][i][1] + 0.15, `${id}: muscle ${i} stands ${far.toFixed(2)} out at the end of the lift, ${ends[1][i][1].toFixed(2)} at the start`));
    // And none balloons: it thickens by less than a quarter of its width or length.
    const thick = [out({ effort: peak }), out({ effort: 0 })];
    plain.parts.filter((p) => p.want).forEach(({ base, rows, cols }, i) => {
      const point = (r, k) => [...plain.v.subarray((base + r * cols + k) * STRIDE, (base + r * cols + k) * STRIDE + 3)];
      const path = (n, at) => Array.from({ length: n - 1 }, (_, k) => dist(at(k), at(k + 1))).reduce((a, b) => a + b);
      const size = Math.min(path(cols, (k) => point(rows >> 1, k)), path(rows, (r) => point(r, cols >> 1)));
      const more = thick[0][i][1] - thick[1][i][1];
      assert.ok(more < size / 4, `${id}: muscle ${i}, ${size.toFixed(1)} across, thickens by ${more.toFixed(2)}`);
    });
    // A full chest is deeper than an empty one.
    const depth = (breath) => {
      build(m, clip, solve(clip.pose(0.5), { ...STILL, breath }), 0.5);
      const { base, rows, cols } = m.parts.find((p) => p.cols === 36);
      return Math.max(...Array.from({ length: rows }, (_, r) => dist(m.v.subarray((base + r * cols) * STRIDE), m.v.subarray((base + r * cols + cols / 2) * STRIDE))));
    };
    assert.ok(depth(1) > depth(0) + 0.6, `${id}: the chest fills`);
  }
  // A muscle that helps swells half as much as one that works.
  const swell = (want) => {
    const clip = { ...FORM.rdl, works: [], helps: [], [want]: ['calves'] };
    const middle = (effort) => {
      const m = build(createMesh(), clip, solve(clip.pose(0), { ...STILL, effort }), 0);
      const { base, rows, cols } = m.parts.find((p) => p.want);
      return [...m.v.subarray((base + (rows >> 1) * cols + (cols >> 1)) * STRIDE)].slice(0, 3);
    };
    return dist(middle(0), middle(1));
  };
  near(swell('helps') / swell('works'), 0.5, 0.05, 'a helping muscle swells half as much');
  // Eyes: shut and open again within a quarter of a second, every few seconds.
  const tall = (blink) => {
    const { rdl } = FORM;
    const j = solve(rdl.pose(0), { ...STILL, blink });
    const m = build(createMesh(), rdl, j, 0);
    const iris = m.parts.find((p) => p.cols === 20 && p.rows === 6);
    const ys = Array.from({ length: iris.rows * iris.cols }, (_, i) => dot(sub(m.v.subarray((iris.base + i) * STRIDE, (iris.base + i) * STRIDE + 3), j.head), j.headUp));
    return Math.max(...ys) - Math.min(...ys);
  };
  assert.ok(tall(1) < 0.2 * tall(0), 'a shut eye');
  const shut = Array.from({ length: 1200 }, (_, i) => alive(FORM.rdl, i / 60).blink > 0.5);
  const blinks = shut.filter((x, i) => x && !shut[i - 1]).length;
  assert.ok(blinks >= 4 && blinks <= 8, `${blinks} blinks in 20 seconds`);
});

test('every surface has its own material, and its grain moves with it', () => {
  // What stage.js calls them, by the parts they are on: points to a ring, or kind of equipment.
  const [PLAIN, SKIN, CLOTH, HAIR, STEEL, IRON, VINYL, RUBBER, MUSCLE] = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const of = (m, p) => new Set(Array.from({ length: p.rows * p.cols }, (_, i) => m.v[(p.base + i) * STRIDE + 9]));
  const has = (m, pick, want, what) => {
    const parts = m.parts.filter(pick);
    assert.ok(parts.length, `${what} is there`);
    for (const p of parts) assert.deepEqual([...of(m, p)].sort(), want, what);
  };
  const body = (p) => !p.want;
  for (const [id, at] of Object.entries(meshes)) {
    const m = at(0);
    has(m, (p) => body(p) && p.cols === 36, [SKIN, CLOTH], `${id}: shirt, shorts and neck`);
    has(m, (p) => body(p) && p.cols === 22 && p.rows > 30, [SKIN, CLOTH], `${id}: sleeve and arm`);
    has(m, (p) => body(p) && p.cols === 24, [SKIN, CLOTH], `${id}: shorts, leg and sock`);
    has(m, (p) => body(p) && p.cols === 40 && p.rows > 40, [SKIN], `${id}: face`);
    has(m, (p) => body(p) && p.cols === 38, [HAIR], `${id}: hair`);
    has(m, (p) => p.want, [MUSCLE], `${id}: muscles`);
    const gear = new Set(m.parts.slice(m.parts.findLastIndex((p) => p.want) + 1).flatMap((p) => [...of(m, p)]));
    const made = { steel: STEEL, load: IRON, pad: VINYL, cable: RUBBER, rope: CLOTH };
    assert.deepEqual([...gear].sort(), [...new Set(FORM[id].gear(solve(FORM[id].pose(0)), 0).map((g) => made[g.kind]))].sort(), `${id}: equipment`);
    // The grain is fixed to the part for good, and is not the same all over it.
    const grain = (v) => v.filter((_, i) => i % STRIDE > 9);
    const start = grain(m.v.slice(0, m.n * STRIDE));
    assert.deepEqual(grain(at(1).v.slice(0, m.n * STRIDE)), start, `${id}: the grain stays on the skin`);
    for (const p of m.parts) {
      const cells = new Set(Array.from({ length: p.rows * p.cols }, (_, i) => [0, 1, 2].map((a) => Math.round(start[(p.base + i) * 3 + a])).join()));
      assert.ok(cells.size > 3, `${id}: a part has no grain`);
    }
  }
  // Cloth ends in a clean edge: the rings either side of a hem are at the same place.
  for (const p of meshes.rdl(0).parts.filter((q) => !q.want && [36, 22, 24].includes(q.cols) && q.rows > 30)) {
    const { v } = meshes.rdl(0);
    let hems = 0;
    for (let r = 1; r < p.rows; r++) {
      const [a, b] = [(p.base + (r - 1) * p.cols) * STRIDE, (p.base + r * p.cols) * STRIDE];
      if (dist(v.subarray(a + 6, a + 9), v.subarray(b + 6, b + 9)) < 0.05) continue;
      hems++;
      assert.ok(dist(v.subarray(a, a + 3), v.subarray(b, b + 3)) < 1, `a hem is blurred over ${dist(v.subarray(a, a + 3), v.subarray(b, b + 3)).toFixed(1)}`);
    }
    assert.ok(hems >= 1, 'there is a hem');
  }
  const shader = readFileSync(new URL('../src/stage.js', import.meta.url), 'utf8');
  for (const m of [SKIN, CLOTH, HAIR, STEEL, IRON, VINYL, RUBBER, MUSCLE]) assert.match(shader, new RegExp(`m == ${m}\\b`), `material ${m} is shaded`);
  assert.equal(PLAIN, 0);
  // The faces of a plate look out, so light falls on them.
  const m = meshes.rdl(0);
  const plates = m.parts.filter((p) => p.cols === 40 && p.rows < 40);
  assert.equal(plates.length, 2);
  for (const { base, rows, cols } of plates) {
    const z = (i) => m.v[(base + i) * STRIDE + 2];
    const mid = (z(0) + z(rows * cols - 1)) / 2;
    for (let i = cols; i < (rows - 1) * cols; i++) {
      const n = m.v[(base + i) * STRIDE + 5];
      if (Math.abs(n) > 0.9) assert.ok(n * (z(i) - mid) > 0, `ring ${Math.floor(i / cols)} of a plate faces inward`);
    }
  }
});
