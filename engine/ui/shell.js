import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { format } from '../core/clock.js';
import { icon } from './icons.js';
import { audio } from '../core/audio.js';
import { load, save } from '../core/storage.js';

// The frame round the room, laid out the way RansomLeak's player is: a story
// panel on the left, the room on the right.
//
//   story panel   brand, progress through the episode, the current moment in
//                 words, an insight, a log of the evening, and the objective
//                 with a hint on request
//   stage         the room, the player badge and clock, tools, captions, and
//                 a Back button whenever the camera is close up
//
// On a phone the story panel becomes a sheet under the room.
export class Shell {
  constructor({ root, product }) {
    this.product = product;
    this.root = root;
    root.classList.add('sim-app');
    root.dataset.product = product.id;

    this.buildSide();
    this.buildStage();
    root.append(this.side, this.stage);

    this.textSize = load('textSize', 'normal');
    this.applyTextSize();
    this.collapsed = load('sideCollapsed', false) && window.innerWidth > 760;
    this.applyCollapsed();

    bus.on('clock:changed', ({ label }) => { this.clock.textContent = label; });
    bus.on('objective', ({ text }) => this.setObjective(text));
    bus.on('hint', ({ text }) => this.offerHint(text));
    bus.on('scenario:start', (s) => this.setScenario(s));
    bus.on('insight', ({ text, title }) => this.setInsight(text, title));
    bus.on('beat', (b) => this.addBeat(b));
    bus.on('progress', (p) => this.setProgress(p));
    bus.on('camera:flightEnd', ({ pose }) => this.setFocused(pose !== 'overview', pose));
    bus.on('camera:flightStart', ({ pose }) => { if (pose === 'overview') this.setFocused(false); });
    bus.on('audio:muted', ({ muted }) => this.renderSound(muted));
    bus.on('checklist', ({ items }) => { this.checkItems = items || null; this.renderChecklist(); });
    bus.on('world:changed', ({ state }) => { if (this.checkItems) this.renderChecklist(state); });
    bus.on('scenario:start', () => { this.checkItems = null; this.renderChecklist(); clear(this.banner); });
  }

  // A to do list for scenarios with several jobs in any order. Each item is
  // ticked by a world flag, so a rewind unticks it again.
  renderChecklist(state) {
    const items = this.checkItems;
    this.checklist.hidden = !items;
    if (!items) return;
    const flags = (state || this.lastState || {}).flags || {};
    if (state) this.lastState = state;
    clear(this.checklist);
    for (const it of items) {
      const done = !!flags[it.flag];
      this.checklist.append(el('li', { class: done ? 'is-done' : '' }, [icon(done ? 'check' : 'target'), el('span', { text: it.label })]));
    }
  }

  // ---------------------------------------------------------------- side
  buildSide() {
    const p = this.product;
    this.pct = el('span', { class: 'sp-pct', text: '0%' });
    this.bar = el('i');
    this.dots = el('ol', { class: 'sp-dots', 'aria-hidden': 'true' });

    this.stepNum = el('span', { class: 'ss-num', text: '1' });
    this.stepKind = el('span', { class: 'ss-kind' });
    this.stepTitle = el('h2', { class: 'ss-title', text: p.title });
    this.stepBrief = el('p', { class: 'ss-brief', text: p.lede });
    this.insightTitle = el('span', { text: 'Insight' });
    this.insightText = el('p');
    this.insight = el('div', { class: 'ss-insight', hidden: true }, [
      el('div', { class: 'ssi-head' }, [icon('bulb'), this.insightTitle]), this.insightText
    ]);
    this.feed = el('ol', { class: 'feed-list' });
    this.checklist = el('ul', { class: 'ss-checklist', hidden: true, 'aria-label': 'Things to do' });

    this.objText = el('p', { class: 'so-text', text: 'Press start when you are ready.' });
    this.hintText = el('p', { class: 'so-hinttext', hidden: true });
    this.hintBtn = el('button', {
      class: 'so-hint', type: 'button', hidden: true,
      onclick: () => this.revealHint()
    }, [icon('bulb'), 'Show me a hint']);

    this.collapseBtn = el('button', {
      class: 'side-collapse', type: 'button', 'aria-label': 'Hide the story panel',
      onclick: () => { this.collapsed = !this.collapsed; save('sideCollapsed', this.collapsed); this.applyCollapsed(); }
    }, [icon('back')]);

    this.sheetBtn = el('button', {
      class: 'side-sheet-toggle', type: 'button', 'aria-expanded': 'false',
      onclick: () => this.toggleSheet()
    }, [el('span', { class: 'sst-grip' }), el('span', { class: 'sst-text', text: 'Story' })]);

    this.side = el('aside', { class: 'side', 'aria-label': 'Story' }, [
      this.sheetBtn,
      el('div', { class: 'side-head' }, [
        el('a', { class: 'side-brand', href: p.home || '#', target: '_blank', rel: 'noopener' }, [
          el('img', { src: `${import.meta.env.BASE_URL}${p.logo || 'logo.png'}`, alt: '', width: '32', height: '32' }),
          el('span', { class: 'sb-text' }, [el('b', { text: p.brand }), el('small', { text: p.episodeLabel })])
        ]),
        this.collapseBtn
      ]),
      el('div', { class: 'side-progress' }, [
        el('div', { class: 'sp-row' }, [el('span', { class: 'sp-label', text: 'Progress' }), this.pct]),
        el('div', { class: 'sp-bar', role: 'progressbar', 'aria-label': 'Progress through the episode' }, [this.bar]),
        this.dots
      ]),
      el('div', { class: 'side-body' }, [
        el('section', { class: 'side-step', 'aria-live': 'polite' }, [
          el('div', { class: 'ss-kicker' }, [this.stepNum, this.stepKind]),
          this.stepTitle, this.stepBrief, this.checklist, this.insight
        ]),
        el('section', { class: 'side-feed' }, [el('h3', { text: p.feedTitle || 'Tonight so far' }), this.feed])
      ]),
      el('div', { class: 'side-objective', 'aria-live': 'polite' }, [
        el('div', { class: 'so-label' }, [icon('target'), el('span', { text: 'Your move' })]),
        this.objText, this.hintBtn, this.hintText
      ])
    ]);
  }

  toggleSheet(force) {
    const open = force ?? !this.side.classList.contains('is-open');
    this.side.classList.toggle('is-open', open);
    this.sheetBtn.setAttribute('aria-expanded', String(open));
  }

  applyCollapsed() {
    this.root.classList.toggle('side-collapsed', !!this.collapsed);
    window.dispatchEvent(new Event('resize'));
  }

  setScenario({ index, count, title, kind, brief, insight }) {
    this.stepNum.textContent = String(index ?? 1);
    this.stepKind.textContent = kind || '';
    this.stepKind.hidden = !kind;
    this.stepTitle.textContent = title || '';
    this.stepBrief.textContent = brief || '';
    this.setInsight(insight);
    this.side.querySelector('.side-body').scrollTop = 0;
  }

  setInsight(text, title = 'Insight') {
    this.insight.hidden = !text;
    this.insightTitle.textContent = title;
    this.insightText.textContent = text || '';
  }

  setObjective(text) {
    this.objText.textContent = text || '';
    this.hintText.hidden = true;
    this.hintBtn.hidden = true;
    this.pendingHint = null;
    this.side.classList.remove('has-hint');
  }

  // A hint is offered, never forced: the player chooses to read it.
  offerHint(text) {
    this.pendingHint = text;
    this.hintBtn.hidden = !text;
    this.side.classList.toggle('has-hint', !!text);
  }

  revealHint() {
    if (!this.pendingHint) return;
    this.hintText.textContent = this.pendingHint;
    this.hintText.hidden = false;
    this.hintBtn.hidden = true;
    bus.emit('hint:revealed', { text: this.pendingHint });
  }

  addBeat({ time, text, tone = 'neutral' }) {
    if (!text) return;
    const item = el('li', { class: `beat beat-${tone}` }, [
      el('span', { class: 'beat-time', text: time || '' }), el('span', { class: 'beat-text', text })
    ]);
    this.feed.prepend(item);
    while (this.feed.children.length > 30) this.feed.lastChild.remove();
  }

  clearFeed() { clear(this.feed); }

  setProgress({ done = 0, total = 1, fraction }) {
    const f = fraction ?? done / Math.max(1, total);
    const pct = Math.round(Math.min(1, Math.max(0, f)) * 100);
    this.pct.textContent = `${pct}%`;
    this.bar.style.width = `${pct}%`;
    this.bar.parentElement.setAttribute('aria-valuenow', String(pct));
    clear(this.dots);
    for (let i = 0; i < total; i++) {
      this.dots.append(el('li', { class: i < done ? 'is-done' : i === done ? 'is-now' : '' }));
    }
  }

  // --------------------------------------------------------------- stage
  buildStage() {
    const p = this.product;
    this.clock = el('span', { class: 'who-clock', text: format(p.clock.start) });
    this.who = el('div', { class: 'who' }, [
      el('span', { class: 'who-avatar', text: p.player.initial || p.player.name[0] }),
      el('span', { class: 'who-text' }, [el('b', { text: p.player.name }), el('small', { text: p.player.role })]),
      el('span', { class: 'who-time' }, [icon('clock'), this.clock])
    ]);

    this.placesBtn = el('button', { class: 'tool', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => this.togglePlaces() }, [icon('places'), el('span', { class: 'tool-label', text: 'Go to' })]);
    this.placesMenu = el('div', { class: 'places', role: 'menu', hidden: true, 'aria-label': 'Places in the room' });
    this.textBtn = el('button', { class: 'tool', type: 'button', onclick: () => this.cycleTextSize() }, [icon('text'), el('span', { class: 'tool-label', text: 'Text' })]);
    this.soundBtn = el('button', {
      class: 'tool', type: 'button', onclick: () => { audio.start(); audio.toggle(); }
    });
    this.renderSound(audio.muted);
    this.menuBtn = el('button', { class: 'tool', type: 'button', 'aria-label': 'Game menu', onclick: () => bus.emit('menu:open', {}) }, [icon('menu')]);

    this.backBtn = el('button', {
      class: 'back-btn', type: 'button', hidden: true,
      onclick: () => bus.emit('room:back', {})
    }, [icon('back'), el('span', { text: 'Back to the room' }), el('kbd', { text: 'Esc' })]);
    this.captions = el('div', { class: 'captions', role: 'status', 'aria-live': 'polite' });
    this.banner = el('div', { class: 'room-banners', 'aria-live': 'polite' });

    this.layers = el('div', { class: 'stage-layers' });
    this.storyBtn = el('button', {
      class: 'tool story-open', type: 'button', 'aria-label': 'Show the story panel',
      onclick: () => { this.collapsed = false; save('sideCollapsed', false); this.applyCollapsed(); }
    }, [icon('forward'), el('span', { class: 'tool-label', text: 'Story' })]);
    this.stage = el('main', { class: 'stage', id: 'stage' }, [
      this.layers,
      el('div', { class: 'stage-top ui-layer' }, [
        el('div', { class: 'stage-top-left' }, [this.storyBtn, this.who]),
        el('div', { class: 'tools' }, [this.placesBtn, this.textBtn, this.soundBtn, this.menuBtn]),
        this.placesMenu
      ]),
      this.banner,
      el('div', { class: 'stage-bottom ui-layer' }, [this.captions, this.backBtn])
    ]);

    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        if (!this.placesMenu.hidden) { this.togglePlaces(false); return; }
        bus.emit('room:back', {});
      }
    });
    document.addEventListener('pointerdown', (ev) => {
      if (!this.placesMenu.hidden && !ev.target.closest('.places') && !ev.target.closest('.tool')) this.togglePlaces(false);
    });
  }

  renderSound(muted) {
    this.soundBtn.replaceChildren(icon(muted ? 'soundOff' : 'soundOn'), el('span', { class: 'tool-label', text: muted ? 'Sound off' : 'Sound on' }));
    this.soundBtn.setAttribute('aria-pressed', String(!muted));
  }

  // The keyboard and screen reader route to every object in the room.
  setPlaces(list, onPick) {
    this.placeList = list;
    this.onPick = onPick;
    this.renderPlaces();
  }

  renderPlaces() {
    clear(this.placesMenu);
    for (const def of (this.placeList || []).filter((d) => d.available !== false)) {
      this.placesMenu.append(el('button', {
        class: 'place', type: 'button', role: 'menuitem', dataset: { place: def.id },
        onfocus: () => bus.emit('places:focus', { id: def.id }),
        onblur: () => bus.emit('places:focus', { id: null }),
        onclick: () => { this.togglePlaces(false); this.onPick && this.onPick(def.id); }
      }, [icon(def.icon || 'eye'), el('span', { class: 'place-text' }, [el('b', { text: def.label }), def.hint ? el('small', { text: def.hint }) : null])]));
    }
  }

  togglePlaces(force) {
    const open = force ?? this.placesMenu.hidden;
    this.renderPlaces();
    this.placesMenu.hidden = !open;
    this.placesBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const first = this.placesMenu.querySelector('button');
      if (first) first.focus();
      this.placesMenu.onkeydown = (ev) => {
        const items = [...this.placesMenu.querySelectorAll('button')];
        const i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') { ev.preventDefault(); items[(i + 1) % items.length].focus(); }
        if (ev.key === 'ArrowUp') { ev.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      };
    }
  }

  setFocused(focused) {
    this.backBtn.hidden = !focused;
    this.root.classList.toggle('is-focused', focused);
    if (focused) this.backBtn.focus({ preventScroll: true });
  }

  // A notification in the room itself: something is happening over there.
  roomBanner({ title, body, icon: iconName = 'bell', action, onAction, ms = 6000 }) {
    const node = el('div', { class: 'room-banner' }, [
      el('span', { class: 'rb-icon' }, [icon(iconName)]),
      el('span', { class: 'rb-text' }, [el('b', { text: title }), body ? el('span', { text: body }) : null]),
      action ? el('button', { class: 'rb-action', type: 'button', text: action, onclick: () => { node.remove(); onAction && onAction(); } }) : null
    ]);
    this.banner.append(node);
    setTimeout(() => node.classList.add('is-out'), ms);
    setTimeout(() => node.remove(), ms + 600);
    return node;
  }

  cycleTextSize() {
    const order = ['normal', 'large', 'larger'];
    this.textSize = order[(order.indexOf(this.textSize) + 1) % order.length];
    save('textSize', this.textSize);
    this.applyTextSize();
  }

  applyTextSize() {
    document.documentElement.dataset.textSize = this.textSize;
    const label = this.textBtn && this.textBtn.querySelector('.tool-label');
    if (label) label.textContent = { normal: 'Text', large: 'Text +', larger: 'Text ++' }[this.textSize];
  }
}
