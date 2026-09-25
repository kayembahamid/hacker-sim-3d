import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';
import { makeLink } from '../../link.js';

// The messaging app: group chats and direct messages. Group info lists every
// member and who added them, which is where a stranger in a group chat shows
// up. "Call" rings the contact's real number, which is how you check a
// message that claims to be from a friend.
export function makeChatApp({ name = 'Chat', colour = 'linear-gradient(160deg,#8b6cff,#5a3fd6)', id = 'chat' } = {}) {
  const app = {
    id, name, icon: 'chat', colour, dock: true,
    badge: (world) => world.phone.chats.reduce((n, c) => n + (c.left ? 0 : (c.unread || 0)), 0),
    mount(ctx) { const node = el('div', { class: 'app app-chat' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      clear(node);
      const v = ctx.view(id);
      const chat = ctx.world.phone.chats.find((c) => c.id === v.chat && !c.left);
      if (!chat) { node.append(list(ctx)); return; }
      node.append(v.info ? info(ctx, chat) : conversation(ctx, chat));
    }
  };

  const initials = (s) => (s || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '#';

  function open(ctx, chat) {
    ctx.store.update((s) => {
      s.phone.view[id] = { chat: chat.id, info: false };
      const c = s.phone.chats.find((x) => x.id === chat.id);
      if (c) c.unread = 0;
    }, 'chat-open');
    bus.emit('chat:opened', { chatId: chat.id, genuine: !!chat.genuine });
    audio.play('tap');
  }

  function list(ctx) {
    const chats = ctx.world.phone.chats.filter((c) => !c.left);
    return el('div', { class: 'ct-list' }, [
      el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: name })]),
      chats.length ? el('div', { class: 'ct-rows' }, chats.map((c) => {
        const last = c.messages[c.messages.length - 1];
        return el('button', { class: `ct-row ${c.unread ? 'is-unread' : ''}`, type: 'button', dataset: { chat: c.id }, onclick: () => open(ctx, c) }, [
          el('span', { class: `ct-avatar ${c.group ? 'is-group' : ''}`, style: { background: c.colour || '#3a3f5c' }, text: c.group ? '' : initials(c.name) }, c.group ? [icon('users')] : []),
          el('span', { class: 'ct-main' }, [
            el('span', { class: 'ct-top' }, [el('b', { text: c.name }), el('small', { text: last ? last.at : '' })]),
            el('span', { class: 'ct-preview', text: last ? (last.from === 'me' ? `You: ${last.text}` : last.from === 'system' ? last.text : `${c.group ? `${last.fromName || last.from}: ` : ''}${last.text}`) : '' })
          ]),
          c.unread ? el('span', { class: 'ct-badge', text: String(c.unread) }) : null
        ]);
      })) : el('p', { class: 'app-empty', text: 'No chats yet.' })
    ]);
  }

  function conversation(ctx, chat) {
    const wrap = el('div', { class: 'ct-thread' });
    const members = chat.members || [];
    wrap.append(el('header', { class: 'ct-head' }, [
      el('button', { class: 'app-back', type: 'button', 'aria-label': 'All chats', onclick: () => ctx.setView(id, { chat: null }) }, [icon('back')]),
      el('button', { class: 'ct-head-main', type: 'button', onclick: () => { ctx.setView(id, { info: true }); bus.emit('chat:info', { chatId: chat.id }); } }, [
        el('span', { class: `ct-avatar sm ${chat.group ? 'is-group' : ''}`, style: { background: chat.colour || '#3a3f5c' }, text: chat.group ? '' : initials(chat.name) }, chat.group ? [icon('users')] : []),
        el('span', {}, [el('b', { text: chat.name }), el('small', { text: chat.group ? `${members.length} members · tap for info` : (chat.handle || 'tap for info') })])
      ]),
      !chat.group && chat.callable !== false ? el('button', {
        class: 'icon-btn', type: 'button', 'aria-label': `Call ${chat.name}`,
        onclick: () => bus.emit('chat:call', { chatId: chat.id, contact: chat.contact || chat.id })
      }, [icon('phone')]) : null
    ]));

    const body = el('div', { class: 'ct-body' });
    let prevFrom = null;
    for (const m of chat.messages) {
      if (m.from === 'system') {
        body.append(el('div', { class: 'ct-system', text: m.text }));
        prevFrom = null;
        continue;
      }
      const mine = m.from === 'me';
      const b = el('div', { class: `ct-bubble ${mine ? 'is-me' : ''}` });
      if (chat.group && !mine && prevFrom !== m.from) b.append(el('b', { class: 'ct-sender', text: m.fromName || m.from }));
      if (m.imageSrc) b.append(el('img', { class: 'ct-photo', src: `${import.meta.env.BASE_URL}${m.imageSrc}`, alt: m.image || 'photo' }));
      else if (m.image) b.append(el('div', { class: 'ct-image' }, [icon('image'), el('span', { text: m.image })]));
      if (m.text) b.append(el('span', { text: m.text }));
      if (m.link) b.append(el('div', {}, [makeLink({ href: m.link.href, text: m.link.text || m.link.href, source: `chat:${chat.id}`, bar: ctx.bar, onOpen: (href) => {
        ctx.store.update((s) => { s.phone.app = 'browser'; }, 'chat-link');
        const br = ctx.os.apps.get('browser');
        if (br && br.api) br.api.navigate(href, 'chat');
        bus.emit('link:opened', { href, source: 'chat', chatId: chat.id, genuine: !!chat.genuine });
      } })]));
      if (m.code) b.append(el('div', { class: 'ms-code mono', text: m.code }));
      b.append(el('small', { class: 'ct-at', text: m.at || '' }));
      body.append(b);
      prevFrom = m.from;
    }
    wrap.append(body);
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });

    const replies = (chat.replies || []).filter((r) => !r.used);
    if (replies.length) {
      wrap.append(el('div', { class: 'ct-replies' }, replies.map((r) => el('button', {
        class: 'ms-reply', type: 'button',
        onclick: () => {
          ctx.store.update((s) => {
            const c = s.phone.chats.find((x) => x.id === chat.id);
            if (!c) return;
            c.messages.push({ id: `${c.id}-me-${c.messages.length}`, from: 'me', text: r.text });
            c.replies = r.clearOthers ? [] : (c.replies || []).map((x) => (x.id === r.id ? { ...x, used: true } : x));
          }, 'chat-reply');
          audio.play('message');
          bus.emit('chat:replied', { chatId: chat.id, replyId: r.id, kind: r.kind || 'reply', genuine: !!chat.genuine });
        }
      }, [r.text]))));
    }
    return wrap;
  }

  function info(ctx, chat) {
    const members = chat.members || [];
    return el('div', { class: 'ct-info' }, [
      el('header', { class: 'ct-head' }, [
        el('button', { class: 'app-back', type: 'button', 'aria-label': 'Back to chat', onclick: () => ctx.setView(id, { info: false }) }, [icon('back')]),
        el('div', { class: 'ct-head-main' }, [el('b', { text: chat.group ? 'Group info' : 'Contact info' })])
      ]),
      el('div', { class: 'ct-info-top' }, [
        el('span', { class: `ct-avatar lg ${chat.group ? 'is-group' : ''}`, style: { background: chat.colour || '#3a3f5c' }, text: chat.group ? '' : initials(chat.name) }, chat.group ? [icon('users')] : []),
        el('h2', { text: chat.name }),
        chat.created ? el('p', { class: 'muted', text: chat.created }) : null,
        chat.handle ? el('p', { class: 'muted mono', text: chat.handle }) : null
      ]),
      members.length ? el('h3', { class: 'ct-section', text: `${members.length} members` }) : null,
      el('ul', { class: 'ct-members' }, members.map((m) => el('li', { class: m.known ? '' : 'is-unknown' }, [
        el('span', { class: 'ct-avatar sm', style: { background: m.colour || '#3a3f5c' }, text: initials(m.name) }),
        el('span', { class: 'ctm-main' }, [el('b', { text: m.name }), el('small', { class: 'mono', text: m.handle || '' }), m.note ? el('small', { text: m.note }) : null]),
        m.known ? null : el('span', { class: 'tag warn', text: 'Not a contact' })
      ]))),
      el('div', { class: 'ct-info-actions' }, [
        el('button', { class: 'tool-btn warn', type: 'button', onclick: () => {
          ctx.store.update((s) => { const c = s.phone.chats.find((x) => x.id === chat.id); if (c) c.reported = true; }, 'chat-report');
          bus.emit('chat:reported', { chatId: chat.id, genuine: !!chat.genuine });
        } }, [icon('flag'), chat.reported ? 'Reported' : 'Report']),
        chat.group ? el('button', { class: 'tool-btn', type: 'button', onclick: () => {
          ctx.store.update((s) => { const c = s.phone.chats.find((x) => x.id === chat.id); if (c) c.left = true; s.phone.view[id] = { chat: null }; }, 'chat-leave');
          bus.emit('chat:left', { chatId: chat.id, genuine: !!chat.genuine });
        } }, [icon('external'), 'Leave group']) : el('button', { class: 'tool-btn', type: 'button', onclick: () => {
          ctx.store.update((s) => { const c = s.phone.chats.find((x) => x.id === chat.id); if (c) c.blocked = true; }, 'chat-block');
          bus.emit('chat:blocked', { chatId: chat.id, genuine: !!chat.genuine });
        } }, [icon('block'), chat.blocked ? 'Blocked' : 'Block'])
      ])
    ]);
  }

  return app;
}
