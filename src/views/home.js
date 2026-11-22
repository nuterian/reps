import { h, icon, go, refresh } from '../dom.js';
import { state } from '../store.js';
import { hitRate, GAP_DAYS } from '../progression.js';
import { activeSession, finished, upNext, plan, planText, kindOf, startSession } from '../log.js';

let chosen = null; // a routine picked instead of the one next in rotation

export default function home() {
  const now = Date.now();
  const target = state.settings.weeklyTarget;
  const done = finished();
  const rate = hitRate(done.map((s) => s.start), target, now);
  const active = activeSession();
  const routine = state.routines.find((r) => r.id === chosen) ?? upNext();
  const last = done[done.length - 1];
  const away = last ? Math.floor((now - last.start) / 86400000) : 0;

  const start = () => {
    if (!active) startSession(routine);
    chosen = null;
    go('/session');
  };

  return h('main.home',
    headline(rate, target),
    away >= GAP_DAYS && !active && h('p.note', `Welcome back. ${away} days away, so weights start about 10 percent lighter.`),
    active
      ? h('section.next', h('p.label', 'In progress'), h('h2', active.name))
      : routine
        ? preview(routine, now)
        : h('p.note', 'No routines yet. Add one in Edit program.'),
    h('nav.links',
      h('a', { href: '#/past' }, 'Past sessions', icon('next')),
      h('a', { href: '#/program' }, 'Edit program', icon('next')),
    ),
    (active || routine) && h('div.dock',
      h('button.primary', { onclick: start }, active ? `Resume ${active.name}` : `Start ${routine.name}`),
    ),
  );
}

function headline(rate, target) {
  const { count } = rate.current;
  const dots = h('span.dots', Array.from({ length: target }, (_, i) => h('i', { class: i < count ? 'on' : '' })));
  if (!rate.of) {
    return h('section.head',
      h('p.big', `${count} of ${target}`),
      h('p.label', 'sessions this week'),
      dots,
    );
  }
  return h('section.head',
    h('p.big', `${rate.hit} of ${rate.of}`),
    h('p.label', rate.of === 1 ? 'week on target' : 'weeks on target'),
    h('div.weeks', { 'aria-hidden': 'true' }, rate.weeks.map((w) => h('i', { class: w.hit ? 'on' : '' }))),
    h('p.week', h('span', 'This week'), dots, h('span', `${count} of ${target}`)),
  );
}

function preview(routine, now) {
  const switchRoutine = () => {
    const i = state.routines.indexOf(routine);
    chosen = state.routines[(i + 1) % state.routines.length].id;
    refresh();
  };
  return h('section.next',
    h('div.next-head',
      h('p.label', 'Next'),
      state.routines.length > 1 && h('button.quiet', { onclick: switchRoutine }, icon('swap'), 'Switch'),
    ),
    h('h2', routine.name),
    h('ul.plan',
      routine.items.map((it) => {
        const ex = state.exercises.get(it.ex);
        return h('li',
          h('span.name', ex.name, it.optional && h('span.tag', 'optional')),
          h('span.target', planText(plan(it, now), kindOf(ex) === 'weight')),
        );
      }),
      h('li', h('span.name', 'Cardio', h('span.tag', 'optional'))),
    ),
  );
}
