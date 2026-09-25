import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { format } from '../../../engine/core/clock.js';
import { changed, btn, tabs, empty, badge, head, office } from './kit.js';

// The IT helpdesk: the right place to report anything, and the record that
// something was reported. A ticket is raised by picking what happened and
// what it is about; nothing is typed, and nothing leaves the browser.
//
// Events: ticket:raised { category, about, id }, ticket:viewed { id }.
const CATEGORIES = [
  ['phishing', 'Phishing email or message'],
  ['call', 'Suspicious call or sign in prompt'],
  ['account', 'My account may be compromised'],
  ['payment', 'Payment or bank detail fraud'],
  ['device', 'Found or lost device, USB stick'],
  ['physical', 'Someone trying to get into the building'],
  ['data', 'Data exposed, shared or leaked'],
  ['other', 'Something else']
];

export function makeHelpdeskApp() {
  const app = {
    id: 'helpdesk', title: 'Helpdesk', icon: 'ticket', colour: 'linear-gradient(160deg,#f2994a,#c4621d)', w: 900, h: 600, pinned: true,
    mount(ctx) { const node = el('div', { class: 'ox-app app-helpdesk' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('helpdesk');
      const hd = ctx.world.office.helpdesk;
      const abouts = ctx.world.office.helpdeskAbout || [];
      if (!changed(node, [hd, x, abouts])) return;
      const tab = x.tab || 'new';
      node.append(
        head('IT Helpdesk', 'Report it here. The service desk sees it straight away.', [badge('Out of hours: x4999 for security', '')]),
        tabs(ctx, 'helpdesk', [['new', 'Raise a ticket', 'plus'], ['mine', 'My tickets', 'ticket']], tab),
        el('div', { class: 'ox-page' }, [tab === 'mine' ? mine(ctx, hd) : raise(ctx, x, abouts)])
      );
    }
  };

  function raise(ctx, x, abouts) {
    const cat = x.cat || null;
    const about = x.about || null;
    const options = abouts.filter((a) => !a.category || a.category === cat);
    return el('div', { class: 'hd-form' }, [
      el('h3', { text: '1. What happened?' }),
      el('div', { class: 'hd-choices' }, CATEGORIES.map(([id, label]) => el('button', {
        class: `hd-choice ${cat === id ? 'is-on' : ''}`, type: 'button', dataset: { cat: id },
        onclick: () => ctx.setExtra('helpdesk', { cat: id, about: null })
      }, [label]))),
      cat ? el('h3', { text: '2. What is it about?' }) : null,
      cat ? el('div', { class: 'hd-choices' }, [
        ...options.map((a) => el('button', { class: `hd-choice ${about === a.id ? 'is-on' : ''}`, type: 'button', dataset: { about: a.id }, onclick: () => ctx.setExtra('helpdesk', { about: a.id }) }, [a.label])),
        el('button', { class: `hd-choice ${about === 'general' ? 'is-on' : ''}`, type: 'button', dataset: { about: 'general' }, onclick: () => ctx.setExtra('helpdesk', { about: 'general' }) }, ['Something not listed here'])
      ]) : null,
      cat && about ? btn('Submit ticket', () => {
        const pick = options.find((a) => a.id === about);
        const id = `INC-${5600 + ctx.world.office.helpdesk.tickets.length}`;
        office(ctx, (o) => { o.helpdesk.tickets.unshift({ id, title: pick ? pick.label : CATEGORIES.find((c) => c[0] === cat)[1], status: 'Open', by: 'Sam Rivera', at: format(ctx.world.clock.minutes), category: cat }); }, 'ticket');
        ctx.setExtra('helpdesk', { cat: null, about: null, tab: 'mine' });
        bus.emit('ticket:raised', { id, category: cat, about });
        ctx.toast({ app: 'helpdesk', title: `${id} raised`, body: 'Priya on the service desk has it.' });
      }, { primary: true, ic: 'check' }) : null
    ].filter(Boolean));
  }

  function mine(ctx, hd) {
    return hd.tickets.length ? el('ul', { class: 'ox-cards' }, hd.tickets.map((t) => el('li', { class: 'ox-card' }, [
      el('span', { class: 'ox-row-main' }, [el('b', { text: `${t.id} · ${t.title}` }), el('small', { text: `${t.by} · ${t.at}` })]),
      badge(t.status, t.status === 'Resolved' ? 'good' : 'warn')
    ]))) : empty('No tickets yet.');
  }

  return app;
}

// Calendar: today's meetings and invitations. The organiser's real address and
// the meeting link are one click away, the way a careful person checks them.
//
// Events: invite:opened { id, genuine }, invite:accepted, invite:declined,
// invite:reported, invite:linkOpened { id, href, genuine }.
export function makeCalendarApp() {
  const app = {
    id: 'calendar', title: 'Calendar', icon: 'calendar', colour: 'linear-gradient(160deg,#4fb3f6,#1f79c4)', w: 900, h: 580, pinned: false,
    badge: (world) => world.office && world.office.calendar.events.filter((e) => e.state === 'new').length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-calendar' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('calendar');
      const cal = ctx.world.office.calendar;
      if (!changed(node, [cal, x])) return;
      const open = cal.events.find((e) => e.id === x.open);
      node.append(
        head('Calendar', 'Thursday 24 September'),
        el('div', { class: 'ox-split' }, [
          el('ul', { class: 'ox-list' }, cal.events.map((e) => el('li', {}, [el('button', {
            class: `ox-row ${open && open.id === e.id ? 'is-on' : ''} ${e.past ? 'is-past' : ''}`, type: 'button', dataset: { event: e.id },
            onclick: () => { ctx.setExtra('calendar', { open: e.id }); bus.emit('invite:opened', { id: e.id, genuine: !!e.genuine }); }
          }, [el('span', { class: 'ox-row-main' }, [el('b', { text: e.title }), el('small', { text: `${e.when} · ${e.from}` })]), e.state === 'new' ? badge('New', 'warn') : badge(e.state)])]))),
          open ? detail(ctx, open) : el('div', { class: 'ox-detail is-empty' }, [el('p', { text: 'Pick a meeting.' })])
        ])
      );
    }
  };

  function detail(ctx, e) {
    const set = (state, event) => {
      office(ctx, (o) => { const t = o.calendar.events.find((q) => q.id === e.id); if (t) t.state = state; }, 'invite');
      bus.emit(event, { id: e.id, genuine: !!e.genuine });
    };
    return el('div', { class: 'ox-detail' }, [
      el('h3', { text: e.title }),
      el('div', { class: 'kv' }, [el('span', { text: 'Organiser' }), el('b', {}, [e.from, el('small', { class: 'mono', text: ` <${e.address}>` })])]),
      el('div', { class: 'kv' }, [el('span', { text: 'When' }), el('b', { text: e.when })]),
      e.external ? el('p', { class: 'ox-bad-text', text: 'This invitation came from outside Veltrix Logistics.' }) : null,
      e.body ? el('div', { class: 'ox-quote' }, [].concat(e.body).map((l) => el('p', { text: l }))) : null,
      e.link ? el('p', {}, [el('a', {
        class: 'ox-link', href: e.link, onclick: (ev) => {
          ev.preventDefault();
          bus.emit('invite:linkOpened', { id: e.id, href: e.link, genuine: !!e.genuine });
          ctx.open(e.video ? 'video' : 'browser', e.video ? { meeting: e.id } : { url: e.link, from: 'calendar' });
        },
        onpointerenter: () => ctx.bar && ctx.bar.show && ctx.bar.show(e.link)
      }, [`Join: ${e.link}`])]) : null,
      e.past ? null : el('div', { class: 'ox-actions' }, [
        btn('Accept', () => set('accepted', 'invite:accepted'), { primary: true }),
        btn('Decline', () => set('declined', 'invite:declined')),
        btn('Report as phishing', () => set('reported', 'invite:reported'), { warn: true, ic: 'flag' })
      ])
    ].filter(Boolean));
  }

  return app;
}
