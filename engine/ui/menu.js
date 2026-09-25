import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';
import { icon } from './icons.js';

// The game menu: resume, restart, back to the title, how the sim was made,
// and credits. "How this was made" is there because people ask: it names each
// layer and what it is built with, and the X-ray switch shows the room as bare
// geometry, the way the baked textures hide it.
export class GameMenu {
  constructor({ engine, parent }) {
    this.engine = engine;
    this.root = el('div', { class: 'menu-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Game menu' });
    this.panel = el('div', { class: 'menu-panel' });
    this.root.append(this.panel);
    parent.append(this.root);
    this.root.addEventListener('pointerdown', (ev) => { if (ev.target === this.root) this.close(); });
    this.root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); this.close(); } });
    this.xray = false;
  }

  open(view = 'main') {
    this.root.hidden = false;
    this.render(view);
    bus.emit('menu:opened', {});
  }

  close() {
    this.root.hidden = true;
    bus.emit('menu:closed', {});
  }

  render(view) {
    clear(this.panel);
    const e = this.engine;
    const p = e.product;
    if (view === 'built') {
      this.panel.append(
        el('button', { class: 'menu-back', type: 'button', onclick: () => this.render('main') }, [icon('back'), 'Menu']),
        el('h2', { text: 'How this was made' }),
        el('p', { class: 'menu-sub', text: p.builtIntro || 'The same pipeline as the best 3D security training, rebuilt with plain JavaScript and free tools.' }),
        ...(p.builtLayers || []).map((l) => el('div', { class: 'menu-layer' }, [
          el('b', { text: l.name }), el('span', { text: l.what }), l.like ? el('small', { text: l.like }) : null
        ])),
        el('label', { class: 'menu-toggle' }, [
          el('input', { type: 'checkbox', checked: this.xray ? '' : null, onchange: (ev) => this.setXray(ev.target.checked) }),
          el('span', { text: 'X-ray: show the room as bare geometry' })
        ])
      );
    } else if (view === 'credits') {
      this.panel.append(
        el('button', { class: 'menu-back', type: 'button', onclick: () => this.render('main') }, [icon('back'), 'Menu']),
        el('h2', { text: 'Credits' }),
        ...(p.credits || []).map((c) => el('p', { class: 'menu-credit' }, [el('b', { text: c.name }), ` ${c.text}`]))
      );
    } else {
      const inRun = !!e.runner && e.screenRoot.hidden;
      this.panel.append(
        el('h2', { text: p.brand }),
        el('div', { class: 'menu-items' }, [
          el('button', { class: 'menu-item', type: 'button', onclick: () => this.close() }, [icon('play'), 'Resume']),
          inRun ? el('button', { class: 'menu-item', type: 'button', onclick: () => { this.close(); e.startRun(e.seed, e.mode); } }, [icon('refresh'), 'Restart this run']) : null,
          el('button', { class: 'menu-item', type: 'button', onclick: () => { this.close(); if (e.runner) e.runner.dispose(); e.showStart(); } }, [icon('home'), 'Title screen']),
          el('button', { class: 'menu-item', type: 'button', onclick: () => this.render('built') }, [icon('code'), 'How this was made']),
          el('button', { class: 'menu-item', type: 'button', onclick: () => this.render('credits') }, [icon('info'), 'Credits']),
          p.home ? el('a', { class: 'menu-item', href: p.home }, [icon('external'), p.homeLabel || 'Back to the site']) : null
        ])
      );
    }
    const first = this.panel.querySelector('button, a, input');
    if (first) first.focus({ preventScroll: true });
  }

  setXray(on) {
    this.xray = on;
    for (const m of this.engine.roomMaterials) m.wireframe = on;
    this.engine.dirty = true;
  }
}
