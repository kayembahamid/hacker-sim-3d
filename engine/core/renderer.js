import * as THREE from 'three';
import { CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';

// Two stacked renderers.
//
// The CSS3D layer (the live HTML screens) sits underneath. The WebGL canvas
// sits on top, clears to transparent, and punches a transparent hole where a
// screen is, using a NoBlending material, so anything in front of a monitor
// still covers it correctly and the page background shows round the diorama.
//
// The room is baked, so there are no lights, no shadow maps and no tone
// mapping here: every pixel is the baked texture, exactly as Blender left it.
export function createRenderers(container) {
  const webgl = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  webgl.setClearColor(0x000000, 0);
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.NoToneMapping;
  webgl.domElement.className = 'layer-webgl';

  const css = new CSS3DRenderer();
  css.domElement.className = 'layer-css3d';

  container.append(css.domElement, webgl.domElement);

  const size = { w: 0, h: 0 };
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    if (w === size.w && h === size.h) return false;
    size.w = w; size.h = h;
    webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    webgl.setSize(w, h, false);
    css.setSize(w, h);
    return true;
  }
  resize();
  return { webgl, css, size, resize };
}

// A stand-in mesh that shows the CSS screen behind the canvas. NoBlending
// writes this material's alpha straight into the canvas, so an alpha of zero
// cuts a hole and the HTML screen behind shows through.
export function makeScreenBlocker(width, height) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    opacity: 0,
    transparent: true,
    blending: THREE.NoBlending,
    side: THREE.FrontSide,
    toneMapped: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.name = 'screen-blocker';
  mesh.renderOrder = -1;
  mesh.raycast = () => {};
  return mesh;
}
