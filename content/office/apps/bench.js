import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, tabs, empty, badge, head, office } from './kit.js';

// The Workbench: the developer drills' workstation, on the office computer.
// A code review with three tabs. Code shows the vulnerable files. Exploit
// lets the player send requests at a simulated staging system, including the
// one that breaks it. Fix is a set of changes to pick from, some right, some
// plausible and bypassable, some beside the point.
//
// Nothing here runs code or makes a request: every response is scenario data
// (world.office.bench), so the "exploit" is a rehearsal against a made up
// system, and nothing typed or clicked leaves the browser.
//
// bench: { id, title, sub, files: [{ path, lang, lines, flaw: [line numbers],
//   vulnerable }], intro, attempts: [{ id, label, request, response,
//   fixedResponse, exploits }], fix: { prompt, options: [{ id, label, code,
//   good, bad, why }] }, found, decided, fixed, picks, last }
//
// Events: bench:fileViewed { bench, path, vulnerable }, bench:attempt { bench,
// attempt, exploited }, bench:picked { bench, option, on }, bench:fixApplied
// { bench, ok, missing, extra, bad }, bench:retest { bench, attempt, exploit,
// fixed, blocked }.
export function makeBenchApp() {
  const app = {
    id: 'bench', title: 'Workbench', icon: 'code', colour: 'linear-gradient(160deg,#4a5170,#1d2135)', w: 1060, h: 650, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-bench' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const b = ctx.world.office.bench;
      const x = ctx.extra('bench');
      if (!b) { if (changed(node, 'none')) node.append(head('Workbench', 'Nothing to review right now'), empty('No code review is open.')); return; }
      if (!changed(node, [b, x])) return;
      const tab = x.tab || 'code';
      node.append(
        head(b.title, b.sub || '', [b.fixed ? badge('Patched', 'good') : b.found ? badge('Bug reproduced', 'bad') : badge('Under review', 'warn')]),
        tabs(ctx, 'bench', [['code', 'Code', 'code'], ['exploit', 'Exploit', 'play'], ['fix', 'Fix', 'check']], tab),
        el('div', { class: 'ox-page' }, [tab === 'exploit' ? exploit(ctx, b) : tab === 'fix' ? fix(ctx, b) : code(ctx, b, x)])
      );
      // The file that is open when the review starts counts as read.
      if (tab === 'code' && !x.seenFile) {
        ctx.setExtra('bench', { seenFile: true });
        const f = b.files[0];
        bus.emit('bench:fileViewed', { bench: b.id, path: f.path, vulnerable: !!f.vulnerable });
      }
    }
  };

  // ------------------------------------------------------------------ code
  function code(ctx, b, x) {
    const open = b.files.find((f) => f.path === x.file) || b.files[0];
    const flaws = new Set(b.found ? open.flaw || [] : []);
    return el('div', { class: 'ox-split bn-split' }, [
      el('ul', { class: 'ox-list' }, b.files.map((f) => el('li', {}, [el('button', {
        class: `ox-row ${f.path === open.path ? 'is-on' : ''}`, type: 'button', dataset: { file: f.path },
        onclick: () => { ctx.setExtra('bench', { file: f.path, seenFile: true }); bus.emit('bench:fileViewed', { bench: b.id, path: f.path, vulnerable: !!f.vulnerable }); }
      }, [el('span', { class: 'ox-row-main' }, [el('b', { class: 'mono', text: f.path }), el('small', { text: f.lang })])])]))),
      el('div', { class: 'ox-detail bn-detail' }, [
        el('h3', { class: 'mono', text: open.path }),
        b.fixed ? el('p', { class: 'ox-good' }, [icon('check'), ' Your patch is applied. See the Fix tab for exactly what changed.']) : null,
        b.found && flaws.size ? el('p', { class: 'ox-bad-text', text: 'The lines marked in red are where the bug you reproduced comes from.' }) : null,
        el('pre', { class: 'bn-code mono' }, open.lines.map((l, i) => el('span', { class: `bn-line ${flaws.has(i + 1) ? 'is-flaw' : ''}` }, [el('i', { text: String(i + 1) }), l, '\n'])))
      ].filter(Boolean))
    ]);
  }

  // --------------------------------------------------------------- exploit
  function exploit(ctx, b) {
    const last = b.last;
    return el('div', { class: 'ox-split bn-split' }, [
      el('div', {}, [
        el('p', { class: 'ox-note', text: b.decided ? 'Run the exploit again against the patched code, and check normal use still works.' : b.intro }),
        el('ul', { class: 'ox-cards' }, b.attempts.map((a) => el('li', {}, [el('button', {
          class: `bn-attempt ${last && last.id === a.id ? 'is-on' : ''}`, type: 'button', dataset: { attempt: a.id }, onclick: () => run(ctx, b, a)
        }, [icon('play'), el('span', { text: a.label })])])))
      ]),
      last ? el('div', { class: 'ox-detail bn-detail' }, [
        el('small', { class: 'bn-cap', text: 'Request' }),
        el('pre', { class: 'bn-io mono', text: last.request }),
        el('small', { class: 'bn-cap', text: 'Response' }),
        el('pre', { class: `bn-io mono ${last.exploited ? 'is-bad' : ''}`, text: last.response }),
        last.note ? el('p', { class: 'ox-bad-text', text: last.note }) : null
      ].filter(Boolean)) : el('div', { class: 'ox-detail is-empty' }, [icon('play'), el('p', { text: 'Pick a request to send to staging.' })])
    ]);
  }

  function run(ctx, b, a) {
    const decided = !!b.decided;
    const response = decided && b.fixed ? (a.fixedResponse || a.response) : a.response;
    const note = decided && !b.fixed && a.exploits ? 'The exploit still works: that change did not close the hole.' : '';
    office(ctx, (o) => {
      const t = o.bench;
      t.last = { id: a.id, request: a.request, response, note, exploited: !decided && !!a.exploits };
      if (!decided && a.exploits) t.found = true;
    }, 'bench-run');
    audio.play('click');
    if (decided) bus.emit('bench:retest', { bench: b.id, attempt: a.id, exploit: !!a.exploits, fixed: !!b.fixed, blocked: !!b.fixed && !!a.exploits });
    else bus.emit('bench:attempt', { bench: b.id, attempt: a.id, exploited: !!a.exploits });
  }

  // ------------------------------------------------------------------- fix
  function fix(ctx, b) {
    const picks = b.picks || [];
    const done = !!b.decided;
    const patch = b.fix.options.filter((o) => picks.includes(o.id) && o.code && o.code.length);
    return el('div', { class: 'bn-fix' }, [
      el('p', { class: 'ox-note', text: b.found ? b.fix.prompt : 'Reproduce the bug first, on the Exploit tab. You cannot fix what you have not seen.' }),
      el('div', { class: 'cs-options', role: 'group' }, b.fix.options.map((o) => {
        const on = picks.includes(o.id);
        const verdict = done ? (o.good ? (on ? 'is-right' : 'is-missed') : (on ? 'is-wrong' : '')) : '';
        return el('button', {
          class: `cs-opt ${on ? 'is-on' : ''} ${verdict}`, type: 'button', role: 'checkbox', 'aria-checked': String(on), dataset: { opt: o.id, good: o.good ? '1' : '0' },
          disabled: done || !b.found ? '' : null,
          onclick: () => {
            const next = on ? picks.filter((p) => p !== o.id) : [...picks, o.id];
            office(ctx, (w) => { w.bench.picks = next; }, 'bench-pick');
            audio.play('click');
            bus.emit('bench:picked', { bench: b.id, option: o.id, on: !on });
          }
        }, [
          el('span', { class: 'cs-tick' }, [icon(on ? 'check' : 'plus')]),
          el('span', { class: 'cs-opt-main' }, [el('b', { text: o.label }), done && o.why ? el('small', { class: 'cs-why', text: o.why }) : null].filter(Boolean))
        ]);
      })),
      patch.length ? el('div', { class: 'bn-patch' }, [el('small', { class: 'bn-cap', text: 'Your patch' }), el('pre', { class: 'bn-code mono' }, patch.flatMap((o) => o.code.map((l) => el('span', { class: `bn-line ${l.startsWith('-') ? 'is-del' : 'is-add'}` }, [l, '\n']))))]) : null,
      done ? el('p', { class: 'ox-decided', text: b.fixed ? 'Patch applied.' : 'Patch applied, but see what was missed or wrong above.' })
        : el('div', { class: 'ox-actions' }, [btn('Apply the patch', () => apply(ctx, b), { primary: true, disabled: !b.found || !picks.length, cls: 'bn-apply' })])
    ].filter(Boolean));
  }

  function apply(ctx, b) {
    const picks = b.picks || [];
    let missing = 0; let extra = 0; const bad = [];
    for (const o of b.fix.options) {
      const on = picks.includes(o.id);
      if (o.good && !on) missing++;
      if (!o.good && on) { extra++; if (o.bad) bad.push(o.bad); }
    }
    const ok = missing === 0 && extra === 0;
    office(ctx, (w) => { w.bench.decided = true; w.bench.fixed = ok; }, 'bench-fix');
    audio.play(ok ? 'good' : 'click');
    bus.emit('bench:fixApplied', { bench: b.id, ok, missing, extra, bad: [...new Set(bad)].join(',') });
  }

  return app;
}
