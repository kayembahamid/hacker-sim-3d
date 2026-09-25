// Writes CREDITS.md from tools/sources.json. It is generated, never edited by
// hand, so every asset that ships has a row and nothing is listed that does
// not ship.
//
//   node tools/credits.mjs
//
// Authors come from the Poly Haven API (the same public API the fetcher
// uses) and are cached in tools/.cache/info, so a second run works offline.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const CACHE = join(HERE, '.cache', 'info');
const API = 'https://api.polyhaven.com/info/';

async function info(id) {
  const file = join(CACHE, `${id}.json`);
  if (existsSync(file)) return JSON.parse(await readFile(file, 'utf8'));
  const res = await fetch(API + encodeURIComponent(id));
  if (!res.ok) throw new Error(`Poly Haven info for ${id}: HTTP ${res.status}`);
  const data = await res.json();
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2));
  return data;
}

const authors = (data) => Object.keys(data.authors || {}).join(', ') || 'Poly Haven';
const cell = (s) => String(s).replace(/\|/g, '\\|');

async function rows(list) {
  const out = [];
  for (const entry of list) {
    const data = await info(entry.id);
    out.push(`| ${cell(data.name || entry.name || entry.id)} | ${cell(entry.role || '')} | ${cell(authors(data))} | [polyhaven.com/a/${entry.id}](https://polyhaven.com/a/${entry.id}) | CC0 1.0 |`);
  }
  return out;
}

const src = JSON.parse(await readFile(join(HERE, 'sources.json'), 'utf8'));
const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
const dep = (name) => (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name] || '';

const md = [
  '# Credits',
  '',
  `Everything in ${src.product} is either released under CC0 (public domain) or made for this project. There are no real brands, logos, people or companies anywhere in it. This file is written by \`tools/credits.mjs\` from \`tools/sources.json\`: edit those, then run \`npm run credits\`.`,
  '',
  '## 3D models',
  '',
  'From [Poly Haven](https://polyhaven.com), under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Each one was reduced and repainted with the room\'s baked lighting before shipping.',
  '',
  '| Model | Used for | Author | Source | Licence |',
  '| --- | --- | --- | --- | --- |',
  ...(await rows(src.models || [])),
  '',
  '## Surface textures',
  '',
  'From [Poly Haven](https://polyhaven.com), under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). They were used at bake time only: the shipped textures are the baked result.',
  '',
  '| Texture | Used for | Author | Source | Licence |',
  '| --- | --- | --- | --- | --- |',
  ...(await rows(src.textures || [])),
  '',
  '## Made for this project',
  '',
  '| What | How |',
  '| --- | --- |',
  ...(src.original || []).map((o) => `| ${cell(o.what)} | ${cell(o.how)} |`),
  '',
  '## Fonts',
  '',
  'Self hosted from the [Fontsource](https://fontsource.org) packages, so no font service is ever contacted.',
  '',
  '| Font | Licence |',
  '| --- | --- |',
  ...(src.fonts || []).map((f) => `| ${cell(f.name)} | ${cell(f.licence)} |`),
  '',
  '## Code in the game',
  '',
  '| Library | Version | Licence |',
  '| --- | --- | --- |',
  `| [three.js](https://threejs.org) | ${dep('three')} | MIT |`,
  '| [Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder (ships with three.js) | | Apache 2.0 |',
  '| [meshoptimizer](https://github.com/zeux/meshoptimizer) decoder (ships with three.js) | | MIT |',
  '',
  '## Tools used to build it',
  '',
  'Not shipped, used on the way.',
  '',
  '| Tool | Licence |',
  '| --- | --- |',
  '| [Blender](https://www.blender.org) and Cycles, for modelling and baking | GPL (the output is not covered) |',
  `| [Vite](https://vite.dev) ${dep('vite')} | MIT |`,
  `| [glTF Transform](https://gltf-transform.dev) ${dep('@gltf-transform/core')} | MIT |`,
  '| [KTX-Software](https://github.com/KhronosGroup/KTX-Software) (`ktx create`) | Apache 2.0 |',
  `| [sharp](https://sharp.pixelplumbing.com) ${dep('sharp')} | Apache 2.0 |`,
  `| [Playwright](https://playwright.dev) ${dep('@playwright/test')} | Apache 2.0 |`,
  ''
].join('\n');

await writeFile(join(ROOT, 'CREDITS.md'), md);
console.log(`CREDITS.md: ${(src.models || []).length} models, ${(src.textures || []).length} textures, ${(src.original || []).length} original items.`);
