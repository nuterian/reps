import { load } from './store.js';
import { h, onRefresh, replace, transition, boot } from './dom.js';
import home from './views/home.js';
import session from './views/session.js';
import summary from './views/summary.js';
import past from './views/past.js';
import { program, routine, exerciseForm } from './views/program.js';
import { explore, exercisePage } from './views/explore.js';
import build from './views/build.js';
import { activeSession } from './log.js';

const routes = [
  [/^\/$/, home],
  [/^\/session$/, session],
  [/^\/edit\/(.+)$/, session],
  [/^\/s\/(.+)$/, summary],
  [/^\/past$/, past],
  [/^\/program$/, program],
  [/^\/build$/, build],
  [/^\/routine\/(.+)$/, routine],
  [/^\/library$/, explore],
  [/^\/exercise\/(new)$/, exerciseForm],
  [/^\/exercise\/(.+)\/edit$/, exerciseForm],
  [/^\/exercise\/(.+)$/, exercisePage],
];

const root = document.getElementById('app');
let shown = null;

function render(animate = true) {
  const path = location.hash.slice(1) || '/';
  const hit = routes.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  if (!hit) return replace('/');
  const [match, view] = hit;
  const moved = path !== shown;
  shown = path;
  const draw = () => {
    const el = view(...match.slice(1));
    root.replaceChildren(el);
    if (moved) scrollTo(0, el.startAt ?? 0);
    else showOpen();
  };
  if (animate) transition(draw);
  else draw();
}

// Keeps the open exercise's title and sets between the bar and the deck.
function showOpen() {
  const box = (s) => root.querySelector(s)?.getBoundingClientRect();
  const row = box('.row.open');
  if (row && (row.top < box('.bar').bottom || box('.row.open .cells').bottom > box('.dock').top)) {
    root.querySelector('.row.open').scrollIntoView();
  }
}

onRefresh(render);

try {
  load();
  render(false);
} catch (err) {
  console.error(err);
  root.replaceChildren(h('main', h('p.note', `Could not open your data on this device. ${err?.message ?? ''}`)));
}

requestAnimationFrame(() => setTimeout(() => (boot.ms ??= performance.now())));

// Pressed states only show on iOS when the page listens for touches.
document.addEventListener('touchstart', () => {}, { passive: true });

// While a number in the dock is being typed, the dock sits on the keyboard.
// It is put back on blur, not on a viewport event: iOS can miss that one.
const vv = window.visualViewport;
function liftDock() {
  const dock = document.querySelector('.dock');
  if (!dock) return;
  const typing = dock.contains(document.activeElement) && document.activeElement.matches('input');
  const hidden = typing && vv ? Math.max(0, innerHeight - vv.height - vv.offsetTop) : 0;
  dock.style.transform = hidden ? `translateY(${-hidden}px)` : '';
}
for (const type of ['resize', 'scroll']) vv?.addEventListener(type, liftDock);
for (const type of ['focusin', 'focusout']) document.addEventListener(type, () => setTimeout(liftDock));

// Offline and updates. sw.js re-checks its files at every launch; an app left
// open in the background asks again when it returns, at most every 6 hours.
// New code takes over by reloading, but only on Home with no session open.
// Off on the dev server, so a reload there always shows the latest code; the
// end-to-end run uses 127.0.0.1 and does exercise it.
if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  const sw = navigator.serviceWorker;
  let stale = false;
  let checked = Date.now();
  const takeOver = () => {
    if (stale && shown === '/' && !document.hidden && !activeSession()) location.reload();
  };
  let returned = false;
  sw.addEventListener('message', (e) => {
    if (e.data !== 'changed') return;
    stale = true;
    if (returned) takeOver();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    returned = true;
    takeOver();
    if (navigator.onLine && Date.now() - checked > 6 * 3600000) {
      checked = Date.now();
      sw.controller?.postMessage('check');
    }
  });
  sw.register('sw.js');
}
