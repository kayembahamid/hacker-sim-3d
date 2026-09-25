import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { runActions } from '../../../engine/scenario/actions.js';
import { store } from '../../../engine/core/store.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// Filebridge (the cloud file share), the VPN client and the endpoint security
// panel.
//
// Events: share:linkChanged { id, from, to, risky }, share:opened { id },
// vpn:connecting { number }, vpn:connected, vpn:disconnected,
// endpoint:viewed { alerts }, endpoint:alertOpened { id, level }.
export function makeShareApp() {
  const app = {
    id: 'share', title: 'Filebridge', icon: 'cloud', colour: 'linear-gradient(160deg,#63a4ff,#2c6fd6)', w: 900, h: 560, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-share' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const sh = ctx.world.office.share;
      if (!changed(node, sh)) return;
      node.append(
        head('Filebridge', 'Files shared by and with Veltrix Logistics'),
        el('p', { class: 'ox-note', text: '“Anyone with the link” means anyone at all: whoever the link is forwarded to, and whoever finds it in an inbox that is not yours.' }),
        sh.files.length ? el('ul', { class: 'ox-cards' }, sh.files.map((f) => el('li', { class: `ox-card ${f.link.type === 'anyone' ? 'is-bad' : ''}`, dataset: { share: f.id } }, [
          el('span', { class: 'ox-row-main' }, [el('b', { text: f.name }), el('small', { text: `Owner: ${f.owner}` }), el('small', { text: `Link: ${f.link.label}` })]),
          f.owner === 'Sam Rivera' ? el('div', { class: 'ox-actions' }, ['anyone', 'people', 'off'].map((t) => btn({ anyone: 'Anyone', people: 'Veltrix only', off: 'Stop sharing' }[t], () => {
            office(ctx, (o) => { const x = o.share.files.find((q) => q.id === f.id); if (x) x.link = { type: t, label: { anyone: 'Anyone with the link, no sign in', people: 'People in Veltrix Logistics with the link', off: 'Not shared' }[t] }; }, 'share-link');
            bus.emit('share:linkChanged', { id: f.id, from: f.link.type, to: t, risky: !!f.risky });
          }, { primary: f.link.type === t, disabled: f.link.type === t }))) : badge('Shared with you')
        ]))) : empty('Nothing shared.')
      );
    }
  };
  return app;
}

export function makeVpnApp() {
  const app = {
    id: 'vpn', title: 'VPN', icon: 'vpn', colour: 'linear-gradient(160deg,#3ecf8e,#1a8058)', w: 520, h: 460, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-vpn' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const v = ctx.world.office.vpn;
      if (!changed(node, v)) return;
      node.append(
        head('Veltrix VPN', v.server),
        el('div', { class: `vpn-state is-${v.state || (v.connected ? 'on' : 'off')}` }, [
          icon(v.connected ? 'lock' : 'unlock'),
          el('b', { text: v.connected ? 'Connected' : v.state === 'waiting' ? 'Waiting for you to approve on your phone' : 'Not connected' }),
          v.state === 'waiting' ? el('p', {}, ['Your authenticator will ask you to confirm. The number to tap is ', el('b', { class: 'vpn-number mono', text: String(v.number) })]) : null
        ].filter(Boolean)),
        v.connected ? btn('Disconnect', () => { office(ctx, (o) => { o.vpn.connected = false; o.vpn.state = 'off'; }, 'vpn-off'); bus.emit('vpn:disconnected', {}); })
          : v.state === 'waiting' ? null : btn('Connect', () => connect(ctx), { primary: true, ic: 'vpn' })
      );
    }
  };

  function connect(ctx) {
    const number = 10 + Math.floor(Math.random() * 89);
    const choices = [number, (number + 23) % 89 + 10, (number + 51) % 89 + 10].sort(() => Math.random() - 0.5);
    const id = `push-vpn-${Date.now()}`;
    office(ctx, (o) => { o.vpn.state = 'waiting'; o.vpn.number = number; o.vpn.pushId = id; }, 'vpn-wait');
    bus.emit('vpn:connecting', { number });
    runActions([{ do: 'push.prompt', id, service: 'Veltrix VPN', account: 's.rivera', location: 'Leeds, UK (this computer)', device: 'VLX-PC-4471', number, choices, genuine: true }], { store: ctx.store, product: ctx.product });
  }

  // The phone tells us what happened to the prompt.
  bus.on('push:approved', (p) => resolveVpn(p, true));
  bus.on('push:denied', (p) => resolveVpn(p, false));
  function resolveVpn(p, ok) {
    const s = store.get();
    if (!s.office || !s.office.vpn.pushId || s.office.vpn.pushId !== p.id) return;
    const good = ok && p.correct !== false;
    store.update((w) => { w.office.vpn.state = good ? 'on' : 'off'; w.office.vpn.connected = good; w.office.vpn.pushId = null; }, 'vpn-result');
    if (good) bus.emit('vpn:connected', {});
  }
  return app;
}

export function makeEndpointApp() {
  const app = {
    id: 'endpoint', title: 'Endpoint security', icon: 'scan', colour: 'linear-gradient(160deg,#ff7a6b,#c2382b)', w: 860, h: 540, pinned: false,
    badge: (world) => world.office && world.office.endpoint.alerts.filter((a) => a.status === 'New').length,
    mount(ctx) { const node = el('div', { class: 'ox-app app-endpoint' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('endpoint');
      const ep = ctx.world.office.endpoint;
      if (!changed(node, [ep, x])) return;
      const open = ep.alerts.find((a) => a.id === x.open);
      node.append(
        head('Endpoint security', 'Protection on this computer and alerts across the team', [badge(ep.alerts.some((a) => a.status === 'New' && a.level === 'high') ? 'Action needed' : 'Protected', ep.alerts.some((a) => a.status === 'New' && a.level === 'high') ? 'bad' : 'good')]),
        ep.alerts.length ? el('div', { class: 'ox-split' }, [
          el('ul', { class: 'ox-list' }, ep.alerts.map((a) => el('li', {}, [el('button', {
            class: `ox-row ${open && open.id === a.id ? 'is-on' : ''}`, type: 'button', dataset: { alert: a.id },
            onclick: () => { ctx.setExtra('endpoint', { open: a.id }); bus.emit('endpoint:alertOpened', { id: a.id, level: a.level }); }
          }, [el('span', { class: 'ox-row-main' }, [el('b', { text: a.what }), el('small', { text: `${a.device} · ${a.at}` })]), badge(a.level, a.level === 'high' ? 'bad' : a.level === 'medium' ? 'warn' : '')])]))),
          open ? el('div', { class: 'ox-detail' }, [
            el('h3', { text: open.what }),
            el('div', { class: 'kv' }, [el('span', { text: 'Device' }), el('b', { text: open.device })]),
            el('div', { class: 'kv' }, [el('span', { text: 'When' }), el('b', { text: open.at })]),
            el('div', { class: 'kv' }, [el('span', { text: 'Status' }), el('b', { text: open.status })]),
            ...(open.details || []).map((d) => el('p', { class: 'ox-note', text: d }))
          ]) : el('div', { class: 'ox-detail is-empty' }, [el('p', { text: 'Pick an alert.' })])
        ]) : empty('No alerts.')
      );
      if (!x.seen) { ctx.setExtra('endpoint', { seen: true }); bus.emit('endpoint:viewed', { alerts: ep.alerts.length }); }
    }
  };
  return app;
}
