import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';
import { makeLink } from '../../link.js';
import { qrSvg } from '../../../ui/qr.js';

// Mail. The reading pane shows the display name, which anyone can set to
// anything; the real address is one click (or hover) away, and so is a
// Reply-To that quietly points somewhere else. "View original" shows the full
// headers, with the SPF, DKIM and DMARC results explained in plain words.
//
// mail: { id, from: { name, address }, replyTo, to, subject, at, date,
//   body: [string | { link, text } | { button, href }], attachments: [{ name,
//   size, file }], headers: { ... }, raw, genuine, external, replies: [...] }
export function makeMailApp({ title = 'Mail', account = 'me@example.com', reportLabel = 'Report phishing', showExternal = false } = {}) {
  const app = {
    id: 'mail', title, icon: 'mail', colour: 'linear-gradient(160deg,#4d9bff,#2a64d8)', w: 1060, h: 640, pinned: true,
    badge: (world) => (world.desktop.mail.folders.inbox || []).filter((m) => m.unread).length,
    mount(ctx) { const node = el('div', { class: 'app-mail' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const key = JSON.stringify([ctx.world.desktop.mail, ctx.extra('mail')]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      node.append(folders(ctx), list(ctx), reader(ctx));
    }
  };

  const FOLDERS = [['inbox', 'Inbox', 'mail'], ['junk', 'Junk', 'warning'], ['sent', 'Sent', 'upload'], ['deleted', 'Deleted', 'bin']];

  function all(ctx) {
    const f = ctx.world.desktop.mail.folders;
    return Object.values(f).flat();
  }

  function find(ctx, id) { return all(ctx).find((m) => m.id === id); }

  function move(ctx, id, to, event) {
    const m = find(ctx, id);
    ctx.store.update((s) => {
      const f = s.desktop.mail.folders;
      for (const k of Object.keys(f)) {
        const i = f[k].findIndex((x) => x.id === id);
        if (i >= 0) { const [mail] = f[k].splice(i, 1); mail.folder = to; (f[to] = f[to] || []).unshift(mail); break; }
      }
      s.desktop.mail.open = null;
    }, 'mail-move');
    if (event) bus.emit(event, { id, genuine: !!(m && m.genuine), channel: 'mail' });
    audio.play('click');
  }

  function folders(ctx) {
    const cur = ctx.world.desktop.mail.folder;
    const f = ctx.world.desktop.mail.folders;
    return el('nav', { class: 'ml-folders' }, [
      el('div', { class: 'ml-account' }, [el('b', { text: title }), el('small', { text: account })]),
      ...FOLDERS.map(([id, label, ic]) => {
        const unread = (f[id] || []).filter((m) => m.unread).length;
        return el('button', { class: `ml-folder ${cur === id ? 'is-on' : ''}`, type: 'button', onclick: () => ctx.store.update((s) => { s.desktop.mail.folder = id; s.desktop.mail.open = null; }, 'mail-folder') }, [
          icon(ic), el('span', { text: label }), unread ? el('b', { class: 'ml-count', text: String(unread) }) : null
        ]);
      })
    ]);
  }

  function list(ctx) {
    const cur = ctx.world.desktop.mail.folder;
    const mails = ctx.world.desktop.mail.folders[cur] || [];
    const openId = ctx.world.desktop.mail.open;
    return el('div', { class: 'ml-list' }, [
      el('div', { class: 'ml-list-head' }, [el('b', { text: FOLDERS.find((f) => f[0] === cur)[1] }), el('small', { text: `${mails.length} messages` })]),
      mails.length ? el('div', { class: 'ml-rows' }, mails.map((m) => el('button', {
        class: `ml-row ${m.unread ? 'is-unread' : ''} ${openId === m.id ? 'is-on' : ''}`, type: 'button', dataset: { mail: m.id },
        onclick: () => {
          ctx.store.update((s) => {
            s.desktop.mail.open = m.id;
            const x = Object.values(s.desktop.mail.folders).flat().find((q) => q.id === m.id);
            if (x) x.unread = false;
          }, 'mail-open');
          ctx.setExtra('mail', { details: false, source: false });
          bus.emit('mail:opened', { id: m.id, genuine: !!m.genuine });
        }
      }, [
        el('span', { class: 'ml-row-top' }, [el('b', { class: 'ml-from', text: m.from.name }), el('small', { text: m.at })]),
        el('span', { class: 'ml-subject', text: m.subject }),
        el('span', { class: 'ml-preview', text: typeof m.body[0] === 'string' ? m.body[0] : '' }),
        m.attachments && m.attachments.length ? el('span', { class: 'ml-clip' }, [icon('link')]) : null
      ]))) : el('p', { class: 'app-empty', text: 'Nothing here.' })
    ]);
  }

  function reader(ctx) {
    const m = find(ctx, ctx.world.desktop.mail.open);
    if (!m) return el('div', { class: 'ml-reader is-empty' }, [icon('mail'), el('p', { text: 'Pick a message to read it.' })]);
    const x = ctx.extra('mail');
    const toggleDetails = () => {
      ctx.setExtra('mail', { details: !x.details });
      if (!x.details) bus.emit('sender:checked', { id: m.id, genuine: !!m.genuine, channel: 'mail', address: m.from.address });
    };
    const hoverAddress = el('span', { class: 'ml-addr-hover', text: `<${m.from.address}>` });
    const senderName = el('button', {
      class: 'ml-sender-name', type: 'button', onclick: toggleDetails,
      onpointerenter: () => { hoverAddress.classList.add('is-on'); bus.emit('sender:hovered', { id: m.id, genuine: !!m.genuine }); },
      onpointerleave: () => hoverAddress.classList.remove('is-on')
    }, [m.from.name]);

    const toolbar = el('div', { class: 'ml-toolbar' }, [
      ...(m.replies || []).map((r) => el('button', { class: 'tb-btn', type: 'button', onclick: () => {
        ctx.store.update((s) => {
          const sent = s.desktop.mail.folders.sent = s.desktop.mail.folders.sent || [];
          sent.unshift({ id: `re-${m.id}-${r.id}`, from: { name: 'Me', address: account }, to: r.to || m.replyTo || m.from.address, subject: `${r.forward ? 'Fw' : 'Re'}: ${m.subject}`, at: m.at, body: [r.text], genuine: true, unread: false, folder: 'sent' });
        }, 'mail-reply');
        audio.play('mail');
        bus.emit(r.forward ? 'mail:forwarded' : 'mail:replied', { id: m.id, reply: r.id, kind: r.kind || 'reply', to: r.to || m.replyTo || m.from.address, genuine: !!m.genuine });
        ctx.toast({ app: 'mail', title: 'Sent', body: `To ${r.to || m.replyTo || m.from.address}` });
      } }, [icon(r.forward ? 'forwardMail' : 'reply'), r.label])),
      el('span', { class: 'tb-sep' }),
      el('button', { class: 'tb-btn warn', type: 'button', onclick: () => move(ctx, m.id, 'junk', 'mail:reported') }, [icon('flag'), reportLabel]),
      el('button', { class: 'tb-btn', type: 'button', onclick: () => move(ctx, m.id, 'junk', 'mail:junked') }, [icon('warning'), 'Junk']),
      el('button', { class: 'tb-btn', type: 'button', onclick: () => move(ctx, m.id, 'deleted', 'mail:deleted') }, [icon('bin'), 'Delete']),
      el('button', { class: `tb-btn ${x.source ? 'is-on' : ''}`, type: 'button', onclick: () => {
        ctx.setExtra('mail', { source: !x.source });
        if (!x.source) bus.emit('headers:viewed', { id: m.id, genuine: !!m.genuine });
      } }, [icon('code'), 'View original'])
    ]);

    if (x.source) return el('div', { class: 'ml-reader' }, [toolbar, headersView(m)]);

    const replyDiffers = m.replyTo && m.replyTo !== m.from.address;
    return el('div', { class: 'ml-reader' }, [
      toolbar,
      el('h2', { class: 'ml-subj', text: m.subject }),
      showExternal && m.external ? el('div', { class: 'ml-external' }, [icon('warning'), el('span', { text: 'This message came from outside the organisation. Be careful with links, attachments and requests for payment.' })]) : null,
      el('div', { class: 'ml-sender' }, [
        el('span', { class: 'ml-avatar', text: m.from.name[0] }),
        el('div', { class: 'ml-sender-main' }, [
          el('div', {}, [senderName, hoverAddress]),
          el('small', { text: `To: ${m.to || account} · ${m.date || m.at}` })
        ]),
        el('button', { class: `pill ${x.details ? 'is-on' : ''}`, type: 'button', onclick: toggleDetails }, [icon('info'), 'Details'])
      ]),
      x.details ? el('div', { class: 'ml-details' }, [
        el('div', { class: 'kv' }, [el('span', { text: 'From' }), el('b', { class: 'mono', text: m.from.address })]),
        el('div', { class: `kv ${replyDiffers ? 'is-warn' : ''}` }, [el('span', { text: 'Reply goes to' }), el('b', { class: 'mono', text: m.replyTo || m.from.address })]),
        replyDiffers ? el('p', { class: 'ml-note warn', text: 'Replies to this message go to a different address from the one it came from.' }) : null,
        el('div', { class: 'kv' }, [el('span', { text: 'To' }), el('b', { class: 'mono', text: m.to || account })])
      ]) : null,
      el('div', { class: 'ml-body' }, (m.body || []).map((b) => bodyBlock(ctx, m, b))),
      m.attachments && m.attachments.length ? el('div', { class: 'ml-attachments' }, m.attachments.map((a) => el('button', {
        class: 'ml-attach', type: 'button', title: a.name,
        onclick: () => {
          ctx.store.update((s) => {
            const f = { id: a.file || `att-${m.id}-${a.name}`, name: a.name, size: a.size, folder: 'Downloads', from: `email from ${m.from.address}`, ...(a.props || {}) };
            if (!s.desktop.files.find((q) => q.id === f.id)) s.desktop.files.unshift(f);
          }, 'attach-save');
          bus.emit('attachment:downloaded', { id: m.id, name: a.name, genuine: !!m.genuine });
          ctx.toast({ app: 'files', title: 'Saved to Downloads', body: a.name });
        }
      }, [icon('file'), el('span', { class: 'ml-attach-name', text: a.name }), el('small', { text: a.size || '' })]))) : null
    ]);
  }

  function bodyBlock(ctx, m, b) {
    if (typeof b === 'string') return el('p', { text: b });
    if (b.link || b.button) {
      const href = b.link || b.href;
      const a = makeLink({
        href, text: b.text || href, source: `mail:${m.id}`, bar: ctx.bar, className: b.button ? 'ml-button' : '',
        onOpen: (h) => {
          bus.emit('link:opened', { href: h, source: 'mail', mailId: m.id, genuine: !!m.genuine });
          ctx.open('browser', { url: h, from: 'mail' });
        }
      });
      return el('p', {}, [a]);
    }
    // A QR code: a picture only. Mail cannot follow it, which is exactly why
    // it slips past link scanners; the phone's Camera reads it (scenario data).
    if (b.qr) return el('figure', { class: 'ml-qr' }, [qrSvg(b.qr), b.caption ? el('figcaption', { text: b.caption }) : null].filter(Boolean));
    if (b.sign) return el('p', { class: 'ml-sign', text: b.sign });
    if (b.small) return el('p', { class: 'ml-small', text: b.small });
    return el('p', { text: b.text || '' });
  }

  function headersView(m) {
    const h = m.headers || {};
    const verdict = (r) => el('span', { class: `auth-${r.result}`, text: r.result.toUpperCase() });
    return el('div', { class: 'ml-source' }, [
      el('h3', { text: 'The original message' }),
      el('p', { class: 'muted', text: 'Every email carries a record of where it really came from. The three checks below are done by the receiving mail server.' }),
      h.spf ? el('div', { class: 'auth-row' }, [el('b', { text: 'SPF' }), verdict(h.spf), el('span', { text: h.spf.explain })]) : null,
      h.dkim ? el('div', { class: 'auth-row' }, [el('b', { text: 'DKIM' }), verdict(h.dkim), el('span', { text: h.dkim.explain })]) : null,
      h.dmarc ? el('div', { class: 'auth-row' }, [el('b', { text: 'DMARC' }), verdict(h.dmarc), el('span', { text: h.dmarc.explain })]) : null,
      h.returnPath ? el('div', { class: 'kv' }, [el('span', { text: 'Return path' }), el('b', { class: 'mono', text: h.returnPath })]) : null,
      h.summary ? el('p', { class: 'ml-note', text: h.summary }) : null,
      el('details', { class: 'ml-raw', open: m.rawOpen ? '' : null }, [
        el('summary', { text: 'Raw headers' }),
        el('pre', { class: 'mono', text: m.raw || rawFrom(m) })
      ])
    ]);
  }

  function rawFrom(m) {
    const h = m.headers || {};
    const lines = [];
    for (const r of h.received || []) lines.push(`Received: ${r}`);
    if (h.returnPath) lines.push(`Return-Path: <${h.returnPath}>`);
    if (h.spf) lines.push(`Received-SPF: ${h.spf.result} (${h.spf.detail || ''})`);
    lines.push(`Authentication-Results: mx.local; spf=${h.spf ? h.spf.result : 'none'}; dkim=${h.dkim ? h.dkim.result : 'none'}; dmarc=${h.dmarc ? h.dmarc.result : 'none'}`);
    lines.push(`From: "${m.from.name}" <${m.from.address}>`);
    if (m.replyTo) lines.push(`Reply-To: <${m.replyTo}>`);
    lines.push(`To: ${m.to || account}`);
    lines.push(`Subject: ${m.subject}`);
    lines.push(`Date: ${m.date || m.at}`);
    if (h.messageId) lines.push(`Message-ID: <${h.messageId}>`);
    return lines.join('\n');
  }

  return app;
}
