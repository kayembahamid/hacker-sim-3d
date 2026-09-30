import { el, clear } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';
import { qrSvg } from '../../../engine/ui/qr.js';
import { registrableDomain } from '../../../engine/scenario/lookalike.js';

// The phone camera, for QR codes. The codes in view are scenario data
// (world.phone.qr): a poster on the printer, a code in an email. Scanning one
// shows the address first, with the owning domain picked out, before anything
// opens: a QR code is a link you cannot read until you look.
//
// Events: qr:scanned { id, url, genuine }, qr:opened { id, url, genuine },
// qr:closed { id, genuine }.
export function makeCameraApp({ name = 'Camera' } = {}) {
  const app = {
    id: 'camera', name, icon: 'camera', colour: 'linear-gradient(160deg,#4a4f5c,#1d2129)',
    mount(ctx) { const node = el('div', { class: 'app app-camera' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const codes = ctx.world.phone.qr || [];
      const v = ctx.view('camera');
      const key = JSON.stringify([codes, v]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      const cur = codes.find((c) => c.id === v.scan);
      node.append(el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Camera' })]));
      if (!codes.length) {
        node.append(el('div', { class: 'cm-view' }, [el('span', { class: 'cm-frame' }), el('p', { class: 'cm-hint', text: 'No QR code in view.' })]));
        return;
      }
      if (cur) {
        const host = hostOf(cur.url);
        const owner = registrableDomain(host);
        node.append(el('div', { class: 'cm-result' }, [
          el('div', { class: 'cm-shot' }, [qrSvg(cur.url, { size: 120 })]),
          el('p', { class: 'cm-label', text: cur.label }),
          el('div', { class: 'cm-url' }, [el('small', { text: 'This code opens' }), el('b', { class: 'mono' }, [el('span', { class: 'muted', text: `https://${host.slice(0, host.length - owner.length)}` }), el('span', { class: 'cm-owner', text: owner }), el('span', { class: 'muted', text: pathOf(cur.url) })])]),
          el('p', { class: 'cm-note', text: `Owned by ${owner}. Read that part before you open it, the same as any link.` }),
          el('div', { class: 'cm-actions' }, [
            el('button', { class: 'tool-btn', type: 'button', dataset: { qr: 'close' }, onclick: () => { ctx.setView('camera', { scan: null }); bus.emit('qr:closed', { id: cur.id, genuine: !!cur.genuine }); } }, [icon('close'), 'Do not open']),
            el('button', { class: 'tool-btn warn', type: 'button', dataset: { qr: 'open' }, onclick: () => openIt(ctx, cur) }, [icon('external'), 'Open in browser'])
          ])
        ]));
        return;
      }
      node.append(el('div', { class: 'cm-view' }, [
        el('span', { class: 'cm-frame' }),
        el('p', { class: 'cm-hint', text: 'Point at a code to scan it.' })
      ]), el('ul', { class: 'cm-list' }, codes.map((c) => el('li', {}, [el('button', {
        class: 'cm-row', type: 'button', dataset: { scan: c.id },
        onclick: () => {
          audio.play('tap');
          ctx.setView('camera', { scan: c.id });
          bus.emit('qr:scanned', { id: c.id, url: c.url, genuine: !!c.genuine });
        }
      }, [icon('camera'), el('span', { text: `Scan: ${c.label}` })])]))));
    }
  };

  function openIt(ctx, c) {
    ctx.setView('camera', { scan: null });
    ctx.store.update((s) => { s.phone.app = 'browser'; }, 'qr-open');
    const b = ctx.os.apps.get('browser');
    if (b && b.api) b.api.navigate(c.url, 'qr');
    bus.emit('qr:opened', { id: c.id, url: c.url, genuine: !!c.genuine });
  }

  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return ''; } };
  return app;
}
