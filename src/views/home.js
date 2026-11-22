import { h, icon, go, refresh } from '../dom.js';
import { state } from '../store.js';
import { hitRate, GAP_DAYS } from '../progression.js';
import { weekText, habitText } from '../smart.js';
import { activeSession, finished, upNext, plan, planSets, kindOf, startSession, week, catchUpItems, shortItems } from '../log.js';
import { nums } from './parts.js';

const WEEKS = 12;
let chosen = null; // a routine picked instead of the one next in rotation
let picked = null; // 'full', 'short' or 'catchup'; null follows what the app suggests

export default function home() {
  const now = Date.now();
  const target = state.settings.weeklyTarget;
  const done = finished();
  const rate = hitRate(done.map((s) => s.start), target, now, WEEKS);
  const active = activeSession();
  const routine = state.routines.find((r) => r.id === chosen) ?? upNext();
  const last = done[done.length - 1];
  const away = last ? Math.floor((now - last.start) / 86400000) : 0;
  const { plan: wk, usual } = week(now);

  // A week that is out of reach gets a catch-up session offered, and chosen
  // unless the user picks something else.
  const canCatchUp = wk.state === 'out' && !wk.trainedToday && wk.daysLeft > 0 && state.routines.length > 1;
  const kinds = routine ? [
    { id: 'full', label: 'Full session', name: routine.name, start: `Start ${routine.name}`, session: routine.name, items: routine.items },
    { id: 'short', label: '15 minutes', name: routine.name, start: 'Start 15 minutes', session: `Short ${routine.name}`, items: shortItems(routine) },
    canCatchUp && { id: 'catchup', label: 'Catch-up', name: 'Catch-up', start: 'Start catch-up', session: 'Catch-up', items: catchUpItems(now) },
  ].filter((k) => k && (k.id === 'full' || k.items.length)) : [];
  const kind = kinds.find((k) => k.id === (picked ?? (canCatchUp ? 'catchup' : 'full'))) ?? kinds[0];

  const start = () => {
    if (!active) startSession({ routineId: kind.id === 'catchup' ? null : routine.id, name: kind.session, items: kind.items });
    chosen = picked = null;
    go('/session');
  };
  const switchRoutine = () => {
    const i = state.routines.indexOf(routine);
    chosen = state.routines[(i + 1) % state.routines.length].id;
    refresh();
  };

  return h('main.home',
    punchCard(rate, target),
    h('p.note.week',
      weekText(wk, target, now),
      canCatchUp && ' One catch-up session still covers the whole body.',
      usual && ` ${habitText(usual)}`),
    away >= GAP_DAYS && !active && h('p.note.back', `Welcome back. ${away} days away, so weights start about 10 percent lighter.`),
    active
      ? h('section.today', h('div.today-head', h('h2.d', active.name)), h('p.note', 'This session is still open.'))
      : kind
        ? h('section.today',
          h('div.today-head',
            h('h2.d', kind.name),
            kind.id !== 'catchup' && state.routines.length > 1 && h('button.chip', { onclick: switchRoutine }, icon('swap'), 'Switch')),
          kinds.length > 1 && h('div.chips.variants', kinds.map((k) => h('button', {
            class: k === kind ? 'chip on' : 'chip',
            'aria-pressed': String(k === kind),
            onclick: () => { picked = k.id; refresh(false); },
          }, k.label))),
          h('ul.plan',
            kind.items.map((it) => {
              const ex = state.exercises.get(it.ex);
              return h('li',
                h('span.name', ex.name, it.optional && h('span.opt', 'optional')),
                nums(planSets(plan(it, now), kindOf(ex) === 'weight')));
            }),
            kind.id === 'full' && h('li', h('span.name', 'Cardio', h('span.opt', 'optional')))))
        : h('p.note', 'No routines yet. Add one in Program.'),
    h('nav.pair',
      h('a.btn.line.sm', { href: '#/past' }, 'Past'),
      h('a.btn.line.sm', { href: '#/library' }, 'Exercises'),
      h('a.btn.line.sm', { href: '#/program' }, 'Program'),
    ),
    (active || kind) && h('div.dock',
      h('button.btn.go', { onclick: start }, active ? `Resume ${active.name}` : kind.start),
    ),
  );
}

// The last 12 weeks as a punch card: a column per week, a square per session.
// Weeks on target are blue; this week's open sessions are yellow.
function punchCard(rate, target) {
  const { count } = rate.current;
  const weeks = [...rate.weeks.filter((w) => w !== rate.current), rate.current].slice(-WEEKS);
  const cols = [...Array(WEEKS - weeks.length).fill(null), ...weeks];
  const headline = rate.of
    ? `${rate.hit} of ${rate.of} ${rate.of === 1 ? 'week' : 'weeks'} on target`
    : `${count} of ${target} sessions this week`;
  return h('section',
    h('h1.d.headline', headline),
    h('div.punch', { role: 'img', 'aria-label': `${headline}. This week ${count} of ${target}.` },
      cols.map((w) => {
        const kind = !w ? 'before' : w.hit ? 'hit' : w === rate.current ? 'open' : 'miss';
        return h('div', { class: `col ${kind}` },
          Array.from({ length: target }, (_, i) => h('i', { class: w && i < w.count ? 'on' : '' })));
      })),
    h('p.caption', h('span', `Last ${WEEKS} weeks`), rate.of > 0 && h('span', `This week ${count} of ${target}`)),
  );
}
