import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Loads a room baked by tools/blender and makes it ready to draw.
//
// Every surface in the file already has its light, shadows and bounce painted
// into its texture, so every material is swapped for a MeshBasicMaterial: the
// GPU does no lighting at all, which is how a whole room runs at 60 fps on a
// school laptop and 30 on a cheap phone. This is the RansomLeak technique.
//
// The Blender side tags objects with custom properties, which arrive here as
// userData:
//   ix      an interactive object (phone, computer, backpack...)
//   screen  a surface an HTML screen is laid on (computer, phone)
//   sky     the window glass the night sky shader is drawn on
// Everything else is static: it never takes part in raycasting.

// The baked textures are KTX2 (Basis Universal), which stay compressed on the
// GPU. The transcoder is a small WASM file; three.js points at its own copy
// and the build ships it with a content hash.
//
// One transcoder worker, not the default four: each worker starts its own
// copy of the WASM transcoder, which is the slow part on a cheap phone, and a
// dozen small textures do not need four. The worker is started on a tiny
// texture (warm.ktx2) while the room file downloads, so it is ready when the
// file arrives.
let loader = null;
let ktx2 = null;
function gltfLoader(renderer) {
  if (loader) return loader;
  loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  if (renderer) {
    ktx2 = new KTX2Loader()
      .setWorkerLimit(1)
      .detectSupport(renderer);
    loader.setKTX2Loader(ktx2);
  }
  return loader;
}

export async function loadBakedRoom(url, { renderer, onProgress } = {}) {
  const gltfs = gltfLoader(renderer);
  if (ktx2) ktx2.loadAsync(`${import.meta.env.BASE_URL}assets/warm.ktx2`).then((t) => t.dispose(), () => {});
  const gltf = await gltfs.loadAsync(url, (ev) => {
    if (onProgress && ev.lengthComputable) onProgress(ev.loaded / ev.total);
  });
  const root = gltf.scene;
  root.name = 'baked-room';

  const interactive = new Map();
  const screens = new Map();
  let sky = null;
  const baked = [];
  const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 4;

  root.updateMatrixWorld(true);
  root.traverse((node) => {
    const data = node.userData || {};
    if (!node.isMesh) return;

    if (data.screen) {
      screens.set(data.screen, node);
      node.visible = false;        // the HTML screen replaces it
      node.raycast = () => {};
      return;
    }
    if (data.sky) {
      sky = node;
      node.raycast = () => {};
      return;
    }

    const old = node.material;
    const map = old && old.map ? old.map : null;
    if (map) {
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = Math.min(8, maxAniso);
      // Upload now, while the loading screen is up, not on the first frame.
      if (renderer) renderer.initTexture(map);
    }
    node.material = new THREE.MeshBasicMaterial({ map, color: 0xffffff, toneMapped: false });
    node.material.name = old ? old.name : 'baked';
    if (old) old.dispose();
    baked.push(node.material);

    if (data.ix) {
      interactive.set(data.ix, node);
    } else {
      node.raycast = () => {};
    }
  });

  const bounds = new THREE.Box3();
  root.traverse((node) => {
    if (node.isMesh && node.visible && !(node.userData && node.userData.screen)) bounds.expandByObject(node);
  });

  return { root, interactive, screens, sky, bounds, materials: baked };
}

// A global tint over every baked material: the evening getting later, or the
// room dimming behind a focused device. Multiplies the baked colour.
export function tintRoom(materials, colour) {
  for (const m of materials) m.color.copy(colour);
}
