import { el, clear } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { icon } from '../../../engine/ui/icons.js';

// Two phone apps: Sam's own bank, and work mail on the phone.
//
// The bank app is where a "was this you?" alert gets checked: open the app
// you already have, never the link in the text.
//
// Events: bank:opened, bank:transactionChecked { at, genuine },
// mail:opened / mail:reported (shared with the desktop mail).
const gbp = (n) => `${n < 0 ? '−' : ''}£${Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function makeBankApp({ name = 'Harbour Bank' } = {}) {
  const app = {
    id: 'bank', name, icon: 'bank', colour: 'linear-gradient(160deg,#1d6f8f,#0d3e55)',
    mount(ctx) { const node = el('div', { class: 'app app-bank' }); app.update(ctx, node); bus.emit('bank:opened', {}); return node; },
    update(ctx, node) {
      const b = ctx.world.phone.bank;
      const key = JSON.stringify(b);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      node.append(
        el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: name })]),
        el('div', { class: 'bk-card' }, [el('small', { text: 'Current account · Sam Rivera' }), el('b', { class: 'bk-bal', text: gbp(b.balance || 0) }), el('small', { class: 'mono', text: '20-41-18 · 7713 4471' })]),
        el('h3', { class: 'au-section', text: 'Recent' }),
        el('ul', { class: 'bk-list' }, (b.history || []).map((t) => el('li', {}, [el('button', {
          class: 'bk-row', type: 'button',
          onclick: () => bus.emit('bank:transactionChecked', { at: t.at, what: t.what, genuine: t.genuine !== false })
        }, [el('span', {}, [el('b', { text: t.what }), el('small', { text: t.at })]), el('span', { class: `mono ${t.amount < 0 ? 'bk-out' : 'bk-in'}`, text: gbp(t.amount) })])]))),
        el('p', { class: 'bk-note' }, [icon('shield'), ' Harbour Bank will never call you to move money, or ask for a code from this app.'])
      );
    }
  };
  return app;
}

export function makeMobileMailApp({ name = 'Mail', account = 's.rivera@veltrix-logistics.com' } = {}) {
  const app = {
    id: 'mobilemail', name, icon: 'mail', colour: 'linear-gradient(160deg,#4d9bff,#2a64d8)',
    badge: (world) => (world.desktop.mail.folders.inbox || []).filter((m) => m.unread).length,
    mount(ctx) { const node = el('div', { class: 'app app-mmail' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const v = ctx.view('mobilemail');
      const inbox = ctx.world.desktop.mail.folders.inbox || [];
      const key = JSON.stringify([v, inbox.map((m) => [m.id, m.unread, m.folder])]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      const m = inbox.find((q) => q.id === v.open);
      if (!m) {
        node.append(
          el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Inbox' }), el('small', { class: 'muted', text: account })]),
          inbox.length ? el('ul', { class: 'mm-list' }, inbox.map((q) => el('li', {}, [el('button', {
            class: `mm-row ${q.unread ? 'is-unread' : ''}`, type: 'button',
            onclick: () => {
              ctx.setView('mobilemail', { open: q.id });
              ctx.store.update((s) => { const t = (s.desktop.mail.folders.inbox || []).find((z) => z.id === q.id); if (t) t.unread = false; }, 'mmail-open');
              bus.emit('mail:opened', { id: q.id, genuine: !!q.genuine, device: 'phone' });
            }
          }, [el('b', { text: q.from.name }), el('span', { text: q.subject }), el('small', { text: q.at })])]))) : el('p', { class: 'app-empty', text: 'No mail.' })
        );
        return;
      }
      node.append(
        el('header', { class: 'ct-head' }, [
          el('button', { class: 'app-back', type: 'button', 'aria-label': 'Inbox', onclick: () => ctx.setView('mobilemail', { open: null }) }, [icon('back')]),
          el('b', { text: m.subject })
        ]),
        el('div', { class: 'mm-from' }, [el('b', { text: m.from.name }), el('small', { class: 'mono', text: m.from.address })]),
        m.external ? el('p', { class: 'mm-ext' }, [icon('warning'), ' From outside Veltrix Logistics']) : null,
        el('div', { class: 'mm-body' }, (m.body || []).map((b) => el('p', { text: typeof b === 'string' ? b : (b.text || b.sign || b.small || b.link || '') }))),
        el('p', { class: 'mm-hint', text: 'Links and attachments are easier to check on the computer.' }),
        el('div', { class: 'ct-info-actions' }, [el('button', {
          class: 'tool-btn warn', type: 'button',
          onclick: () => {
            ctx.store.update((s) => {
              const f = s.desktop.mail.folders;
              const i = (f.inbox || []).findIndex((z) => z.id === m.id);
              if (i >= 0) { const [x] = f.inbox.splice(i, 1); x.folder = 'junk'; (f.junk = f.junk || []).unshift(x); }
            }, 'mmail-report');
            ctx.setView('mobilemail', { open: null });
            bus.emit('mail:reported', { id: m.id, genuine: !!m.genuine, channel: 'mail', device: 'phone' });
          }
        }, [icon('flag'), 'Report phishing'])])
      );
    }
  };
  return app;
}
