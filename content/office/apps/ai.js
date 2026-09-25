import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, tabs, empty, badge, head, office } from './kit.js';

// Veltrix Assist, the company's AI assistant, and the console for the agent
// behind it. The assistant reads what it is given, including text a person
// cannot see, and the agent can act: send mail, create rules, read files.
// That is the whole prompt injection problem in two windows.
//
// Nothing here calls a real model. Prompts and replies are scenario data
// (world.office.ai.prompts); asking one raises assistant:asked and the
// scenario decides what the agent then tries to do.
//
// Events: assistant:asked { id }, agent:approved { id, dangerous },
// agent:blocked { id, dangerous }, agent:permission { tool, on },
// agent:viewed { pending }.
const DEFAULT_PROMPTS = [
  { id: 'unread', label: 'Summarise my unread email', reply: ['You have a reminder from Dan about tonight’s payment run (final list by 18:30), and a few routine messages from IT and the People team.'], sources: ['Your inbox'] },
  { id: 'run', label: 'What is in tonight’s payment run?', reply: ['Four payments are queued for tonight: Ferrum Steel Supply (£48,250), Kestrel Freight (£12,940), Talon Tyres (£7,125) and Northbank Packaging (£3,810). The two over £10,000 need Dan Whitlock’s approval.'], sources: ['Finance, payment run'] }
];

export function makeAssistantApp() {
  const app = {
    id: 'assistant', title: 'Veltrix Assist', icon: 'sparkles', colour: 'linear-gradient(160deg,#9b7bff,#5b3fd1)', w: 820, h: 600, pinned: true,
    mount(ctx) { const node = el('div', { class: 'ox-app app-assistant' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const ai = ctx.world.office.ai;
      const pending = ctx.world.office.agent.actions.filter((a) => a.state === 'pending').length;
      if (!changed(node, [ai, pending])) return;
      const prompts = [...(ai.prompts || []), ...DEFAULT_PROMPTS].filter((p) => !(ai.chats || []).some((c) => c.id === p.id && p.once));
      node.append(
        head('Veltrix Assist', 'Summaries and drafts from your mail, files and the ERP', [pending ? badge(`${pending} action waiting in the agent console`, 'warn') : null].filter(Boolean)),
        el('div', { class: 'as-chat', role: 'log' }, (ai.chats || []).length ? ai.chats.map((c) => el('div', { class: 'as-turn' }, [
          el('p', { class: 'as-q' }, [icon('user'), el('span', { text: c.label })]),
          el('div', { class: 'as-a' }, [
            icon('sparkles'),
            el('div', {}, [
              ...c.reply.map((l) => el('p', { text: l })),
              c.sources ? el('small', { class: 'as-src', text: `Sources: ${c.sources.join(', ')}` }) : null,
              c.queued ? el('p', { class: 'as-queued' }, [icon('robot'), ` ${c.queued}`]) : null
            ].filter(Boolean))
          ])
        ])) : [el('p', { class: 'app-empty', text: 'Ask Veltrix Assist about your mail, files or the payment run.' })]),
        el('div', { class: 'as-prompts' }, prompts.map((p) => el('button', {
          class: 'as-prompt', type: 'button', dataset: { prompt: p.id },
          onclick: () => {
            office(ctx, (o) => { o.ai.chats = [...(o.ai.chats || []), { id: p.id, label: p.label, reply: p.reply, sources: p.sources, queued: p.queued, once: p.once }]; }, 'assistant');
            bus.emit('assistant:asked', { id: p.id, doc: p.doc || null });
          }
        }, [icon('sparkles'), p.label])))
      );
      const chat = node.querySelector('.as-chat');
      requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    }
  };
  return app;
}

const TOOLS = [
  ['read_mail', 'Read your mailbox'],
  ['read_files', 'Read your files'],
  ['send_email', 'Send email as you'],
  ['create_mail_rule', 'Create mailbox rules'],
  ['share_files', 'Share files outside Veltrix']
];

export function makeAgentApp() {
  const app = {
    id: 'agent', title: 'Agent console', icon: 'robot', colour: 'linear-gradient(160deg,#5b6b8a,#2c3650)', w: 960, h: 600, pinned: false,
    badge: (world) => world.office && world.office.agent.actions.filter((a) => a.state === 'pending').length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-agent' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('agent');
      const ag = ctx.world.office.agent;
      if (!changed(node, [ag, x])) return;
      const tab = x.tab || 'queue';
      const pending = ag.actions.filter((a) => a.state === 'pending');
      node.append(
        head('Agent console', 'What Veltrix Assist is allowed to do, and what it is trying to do', [pending.length ? badge(`${pending.length} waiting for you`, 'warn') : badge('Nothing waiting', 'good')]),
        tabs(ctx, 'agent', [['queue', 'Waiting for approval', 'robot'], ['log', 'Activity log', 'clock'], ['perms', 'Permissions', 'key']], tab),
        el('div', { class: 'ox-page' }, [tab === 'log' ? log(ag) : tab === 'perms' ? perms(ctx, ag) : queue(ctx, ag)])
      );
      if (tab === 'queue' && x.seen !== ag.actions.length) {
        ctx.setExtra('agent', { seen: ag.actions.length });
        bus.emit('agent:viewed', { pending: pending.length, dangerous: pending.some((a) => a.dangerous) });
      }
    }
  };

  function decide(ctx, a, verdict) {
    office(ctx, (o) => {
      const t = o.agent.actions.find((q) => q.id === a.id);
      if (t) t.state = verdict;
      o.agent.log.unshift({ at: ctx.world.clock.minutes, text: `${verdict === 'approved' ? 'Ran' : 'Blocked'}: ${a.summary}` });
    }, 'agent-decide');
    bus.emit(verdict === 'approved' ? 'agent:approved' : 'agent:blocked', { id: a.id, dangerous: !!a.dangerous, tool: a.tool });
  }

  function queue(ctx, ag) {
    const list = ag.actions.filter((a) => a.state === 'pending');
    if (!list.length) return empty('The agent is not waiting for anything.');
    return el('ul', { class: 'ox-cards' }, list.map((a) => el('li', { class: `ox-card ag-action ${a.dangerous ? 'is-bad' : ''}`, dataset: { action: a.id } }, [
      el('div', { class: 'ox-row-main' }, [
        el('b', { text: a.summary }),
        el('small', { class: 'mono', text: `${a.tool}(${Object.entries(a.args || {}).map(([k, v]) => `${k}: "${v}"`).join(', ')})` }),
        el('small', { text: `Why: ${a.reason}` }),
        a.source ? el('small', { class: a.dangerous ? 'ox-bad-text' : '', text: `Instruction came from: ${a.source}` }) : null
      ].filter(Boolean)),
      el('div', { class: 'ox-actions' }, [
        btn('Block', () => decide(ctx, a, 'blocked'), { warn: true, ic: 'block' }),
        btn('Approve', () => decide(ctx, a, 'approved'), { primary: !a.dangerous })
      ])
    ])));
  }

  function log(ag) {
    return ag.log.length ? el('ul', { class: 'ag-log mono' }, ag.log.map((l) => el('li', { text: `${fmt(l.at)}  ${l.text}` }))) : empty('No activity yet.');
  }

  function perms(ctx, ag) {
    const off = ag.revoked || [];
    return el('ul', { class: 'ox-cards' }, TOOLS.map(([tool, label]) => el('li', { class: 'ox-card' }, [
      el('span', { class: 'ox-row-main' }, [el('b', { text: label }), el('small', { class: 'mono', text: tool })]),
      btn(off.includes(tool) ? 'Allow' : 'Remove permission', () => {
        const on = off.includes(tool);
        office(ctx, (o) => { const r = o.agent.revoked || []; o.agent.revoked = on ? r.filter((t) => t !== tool) : [...r, tool]; }, 'agent-perm');
        bus.emit('agent:permission', { tool, on });
      }, { warn: !off.includes(tool) && /send|rule|share/.test(tool) })
    ])));
  }

  const fmt = (m) => (typeof m === 'number' ? `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` : m);
  return app;
}
