// Squeeze the baked room down to something a phone can fetch over school Wi-Fi.
//
//   node tools/optimize-room.mjs <in.glb> <out.glb> [--tex etc1s|uastc|webp] [--q 0-255]
//
// Geometry: deduplicated, quantised and meshopt compressed (decoded in the
// browser by three's MeshoptDecoder, a few kilobytes of JS).
//
// Textures: KTX2 by default. KTX2 stays compressed on the GPU, so a room that
// would need ~90 MB of video memory as PNG or WebP needs about a sixth of that,
// which is the difference between a cheap Android phone coping or not.
// ETC1S is the small one; UASTC keeps smooth baked gradients cleaner at a
// bigger size. The encoder is Khronos' own `ktx` tool, unpacked into
// tools/.cache/ktx (see README), so nothing is installed system wide.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, prune, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const KTX = join(HERE, '.cache', 'ktx', 'bin', 'ktx');

const args = process.argv.slice(2);
const [input, output] = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a));
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const mode = opt('tex', 'etc1s');
const quality = Number(opt('q', mode === 'webp' ? 88 : 255));

if (!input || !output) {
  console.error('usage: node tools/optimize-room.mjs <in.glb> <out.glb> [--tex etc1s|uastc|webp]');
  process.exit(1);
}
if (mode !== 'webp' && !existsSync(KTX)) {
  console.error(`KTX encoder not found at ${KTX}. Run: node tools/get-ktx.mjs, or use --tex webp`);
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function encodeKtx2(png, name, dir) {
  const src = join(dir, `${name}.png`);
  const dst = join(dir, `${name}.ktx2`);
  writeFileSync(src, png);
  const common = ['create', '--format', 'R8G8B8_SRGB', '--assign-tf', 'srgb', '--generate-mipmap'];
  const enc = mode === 'uastc'
    ? ['--encode', 'uastc', '--uastc-quality', '2', '--uastc-rdo', '--uastc-rdo-l', '1.0', '--zstd', '18']
    : ['--encode', 'basis-lz', '--clevel', '4', '--qlevel', String(quality)];
  execFileSync(KTX, [...common, ...enc, src, dst], { stdio: ['ignore', 'ignore', 'inherit'] });
  return readFileSync(dst);
}

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const before = statSync(input).size;
const doc = await io.read(input);

await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepLeaves: false }),
  quantize({ quantizePosition: 14, quantizeTexcoord: 14 }),
  meshopt({ encoder: MeshoptEncoder, level: 'high' })
);

if (mode === 'webp') {
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality }));
} else {
  const dir = mkdtempSync(join(tmpdir(), 'room-ktx-'));
  let i = 0;
  for (const tex of doc.getRoot().listTextures()) {
    const name = (tex.getName() || `tex${i}`).replace(/[^\w-]/g, '_');
    i++;
    const png = tex.getImage();
    const t0 = Date.now();
    const out = encodeKtx2(Buffer.from(png), name, dir);
    tex.setImage(out).setMimeType('image/ktx2');
    if (tex.getURI()) tex.setURI(tex.getURI().replace(/\.\w+$/, '.ktx2'));
    console.log(`[optimize] ${name}: ${kb(png.byteLength)} png -> ${kb(out.byteLength)} ktx2 (${mode}) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  rmSync(dir, { recursive: true, force: true });
}

await io.write(output, doc);
const after = statSync(output).size;
console.log(`[optimize] ${kb(before)} -> ${kb(after)} (${Math.round((1 - after / before) * 100)}% smaller)`);
