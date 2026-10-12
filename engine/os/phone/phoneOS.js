import { el, clear } from '../../core/dom.js';
import { bus } from '../../core/bus.js';
import { format } from '../../core/clock.js';
import { audio } from '../../core/audio.js';
import { speak, hush } from '../../core/voice.js';
import { icon } from '../../ui/icons.js';
import { statusBar } from '../link.js';

// The phone is a small, real operating system: lock screen with a PIN,
// notifications, a home screen, apps, incoming calls and sign in prompts. It
// renders from the world store, so a rewind redraws it exactly.
//
// Apps are modules: { id, name, icon, colour, dock?, badge(world), mount(ctx),
// update(ctx, node) }. The product decides which apps the phone has.
export class PhoneOS {
  constructor({ screen, store, sites, vars, product, apps }) {
    this.screen = screen;
    this.store = store;
    this.sites = sites;
    this.vars = vars;
    this.product = product;
    this.apps = new Map(apps.map((a) => [a.id, a]));
    this.nodes = new Map();
    this.bar = statusBar();
    this.pinEntry = '';
    this.pendingOpen = null;
    this.callTimer = null;
  }

  get world() { return this.store.get(); }
  get phone() { return this.store.get().phone; }

  mount() {
    const root = this.screen.root;
    root.classList.add('phone-os');
    this.statusEl = el('div', { class: 'ph-status' });
    this.viewEl = el('div', { class: 'ph-view' });
    this.bannerEl = el('div', { class: 'ph-banners', 'aria-live': 'polite' });
    this.sheetEl = el('div', { class: 'ph-sheet-layer' });
    this.callEl = el('div', { class: 'ph-call-layer' });
    // A comfortable tap target across the bottom of the phone, with the home
    // indicator drawn in the middle of it, so getting back to the home screen
    // from any app is a reliable tap, not a hit on a hairline.
    this.homeBar = el('button', { class: 'ph-homebar', type: 'button', 'aria-label': 'Home screen', title: 'Home', onclick: () => this.goHome() }, [el('span', { class: 'ph-homebar-pill' })]);
    root.append(this.statusEl, this.viewEl, this.sheetEl, this.callEl, this.bannerEl, this.homeBar, this.bar);

    bus.on('world:changed', () => this.render());
    bus.on('clock:changed', () => this.renderStatus());
    bus.on('phone:banner', (n) => this.banner(n));
    bus.on('call:ended', () => { clearInterval(this.callTimer); });
    this.render();
    return this;
  }

  ctx() {
    return {
      os: this, world: this.world, store: this.store, sites: this.sites, vars: this.vars,
      product: this.product, bar: this.bar, device: 'phone',
      open: (id, view) => this.openApp(id, view), home: () => this.goHome(),
      view: (id) => this.phone.view[id] || {},
      setView: (id, patch) => this.store.update((s) => { s.phone.view[id] = { ...(s.phone.view[id] || {}), ...patch }; }, 'phone-view')
    };
  }

  // ------------------------------------------------------------ render
  renderStatus() {
    clear(this.statusEl);
    this.statusEl.append(
      el('span', { class: 'ph-time', text: format(this.world.clock.minutes) }),
      el('span', { class: 'ph-island' }),
      el('span', { class: 'ph-meta' }, [icon('signal'), icon('wifi'), el('span', { class: 'ph-bat' }, [icon('battery'), el('small', { text: '64' })])])
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
    this.renderStatus();
    this.renderCall();
    this.renderSheet();
    const p = this.phone;
    this.screen.root.classList.toggle('is-locked', p.locked);
    if (p.locked) { this.renderLock(); return; }
    if (!p.app) { this.renderHome(); return; }
    const app = this.apps.get(p.app);
    if (!app) { this.renderHome(); return; }
    let node = this.nodes.get(app.id);
    const ctx = this.ctx();
    if (!node) {
      node = app.mount(ctx);
      this.nodes.set(app.id, node);
    } else if (app.update) {
      app.update(ctx, node);
    }
    if (this.viewEl.firstChild !== node) { clear(this.viewEl); this.viewEl.append(node); }
    this.viewEl.className = `ph-view ph-app ph-app-${app.id}`;
  }

  renderLock() {
    clear(this.viewEl);
    this.viewEl.className = 'ph-view ph-lock';
    const p = this.phone;
    const dots = el('div', { class: 'ph-dots', 'aria-hidden': 'true' },
      [0, 1, 2, 3].map((i) => el('span', { class: `ph-dot ${i < this.pinEntry.length ? 'is-on' : ''}` })));
    const hint = el('p', { class: 'ph-pin-hint', text: p.pinKnown ? (this.product.phone.pinHintKnown || 'Enter the PIN') : (this.product.phone.pinHint || 'Enter the PIN') });

    const press = (d) => {
      if (this.pinEntry.length >= 4) return;
      this.pinEntry += d;
      audio.play('tap');
      if (this.pinEntry.length === 4) {
        const ok = this.pinEntry === p.pin;
        this.pinEntry = '';
        if (ok) {
          const open = this.pendingOpen;
          this.pendingOpen = null;
          this.store.update((s) => {
            s.phone.locked = false;
            s.phone.app = open ? open.app : null;
            if (open && open.threadId) s.phone.view.messages = { ...(s.phone.view.messages || {}), thread: open.threadId };
            if (open && open.chatId) s.phone.view.chat = { ...(s.phone.view.chat || {}), chat: open.chatId };
          }, 'phone-unlock');
          bus.emit('phone:unlocked', { openedFrom: open ? 'notification' : 'lockscreen' });
          if (open) this.announceOpen(open);
          audio.play('unlock');
          return;
        }
        bus.emit('phone:pinFailed', {});
        audio.play('error');
        this.viewEl.querySelector('.ph-dots')?.classList.add('is-wrong');
        setTimeout(() => this.render(), 350);
        return;
      }
      this.render();
    };

    const pad = el('div', { class: 'ph-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((d) => {
      if (d === '') return el('span');
      if (d === 'del') return el('button', { class: 'ph-key ph-key-del', type: 'button', 'aria-label': 'Delete', onclick: () => { this.pinEntry = this.pinEntry.slice(0, -1); this.render(); } }, [icon('back')]);
      return el('button', { class: 'ph-key', type: 'button', onclick: () => press(d) }, [el('b', { text: d })]);
    }));

    const notes = el('div', { class: 'ph-lock-notes' }, p.notifications.slice(-3).reverse().map((n) => el('button', {
      class: `ph-note ${this.pendingOpen && this.pendingOpen.id === n.id ? 'is-picked' : ''}`, type: 'button',
      onclick: () => { this.pendingOpen = n; bus.emit('notification:tapped', n); this.render(); }
    }, [
      el('div', { class: 'ph-note-top' }, [el('span', { class: 'ph-note-app', text: n.appName }), el('span', { class: 'ph-note-at', text: n.at || 'now' })]),
      el('div', { class: 'ph-note-title', text: n.title }),
      el('div', { class: 'ph-note-body', text: n.body })
    ])));

    this.viewEl.append(
      el('div', { class: 'ph-lock-clock' }, [
        el('div', { class: 'ph-lock-date', text: this.product.phone.date || 'Thursday 6 November' }),
        el('div', { class: 'ph-lock-time', text: format(this.world.clock.minutes) })
      ]),
      notes,
      el('div', { class: 'ph-lock-auth' }, [icon('lock', 'ph-lock-icon'), dots, hint, pad])
    );
  }

  announceOpen(n) {
    if (n.app === 'messages' && n.threadId) {
      const t = this.phone.threads.find((x) => x.id === n.threadId);
      bus.emit('sms:opened', { threadId: n.threadId, genuine: !!(t && t.genuine), from: t && t.from.number, via: 'notification' });
    }
    if (n.app === 'chat' && n.chatId) bus.emit('chat:opened', { chatId: n.chatId, via: 'notification' });
    bus.emit('notification:opened', n);
  }

  renderHome() {
    clear(this.viewEl);
    this.viewEl.className = 'ph-view ph-home';
    const tile = (app) => {
      const badge = app.badge ? app.badge(this.world) : 0;
      return el('button', {
        class: 'ph-app-btn', type: 'button', dataset: { app: app.id },
        onclick: () => this.openApp(app.id),
        'aria-label': badge ? `${app.name}, ${badge} new` : app.name
      }, [
        el('span', { class: 'ph-app-icon', style: { background: app.colour } }, [
          icon(app.icon), badge ? el('span', { class: 'ph-badge', text: String(badge) }) : null
        ]),
        el('span', { class: 'ph-app-name', text: app.name })
      ]);
    };
    const apps = [...this.apps.values()].filter((a) => !a.hidden);
    this.viewEl.append(
      el('div', { class: 'ph-widget' }, [
        el('div', { class: 'phw-time', text: format(this.world.clock.minutes) }),
        el('div', { class: 'phw-sub', text: this.product.phone.widget || '' })
      ]),
      el('div', { class: 'ph-grid' }, apps.filter((a) => !a.dock).map(tile)),
      el('div', { class: 'ph-dock' }, apps.filter((a) => a.dock).map(tile))
    );
  }

  openApp(id, view) {
    this.store.update((s) => {
      s.phone.app = id;
      if (view) s.phone.view[id] = { ...(s.phone.view[id] || {}), ...view };
    }, 'phone-app');
    bus.emit('app:opened', { device: 'phone', app: id });
    audio.play('tap');
  }

  goHome() {
    if (this.phone.locked) return;
    this.store.update((s) => { s.phone.app = null; }, 'phone-home');
    bus.emit('app:closed', { device: 'phone' });
  }

  banner(n) {
    if (this.phone.locked) return;
    const node = el('button', {
      class: 'ph-banner', type: 'button',
      onclick: () => {
        node.remove();
        this.openApp(n.app, n.threadId ? { thread: n.threadId } : n.chatId ? { chat: n.chatId } : null);
        this.announceOpen(n);
      }
    }, [
      el('div', { class: 'ph-note-top' }, [el('span', { class: 'ph-note-app', text: n.appName }), el('span', { class: 'ph-note-at', text: 'now' })]),
      el('div', { class: 'ph-note-title', text: n.title }),
      el('div', { class: 'ph-note-body', text: n.body })
    ]);
    this.bannerEl.append(node);
    setTimeout(() => node.classList.add('is-out'), 4600);
    setTimeout(() => node.remove(), 5200);
  }

  // ----------------------------------------------------------- calls
  renderCall() {
    const call = this.phone.call;
    this.screen.root.classList.toggle('in-call', !!call);
    if (!call) { clear(this.callEl); this.callKey = null; return; }
    const key = `${call.id}:${call.state}:${call.step ?? -1}:${(call.said || []).length}`;
    if (key === this.callKey) return;
    this.callKey = key;
    clear(this.callEl);

    const head = el('div', { class: 'call-head' }, [
      el('span', { class: 'call-avatar', text: (call.label || '?').replace(/[^A-Za-z]/g, '').slice(0, 1) || '#' }),
      el('div', { class: 'call-name', text: call.label }),
      el('div', { class: 'call-number', text: call.known ? call.number : `${call.number}${call.note ? ` · ${call.note}` : ''}` }),
      el('div', { class: 'call-state', text: call.state === 'ringing' ? 'incoming call' : call.state === 'active' ? 'on the call' : '' })
    ]);

    if (call.state === 'dialing') {
      this.callEl.append(el('div', { class: 'call-screen is-dialing' }, [
        el('div', { class: 'call-head' }, [
          el('span', { class: 'call-avatar', text: (call.label || '#').slice(0, 1) }),
          el('div', { class: 'call-name', text: call.label }),
          el('div', { class: 'call-number mono', text: call.number }),
          el('div', { class: 'call-state', text: 'calling' })
        ]),
        el('div', { class: 'call-actions' }, [
          el('button', { class: 'call-btn call-end', type: 'button', onclick: () => this.hangUp() }, [icon('phoneOff'), el('span', { text: 'End' })])
        ])
      ]));
      return;
    }

    if (call.state === 'ringing') {
      this.callEl.append(el('div', { class: 'call-screen is-ringing' }, [
        head,
        el('div', { class: 'call-actions' }, [
          el('button', { class: 'call-btn call-decline', type: 'button', onclick: () => this.declineCall() }, [icon('phoneOff'), el('span', { text: 'Decline' })]),
          el('button', { class: 'call-btn call-accept', type: 'button', onclick: () => this.answerCall() }, [icon('phone'), el('span', { text: 'Accept' })])
        ])
      ]));
      return;
    }

    const step = call.script[call.step] || null;
    const choices = step && step.choices ? step.choices : null;
    this.callEl.append(el('div', { class: 'call-screen is-active' }, [
      head,
      el('div', { class: 'call-transcript' }, (call.said || []).slice(-3).map((l) => el('p', { class: `call-line ${l.who === 'me' ? 'is-me' : ''}` }, [el('b', { text: l.who === 'me' ? 'You' : call.label }), ` ${l.text}`]))),
      choices ? el('div', { class: 'call-choices' }, choices.map((c) => el('button', {
        class: 'call-choice', type: 'button', dataset: { choice: c.id || '' }, onclick: () => this.chooseInCall(c)
      }, [c.label]))) : null,
      el('div', { class: 'call-actions' }, [
        el('button', { class: 'call-btn call-end', type: 'button', onclick: () => this.hangUp() }, [icon('phoneOff'), el('span', { text: 'Hang up' })])
      ])
    ]));
  }

  // A scenario picks up an outgoing call (or starts a scripted one).
  connect(def) {
    const cur = this.phone.call;
    this.store.update((s) => {
      s.phone.call = {
        ...(cur || {}), id: (cur && cur.id) || `call-${Date.now()}`,
        number: def.number || (cur && cur.number), label: def.label || (cur && cur.label),
        known: def.known ?? (cur && cur.known), voice: def.voice || {}, script: JSON.parse(JSON.stringify(def.script || [])),
        genuine: !!def.genuine, state: 'active', step: 0, said: [], outgoing: cur ? cur.outgoing : false
      };
    }, 'call-connect');
    bus.emit('call:connected', { number: this.phone.call.number, label: this.phone.call.label, genuine: !!def.genuine });
    this.playStep();
  }

  answerCall() {
    audio.stopLoop('ring');
    const call = this.phone.call;
    this.store.update((s) => { s.phone.call.state = 'active'; s.phone.call.step = 0; s.phone.call.said = []; }, 'call-answer');
    bus.emit('call:answered', { id: call.id, number: call.number, label: call.label, genuine: call.genuine });
    this.playStep();
  }

  declineCall() {
    audio.stopLoop('ring');
    const call = this.phone.call;
    this.store.update((s) => { s.phone.callLog.unshift({ ...call, state: 'declined' }); s.phone.call = null; }, 'call-decline');
    bus.emit('call:declined', { id: call.id, number: call.number, label: call.label, genuine: call.genuine });
  }

  hangUp() {
    hush();
    const call = this.phone.call;
    if (!call) return;
    this.store.update((s) => { s.phone.callLog.unshift({ ...call, state: 'ended' }); s.phone.call = null; }, 'call-hangup');
    bus.emit('call:ended', { id: call.id, by: 'me', step: call.step, genuine: call.genuine });
    bus.emit('call:hungup', { id: call.id, step: call.step, stepId: call.script[call.step] && call.script[call.step].id, genuine: call.genuine });
  }

  async playStep() {
    const call = this.phone.call;
    if (!call || call.state !== 'active') return;
    const step = call.script[call.step];
    if (!step) {
      bus.emit('call:finished', { id: call.id, genuine: call.genuine });
      return;
    }
    bus.emit('call:step', { id: call.id, step: call.step, stepId: step.id });
    if (step.say) {
      this.store.update((s) => { if (s.phone.call) s.phone.call.said = [...(s.phone.call.said || []), { who: 'them', text: step.say }]; }, 'call-say');
      await speak(step.say, { speaker: call.label, gender: call.voice.gender, tone: call.voice.tone });
    }
    const cur = this.phone.call;
    if (!cur || cur.id !== call.id || cur.state !== 'active') return;
    if (step.choices) { this.render(); return; }
    if (step.end) {
      this.store.update((s) => { s.phone.callLog.unshift({ ...s.phone.call, state: 'ended' }); s.phone.call = null; }, 'call-end');
      bus.emit('call:ended', { id: call.id, by: 'them', genuine: call.genuine });
      return;
    }
    this.store.update((s) => { if (s.phone.call) s.phone.call.step += 1; }, 'call-next');
    this.playStep();
  }

  chooseInCall(choice) {
    const call = this.phone.call;
    if (!call) return;
    this.store.update((s) => {
      s.phone.call.said = [...(s.phone.call.said || []), { who: 'me', text: choice.label }];
      const next = choice.goto !== undefined ? s.phone.call.script.findIndex((x) => x.id === choice.goto) : s.phone.call.step + 1;
      s.phone.call.step = next >= 0 ? next : s.phone.call.step + 1;
    }, 'call-choice');
    bus.emit('call:choice', { id: call.id, choice: choice.id, genuine: call.genuine });
    if (choice.hangUp) { this.hangUp(); return; }
    this.playStep();
  }

  // ------------------------------------------------ sign in prompts
  renderSheet() {
    const push = this.phone.pushes.find((p) => p.state === 'pending');
    if (!push || this.phone.locked || this.phone.call) { clear(this.sheetEl); this.sheetKey = null; return; }
    if (this.sheetKey === push.id) return;
    this.sheetKey = push.id;
    clear(this.sheetEl);
    const decide = (approved, picked) => {
      this.store.update((s) => {
        const p = s.phone.pushes.find((x) => x.id === push.id);
        if (p) p.state = approved ? 'approved' : 'denied';
      }, 'push-decide');
      bus.emit(approved ? 'push:approved' : 'push:denied', { id: push.id, genuine: push.genuine, picked, correct: picked === undefined ? undefined : picked === push.number });
    };
    this.sheetEl.append(el('div', { class: 'ph-sheet', role: 'dialog', 'aria-label': 'Sign in request' }, [
      el('div', { class: 'sheet-app' }, [icon('shield'), el('span', { text: this.product.authAppName || 'Authenticator' })]),
      el('h3', { text: 'Are you trying to sign in?' }),
      el('dl', { class: 'sheet-facts' }, [
        el('dt', { text: 'Account' }), el('dd', { text: push.account || '' }),
        el('dt', { text: 'Service' }), el('dd', { text: push.service || '' }),
        el('dt', { text: 'Location' }), el('dd', { text: push.location || 'Unknown' }),
        el('dt', { text: 'Device' }), el('dd', { text: push.device || 'Unknown' }),
        el('dt', { text: 'Time' }), el('dd', { text: push.at })
      ]),
      push.choices ? el('p', { class: 'sheet-q', text: 'Tap the number shown on the sign in screen' }) : null,
      push.choices ? el('div', { class: 'sheet-numbers' }, push.choices.map((n) => el('button', { class: 'sheet-num', type: 'button', dataset: { right: push.genuine && String(n) === String(push.number) ? '1' : '0' }, onclick: () => decide(true, n) }, [String(n)]))) : null,
      el('div', { class: 'sheet-actions' }, [
        el('button', { class: 'sheet-btn sheet-deny', type: 'button', onclick: () => decide(false) }, [icon('close'), 'No, it is not me']),
        push.choices ? null : el('button', { class: 'sheet-btn sheet-approve', type: 'button', onclick: () => decide(true) }, [icon('check'), 'Yes, approve'])
      ])
    ]));
  }

  setScale() {}
}
