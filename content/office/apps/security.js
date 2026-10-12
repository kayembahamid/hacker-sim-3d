import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { icon } from '../../../engine/ui/icons.js';
import { changed, btn, tabs, kv, empty, badge, head } from './kit.js';

// Account security for the Veltrix sign in: how you prove it is you, where you
// have signed in from, which devices are still signed in, and the quiet places
// an attacker leaves a way back in: an inbox rule that forwards invoices out,
// an app with permission to read your mail, an app password nobody uses.
//
// Recovery is the back door: whoever controls the recovery email, the phone
// number or the answers to the security questions can reset the password
// without ever knowing it.
//
// Events: method:changed { id, on }, signins:viewed, recovery:viewed { stale },
// recovery:removed { id, stale }, session:signedOut
// { id, suspicious }, password:changed, mailrule:viewed { id, malicious },
// mailrule:removed { id, malicious }, oauth:revoked { id, malicious },
// apppassword:revoked { id, suspicious }.
export function makeSecurityApp() {
  const app = {
    id: 'security', title: 'Account security', icon: 'shield', colour: 'linear-gradient(160deg,#5d7cff,#3548b8)', w: 1000, h: 620, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-security' }); app.update(ctx, node); return node; },
    update(ctx, node, params = {}) {
      const x = ctx.extra('security');
      const svc = ctx.world.desktop.account.services.veltrix;
      if (!changed(node, [svc, x])) return;
      const tab = params.tab && !x.tab ? params.tab : (x.tab || 'methods');
      node.append(
        head('Account security', `${svc.user} · ${svc.domain}`, [badge(svc.twoStep ? 'Two step on' : 'Two step off', svc.twoStep ? 'good' : 'bad')]),
        tabs(ctx, 'security', [
          ['methods', 'Sign in methods', 'key'], ['activity', 'Sign in activity', 'places'], ['sessions', 'Devices', 'browser'],
          ['password', 'Password', 'lock'], ['recovery', 'Recovery', 'refresh'], ['rules', 'Mailbox rules', 'mail'], ['apps', 'Connected apps', 'link'], ['apppw', 'App passwords', 'key']
        ], tab),
        el('div', { class: 'ox-page' }, [pages[tab](ctx, svc)])
      );
      if (tab === 'activity' && !x.seenActivity) { ctx.setExtra('security', { seenActivity: true }); bus.emit('signins:viewed', {}); }
      if (tab === 'recovery' && !x.seenRecovery) { ctx.setExtra('security', { seenRecovery: true }); bus.emit('recovery:viewed', { stale: (svc.recovery || []).filter((r) => r.stale).length }); }
      if (tab === 'rules' && !x.seenRules) { ctx.setExtra('security', { seenRules: true }); bus.emit('mailrule:viewed', { malicious: svc.mailRules.some((r) => r.external) }); }
    }
  };

  const edit = (ctx, fn, reason) => ctx.store.update((s) => fn(s.desktop.account.services.veltrix), reason);

  const pages = {
    methods: (ctx, svc) => el('div', {}, [
      el('p', { class: 'ox-note', text: 'Number matching means a sign in prompt only works if you type the number shown on the screen you are signing in on. Someone who has your password but not your screen cannot use it.' }),
      el('ul', { class: 'ox-cards' }, svc.methods.map((m) => el('li', { class: 'ox-card', dataset: { method: m.id, on: m.on ? '1' : '0' } }, [
        el('span', { class: 'ox-row-main' }, [el('b', { text: m.label }), el('small', { text: m.on ? 'On' : 'Off' })]),
        btn(m.on ? 'Turn off' : 'Turn on', () => {
          // Read the new state before the edit: the edit changes m in place.
          const on = !m.on;
          edit(ctx, (v) => { const t = v.methods.find((q) => q.id === m.id); if (t) t.on = on; }, 'method');
          bus.emit('method:changed', { id: m.id, on });
        })
      ])))
    ]),
    activity: (ctx, svc) => el('div', {}, [
      el('table', { class: 'ox-table' }, [
        el('thead', {}, [el('tr', {}, ['When', 'Where', 'IP address', 'Result', 'How'].map((h) => el('th', { text: h })))]),
        el('tbody', {}, svc.signins.map((r) => el('tr', { class: r.suspicious ? 'is-bad' : '' }, [
          el('td', { text: r.at }), el('td', { text: r.place }), el('td', { class: 'mono', text: r.ip }),
          el('td', {}, [badge(r.result, /fail|denied|blocked/i.test(r.result) ? 'bad' : r.suspicious ? 'warn' : 'good')]), el('td', { text: r.method })
        ])))
      ]),
      el('p', { class: 'ox-note', text: 'A burst of failed or denied sign ins from somewhere you have never been means someone has your password. Change it.' })
    ]),
    sessions: (ctx, svc) => el('ul', { class: 'ox-cards' }, svc.sessions.map((s) => el('li', { class: `ox-card ${s.suspicious && !s.signedOut ? 'is-bad' : ''}` }, [
      el('span', { class: 'ox-row-main' }, [el('b', { text: s.device }), el('small', { text: `${s.place} · ${s.ip} · ${s.when}` })]),
      s.current ? badge('This computer', 'good') : s.signedOut ? badge('Signed out') : btn('Sign out', () => {
        edit(ctx, (v) => { const t = v.sessions.find((q) => q.id === s.id); if (t) t.signedOut = true; }, 'session-out');
        bus.emit('session:signedOut', { id: s.id, suspicious: !!s.suspicious });
      }, { warn: !!s.suspicious })
    ]))),
    password: (ctx, svc) => el('div', { class: 'ox-detail' }, [
      kv('Last changed', svc.password.note || ''),
      el('p', { class: 'ox-note', text: 'Changing your password also signs out every other device.' }),
      svc.password.changedTonight ? el('p', { class: 'ox-good' }, [icon('check'), ' Changed just now. Every other device has been signed out.']) : btn('Change password now', () => {
        edit(ctx, (v) => {
          v.password = { strong: true, note: 'Changed just now', changedTonight: true };
          for (const s of v.sessions) if (!s.current) s.signedOut = true;
        }, 'password');
        bus.emit('password:changed', { service: 'veltrix' });
        ctx.toast({ app: 'security', title: 'Password changed', body: 'Other devices have been signed out.' });
      }, { primary: true, ic: 'lock' })
    ]),
    recovery: (ctx, svc) => el('div', {}, [
      el('p', { class: 'ox-note', text: 'Anyone who controls one of these can reset your password without knowing it. Keep only what you own and use today.' }),
      (svc.recovery || []).length ? el('ul', { class: 'ox-cards' }, svc.recovery.map((r) => el('li', { class: `ox-card ${r.stale ? 'is-bad' : ''}`, dataset: { recovery: r.id } }, [
        el('span', { class: 'ox-row-main' }, [el('b', { text: r.label }), el('small', { class: 'mono', text: r.value }), r.note ? el('small', { class: r.stale ? 'ox-bad-text' : '', text: r.note }) : null].filter(Boolean)),
        r.locked ? badge('Primary') : btn('Remove', () => {
          edit(ctx, (v) => { v.recovery = (v.recovery || []).filter((q) => q.id !== r.id); }, 'recovery-remove');
          bus.emit('recovery:removed', { id: r.id, stale: !!r.stale, kind: r.kind || '' });
        }, { warn: !!r.stale, ic: 'bin' })
      ]))) : empty('No recovery options. Only your authenticator can prove it is you.')
    ]),
    rules: (ctx, svc) => svc.mailRules.length ? el('ul', { class: 'ox-cards' }, svc.mailRules.map((r) => el('li', { class: `ox-card ${r.external ? 'is-bad' : ''}`, dataset: { rule: r.id } }, [
      el('span', { class: 'ox-row-main' }, [
        el('b', { text: r.name }),
        el('small', { text: `When: ${r.when}` }),
        el('small', { class: r.external ? 'ox-bad-text' : '', text: `Then: ${r.then}` }),
        el('small', { text: `Created ${r.created} by ${r.by}${r.hidden ? ' · marked hidden' : ''}` })
      ]),
      btn('Delete rule', () => {
        edit(ctx, (v) => { v.mailRules = v.mailRules.filter((q) => q.id !== r.id); }, 'rule-delete');
        bus.emit('mailrule:removed', { id: r.id, malicious: !!r.external });
      }, { warn: !!r.external, ic: 'bin' })
    ]))) : empty('No mailbox rules.'),
    apps: (ctx, svc) => svc.oauth.length ? el('ul', { class: 'ox-cards' }, svc.oauth.map((o) => el('li', { class: `ox-card ${o.verified ? '' : 'is-bad'}`, dataset: { oauth: o.id } }, [
      el('span', { class: 'ox-row-main' }, [el('b', { text: o.name }), el('small', { text: `${o.publisher} · added ${o.added}` }), el('small', { text: `Can: ${o.scopes.join(', ')}` })]),
      btn('Remove access', () => {
        edit(ctx, (v) => { v.oauth = v.oauth.filter((q) => q.id !== o.id); }, 'oauth-revoke');
        bus.emit('oauth:revoked', { id: o.id, malicious: !o.verified });
      }, { warn: !o.verified })
    ]))) : empty('No apps have access to your account.'),
    apppw: (ctx, svc) => svc.appPasswords.length ? el('ul', { class: 'ox-cards' }, svc.appPasswords.map((a) => el('li', { class: `ox-card ${a.suspicious ? 'is-bad' : ''}` }, [
      el('span', { class: 'ox-row-main' }, [el('b', { text: a.name }), el('small', { text: `Created ${a.created} · last used ${a.lastUsed}` })]),
      btn('Revoke', () => {
        edit(ctx, (v) => { v.appPasswords = v.appPasswords.filter((q) => q.id !== a.id); }, 'apppw-revoke');
        bus.emit('apppassword:revoked', { id: a.id, suspicious: !!a.suspicious });
      }, { warn: !!a.suspicious })
    ]))) : empty('No app passwords.')
  };

  return app;
}
