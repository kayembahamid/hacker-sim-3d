import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// The work queue: requests that need a decision, not a click. A customer asks
// for their data, marketing wants to email a list, a vendor wants customer
// records. Each case is scenario data (world.office.cases): what came in, the
// policy that applies, and one or more groups of options to pick from. The
// careful answer is in the data (good: true / false); the player only sees the
// options until they decide, then each one explains itself.
//
// case: { id, title, kind, from, received, due, body: [], table: { head, rows },
//   policy: { title, lines }, sections: [{ id, title, prompt, multi, required,
//   options: [{ id, label, detail, good, bad, why }] }], actions: [{ id, label,
//   primary, warn, status }] }
//
// Events: case:opened { case }, case:picked { case, section, option, on, good,
// bad }, case:action { case, action, ok, bad, missing, extra, picks }.
export function makeCasesApp() {
  const app = {
    id: 'cases', title: 'Work queue', icon: 'ticket', colour: 'linear-gradient(160deg,#4f7df0,#2d4fb8)', w: 1040, h: 660, pinned: false,
    badge: (world) => world.office && (world.office.cases || []).filter((c) => c.status !== 'done').length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-cases' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('cases');
      const cases = ctx.world.office.cases || [];
      if (!changed(node, [cases, x])) return;
      const open = cases.find((c) => c.id === x.open) || (cases.length === 1 ? cases[0] : null);
      node.append(
        head('Work queue', 'Requests assigned to you tonight', [badge(`${cases.filter((c) => c.status !== 'done').length} open`, cases.some((c) => c.status !== 'done') ? 'warn' : 'good')]),
        el('div', { class: 'ox-page' }, [cases.length ? el('div', { class: 'ox-split cs-split' }, [
          el('ul', { class: 'ox-list' }, cases.map((c) => el('li', {}, [el('button', {
            class: `ox-row ${open && open.id === c.id ? 'is-on' : ''}`, type: 'button', dataset: { case: c.id },
            onclick: () => { ctx.setExtra('cases', { open: c.id }); bus.emit('case:opened', { case: c.id }); }
          }, [el('span', { class: 'ox-row-main' }, [el('b', { text: c.title }), el('small', { text: `${c.kind || 'Request'} · ${c.received || ''}` })]), badge(c.status === 'done' ? 'Done' : c.due || 'Open', c.status === 'done' ? 'good' : 'warn')])]))),
          open ? detail(ctx, open) : el('div', { class: 'ox-detail is-empty' }, [icon('ticket'), el('p', { text: 'Pick a request.' })])
        ]) : empty('Nothing assigned to you.')])
      );
      // Opening the only case counts as opening it.
      if (open && x.seen !== open.id) { ctx.setExtra('cases', { seen: open.id, open: open.id }); if (!x.open) bus.emit('case:opened', { case: open.id }); }
    }
  };

  const picksOf = (c, sid) => (c.picks && c.picks[sid]) || [];

  function toggle(ctx, c, s, o) {
    if (c.status === 'done') return;
    const cur = picksOf(c, s.id);
    const on = !cur.includes(o.id);
    const next = s.multi ? (on ? [...cur, o.id] : cur.filter((q) => q !== o.id)) : (on ? [o.id] : []);
    office(ctx, (w) => { const t = w.cases.find((q) => q.id === c.id); if (t) t.picks = { ...(t.picks || {}), [s.id]: next }; }, 'case-pick');
    audio.play('click');
    bus.emit('case:picked', { case: c.id, section: s.id, option: o.id, on, good: o.good === undefined ? null : !!o.good, bad: on ? (o.bad || '') : '' });
  }

  function grade(c) {
    let missing = 0; let extra = 0; const bad = []; const picks = [];
    for (const s of c.sections || []) {
      const cur = picksOf(c, s.id);
      picks.push(...cur);
      for (const o of s.options) {
        const on = cur.includes(o.id);
        if (o.good === true && !on && (s.multi || !cur.some((id) => (s.options.find((q) => q.id === id) || {}).good === true))) missing++;
        if (o.good === false && on) { extra++; if (o.bad) bad.push(o.bad); }
      }
    }
    return { ok: missing === 0 && extra === 0, missing, extra, bad: [...new Set(bad)].join(','), picks: picks.join(',') };
  }

  function decide(ctx, c, a) {
    const g = grade(c);
    office(ctx, (w) => { const t = w.cases.find((q) => q.id === c.id); if (t) { t.status = a.status || 'done'; t.decided = a.id; } }, 'case-action');
    audio.play(a.warn ? 'click' : 'good');
    bus.emit('case:action', { case: c.id, action: a.id, ...g });
    ctx.toast({ app: 'cases', title: a.toast || 'Done', body: c.title });
  }

  function detail(ctx, c) {
    const done = c.status === 'done';
    const missingRequired = (c.sections || []).some((s) => s.required && !picksOf(c, s.id).length);
    return el('div', { class: 'ox-detail cs-detail' }, [
      el('h3', { text: c.title }),
      el('div', { class: 'cs-meta' }, [c.from ? el('span', {}, [icon('user'), c.from]) : null, c.received ? el('span', {}, [icon('clock'), c.received]) : null, c.due ? el('span', { class: 'cs-due' }, [icon('warning'), c.due]) : null].filter(Boolean)),
      ...(c.body || []).map((p) => el('p', { class: 'cs-body', text: p })),
      c.table ? el('div', { class: 'cs-tablewrap' }, [el('table', { class: 'ox-table cs-table' }, [
        el('thead', {}, [el('tr', {}, c.table.head.map((h) => el('th', { text: h })))]),
        el('tbody', {}, c.table.rows.map((r) => el('tr', {}, r.map((v) => el('td', { text: String(v) })))))
      ])]) : null,
      c.policy ? el('div', { class: 'cs-policy' }, [el('b', {}, [icon('doc'), ` ${c.policy.title}`]), ...(c.policy.lines || []).map((l) => el('p', { text: l }))]) : null,
      ...(c.sections || []).map((s) => el('section', { class: 'cs-section' }, [
        el('h4', { text: s.title }),
        s.prompt ? el('p', { class: 'ox-note', text: s.prompt }) : null,
        el('div', { class: 'cs-options', role: s.multi ? 'group' : 'radiogroup' }, s.options.map((o) => {
          const on = picksOf(c, s.id).includes(o.id);
          const verdict = done && o.good !== undefined ? (o.good ? (on ? 'is-right' : 'is-missed') : (on ? 'is-wrong' : '')) : '';
          return el('button', {
            class: `cs-opt ${on ? 'is-on' : ''} ${verdict}`, type: 'button', role: s.multi ? 'checkbox' : 'radio', 'aria-checked': String(on),
            dataset: { opt: o.id, good: o.good === true ? '1' : o.good === false ? '0' : '' }, disabled: done ? '' : null, onclick: () => toggle(ctx, c, s, o)
          }, [
            el('span', { class: 'cs-tick' }, [icon(on ? 'check' : 'plus')]),
            el('span', { class: 'cs-opt-main' }, [el('b', { text: o.label }), o.detail ? el('small', { text: o.detail }) : null, done && o.why ? el('small', { class: 'cs-why', text: o.why }) : null].filter(Boolean))
          ]);
        }))
      ].filter(Boolean))),
      done ? el('p', { class: 'ox-decided', text: `Decided: ${((c.actions || []).find((a) => a.id === c.decided) || {}).label || c.decided}.` })
        : el('div', { class: 'ox-actions' }, (c.actions || []).map((a) => btn(a.label, () => decide(ctx, c, a), { primary: !!a.primary, warn: !!a.warn, disabled: !!(a.primary && missingRequired), cls: `cs-act cs-act-${a.id}` })))
    ].filter(Boolean));
  }

  return app;
}
