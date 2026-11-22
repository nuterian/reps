import { h, go, fmtDate, topbar } from '../dom.js';
import { state, deleteSession } from '../store.js';
import { weekStart } from '../progression.js';
import { finished, review, setsText, planText, deltaText } from '../log.js';

export default function summary(id) {
  const s = state.sessions.find((x) => x.id === id && x.end);
  if (!s) {
    go('/');
    return h('main');
  }
  const { rows, wins, of } = review(s);
  const target = state.settings.weeklyTarget;
  const nth = finished().filter((x) => weekStart(x.start) === weekStart(s.start) && x.start <= s.start).length;
  const week = nth > target ? `Session ${nth} for the week` : `Session ${nth} of ${target} for the week`;
  const mins = Math.max(1, Math.round((s.end - s.start) / 60000));

  // Lead with wins. With nothing to compare, or nothing beaten, lead with
  // having shown up.
  const head = wins ? `Beat last time on ${wins} of ${of}` : of ? week : 'Starting numbers logged';
  const sub = wins || !of
    ? week + (nth === target ? '. Week on target.' : '.')
    : 'Nothing beat last time today.' + (nth === target ? ' Week on target.' : '');

  const remove = () => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    deleteSession(s);
    go('/past');
  };

  return h('main.summary',
    topbar('#/past', fmtDate(s.start)),
    h('section.head',
      h('p.label', `${s.name} · ${mins} min`),
      h('p.big.words', head),
      h('p.week', sub),
    ),
    h('ul.results',
      rows.map((r) => h('li',
        h('div.result-head',
          h('span.name', r.ex.name),
          h('span', { class: `delta ${r.cmp.status}` }, deltaText(r.cmp))),
        h('p.sub', setsText(r.sets)),
        r.next && h('p.next', h('b', 'Next '), planText(r.next, r.weighted), h('span.why', r.next.reason)),
      )),
      s.cardio && h('li',
        h('div.result-head', h('span.name', 'Cardio')),
        h('p.sub', `${state.exercises.get(s.cardio.ex)?.name ?? 'Cardio'} · ${s.cardio.min} min`)),
    ),
    h('div.tools.end',
      h('a.quiet', { href: `#/edit/${s.id}` }, 'Correct this session'),
      h('button.quiet.danger', { onclick: remove }, 'Delete'),
    ),
    h('div.dock', h('a.primary', { href: '#/' }, 'Done')),
  );
}
