import { h, icon, fmtDate, topbar } from '../dom.js';
import { state } from '../store.js';
import { weekStart } from '../progression.js';
import { finished, review } from '../log.js';

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
    [...weeks].map(([start, list]) => [
      h('h3', `Week of ${fmtDate(start)}`, h('span', { class: list.length >= target ? 'on' : '' }, `${list.length} of ${target}`)),
      h('ul.list', list.map((s) => {
        const r = review(s);
        const count = r.rows.length + (s.cardio ? 1 : 0);
        return h('li', h('a', { href: `#/s/${s.id}` },
          h('span.entry-main',
            h('span.name', `${fmtDate(s.start)} · ${s.name}`),
            h('span.sub', `${count} logged` + (r.of ? ` · beat last time on ${r.wins} of ${r.of}` : ''))),
          icon('next')));
      })),
    ]),
  );
}
