import * as THREE from 'three';
import { bus } from './bus.js';
import { el } from './dom.js';

// Hover, outline, floating label, click to fly. Only the interactive objects
// are raycast; the baked room has raycasting switched off entirely, so hover
// costs a handful of triangles tests, not the whole room.
export class Interaction {
  constructor({ container, rig, outliner }) {
    this.container = container;
    this.rig = rig;
    this.outliner = outliner;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-2, -2);
    this.objects = new Map();
    this.hovered = null;
    this.enabled = true;
    this.pointerMoved = false;

    this.label = el('div', { class: 'object-label', 'aria-hidden': 'true' }, [
      el('strong', { class: 'ol-name' }), el('span', { class: 'ol-hint' })
    ]);
    container.append(this.label);

    container.addEventListener('pointermove', (ev) => {
      const r = container.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      this.pointerMoved = true;
      this.pointerType = ev.pointerType;
    });
    container.addEventListener('pointerleave', () => { this.pointer.set(-2, -2); this.pointerMoved = true; });
    container.addEventListener('click', (ev) => {
      if (!this.enabled || ev.target.closest('button, a, input, .ui-layer')) return;
      // A tap on a touch screen has no hover first, so pick on the tap itself.
      const r = container.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      const def = this.pick();
      if (def) this.activate(def.id);
    });
  }

  register(def) {
    this.objects.set(def.id, def);
    def.object3d.userData.interactiveId = def.id;
    def.object3d.traverse((n) => { n.userData.interactiveId = def.id; });
    if (this.outliner) this.outliner.add(def.id, def.object3d);
    bus.emit('interaction:registered', { id: def.id, label: def.label });
  }

  get(id) { return this.objects.get(id); }

  list() { return [...this.objects.values()].filter((o) => o.available !== false); }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.clearHover();
  }

  setAvailable(id, available) {
    const def = this.objects.get(id);
    if (!def) return;
    def.available = available;
    def.object3d.visible = available !== false || def.keepVisible;
    bus.emit('interaction:availability', { id, available });
  }

  clearHover() {
    if (this.outliner) this.outliner.hide();
    this.hovered = null;
    this.label.classList.remove('is-on');
    this.container.style.cursor = '';
  }

  // Keyboard focus on a place in the menu shows the same outline and label a
  // mouse hover would.
  highlight(id) {
    const def = id && this.objects.get(id);
    if (!def) { this.clearHover(); return; }
    this.hovered = def;
    if (this.outliner) this.outliner.show(def.id);
    this.showLabel(def);
  }

  activate(id, { fly = true } = {}) {
    const def = this.objects.get(id);
    if (!def || def.available === false) return;
    this.clearHover();
    bus.emit('object:activated', { id, label: def.label });
    if (def.onActivate) def.onActivate(def);
    if (fly && this.rig.hasPose(id)) {
      this.rig.flyTo(id).then(() => bus.emit('object:focused', { id, label: def.label }));
    }
  }

  pick() {
    this.raycaster.setFromCamera(this.pointer, this.rig.camera);
    const targets = [];
    for (const def of this.objects.values()) {
      if (def.available !== false && def.object3d.visible) targets.push(def.object3d);
    }
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    let node = hit.object;
    while (node && !node.userData.interactiveId) node = node.parent;
    return node ? this.objects.get(node.userData.interactiveId) : null;
  }

  showLabel(def) {
    const box = new THREE.Box3().setFromObject(def.object3d);
    const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
    top.project(this.rig.camera);
    const r = this.container.getBoundingClientRect();
    const x = ((top.x + 1) / 2) * r.width;
    const y = ((-top.y + 1) / 2) * r.height;
    this.label.style.transform = `translate(-50%, calc(-100% - 12px)) translate(${x}px, ${y}px)`;
    this.label.querySelector('.ol-name').textContent = def.label;
    this.label.querySelector('.ol-hint').textContent = def.hint || '';
    this.label.classList.add('is-on');
  }

  update() {
    if (!this.enabled || !this.rig.isOverview() || this.rig.flight) {
      if (this.hovered) this.clearHover();
      return;
    }
    // Touch screens have no hover: never leave an outline stuck after a tap.
    if (this.pointerType === 'touch') return;
    if (!this.pointerMoved && !this.rig.changed) {
      if (this.hovered) this.showLabel(this.hovered);
      return;
    }
    this.pointerMoved = false;
    const def = this.pick();
    if (def !== this.hovered) {
      this.hovered = def;
      if (def) {
        if (this.outliner) this.outliner.show(def.id);
        this.container.style.cursor = 'pointer';
        bus.emit('object:hovered', { id: def.id, label: def.label });
      } else {
        this.clearHover();
      }
    }
    if (this.hovered) this.showLabel(this.hovered);
  }
}
