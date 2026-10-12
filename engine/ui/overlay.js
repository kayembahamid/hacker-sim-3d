import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from './icons.js';

// Modal cards: what happened after a decision (with the rewind), a moment in
// the story, a choice to make. One card at a time; anything that wants to
// wait for the player to finish reading uses whenIdle().
const BADGES = {
  safe: ['check', 'Good call'],
  careful: ['check', 'Careful'],
  unsafe: ['warning', 'That went wrong'],
  risky: ['warning', 'Risky'],
  neutral: ['info', 'What happened'],
  story: ['clock', 'Meanwhile']
};

export class Overlay {
  constructor(parent) {
    this.root = el('div', { class: 'overlay', hidden: true });
    this.card = el('div', { class: 'ov-card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ov-title' });
    this.root.append(this.card);
    parent.append(this.root);
    this.queue = [];
    bus.on('overlay:card', (c) => this.showCard(c));
    this.root.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.resolveFn && !this.current?.noEscape) this.pick(this.current?.escapeChoice || 'continue');
      if (ev.key === 'Tab') this.trapFocus(ev);
    });
  }

  get open() { return !this.root.hidden; }

  whenIdle() {
    if (!this.resolveFn && !this.queue.length) return Promise.resolve();
    return new Promise((resolve) => {
      this.idleWaiters = this.idleWaiters || [];
      this.idleWaiters.push(resolve);
    });
  }

  showCard(card) {
    if (this.resolveFn) {
      return new Promise((resolve) => this.queue.push({ card, resolve }));
    }
    return new Promise((resolve) => this.render(card, resolve));
  }

  render(card, resolve) {
    this.resolveFn = resolve;
    this.current = card;
    this.returnFocus = document.activeElement;
    clear(this.card);
    const verdict = card.verdict || 'neutral';
    this.card.className = `ov-card ov-${verdict} ${card.wide ? 'ov-wide' : ''}`;
    const [badgeIcon, badgeText] = BADGES[verdict] || BADGES.neutral;

    const bodyNodes = [].concat(card.body || []).map((p) => (typeof p === 'string' ? el('p', { class: 'ov-body', text: p }) : p));
    this.card.append(...[
      el('div', { class: 'ov-badge' }, [icon(badgeIcon), el('span', { text: card.kicker || badgeText })]),
      el('h2', { class: 'ov-title', id: 'ov-title', text: card.title || '' }),
      card.image ? el('img', { class: 'ov-image', src: card.image, alt: card.imageAlt || '' }) : null,
      card.node || null,
      ...bodyNodes,
      card.ideal ? el('div', { class: 'ov-ideal' }, [
        el('strong', { text: card.idealLabel || 'What a careful person does' }),
        el('p', { text: card.ideal })
      ]) : null
    ].filter(Boolean));

    const buttons = el('div', { class: 'ov-buttons' });
    if (card.choices && card.choices.length) {
      for (const c of card.choices) {
        buttons.append(el('button', {
          class: `btn ${c.primary ? 'btn-primary' : 'btn-ghost'}`, type: 'button',
          dataset: { choice: c.id, emit: c.emit || '' },
          onclick: () => this.pick(c.id)
        }, [c.icon ? icon(c.icon) : null, c.label]));
      }
    } else {
      if (card.allowRewind) {
        buttons.append(el('button', {
          class: 'btn btn-ghost', type: 'button', dataset: { choice: 'rewind' },
          onclick: () => this.pick('rewind')
        }, [icon('rewind'), card.rewindLabel || 'Rewind and try again']));
      }
      buttons.append(el('button', {
        class: 'btn btn-primary', type: 'button', dataset: { choice: 'continue' },
        onclick: () => this.pick('continue')
      }, [card.continueLabel || 'Continue']));
    }
    this.card.append(buttons);

    this.root.hidden = false;
    this.card.scrollTop = 0;
    bus.emit('overlay:opened', { title: card.title });
    const first = this.card.querySelector('.btn-primary') || this.card.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  trapFocus(ev) {
    const items = [...this.card.querySelectorAll('button, a[href], input')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }

  pick(choice) {
    const fn = this.resolveFn;
    this.resolveFn = null;
    this.current = null;
    bus.emit('overlay:closed', { choice });
    if (this.queue.length) {
      const next = this.queue.shift();
      if (fn) fn(choice);
      this.render(next.card, next.resolve);
      return;
    }
    this.root.hidden = true;
    if (fn) fn(choice);
    if (this.returnFocus && this.returnFocus.isConnected) this.returnFocus.focus({ preventScroll: true });
    const waiters = this.idleWaiters || [];
    this.idleWaiters = [];
    for (const w of waiters) w();
  }
}
