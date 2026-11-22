// The skeleton behind the form clips. Pure: no DOM. body.js gives it a body.
// x is forward, y is up (floor at 0), z is to the figure's near side. One unit
// is about 1.35 cm. Every movement here is the same on both sides, so a pose
// describes one side and the other is mirrored.
//
// Bones have fixed lengths. A pose says where the hips, hands and ankles are;
// elbows and knees are solved from that, so limbs cannot stretch.
export const BONE = { spine: 13.5, neck: 15, upper: 24, fore: 22, thigh: 32, shin: 32 };
const HIP_Z = 6.5;
const SHOULDER_Z = 13.5;

export const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub = (a, b) => add(a, b, -1);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a) => Math.hypot(...a);
export const mix = (a, b, t) => (Array.isArray(a) ? a.map((v, i) => v + (b[i] - v) * t) : a + (b - a) * t);
export const unit = (a) => add([0, 0, 0], a, 1 / (len(a) || 1));
export const flip = ([x, y, z]) => [x, y, -z];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Direction in the side plane: 0 is up, 90 is forward, 180 is down.
export const dir = (deg) => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180), 0];

// The part of v square to axis.
export const square = (v, axis) => {
  const u = unit(axis);
  return unit(add(v, u, -dot(v, u)));
};

// Middle joint of a two-bone limb from a to b, bending toward pole.
export function bend(a, b, la, lb, pole) {
  const line = sub(b, a);
  const d = Math.min(Math.max(len(line), Math.abs(la - lb) + 1e-6), la + lb - 1e-6);
  const along = (la * la - lb * lb + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, la * la - along * along));
  return add(add(a, unit(line), along), square(pole, line), out);
}

// pose: { hip, torso, curl, head, reach, lift, hand, elbow, ankle, knee, toe }
// torso: lean of the lower spine in degrees. curl: how much further the upper
// spine is bent. reach and lift move the shoulders forward and up. elbow and
// knee are the directions those joints point. facing: where the outside of the
// elbow faces, if not that way. toe: direction of the foot.
export function solve(pose) {
  const { curl = 0, reach = 0, lift = 0, toe = 90 } = pose;
  const angles = [0, 0.5, 1].map((k) => pose.torso + curl * k);
  const spine = [[...pose.hip, 0]];
  for (const a of angles) spine.push(add(spine[spine.length - 1], dir(a), BONE.spine));
  const top = angles[2];
  const front = angles.map((a) => dir(a + 90));
  const shoulder = add(add(add(spine[3], front[2], reach), dir(top), lift - 3.6), [0, 0, SHOULDER_Z]);
  const headUp = dir(top + (pose.head ?? 0));
  const head = add(spine[3], headUp, BONE.neck);
  const hip = add(spine[0], [0, 0, HIP_Z]);
  const hand = typeof pose.hand === 'function' ? pose.hand({ shoulder, head, headUp, spine }) : pose.hand;
  const grip = typeof pose.grip === 'function' ? pose.grip({ hand }) : pose.grip ?? [0, 0, 1];
  const elbowWay = typeof pose.elbow === 'function' ? pose.elbow({ shoulder, hand, headUp }) : pose.elbow;
  return {
    spine, angles, front, head, headUp, headTurn: pose.head ?? 0, shoulder, hip, hand,
    grip: unit(grip),
    ankle: pose.ankle,
    elbow: bend(shoulder, hand, BONE.upper, BONE.fore, elbowWay),
    knee: bend(hip, pose.ankle, BONE.thigh, BONE.shin, pose.knee),
    elbowWay: pose.facing ?? square(elbowWay, sub(hand, shoulder)),
    kneeWay: square(pose.knee, sub(pose.ankle, hip)),
    toe: dir(toe),
    sole: dir(toe + 90),
  };
}

// One repetition: lift in 1.2 s, lower in 2.4 s, a hold at each end. Returns
// how far along the movement the clip is, and which part of the rep it is in:
// 0 start hold, 1 going out, 2 end hold, 3 coming back.
const HOLD = 0.7;
const LIFT = 1.2;
const LOWER = 2.4;
export const CYCLE = LIFT + LOWER + 2 * HOLD;
export function phase(clip, seconds) {
  const [out, back] = clip.lowersFirst ? [LOWER, LIFT] : [LIFT, LOWER];
  const ease = (k) => (1 - Math.cos(Math.PI * k)) / 2;
  let s = ((seconds % CYCLE) + CYCLE) % CYCLE;
  for (const [part, length] of [HOLD, out, HOLD, back].entries()) {
    if (s < length || part === 3) {
      const k = Math.min(1, s / length);
      return { part, k, t: [0, ease(k), 1, ease(1 - k)][part] };
    }
    s -= length;
  }
}
