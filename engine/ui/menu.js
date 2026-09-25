import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from './icons.js';

// The in-game menu players see: resume, restart, back to the title, and a link
// back to the site. How the sim was made, the tech stack and the asset credits
// are deliberately not here. They live in the repository (README.md and
// CREDITS.md) for whoever maintains it, not in front of players, who are here
// to play, not to read how it was built.
export class GameMenu {
  constructor({ engine, parent }) {
    this.engine = engine;
    this.root = el('div', { class: 'menu-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Game menu' });
    this.panel = el('div', { class: 'menu-panel' });
    this.root.append(this.panel);
    parent.append(this.root);
    this.root.addEventListener('pointerdown', (ev) => { if (ev.target === this.root) this.close(); });
    this.root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); } });
  }

  open() {
    this.root.hidden = false;
    this.render();
    bus.emit('menu:opened', {});
  }

  close() {
    this.root.hidden = true;
    bus.emit('menu:closed', {});
  }

  render() {
    clear(this.panel);
    const e = this.engine;
    const p = e.product;
    const inRun = !!e.runner && e.screenRoot.hidden;
    this.panel.append(
      el('h2', { text: p.brand }),
      el('div', { class: 'menu-items' }, [
        el('button', { class: 'menu-item', type: 'button', onclick: () => this.close() }, [icon('play'), 'Resume']),
        inRun ? el('button', { class: 'menu-item', type: 'button', onclick: () => { this.close(); e.startRun(e.seed, e.mode); } }, [icon('refresh'), 'Restart this run']) : null,
        el('button', { class: 'menu-item', type: 'button', onclick: () => { this.close(); if (e.runner) e.runner.dispose(); e.showStart(); } }, [icon('home'), 'Title screen']),
        p.home ? el('a', { class: 'menu-item', href: p.home }, [icon('external'), p.homeLabel || 'Back to the site']) : null
      ])
    );
    const first = this.panel.querySelector('button, a');
    if (first) first.focus({ preventScroll: true });
  }
}
