// The form clip, its steps and the muscles it works. A 3D figure drawn from
// the poses in form.js, so nothing is downloaded and it works offline. Drag to
// turn it, tap to pause.
import { h, icon, calm } from '../dom.js';
import { FORM } from '../form.js';
import { solve, phase } from '../figure.js';
import { STRIDE, build, createMesh, dots } from '../body.js';
import { createStage, frameCamera } from '../stage.js';

const LABELS = ['Set up', 'Move', 'Avoid'];
const PITCH = 10;
const dark = matchMedia('(prefers-color-scheme: dark)');

// Browsers allow only a few graphics contexts, so one off-screen stage draws
// every clip and the picture is copied to the canvas on the page.
let stage, easel;
function shared() {
  if (!easel) {
    easel = h('canvas');
    stage = createStage(easel);
    // iOS may drop the graphics context of an app in the background.
    easel.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stage = null; });
    easel.addEventListener('webglcontextrestored', () => { stage = createStage(easel); });
  }
  return stage;
}

// Returns draw(t, yaw) for one canvas, or null without WebGL 2. Does nothing
// when the picture would not change, so holds and a paused clip cost little.
function drawer(clip, canvas) {
  if (!shared()) return null;
  const g = canvas.getContext('2d');
  const mesh = createMesh();
  const path = createMesh();
  const far = createMesh();
  // Enough points of the whole movement to frame it from any side.
  const cloud = [];
  for (const t of [0, 0.5, 1]) {
    build(mesh, clip, solve(clip.pose(t)), t);
    for (let i = 0; i < mesh.n; i += 9) cloud.push([mesh.v[i * STRIDE], mesh.v[i * STRIDE + 1], mesh.v[i * STRIDE + 2]]);
  }
  const way = Array.from({ length: 12 }, (_, i) => clip.track(solve(clip.pose(i / 11))));
  dots(path, way);
  dots(far, way.map(([x, y, z]) => [x, y, -z]));
  let shown = '';
  let framed = '';
  let camera, reach;
  return (t, yaw) => {
    const w = canvas.clientWidth;
    const tall = canvas.clientHeight;
    const d = Math.min(3, devicePixelRatio || 1);
    const look = `${w} ${tall} ${d} ${dark.matches} ${t} ${yaw}`;
    if (!stage || !w || look === shown) return;
    shown = look;
    for (const c of [canvas, easel]) {
      if (c.width !== Math.round(w * d)) c.width = Math.round(w * d);
      if (c.height !== Math.round(tall * d)) c.height = Math.round(tall * d);
    }
    if (framed !== `${yaw} ${w / tall}`) {
      framed = `${yaw} ${w / tall}`;
      camera = frameCamera(cloud, yaw, PITCH, w / tall);
      reach = cloud.reduce((far, p) => Math.max(far, Math.hypot(p[0] - camera.at[0], p[1] - camera.at[1], p[2] - camera.at[2])), 0);
    }
    build(mesh, clip, solve(clip.pose(t)), t);
    stage.draw(mesh, camera.back[2] >= 0 ? path : far, camera, { dark: dark.matches, reach });
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(easel, 0, 0);
  };
}

// Runs fn every frame while the element is on the page.
function whileShown(el, fn) {
  let seen = false;
  const tick = (now) => {
    if (el.isConnected) {
      seen = true;
      fn(now);
    } else if (seen) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// A finger across the canvas turns the figure; up and down still scrolls.
function turnable(el, clip, onTap) {
  let yaw = clip.yaw;
  let from = null;
  let moved = false;
  el.addEventListener('pointerdown', (e) => { from = { x: e.clientX, yaw }; moved = false; });
  el.addEventListener('pointermove', (e) => {
    if (!from) return;
    const dx = e.clientX - from.x;
    if (!moved && Math.abs(dx) < 6) return;
    if (!moved) el.setPointerCapture(e.pointerId);
    moved = true;
    yaw = from.yaw - dx * 0.6;
  });
  for (const type of ['pointerup', 'pointercancel']) el.addEventListener(type, () => (from = null));
  el.addEventListener('click', () => !moved && onTap?.());
  // Arrow keys turn it too.
  el.addEventListener('keydown', (e) => { yaw += { ArrowLeft: 15, ArrowRight: -15 }[e.key] ?? 0; });
  return () => yaw;
}

function player(clip, name) {
  if (calm.matches) {
    const still = (t, label) => {
      const canvas = h('canvas');
      const draw = drawer(clip, canvas);
      const yaw = turnable(canvas, clip);
      if (draw) whileShown(canvas, () => draw(t, yaw()));
      return h('figure', canvas, h('figcaption', label));
    };
    return h('div.stills', { role: 'img', 'aria-label': `${name}, start and end position` }, still(0, 'Start'), still(1, 'End'));
  }
  const canvas = h('canvas');
  const draw = drawer(clip, canvas);
  if (!draw) return null;
  let playing = true;
  let at = 0;
  let before = null;
  const el = h('button.clip', { type: 'button', 'aria-label': `${name} clip. Tap to pause.` }, canvas, h('span.play', icon('play')));
  const yaw = turnable(el, clip, () => {
    playing = !playing;
    el.classList.toggle('paused', !playing);
    el.setAttribute('aria-label', `${name} clip. Tap to ${playing ? 'pause' : 'play'}.`);
  });
  // What to do now, and how: the word, the seconds and the breath.
  const word = h('b.d');
  const breath = h('span');
  const bar = h('i');
  const say = h('p.say', { 'aria-hidden': 'true' }, word, breath, h('span.track', bar));
  const [out, back] = clip.say;
  const lift = clip.lowersFirst ? 3 : 1;
  const cue = [['Hold', ''], [out, lift === 1 ? 'Breathe out' : 'Slowly, breathe in'], ['Hold', ''], [back, lift === 3 ? 'Breathe out' : 'Slowly, breathe in']];
  let part = -1;
  whileShown(el, (now) => {
    if (playing && before != null) at += Math.min(0.1, (now - before) / 1000);
    before = now;
    const p = phase(clip, at);
    draw(p.t, yaw());
    if (p.part !== part) {
      part = p.part;
      [word.textContent, breath.textContent] = cue[part];
      say.classList.toggle('lift', part === lift);
    }
    bar.style.transform = `scaleX(${part % 2 ? p.k : 0})`;
  });
  return [el, say, h('p.turn', 'Drag to turn. Tap to pause.')];
}

const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

// Everything needed to copy the movement. Null when there is no clip yet.
export function formGuide(ex) {
  const form = FORM[ex.id];
  if (!form) return null;
  return h('div.guide',
    player(form, ex.name),
    h('dl.steps', form.steps.map((text, i) => [h('dt', LABELS[i]), h('dd', text)])),
    h('p.muscles',
      h('span', h('i.key.works'), `Works ${list(form.works)}`),
      form.helps && h('span', h('i.key.helps'), `Helped by ${list(form.helps)}`)),
  );
}

export const hasGuide = (ex) => !!FORM[ex.id];

export const videoSearch = (ex, label) =>
  h('a.chip', {
    href: `https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + ' form')}`,
    target: '_blank',
    rel: 'noopener',
  }, label, icon('out'));
