import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { audio } from '../core/audio.js';
import { icon } from '../ui/icons.js';
import { makeLink } from './link.js';
import { registrableDomain } from '../scenario/lookalike.js';
import { freshTab } from '../core/store.js';

// One browser, used on both devices. The address bar always shows the whole
// address with the part that decides the owner picked out, the padlock opens
// the certificate, and "Who owns this?" explains the address in plain words,
// because reading an address is the skill being taught.
//
// Login forms never take real typing. Tapping a field types the character's
// own details, so a player can never enter a real password into the sim, and
// the Vault only ever autofills on the exact site it saved the login for.

let tabSeq = 1;

export function createBrowser({ device, store, sites, vars, bar, product, bookmarks = [] }) {
  const root = el('div', { class: `browser browser-${device}` });
  const tabsEl = el('div', { class: 'br-tabs' });
  const chrome = el('div', { class: 'br-chrome' });
  const marks = el('div', { class: 'br-marks' });
  const panel = el('div', { class: 'br-panel', hidden: true });
  const page = el('div', { class: 'br-page' });
  root.append(tabsEl, chrome, marks, panel, page);

  let leaveHooks = [];
  let panelMode = null;
  let editing = false;
  const runLeave = () => { for (const fn of leaveHooks) { try { fn(); } catch (e) { /* page gone */ } } leaveHooks = []; };

  const bs = () => store.get()[device].browser;
  const tab = () => bs().tabs[bs().active] || bs().tabs[0];

  function navigate(url, source = 'browser') {
    const target = normalise(url);
    store.update((s) => {
      const b = s[device].browser;
      const t = b.tabs[b.active];
      t.history = t.history.slice(0, t.index + 1);
      t.history.push(target);
      t.index = t.history.length - 1;
    }, 'navigate');
    panelMode = null;
    const host = safeHost(target);
    bus.emit('site:visited', { device, url: target, host, domain: registrableDomain(host), source, known: !!sites.resolve(target) });
    render();
    return target;
  }

  function normalise(input) {
    const raw = String(input || '').trim();
    if (/^https?:\/\//i.test(raw)) return raw;
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(raw)) return `https://${raw}`;
    const engine = (product && product.searchUrl) || 'https://search.example/';
    return `${engine}?q=${encodeURIComponent(raw)}`;
  }

  function go(delta) {
    const t = tab();
    const next = t.index + delta;
    if (next < 0 || next >= t.history.length) return;
    store.update((s) => { const b = s[device].browser; b.tabs[b.active].index = next; }, 'browser-nav');
    bus.emit('browser:moved', { device, direction: delta > 0 ? 'forward' : 'back' });
    render();
  }

  function newTab(url) {
    store.update((s) => {
      const b = s[device].browser;
      b.tabs.push(freshTab(`t${++tabSeq}`));
      b.active = b.tabs.length - 1;
    }, 'tab-new');
    if (url) navigate(url, 'new-tab'); else render();
  }

  function closeTab(i) {
    const closing = bs().tabs[i];
    const closingUrl = closing ? closing.history[closing.index] || null : null;
    bus.emit('browser:tabClosed', { device, url: closingUrl, host: closingUrl ? safeHost(closingUrl) : '' });
    store.update((s) => {
      const b = s[device].browser;
      b.tabs.splice(i, 1);
      if (!b.tabs.length) b.tabs.push(freshTab(`t${++tabSeq}`));
      b.active = Math.min(b.active, b.tabs.length - 1);
    }, 'tab-close');
    render();
  }

  function safeHost(url) {
    try { return new URL(url).hostname; } catch (e) { return ''; }
  }

  function currentUrl() {
    const t = tab();
    return t ? t.history[t.index] || null : null;
  }

  function renderTabs(site) {
    clear(tabsEl);
    if (device !== 'desktop') return;
    const b = bs();
    b.tabs.forEach((t, i) => {
      const url = t.history[t.index];
      const hit = url ? sites.resolve(url) : null;
      tabsEl.append(el('div', { class: `br-tab ${i === b.active ? 'is-on' : ''}` }, [
        el('button', { class: 'br-tab-main', type: 'button', onclick: () => { store.update((st) => { st[device].browser.active = i; }, 'tab-switch'); render(); } }, [
          icon(hit && hit.site.secure ? 'lock' : 'globe'),
          el('span', { text: hit ? hit.site.title : url ? safeHost(url) : 'New tab' })
        ]),
        el('button', { class: 'br-tab-x', type: 'button', 'aria-label': 'Close tab', onclick: () => closeTab(i) }, [icon('close')])
      ]));
    });
    tabsEl.append(el('button', { class: 'br-tab-new', type: 'button', 'aria-label': 'New tab', onclick: () => newTab() }, [icon('plus')]));
  }

  function renderChrome(url, site) {
    clear(chrome);
    const t = tab();
    const back = el('button', { class: 'br-btn', type: 'button', 'aria-label': 'Back', disabled: t.index <= 0 ? '' : null, onclick: () => go(-1) }, [icon('back')]);
    const fwd = el('button', { class: 'br-btn', type: 'button', 'aria-label': 'Forward', disabled: t.index >= t.history.length - 1 ? '' : null, onclick: () => go(1) }, [icon('forward')]);
    const reload = el('button', { class: 'br-btn', type: 'button', 'aria-label': 'Reload', onclick: () => render(true) }, [icon('refresh')]);

    const host = safeHost(url || '');
    const owner = registrableDomain(host);
    const prefix = host.endsWith(owner) ? host.slice(0, host.length - owner.length) : '';
    const rest = url ? url.replace(/^https?:\/\/[^/]+/, '') : '';

    let address;
    if (editing || !url) {
      const input = el('input', {
        class: 'br-input', type: 'text', value: url || '', 'aria-label': 'Address', spellcheck: 'false', autocomplete: 'off',
        placeholder: 'Search or type an address',
        onkeydown: (ev) => {
          if (ev.key === 'Enter') { editing = false; navigate(ev.target.value, 'typed'); }
          if (ev.key === 'Escape') { editing = false; render(); }
        },
        onblur: () => { if (url) { editing = false; setTimeout(render, 0); } }
      });
      address = el('div', { class: 'br-address is-editing' }, [icon('search'), input]);
      if (editing) setTimeout(() => { input.focus(); input.select(); }, 0);
    } else {
      address = el('div', { class: 'br-address' }, [
        el('button', {
          class: `br-lock ${site && site.secure ? 'is-secure' : 'is-plain'}`, type: 'button',
          'aria-label': 'Connection and certificate', onclick: () => togglePanel('cert', url, site)
        }, [icon(site && site.secure ? 'lock' : 'alert')]),
        el('button', { class: 'br-url', type: 'button', title: url, onclick: () => { editing = true; render(); } }, [
          el('span', { class: 'br-scheme', text: 'https://' }),
          el('span', { class: 'br-sub', text: prefix }),
          el('span', { class: 'br-owner', text: owner }),
          el('span', { class: 'br-path', text: rest })
        ])
      ]);
    }
    const who = el('button', { class: 'br-who', type: 'button', onclick: () => togglePanel('owner', url, site) }, [icon('search'), el('span', { text: 'Who owns this?' })]);
    chrome.append(...[back, fwd, reload, address, url ? who : null].filter(Boolean));
  }

  function togglePanel(mode, url, site) {
    if (!panel.hidden && panelMode === mode) { panel.hidden = true; panelMode = null; return; }
    panelMode = mode;
    panel.hidden = false;
    clear(panel);
    const host = safeHost(url || '');
    const owner = registrableDomain(host);
    const close = el('button', { class: 'br-panel-x', type: 'button', 'aria-label': 'Close', onclick: () => { panel.hidden = true; panelMode = null; } }, [icon('close')]);
    if (mode === 'owner') {
      bus.emit('domain:checked', { device, host, domain: owner, url });
      panel.append(...[close,
        el('h3', { text: 'Who owns this address?' }),
        el('p', { class: 'br-owner-big', style: { '--len': String(host.length + 1) } }, [el('span', { class: 'muted', text: host.slice(0, host.length - owner.length) }), el('b', { text: owner })]),
        el('p', { text: 'Read the address backwards from the first slash. The last part before it, like example.com, is the owner. Only they can put pages at that address.' }),
        el('p', { text: host === owner ? 'There is nothing extra in front of the owner name here.' : `Everything in front of ${owner} was chosen by whoever owns ${owner}. It can say anything, including another company's name.` }),
        site && site.ownerNote ? el('p', { class: 'br-note', text: site.ownerNote }) : null
      ].filter(Boolean));
    } else {
      const cert = site && site.cert;
      bus.emit('cert:viewed', { device, host, site: site ? site.id : null });
      panel.append(close,
        el('h3', { text: site && site.secure ? 'Connection is encrypted' : 'Connection is not encrypted' }),
        el('div', { class: 'kv' }, [el('span', { text: 'Address' }), el('b', { class: 'mono', text: host })]),
        el('div', { class: 'kv' }, [el('span', { text: 'Certificate issued to' }), el('b', { text: cert ? cert.issuedTo : 'Unknown' })]),
        el('div', { class: 'kv' }, [el('span', { text: 'Issued by' }), el('b', { text: cert ? cert.issuedBy : 'Unknown' })]),
        el('div', { class: 'kv' }, [el('span', { text: 'Valid' }), el('b', { text: cert ? cert.valid : 'Unknown' })]),
        el('p', { class: 'br-note', text: cert ? cert.explain : 'No certificate information for this page.' }),
        el('p', { class: 'muted small', text: 'The padlock only means nobody else can read what you send. It does not mean the site is honest: anyone can get one, including scammers.' })
      );
    }
  }

  function renderMarks() {
    clear(marks);
    for (const m of bookmarks) {
      marks.append(el('button', { class: 'br-mark', type: 'button', title: m.url, onclick: () => navigate(m.url, 'bookmark') }, [icon('star'), m.label]));
    }
  }

  // ------------------------------------------------------ page helpers
  function vaultFor(host) {
    const vault = store.get().desktop.vault;
    if (!vault.setup) return { state: 'none' };
    const exact = vault.entries.find((e) => e.host === host);
    if (exact) return { state: 'match', entry: exact };
    const owner = registrableDomain(host);
    const similar = vault.entries.find((e) => {
      const brand = e.host.split('.').slice(-2, -1)[0] || '';
      return brand && (owner.includes(brand.slice(0, 5)) || host.includes(brand.slice(0, 5)));
    });
    if (similar) return { state: 'refuse', entry: similar };
    return { state: 'nothing' };
  }

  // A login form. Fields fill by tapping (the character's own details are
  // typed for them); the Vault key autofills only on an exact match.
  function form(spec, url) {
    const host = safeHost(url);
    const persona = (product && product.persona) || {};
    const values = {};
    const status = el('div', { class: 'fm-status', 'aria-live': 'polite' });
    const inputs = spec.fields.map((f) => {
      const shown = el('span', { class: 'fm-value' });
      const btn = el('button', {
        class: 'fm-input', type: 'button', dataset: { field: f.name },
        onclick: () => {
          values[f.name] = f.type === 'password' ? 'typed' : (persona[f.fill || f.name] || f.value || 'typed');
          shown.textContent = f.type === 'password' ? '•'.repeat(11) : values[f.name];
          btn.classList.add('is-filled');
          audio.play('keys');
          bus.emit('form:typed', { device, host, field: f.name, formId: spec.id, site: spec.site });
        }
      }, [el('span', { class: 'fm-ph', text: f.label }), shown]);
      return el('label', { class: 'fm-row' }, [el('span', { class: 'fm-label', text: f.label }), btn]);
    });
    const vaultBtn = el('button', {
      class: 'fm-vault', type: 'button', onclick: () => {
        const v = vaultFor(host);
        clear(status);
        if (v.state === 'match') {
          for (const f of spec.fields) values[f.name] = 'vault';
          root.querySelectorAll('.fm-input').forEach((b) => {
            b.classList.add('is-filled');
            b.querySelector('.fm-value').textContent = b.dataset.field === 'password' ? '•'.repeat(14) : v.entry.username;
          });
          status.append(el('p', { class: 'fm-ok' }, [icon('check'), `Vault filled in your login for ${v.entry.host}.`]));
          bus.emit('vault:autofilled', { device, host, formId: spec.id });
        } else if (v.state === 'refuse') {
          status.append(el('div', { class: 'fm-refuse' }, [
            el('b', {}, [icon('shield'), ' Vault will not fill this in']),
            el('p', { text: `This page is on ${host}. Your saved login is for ${v.entry.host}. They are different websites, however alike they look.` })
          ]));
          bus.emit('vault:refused', { device, host, saved: v.entry.host, formId: spec.id });
        } else if (v.state === 'none') {
          status.append(el('p', { class: 'fm-warn', text: 'Vault is not set up on this computer yet.' }));
          bus.emit('vault:missing', { device, host });
        } else {
          status.append(el('p', { class: 'fm-warn', text: `Vault has no saved login for ${host}.` }));
          bus.emit('vault:nothing', { device, host });
        }
        audio.play('click');
      }
    }, [icon('key'), 'Fill from Vault']);
    const submit = el('button', {
      class: 'fm-submit', type: 'button', style: spec.submitStyle || {},
      onclick: () => {
        const filled = Object.fromEntries(spec.fields.map((f) => [f.name, !!values[f.name]]));
        bus.emit('form:submitted', { device, host, url, formId: spec.id, site: spec.site, filled, viaVault: Object.values(values).includes('vault'), asks: spec.fields.map((f) => f.name) });
        if (spec.after) spec.after(filled);
      }
    }, [spec.submitLabel || 'Sign in']);
    return el('div', { class: `fm ${spec.className || ''}` }, [
      spec.title ? el('h2', { class: 'fm-title', text: spec.title }) : null,
      ...inputs,
      device === 'desktop' && spec.vault !== false ? vaultBtn : null,
      status,
      submit,
      spec.small ? el('p', { class: 'fm-small', text: spec.small }) : null
    ]);
  }

  let lastKey = null;
  function render(force = false) {
    const b = bs();
    const t = tab();
    const key = `${b.active}:${b.tabs.length}:${t ? t.index : -1}:${t ? t.history[t.index] : ''}:${editing}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    runLeave();
    const url = currentUrl();
    const hit = url ? sites.resolve(url) : null;
    const site = hit ? hit.site : null;
    renderTabs(site);
    renderChrome(url, site);
    renderMarks();
    clear(page);
    if (panelMode) { panel.hidden = true; panelMode = null; }

    if (!url) {
      page.append(el('div', { class: 'br-blank' }, [
        el('h2', { text: 'New tab' }),
        el('div', { class: 'br-speed' }, bookmarks.map((m) => el('button', { class: 'br-speed-tile', type: 'button', onclick: () => navigate(m.url, 'bookmark') }, [
          el('span', { class: 'br-speed-icon', text: m.label[0] }), el('span', { text: m.label })
        ])))
      ]));
      return;
    }
    if (!site) {
      page.append(el('div', { class: 'br-blank br-error' }, [
        icon('alert'), el('h2', { text: 'This site cannot be reached' }),
        el('p', { class: 'mono', text: safeHost(url) }),
        el('p', { text: 'Check the address for typos.' })
      ]));
      bus.emit('site:unreachable', { device, url, host: safeHost(url) });
      return;
    }
    const ctx = {
      url: new URL(url), vars, world: store.get(), store, device, product,
      emit: (type, payload) => bus.emit(type, { device, url, host: safeHost(url), ...payload }),
      navigate: (next) => navigate(next.startsWith('http') ? next : `https://${safeHost(url)}${next}`, 'in-page'),
      onLeave: (fn) => leaveHooks.push(fn),
      link: (href, text, opts = {}) => makeLink({
        href: href.startsWith('http') ? href : `https://${safeHost(url)}${href}`,
        text, source: `site:${site.id}`, bar, className: opts.className || '',
        onOpen: (h) => navigate(h, 'in-page')
      }),
      form: (spec) => form(spec, url),
      download: (file) => {
        store.update((s) => {
          const f = { ...file, id: file.id || `dl-${Date.now()}`, folder: 'Downloads', from: url, at: s.clock.minutes };
          if (!s.desktop.files.find((x) => x.id === f.id)) s.desktop.files.unshift(f);
        }, 'download');
        bus.emit('file:downloaded', { device, name: file.name, fileId: file.id, from: url, host: safeHost(url) });
        bus.emit('desktop:toast', { app: 'files', title: 'Download complete', body: file.name });
        audio.play('notify');
      }
    };
    page.append(site.render(ctx));
    page.scrollTop = 0;
  }

  render();
  return { node: root, navigate, render, currentUrl, newTab };
}
