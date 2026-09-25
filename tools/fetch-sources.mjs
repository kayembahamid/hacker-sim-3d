// Downloads the CC0 sources named in tools/sources.json into tools/.cache.
//
//   node tools/fetch-sources.mjs
//
// Models land as a .gltf with its .bin and textures beside it, which is what
// Blender's importer wants. Textures land as one folder per material with the
// colour, normal and roughness maps. The cache is gitignored: sources are
// fetched, never committed, and anything already on disk at the right size is
// left alone, so a re-run is cheap.
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE = join(HERE, '.cache');
const API = 'https://api.polyhaven.com';
const log = (...a) => console.log('[fetch]', ...a);

async function exists(path, size) {
  try {
    const s = await stat(path);
    return size ? s.size === size : s.size > 0;
  } catch { return false; }
}

async function download(url, dest, size) {
  if (await exists(dest, size)) return false;
  await mkdir(dirname(dest), { recursive: true });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      await writeFile(dest, Buffer.from(await res.arrayBuffer()));
      return true;
    } catch (err) {
      if (attempt === 3) throw new Error(`${err.message} for ${url}`);
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  return false;
}

async function files(id) {
  const res = await fetch(`${API}/files/${id}`);
  if (!res.ok) throw new Error(`Poly Haven has no files for ${id} (${res.status})`);
  return res.json();
}

// Most models ship as glTF. A few sets only ship as .blend, which Blender can
// append from directly, so the manifest says which one to take.
async function fetchModel(entry) {
  const info = await files(entry.id);
  const format = entry.format || 'gltf';
  const bundle = info[format]?.[entry.res]?.[format];
  if (!bundle) throw new Error(`${entry.id} has no ${entry.res} ${format}`);
  const base = join(CACHE, 'models', entry.id);
  let got = await download(bundle.url, join(base, `${entry.id}.${format}`), bundle.size);
  for (const [rel, file] of Object.entries(bundle.include || {})) {
    got = (await download(file.url, join(base, rel), file.size)) || got;
  }
  log(got ? 'got' : 'cached', `model ${entry.id}`);
  return join(base, `${entry.id}.${format}`);
}

// Colour, OpenGL normal and roughness are all the bake needs. Displacement is
// skipped: at this scale it would only cost triangles.
// Some fabrics come in colourways instead of one Diffuse map; the manifest's
// "color" names the one to take.
async function fetchTexture(entry) {
  const info = await files(entry.id);
  const base = join(CACHE, 'textures', entry.id);
  const out = {};
  let got = false;
  const maps = { [entry.color || 'Diffuse']: 'diff', nor_gl: 'nor', Rough: 'rough' };
  for (const [key, short] of Object.entries(maps)) {
    const file = info[key]?.[entry.res]?.jpg || info[key]?.[entry.res]?.png;
    if (!file) continue;
    const ext = file.url.split('.').pop();
    const dest = join(base, `${short}.${ext}`);
    got = (await download(file.url, dest, file.size)) || got;
    out[short] = dest;
  }
  log(got ? 'got' : 'cached', `texture ${entry.id}`);
  return out;
}

export async function fetchAll(manifestPath = join(HERE, 'sources.json')) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  await mkdir(CACHE, { recursive: true });
  const paths = { models: {}, textures: {} };
  for (const m of manifest.models || []) paths.models[m.id] = await fetchModel(m);
  for (const t of manifest.textures || []) paths.textures[t.id] = await fetchTexture(t);
  // Blender reads this to find everything without knowing about Poly Haven.
  await writeFile(join(CACHE, 'sources.resolved.json'), JSON.stringify(paths, null, 2));
  return { manifest, paths };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchAll().then(() => log('done')).catch((err) => {
    console.error('[fetch] failed:', err.message);
    process.exit(1);
  });
}
