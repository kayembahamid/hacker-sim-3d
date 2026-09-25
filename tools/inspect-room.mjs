// Lists every mesh in a room file with its vertex and triangle counts and its
// tags, then the textures and their sizes.
//   node tools/inspect-room.mjs public/assets/room/bedroom.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
let total = 0;
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  let v = 0, t = 0;
  for (const p of mesh.listPrimitives()) { v += p.getAttribute('POSITION').getCount(); t += (p.getIndices() ? p.getIndices().getCount() : v) / 3; }
  total += v;
  rows.push([node.getName(), v, Math.round(t), JSON.stringify(node.getExtras())]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const r of rows) console.log(String(r[1]).padStart(8), String(r[2]).padStart(8), r[0], r[3]);
console.log('total verts', total);
for (const t of doc.getRoot().listTextures()) console.log('tex', t.getName(), t.getMimeType(), (t.getImage().byteLength / 1024).toFixed(0) + 'KB');
