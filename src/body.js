// Gives the skeleton a body and the exercise its equipment, as one triangle
// mesh rebuilt for each moment. Pure: no DOM, no WebGL.
// Every part is a sweep: rings of points along a path. A part says where each
// point is and what colour it has; normals come from the neighbours.
import { add, sub, dot, cross, len, mix, unit, square, flip, dir, solve } from './figure.js';

export const STRIDE = 10; // position 3, normal 3, colour 3, gloss 1
export const CAP = 20000; // most points a mesh can hold

// A mesh belongs to one clip: what never changes during a rep (the outline of
// each ring, colours, triangles) is worked out the first time and kept.
export function createMesh() {
  return { v: new Float32Array(CAP * STRIDE), i: new Uint16Array(CAP * 6), n: 0, m: 0, parts: [], part: 0 };
}
const begin = (mesh) => { mesh.n = mesh.part = 0; };
const finish = (mesh) => { if (!mesh.m) for (const p of mesh.parts) triangles(mesh, p); };

const TAU = 2 * Math.PI;

function triangles(mesh, { base, rows, cols, open }) {
  for (let r = 0; r < rows - 1; r++) {
    for (let k = 0; k < (open ? cols - 1 : cols); k++) {
      const a = base + r * cols + k;
      const b = base + r * cols + ((k + 1) % cols);
      mesh.i.set([a, a + cols, b, b, a + cols, b + cols], mesh.m);
      mesh.m += 6;
    }
  }
}

// The normal at the tip of a closed end: square to the ring next to it, which
// may be uneven, and away from that ring's middle.
function tipNormal(v, ring, cols, [tx, ty, tz], [mx, my, mz]) {
  let nx = 0, ny = 0, nz = 0;
  let o = (ring + cols - 1) * STRIDE;
  let px = v[o] - tx, py = v[o + 1] - ty, pz = v[o + 2] - tz;
  for (let k = 0; k < cols; k++) {
    o = (ring + k) * STRIDE;
    const qx = v[o] - tx, qy = v[o + 1] - ty, qz = v[o + 2] - tz;
    nx += py * qz - pz * qy;
    ny += pz * qx - px * qz;
    nz += px * qy - py * qx;
    px = qx;
    py = qy;
    pz = qz;
  }
  const way = [tx - mx, ty - my, tz - mz];
  const n = [nx, ny, nz];
  return unit(len(n) < 1e-7 ? way : add([0, 0, 0], n, dot(n, way) < 0 ? -1 : 1));
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
    let tip;
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
        tip ??= tipNormal(v, base + e * cols, cols, [mx, my, mz], mid.subarray(e * 3, e * 3 + 3));
        nx = tip[0];
        ny = tip[1];
        nz = tip[2];
        l = 1;
      } else if (nx * (v[o] - mx) + ny * (v[o + 1] - my) + nz * (v[o + 2] - mz) < 0) l = -l;
      v[o + 3] = nx / l;
      v[o + 4] = ny / l;
      v[o + 5] = nz / l;
    }
  }
  mesh.n += rows * cols;
  return part;
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

// A smooth curve through points, one for each whole number of u.
function spline(points, u) {
  const last = points.length - 1;
  const i = Math.min(last - 1, Math.floor(u));
  const k = u - i;
  const [p, a, b, q] = [-1, 0, 1, 2].map((n) => points[Math.min(last, Math.max(0, i + n))]);
  return a.map((x, n) => x + 0.5 * k * (b[n] - p[n] + k * (2 * p[n] - 5 * x + 4 * b[n] - q[n] + k * (3 * (x - b[n]) + q[n] - p[n]))));
}

const bump = (x, width) => Math.exp(-((x / width) ** 2));
// How much angle a points toward angle b, 0 to 1, sharper with k.
const toward = (a, b, k = 2) => Math.max(0, Math.cos(a - b)) ** k;
const blend = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const C = {
  skin: hex('#cf9f7f'), hair: hex('#2b2320'), lips: hex('#bd8170'), white: hex('#f0ebe6'), iris: hex('#3a281e'), top: hex('#525b6d'), shorts: hex('#262a33'), shoe: hex('#3a404b'), sole: hex('#f3f4f6'), sock: hex('#eceef2'),
  works: hex('#b23a34'), worksDark: hex('#8a2422'), helps: hex('#e79a90'), helpsDark: hex('#cf7a72'), tendon: hex('#efd9cb'),
  steel: hex('#b4bac5'), pad: hex('#697180'), load: hex('#ffdc55'), hub: hex('#9aa0ab'), cable: hex('#3a3f48'), rope: hex('#e8dcc0'), dot: hex('#8a909c'),
};

const easeIn = (x, lo, hi) => { const k = Math.min(1, Math.max(0, (x - lo) / (hi - lo))); return k * k * (3 - 2 * k); };

// --- limbs -----------------------------------------------------------------

// A limb from a through joint j to b. u runs 0..1..2 along the two bones.
// Angle 0 faces `way`, the outside of the bend. The far side is mirrored. A
// limb has a root inside the torso: there u runs on from 0 down to -1, so the
// shoulder or hip is one skin with it wherever it points.
function limb(mesh, a, j, b, way, us, cols, radius, paint, root) {
  const d1 = unit(sub(j, a));
  const d2 = unit(sub(b, j));
  const l1 = len(sub(j, a));
  const l2 = len(sub(b, j));
  const d0 = unit(sub(a, root));
  const l0 = len(sub(a, root));
  // Around a joint the path rounds the corner from p to q.
  const corner = (p, at, q, from, to, k) => [
    [0, 1, 2].map((i) => (1 - k) ** 2 * p[i] + 2 * k * (1 - k) * at[i] + k * k * q[i]), unit(mix(from, to, k))];
  const W = 0.2;
  const R = 0.75;
  const path = (u) => {
    if (u < 0.26) {
      if (u < -R) return [add(a, d0, l0 * u), d0];
      return corner(add(a, d0, -l0 * R), a, add(a, d1, l1 * 0.26), d0, d1, (u + R) / (0.26 + R));
    }
    if (u < 1 - W) return [add(a, d1, l1 * u), d1];
    if (u > 1 + W) return [add(j, d2, l2 * (u - 1)), d2];
    return corner(add(j, d1, -l1 * W), j, add(j, d2, l2 * W), d1, d2, (u - 1 + W) / (2 * W));
  };
  // Carry the ring's facing along the path without twisting, out from the
  // middle of the first bone in both directions.
  // The two sides are mirrored; the sense never flips during a rep.
  const turn = unit(cross(d1, way)).map((x) => -x * Math.sign(a[2]));
  const face = square(way, d1);
  const start = us.findIndex((u) => u >= 0.3);
  const rings = [];
  for (const [from, to, by] of [[start, us.length, 1], [start - 1, -1, -1]]) {
    let [f, t] = [face, turn];
    for (let r = from; r !== to; r += by) {
      const [c, d] = path(us[r]);
      f = square(f, d);
      t = square(sub(t, [f[0] * dot(t, f), f[1] * dot(t, f), f[2] * dot(t, f)]), d);
      rings[r] = [c, f, t];
    }
  }
  const last = us.length - 1;
  return sweep(mesh, us, cols, (u, r) => rings[r], (u, angle, r) => {
    const round = Math.min(1, Math.sqrt(Math.max(0, Math.min(u - us[0], us[last] - u)) / 0.1));
    const rad = r === 0 || r === last ? 0.01 : radius(u, angle, r) * round;
    return [Math.cos(angle) * rad, Math.sin(angle) * rad, 0];
  }, paint);
}

const armR = profile([[-1, 4.6], [-0.6, 4.8], [-0.25, 4.2], [0.1, 4.3], [0.25, 4.5], [0.5, 4.0], [0.86, 3.15], [1, 3.2], [1.22, 3.5], [1.55, 2.7], [1.86, 1.95], [2.1, 2.1]]);
const legR = profile([[-1, 2.5], [-0.65, 4.6], [-0.3, 6.6], [0, 7.9], [0.2, 7.9], [0.5, 6.5], [0.86, 4.9], [1, 4.7], [1.15, 4.3], [1.4, 4.1], [1.72, 2.9], [1.92, 2.5], [2.1, 2.7]]);

const ARM = {
  shoulders: (u) => 0.85 * bump(Math.max(0, Math.abs(u + 0.05) - 0.22), 0.2),
  biceps: (u, a) => bump(u - 0.58, 0.26) * toward(a, Math.PI, 0.9),
  triceps: (u, a) => bump(u - 0.52, 0.3) * toward(a, 0, 0.9),
  forearms: (u) => bump(u - 1.25, 0.26),
};
const SLEEVE = 0.4;
const ARM_U = hemmed(-1, 2.04, 44, [SLEEVE]);

function arms(mesh, j) {
  // Rings before the hem are cloth; the doubled ring after it is skin.
  const cloth = (r) => r <= ARM_U.indexOf(SLEEVE);
  const radius = (u, a, r) => armR(u)[0] + 0.45 * ARM.shoulders(u, a) + 0.9 * ARM.biceps(u, a) + 0.7 * ARM.triceps(u, a) + 0.35 * ARM.forearms(u) + (cloth(r) ? 0.5 : 0);
  const paint = (u, a, r) => [cloth(r) ? C.top : C.skin, cloth(r) ? 0.03 : 0.12];
  const along = unit(sub(j.hand, j.elbow));
  const root = add(mix(j.spine[3], j.spine[2], 0.5), [0, 0, 5]);
  return [(p) => p, flip].map((m) => {
    const part = limb(mesh, m(j.shoulder), m(j.elbow), m(add(j.hand, along, -1.2)), m(j.elbowWay), ARM_U, 22, radius, paint, m(root));
    fist(mesh, m(j.hand), m(along), m(j.grip));
    return part;
  });
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
  glutes: (u, a) => bump(u + 0.22, 0.24) * toward(a, Math.PI, 0.8),
  calves: (u, a) => bump(u - 1.27, 0.2) * toward(a, Math.PI, 0.8),
};
const HEM = 0.6;
const SOCK = 1.8;
const LEG_U = hemmed(-1, 2.06, 52, [HEM, SOCK]);

function legs(mesh, j) {
  const cloth = (r) => r <= LEG_U.indexOf(HEM);
  const sock = (r) => r > LEG_U.indexOf(SOCK);
  const radius = (u, a, r) => legR(u)[0] + 0.9 * LEG.quads(u, a) + 0.8 * LEG.hamstrings(u, a) + 2 * LEG.glutes(u, a) + 1.3 * LEG.calves(u, a)
    + 0.5 * bump(u - 1, 0.07) * toward(a, 0, 2) + (cloth(r) ? 0.4 + 0.35 * Math.max(0, u) : sock(r) ? 0.25 : 0);
  const paint = (u, a, r) => [sock(r) ? C.sock : cloth(r) ? C.shorts : C.skin, cloth(r) ? 0.03 : 0.12];
  // Deep in the hips, half way between up the spine and back along the thigh,
  // so the thigh grows out of them wherever it points and never folds sharply.
  const root = add([j.hip[0], j.hip[1], 3.5], unit(add(dir(j.angles[0]), unit(sub(j.knee, j.hip)), -0.7)), 9);
  return [(p) => p, flip].map((m) => {
    const part = limb(mesh, m(j.hip), m(j.knee), m(j.ankle), m(j.kneeWay), LEG_U, 24, radius, paint, m(root));
    shoe(mesh, m(j.ankle), m(j.toe), m(j.sole));
    return part;
  });
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
  [-0.62, 3, 2.5, 2.5], [-0.45, 7, 4.6, 4.6], [-0.25, 10, 6, 6.4], [-0.02, 11.6, 7.2, 8.2], [0.3, 11.5, 7.4, 8], [0.8, 10, 6.8, 6.6], [1.2, 9.9, 6.9, 6.6], [1.7, 11.1, 7.6, 7.4],
  [2.2, 12.8, 8.2, 8], [2.6, 12.6, 7.4, 7.8], [2.78, 12, 6.2, 7], [2.92, 10.6, 5.4, 6.3], [3.06, 8, 4.7, 5.5], [3.2, 5.8, 4.3, 4.9], [3.34, 4.5, 4.1, 4.3], [3.45, 4.1, 3.9, 4.1], [3.9, 3.9, 3.8, 3.9], [4.1, 3.6, 3.4, 3.6],
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
const COLLAR = 3.28;
const TORSO_U = hemmed(-0.62, 4.1, 54, [WAIST, COLLAR]);

function torso(mesh, j) {
  const { spine, angles } = j;
  const neckAngle = angles[2] + j.headTurn;
  const shorts = (r) => r <= TORSO_U.indexOf(WAIST);
  const shirt = (r) => !shorts(r) && r <= TORSO_U.indexOf(COLLAR);
  return sweep(mesh, TORSO_U, 36, (u) => {
    let c;
    if (u <= 0) c = add(spine[0], dir(angles[0]), u * 13.5);
    else if (u >= 3) c = mix(spine[3], j.head, (u - 3) * 0.9);
    else c = mix(spine[Math.floor(u)], spine[Math.floor(u) + 1], u % 1);
    // Lean at u, smoothed so a curled back is round, not folded.
    const x = Math.min(2.5, Math.max(0.5, u)) - 0.5;
    const i = Math.min(1, Math.floor(x));
    const lean = u > 3 ? mix(angles[2], neckAngle, Math.min(1, u - 3)) : mix(angles[i], angles[i + 1], x - i);
    // A breath fills the ribs to the front and the sides, and the belly a little.
    const full = (j.life.breath - 0.5) * (0.045 * bump(u - 2.1, 0.7) + 0.03 * bump(u - 1, 0.5));
    const front = dir(lean + 90);
    return [add(c, front, 7 * full), front.map((x) => x * (1 + full)), [0, 0, 1 + 0.6 * full]];
  }, (u, a, r) => {
    if (r === 0 || r === TORSO_U.length - 1) return [0, 0, 0];
    const [w, f, b] = torsoR(u);
    // A softened box in cross section, as a ribcage is.
    const [ca, sa] = [Math.cos(a), Math.sin(a)];
    const full = (Math.abs(ca) ** 2.5 + Math.abs(sa) ** 2.5) ** (-1 / 2.5);
    const swell = 1.2 * TORSO.chest(u, a) + 0.5 * TORSO.lats(u, a) + 1.2 * TORSO.glutes(u, a) + 0.3 * TORSO['upper back'](u, a)
      - 0.5 * bump(u - 1.6, 0.9) * toward(a, Math.PI, 20) + (shirt(r) ? 0.35 : shorts(r) ? 0.55 : 0);
    return [ca * ((ca > 0 ? f : b) * full + swell), sa * (w * full + swell * 0.5), 0];
  }, (u, a, r) => [shorts(r) ? C.shorts : shirt(r) ? C.top : C.skin, shorts(r) || shirt(r) ? 0.03 : 0.12]);
}

// The head is fixed to the skeleton: x is forward, y is up from its middle and
// z is to the near side. One ring of the skull per line, from under the chin to
// the crown: height, front, back, half width.
const SKULL = [
  [-8.8, 4.2, 4.2, 0], [-8.45, 5.5, 2.6, 1.5], [-7.85, 6.3, 1.2, 2.5], [-6.9, 6.5, -0.6, 3.5], [-5.6, 6.4, -2.6, 4.3], [-4, 6.4, -4.4, 4.8],
  [-2.2, 6.4, -5.9, 5.15], [-0.2, 6.5, -6.9, 5.35], [1.8, 6.8, -7.4, 5.6], [3.8, 6.7, -7.5, 5.7], [5.5, 6, -7.1, 5.45], [7, 4.7, -6.1, 4.7], [8.2, 2.9, -4.6, 3.4], [8.9, 1.1, -2.7, 1.7], [9.15, -0.8, -0.8, 0],
];
const CROWN = SKULL.length - 1;
const skullRing = (u) => spline(SKULL, u);
// How far the face stands out from the skull at a height and a distance from the middle.
function relief(y, z) {
  const s = Math.abs(z);
  const at = (py, pz, hy, hz) => bump(y - py, hy) * bump(s - pz, hz);
  const bridge = easeIn(y, -4.3, -2.1) * easeIn(-y, -2.6, -0.2) * (0.55 + 1.15 * easeIn(-y, -0.6, 2.4));
  return bridge * bump(z, 0.9 + 0.3 * easeIn(-y, 0, 2.4)) + 0.4 * at(-2.4, 0, 0.8, 0.8) // nose
    + 0.3 * at(-2.7, 1, 0.65, 0.5) // nostrils
    + 0.3 * at(2.3, 2.2, 1, 1.9) + 0.2 * at(2.1, 0, 0.9, 1.1) - 0.25 * at(0.8, 0, 0.7, 1.1) // brow
    - 0.6 * at(0.7, 2.2, 1.3, 1.5) + 0.25 * at(0.4, 2.5, 0.6, 0.9) // eyes, set back under the brow
    + 0.4 * at(-1.6, 3.6, 1.4, 1.4) - 0.2 * at(-4.3, 4, 1.6, 1.1) // cheeks
    + 0.28 * at(-4.9, 0, 1.6, 2.2) - 0.12 * at(-3.9, 0, 0.5, 0.35) // mouth
    + 0.16 * at(-4.5, 0.4, 0.4, 0.9) + 0.28 * at(-5.4, 0, 0.45, 1) - 0.28 * at(-4.97 + 0.03 * z * z, 0, 0.18, 1.3) // lips
    - 0.3 * at(-6.2, 0, 0.5, 1.2) + 0.5 * at(-7.4, 0, 0.9, 1.5); // chin
}
// A point of the head, on the skull at ring u and angle a, pushed out by `out`.
function skull(u, a, out = 0) {
  const [y, f, b, w] = skullRing(u);
  const [ca, sa] = [Math.cos(a), Math.sin(a)];
  const full = (Math.abs(ca) ** 2.3 + Math.abs(sa) ** 2.3) ** (-1 / 2.3);
  const z = sa * full * w;
  const face = out ? 0 : relief(y, z) * easeIn(ca, 0, 0.45) * easeIn(u, 0, 1);
  return [(f + b) / 2 + ca * (full * (f - b) / 2 + out) + face, y, z + sa * out];
}

// The point of the face at a height and a distance from the middle.
function onFace(y, z) {
  const find = (lo, hi, low) => {
    for (let i = 0; i < 20; i++) [lo, hi] = low((lo + hi) / 2) ? [(lo + hi) / 2, hi] : [lo, (lo + hi) / 2];
    return lo;
  };
  const u = find(0, CROWN, (m) => skullRing(m)[0] < y);
  const [x] = skull(u, find(0, 1.5, (m) => skull(u, m)[2] < z));
  return [x, y, z];
}
// What lies on the face, worked out for the first clip so launch does not pay
// for it: rings of [x, y, z] from the middle of each patch to its edge.
// An eye is an almond of white with an iris, almost flush with the skin.
const EYE = { y: 0.45, z: 2.45, half: 1.15, lid: 0.15 };
const almond = (z, up) => {
  const k = Math.min(1, Math.abs(z) / EYE.half);
  return (up ? 0.54 * (1 - k ** 2.4) : -0.4 * (1 - k ** 2)) + 0.06 * z;
};
function patch(cols, out, dome, point) {
  // The last two rings close it behind.
  return [0, 0.45, 0.75, 1, 1, -1].map((u) => Array.from({ length: cols }, (_, k) => {
    const [z, y] = point(Math.max(0, u), (k / cols) * TAU);
    const [x] = onFace(EYE.y + y, EYE.z + z);
    if (u < 0) return [x - 0.3, EYE.y + y, EYE.z + z];
    return [x + out + dome * (1 - u * u), EYE.y + y, EYE.z + z];
  }));
}
let eyes;
const drawEyes = () => ({
  white: patch(18, 0.02, 0.08, (u, a) => {
    const z = EYE.half * Math.cos(a);
    return [u * z, 0.05 * (1 - u) + u * almond(z, Math.sin(a) > 0)];
  }),
  iris: patch(20, 0.095, 0.06, (u, a) => {
    const z = 0.52 * u * Math.cos(a);
    return [z, Math.min(almond(z, true), Math.max(almond(z, false), 0.1 + 0.52 * u * Math.sin(a)))];
  }),
  // The upper lashes: a thin dark line along the lid.
  lash: steps(0, 1, 11).map((k) => {
    const z = EYE.half * 1.06 * (2 * k - 1);
    return onFace(EYE.y + almond(z, true) + 0.04, EYE.z + z);
  }),
  brow: steps(0, 1, 9).map((k) => onFace(2.25 + 0.25 * Math.sin(k * 2.9), 1.15 + 2.75 * k)),
});

// Rings and columns crowd toward the face, where the detail is.
const FACE_U = [...steps(0, 1, 4), ...steps(1.4, 2.8, 4), ...steps(3.1, 5.6, 18), ...steps(5.8, 9.2, 17), ...steps(9.8, CROWN, 5)];
const faceward = (a) => a - 0.6 * Math.sin(a);

// Up the face and over, how high the hair starts. It drops in front of the ear,
// clears it, and falls to the nape.
const HAIRLINE = profile([[0, 9.75], [0.5, 9.85], [0.85, 9.6], [1.1, 8.6], [1.3, 7.1], [1.5, 6.9], [1.62, 8.1], [2.05, 7.2], [2.4, 5.4], [3.2, 5.0]]);
const HAIR_K = [0, 0.01, 0.04, 0.1, ...steps(0.18, 1, 14)];

function head(mesh, j) {
  const { head: at, headUp: up } = j;
  const front = [up[1], -up[0], 0];
  // Every part is fixed to the head: point(u, angle, r) is [x, y, z].
  const part = (us, cols, point, paint) => sweep(mesh, us, cols, () => [at, front, up, [0, 0, 1]], point, paint);
  // An eye shuts by closing up to its lower lid.
  const lid = add(at, up, EYE.lid);
  const open = up.map((x) => x * (1 - 0.93 * j.life.blink));
  const eye = (us, cols, point, paint) => sweep(mesh, us, cols, () => [lid, front, open, [0, 0, 1]], (...a) => add(point(...a), [0, -EYE.lid, 0]), paint);

  part(FACE_U, 40, (u, a) => skull(u, faceward(a)), (u, a) => {
    const [x, y, z] = skull(u, faceward(a));
    const lips = x > 0 ? easeIn(bump(y + 5, 0.75) * bump(z, 1.75), 0.4, 0.85) : 0;
    return [blend(C.skin, C.lips, lips), 0.12];
  });

  for (const s of [1, -1]) {
    eyes ??= drawEyes();
    const onSide = ([x, y, z]) => [x, y, z * s];
    const lay = (rings, paint) => eye([...rings.keys()], rings[0].length, (u, a, r) => onSide(rings[r][Math.round((a / TAU) * rings[0].length)]), paint);
    // A line along points of the face, thickest where full(k) is 1.
    const line = (where, points, tall, deep, full, paint) => where(steps(0, 1, points.length), 8, (k, a, r) => {
      const thick = r % (points.length - 1) ? full(k) : 0.02;
      const [x, y, z] = points[r];
      return onSide([x + deep * thick * Math.sin(a), y + tall * thick * Math.cos(a), z]);
    }, () => paint);
    // The white darkens under the lids, so the eye sits in the face.
    lay(eyes.white, (u) => [blend(C.white, C.skin, 0.55 * easeIn(u, 1, 3)), 0.1]);
    lay(eyes.iris, () => [C.iris, 0.06]);
    line(eye, eyes.lash, 0.1, 0.1, (k) => Math.sqrt(Math.sin(Math.PI * k)), [C.hair, 0]);
    line(part, eyes.brow, 0.27, 0.11, (k) => Math.sqrt(Math.min(1, (1 - k) / 0.7, 0.4 + k / 0.3)), [blend(C.hair, C.skin, 0.2), 0]);

    // Ear: a thin shell inside a rim that curls round to the lobe.
    const shell = (a, r, lift) => [-1 + r * (Math.cos(a) * 1.25 - Math.sin(a) * 0.4), -0.4 + r * Math.sin(a) * 2.05, 5.1 + r * (0.55 - 0.65 * Math.cos(a)) + lift];
    part([0, 1, 2, 3, 4], 14, (u, a) => onSide(shell(a, [0.02, 0.5, 0.95, 0.9, 0.02][u], [0.75, 0.3, -0.2, -0.6, -0.8][u])), () => [blend(C.skin, C.hair, 0.15), 0.05]);
    part(steps(0, 1, 16), 8, (k, a, r) => {
      const round = -0.5 + 5.2 * k;
      const [x, y] = unit(sub(shell(round, 1, 0), shell(round, 0.5, 0)));
      const thick = r % 15 ? 0.3 + 0.18 * Math.sin(k * 3) + 0.3 * bump(k - 0.93, 0.1) : 0.02;
      return onSide(add(shell(round, 0.95, 0.2), [x * Math.cos(a), y * Math.cos(a), Math.sin(a)], thick));
    }, () => [C.skin, 0.1]);
  }

  // Hair: a short cut, cropped close at the sides.
  const turned = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  part(HAIR_K, 38, (k, angle, r) => {
    const a = angle - 0.25 * Math.sin(2 * angle);
    const low = HAIRLINE(turned(a))[0];
    const u = low + (CROWN - low) * k;
    const thick = r ? (0.15 + easeIn(k, -0.05, 0.4) * (0.15 + 0.8 * easeIn(u, 7, 10.8))) * (1 - easeIn(u, 12.2, CROWN)) : -0.4;
    return add(skull(u, a, thick), [0, 0.75 * easeIn(u, 9.6, 13), 0]);
  }, (k, a) => [blend(C.hair, C.skin, 0.4 * (1 - easeIn(k, 0, 0.35)) * easeIn(turned(a), 0.9, 1.4)), 0.12]);
}

// --- muscles -------------------------------------------------------------------

// A muscle is drawn as one or more sheets lying on the body, each between two
// edges that run the way its fibres do. Edge points are [u, angle] on the part
// the sheet lies on, for one side of the body; the other is its mirror. On the
// torso, 0 is the front and pi the back; on a limb, 0 is the outside of the
// bend, or for a shoulder the top of the arm.
const PI = Math.PI;
const spindle = (on, from, to, left, right, end = 0.4) => {
  const mid = (left + right) / 2;
  return { on, edges: [left, right].map((e) => [[0, end], [0.12, 0.75], [0.35, 1], [0.65, 1], [0.88, 0.75], [1, end]].map(([k, w]) => [from + (to - from) * k, mid + (e - mid) * w])) };
};
const block = (from, to) => ({ on: 'torso', plump: 0.5, swell: 1.5, edges: [[0.08, 0.05], [0.48, 0.56]].map(([end, mid]) => [[from, end], [from + 0.05, mid], [to - 0.05, mid], [to, end]]) });
const SHAPES = {
  chest: [{ on: 'torso', swell: 1.8, edges: [
    [[2.9, 0.07], [3.02, 0.42], [2.92, 0.85], [2.6, 1.35]],
    [[1.95, 0.07], [1.82, 0.4], [1.95, 0.85], [2.36, 1.35]]] }],
  // The long muscle in its blocks, and the one that wraps the side.
  abs: [...[[0.4, 0.8], [0.82, 1.2], [1.22, 1.58], [1.6, 1.92]].map(([a, b]) => block(a, b)), { on: 'torso', plump: 0.4, swell: 1.5, edges: [
    [[1.75, 0.68], [1.2, 0.66], [0.8, 0.66], [0.42, 0.7]],
    [[1.85, 1.2], [1.35, 1.6], [0.85, 1.6], [0.42, 1.3]]] }],
  lats: [{ on: 'torso', edges: [
    [[1.7, PI - 0.1], [2, PI - 0.5], [2.25, PI - 1], [2.45, 1.5]],
    [[0.62, PI - 0.2], [1.1, PI - 0.85], [1.65, 1.75], [2.25, 1.45]]] }],
  'upper back': [{ on: 'torso', edges: [
    [[3.3, PI - 0.1], [3.02, PI - 0.5], [2.86, PI - 0.9], [2.72, 1.85]],
    [[1.6, PI - 0.06], [2.12, PI - 0.35], [2.48, PI - 0.8], [2.6, 1.85]]] }],
  'lower back': [{ on: 'torso', edges: [
    [[0.36, PI - 0.08], [0.8, PI - 0.06], [1.3, PI - 0.06], [1.9, PI - 0.08]],
    [[0.36, PI - 0.42], [0.8, PI - 0.56], [1.3, PI - 0.4], [1.9, PI - 0.12]]] }],
  shoulders: [-1, 0, 1].map((h) => ({ on: 'arm', top: true, edges: [-0.54, 0.54].map((e) => [
    [-0.5, 1.12 * h + e], [-0.1, 1.12 * h + e], [0.22, 0.85 * h + 0.85 * e], [0.54, 0.28 * h + 0.25 * e]]) })),
  biceps: [{ ...spindle('arm', 0.2, 0.97, PI - 0.95, PI + 0.95, 0.25), swell: 2 }],
  triceps: [spindle('arm', 0.26, 0.88, -1.05, -0.05, 0.3), spindle('arm', 0.26, 0.88, 0.05, 1.05, 0.3)],
  forearms: [PI - 0.5, PI + 0.5, 1.5, -1.5].map((m) => spindle('arm', 1.04, 1.66, m - 0.46, m + 0.46, 0.3)),
  quads: [spindle('leg', 0.12, 0.9, -0.38, 0.38, 0.25), spindle('leg', 0.08, 0.95, -1.75, -0.42, 0.35), spindle('leg', 0.4, 0.99, 0.42, 1.2, 0.3)],
  hamstrings: [spindle('leg', 0.16, 0.99, PI + 0.04, PI + 0.85, 0.3), spindle('leg', 0.16, 0.99, PI - 0.85, PI - 0.04, 0.3)],
  calves: [spindle('leg', 1.04, 1.56, PI + 0.04, PI + 0.95, 0.3), spindle('leg', 1.04, 1.6, PI - 0.95, PI - 0.04, 0.3)],
  // From the back of the pelvis to the outside of the thigh, across the hip.
  glutes: [{ on: 'torso', to: 'leg', plump: 1.2, edges: [
    [[0.42, PI - 0.5], [0.34, PI - 0.95], [0.12, PI - 1.2], [0, PI - 1.3], [-0.1, PI - 1.3]],
    [[0.2, PI - 0.1], [-0.12, PI - 0.1], [-0.4, PI - 0.14], [-0.5, PI - 0.3], [-0.5, PI - 0.4]]], far: [
    [[-0.17, PI + 0.6], [-0.15, PI + 0.9], [-0.05, PI + 1.2], [0.1, PI + 1.3], [0.38, PI + 1.05]],
    [[-0.17, PI - 0.8], [-0.1, PI - 0.9], [0.06, PI - 0.85], [0.2, PI - 0.5], [0.38, PI + 0.75]]] }],
};

// A sheet of rows along the fibres by cols across them, laid over parts that
// are already built: each point is a fixed blend of four of their points, or
// of eight where the sheet crosses from one part to the next, so it moves with
// the body and never slides on it. One that crosses the hip is also kept outside
// the thigh, which turns up into it as the hip bends. It thickens with effort.
const SHEET = { rows: 16, cols: 11, open: true };
function sheet(mesh, parents, shape, turn, want, thigh, effort) {
  const { v } = mesh;
  const { rows, cols } = SHEET;
  const base = mesh.n;
  const size = rows * cols;
  let part = mesh.parts[mesh.part++];
  if (!part) {
    const many = parents.length * 4;
    part = { ...SHEET, base, want, many, from: new Uint16Array(size * many), share: new Float32Array(size * many), lift: new Float32Array(size) };
    mesh.parts.push(part);
    for (let i = 0; i < size; i++) {
      const s = Math.floor(i / cols) / (rows - 1);
      const w = (i % cols) / (cols - 1);
      const over = easeIn(s, 0.3, 0.75);
      parents.forEach(([parent, us, edges], n) => {
        const [u, angle] = mix(...edges.map((e) => spline(e, s * (e.length - 1))), w);
        const row = Math.max(0, Math.min(us.length - 2, us.findLastIndex((x) => x <= u)));
        const p = Math.min(1, Math.max(0, (u - us[row]) / (us[row + 1] - us[row] || 1)));
        const round = (((angle + turn) / TAU) % 1 + 1) % 1 * parent.cols;
        const col = Math.floor(round) % parent.cols;
        const next = (col + 1) % parent.cols;
        const q = round - Math.floor(round);
        const near = parent.base + row * parent.cols;
        const much = parents.length === 1 ? 1 : n ? over : 1 - over;
        part.from.set([near + col, near + next, near + parent.cols + col, near + parent.cols + next], i * many + n * 4);
        part.share.set([(1 - p) * (1 - q), (1 - p) * q, p * (1 - q), p * q].map((x) => x * much), i * many + n * 4);
      });
      part.lift[i] = 0.22 + (shape.plump ?? 0.75) * Math.sqrt(Math.max(0, 1 - (2 * w - 1) ** 2)) * Math.sin(PI * s) ** 0.5;
      // Fibres: every other line is darker. The ends pale into tendon.
      const tendon = Math.max(0, 1 - Math.min(s, 1 - s) / 0.1);
      v.set([...blend(blend(C[want], C[`${want}Dark`], i % cols % 2 ? 0 : 0.75), C.tendon, 0.45 * tendon), 0.18], (base + i) * STRIDE + 6);
    }
  }
  const { from, share, lift, many } = part;
  const hard = 1 + effort * (shape.swell ?? 1) * (want === 'works' ? 1 : 0.5);
  for (let i = 0; i < size; i++) {
    const o = (base + i) * STRIDE;
    let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0;
    for (let n = i * many; n < (i + 1) * many; n++) {
      const f = from[n] * STRIDE;
      const k = share[n];
      x += k * v[f];
      y += k * v[f + 1];
      z += k * v[f + 2];
      nx += k * v[f + 3];
      ny += k * v[f + 4];
      nz += k * v[f + 5];
    }
    const stand = lift[i] * hard;
    const l = stand / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
    x += nx * l;
    y += ny * l;
    z += nz * l;
    if (thigh) {
      const [hip, knee] = thigh;
      const bone = sub(knee, hip);
      const u = Math.max(0, dot(sub([x, y, z], hip), bone) / dot(bone, bone));
      const out = sub([x, y, z], add(hip, bone, u));
      const room = legR(u)[0] + 1 + 0.5 * stand;
      if (len(out) < room) [x, y, z] = add(add(hip, bone, u), out, room / len(out));
      z = Math.sign(hip[2]) * Math.max(0.5, z * Math.sign(hip[2]));
    }
    v[o] = x;
    v[o + 1] = y;
    v[o + 2] = z;
    v[o + 3] = nx;
    v[o + 4] = ny;
    v[o + 5] = nz;
  }
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const o = (base + r * cols + k) * STRIDE;
      const a = (base + Math.max(0, r - 1) * cols + k) * STRIDE;
      const b = (base + Math.min(rows - 1, r + 1) * cols + k) * STRIDE;
      const c = (base + r * cols + Math.max(0, k - 1)) * STRIDE;
      const d = (base + r * cols + Math.min(cols - 1, k + 1)) * STRIDE;
      const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
      const wx = v[d] - v[c], wy = v[d + 1] - v[c + 1], wz = v[d + 2] - v[c + 2];
      let nx = wy * uz - wz * uy, ny = wz * ux - wx * uz, nz = wx * uy - wy * ux;
      let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (l < 1e-5) {
        [nx, ny, nz] = [v[o + 3], v[o + 4], v[o + 5]];
        l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      } else if (nx * v[o + 3] + ny * v[o + 4] + nz * v[o + 5] < 0) l = -l;
      v[o + 3] = nx / l;
      v[o + 4] = ny / l;
      v[o + 5] = nz / l;
    }
  }
  mesh.n += size;
}

const US = { torso: TORSO_U, arm: ARM_U, leg: LEG_U };

// The angle round the arm that faces up, out and forward.
function topOfArm(j) {
  const along = unit(sub(j.elbow, j.shoulder));
  const face = square(j.elbowWay, along);
  const top = square(add(add(dir(j.angles[2]), [0, 0, 1]), j.front[2]), along);
  return Math.atan2(-dot(top, cross(along, face)), dot(top, face));
}

function muscles(mesh, clip, j, on) {
  for (const want of ['helps', 'works']) {
    for (const shape of (clip[want] ?? []).flatMap((n) => SHAPES[n])) {
      const turn = shape.top ? topOfArm(solve(clip.pose(0))) : 0;
      for (const side of [0, 1]) {
        // The torso carries both sides, a limb its own.
        const parents = [[shape.on, shape.edges], ...(shape.to ? [[shape.to, shape.far]] : [])].map(([name, edges]) => [on[name][side] ?? on[name][0], US[name],
          name === 'torso' && side ? edges.map((e) => e.map(([u, a]) => [u, -a])) : edges]);
        sheet(mesh, parents, shape, turn, want, shape.to && [j.hip, j.knee].map((q) => (side ? flip(q) : q)), j.life.effort);
      }
    }
  }
}

// --- equipment ---------------------------------------------------------------

// Descriptions only; build() turns them into triangles.
export const rod = (kind, a, b, r = 1.4) => ({ shape: 'rod', kind, a, b, r });
export const pad = (kind, a, b, z, r = 3) => ({ shape: 'pad', kind, a: [a[0], a[1], 0], b: [b[0], b[1], 0], z, r });
export const disc = (kind, c, radius, thick = 2) => ({ shape: 'disc', kind, c, radius, thick });
export const sides = (make) => [make(1), make(-1)];
export const dumbbells = (hand, grip = [0, 0, 1], size = 1) => [[hand, grip], [flip(hand), flip(grip)]].flatMap(([c, g]) => [
  rod('steel', add(c, g, -9 * size), add(c, g, 9 * size), 1.2),
  { shape: 'head', kind: 'load', a: add(c, g, 4.6), b: add(c, g, 10.2 * size), r: 5 * size },
  { shape: 'head', kind: 'load', a: add(c, g, -4.6), b: add(c, g, -10.2 * size), r: 5 * size },
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

export const MUSCLES = Object.keys(SHAPES);

export function build(mesh, clip, j, t) {
  begin(mesh);
  const on = { torso: [torso(mesh, j)] };
  head(mesh, j);
  on.arm = arms(mesh, j);
  on.leg = legs(mesh, j);
  muscles(mesh, clip, j, on);
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
