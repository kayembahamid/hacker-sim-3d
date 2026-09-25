import * as THREE from 'three';
import { CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { makeScreenBlocker } from './renderer.js';
import { framePoints } from './cameraRig.js';

// A real HTML element living on a real surface in the room.
//
// The surface comes from the baked room: Blender exports a plane tagged
// `screen` exactly where the glass of the monitor or the phone is. Its size
// and angle are read back here, so moving the monitor in Blender moves the
// desktop with it.
//
// Three states:
//   in the room   projected into 3D by CSS3DRenderer (tiny, but live)
//   focused       lifted into a flat overlay laid exactly over its projected
//                 quad, once the camera has arrived square on. Text is crisp,
//                 focus rings work and hit testing is reliable.
//   fullscreen    on a phone sized window: the device fills the screen
export class Screen3D {
  constructor({ id, mesh, pxWidth, fit = 0.9 }) {
    this.id = id;
    this.fit = fit;

    mesh.updateWorldMatrix(true, false);
    const geo = mesh.geometry;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const scale = mesh.getWorldScale(new THREE.Vector3());
    this.metreWidth = Math.abs((bb.max.x - bb.min.x) * scale.x);
    this.metreHeight = Math.abs((bb.max.y - bb.min.y) * scale.y);
    this.pxWidth = pxWidth;
    this.pxHeight = Math.round(pxWidth * this.metreHeight / this.metreWidth);
    this.scale = this.metreWidth / this.pxWidth;

    const centre = bb.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const quat = mesh.getWorldQuaternion(new THREE.Quaternion());
    this.normal = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).normalize();
    this.up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).normalize();
    // A hair in front of the glass so it never z fights the bezel.
    this.position = centre.clone().addScaledVector(this.normal, 0.0006);
    this.quaternion = quat;

    this.holder = document.createElement('div');
    this.holder.className = `screen3d-holder screen3d-holder-${id}`;
    this.holder.style.width = `${this.pxWidth}px`;
    this.holder.style.height = `${this.pxHeight}px`;
    this.holder.style.pointerEvents = 'none';

    this.root = document.createElement('div');
    this.root.className = `screen3d screen3d-${id}`;
    this.root.style.width = `${this.pxWidth}px`;
    this.root.style.height = `${this.pxHeight}px`;
    this.root.dataset.screen = id;
    this.holder.append(this.root);

    this.object = new CSS3DObject(this.holder);
    this.object.scale.setScalar(this.scale);
    this.object.position.copy(this.position);
    this.object.quaternion.copy(quat);

    // The blocker cuts a hole in the canvas where the screen is, so the HTML
    // underneath shows through while anything in front of it still covers it.
    this.blocker = makeScreenBlocker(this.metreWidth, this.metreHeight);
    this.blocker.position.copy(this.position);
    this.blocker.quaternion.copy(quat);

    this.focused = false;
    this.mode = null;
  }

  mount(cssParent, glParent) {
    cssParent.add(this.object);
    glParent.add(this.blocker);
    return this;
  }

  corners() {
    const hw = this.metreWidth / 2;
    const hh = this.metreHeight / 2;
    const right = new THREE.Vector3().crossVectors(this.up, this.normal).normalize();
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => this.position.clone()
      .addScaledVector(right, sx * hw).addScaledVector(this.up, sy * hh));
  }

  // Square on and upright, filling most of the view. Anything more than a
  // short way in front of the glass is clipped away (the chair, the bin).
  pose(viewport, { fill = this.fit, clip = 0.5, offset } = {}) {
    return framePoints(this.corners(), {
      dir: this.normal, upHint: this.up, fill, viewport, offset,
      near: 30 - clip, far: 30 + 6
    });
  }

  setInteractive(on) { this.root.classList.toggle('is-live', !!on); }

  projectRect(camera, width, height) {
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const c of this.corners()) {
      const v = c.clone();
      if (this.object.parent) v.applyMatrix4(this.object.parent.matrixWorld);
      v.project(camera);
      const x = ((v.x + 1) / 2) * width;
      const y = ((-v.y + 1) / 2) * height;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
  }

  // Lay the screen flat over its projected quad.
  focus(layer, camera, width, height) {
    const rect = this.projectRect(camera, width, height);
    this.lift(layer);
    this.mode = 'focused';
    this.place(rect.left, rect.top, rect.width / this.pxWidth);
    return rect;
  }

  // Fill the given box, keeping the device's shape. Used on phone sized
  // windows, where a projected phone would be too small to use.
  // box is { x, y, w, h }: the part of the stage the device may use, clear of
  // the tools at the top and the Back button at the bottom.
  fullscreen(layer, box, { stretch = false } = {}) {
    this.lift(layer);
    this.mode = 'fullscreen';
    if (stretch) {
      // The desktop reflows to the window instead of shrinking to a postage
      // stamp: its apps open full size, like a tablet.
      this.root.style.width = `${box.w}px`;
      this.root.style.height = `${box.h}px`;
      this.root.classList.add('is-compact');
      this.place(box.x, box.y, 1);
      return;
    }
    const k = Math.min(box.w / this.pxWidth, box.h / this.pxHeight);
    this.place(box.x + (box.w - this.pxWidth * k) / 2, box.y + (box.h - this.pxHeight * k) / 2, k);
  }

  lift(layer) {
    this.root.classList.add('is-focused');
    if (this.root.parentNode !== layer) layer.append(this.root);
    this.focused = true;
    this.object.visible = false;
    this.blocker.visible = false;
  }

  place(left, top, k) {
    this.root.style.position = 'absolute';
    this.root.style.left = `${left}px`;
    this.root.style.top = `${top}px`;
    this.root.style.transformOrigin = '0 0';
    this.root.style.transform = `scale(${k})`;
    this.k = k;
  }

  blur() {
    this.root.classList.remove('is-focused', 'is-compact');
    this.root.style.position = '';
    this.root.style.left = '';
    this.root.style.top = '';
    this.root.style.transform = '';
    this.root.style.transformOrigin = '';
    this.root.style.width = `${this.pxWidth}px`;
    this.root.style.height = `${this.pxHeight}px`;
    if (this.root.parentNode !== this.holder) this.holder.append(this.root);
    this.focused = false;
    this.mode = null;
    this.object.visible = true;
    this.blocker.visible = true;
  }
}
