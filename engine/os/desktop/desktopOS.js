import { el, clear } from '../../core/dom.js';
import { bus } from '../../core/bus.js';
import { format } from '../../core/clock.js';
import { audio } from '../../core/audio.js';
import { icon } from '../../ui/icons.js';
import { statusBar } from '../link.js';

// A working desktop on the monitor: window chrome, dragging, resizing, focus
// order, minimise and maximise, a taskbar with a start menu and running apps,
// a clock, notifications, right click menus and desktop icons.
//
// Apps are modules: { id, title, icon, colour, w, h, pinned, desktop,
// mount(ctx, params), update(ctx, node), badge(world) }. The product decides
// which apps the computer has.
export class DesktopOS {
  constructor({ screen, store, sites, vars, product, apps }) {
    this.screen = screen;
    this.store = store;
    this.sites = sites;
    this.vars = vars;
    this.product = product;
    this.apps = new Map(apps.map((a) => [a.id, a]));
    this.mounted = new Map();
    this.bar = statusBar();
    this.drag = null;
    this.k = 1;
    this.toastLog = [];
  }

  get world() { return this.store.get(); }
  get desk() { return this.store.get().desktop; }

  ctx(win) {
    return {
      os: this, world: this.world, store: this.store, sites: this.sites, vars: this.vars,
      product: this.product, bar: this.bar, device: 'desktop', win,
      open: (id, params) => this.open(id, params),
      close: () => win && this.close(win.id),
      toast: (t) => this.toast(t),
      menu: (ev, items) => this.contextMenu(ev, items),
      extra: (key) => this.world.desktop.extra[key] || {},
      setExtra: (key, patch) => this.store.update((s) => { s.desktop.extra[key] = { ...(s.desktop.extra[key] || {}), ...patch }; }, `extra-${key}`)
    };
  }

  mount() {
    const root = this.screen.root;
    root.classList.add('desktop-os');
    root.dataset.product = this.product.id;
    this.desktopEl = el('div', { class: 'dk-desktop', oncontextmenu: (ev) => this.contextMenu(ev, [
      { label: 'Refresh', icon: 'refresh', run: () => this.renderDesktop() },
      { label: 'Open Files', icon: 'files', run: () => this.open('files') }
    ]) });
    this.windowsEl = el('div', { class: 'dk-windows' });
    this.toastEl = el('div', { class: 'dk-toasts', 'aria-live': 'polite' });
    this.taskbarEl = el('div', { class: 'dk-taskbar' });
    this.startEl = el('div', { class: 'dk-start-menu', hidden: true });
    this.centreEl = el('div', { class: 'dk-centre', hidden: true });
    this.menuEl = el('div', { class: 'dk-context', hidden: true, role: 'menu' });
    this.lockEl = el('div', { class: 'dk-lock', hidden: true });
    root.append(this.desktopEl, this.windowsEl, this.toastEl, this.startEl, this.centreEl, this.menuEl, this.taskbarEl, this.bar, this.lockEl);

    bus.on('world:changed', () => this.render());
    bus.on('clock:changed', () => this.renderTaskbar());
    bus.on('desktop:toast', (t) => this.toast(t));
    window.addEventListener('pointermove', (ev) => this.onDragMove(ev));
    window.addEventListener('pointerup', () => this.onDragEnd());
    root.addEventListener('pointerdown', (ev) => {
      if (!ev.target.closest('.dk-context')) this.menuEl.hidden = true;
      if (!ev.target.closest('.dk-start-menu') && !ev.target.closest('.dk-start')) this.toggleStart(false);
      if (!ev.target.closest('.dk-centre') && !ev.target.closest('.dk-bell')) this.centreEl.hidden = true;
    });
    root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { this.menuEl.hidden = true; this.toggleStart(false); this.centreEl.hidden = true; }
      // Win+L never reaches a web page, so the sim also takes Ctrl+Alt+L.
      if ((ev.metaKey || (ev.ctrlKey && ev.altKey)) && ev.key.toLowerCase() === 'l') { ev.preventDefault(); this.lock(); }
    });

    this.renderDesktop();
    this.render();
    return this;
  }

  setScale(k) { this.k = k || 1; }
  get compact() { return this.screen.root.classList.contains('is-compact'); }

  // ------------------------------------------------------------ desktop
  renderDesktop() {
    clear(this.desktopEl);
    const w = this.product.desktop || {};
    const icons = el('div', { class: 'dk-icons' });
    for (const app of this.apps.values()) {
      if (app.desktop === false || app.hidden) continue;
      icons.append(el('button', {
        class: 'dk-icon', type: 'button', dataset: { app: app.id },
        ondblclick: () => this.open(app.id),
        onclick: (ev) => { if (ev.pointerType === 'touch' || this.compact) this.open(app.id); },
        onkeydown: (ev) => { if (ev.key === 'Enter') this.open(app.id); }
      }, [
        el('span', { class: 'dk-icon-glyph', style: { background: app.colour || '#3b4660' } }, [icon(app.icon)]),
        el('span', { class: 'dk-icon-label', text: app.title })
      ]));
    }
    this.desktopEl.append(
      el('div', { class: 'dk-wallpaper' }, [w.wallpaperText ? el('span', { class: 'dk-wall-text', text: w.wallpaperText }) : null]),
      icons
    );
  }

  // A render can change the world (an app navigating as it mounts), which
  // asks for another render. Never recurse: finish, then go round once more.
  render() {
    if (this.rendering) { this.renderAgain = true; return; }
    this.rendering = true;
    try { this.renderNow(); } finally { this.rendering = false; }
    if (this.renderAgain) { this.renderAgain = false; this.render(); }
  }

  renderNow() {
    const wins = this.desk.windows;
    const seen = new Set();
    for (const w of wins) {
      seen.add(w.id);
      let node = this.mounted.get(w.id);
      if (!node) {
        node = this.buildWindow(w);
        this.mounted.set(w.id, node);
        this.windowsEl.append(node.root);
      } else {
        const app = this.apps.get(w.app);
        if (app && app.update) app.update(this.ctx(w), node.body.firstChild, w.params || {});
      }
      if (!(this.drag && this.drag.id === w.id)) {
        node.root.style.transform = `translate(${w.x}px, ${w.y}px)`;
        node.root.style.width = `${w.w}px`;
        node.root.style.height = `${w.h}px`;
      }
      node.root.style.zIndex = String(w.z);
      node.root.hidden = !!w.min;
      node.root.classList.toggle('is-max', !!w.max || this.compact);
      node.root.classList.toggle('is-focused', this.desk.focus === w.id);
    }
    for (const [id, node] of this.mounted) {
      if (!seen.has(id)) { node.root.remove(); this.mounted.delete(id); }
    }
    this.renderTaskbar();
    this.renderLock();
  }

  // ------------------------------------------------------ lock and power
  // Locking is the habit being taught when someone steps away: the screen
  // stays exactly as it was underneath, and only the owner gets back in.
  // The state lives in the world (and a flag), so a rewind undoes it and a
  // scenario rule can ask whether the screen was locked.
  lock() {
    if (this.desk.locked || this.desk.power === 'off') return;
    this.toggleStart(false);
    this.store.update((s) => { s.desktop.locked = true; s.flags['desktop.locked'] = true; }, 'desktop-lock');
    audio.play('click');
    bus.emit('desktop:locked', {});
  }

  unlock() {
    this.store.update((s) => { s.desktop.locked = false; s.flags['desktop.locked'] = false; }, 'desktop-unlock');
    audio.play('click');
    bus.emit('desktop:unlocked', {});
  }

  shutDown() {
    this.toggleStart(false);
    this.store.update((s) => { s.desktop.power = 'off'; s.flags['desktop.off'] = true; }, 'desktop-off');
    bus.emit('desktop:shutdown', {});
  }

  powerOn() {
    this.store.update((s) => { s.desktop.power = 'on'; s.desktop.locked = false; s.flags['desktop.off'] = false; s.flags['desktop.locked'] = false; }, 'desktop-on');
    bus.emit('desktop:poweredOn', {});
  }

  renderLock() {
    const off = this.desk.power === 'off';
    const locked = !!this.desk.locked;
    const key = off ? 'off' : locked ? `locked:${this.world.clock.minutes}` : '';
    if (key === this.lockKey) return;
    this.lockKey = key;
    clear(this.lockEl);
    this.lockEl.hidden = !off && !locked;
    this.lockEl.classList.toggle('is-off', off);
    if (off) {
      this.lockEl.append(el('div', { class: 'dk-lock-card' }, [
        el('p', { class: 'dk-lock-sub', text: 'This computer is switched off.' }),
        el('button', { class: 'tb-btn primary', type: 'button', onclick: () => this.powerOn() }, [icon('play'), 'Turn it back on'])
      ]));
      return;
    }
    if (!locked) return;
    const user = (this.product.desktop && this.product.desktop.user) || { name: 'User' };
    this.lockEl.append(el('div', { class: 'dk-lock-card' }, [
      el('b', { class: 'dk-lock-time', text: format(this.world.clock.minutes) }),
      el('small', { text: (this.product.desktop && this.product.desktop.date) || '' }),
      el('span', { class: 'dk-avatar dk-lock-avatar', text: user.name[0] }),
      el('b', { text: user.name }),
      el('p', { class: 'dk-lock-sub' }, [icon('lock'), ' Locked. Everything is still open underneath.']),
      el('button', { class: 'tb-btn primary', type: 'button', onclick: () => this.unlock() }, [icon('unlock'), 'Unlock'])
    ]));
  }

  buildWindow(w) {
    const app = this.apps.get(w.app);
    const titleEl = el('span', { class: 'dk-title-text', text: w.title });
    const bar = el('div', { class: 'dk-titlebar', ondblclick: () => this.toggleMax(w.id) }, [
      el('span', { class: 'dk-title-icon', style: { background: app ? app.colour : '#3b4660' } }, [icon(app ? app.icon : 'files')]),
      titleEl,
      el('div', { class: 'dk-controls' }, [
        el('button', { class: 'dk-ctl', type: 'button', 'aria-label': `Minimise ${w.title}`, onclick: () => this.minimise(w.id) }, [icon('minus')]),
        el('button', { class: 'dk-ctl', type: 'button', 'aria-label': `Maximise ${w.title}`, onclick: () => this.toggleMax(w.id) }, [icon('maximize')]),
        el('button', { class: 'dk-ctl dk-close', type: 'button', 'aria-label': `Close ${w.title}`, onclick: () => this.close(w.id) }, [icon('close')])
      ])
    ]);
    bar.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('button')) this.onDragStart(ev, w.id, 'move'); });
    const body = el('div', { class: 'dk-body' });
    if (app) body.append(app.mount(this.ctx(w), w.params || {}));
    const grip = el('div', { class: 'dk-grip', 'aria-hidden': 'true' });
    grip.addEventListener('pointerdown', (ev) => this.onDragStart(ev, w.id, 'resize'));
    const root = el('section', {
      class: `dk-window dk-app-${w.app}`, role: 'dialog', 'aria-label': w.title, tabindex: '-1',
      onpointerdown: () => { if (this.desk.focus !== w.id) this.focus(w.id); }
    }, [bar, body, grip]);
    return { root, body, titleEl };
  }

  // ------------------------------------------------------------ taskbar
  renderTaskbar() {
    clear(this.taskbarEl);
    const d = this.desk;
    const pinned = [...this.apps.values()].filter((a) => a.pinned);
    const running = d.windows.map((w) => w.app);
    const appBtn = (app) => {
      const open = d.windows.find((w) => w.app === app.id);
      const badge = app.badge ? app.badge(this.world) : 0;
      return el('button', {
        class: `dk-task ${open ? 'is-open' : ''} ${open && d.focus === open.id ? 'is-on' : ''}`, type: 'button',
        'aria-label': badge ? `${app.title}, ${badge} new` : app.title, title: app.title, dataset: { app: app.id },
        onclick: () => {
          if (!open) { this.open(app.id); return; }
          if (d.focus === open.id && !open.min) this.minimise(open.id); else this.focus(open.id);
        }
      }, [
        el('span', { class: 'dk-task-icon', style: { background: app.colour || '#3b4660' } }, [icon(app.icon)]),
        badge ? el('span', { class: 'dk-task-badge', text: String(badge) }) : null
      ]);
    };
    const extraRunning = [...new Set(running)].filter((id) => !pinned.find((p) => p.id === id)).map((id) => this.apps.get(id)).filter(Boolean);
    const unread = this.toastLog.filter((t) => !t.seen).length;
    this.taskbarEl.append(
      el('button', { class: 'dk-start', type: 'button', 'aria-label': 'Start', onclick: () => this.toggleStart() }, [
        el('span', { class: 'dk-start-logo', text: (this.product.desktop && this.product.desktop.startLabel) || 'Start' })
      ]),
      el('div', { class: 'dk-tasks' }, [...pinned, ...extraRunning].map(appBtn)),
      el('div', { class: 'dk-tray' }, [
        el('button', { class: 'dk-bell dk-lockbtn', type: 'button', 'aria-label': 'Lock the screen (Windows key + L)', title: 'Lock (Win+L)', onclick: () => this.lock() }, [icon('lock')]),
        icon('wifi'), icon('soundOn'),
        el('button', { class: 'dk-bell', type: 'button', 'aria-label': unread ? `${unread} notifications` : 'Notifications', onclick: () => this.toggleCentre() }, [icon('bell'), unread ? el('span', { class: 'dk-dot' }) : null]),
        el('span', { class: 'dk-clock' }, [el('b', { text: format(this.world.clock.minutes) }), el('small', { text: (this.product.desktop && this.product.desktop.date) || '' })])
      ])
    );
  }

  toggleStart(force) {
    const open = force ?? this.startEl.hidden;
    this.startEl.hidden = !open;
    if (!open) return;
    clear(this.startEl);
    const search = el('input', { class: 'dk-search', type: 'text', placeholder: 'Search apps', 'aria-label': 'Search apps', spellcheck: 'false', autocomplete: 'off' });
    const grid = el('div', { class: 'dk-start-grid' });
    const fill = (q = '') => {
      clear(grid);
      for (const app of this.apps.values()) {
        if (app.hidden || (q && !app.title.toLowerCase().includes(q.toLowerCase()))) continue;
        grid.append(el('button', { class: 'dk-start-app', type: 'button', onclick: () => { this.toggleStart(false); this.open(app.id); } }, [
          el('span', { class: 'dk-icon-glyph', style: { background: app.colour || '#3b4660' } }, [icon(app.icon)]),
          el('span', { text: app.title })
        ]));
      }
    };
    search.addEventListener('input', () => fill(search.value));
    fill();
    const user = this.product.desktop && this.product.desktop.user;
    const power = el('div', { class: 'dk-power' }, [
      el('button', { class: 'dk-power-btn', type: 'button', dataset: { power: 'lock' }, onclick: () => this.lock() }, [icon('lock'), 'Lock']),
      el('button', { class: 'dk-power-btn', type: 'button', dataset: { power: 'off' }, onclick: () => this.shutDown() }, [icon('phoneOff'), 'Shut down'])
    ]);
    this.startEl.append(...[search, grid, user ? el('div', { class: 'dk-start-user' }, [el('span', { class: 'dk-avatar', text: user.name[0] }), el('span', { class: 'dk-start-who' }, [el('b', { text: user.name }), el('small', { text: user.account || '' })]), power]) : power].filter(Boolean));
    setTimeout(() => search.focus(), 0);
  }

  toggleCentre() {
    this.centreEl.hidden = !this.centreEl.hidden;
    if (this.centreEl.hidden) return;
    this.toastLog.forEach((t) => { t.seen = true; });
    clear(this.centreEl);
    this.centreEl.append(el('h3', { text: 'Notifications' }),
      this.toastLog.length ? el('ul', {}, this.toastLog.slice(0, 12).map((t) => el('li', {}, [el('b', { text: t.title }), el('span', { text: t.body || '' }), el('small', { text: t.at })]))) : el('p', { class: 'muted', text: 'Nothing new.' }));
    this.renderTaskbar();
  }

  contextMenu(ev, items) {
    ev.preventDefault();
    ev.stopPropagation();
    clear(this.menuEl);
    for (const it of items) {
      if (it === '-') { this.menuEl.append(el('hr')); continue; }
      this.menuEl.append(el('button', { class: 'dk-context-item', type: 'button', role: 'menuitem', onclick: () => { this.menuEl.hidden = true; it.run(); } }, [it.icon ? icon(it.icon) : null, it.label]));
    }
    const r = this.screen.root.getBoundingClientRect();
    const k = r.width / this.screen.root.offsetWidth || 1;
    this.menuEl.style.left = `${(ev.clientX - r.left) / k}px`;
    this.menuEl.style.top = `${(ev.clientY - r.top) / k}px`;
    this.menuEl.hidden = false;
    const first = this.menuEl.querySelector('button');
    if (first) first.focus();
  }

  // ------------------------------------------------------------ windows
  open(appId, params = {}) {
    const app = this.apps.get(appId);
    if (!app) return null;
    const existing = this.desk.windows.find((w) => w.app === appId);
    if (existing) {
      this.store.update((s) => {
        const w = s.desktop.windows.find((x) => x.id === existing.id);
        if (w && Object.keys(params).length) w.params = { ...(w.params || {}), ...params };
      }, 'window-params');
      this.focus(existing.id);
      bus.emit('app:opened', { device: 'desktop', app: appId, params });
      return existing.id;
    }
    const n = this.desk.windows.length;
    const W = this.screen.pxWidth;
    const H = this.screen.pxHeight - 44;
    const w = Math.min(app.w || 760, W - 40);
    const h = Math.min(app.h || 480, H - 30);
    const id = `${appId}-${Date.now().toString(36)}`;
    this.store.update((s) => {
      s.desktop.z += 1;
      s.desktop.windows.push({
        id, app: appId, title: app.title,
        x: Math.round(Math.min(W - w - 10, 70 + n * 34 + (app.x || 0))),
        y: Math.round(Math.min(H - h - 6, 26 + n * 28 + (app.y || 0))),
        w, h, z: s.desktop.z, min: false, max: !!app.max, params
      });
      s.desktop.focus = id;
    }, 'window-open');
    audio.play('click');
    bus.emit('app:opened', { device: 'desktop', app: appId, params });
    return id;
  }

  focus(id) {
    this.store.update((s) => {
      const w = s.desktop.windows.find((x) => x.id === id);
      s.desktop.z += 1;
      if (w) { w.z = s.desktop.z; w.min = false; }
      s.desktop.focus = id;
    }, 'window-focus');
  }

  minimise(id) {
    this.store.update((s) => {
      const w = s.desktop.windows.find((x) => x.id === id);
      if (w) w.min = true;
      if (s.desktop.focus === id) s.desktop.focus = null;
    }, 'window-min');
  }

  toggleMax(id) {
    this.store.update((s) => { const w = s.desktop.windows.find((x) => x.id === id); if (w) w.max = !w.max; }, 'window-max');
  }

  close(id) {
    const w = this.desk.windows.find((x) => x.id === id);
    this.store.update((s) => {
      s.desktop.windows = s.desktop.windows.filter((x) => x.id !== id);
      if (s.desktop.focus === id) s.desktop.focus = null;
    }, 'window-close');
    bus.emit('app:closed', { device: 'desktop', app: w && w.app, windowId: id });
  }

  // Pointer pixels are screen pixels; the desktop may be drawn at another
  // scale (projected, or laid flat and scaled), so divide by it.
  scale() {
    const r = this.screen.root.getBoundingClientRect();
    return r.width / (this.screen.root.offsetWidth || 1) || 1;
  }

  onDragStart(ev, id, mode) {
    const w = this.desk.windows.find((x) => x.id === id);
    if (!w || w.max || this.compact) return;
    this.focus(id);
    this.drag = { id, mode, sx: ev.clientX, sy: ev.clientY, ox: w.x, oy: w.y, ow: w.w, oh: w.h, k: this.scale() };
    ev.preventDefault();
  }

  onDragMove(ev) {
    const d = this.drag;
    if (!d) return;
    const node = this.mounted.get(d.id);
    if (!node) return;
    const dx = (ev.clientX - d.sx) / d.k;
    const dy = (ev.clientY - d.sy) / d.k;
    if (d.mode === 'move') {
      d.x = Math.max(-d.ow + 80, Math.min(this.screen.pxWidth - 80, d.ox + dx));
      d.y = Math.max(0, Math.min(this.screen.pxHeight - 80, d.oy + dy));
      node.root.style.transform = `translate(${d.x}px, ${d.y}px)`;
    } else {
      d.w = Math.max(320, d.ow + dx);
      d.h = Math.max(220, d.oh + dy);
      node.root.style.width = `${d.w}px`;
      node.root.style.height = `${d.h}px`;
    }
  }

  onDragEnd() {
    const d = this.drag;
    this.drag = null;
    if (!d || (d.x === undefined && d.w === undefined)) return;
    this.store.update((s) => {
      const w = s.desktop.windows.find((n) => n.id === d.id);
      if (!w) return;
      if (d.x !== undefined) { w.x = Math.round(d.x); w.y = Math.round(d.y); }
      if (d.w !== undefined) { w.w = Math.round(d.w); w.h = Math.round(d.h); }
    }, 'window-move');
  }

  toast(t) {
    const entry = { ...t, at: format(this.world.clock.minutes), seen: false };
    this.toastLog.unshift(entry);
    const node = el('button', {
      class: 'dk-toast', type: 'button',
      onclick: () => { node.remove(); if (t.app && this.apps.get(t.app)) this.open(t.app, t.params || {}); }
    }, [
      el('span', { class: 'dk-toast-icon', style: { background: (this.apps.get(t.app) || {}).colour || '#3b4660' } }, [icon((this.apps.get(t.app) || {}).icon || 'bell')]),
      el('span', { class: 'dk-toast-text' }, [el('b', { text: t.title }), t.body ? el('span', { text: t.body }) : null])
    ]);
    this.toastEl.append(node);
    this.renderTaskbar();
    setTimeout(() => node.classList.add('is-out'), 6000);
    setTimeout(() => node.remove(), 6600);
  }
}
