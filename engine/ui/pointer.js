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
// How long the guide waits, with the player idle in the room, before it takes
// them to the next step itself. On Guided (easy) it drives almost at once.
const IDLE_FLY_MS = { easy: 1600, training: 1600, normal: 3200 };
const SWITCH_MS = { easy: 2200, training: 2200, normal: 4200 };
// The hardest modes are played without a guide; every other mode is led.
const UNGUIDED = ['expert', 'assessment'];

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
    // Back in the room with a step still to do: lead again, the same as at the start.
    bus.on('room:returned', () => this.armIdle());
    bus.on('world:changed', () => this.soon());
    bus.on('device:live', () => this.soon());
    bus.on('app:opened', () => this.soon());
    this.timer = setInterval(() => this.tick(), 450);
    // The player doing anything themselves means the guide should not take over.
    window.addEventListener('pointerdown', () => this.cancelIdle(), true);
    window.addEventListener('keydown', () => this.cancelIdle(), true);
  }

  setStep(d) {
    // A to do list re-leads within the same stage; only a new place resets the ride.
    if (!this.data || d.stage !== this.data.stage || d.target !== this.data.target) this.switched = false;
    this.data = d;
    this.lastEl = null;
    this.clearMark();
    this.armIdle();
    this.soon();
  }

  clearStep() { this.data = null; this.cancelIdle(); this.cancelSwitch(); this.clearMark(); }

  soon() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.tick(); });
  }

  // ------------------------------------------------------------ idle ride
  // A step has started and the player is standing back in the room, doing
  // nothing: after a few seconds the guide takes them there, once. Only in
  // any mode that has a guide (everything but Expert and Assessment).
  armIdle() {
    this.cancelIdle();
    const e = this.engine;
    if (!this.data || !this.data.target || !load('guide', true) || UNGUIDED.includes(e.mode) || e.shell.pendingNext) return;
    const ms = IDLE_FLY_MS[e.mode] ?? IDLE_FLY_MS.normal;
    bus.emit('coach:autoride', { ms });
    this.idle = setTimeout(() => {
      this.idle = null;
      bus.emit('coach:autoride', { ms: 0 });
      const d = this.data;
      if (!d || !d.target || e.liveScreen || e.rig.flight) return;
      if (e.overlay && e.overlay.open) return;
      // Parked at an object in the room with the step somewhere else: step back first.
      if (!e.rig.isOverview()) {
        if (e.rig.currentPose === d.target) return;
        bus.emit('room:back', {});
        setTimeout(() => bus.emit('coach:goto', { target: d.target }), 750);
        return;
      }
      if (e.shell.canReach && !e.shell.canReach(d.target)) return;
      const label = (e.interaction.get(d.target) || {}).label;
      if (label) bus.emit('caption', { speaker: 'Guide', text: `Taking you to the ${label.toLowerCase()}.`, ms: 2600 });
      bus.emit('coach:goto', { target: d.target });
    }, ms);
  }

  cancelIdle() {
    if (this.idle) { clearTimeout(this.idle); this.idle = null; bus.emit('coach:autoride', { ms: 0 }); }
    // Doing something yourself also stops a pending switch to the other device.
    this.cancelSwitch();
  }

  cancelSwitch() { if (this.switchTimer) { clearTimeout(this.switchTimer); this.switchTimer = null; } }

  // ------------------------------------------------------- the wrong place
  // The player is on one device but this step is done somewhere else (the
  // computer, the door, the school bag). Ring the Back button with where to go,
  // and on a guided mode take them there after a moment, once per step.
  elsewhere(e, d) {
    const here = e.liveScreen;
    if (!d || !here) return null;
    const pts = d.points || [];
    if (pts.some((p) => POSE[p.device || 'desktop'] === here)) return null;
    if (!d.target || d.target === here) return null;
    if (e.shell.canReach && !e.shell.canReach(d.target)) return null;
    // A call or a sign in prompt on the phone is the player's to deal with first.
    const ph = this.store.get().phone;
    if (here === 'phone' && (ph.call || (ph.pushes || []).some((q) => q.state === 'pending'))) return null;
    return (e.interaction.get(d.target) || {}).label || null;
  }

  armSwitch(e, target) {
    if (this.switched || this.switchTimer || UNGUIDED.includes(e.mode)) return;
    this.switched = true;
    const step = this.data;
    this.switchTimer = setTimeout(() => {
      this.switchTimer = null;
      if (!this.data || this.data !== step || !e.liveScreen || e.liveScreen === target || e.shell.pendingNext) return;
      if (e.overlay && e.overlay.open) return;
      const label = (e.interaction.get(target) || {}).label;
      if (label) bus.emit('caption', { speaker: 'Guide', text: `This step is at the ${label.toLowerCase()}. Taking you there.`, ms: 2600 });
      bus.emit('room:back', {});
      setTimeout(() => bus.emit('coach:goto', { target }), 750);
    }, SWITCH_MS[e.mode] ?? SWITCH_MS.normal);
  }

  // ------------------------------------------------------------- pointing
  tick() {
    const e = this.engine;
    const d = this.data;
    // A card asking the player to choose: ring the choice this step wants.
    if (d && e.overlay && e.overlay.open && load('guide', true) && !UNGUIDED.includes(e.mode)) {
      const want = d.events || [];
      const pick = [...e.overlay.root.querySelectorAll('.ov-buttons [data-emit]')].find((b) => b.dataset.emit && want.includes(b.dataset.emit));
      if (pick) { this.mark(pick, 'Choose this', e.overlay.root); return; }
      this.clearMark();
      return;
    }
    if (!d || !load('guide', true) || e.shell.pendingNext || !e.liveScreen) { this.clearMark(); return; }
    const away = this.elsewhere(e, d);
    if (away) {
      const back = this.visible(e.shell.backBtn);
      if (back) this.mark(back, `Next: the ${away.toLowerCase()}`, e.shell.stage);
      this.armSwitch(e, d.target);
      return;
    }
    if (!d.points || !d.points.length) { this.clearMark(); return; }
    // A locked phone comes first: nothing on it can be done until it is open.
    const ph = this.store.get().phone;
    // (A call or a sign in prompt shows over the lock screen, so those come first.)
    // Only what is actually up on screen counts: a pending prompt that waits as
    // a notification on the lock screen still needs the phone unlocked first.
    const sheetUp = e.liveScreen === 'phone' && !!this.visible(e.screens.phone.root.querySelector('.sheet-deny'));
    const busy = !!ph.call || sheetUp;
    if (e.liveScreen === 'phone' && ph.locked && !busy && (d.target === 'phone' || d.points.some((p) => p.device === 'phone'))) {
      const found = this.lockStep(e);
      if (found) { this.mark(found.el, found.label, e.screens.phone.root); return; }
      this.clearMark();
      return;
    }
    // On a call or in a meeting, the careful line comes first.
    const said = this.callStep(e, d, true);
    if (said) { this.mark(said.el, said.label, e.screens[e.liveScreen].root); return; }
    for (const pt of d.points) {
      if (pt.room || this.skip(pt) || POSE[pt.device || 'desktop'] !== e.liveScreen) continue;
      const found = this.resolve(pt, e);
      if (found) { this.mark(found.el, found.label, e.screens[e.liveScreen].root); return; }
    }
    // A call in progress: answer it, say the careful line, or hang up.
    const call = this.callStep(e, d);
    if (call) { this.mark(call.el, call.label, e.screens[e.liveScreen].root); return; }
    // Nothing left to press on this device, but the step has work on another
    // one (deny the prompts on the phone, then change the password on the
    // computer): ring Back with where to go next, and take the player there.
    const placeOf = (p) => p.room || POSE[p.device || 'desktop'];
    const other = !busy && d.points.find((p) => !p.soft && !this.skip(p) && placeOf(p) !== e.liveScreen && e.interaction.get(placeOf(p)));
    if (other) {
      const target = placeOf(other);
      // The step now continues over there: the coach's ride, the marker in the
      // room and the guide's own drive all point at the new place.
      if (d.target !== target) {
        d.target = target;
        if (e.hotspots) { e.hotspots.clear(); e.hotspots.show(target, { label: 'Next step' }); }
        e.shell.renderCoach();
      }
      const back = this.visible(e.shell.backBtn);
      if (back) this.mark(back, `Next: the ${(e.interaction.get(target).label || target).toLowerCase()}`, e.shell.stage);
      this.armSwitch(e, target);
      return;
    }
    this.clearMark();
  }

  // A call on the phone or the desk phone. The guide answers (the lesson is
  // in hearing the pitch and turning it down), rings the reply the scenario
  // scores as careful, and if there is no good reply on offer, Hang up. While
  // the caller is talking there is nothing to press.
  callStep(e, d, choicesOnly = false) {
    const root = e.screens[e.liveScreen] && e.screens[e.liveScreen].root;
    if (!root) return null;
    const good = (d && d.choices) || [];
    for (const id of good) {
      const c = this.visible(root.querySelector(`.call-choice[data-choice="${id}"], .dp-choice[data-choice="${id}"]`));
      if (c) return { el: c, label: 'Say this' };
    }
    if (choicesOnly) return null;
    if (root.querySelector('.call-choices, .dp-choices')) {
      const end = this.visible(root.querySelector('.call-screen.is-active .call-end, .dp-call-view.is-active .dp-end'));
      if (end) return { el: end, label: 'Hang up' };
    }
    const answer = this.visible(root.querySelector('.call-screen.is-ringing .call-accept, .dp-call-view.is-ringing .dp-call'));
    if (answer) return { el: answer, label: 'Answer, and listen' };
    return null;
  }

  // A point already done: its world path (skipIf) or flag (skipIfFlag) is set.
  skip(pt) {
    const w = this.store.get();
    if (pt.skipIfFlag && w.flags && w.flags[pt.skipIfFlag]) return true;
    if (pt.skipIf && pt.skipIf.split('.').reduce((o, k) => (o == null ? o : o[k]), w)) return true;
    return false;
  }

  // The lock screen, step by step. If the PIN has not been found, the guide
  // takes the player to where it is written; once it is known, it rings each
  // digit in turn.
  lockStep(e) {
    const world = this.store.get();
    const root = e.screens.phone.root;
    const pin = String(world.phone.pin || '');
    if (!pin) return null;
    if (!world.phone.pinKnown) {
      const object = e.product.phone && e.product.phone.pinObject;
      if (object && !this.fetching) {
        this.fetching = true;
        bus.emit('caption', { speaker: 'Guide', text: 'You need the PIN first. It is written down nearby, so let us go and find it.', ms: 4200 });
        setTimeout(() => {
          this.fetching = false;
          const w = this.store.get();
          if (!e.liveScreen || !w.phone.locked || w.phone.pinKnown || w.phone.call) return;
          bus.emit('room:back', {});
          setTimeout(() => bus.emit('coach:goto', { target: object }), 700);
        }, 2600);
      }
      return null;
    }
    const digit = pin[(e.phoneOS.pinEntry || '').length];
    if (digit === undefined) return null;
    for (const key of root.querySelectorAll('.ph-key')) {
      const b = key.querySelector('b');
      if (b && b.textContent === digit) { const v = this.visible(key); return v ? { el: v, label: `Tap ${digit}` } : null; }
    }
    return null;
  }

  resolve(pt, e) {
    const root = e.screens[e.liveScreen].root;
    const world = this.store.get();
    const device = pt.device || 'desktop';
    const app = pt.app;
    // Get into the app first.
    if (app && device === 'desktop') {
      const open = world.desktop.windows.some((w) => w.app === app && !w.min);
      // A soft point only rings what is already on screen.
      if (!open) return pt.soft ? null : this.launcher(root, app, e);
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
    let top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    // A notification sitting on the very thing the guide wants pressed goes
    // away (it is still in the notification centre).
    const toast = top && top.closest && top.closest('.dk-toasts > *');
    if (toast && !node.contains(toast)) {
      toast.remove();
      top = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(r.height / 2, 24));
    }
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
