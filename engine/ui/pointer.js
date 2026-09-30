import { bus } from '../core/bus.js';
import { load } from '../core/storage.js';

// The walkthrough's pointer. The coach card says what to do and flies the camera
// to the device; once the player is at the phone, the computer or the desk
// phone, this shows them the exact control: a pulsing ring on the button, with a
// small label, and if the right app is not open yet, on the way in to it. It
// follows the screen as apps redraw, and it never points at the risky choice.
//
// A step's points come from the scenario (stage.points) or, if it has none,
// from the product's event map (product.coachPoints) and the events the stage
// is waiting for. A point: { device, app, sel: [candidates in order], label:
// [one label per candidate] }. The first candidate that is on screen wins, so
// "Press Report phishing" only shows once an email is open, and "Open the
// email" shows until then.
const POSE = { desktop: 'computer', phone: 'phone', deskphone: 'deskphone' };
const IDLE_FLY_MS = 4200;

export class CoachPointer {
  constructor({ engine, store }) {
    this.engine = engine;
    this.store = store;
    this.data = null;
    this.marked = null;
    this.bubble = null;
    this.lastEl = null;
    this.idle = null;
    this.scrolled = new WeakSet();
    bus.on('coach:step', (d) => this.setStep(d));
    bus.on('stage:complete', () => this.clearStep());
    bus.on('scenario:complete', () => this.clearStep());
    bus.on('world:changed', () => this.soon());
    bus.on('device:live', () => this.soon());
    bus.on('app:opened', () => this.soon());
    this.timer = setInterval(() => this.tick(), 450);
    // The player doing anything themselves means the guide should not take over.
    window.addEventListener('pointerdown', () => this.cancelIdle(), true);
    window.addEventListener('keydown', () => this.cancelIdle(), true);
  }

  setStep(d) {
    this.data = d;
    this.lastEl = null;
    this.clearMark();
    this.armIdle();
    this.soon();
  }

  clearStep() { this.data = null; this.cancelIdle(); this.clearMark(); }

  soon() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.tick(); });
  }

  // ------------------------------------------------------------ idle ride
  // A step has started and the player is standing back in the room, doing
  // nothing: after a few seconds the guide takes them there, once. Only in
  // Training, where the guide is meant to lead.
  armIdle() {
    this.cancelIdle();
    const e = this.engine;
    if (!this.data || !this.data.target || !load('guide', true) || e.mode !== 'training') return;
    this.idle = setTimeout(() => {
      this.idle = null;
      const d = this.data;
      if (!d || !d.target || e.liveScreen || !e.rig.isOverview() || e.rig.flight) return;
      if (e.overlay && e.overlay.open) return;
      if (e.shell.canReach && !e.shell.canReach(d.target)) return;
      const label = (e.interaction.get(d.target) || {}).label;
      if (label) bus.emit('caption', { speaker: 'Guide', text: `Taking you to the ${label.toLowerCase()}.`, ms: 2600 });
      bus.emit('coach:goto', { target: d.target });
    }, IDLE_FLY_MS);
  }

  cancelIdle() { if (this.idle) { clearTimeout(this.idle); this.idle = null; } }

  // ------------------------------------------------------------- pointing
  tick() {
    const e = this.engine;
    const d = this.data;
    if (!d || !d.points || !d.points.length || !load('guide', true) || e.shell.pendingNext || !e.liveScreen) { this.clearMark(); return; }
    for (const pt of d.points) {
      if (POSE[pt.device || 'desktop'] !== e.liveScreen) continue;
      const found = this.resolve(pt, e);
      if (found) { this.mark(found.el, found.label, e.screens[e.liveScreen].root); return; }
    }
    this.clearMark();
  }

  resolve(pt, e) {
    const root = e.screens[e.liveScreen].root;
    const world = this.store.get();
    const device = pt.device || 'desktop';
    const app = pt.app;
    // Get into the app first.
    if (app && device === 'desktop') {
      const open = world.desktop.windows.some((w) => w.app === app && !w.min);
      if (!open) return this.launcher(root, app, e);
    }
    if (app && device === 'phone') {
      if (world.phone.locked) return null;
      if (world.phone.app !== app) {
        const tile = this.visible(root.querySelector(`.ph-app-btn[data-app="${app}"]`));
        if (tile) return { el: tile, label: `Open ${this.title(e, 'phone', app)}` };
        const home = this.visible(root.querySelector('.ph-homebar'));
        return home ? { el: home, label: 'Go home first' } : null;
      }
    }
    const scope = device === 'desktop' && app ? root.querySelector(`.dk-app-${app}`) || root : root;
    for (let i = 0; i < pt.sel.length; i++) {
      const found = this.visible(scope.querySelector(pt.sel[i]));
      if (found) return { el: found, label: (pt.label && (pt.label[i] || pt.label[0])) || 'Here' };
    }
    return null;
  }

  title(e, device, app) {
    const defs = device === 'phone' ? e.phoneOS.apps : e.desktopOS.apps;
    const a = defs && defs.get(app);
    return (a && (a.title || a.name)) || 'the app';
  }

  // The way in to an app on the computer: its start menu tile if the menu is
  // open, its taskbar button, its desktop icon, and failing all that the Start
  // button itself.
  launcher(root, app, e) {
    const name = this.title(e, 'desktop', app);
    for (const sel of [`.dk-start-app[data-app="${app}"]`, `.dk-task[data-app="${app}"]`, `.dk-icon[data-app="${app}"]`]) {
      const found = this.visible(root.querySelector(sel));
      if (found) return { el: found, label: `Open ${name}` };
    }
    const start = this.visible(root.querySelector('.dk-start'));
    return start ? { el: start, label: `Start menu, then ${name}` } : null;
  }

  // Something drawn, and on top: not hidden behind a window.
  visible(node) {
    if (!node) return null;
    let r = node.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    // A control below the fold of its own scrolling pane is still the right
    // one: bring it into view once, then judge it.
    if (!this.scrolled.has(node)) {
      this.scrolled.add(node);
      try { node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* older browser */ }
      r = node.getBoundingClientRect();
    }
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    return top && (node === top || node.contains(top) || top.contains(node)) ? node : null;
  }

  mark(node, label, root) {
    if (this.marked !== node) {
      this.clearMark();
      this.marked = node;
      node.classList.add('coach-mark');
      if (this.lastEl !== node) { this.lastEl = node; try { node.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* older browser */ } }
    }
    this.place(node, label, root);
  }

  // The label rides above the control (or below, near the top of the screen).
  place(node, label, root) {
    if (!this.bubble || this.bubble.parentNode !== root) {
      if (this.bubble) this.bubble.remove();
      this.bubble = document.createElement('div');
      this.bubble.className = 'coach-bubble';
      this.bubble.setAttribute('aria-hidden', 'true');
      root.append(this.bubble);
    }
    if (this.bubble.textContent !== label) this.bubble.textContent = label;
    const rr = root.getBoundingClientRect();
    const k = rr.width / (root.offsetWidth || 1) || 1;
    const r = node.getBoundingClientRect();
    const w = this.bubble.offsetWidth || 160;
    const h = this.bubble.offsetHeight || 34;
    const rootW = root.offsetWidth;
    let x = (r.left - rr.left) / k + (r.width / k - w) / 2;
    x = Math.max(6, Math.min(rootW - w - 6, x));
    const above = (r.top - rr.top) / k - h - 12;
    const below = (r.bottom - rr.top) / k + 12;
    const useBelow = above < 6;
    this.bubble.classList.toggle('is-below', useBelow);
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${useBelow ? below : above}px`;
    // The arrow points at the middle of the control, wherever the bubble sits.
    const cx = (r.left - rr.left) / k + r.width / k / 2;
    this.bubble.style.setProperty('--arrow', `${Math.max(14, Math.min(w - 14, cx - x))}px`);
  }

  clearMark() {
    if (this.marked) { this.marked.classList.remove('coach-mark'); this.marked = null; }
    document.querySelectorAll('.coach-mark').forEach((n) => n.classList.remove('coach-mark'));
    if (this.bubble) { this.bubble.remove(); this.bubble = null; }
  }
}
