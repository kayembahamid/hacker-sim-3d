import * as THREE from 'three';
import { bus } from './bus.js';
import { prefersReducedMotion } from './dom.js';

// One orthographic camera for the whole game: the dollhouse overview and every
// close up. Poses are not fixed numbers. Each one is worked out from what it
// has to show (the room's bounds, an object's bounds, a screen's corners) and
// the shape of the window, so the room fills a phone held upright as well as
// a wide laptop.
//
// A resolved pose is { target, dir, up, zoom, near, far }:
//   target  the point the camera looks at
//   dir     unit vector from the target back towards the camera
//   zoom    1 / the height of world the view shows (the frustum is 1 unit)
//   near/far clip planes, as distances from the camera, so a close up can cut
//            away the chair between the camera and the desk.

const DISTANCE = 30;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const MAX_TILT = THREE.MathUtils.degToRad(7);

export class CameraRig {
  constructor({ container, tiltGroup }) {
    this.container = container;
    this.tiltGroup = tiltGroup;
    this.camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -60, 120);
    this.state = { target: new THREE.Vector3(), dir: new THREE.Vector3(1, 1, 1).normalize(), up: new THREE.Vector3(0, 1, 0), zoom: 0.2, near: -60, far: 120 };
    this.resolvers = new Map();
    this.currentPose = null;
    this.flight = null;
    this.pointer = new THREE.Vector2(0, 0);
    this.tilt = new THREE.Vector2(0, 0);
    this.tiltEnabled = !prefersReducedMotion();
    this.changed = true;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    container.addEventListener('pointermove', (ev) => {
      const r = container.getBoundingClientRect();
      this.pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, ((ev.clientY - r.top) / r.height) * 2 - 1);
    });
    container.addEventListener('pointerleave', () => this.pointer.set(0, 0));
  }

  // The size is measured on resize and kept: reading clientWidth every frame
  // would force the browser to lay the page out again every frame.
  viewport() {
    if (!this.size) this.measure();
    return this.size;
  }

  measure() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.size = { w, h, aspect: w / Math.max(1, h) };
  }

  resize() {
    this.measure();
    const { aspect } = this.size;
    this.camera.left = -aspect / 2;
    this.camera.right = aspect / 2;
    this.camera.top = 0.5;
    this.camera.bottom = -0.5;
    // Poses depend on the aspect, so a resize re-resolves the one on screen.
    if (this.currentPose && !this.flight) this.apply(this.resolve(this.currentPose));
    this.camera.updateProjectionMatrix();
    this.changed = true;
  }

  // resolver(viewport) -> pose. Called whenever the pose is needed, so it
  // always fits the current window.
  registerPose(id, resolver) {
    this.resolvers.set(id, typeof resolver === 'function' ? resolver : () => resolver);
  }

  hasPose(id) { return this.resolvers.has(id); }

  // Poses are measured with the room untilted: the tilt eases back to zero
  // during any close up, so measuring mid tilt would frame the subject off
  // centre by the time the camera arrives.
  resolve(id) {
    const fn = this.resolvers.get(id);
    if (!fn) return null;
    const g = this.tiltGroup;
    const rx = g ? g.rotation.x : 0;
    const ry = g ? g.rotation.y : 0;
    if (g) { g.rotation.set(0, 0, 0); g.updateMatrixWorld(true); }
    const pose = fn(this.viewport());
    if (g) { g.rotation.set(rx, ry, 0); g.updateMatrixWorld(true); }
    return pose;
  }

  isOverview() { return this.currentPose === 'overview' || this.currentPose === null; }

  flyTo(id, { duration = 1200, instant = false } = {}) {
    const to = this.resolve(id);
    if (!to) return Promise.resolve(false);
    const from = this.snapshot();
    this.currentPose = id;
    bus.emit('camera:flightStart', { pose: id });
    const ms = instant || prefersReducedMotion() ? 0 : duration;
    return new Promise((resolve) => {
      if (ms === 0) {
        this.flight = null;
        this.apply(to);
        bus.emit('camera:flightEnd', { pose: id });
        resolve(true);
        return;
      }
      this.flight = { from, to, id, start: performance.now(), ms, resolve };
    });
  }

  toOverview(opts) { return this.flyTo('overview', opts); }

  snapshot() {
    const s = this.state;
    return { target: s.target.clone(), dir: s.dir.clone(), up: s.up.clone(), zoom: s.zoom, near: s.near, far: s.far };
  }

  apply(p) {
    const s = this.state;
    s.target.copy(p.target);
    s.dir.copy(p.dir).normalize();
    s.up.copy(p.up).normalize();
    s.zoom = p.zoom;
    s.near = p.near ?? -60;
    s.far = p.far ?? 120;
    this.place();
  }

  place() {
    const s = this.state;
    const c = this.camera;
    c.position.copy(s.target).addScaledVector(s.dir, DISTANCE);
    c.up.copy(s.up);
    c.zoom = s.zoom;
    c.near = s.near;
    c.far = s.far;
    c.lookAt(s.target);
    c.updateProjectionMatrix();
    c.updateMatrixWorld();
    this.changed = true;
  }

  update(dt) {
    if (this.flight) {
      const f = this.flight;
      const raw = Math.min(1, (performance.now() - f.start) / f.ms);
      const t = easeInOutCubic(raw);
      const s = this.state;
      s.target.lerpVectors(f.from.target, f.to.target, t);
      s.dir.copy(f.from.dir).lerp(f.to.dir, t).normalize();
      s.up.copy(f.from.up).lerp(f.to.up, t).normalize();
      // Zoom in log space, so a 10x zoom feels even rather than all at the end.
      s.zoom = Math.exp(THREE.MathUtils.lerp(Math.log(f.from.zoom), Math.log(f.to.zoom), t));
      s.near = THREE.MathUtils.lerp(f.from.near, f.to.near, t * t);
      s.far = THREE.MathUtils.lerp(f.from.far, f.to.far, t);
      this.place();
      if (raw >= 1) {
        this.flight = null;
        bus.emit('camera:flightEnd', { pose: f.id });
        f.resolve(true);
      }
    }

    // The dollhouse tilt: the room leans a few degrees towards the pointer in
    // the overview, which is what makes a flat orthographic view feel solid.
    if (this.tiltGroup) {
      const on = this.tiltEnabled && this.isOverview() && !this.flight;
      const wx = on ? this.pointer.y * MAX_TILT * 0.45 : 0;
      const wy = on ? this.pointer.x * MAX_TILT : 0;
      const k = 1 - Math.pow(0.002, dt);
      const nx = this.tilt.x + (wx - this.tilt.x) * k;
      const ny = this.tilt.y + (wy - this.tilt.y) * k;
      if (Math.abs(nx - this.tilt.x) > 1e-6 || Math.abs(ny - this.tilt.y) > 1e-6) this.changed = true;
      this.tilt.set(nx, ny);
      this.tiltGroup.rotation.x = this.tilt.x;
      this.tiltGroup.rotation.y = this.tilt.y;
    }
  }

  // World units per CSS pixel at the current zoom: outlines and markers use it
  // to stay the same thickness on screen whatever the zoom.
  worldPerPixel() {
    return 1 / (this.state.zoom * this.viewport().h);
  }
}

// ---------------------------------------------------------------- resolvers
// A camera basis for a view direction: right and up on screen.
function basis(dir, upHint = new THREE.Vector3(0, 1, 0)) {
  const d = dir.clone().normalize();
  let right = new THREE.Vector3().crossVectors(upHint, d);
  if (right.lengthSq() < 1e-6) right = new THREE.Vector3(1, 0, 0);
  right.normalize();
  const up = new THREE.Vector3().crossVectors(d, right).normalize();
  return { d, right, up };
}

// Frame a set of world points: centred, and filling `fill` of the view.
export function framePoints(points, { dir, fill = 0.9, upHint, near, far, viewport, offset = [0, 0] }) {
  const { d, right, up } = basis(dir, upHint);
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
  const centre = new THREE.Vector3();
  for (const p of points) centre.add(p);
  centre.multiplyScalar(1 / points.length);
  for (const p of points) {
    const v = p.clone().sub(centre);
    const x = v.dot(right);
    const y = v.dot(up);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const target = centre.clone()
    .addScaledVector(right, (minX + maxX) / 2)
    .addScaledVector(up, (minY + maxY) / 2);
  // fill can be one number, or { w, h } when the width and the height have
  // different room to spare (bars along the top and bottom, none at the sides).
  const fw = typeof fill === 'object' ? fill.w : fill;
  const fh = typeof fill === 'object' ? fill.h : fill;
  const visibleH = Math.max(height / fh, width / viewport.aspect / fw);
  // offset shifts the subject on screen, in fractions of the view, for
  // example to keep it clear of a panel.
  target.addScaledVector(right, -offset[0] * visibleH * viewport.aspect).addScaledVector(up, -offset[1] * visibleH);
  return {
    target, dir: d, up,
    zoom: 1 / visibleH,
    near: near ?? -60,
    far: far ?? 120
  };
}

export function boxCorners(box) {
  const pts = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    }
  }
  return pts;
}

// Frame an object for a close up. `clip` cuts away anything more than that
// many metres in front of the object, so furniture between the camera and the
// subject disappears instead of blocking the view.
export function objectPose(object3d, { dir, fill = 0.72, clip = 0.9, viewport, offset }) {
  object3d.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object3d);
  const size = box.getSize(new THREE.Vector3()).length();
  return framePoints(boxCorners(box), {
    dir: new THREE.Vector3(...dir), fill, viewport, offset,
    near: DISTANCE - Math.max(clip, size * 0.6),
    far: DISTANCE + 8
  });
}
