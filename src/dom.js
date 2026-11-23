// Small DOM helpers shared by every view. No framework.
import { fmt, round2 } from './units.js';

// h('button.btn.go', { onclick }, 'Start') -> <button class="btn go">Start</button>
export function h(tag, props, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props?.constructor !== Object) {
    kids.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter((k) => k != null && k !== false));
  return el;
}

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  swap: 'M7 8h11l-3-3M17 16H6l3 3',
  out: 'M10 7h7v7M17 7L7 17',
  play: 'M8 5.5v13l11-6.5z',
};

export function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

// The app registers its render function here so views can ask for a redraw
// without importing the app (which imports them).
let draw = () => {};
export const onRefresh = (fn) => (draw = fn);
export const refresh = (animate = true) => draw(animate);

// Navigation. Each history entry carries its position, and `trail` remembers
// the screens visited in this run, so the back arrow can really go back and
// the iOS edge swipe never lands on a screen that was just left.
const here = () => location.hash.slice(1) || '/';
const trail = [];
let at = history.state?.i ?? 0;
let ours = false; // this step back was asked for by the app, not by a swipe
trail[at] = here();
history.replaceState({ i: at }, '');

export const go = (path) => (location.hash = '#' + path);

export function replace(path) {
  history.replaceState({ i: at }, '', '#' + path);
  trail[at] = path;
  draw(true);
}

// For a view that cannot be shown: leave once it has finished rendering.
export const redirect = (path) => queueMicrotask(() => replace(path));

const step = (n) => {
  ours = true;
  history.go(n);
};

// One screen back, or to `parent` when there is nothing to go back to.
export const back = (parent) => (at > 0 && trail[at - 1] != null ? step(-1) : replace(parent));

// Back to a screen further up, however many steps that is.
export function up(path) {
  const i = trail.lastIndexOf(path, at - 1);
  if (at > 0 && i >= 0) step(i - at);
  else replace(path);
}

// A swipe brings its own animation, so ours is skipped then.
addEventListener('hashchange', () => {
  document.querySelector('dialog[open]')?.close();
  const known = history.state?.i;
  if (known == null) {
    at += 1;
    trail.length = at;
    history.replaceState({ i: at }, '');
  } else at = known;
  trail[at] = here();
  draw(known == null || ours);
  ours = false;
});

// How long the app took to show its first screen, set once by app.js.
export const boot = { ms: null };

export const calm = matchMedia('(prefers-reduced-motion: reduce)');
export function transition(fn) {
  if (!document.startViewTransition || calm.matches) return fn();
  // A second change can arrive mid-animation. The first is then skipped,
  // which is fine: the DOM update still runs.
  document.startViewTransition(fn).ready.catch(() => {});
}

// A bottom sheet. The cross closes it, and so does a tap outside.
export function sheet(title, ...body) {
  // Focus lands on the heading so a search field does not raise the keyboard.
  const d = h('dialog.sheet', h('div.sheet-body',
    h('div.sheet-head',
      h('h2', { tabindex: '-1', autofocus: true }, title),
      h('button.icon-btn', { 'aria-label': 'Close', onclick: () => d.close() }, icon('x'))),
    ...body));
  d.addEventListener('click', (e) => e.target === d && d.close());
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

// A number with minus and plus buttons. The number can also be typed.
// onChange receives the new number. Unless `required`, it also receives null
// while the field is empty; a required field falls back to its last number.
export function stepper({ value, step = 1, min = 0, max = 9999, label, suffix, decimal, required, onChange }) {
  let valid = value;
  const emit = (v) => {
    if (v != null) valid = v;
    if (v != null || !required) onChange(v);
  };
  const input = h('input', {
    type: 'text',
    inputmode: decimal ? 'decimal' : 'numeric',
    autocomplete: 'off',
    enterkeyhint: 'done',
    placeholder: '0',
    value: value == null ? '' : fmt(value),
    'aria-label': label,
  });
  const read = () => {
    const n = parseFloat(input.value.replace(',', '.'));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, round2(n))) : null;
  };
  const bump = (dir) => {
    const n = read();
    const v = Math.min(max, Math.max(min, round2(n == null ? (dir > 0 ? Math.max(step, min) : min) : n + dir * step)));
    input.value = fmt(v);
    emit(v);
  };
  input.addEventListener('focus', () => input.select());
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  input.addEventListener('input', () => emit(read()));
  input.addEventListener('blur', () => {
    const n = read() ?? (required ? valid : null);
    input.value = n == null ? '' : fmt(n);
  });
  return h('div.stepper',
    h('button', { type: 'button', 'aria-label': `Less ${label}`, onclick: () => bump(-1) }, icon('minus')),
    h('label', input, suffix && h('span', suffix)),
    h('button', { type: 'button', 'aria-label': `More ${label}`, onclick: () => bump(1) }, icon('plus')),
  );
}

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

export const topbar = (backHref, title, ...right) =>
  h('header.bar',
    h('a.back', { href: backHref, 'aria-label': 'Back', onclick: (e) => { e.preventDefault(); back(backHref.slice(1)); } }, icon('back')),
    h('h1.d', title),
    h('div.bar-right', ...right),
  );
