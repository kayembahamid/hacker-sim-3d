import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';
import { totp } from '../../phone/apps/authenticator.js';

// Account security for every account the player looks after: two step sign
// in, the devices signed in right now (and where), the recovery email, the
// password, and for work accounts the quiet places attackers hide: mailbox
// forwarding rules, apps granted access, and the sign in history.
//
// service: { id, name, domain, twoStep, sessions: [{ id, device, place, ip,
//   when, current, suspicious }], recovery, recoveryOptions: [], password: {
//   age, strong }, rules: [], apps: [], signins: [] }
const TABS = [['security', 'Security'], ['devices', 'Devices'], ['recovery', 'Recovery'], ['rules', 'Mail rules'], ['apps', 'Connected apps'], ['signins', 'Sign in history']];

export function makeAccountApp({ title = 'Settings', tabs = ['security', 'devices', 'recovery'] } = {}) {
  const app = {
    id: 'settings', title, icon: 'settings', colour: 'linear-gradient(160deg,#7d8799,#495365)', w: 900, h: 580, pinned: true,
    mount(ctx) { const node = el('div', { class: 'app-account' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const key = JSON.stringify([ctx.world.desktop.account, ctx.extra('account'), ctx.world.phone.codes.length]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      const acc = ctx.world.desktop.account;
      const ids = Object.keys(acc.services);
      const x = ctx.extra('account');
      const sid = x.service || acc.active || ids[0];
      const svc = acc.services[sid];
      const tab = x.tab || 'security';
      node.append(
        el('nav', { class: 'ac-side' }, [
          el('h3', { text: 'Accounts' }),
          ...ids.map((id) => el('button', { class: `ac-svc ${id === sid ? 'is-on' : ''}`, type: 'button', dataset: { svc: id }, onclick: () => ctx.setExtra('account', { service: id, tab: 'security' }) }, [
            el('span', { class: 'ac-svc-ico', text: acc.services[id].name[0] }), el('span', {}, [el('b', { text: acc.services[id].name }), el('small', { class: 'mono', text: acc.services[id].domain })])
          ]))
        ]),
        svc ? el('div', { class: 'ac-main' }, [
          el('header', { class: 'ac-head' }, [el('h2', { text: svc.name }), el('small', { class: 'mono', text: svc.user || '' })]),
          el('nav', { class: 'seg' }, TABS.filter(([id]) => tabs.includes(id)).map(([id, label]) => el('button', {
            class: `seg-btn ${tab === id ? 'is-on' : ''}`, type: 'button', dataset: { tab: id }, onclick: () => { ctx.setExtra('account', { tab: id }); bus.emit('account:viewed', { service: sid, tab: id }); }
          }, [label]))),
          page(ctx, sid, svc, tab, x)
        ]) : el('p', { class: 'app-empty', text: 'No accounts.' })
      );
    }
  };

  const update = (ctx, sid, fn, reason) => ctx.store.update((s) => { fn(s.desktop.account.services[sid], s); }, reason);

  function page(ctx, sid, svc, tab, x) {
    if (tab === 'devices') {
      return el('div', { class: 'ac-page' }, [
        el('p', { class: 'muted', text: 'Everywhere this account is signed in right now. Anything you do not recognise, sign out.' }),
        el('ul', { class: 'ac-list' }, (svc.sessions || []).filter((z) => !z.signedOut).map((z) => el('li', { class: `ac-row ${z.suspicious ? 'is-odd' : ''}` }, [
          icon(z.device && /phone/i.test(z.device) ? 'phone' : 'browser'),
          el('span', { class: 'ac-row-main' }, [el('b', { text: `${z.device}${z.current ? ' (this computer)' : ''}` }), el('small', { text: `${z.place} · ${z.ip || ''} · ${z.when || ''}` })]),
          z.current ? null : el('button', { class: 'tb-btn', type: 'button', onclick: () => {
            update(ctx, sid, (a) => { const q = a.sessions.find((y) => y.id === z.id); if (q) q.signedOut = true; }, 'session-out');
            bus.emit('session:signedOut', { service: sid, id: z.id, suspicious: !!z.suspicious });
            audio.play('click');
          } }, ['Sign out'])
        ]))),
        el('button', { class: 'tb-btn warn', type: 'button', onclick: () => {
          update(ctx, sid, (a) => { for (const q of a.sessions || []) if (!q.current) q.signedOut = true; }, 'sessions-out');
          bus.emit('sessions:signedOutAll', { service: sid });
          audio.play('good');
        } }, [icon('external'), 'Sign out every other device'])
      ]);
    }
    if (tab === 'recovery') {
      return el('div', { class: 'ac-page' }, [
        el('p', { class: 'muted', text: 'If you are ever locked out, the reset link goes here. Make sure it is an address only you (or your family) can open.' }),
        el('div', { class: 'kv' }, [el('span', { text: 'Recovery email' }), el('b', { class: 'mono', text: svc.recovery || 'None set' })]),
        el('div', { class: 'ac-choices' }, (svc.recoveryOptions || []).map((o) => el('button', {
          class: `chip ${o.address === svc.recovery ? 'is-on' : ''}`, type: 'button', onclick: () => {
            update(ctx, sid, (a) => { a.recovery = o.address; }, 'recovery');
            bus.emit('recovery:changed', { service: sid, address: o.address, trusted: !!o.trusted });
          }
        }, [o.label])))
      ]);
    }
    if (tab === 'rules') {
      return el('div', { class: 'ac-page' }, [
        el('p', { class: 'muted', text: 'Rules run on every email that arrives. An attacker who gets in often adds one quietly, to forward or hide mail.' }),
        (svc.rules || []).filter((r) => !r.removed).length ? el('ul', { class: 'ac-list' }, svc.rules.filter((r) => !r.removed).map((r) => el('li', { class: `ac-row ${r.bad ? 'is-odd' : ''}` }, [
          icon('mail'),
          el('span', { class: 'ac-row-main' }, [el('b', { text: r.name }), el('small', { class: 'mono', text: r.describe }), el('small', { text: `Created ${r.created || ''}${r.by ? ` by ${r.by}` : ''}` })]),
          el('button', { class: 'tb-btn warn', type: 'button', onclick: () => {
            update(ctx, sid, (a) => { const q = a.rules.find((y) => y.id === r.id); if (q) q.removed = true; }, 'rule-remove');
            bus.emit('rule:removed', { service: sid, id: r.id, bad: !!r.bad });
          } }, [icon('bin'), 'Delete rule'])
        ]))) : el('p', { class: 'app-empty', text: 'No rules.' })
      ]);
    }
    if (tab === 'apps') {
      return el('div', { class: 'ac-page' }, [
        el('p', { class: 'muted', text: 'Apps you have allowed to use this account. An app with access can read or send mail without ever knowing your password.' }),
        el('ul', { class: 'ac-list' }, (svc.apps || []).filter((z) => !z.revoked).map((z) => el('li', { class: `ac-row ${z.bad ? 'is-odd' : ''}` }, [
          icon('link'),
          el('span', { class: 'ac-row-main' }, [el('b', { text: z.name }), el('small', { text: z.scopes }), el('small', { text: `Allowed ${z.when || ''}` })]),
          el('button', { class: 'tb-btn', type: 'button', onclick: () => {
            update(ctx, sid, (a) => { const q = a.apps.find((y) => y.id === z.id); if (q) q.revoked = true; }, 'app-revoke');
            bus.emit('app:revoked', { service: sid, id: z.id, bad: !!z.bad });
          } }, ['Remove access'])
        ])))
      ]);
    }
    if (tab === 'signins') {
      return el('div', { class: 'ac-page' }, [
        el('table', { class: 'ac-table' }, [
          el('thead', {}, [el('tr', {}, ['When', 'Where', 'Device', 'Result'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, (svc.signins || []).map((r) => el('tr', { class: r.odd ? 'is-odd' : '' }, [r.when, r.place, r.device, r.result].map((c) => el('td', { text: c })))))
        ])
      ]);
    }
    // Security: two step sign in and the password.
    const setting = x.setup2 === sid;
    const code = svc.codeSeed ? totp(svc.codeSeed) : '';
    const onPhone = ctx.world.phone.codes.find((c) => c.id === svc.codeSeed);
    return el('div', { class: 'ac-page' }, [
      el('div', { class: `ac-card ${svc.twoStep ? 'is-on' : ''}` }, [
        el('div', { class: 'ac-card-head' }, [icon('shield'), el('b', { text: '2-step verification' }), el('span', { class: `tag ${svc.twoStep ? 'ok' : 'warn'}`, text: svc.twoStep ? 'On' : 'Off' })]),
        el('p', { text: 'After your password, sign ins also need a 6 digit code from your phone. A stolen password on its own is then not enough.' }),
        svc.twoStep ? null : setting ? el('div', { class: 'ac-setup' }, [
          el('div', { class: 'ac-qr', 'aria-hidden': 'true' }, Array.from({ length: 49 }, (_, i) => el('i', { class: (i * 7 + (i % 5) * 3) % 3 ? 'on' : '' }))),
          el('ol', {}, [
            el('li', {}, [onPhone ? 'Added to the phone. ' : 'On the phone, add this account to the codes app. ', onPhone ? null : el('button', { class: 'tb-btn', type: 'button', onclick: () => {
              ctx.store.update((s) => { if (!s.phone.codes.find((c) => c.id === svc.codeSeed)) s.phone.codes.push({ id: svc.codeSeed, issuer: svc.name, account: svc.user, seed: svc.codeSeed }); }, 'code-link');
              bus.emit('twostep:linked', { service: sid });
            } }, [icon('phone'), 'Scan with the phone'])]),
            el('li', { text: 'Type the 6 digit code the phone shows.' })
          ]),
          onPhone ? el('div', { class: 'ac-code-row' }, [
            el('span', { class: 'mono ac-code', text: x.typed || '______' }),
            el('button', { class: 'tb-btn primary', type: 'button', onclick: () => {
              ctx.setExtra('account', { typed: code });
              setTimeout(() => {
                update(ctx, sid, (a) => { a.twoStep = true; }, 'twostep-on');
                ctx.setExtra('account', { setup2: null, typed: null });
                audio.play('good');
                bus.emit('twostep:enabled', { service: sid });
              }, 600);
            } }, [icon('check'), 'Type the code from the phone'])
          ]) : null
        ]) : el('button', { class: 'tb-btn primary', type: 'button', onclick: () => { ctx.setExtra('account', { setup2: sid }); bus.emit('twostep:started', { service: sid }); } }, ['Turn on 2-step verification'])
      ]),
      el('div', { class: 'ac-card' }, [
        el('div', { class: 'ac-card-head' }, [icon('key'), el('b', { text: 'Password' }), el('span', { class: `tag ${svc.password && svc.password.strong ? 'ok' : 'warn'}`, text: svc.password && svc.password.strong ? 'Strong' : 'Weak or reused' })]),
        el('p', { class: 'muted', text: svc.password && svc.password.note ? svc.password.note : 'A long password you use nowhere else.' }),
        el('button', { class: 'tb-btn', type: 'button', onclick: () => {
          update(ctx, sid, (a) => { a.password = { ...(a.password || {}), strong: true, note: 'Changed tonight, saved in Vault.' }; }, 'password');
          bus.emit('password:changed', { service: sid, strong: true });
          audio.play('good');
        } }, [icon('refresh'), 'Change to a new strong password'])
      ])
    ]);
  }

  return app;
}
