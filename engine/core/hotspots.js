import * as THREE from 'three';
import { el } from './dom.js';
import { icon } from '../ui/icons.js';

// The pulsing markers that say "look here". A scenario asks for one when it
// wants the player's attention on an object: at once on Easy, after a pause on
// Normal, never on Expert. They are real buttons, so a keyboard or a screen
// reader can use them too.
export class Hotspots {
  constructor({ container, rig, interaction }) {
    this.container = container;
    this.rig = rig;
    this.interaction = interaction;
    this.layer = el('div', { class: 'hotspots' });
    container.append(this.layer);
    this.active = new Map();
    this.anchor = new THREE.Vector3();
    this.box = new THREE.Box3();
  }

  show(id, { label } = {}) {
    if (this.active.has(id)) return;
    const def = this.interaction.get(id);
    if (!def) return;
    const node = el('button', {
      class: 'hotspot', type: 'button',
      'aria-label': label || `Look at the ${def.label.toLowerCase()}`,
      onclick: (ev) => { ev.stopPropagation(); this.interaction.activate(id); }
    }, [
      el('span', { class: 'hs-ring' }),
      el('span', { class: 'hs-core' }, [icon(def.hotspotIcon || 'eye')]),
      label ? el('span', { class: 'hs-label', text: label }) : null
    ]);
    this.layer.append(node);
    this.active.set(id, { node, def });
  }

  hide(id) {
    const h = this.active.get(id);
    if (!h) return;
    h.node.remove();
    this.active.delete(id);
  }

  clear() { for (const id of [...this.active.keys()]) this.hide(id); }

  update() {
    const overview = this.rig.isOverview() && !this.rig.flight;
    this.layer.classList.toggle('is-hidden', !overview);
    if (!overview || !this.active.size) return;
    // The rig keeps the stage size, so nothing here makes the page lay out.
    const r = this.rig.viewport();
    for (const { node, def } of this.active.values()) {
      const box = this.box.setFromObject(def.object3d);
      this.anchor.set((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2).project(this.rig.camera);
      const x = ((this.anchor.x + 1) / 2) * r.w;
      const y = ((-this.anchor.y + 1) / 2) * r.h;
      node.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}
