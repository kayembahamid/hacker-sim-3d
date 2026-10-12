import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { speak, hush } from '../../../engine/core/voice.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, tabs, kv, empty, badge, head, office } from './kit.js';

// The HR portal (payroll bank details) and the video call.
//
// Payroll diversion is the salary version of vendor fraud: "please pay my
// salary into my new account", from an address that looks like a colleague.
// The portal shows where the request really came from and whether anyone
// has checked it with the person.
//
// Events: hr:changeViewed { id, genuine }, hr:changeApproved { id, genuine,
// verified }, hr:changeRejected { id, genuine }.
export function makeHrApp() {
  const app = {
    id: 'hr', title: 'HR portal', icon: 'hr', colour: 'linear-gradient(160deg,#e86fa3,#b03a73)', w: 940, h: 580, pinned: false,
    badge: (world) => world.office && world.office.hr.changes.filter((c) => c.status === 'pending').length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-hr' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('hr');
      const hr = ctx.world.office.hr;
      if (!changed(node, [hr, x])) return;
      const tab = x.tab || 'changes';
      node.append(
        head('HR portal', 'Payroll · requests you can see as AP cover'),
        tabs(ctx, 'hr', [['changes', 'Payroll bank changes', 'bank'], ['people', 'People', 'users']], tab),
        el('div', { class: 'ox-page' }, [tab === 'people' ? people(hr) : changes(ctx, hr, x)])
      );
    }
  };

  function changes(ctx, hr, x) {
    if (!hr.changes.length) return empty('No payroll changes waiting.');
    const open = hr.changes.find((c) => c.id === x.open);
    return el('div', { class: 'ox-split' }, [
      el('ul', { class: 'ox-list' }, hr.changes.map((c) => el('li', {}, [el('button', {
        class: `ox-row ${open && open.id === c.id ? 'is-on' : ''}`, type: 'button', dataset: { hrchange: c.id },
        onclick: () => { ctx.setExtra('hr', { open: c.id }); bus.emit('hr:changeViewed', { id: c.id, genuine: !!c.genuine }); }
      }, [el('span', { class: 'ox-row-main' }, [el('b', { text: c.employee }), el('small', { text: `${c.via} · ${c.received}` })]), badge(c.status, c.status === 'pending' ? 'warn' : c.status === 'rejected' ? 'bad' : 'good')])]))),
      open ? el('div', { class: 'ox-detail' }, [
        el('h3', { text: `${open.employee}: new salary account` }),
        kv('Requested via', open.via), kv('Sender address', open.address, { mono: true, warn: !open.genuine }),
        kv('New bank', `${open.newBank} · ${open.account}`, { mono: true }), kv('Received', open.received),
        el('p', { class: 'ox-note', text: 'Payroll changes are only made by the employee in the portal, signed in as themselves, or after a call to them on the number HR holds. Never from an email alone.' }),
        open.status === 'pending' ? el('div', { class: 'ox-actions' }, [
          btn('Reject', () => { set(ctx, open, 'rejected'); bus.emit('hr:changeRejected', { id: open.id, genuine: !!open.genuine }); }, { warn: true, ic: 'close' }),
          btn('Approve', () => { set(ctx, open, 'approved'); bus.emit('hr:changeApproved', { id: open.id, genuine: !!open.genuine, verified: !!open.verified }); }, { primary: true })
        ]) : el('p', { class: 'ox-decided', text: `Decision: ${open.status}.` })
      ]) : el('div', { class: 'ox-detail is-empty' }, [el('p', { text: 'Pick a request.' })])
    ]);
  }

  const set = (ctx, c, status) => office(ctx, (o) => { const t = o.hr.changes.find((q) => q.id === c.id); if (t) t.status = status; }, 'hr-decide');

  const people = (hr) => el('ul', { class: 'ox-cards' }, hr.employees.map((e) => el('li', { class: 'ox-card' }, [
    el('span', { class: 'ox-row-main' }, [el('b', { text: e.name }), el('small', { text: `${e.team} · salary to ${e.bank}` })])
  ])));

  return app;
}

// A video meeting. The face on the call is drawn, not filmed: a still that
// barely moves, a mouth out of time with the words, and captions that always
// show what is said. The script, and the choices during it, are scenario data
// (world.office.video.meetings).
//
// A meeting can carry more participants (m.participants), including bots
// such as an AI note taker that records ({ bot: true, recording: true }).
//
// Events: video:joined { id, genuine }, video:choice { id, choice },
// video:left { id }, video:reported { id, genuine }.
export function makeVideoApp() {
  let playing = null;
  const app = {
    id: 'video', title: 'Meet', icon: 'video', colour: 'linear-gradient(160deg,#35c3b0,#16806f)', w: 900, h: 600, pinned: false,
    mount(ctx, params = {}) { const node = el('div', { class: 'ox-app app-video' }); app.update(ctx, node, params); return node; },
    update(ctx, node, params = {}) {
      const v = ctx.world.office.video || { meetings: [] };
      const x = ctx.extra('video');
      const id = x.meeting || params.meeting;
      const m = v.meetings.find((q) => q.id === id) || v.meetings.find((q) => q.live);
      if (!changed(node, [m, x])) return;
      if (!m) { node.append(head('Meet', 'Video meetings'), empty('No meeting right now.')); return; }
      const joined = !!(x.joined === m.id);
      const said = m.said || [];
      const step = (m.script || [])[m.step || 0];
      node.append(
        head(m.title, `${m.host} · ${m.link || ''}`, [m.external ? badge('External', 'bad') : badge('Veltrix', 'good')]),
        el('div', { class: 'vc-stage' }, [
          el('div', { class: `vc-tile ${m.deepfake ? 'is-synthetic' : ''} ${joined ? 'is-live' : ''}` }, [
            el('div', { class: 'vc-face', style: { '--skin': m.skin || '#c99a7a' } }, [el('span', { class: 'vc-eyes' }), el('span', { class: 'vc-mouth' })]),
            el('span', { class: 'vc-name', text: m.host }),
            m.deepfake && joined ? el('span', { class: 'vc-glitch', text: 'Poor connection' }) : null
          ].filter(Boolean)),
          el('div', { class: 'vc-side' }, [
            // Other people on the call, and bots: a note taker shows up as a
            // participant with a recording badge, the way the real ones do.
            ...(m.participants || []).map((q) => el('div', { class: `vc-tile vc-small ${q.bot ? 'is-bot' : ''} ${q.deepfake ? 'is-synthetic' : ''} ${joined ? 'is-live' : ''}` }, [
              q.bot ? el('span', { class: 'vc-botmark' }, [icon('robot')]) : el('div', { class: 'vc-face', style: { '--skin': q.skin || '#b98a6e' } }, [el('span', { class: 'vc-eyes' }), el('span', { class: 'vc-mouth' })]),
              el('span', { class: 'vc-name', text: q.name }),
              q.recording && joined ? el('span', { class: 'vc-rec', text: 'REC' }) : null
            ].filter(Boolean))),
            el('div', { class: 'vc-tile vc-me' }, [el('span', { class: 'vc-avatar', text: 'S' }), el('span', { class: 'vc-name', text: 'You (camera off)' })])
          ])
        ]),
        el('div', { class: 'vc-captions', 'aria-live': 'polite' }, said.slice(-3).map((l) => el('p', {}, [el('b', { text: l.who === 'me' ? 'You: ' : `${m.host}: ` }), l.text]))),
        joined && step && step.choices ? el('div', { class: 'vc-choices' }, step.choices.map((c) => el('button', { class: 'call-choice', type: 'button', dataset: { choice: c.id || '' }, onclick: () => choose(ctx, m, c) }, [c.label]))) : '',
        el('div', { class: 'ox-actions vc-controls' }, joined ? [
          btn('Leave', () => leave(ctx, m), { warn: true, ic: 'phoneOff', cls: 'vc-leave' }),
          btn('Report this meeting', () => { bus.emit('video:reported', { id: m.id, genuine: !!m.genuine }); leave(ctx, m); }, { ic: 'flag', cls: 'vc-report' })
        ] : [btn('Join with camera off', () => join(ctx, m), { primary: true, ic: 'video', cls: 'vc-join' })])
      );
    }
  };

  const upd = (ctx, m, fn, reason) => office(ctx, (o) => { const t = o.video.meetings.find((q) => q.id === m.id); if (t) fn(t); }, reason);

  function join(ctx, m) {
    ctx.setExtra('video', { joined: m.id, meeting: m.id });
    upd(ctx, m, (t) => { t.step = 0; t.said = []; }, 'video-join');
    audio.play('notify');
    bus.emit('video:joined', { id: m.id, genuine: !!m.genuine });
    play(ctx, m.id);
  }

  async function play(ctx, id) {
    const token = {};
    playing = token;
    for (;;) {
      const m = (ctx.store.get().office.video.meetings || []).find((q) => q.id === id);
      if (!m || playing !== token || ctx.store.get().desktop.extra.video?.joined !== id) return;
      const step = (m.script || [])[m.step || 0];
      if (!step) return;
      if (step.say) {
        upd(ctx, m, (t) => { t.said = [...(t.said || []), { who: 'them', text: step.say }]; }, 'video-say');
        await speak(step.say, { speaker: m.host, gender: m.voice && m.voice.gender, tone: m.voice && m.voice.tone });
      }
      if (step.choices || step.end) return;
      upd(ctx, m, (t) => { t.step = (t.step || 0) + 1; }, 'video-next');
    }
  }

  function choose(ctx, m, c) {
    upd(ctx, m, (t) => {
      t.said = [...(t.said || []), { who: 'me', text: c.label }];
      const next = c.goto !== undefined ? (t.script || []).findIndex((s) => s.id === c.goto) : (t.step || 0) + 1;
      t.step = next >= 0 ? next : (t.step || 0) + 1;
    }, 'video-choice');
    bus.emit('video:choice', { id: m.id, choice: c.id, genuine: !!m.genuine });
    if (c.leave) { leave(ctx, m); return; }
    play(ctx, m.id);
  }

  function leave(ctx, m) {
    playing = null;
    hush();
    ctx.setExtra('video', { joined: null });
    bus.emit('video:left', { id: m.id });
  }

  return app;
}
