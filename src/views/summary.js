import { h, icon, back, up, redirect, fmtDate, topbar } from '../dom.js';
import { state, deleteSession } from '../store.js';
import { weekStart } from '../progression.js';
import { finished, review, planSets, deltaText, backupDays } from '../log.js';
import { nums, saveBackup } from './parts.js';

export default function summary(id) {
  const s = state.sessions.find((x) => x.id === id && x.end);
  if (!s) {
    redirect('/');
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
    back('/past');
  };

  return h('main.summary',
    topbar('#/past', fmtDate(s.start)),
    h('h2.d.headline', head),
    h('p.sub-head', `${sub} ${s.name}, ${mins} min.`),
    s === finished().at(-1) && backupLine(),
    h('ul.results',
      rows.map((r) => h('li',
        h('div.result-head',
          h('span.name', r.ex.name),
          h('span', { class: `delta ${r.cmp.status}` }, deltaText(r.cmp))),
        nums(r.sets),
        r.next && h('p.next', h('b', 'Next'), ' ', nums(planSets(r.next, r.weighted)), h('span.why', r.next.reason)),
        r.pace && h('p.pace', r.pace),
      )),
      s.cardio && h('li',
        h('div.result-head', h('span.name', state.exercises.get(s.cardio.ex)?.name ?? 'Cardio')),
        h('span.nums.d', h('span.w', String(s.cardio.min), h('small', ' min')))),
    ),
    h('div.pair',
      h('a.btn.line.sm', { href: `#/edit/${s.id}` }, 'Correct'),
      h('button.btn.line.sm', { onclick: remove }, 'Delete'),
    ),
    h('div.dock', h('a.btn.go', { href: '#/', onclick: (e) => { e.preventDefault(); up('/'); } }, 'Done')),
  );
}

// Once a month: the data is only on this phone, so offer to copy it.
function backupLine() {
  const days = backupDays();
  if (days == null) return null;
  const text = h('span', { role: 'status' }, state.settings.backedUp ? `Last backup ${days} days ago.` : 'Your sessions are only on this phone.');
  const button = h('button.chip', {
    onclick: async () => {
      const said = await saveBackup();
      if (!said) return;
      text.textContent = said;
      button.remove();
    },
  }, icon('out'), 'Back up');
  return h('div.backup', text, button);
}
