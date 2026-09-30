import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// Network settings: the office cable, Wi-Fi, and the one switch that matters
// in an emergency. Pulling the network is how you stop ransomware reaching
// the next share; switching the computer off throws away what the
// responders need. Networks in range are scenario data
// (world.office.network.networks), including the evil twin with the café's
// name and no password.
//
// Events: network:viewed, wifi:joined { id, evil, open }, wifi:left { id },
// network:disconnected { how }, network:reconnected { how }.
export function makeNetworkApp() {
  const app = {
    id: 'network', title: 'Network', icon: 'wifi', colour: 'linear-gradient(160deg,#4cc3d9,#1f7f96)', w: 720, h: 580, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-network' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const n = ctx.world.office.network;
      const x = ctx.extra('network');
      if (!changed(node, [n, x])) return;
      const online = n.cable || (n.wifiOn && n.wifi);
      const joined = (n.networks || []).find((q) => q.id === n.wifi);
      node.append(
        head('Network', online ? `Connected${n.cable ? ' by cable' : ''}${joined ? ` · ${joined.ssid}` : ''}` : 'Not connected', [badge(online ? 'Online' : 'Offline', online ? 'good' : 'bad')]),
        el('div', { class: 'ox-page' }, [
          el('ul', { class: 'ox-cards' }, [
            el('li', { class: 'ox-card' }, [
              el('span', { class: 'ox-row-main' }, [el('b', {}, [icon('router'), ' Ethernet (office network)']), el('small', { text: n.cable ? `Connected to ${n.lan || 'Veltrix LAN'} · 10.20.3.71` : n.cableOut ? 'Cable unplugged' : 'Not available' })]),
              n.cable ? btn('Unplug the network cable', () => off(ctx, 'cable'), { warn: true, cls: 'nw-unplug' })
                : n.cableOut ? btn('Plug it back in', () => on(ctx, 'cable')) : null
            ].filter(Boolean)),
            el('li', { class: 'ox-card' }, [
              el('span', { class: 'ox-row-main' }, [el('b', {}, [icon('wifi'), ' Wi-Fi']), el('small', { text: n.wifiOn ? (joined ? `Connected to ${joined.ssid}` : 'On, not connected') : 'Off' })]),
              btn(n.wifiOn ? 'Turn Wi-Fi off' : 'Turn Wi-Fi on', () => (n.wifiOn ? off(ctx, 'wifi') : on(ctx, 'wifi')), { cls: 'nw-wifi' })
            ])
          ]),
          n.wifiOn ? el('h3', { class: 'nw-sec', text: 'Networks in range' }) : null,
          n.wifiOn ? ((n.networks || []).length ? el('ul', { class: 'ox-cards' }, n.networks.map((w) => el('li', { class: 'ox-card', dataset: { wifi: w.id } }, [
            el('span', { class: 'ox-row-main' }, [
              el('b', {}, [icon(w.secured ? 'lock' : 'unlock'), ` ${w.ssid}`]),
              el('small', { text: `${w.secured ? 'Secured, needs the password' : 'Open, no password'} · signal ${'▮'.repeat(w.signal || 3)}${'▯'.repeat(4 - (w.signal || 3))}` }),
              x[`info-${w.id}`] && w.note ? el('small', { class: 'nw-note', text: w.note }) : null
            ].filter(Boolean)),
            el('div', { class: 'ox-actions' }, [
              w.note ? btn('Details', () => { ctx.setExtra('network', { [`info-${w.id}`]: !x[`info-${w.id}`] }); if (!x[`info-${w.id}`]) bus.emit('wifi:inspected', { id: w.id, evil: !!w.evil }); }) : null,
              n.wifi === w.id ? btn('Disconnect', () => leave(ctx, w)) : btn('Join', () => join(ctx, w), { primary: true })
            ].filter(Boolean))
          ]))) : empty('No networks in range.')) : null,
          el('div', { class: 'nw-panic' }, [
            el('p', { class: 'ox-note', text: 'Something spreading from this computer? Take it off the network: unplug the cable and turn Wi-Fi off. Leave it switched on, so the responders can see what it was doing.' }),
            btn('Disconnect from every network', () => off(ctx, 'all'), { warn: true, ic: 'block', cls: 'nw-all' })
          ])
        ].filter(Boolean))
      );
      if (!x.seen) { ctx.setExtra('network', { seen: true }); bus.emit('network:viewed', {}); }
    }
  };

  function off(ctx, how) {
    office(ctx, (o) => {
      const n = o.network;
      if (how === 'cable' || how === 'all') { if (n.cable) n.cableOut = true; n.cable = false; }
      if (how === 'wifi' || how === 'all') { n.wifiOn = false; n.wifi = null; }
    }, 'net-off');
    ctx.store.update((s) => { s.flags['net.off'] = !(s.office.network.cable || (s.office.network.wifiOn && s.office.network.wifi)); }, 'net-flag');
    audio.play('click');
    bus.emit('network:disconnected', { how, offline: !!ctx.store.get().flags['net.off'] });
  }

  function on(ctx, how) {
    office(ctx, (o) => { const n = o.network; if (how === 'cable') { n.cable = true; n.cableOut = false; } if (how === 'wifi') n.wifiOn = true; }, 'net-on');
    ctx.store.update((s) => { s.flags['net.off'] = !(s.office.network.cable || (s.office.network.wifiOn && s.office.network.wifi)); }, 'net-flag');
    bus.emit('network:reconnected', { how });
  }

  function join(ctx, w) {
    office(ctx, (o) => { o.network.wifi = w.id; }, 'wifi-join');
    ctx.store.update((s) => { s.flags['net.off'] = false; }, 'net-flag');
    audio.play('notify');
    bus.emit('wifi:joined', { id: w.id, evil: !!w.evil, open: !w.secured });
    if (w.portal) ctx.open('browser', { url: w.portal, from: 'wifi' });
  }

  function leave(ctx, w) {
    office(ctx, (o) => { o.network.wifi = null; }, 'wifi-leave');
    bus.emit('wifi:left', { id: w.id, evil: !!w.evil });
  }

  return app;
}
