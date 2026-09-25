import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';
import { makeLink } from '../../link.js';

// Texts. The top of a conversation shows what the phone shows: a name. The
// Details panel shows the real number and whether it is a saved contact,
// which is the first check a careful person makes.
function preview(thread) {
  const last = thread.messages[thread.messages.length - 1];
  return last ? (last.dir === 'out' ? `You: ${last.text}` : last.text) : '';
}

const STATE = { reported: 'Reported as spam', blocked: 'Sender blocked', deleted: 'Deleted', replied: '' };

export const messagesApp = {
  id: 'messages',
  name: 'Messages',
  icon: 'messages',
  colour: 'linear-gradient(160deg,#4fd97a,#1f9c55)',
  dock: true,
  badge: (world) => world.phone.threads.reduce((n, t) => n + (t.state === 'deleted' ? 0 : (t.unread || 0)), 0),

  mount(ctx) {
    const node = el('div', { class: 'app app-messages' });
    this.update(ctx, node);
    return node;
  },

  update(ctx, node) {
    clear(node);
    const open = ctx.view('messages').thread;
    const thread = ctx.world.phone.threads.find((t) => t.id === open && t.state !== 'deleted');
    node.append(thread ? conversation(ctx, thread) : list(ctx));
  }
};

function openThread(ctx, t) {
  ctx.store.update((s) => {
    s.phone.view.messages = { ...(s.phone.view.messages || {}), thread: t.id, details: false };
    const th = s.phone.threads.find((x) => x.id === t.id);
    if (th) th.unread = 0;
  }, 'sms-open');
  bus.emit('sms:opened', { threadId: t.id, genuine: !!t.genuine, from: t.from.number });
  audio.play('tap');
}

function list(ctx) {
  const threads = ctx.world.phone.threads.filter((t) => t.state !== 'deleted');
  return el('div', { class: 'ms-list' }, [
    el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Messages' })]),
    threads.length ? el('div', { class: 'ms-rows' }, threads.map((t) => el('button', {
      class: `ms-row ${t.unread ? 'is-unread' : ''}`, type: 'button', dataset: { thread: t.id },
      onclick: () => openThread(ctx, t)
    }, [
      el('span', { class: `ms-avatar ${t.from.known ? 'is-known' : ''}`, text: (t.from.name || '#').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#' }),
      el('span', { class: 'ms-row-main' }, [
        el('span', { class: 'ms-row-top' }, [el('b', { class: 'ms-from', text: t.from.name }), el('small', { class: 'ms-when', text: t.at || '' })]),
        el('span', { class: 'ms-preview', text: preview(t) }),
        t.state && STATE[t.state] ? el('span', { class: 'ms-state', text: STATE[t.state] }) : null
      ]),
      t.unread ? el('span', { class: 'ms-dot', 'aria-label': 'unread' }) : null
    ]))) : el('p', { class: 'app-empty', text: 'No messages.' })
  ]);
}

function act(ctx, thread, state, event, extra = {}) {
  ctx.store.update((s) => {
    const t = s.phone.threads.find((x) => x.id === thread.id);
    if (t) { t.state = state; t.unread = 0; }
    if (state === 'deleted' || state === 'blocked') s.phone.view.messages = { ...(s.phone.view.messages || {}), thread: null };
  }, 'sms-action');
  bus.emit(event, { threadId: thread.id, genuine: !!thread.genuine, channel: 'sms', ...extra });
  audio.play('tap');
}

function conversation(ctx, thread) {
  const { store, bar } = ctx;
  const view = ctx.view('messages');
  const wrap = el('div', { class: 'ms-thread' });

  const toggleDetails = () => {
    const next = !view.details;
    ctx.setView('messages', { details: next });
    if (next) bus.emit('sender:checked', { threadId: thread.id, genuine: !!thread.genuine, channel: 'sms', number: thread.from.number });
  };

  wrap.append(el('header', { class: 'ms-head' }, [
    el('button', { class: 'app-back', type: 'button', 'aria-label': 'All messages', onclick: () => ctx.setView('messages', { thread: null }) }, [icon('back')]),
    el('span', { class: `ms-avatar sm ${thread.from.known ? 'is-known' : ''}`, text: (thread.from.name || '#').replace(/[^A-Za-z0-9]/g, '').slice(0, 1).toUpperCase() || '#' }),
    el('div', { class: 'ms-head-main' }, [
      el('b', { text: thread.from.name }),
      el('small', { text: thread.from.known ? 'Contact' : 'Not in your contacts' })
    ]),
    el('button', { class: `pill ${view.details ? 'is-on' : ''}`, type: 'button', onclick: toggleDetails }, [icon('info'), 'Details'])
  ]));

  if (view.details) {
    wrap.append(el('div', { class: 'ms-details' }, [
      el('div', { class: 'kv' }, [el('span', { text: 'Number' }), el('b', { class: 'mono', text: thread.from.number })]),
      el('div', { class: 'kv' }, [el('span', { text: 'Saved contact' }), el('b', { text: thread.from.known ? 'Yes' : 'No' })]),
      ...(thread.from.details || []).map((d) => el('p', { class: 'ms-note', text: d }))
    ]));
  }

  const body = el('div', { class: 'ms-body' });
  for (const m of thread.messages) {
    const bubble = el('div', { class: `ms-bubble ms-${m.dir || 'in'}` });
    if (m.text) bubble.append(el('span', { class: 'ms-text', text: m.text }));
    if (m.link) {
      bubble.append(el('div', { class: 'ms-link' }, [makeLink({
        href: m.link.href, text: m.link.text || m.link.href, source: `sms:${thread.id}`, bar,
        onOpen: (href) => {
          store.update((s) => { s.phone.app = 'browser'; }, 'sms-link');
          const app = ctx.os.apps.get('browser');
          if (app && app.api) app.api.navigate(href, 'sms');
          bus.emit('link:opened', { href, source: 'sms', threadId: thread.id, genuine: !!thread.genuine });
        }
      })]));
      bubble.append(el('button', {
        class: 'ms-where', type: 'button',
        onclick: () => {
          bus.emit('link:hovered', { href: m.link.href, source: `sms:${thread.id}`, via: 'details' });
          bar.show(m.link.href);
          setTimeout(() => bar.hide(), 6000);
        }
      }, [icon('search'), 'Where does this link go?']));
    }
    if (m.code) bubble.append(el('div', { class: 'ms-code mono', text: m.code }));
    bubble.append(el('small', { class: 'ms-at', text: m.at || '' }));
    body.append(bubble);
  }
  wrap.append(body);
  requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });

  if (thread.state && STATE[thread.state]) wrap.append(el('div', { class: 'ms-done', text: STATE[thread.state] }));

  const replies = (thread.replies || []).filter((r) => !r.used);
  const actions = el('div', { class: 'ms-actions' });
  if (replies.length && thread.state !== 'blocked') {
    actions.append(el('div', { class: 'ms-replies' }, replies.map((r) => el('button', {
      class: 'ms-reply', type: 'button',
      onclick: () => {
        store.update((s) => {
          const t = s.phone.threads.find((x) => x.id === thread.id);
          if (!t) return;
          t.messages.push({ id: `${t.id}-out-${t.messages.length}`, dir: 'out', text: r.text });
          t.replies = (t.replies || []).map((x) => (x.id === r.id ? { ...x, used: true } : x));
          if (r.clearOthers) t.replies = [];
          t.state = t.state === 'reported' ? t.state : 'replied';
        }, 'sms-reply');
        audio.play('message');
        bus.emit('message:replied', { threadId: thread.id, replyId: r.id, kind: r.kind || 'reply', genuine: !!thread.genuine, text: r.text });
      }
    }, [r.text]))));
  }
  if (!thread.noActions) {
    actions.append(el('div', { class: 'ms-tools' }, [
      el('button', { class: 'tool-btn warn', type: 'button', onclick: () => act(ctx, thread, 'reported', 'message:reported') }, [icon('flag'), 'Report spam']),
      el('button', { class: 'tool-btn', type: 'button', onclick: () => act(ctx, thread, 'blocked', 'message:blocked') }, [icon('block'), 'Block']),
      el('button', { class: 'tool-btn', type: 'button', onclick: () => act(ctx, thread, 'deleted', 'message:deleted') }, [icon('bin'), 'Delete'])
    ]));
  }
  wrap.append(actions);
  return wrap;
}
