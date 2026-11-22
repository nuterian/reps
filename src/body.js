// Gives the skeleton a body and the exercise its equipment, as one triangle
// mesh rebuilt for each moment. Pure: no DOM, no WebGL.
// Every part is a sweep: rings of points along a path. A part says where each
// point is and what colour it has; normals come from the neighbours.
import { add, sub, dot, cross, len, mix, unit, square, flip, dir } from './figure.js';

export const STRIDE = 10; // position 3, normal 3, colour 3, gloss 1
const CAP = 14000;

// A mesh belongs to one clip: what never changes during a rep (the outline of
// each ring, colours, triangles) is worked out the first time and kept.
export function createMesh() {
  return { v: new Float32Array(CAP * STRIDE), i: new Uint16Array(CAP * 6), n: 0, m: 0, parts: [], part: 0 };
}
const begin = (mesh) => { mesh.n = mesh.part = 0; };
const finish = (mesh) => { if (!mesh.m) for (const p of mesh.parts) triangles(mesh, p); };

const TAU = 2 * Math.PI;

function triangles(mesh, { base, rows, cols }) {
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < cols; k++) {
      const a = base + r * cols + k;
      const b = base + r * cols + ((k + 1) % cols);
      mesh.i.set([a, a + cols, b, b, a + cols, b + cols], mesh.m);
      mesh.m += 6;
    }
  }
}

// One part: rings of `cols` points, one for each u.
// ring(u, r): [centre, axis 1, axis 2, axis 3] of a ring, worked out every time.
// shape(u, angle, r): offsets along those axes, worked out once.
// paint(u, angle, r): [colour, gloss], worked out once.
function sweep(mesh, us, cols, ring, shape, paint) {
  const { v } = mesh;
  const rows = us.length;
  const base = mesh.n;
  let part = mesh.parts[mesh.part++];
  if (!part) {
    part = { base, rows, cols, off: new Float32Array(rows * cols * 3) };
    mesh.parts.push(part);
    us.forEach((u, r) => {
      for (let k = 0; k < cols; k++) {
        const angle = (k / cols) * TAU;
        part.off.set(shape(u, angle, r), (r * cols + k) * 3);
        const [color, gloss] = paint(u, angle, r);
        v.set([...color, gloss], (base + r * cols + k) * STRIDE + 6);
      }
    });
  }
  const { off } = part;
  const mid = new Float32Array(rows * 3);
  for (let r = 0; r < rows; r++) {
    const [c, x, y, z] = ring(us[r], r);
    for (let k = 0; k < cols; k++) {
      const f = (r * cols + k) * 3;
      const o = (base + r * cols + k) * STRIDE;
      for (let a = 0; a < 3; a++) {
        const q = c[a] + x[a] * off[f] + y[a] * off[f + 1] + (z ? z[a] * off[f + 2] : 0);
        v[o + a] = q;
        mid[r * 3 + a] += q / cols;
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    const up = base + Math.max(0, r - 1) * cols;
    const down = base + Math.min(rows - 1, r + 1) * cols;
    const here = base + r * cols;
    const [mx, my, mz] = [mid[r * 3], mid[r * 3 + 1], mid[r * 3 + 2]];
    for (let k = 0; k < cols; k++) {
      const a = (up + k) * STRIDE;
      const b = (down + k) * STRIDE;
      const c = (here + (k ? k - 1 : cols - 1)) * STRIDE;
      const d = (here + (k + 1 < cols ? k + 1 : 0)) * STRIDE;
      const o = (here + k) * STRIDE;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[d] - v[c], wy = v[d + 1] - v[c + 1], wz = v[d + 2] - v[c + 2];
      let nx = wy * uz - wz * uy, ny = wz * ux - wx * uz, nz = wx * uy - wy * ux;
      let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-4 || wx * wx + wy * wy + wz * wz < 0.002) {
        // The tip of a closed end points along the path.
        let e = r ? r - 1 : 1;
        if (Math.abs(mx - mid[e * 3]) + Math.abs(my - mid[e * 3 + 1]) + Math.abs(mz - mid[e * 3 + 2]) < 1e-4) e = r * 2 < rows ? rows - 1 : 0;
        nx = mx - mid[e * 3];
        ny = my - mid[e * 3 + 1];
        nz = mz - mid[e * 3 + 2];
        l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      } else if (nx * (v[o] - mx) + ny * (v[o + 1] - my) + nz * (v[o + 2] - mz) < 0) l = -l;
      v[o + 3] = nx / l;
      v[o + 4] = ny / l;
      v[o + 5] = nz / l;
    }
  }
  mesh.n += rows * cols;
}

const steps = (from, to, n) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
// Steps from a to b with a doubled ring at each hem, so cloth ends in a clean edge.
function hemmed(from, to, n, hems) {
  const cuts = [from, ...hems, to];
  return cuts.slice(1).flatMap((b, i) => steps(cuts[i], b, Math.max(3, Math.round((n * (b - cuts[i])) / (to - from)))));
}

// Smooth interpolation through [[u, ...values], ...].
function profile(table) {
  return (u) => {
    let i = 1;
    while (i < table.length - 1 && u > table[i][0]) i++;
    const [a, b] = [table[i - 1], table[i]];
    const k = Math.min(1, Math.max(0, (u - a[0]) / (b[0] - a[0])));
    const e = k * k * (3 - 2 * k);
    return a.slice(1).map((x, n) => x + (b[n + 1] - x) * e);
  };
}

const bump = (x, width) => Math.exp(-((x / width) ** 2));
// How much angle a points toward angle b, 0 to 1, sharper with k.
const toward = (a, b, k = 2) => Math.max(0, Math.cos(a - b)) ** k;
const blend = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  skin: hex('#cf9f7f'), hair: hex('#2b2320'), top: hex('#525b6d'), shorts: hex('#262a33'), shoe: hex('#3a404b'), sole: hex('#f3f4f6'), sock: hex('#eceef2'),
  works: hex('#3f78ff'), helps: hex('#a9c4ff'),
  steel: hex('#b4bac5'), pad: hex('#697180'), load: hex('#ffdc55'), hub: hex('#9aa0ab'), cable: hex('#3a3f48'), rope: hex('#e8dcc0'), dot: hex('#3f78ff'),
};

const easeIn = (x, lo, hi) => { const k = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return k * k * (3 - 2 * k); };

// Tints a surface by the muscles under it. masks: name -> 0..1.
function tint(base, mark, masks) {
  let c = base;
  for (const want of ['helps', 'works']) {
    for (const n of Object.keys(masks)) if (mark[n] === want) c = blend(c, C[want], easeIn(masks[n], 0.22, 0.62) * (want === 'works' ? 0.95 : 0.8));
  }
  return c;
}

// --- limbs -----------------------------------------------------------------

// A limb from a through joint j to b. u runs 0..1..2 along the two bones.
// Angle 0 faces `way`, the outside of the bend. The far side is mirrored.
function limb(mesh, a, j, b, way, us, cols, radius, paint) {
  const d1 = unit(sub(j, a));
  const d2 = unit(sub(b, j));
  const l1 = len(sub(j, a));
  const l2 = len(sub(b, j));
  let turn = unit(cross(d1, way));
  // Angle 90 is always the side away from the body.
  if (turn[2] * Math.sign(a[2]) < 0) turn = turn.map((x) => -x);
  const W = 0.2;
  const p0 = add(j, d1, -l1 * W);
  const p1 = add(j, d2, l2 * W);
  const face1 = square(way, d1);
  const last = us.length - 1;
  sweep(mesh, us, cols, (u) => {
    let c, t;
    if (u < 1 - W) [c, t] = [add(a, d1, l1 * u), d1];
    else if (u > 1 + W) [c, t] = [add(j, d2, l2 * (u - 1)), d2];
    else {
      const k = (u - 1 + W) / (2 * W);
      c = [0, 1, 2].map((i) => (1 - k) ** 2 * p0[i] + 2 * k * (1 - k) * j[i] + k * k * p1[i]);
      t = unit(mix(d1, d2, k));
    }
    const face = cross(turn, t);
    return [c, dot(face, face1) < 0 && u < 1 ? face.map((x) => -x) : face.map((x) => x * Math.sign(dot(cross(turn, d1), face1) || 1)), turn];
  }, (u, angle, r) => {
    const round = Math.min(1, Math.sqrt(Math.max(0, Math.min(u - us[0], us[last] - u)) / 0.1));
    const rad = r === 0 || r === last ? 0.01 : radius(u, angle, r) * round;
    return [Math.cos(angle) * rad, Math.sin(angle) * rad, 0];
  }, paint);
}

const armR = profile([[-0.22, 3.6], [0, 4.7], [0.18, 4.7], [0.5, 4.0], [0.86, 3.15], [1, 3.2], [1.22, 3.5], [1.55, 2.7], [1.86, 1.95], [2.1, 2.1]]);
const legR = profile([[-0.22, 7], [0, 8], [0.18, 7.9], [0.5, 6.5], [0.86, 4.9], [1, 4.7], [1.15, 4.3], [1.4, 4.1], [1.72, 2.9], [1.92, 2.5], [2.1, 2.7]]);

const ARM = {
  shoulders: (u, a) => bump(u - 0.06, 0.27) * (0.6 + 0.4 * toward(a, Math.PI / 2, 1)),
  biceps: (u, a) => bump(u - 0.58, 0.26) * toward(a, Math.PI, 0.9),
  triceps: (u, a) => bump(u - 0.52, 0.3) * toward(a, 0, 0.9),
  forearms: (u) => bump(u - 1.25, 0.26),
};
const SLEEVE = 0.4;
const ARM_U = hemmed(-0.2, 2.04, 36, [SLEEVE]);
const masks = (set, u, a) => Object.fromEntries(Object.entries(set).map(([n, f]) => [n, f(u, a)]));

function arms(mesh, j, mark) {
  // Rings before the hem are cloth; the doubled ring after it is skin.
  const cloth = (r) => r <= ARM_U.indexOf(SLEEVE);
  const radius = (u, a, r) => armR(u)[0] + 0.8 * ARM.shoulders(u, a) + 0.9 * ARM.biceps(u, a) + 0.7 * ARM.triceps(u, a) + 0.35 * ARM.forearms(u) + (cloth(r) ? 0.5 : 0);
  const paint = (u, a, r) => [tint(cloth(r) ? C.top : C.skin, mark, masks(ARM, u, a)), cloth(r) ? 0.03 : 0.12];
  const along = unit(sub(j.hand, j.elbow));
  for (const m of [(p) => p, flip]) {
    limb(mesh, m(j.shoulder), m(j.elbow), m(add(j.hand, along, -1.2)), m(j.elbowWay), ARM_U, 22, radius, paint);
    fist(mesh, m(j.hand), m(along), m(j.grip));
  }
}

// A closed hand around a bar along `grip`.
function fist(mesh, at, along, grip) {
  const g = square(grip, along);
  const palm = cross(g, along);
  sweep(mesh, steps(0, 1, 14), 16, (k) => [add(at, g, (k - 0.5) * 8), along, palm], (k, a, r) => {
    const end = r === 0 || r === 13 ? 0.01 : Math.min(1, Math.sqrt((1 - Math.abs(k - 0.5) * 2) / 0.28));
    const knuckle = 1 - 0.09 * Math.abs(Math.sin(k * 4 * Math.PI)) ** 8;
    const full = (Math.abs(Math.cos(a)) ** 3 + Math.abs(Math.sin(a)) ** 3) ** (-1 / 3);
    return [Math.cos(a) * 2.8 * end * knuckle * full, Math.sin(a) * 2.4 * end * knuckle * full, 0];
  }, () => [C.skin, 0.12]);
}

const LEG = {
  quads: (u, a) => bump(u - 0.48, 0.36) * toward(a, 0, 0.7),
  hamstrings: (u, a) => bump(u - 0.52, 0.34) * toward(a, Math.PI, 0.7),
  glutes: (u, a) => bump(u + 0.04, 0.2) * toward(a, Math.PI, 0.8),
  calves: (u, a) => bump(u - 1.27, 0.2) * toward(a, Math.PI, 0.8),
};
const HEM = 0.6;
const SOCK = 1.8;
const LEG_U = hemmed(-0.18, 2.06, 46, [HEM, SOCK]);

function legs(mesh, j, mark) {
  const cloth = (r) => r <= LEG_U.indexOf(HEM);
  const sock = (r) => r > LEG_U.indexOf(SOCK);
  const radius = (u, a, r) => legR(u)[0] + 0.9 * LEG.quads(u, a) + 0.8 * LEG.hamstrings(u, a) + LEG.glutes(u, a) + 1.3 * LEG.calves(u, a)
    + 0.5 * bump(u - 1, 0.07) * toward(a, 0, 2) + (cloth(r) ? 0.4 + 0.35 * u : sock(r) ? 0.25 : 0);
  const paint = (u, a, r) => [sock(r) ? C.sock : tint(cloth(r) ? C.shorts : C.skin, mark, masks(LEG, u, a)), cloth(r) ? 0.03 : 0.12];
  for (const m of [(p) => p, flip]) {
    limb(mesh, m(j.hip), m(j.knee), m(j.ankle), m(j.kneeWay), LEG_U, 24, radius, paint);
    shoe(mesh, m(j.ankle), m(j.toe), m(j.sole));
  }
}

// Distance from the ankle toward the toes: half width, height.
const shoeR = profile([[-6.4, 0.2, 2.6], [-5.4, 2.7, 4.8], [-2, 3.2, 6.4], [1.5, 3.3, 6], [5, 3.7, 4.5], [9.5, 4.1, 3.4], [13, 3.4, 2.8], [15.2, 1.6, 2], [15.8, 0.1, 1.4]]);

function shoe(mesh, ankle, toe, sole) {
  const across = cross(toe, sole);
  const up = sole.map((x) => -x);
  const floor = add(ankle, sole, 5);
  const us = steps(-6.4, 15.8, 22);
  for (const [from, to, color, grow] of [[0.9, 1, C.shoe, 0], [0, 1.2, C.sole, 0.25]]) {
    // Upper first, then the sole as its own band.
    const isSole = color === C.sole;
    sweep(mesh, us, 20, (x) => [add(floor, toe, x), up, across], (x, a, r) => {
      const [w, h] = shoeR(x);
      const tip = r === 0 || r === us.length - 1 ? 0.02 : 1;
      const top = isSole ? to : h;
      const c = Math.cos(a);
      const y = from + ((top - from) * (1 + Math.sign(c) * Math.abs(c) ** (isSole ? 0.3 : 0.7))) / 2;
      return [tip < 1 ? (from + top) / 2 : y, Math.sign(Math.sin(a)) * Math.abs(Math.sin(a)) ** (isSole ? 0.5 : 0.8) * (w + grow) * tip, 0];
    }, () => [color, isSole ? 0.05 : 0.15]);
  }
}

// --- torso and head ----------------------------------------------------------

// u follows the spine: 0 hips, 3 base of the neck. Half width, depth to the
// front, depth to the back.
const torsoR = profile([
  [-0.62, 3, 3, 3], [-0.45, 8, 5.6, 6], [-0.1, 11.6, 7.2, 8.8], [0.3, 11.5, 7.4, 8], [0.8, 10, 6.8, 6.6], [1.2, 9.9, 6.9, 6.6], [1.7, 11.1, 7.6, 7.4],
  [2.2, 12.8, 8.2, 8], [2.6, 13.6, 7.4, 7.8], [2.86, 13.2, 5.8, 6.6], [3.0, 11.2, 4.8, 5.8], [3.1, 8.4, 4.5, 5.2], [3.24, 5.4, 4.2, 4.6], [3.45, 4.1, 3.9, 4.1], [3.9, 3.9, 3.8, 3.9], [4.1, 3.6, 3.4, 3.6],
]);
const TORSO = {
  chest: (u, a) => bump(u - 2.38, 0.38) * Math.max(toward(a, 0.55, 2), toward(a, -0.55, 2)),
  abs: (u, a) => bump(Math.max(0, Math.abs(u - 1.05) - 0.45), 0.35) * toward(a, 0, 3),
  lats: (u, a) => bump(u - 1.8, 0.55) * Math.max(toward(a, 2.2, 2.5), toward(a, -2.2, 2.5)),
  'upper back': (u, a) => bump(u - 2.5, 0.4) * Math.max(toward(a, 2.75, 2.5), toward(a, -2.75, 2.5)),
  'lower back': (u, a) => bump(u - 0.75, 0.45) * toward(a, Math.PI, 2.5),
  glutes: (u, a) => bump(u + 0.1, 0.38) * Math.max(toward(a, 2.6, 2), toward(a, -2.6, 2)),
};
const WAIST = 0.34;
const COLLAR = 3.14;
const TORSO_U = hemmed(-0.62, 4.1, 54, [WAIST, COLLAR]);

function torso(mesh, j, mark) {
  const { spine, angles } = j;
  const neckAngle = angles[2] + j.headTurn;
  const shorts = (r) => r <= TORSO_U.indexOf(WAIST);
  const shirt = (r) => !shorts(r) && r <= TORSO_U.indexOf(COLLAR);
  sweep(mesh, TORSO_U, 36, (u) => {
    let c;
    if (u <= 0) c = add(spine[0], dir(angles[0]), u * 13.5);
    else if (u >= 3) c = mix(spine[3], j.head, (u - 3) * 0.9);
    else c = mix(spine[Math.floor(u)], spine[Math.floor(u) + 1], u % 1);
    // Lean at u, smoothed so a curled back is round, not folded.
    const x = Math.min(2.5, Math.max(0.5, u)) - 0.5;
    const i = Math.min(1, Math.floor(x));
    const lean = u > 3 ? mix(angles[2], neckAngle, Math.min(1, u - 3)) : mix(angles[i], angles[i + 1], x - i);
    return [c, dir(lean + 90), [0, 0, 1]];
  }, (u, a, r) => {
    if (r === 0 || r === TORSO_U.length - 1) return [0, 0, 0];
    const [w, f, b] = torsoR(u);
    // A softened box in cross section, as a ribcage is.
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const full = (Math.abs(ca) ** 2.5 + Math.abs(sa) ** 2.5) ** (-1 / 2.5);
    const swell = 1.2 * TORSO.chest(u, a) + 0.5 * TORSO.lats(u, a) + 1.2 * TORSO.glutes(u, a) + 0.3 * TORSO['upper back'](u, a)
      - 0.5 * bump(u - 1.6, 0.9) * toward(a, Math.PI, 20) + (shirt(r) ? 0.35 : shorts(r) ? 0.55 : 0);
    return [ca * ((ca > 0 ? f : b) * full + swell), sa * (w * full + swell * 0.5), 0];
  }, (u, a, r) => [tint(shorts(r) ? C.shorts : shirt(r) ? C.top : C.skin, mark, masks(TORSO, u, a)), shorts(r) || shirt(r) ? 0.03 : 0.12]);
}

// Height from the middle of the head: half width, depth, how far forward.
const headR = profile([[-8.4, 0.3, 0.3, 3.2], [-7.6, 2.7, 2.7, 2.6], [-6, 4, 4.3, 1.7], [-3.5, 4.9, 5.8, 0.8], [-0.5, 5.4, 6.7, 0.2], [2.5, 5.7, 7.2, -0.2], [5.5, 5.3, 6.8, -0.4], [7.6, 3.9, 5, -0.5], [8.8, 1.8, 2.3, -0.5], [9.1, 0.05, 0.05, -0.5]]);

function head(mesh, j) {
  const up = j.headUp;
  const front = [up[1], -up[0], 0];
  const side = [0, 0, 1];
  sweep(mesh, steps(-8.4, 9.1, 30), 30, (y) => [add(j.head, up, y), front, side], (y, a) => {
    const [w, d, fwd] = headR(y);
    const nose = 1.5 * bump(y + 1.6, 1.4) * toward(a, 0, 50) + 0.3 * bump(y - 0.8, 0.8) * toward(a, 0, 5);
    const ear = 0.9 * bump(y + 0.4, 1.4) * Math.max(toward(a, 1.75, 30), toward(a, -1.75, 30));
    return [Math.cos(a) * (d + nose) + fwd, Math.sin(a) * (w + ear), 0];
  }, () => [C.skin, 0.12]);
  for (const z of [2.4, -2.4]) {
    const eye = add(add(add(j.head, up, 1.1), front, 5.9), side, z);
    lathe(mesh, add(eye, up, -0.65), add(eye, up, 0.65), [[0, 0.01], [0.25, 0.55], [0.5, 0.68], [0.75, 0.55], [1, 0.01]], 8, C.hair, 0.3);
  }
  // Hair: a cap over the skull, down to a line that drops toward the nape.
  sweep(mesh, steps(0, 1, 14), 30, () => [j.head, front, side, up], (k, a, r) => {
    const low = 4.4 - 7.2 * easeIn(-Math.cos(a), -0.35, 0.55);
    const y = low + (9.5 - low) * k;
    const [w, d, fwd] = headR(Math.min(y, 9.05));
    const thick = r === 0 ? -0.3 : 0.55;
    return [Math.cos(a) * Math.max(0.02, d + thick) + fwd, Math.sin(a) * Math.max(0.02, w + thick), r === 13 ? 9.6 : y];
  }, () => [C.hair, 0.2]);
}

// --- equipment ---------------------------------------------------------------

// Descriptions only; build() turns them into triangles.
export const rod = (kind, a, b, r = 1.4) => ({ shape: 'rod', kind, a, b, r });
export const pad = (kind, a, b, z, r = 3) => ({ shape: 'pad', kind, a: [a[0], a[1], 0], b: [b[0], b[1], 0], z, r });
export const disc = (kind, c, radius, thick = 2) => ({ shape: 'disc', kind, c, radius, thick });
export const sides = (make) => [make(1), make(-1)];
export const dumbbells = (hand, grip = [0, 0, 1]) => [[hand, grip], [flip(hand), flip(grip)]].flatMap(([c, g]) => [
  rod('steel', add(c, g, -9), add(c, g, 9), 1.2),
  { shape: 'head', kind: 'load', a: add(c, g, 4.6), b: add(c, g, 10.2), r: 5 },
  { shape: 'head', kind: 'load', a: add(c, g, -4.6), b: add(c, g, -10.2), r: 5 },
]);

const GLOSS = { steel: 0.5, load: 0.25, pad: 0.06, cable: 0.1, rope: 0.02 };

// A solid of revolution along a to b. rings: [share of the way, radius].
function lathe(mesh, a, b, rings, cols, color, gloss) {
  const t = unit(sub(b, a));
  const x = unit(cross(t, Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
  const y = cross(t, x);
  const l = len(sub(b, a));
  sweep(mesh, rings.map((r) => r[0]), cols, (s) => [add(a, t, s * l), x, y],
    (s, ang, r) => [Math.cos(ang) * rings[r][1], Math.sin(ang) * rings[r][1], 0],
    (s, ang, r) => [typeof color === 'function' ? color(rings[r][1]) : color, gloss]);
}

// How far along, and how thick, a cushion is from one end to the other.
const CUSHION = [[-1, 0.02], [-0.92, 0.6], [-0.6, 0.88], [-0.1, 1], [0.3, 1], [0.7, 1], [1.1, 1], [1.6, 0.88], [1.92, 0.6], [2, 0.02]];

function equipment(mesh, g) {
  const color = C[g.kind];
  const gloss = GLOSS[g.kind] ?? 0.1;
  if (g.shape === 'rod') lathe(mesh, g.a, g.b, [[0, 0.01], [0, g.r], [1, g.r], [1, 0.01]], 12, color, gloss);
  if (g.shape === 'head') lathe(mesh, g.a, g.b, [[0, 0.01], [0, g.r * 0.8], [0.18, g.r], [0.82, g.r], [1, g.r * 0.8], [1, 0.01]], 6, color, gloss);
  if (g.shape === 'disc') {
    const z = [0, 0, g.thick / 2];
    const R = g.radius;
    lathe(mesh, sub(g.c, z), add(g.c, z), [[0.1, 0.01], [0.1, R * 0.2], [0.2, R * 0.22], [0.2, R * 0.7], [0, R * 0.76], [0, R * 0.96], [0.2, R], [0.8, R], [1, R * 0.96], [1, R * 0.76], [0.8, R * 0.7], [0.8, R * 0.22], [0.9, R * 0.2], [0.9, 0.01]], 40,
      (rad) => (rad < R * 0.21 ? C.hub : color), gloss);
  }
  if (g.shape === 'pad') {
    const t = unit(sub(g.b, g.a));
    const n = [-t[1], t[0], 0];
    const l = len(sub(g.b, g.a));
    const R = Math.max(g.r, 0.6);
    sweep(mesh, CUSHION.map((c) => c[0]), 28, (s) => [add(g.a, t, s <= 0 ? s * R : s >= 1 ? l + (s - 1) * R : s * l), [0, 0, 1], n], (s, ang, r) => {
      const edge = CUSHION[r][1];
      const [c, q] = [Math.cos(ang), Math.sin(ang)];
      return [Math.sign(c) * Math.abs(c) ** 0.35 * (g.z + R * (edge - 0.6)) * (edge < 0.1 ? 0.6 : 1), Math.sign(q) * Math.abs(q) ** 0.6 * R * edge, 0];
    }, () => [color, gloss]);
  }
}

// --- the whole picture ---------------------------------------------------------

export const MUSCLES = ['quads', 'hamstrings', 'glutes', 'calves', 'chest', 'abs', 'lats', 'upper back', 'lower back', 'shoulders', 'biceps', 'triceps', 'forearms'];

export function build(mesh, clip, j, t) {
  begin(mesh);
  const mark = {};
  for (const n of clip.helps ?? []) mark[n] = 'helps';
  for (const n of clip.works) mark[n] = 'works';
  torso(mesh, j, mark);
  head(mesh, j);
  arms(mesh, j, mark);
  legs(mesh, j, mark);
  for (const g of clip.gear(j, t)) equipment(mesh, g);
  finish(mesh);
  return mesh;
}

// The dotted path the hands (or feet) follow.
export function dots(mesh, points) {
  begin(mesh);
  for (const p of points) lathe(mesh, add(p, [0, -0.7, 0]), add(p, [0, 0.7, 0]), [[0, 0.01], [0.25, 0.6], [0.5, 0.7], [0.75, 0.6], [1, 0.01]], 8, C.dot, 0);
  finish(mesh);
  return mesh;
}
