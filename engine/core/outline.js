import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Hover outlines as an inverted hull: a copy of the object, pushed out along
// its normals, drawn back faces only. It costs one extra draw call while
// something is hovered and no post processing, which keeps the phone budget.
//
// The shell is built once per object. Its geometry is taken into the room's
// own frame (the baked meshes are quantised, so their local space is not in
// metres) and welded, so the normals are smooth across UV seams and the
// outline has no cracks at hard edges.
//
// Welding takes a moment per object, so shells are not built while the room
// loads: they are queued, built one at a time when the browser is idle, and
// any shell asked for before its turn is built on the spot.

const vertex = /* glsl */`
  uniform float uThickness;
  void main() {
    vec3 p = position + normal * uThickness;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const fragment = /* glsl */`
  uniform vec3 uColor;
  void main() { gl_FragColor = vec4(uColor, 1.0); }
`;

export class Outliner {
  constructor(parent, colour) {
    this.parent = parent;
    this.shells = new Map();
    this.material = new THREE.ShaderMaterial({
      uniforms: { uThickness: { value: 0.01 }, uColor: { value: new THREE.Color(colour) } },
      vertexShader: vertex,
      fragmentShader: fragment,
      side: THREE.BackSide,
      toneMapped: false
    });
    this.current = null;
    this.pixels = 3;
    this.queue = new Map();
    // A hidden stand in, so the outline shader is compiled with the rest of
    // the scene during loading rather than on the first hover.
    const warm = new THREE.BufferGeometry();
    warm.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    warm.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
    this.warm = new THREE.Mesh(warm, this.material);
    this.warm.visible = false;
    this.warm.raycast = () => {};
    parent.add(this.warm);
  }

  // Remember an object; its shell is built later (see buildWhenIdle).
  add(id, object3d) {
    this.queue.set(id, object3d);
  }

  buildWhenIdle() {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
    const step = () => {
      const next = this.queue.keys().next();
      if (next.done) return;
      this.ensure(next.value);
      idle(step);
    };
    idle(step);
  }

  ensure(id) {
    if (this.shells.has(id)) return this.shells.get(id);
    const object3d = this.queue.get(id);
    if (!object3d) return null;
    this.queue.delete(id);
    return this.build(id, object3d);
  }

  build(id, object3d) {
    this.parent.updateMatrixWorld(true);
    const toParent = new THREE.Matrix4().copy(this.parent.matrixWorld).invert();
    const parts = [];
    object3d.updateWorldMatrix(true, true);
    object3d.traverse((node) => {
      if (!node.isMesh || !node.geometry || !node.geometry.attributes.position) return;
      const g = new THREE.BufferGeometry();
      const src = node.geometry.attributes.position;
      const pos = new Float32Array(src.count * 3);
      const v = new THREE.Vector3();
      const m = new THREE.Matrix4().multiplyMatrices(toParent, node.matrixWorld);
      for (let i = 0; i < src.count; i++) {
        v.fromBufferAttribute(src, i).applyMatrix4(m);
        pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      if (node.geometry.index) g.setIndex(node.geometry.index.clone());
      const welded = mergeVertices(g, 1e-4);
      welded.computeVertexNormals();
      g.dispose();
      parts.push(welded);
    });
    const group = new THREE.Group();
    group.name = `outline-${id}`;
    for (const geo of parts) {
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.raycast = () => {};
      mesh.renderOrder = -2;
      group.add(mesh);
    }
    group.visible = false;
    this.parent.add(group);
    this.shells.set(id, group);
    return group;
  }

  show(id) {
    if (this.current === id) return;
    this.hide();
    const shell = this.ensure(id);
    if (shell) { shell.visible = true; this.current = id; }
  }

  hide() {
    if (this.current && this.shells.get(this.current)) this.shells.get(this.current).visible = false;
    this.current = null;
  }

  setColour(colour) { this.material.uniforms.uColor.value.set(colour); }

  // Called every frame with how much world one screen pixel covers.
  update(worldPerPixel) {
    this.material.uniforms.uThickness.value = worldPerPixel * this.pixels;
  }
}
