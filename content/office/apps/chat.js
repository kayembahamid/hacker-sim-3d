import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';
import { makeLink } from '../../../engine/os/link.js';
import { changed, badge } from './kit.js';

// The company chat on the computer: channels and direct messages, the same
// conversations as the chat app on the phone (both read world.phone.chats).
// Guests from outside the company carry an External badge, which is exactly
// what an attacker hopes nobody reads before replying.
//
// Events (shared with the phone): chat:opened, chat:replied, chat:reported,
// chat:info, link:opened.
export function makeTeamChatApp({ title = 'Chat' } = {}) {
  const app = {
    id: 'teamchat', title, icon: 'chat', colour: 'linear-gradient(160deg,#6c7cff,#4453d6)', w: 980, h: 600, pinned: true,
    badge: (world) => world.phone.chats.reduce((n, c) => n + (c.left ? 0 : (c.unread || 0)), 0),
    mount(ctx) { const node = el('div', { class: 'ox-app app-teamchat' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('teamchat');
      const chats = ctx.world.phone.chats.filter((c) => !c.left);
      if (!changed(node, [chats, x])) return;
      const open = chats.find((c) => c.id === x.open);
      const channels = chats.filter((c) => c.channel);
      const dms = chats.filter((c) => !c.channel);
      node.append(
        el('nav', { class: 'tc-side' }, [
          el('b', { class: 'tc-org', text: 'Veltrix Logistics' }),
          el('small', { class: 'tc-sec', text: 'Channels' }),
          ...channels.map((c) => row(ctx, c, open)),
          el('small', { class: 'tc-sec', text: 'Direct messages' }),
          ...dms.map((c) => row(ctx, c, open))
        ]),
        open ? conversation(ctx, open, x) : el('div', { class: 'tc-main is-empty' }, [icon('chat'), el('p', { text: 'Pick a channel or a conversation.' })])
      );
    }
  };

  function row(ctx, c, open) {
    const ext = c.external || (c.members || []).some((m) => m.external);
    return el('button', {
      class: `tc-row ${open && open.id === c.id ? 'is-on' : ''} ${c.unread ? 'is-unread' : ''}`, type: 'button', dataset: { chat: c.id },
      onclick: () => {
        ctx.setExtra('teamchat', { open: c.id, info: false });
        ctx.store.update((s) => { const t = s.phone.chats.find((q) => q.id === c.id); if (t) t.unread = 0; }, 'chat-open');
        bus.emit('chat:opened', { chatId: c.id, genuine: !!c.genuine });
      }
    }, [el('span', { text: c.channel ? c.name : c.name }), ext ? badge('External', 'bad') : null, c.unread ? el('b', { class: 'tc-count', text: String(c.unread) }) : null].filter(Boolean));
  }

  function conversation(ctx, chat, x) {
    const members = chat.members || [];
    const ext = members.filter((m) => m.external);
    const main = el('div', { class: 'tc-main' });
    main.append(el('header', { class: 'tc-head' }, [
      el('div', {}, [el('b', { text: chat.name }), el('small', { text: chat.channel ? `${members.length} members` : (members.find((m) => m.id !== 'me') || {}).handle || '' })]),
      el('div', { class: 'tc-head-actions' }, [
        el('button', { class: `tb-btn ${x.info ? 'is-on' : ''}`, type: 'button', onclick: () => { ctx.setExtra('teamchat', { info: !x.info }); if (!x.info) bus.emit('chat:info', { chatId: chat.id }); } }, [icon('info'), 'Details']),
        el('button', { class: 'tb-btn warn', type: 'button', onclick: () => {
          ctx.store.update((s) => { const c = s.phone.chats.find((q) => q.id === chat.id); if (c) c.reported = true; }, 'chat-report');
          bus.emit('chat:reported', { chatId: chat.id, genuine: !!chat.genuine });
          ctx.toast({ app: 'teamchat', title: 'Reported', body: 'Security will review this conversation.' });
        } }, [icon('flag'), chat.reported ? 'Reported' : 'Report'])
      ])
    ]));
    if (ext.length) main.append(el('div', { class: 'tc-external' }, [icon('warning'), el('span', { text: `${ext.map((m) => m.name).join(', ')} ${ext.length > 1 ? 'are' : 'is'} from outside Veltrix Logistics.` })]));
    if (x.info) {
      main.append(el('ul', { class: 'tc-members' }, members.map((m) => el('li', {}, [
        el('b', { text: m.name }), el('small', { class: 'mono', text: m.handle || '' }), m.external ? badge('External guest', 'bad') : badge('Veltrix', 'good'), m.note ? el('small', { text: m.note }) : null
      ].filter(Boolean)))));
    }
    const body = el('div', { class: 'tc-body' });
    for (const m of chat.messages) {
      if (m.from === 'system') { body.append(el('p', { class: 'tc-system', text: m.text })); continue; }
      const who = members.find((q) => q.id === m.from) || {};
      const mine = m.from === 'me';
      body.append(el('div', { class: `tc-msg ${mine ? 'is-me' : ''}` }, [
        el('span', { class: 'tc-avatar', style: { background: who.colour || '#3a4150' }, text: (m.fromName || m.from || '?')[0].toUpperCase() }),
        el('div', {}, [
          el('div', { class: 'tc-meta' }, [el('b', { text: mine ? 'You' : (m.fromName || who.name || m.from) }), who.external ? badge('External', 'bad') : null, el('small', { text: m.at || '' })].filter(Boolean)),
          m.text ? el('p', { text: m.text }) : null,
          m.link ? el('p', {}, [makeLink({ href: m.link.href, text: m.link.text || m.link.href, source: `chat:${chat.id}`, bar: ctx.bar, onOpen: (href) => {
            bus.emit('link:opened', { href, source: 'chat', chatId: chat.id, genuine: !!chat.genuine });
            ctx.open('browser', { url: href, from: 'chat' });
          } })]) : null
        ].filter(Boolean))
      ]));
    }
    main.append(body);
    requestAnimationFrame(() => { body.scrollTop = body.scrollHeight; });
    const replies = (chat.replies || []).filter((r) => !r.used);
    if (replies.length) {
      main.append(el('div', { class: 'tc-replies' }, replies.map((r) => el('button', {
        class: 'ms-reply', type: 'button', dataset: { reply: r.id },
        onclick: () => {
          ctx.store.update((s) => {
            const c = s.phone.chats.find((q) => q.id === chat.id);
            if (!c) return;
            c.messages.push({ id: `${c.id}-me-${c.messages.length}`, from: 'me', text: r.text });
            c.replies = r.clearOthers ? [] : (c.replies || []).map((q) => (q.id === r.id ? { ...q, used: true } : q));
          }, 'chat-reply');
          audio.play('message');
          bus.emit('chat:replied', { chatId: chat.id, replyId: r.id, kind: r.kind || 'reply', genuine: !!chat.genuine });
        }
      }, [r.text]))));
    }
    return main;
  }

  return app;
}
