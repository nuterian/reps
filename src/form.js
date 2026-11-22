// How to do each exercise: a clip for the mannequin in figure.js, three steps,
// and the muscles it works. Keyed by exercise id and kept in code, so a better
// clip reaches everyone without touching stored data.
//
// pose(t): the body at t, from 0 (start) to 1 (far end). gear(j, t): the
// equipment for the solved joints. track: the point whose path is dotted.
// lowersFirst: the rep starts by lowering the weight. say: the word for going
// out and for coming back. yaw: the camera's turn to start with.
import { add, dir, len, mix, sub, unit } from './figure.js';
import { disc, dumbbells, pad, rod, sides } from './body.js';

const hands = (j) => j.hand;
const behind = (j, at, by) => add(j.spine[at], j.front[Math.min(at, 2)], -by);
const onArc = (pivot, r, deg) => add(pivot, dir(deg), r);
const floorSeat = (x, y) => [pad('pad', [x - 10, y], [x + 14, y], 11), rod('steel', [x, y - 3, 0], [x, 2, 0], 2.4)];

// Where the two straps of the crunch rope, each 28 long, meet the cable.
const PULLEY = [146, 112, 0];
const ropeKnot = (hand) => {
  const mid = [hand[0], hand[1], 0];
  return add(mid, unit(sub(PULLEY, mid)), Math.sqrt(28 ** 2 - hand[2] ** 2));
};

export const FORM = {
  'leg-press': {
    say: ['Lower', 'Push'],
    yaw: -10,
    lowersFirst: true,
    works: ['quads', 'glutes'],
    helps: ['hamstrings', 'calves'],
    steps: [
      'Back and hips flat on the pad. Feet shoulder width on the platform.',
      'Lower until your knees reach 90 degrees, then push through your whole foot.',
      'Locking your knees, or letting your hips lift off the pad.',
    ],
    // The sled runs along a 45 degree rail.
    pose: (t) => ({
      hip: [78, 26],
      torso: -56,
      head: 26,
      hand: [74, 19, 17],
      elbow: [-0.5, -0.8, 0.6],
      ankle: add(add([78, 26, 9], dir(-45), 10), dir(45), mix(62.2, 44, t)),
      knee: [-0.7, 0.7, 0.22],
      toe: -45,
    }),
    track: (j) => j.ankle,
    gear: (j) => {
      const sole = add([j.ankle[0], j.ankle[1], 0], j.sole, 6);
      const end = add(add(sole, dir(45), 26), dir(135), 17);
      return [
        pad('pad', behind(j, 0, 13), behind(j, 3, 12), 10),
        pad('pad', add(j.spine[0], [-7, -13, 0]), add(j.spine[0], [12, -15, 0]), 10),
        ...sides((s) => rod('steel', [100, 18, 19 * s], [172, 90, 19 * s], 1.4)),
        ...sides((s) => rod('steel', [100, 18, 19 * s], [100, 3, 19 * s], 1.4)),
        ...sides((s) => rod('steel', [168, 86, 19 * s], [168, 3, 19 * s], 1.4)),
        rod('steel', [60, 3, 0], [168, 3, 0], 1.6),
        ...sides((s) => rod('steel', [60, 3, 0], [56, 30, 6 * s], 1.4)),
        pad('steel', add(sole, j.toe, -14), add(sole, j.toe, 20), 15, 1.6),
        ...sides((s) => rod('steel', add(add(sole, j.toe, -12), [0, 0, 14 * s]), add(end, [0, 0, 14 * s]), 1.8)),
        rod('steel', add(end, [0, 0, -24]), add(end, [0, 0, 24]), 1.8),
        ...sides((s) => disc('load', add(end, [0, 0, 25 * s]), 11, 4)),
      ];
    },
  },

  'chest-press': {
    say: ['Press', 'Return'],
    yaw: -38,
    works: ['chest'],
    helps: ['shoulders', 'triceps'],
    steps: [
      'Set the seat so the handles are level with the middle of your chest. Shoulder blades back.',
      'Press forward until your arms are nearly straight, then return slowly.',
      'Shoulders rolling forward, or elbows flaring up to shoulder height.',
    ],
    pose: (t) => {
      const h = onArc([104, 6, 0], 62, mix(-13, 13.8, t));
      return {
        hip: [80, 40],
        torso: -6,
        hand: [h[0], h[1], mix(27, 20, t)],
        elbow: [-0.6, -0.6, 0.9],
        ankle: [112, 5, 12],
        knee: [1, 0.3, 0.1],
      };
    },
    track: hands,
    gear: (j, t) => [
      ...floorSeat(82, 28),
      pad('pad', behind(j, 0, 13), behind(j, 3, 13), 10),
      rod('steel', [50, 2, 0], [50, 92, 0], 2.2),
      rod('steel', [50, 40, 0], [68, 40, 0], 2),
      rod('steel', [104, 5, -33], [104, 5, 33], 1.8),
      rod('steel', [50, 3, 0], [104, 5, 0], 2),
      ...sides((s) => rod('steel', [104, 6, 33 * s], [j.hand[0], j.hand[1], (j.hand[2] + 6) * s], 1.6)),
      ...sides((s) => rod('steel', [j.hand[0], j.hand[1], (j.hand[2] - 5) * s], [j.hand[0], j.hand[1], (j.hand[2] + 6) * s], 1.6)),
    ],
  },

  'seated-row': {
    say: ['Pull', 'Reach'],
    yaw: 26,
    works: ['upper back', 'lats'],
    helps: ['biceps'],
    steps: [
      'Sit tall with knees slightly bent. Arms straight, chest up.',
      'Pull the handle to your lower ribs, elbows close. Squeeze your shoulder blades, then reach forward.',
      'Swinging your upper body, or rounding your back.',
    ],
    pose: (t) => ({
      hip: [70, 30],
      torso: mix(5, -4, t),
      reach: mix(4, -2, t),
      hand: mix([120.9, 56.4, 5], [78, 48.4, 9], t),
      elbow: [-1, -0.2, 0.3],
      ankle: [131, 33, 9],
      knee: [0, 1, 0.1],
      toe: 8,
    }),
    track: hands,
    gear: (j, t) => [
      pad('pad', [56, 19], [92, 19], 10),
      rod('steel', [60, 16, 0], [60, 2, 0], 2.4),
      rod('steel', [90, 16, 0], [158, 12, 0], 2.4),
      pad('steel', add([j.ankle[0], j.ankle[1], 0], add(j.sole, j.toe, -0.6), 6), add(add([j.ankle[0], j.ankle[1], 0], j.sole, 6.4), j.toe, 13), 15, 1.4),
      rod('steel', [160, 2, 0], [160, 72, 0], 2.2),
      rod('cable', [j.hand[0] + 7, j.hand[1], 0], [160, 52, 0], 0.7),
      ...sides((s) => rod('steel', [j.hand[0] + 7, j.hand[1], 0], [j.hand[0], j.hand[1], j.hand[2] * s], 1.3)),
    ],
  },

  'db-shoulder-press': {
    say: ['Press', 'Lower'],
    yaw: -74,
    works: ['shoulders'],
    helps: ['triceps'],
    steps: [
      'Sit tall, dumbbells at ear height, palms forward, forearms upright.',
      'Press overhead until your arms are nearly straight, then lower to ear height.',
      'Arching your lower back, or banging the dumbbells together.',
    ],
    pose: (t) => ({
      hip: [80, 40],
      torso: -5,
      head: 3,
      lift: mix(0, 4, t),
      hand: mix([82, 94, 36], [79, 125.6, 18], t),
      elbow: [0.3, -1, 0.5],
      ankle: [110, 5, 15],
      knee: [1, 0.3, 0.3],
    }),
    track: hands,
    gear: (j) => [
      ...floorSeat(82, 28),
      pad('pad', behind(j, 0, 13), behind(j, 2, 13), 10),
      ...dumbbells(j.hand),
    ],
  },

  'cable-crunch': {
    say: ['Crunch', 'Uncurl'],
    yaw: -24,
    works: ['abs'],
    steps: [
      'Kneel facing the cable. Hold the rope beside your head and keep your hips still.',
      'Curl your ribs toward your hips so your elbows travel to your thighs. Uncurl slowly.',
      'Pulling with your arms, or sitting back onto your heels.',
    ],
    pose: (t) => ({
      hip: [88, 35.7],
      torso: mix(20, 48, t),
      curl: mix(2, 86, t),
      head: mix(8, 22, t),
      // Beside the head, so the straps of the rope pass either side of it.
      hand: ({ head, headUp }) => add([head[0], head[1], 11.5], [headUp[1], -headUp[0], 0], 2),
      grip: ({ hand }) => sub(ropeKnot(hand), hand),
      elbow: ({ headUp }) => add([headUp[1], -headUp[0], 0.35], headUp, -1),
      ankle: [68, 5, 8],
      knee: [1, -0.3, 0],
      toe: 268,
    }),
    track: hands,
    gear: (j, t) => {
      const knot = ropeKnot(j.hand);
      return [
        pad('pad', [58, 0], [112, 0], 18, 1.4),
        rod('steel', [158, 2, 0], [158, 116, 0], 2.2),
        rod('steel', [158, 114, 0], [146, 114, 0], 1.8),
        rod('cable', knot, PULLEY, 0.7),
        ...sides((s) => rod('rope', knot, [j.hand[0], j.hand[1], j.hand[2] * s], 1.3)),
      ];
    },
  },

  rdl: {
    say: ['Hips back', 'Stand'],
    yaw: 34,
    lowersFirst: true,
    works: ['hamstrings', 'glutes'],
    helps: ['lower back'],
    steps: [
      'Stand with feet hip width, bar against your thighs, knees soft.',
      'Push your hips back and slide the bar down your legs. Stand by driving your hips forward.',
      'Rounding your back, or going lower once your hips stop moving back.',
    ],
    // Arms hang straight, so the bar height follows from the shoulders.
    pose: (t) => ({
      hip: mix([100, 68.9], [78, 61], t),
      torso: mix(1, 63, t),
      head: mix(0, -18, t),
      hand: ({ shoulder }) => {
        const x = mix(109, 107, t) + Math.sin(Math.PI * t);
        const z = 18;
        return [x, shoulder[1] - Math.sqrt(45.6 ** 2 - (x - shoulder[0]) ** 2 - (z - shoulder[2]) ** 2), z];
      },
      elbow: [-1, 0, 0.4],
      ankle: [100, 5, 7.5],
      knee: [1, 0, 0.05],
    }),
    track: hands,
    gear: (j) => [
      rod('steel', [j.hand[0], j.hand[1], -56], [j.hand[0], j.hand[1], 56], 1.4),
      ...sides((s) => disc('load', [j.hand[0], j.hand[1], 46 * s], 16.5, 5)),
    ],
  },

  'lat-pulldown': {
    say: ['Pull', 'Let it rise'],
    yaw: 38,
    works: ['lats'],
    helps: ['biceps', 'upper back'],
    steps: [
      'Thighs under the pads. Grip just outside your shoulders, chest up.',
      'Pull the bar to your upper chest by driving your elbows down. Let it rise under control.',
      'Swinging back, or pulling the bar behind your neck.',
    ],
    pose: (t) => ({
      hip: [80, 40],
      torso: mix(-10, -20, t),
      lift: mix(8, 0, t),
      head: 8,
      hand: mix([84, 123.6, 31], [80, 79, 30], t),
      elbow: [-0.8, -1, 0.3],
      ankle: [110, 5, 10],
      knee: [1, 0.3, 0.1],
    }),
    track: hands,
    gear: (j, t) => [
      ...floorSeat(82, 28),
      rod('steel', [134, 2, 0], [134, 142, 0], 2.2),
      rod('steel', [134, 140, 0], [86, 140, 0], 2),
      rod('steel', [134, 49, 0], [100, 49, 0], 1.8),
      rod('pad', [100, 49, -15], [100, 49, 15], 4),
      rod('cable', [j.hand[0], j.hand[1], 0], [86, 139, 0], 0.7),
      rod('steel', [j.hand[0], j.hand[1], -42], [j.hand[0], j.hand[1], 42], 1.5),
    ],
  },

  'incline-db-press': {
    say: ['Press', 'Lower'],
    yaw: -58,
    works: ['chest'],
    helps: ['shoulders', 'triceps'],
    steps: [
      'Bench at about 30 degrees. Dumbbells beside your upper chest, forearms upright.',
      'Press straight up until your arms are nearly straight, then lower slowly.',
      'Elbows flaring straight out, or your lower back lifting off the bench.',
    ],
    pose: (t) => ({
      hip: [95, 28],
      torso: -60,
      head: 4,
      hand: mix([69.4, 61.2, 34], [64.4, 91.7, 19], t),
      elbow: [0.4, -1, 0.6],
      ankle: [126, 5, 15],
      knee: [0.5, 1, 0.3],
    }),
    track: hands,
    gear: (j) => [
      pad('pad', behind(j, 0, 12), add(behind(j, 3, 11), dir(-60), 16), 9),
      pad('pad', [92, 16], [112, 18], 9),
      rod('steel', [98, 13, 0], [104, 2, 0], 2.2),
      rod('steel', [66, 26, 0], [56, 2, 0], 2.2),
      rod('steel', [52, 2, 0], [112, 2, 0], 2),
      ...dumbbells(j.hand),
    ],
  },

  'leg-curl': {
    say: ['Curl', 'Lower'],
    yaw: 20,
    works: ['hamstrings'],
    helps: ['calves'],
    steps: [
      'Lie face down, knees just off the edge, roller on the back of your ankles.',
      'Curl your heels toward your hips, pause, then lower over two seconds.',
      'Hips lifting off the pad, or letting the weight drop.',
    ],
    // The shin swings around the knee, which stays in line with the pivot.
    pose: (t) => {
      const swing = mix(263, 368, t);
      return {
        hip: [98, 50],
        torso: 103,
        head: -22,
        hand: [147, 21, 17],
        elbow: [-0.3, 0.1, 1],
        ankle: add(add([98, 50, 6.5], dir(261), 32), dir(swing), 32),
        knee: [-0.6, -1, 0],
        toe: swing - 90,
      };
    },
    track: (j) => j.ankle,
    gear: (j, t) => {
      const shin = mix(263, 368, t);
      const roller = add(add([j.ankle[0], j.ankle[1], 0], dir(shin + 90), 8), dir(shin), -5);
      const pivot = add([98, 50, 0], dir(261), 32);
      return [
        pad('pad', [76, 36], [97, 39], 13),
        pad('pad', [101, 38], [146, 27], 11),
        rod('steel', [90, 35, 0], [90, 3, 0], 2.2),
        rod('steel', [128, 29, 0], [128, 3, 0], 2.2),
        rod('steel', [76, 3, 0], [148, 3, 0], 1.8),
        ...sides((s) => rod('steel', [140, 20, 12 * s], [148, 21, 22 * s], 1.3)),
        ...sides((s) => rod('steel', [pivot[0], pivot[1], 18 * s], [roller[0], roller[1], 18 * s], 1.4)),
        rod('steel', [roller[0], roller[1], -18], [roller[0], roller[1], 18], 1.4),
        rod('load', [roller[0], roller[1], -14], [roller[0], roller[1], 14], 4.4),
        ...sides((s) => rod('steel', [pivot[0], pivot[1], 18 * s], [90, 20, 4 * s], 1.4)),
      ];
    },
  },

  'db-curl': {
    say: ['Curl', 'Lower'],
    yaw: -36,
    works: ['biceps'],
    helps: ['forearms'],
    steps: [
      'Stand tall, dumbbells at your sides, palms forward, elbows by your ribs.',
      'Curl to shoulder height without moving your elbows, then lower slowly.',
      'Swinging your body, or elbows drifting forward.',
    ],
    // The elbow is fixed; only the forearm turns.
    pose: (t) => {
      const way = add([0, 0, 0], [-0.03, -1, 0.16], 24 / len([-0.03, -1, 0.16]));
      const forearm = add(dir(mix(170, 34, t)), [0, 0, 0.14]);
      return {
        hip: [99, 68.4],
        torso: 0,
        hand: ({ shoulder }) => add(add(shoulder, way), forearm, 22 / len(forearm)),
        elbow: () => way,
        ankle: [100, 5, 9],
        knee: [1, 0, 0.1],
      };
    },
    track: hands,
    gear: (j) => dumbbells(j.hand),
  },
};
