import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { audio } from '../../../core/audio.js';
import { icon } from '../../../ui/icons.js';

// Vault, a password manager. It remembers one strong password per site so
// you do not have to, and it will only ever fill a login in on the exact site
// it was saved for: on a lookalike it refuses, and says why. That refusal is
// the reason to use one.
//
// Nothing here takes typing. The master passphrase is picked from generated
// suggestions, and new passwords are generated.
const WORDS = ['otter', 'maple', 'rocket', 'pebble', 'lantern', 'violin', 'cactus', 'thunder', 'marble', 'harbour', 'meadow', 'comet', 'saddle', 'walnut', 'glacier', 'falcon', 'orbit', 'velvet', 'kettle', 'puzzle', 'ember', 'quartz', 'tundra', 'biscuit'];

function passphrase() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  return `${pick()}-${pick()}-${pick()}-${pick()}`;
}

function strongPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789-_';
  let s = '';
  for (let i = 0; i < 18; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function makeVaultApp({ title = 'Vault', suggestions = [] } = {}) {
  const app = {
    id: 'vault', title, icon: 'vault', colour: 'linear-gradient(160deg,#7a5cff,#4a31c7)', w: 760, h: 540, pinned: true,
    mount(ctx) { const node = el('div', { class: 'app-vault' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const key = JSON.stringify([ctx.world.desktop.vault, ctx.extra('vault')]);
      if (node.dataset.key === key) return;
      node.dataset.key = key;
      clear(node);
      const v = ctx.world.desktop.vault;
      node.append(v.setup ? unlocked(ctx) : setup(ctx));
    }
  };

  function setup(ctx) {
    const x = ctx.extra('vault');
    const phrase = x.phrase || null;
    return el('div', { class: 'vt-setup' }, [
      el('span', { class: 'vt-logo' }, [icon('vault')]),
      el('h2', { text: 'Set up Vault' }),
      el('p', { text: 'Vault keeps a different strong password for every site, and fills them in for you. You only remember one thing: the master passphrase.' }),
      el('ol', { class: 'vt-steps' }, [
        el('li', { text: 'A passphrase is four random words. Long and easy to remember beats short and clever.' }),
        el('li', { text: 'Never use it anywhere else. Never tell anyone it, not even a friend.' })
      ]),
      phrase ? el('div', { class: 'vt-phrase mono', text: phrase }) : null,
      el('div', { class: 'vt-buttons' }, [
        el('button', { class: 'tb-btn', type: 'button', onclick: () => { ctx.setExtra('vault', { phrase: passphrase() }); bus.emit('vault:suggested', {}); } }, [icon('refresh'), phrase ? 'Another one' : 'Suggest a passphrase']),
        phrase ? el('button', { class: 'tb-btn primary', type: 'button', onclick: () => {
          ctx.store.update((s) => { s.desktop.vault.setup = true; s.desktop.vault.locked = false; }, 'vault-setup');
          audio.play('good');
          bus.emit('vault:setup', {});
        } }, [icon('check'), 'Use this passphrase']) : null
      ])
    ]);
  }

  function unlocked(ctx) {
    const entries = ctx.world.desktop.vault.entries;
    const counts = {};
    for (const e of entries) counts[e.fingerprint] = (counts[e.fingerprint] || 0) + 1;
    const reused = entries.filter((e) => counts[e.fingerprint] > 1).length;
    const pending = suggestions.filter((s) => !entries.find((e) => e.host === s.host));
    return el('div', { class: 'vt-main' }, [
      el('header', { class: 'vt-head' }, [
        el('div', {}, [el('h2', { text: title }), el('small', { text: `${entries.length} logins saved` })]),
        el('div', { class: `vt-health ${reused ? 'is-warn' : entries.length ? 'is-ok' : ''}` }, [icon(reused ? 'warning' : 'shield'), el('span', { text: reused ? `${reused} logins share a password` : entries.length ? 'Every password is different' : 'Nothing saved yet' })])
      ]),
      el('ul', { class: 'vt-list' }, entries.map((e) => el('li', { class: `vt-row ${counts[e.fingerprint] > 1 ? 'is-reused' : ''}`, dataset: { host: e.host } }, [
        el('span', { class: 'vt-site', text: e.host[0].toUpperCase() }),
        el('span', { class: 'vt-main-col' }, [el('b', { class: 'mono', text: e.host }), el('small', { text: e.username })]),
        el('span', { class: `vt-strength is-${e.strength}`, text: e.strength === 'strong' ? 'Strong' : e.strength === 'weak' ? 'Weak' : 'OK' }),
        counts[e.fingerprint] > 1 ? el('span', { class: 'tag warn', text: 'Reused' }) : null,
        e.strength !== 'strong' ? el('button', { class: 'tb-btn', type: 'button', onclick: () => {
          ctx.store.update((s) => {
            const x = s.desktop.vault.entries.find((q) => q.host === e.host);
            if (x) { x.strength = 'strong'; x.fingerprint = strongPassword(); }
          }, 'vault-strengthen');
          audio.play('good');
          bus.emit('vault:strengthened', { host: e.host });
          bus.emit('password:changed', { service: e.service || e.host, host: e.host, strong: true });
        } }, [icon('key'), 'Make strong']) : null
      ]))),
      pending.length ? el('div', { class: 'vt-import' }, [
        el('h3', { text: 'Logins you could move in' }),
        el('p', { class: 'muted', text: 'These are written down somewhere else. Move each one in, then change it to a strong one.' }),
        el('ul', { class: 'vt-list' }, pending.map((p) => el('li', { class: 'vt-row' }, [
          el('span', { class: 'vt-site', text: p.host[0].toUpperCase() }),
          el('span', { class: 'vt-main-col' }, [el('b', { class: 'mono', text: p.host }), el('small', { text: `${p.username} · from ${p.source || 'the notebook'}` })]),
          el('button', { class: 'tb-btn primary', type: 'button', onclick: () => {
            ctx.store.update((s) => {
              s.desktop.vault.entries.push({ host: p.host, username: p.username, service: p.service, strength: p.strength || 'weak', fingerprint: p.fingerprint || 'same-old' });
            }, 'vault-add');
            audio.play('click');
            bus.emit('vault:added', { host: p.host, service: p.service });
          } }, [icon('plus'), 'Save in Vault'])
        ])))
      ]) : null
    ]);
  }

  return app;
}
