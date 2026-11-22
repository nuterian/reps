import { load } from './store.js';
import { h, onRefresh, transition } from './dom.js';
import home from './views/home.js';
import session from './views/session.js';
import summary from './views/summary.js';
import past from './views/past.js';
import { program, routine, library, exercise } from './views/program.js';

const routes = [
  [/^\/$/, home],
  [/^\/session$/, session],
  [/^\/edit\/(.+)$/, session],
  [/^\/s\/(.+)$/, summary],
  [/^\/past$/, past],
  [/^\/program$/, program],
  [/^\/routine\/(.+)$/, routine],
  [/^\/library$/, library],
  [/^\/exercise\/(.+)$/, exercise],
];

const root = document.getElementById('app');
let shown = null;

function render(animate = true) {
  const path = location.hash.slice(1) || '/';
  const hit = routes.map(([re, view]) => [path.match(re), view]).find(([m]) => m);
  if (!hit) return (location.hash = '#/');
  const [match, view] = hit;
  const moved = path !== shown;
  shown = path;
  const draw = () => {
    root.replaceChildren(view(...match.slice(1)));
    if (moved) scrollTo(0, 0);
    // Opening an exercise low on the screen brings its Done button into reach.
    else root.querySelector('.entry.open')?.scrollIntoView({ block: 'nearest' });
  };
  if (animate) transition(draw);
  else draw();
}

onRefresh(render);
addEventListener('hashchange', () => {
  document.querySelector('dialog[open]')?.close();
  render();
});

load().then(
  () => render(false),
  (err) => root.replaceChildren(h('main', h('p.note', `Could not open storage on this device. ${err?.message ?? ''}`))),
);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
