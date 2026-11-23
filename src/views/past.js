import { h, icon, fmtDate, topbar } from '../dom.js';
import { state } from '../store.js';
import { weekStart } from '../progression.js';
import { finished, review, gains, gainText, unit } from '../log.js';
import { fmt } from '../units.js';

export default function past() {
  const target = state.settings.weeklyTarget;
  const weeks = new Map();
  for (const s of finished().reverse()) {
    const k = weekStart(s.start);
    weeks.set(k, [...(weeks.get(k) || []), s]);
  }
  return h('main',
    topbar('#/', 'Past sessions'),
    !weeks.size && h('p.note', 'No sessions yet.'),
    strength(),
    [...weeks].map(([start, list]) => [
      h('h3', `Week of ${fmtDate(start)}`, h('span', { class: list.length >= target ? 'on' : '' }, `${list.length} of ${target}`)),
      h('ul.list', list.map((s) => {
        const r = review(s);
        const count = r.rows.length + (s.cardio ? 1 : 0);
        return h('li', h('a', { href: `#/s/${s.id}` },
          h('span.entry-main',
            h('span.name', fmtDate(s.start)),
            h('span.sub', `${s.name}, ${count} logged` + (r.of ? `, beat last time on ${r.wins} of ${r.of}` : ''))),
          icon('next')));
      })),
    ]),
  );
}

const SHOWN = 5;

// From the first session of each exercise to its latest.
function strength() {
  const all = gains();
  if (!all.length) return null;
  const since = (t) => new Date(t).toLocaleDateString(undefined, {
    month: 'short', ...(new Date(t).getFullYear() !== new Date().getFullYear() && { year: 'numeric' }),
  });
  const change = ({ from, to }) => {
    const weight = from.w !== to.w;
    const by = weight ? to.w - from.w : to.r - from.r;
    if (!by) return h('span.delta', 'same');
    return h('span', { class: by > 0 ? 'delta win' : 'delta' }, `${by > 0 ? '+' : '−'}${fmt(Math.abs(by))} ${weight ? unit() : Math.abs(by) === 1 ? 'rep' : 'reps'}`);
  };
  const row = (g) => h('li', h('a', { href: `#/exercise/${g.ex.id}` },
    h('span.entry-main', h('span.name', g.ex.name), h('span.sub', `${gainText(g)} since ${since(g.from.t)}`)),
    change(g)));
  const list = h('ul.list.gains', all.slice(0, SHOWN).map(row));
  const more = all.length > SHOWN && h('button.quiet', { onclick: () => { list.append(...all.slice(SHOWN).map(row)); more.remove(); } }, `Show all ${all.length}`);
  return [h('h3', 'Strength', h('span', 'first session to latest')), list, more];
}
