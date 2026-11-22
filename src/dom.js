// Small DOM helpers shared by every view. No framework.
import { fmt, round2 } from './units.js';

// h('button.primary', { onclick }, 'Start') -> <button class="primary">Start</button>
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
export const go = (path) => (location.hash = '#' + path);

const calm = matchMedia('(prefers-reduced-motion: reduce)');
export function transition(fn) {
  if (!document.startViewTransition || calm.matches) return fn();
  // A second change can arrive mid-animation. The first is then skipped,
  // which is fine: the DOM update still runs.
  document.startViewTransition(fn).ready.catch(() => {});
}

// A bottom sheet. Tap outside to close.
export function sheet(title, ...body) {
  // Focus lands on the heading so a search field does not raise the keyboard.
  const d = h('dialog.sheet', h('div.sheet-body', h('h2', { tabindex: '-1', autofocus: true }, title), ...body));
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
    h('a.back', { href: backHref, 'aria-label': 'Back' }, icon('back')),
    h('h1', title),
    h('div.bar-right', ...right),
  );
