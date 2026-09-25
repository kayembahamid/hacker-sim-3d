// Downloads the Khronos KTX-Software command line tools (Apache 2.0) into
// tools/.cache/ktx, where tools/optimize-room.mjs looks for `ktx create`.
// macOS (Apple Silicon or Intel) and Linux x86_64.
//
//   node tools/get-ktx.mjs
import { mkdir, writeFile, cp, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '4.4.2';
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '.cache', 'ktx');
const TMP = join(HERE, '.cache', 'ktx-pkg');
const BASE = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${VERSION}/`;

if (existsSync(join(OUT, 'bin', 'ktx'))) {
  console.log(`[ktx] already installed: ${execFileSync(join(OUT, 'bin', 'ktx'), ['--version'], { encoding: 'utf8' }).trim()}`);
  process.exit(0);
}

// Node may itself be an Intel build under Rosetta, so ask the machine.
const appleSilicon = () => { try { return execFileSync('sysctl', ['-n', 'hw.optional.arm64'], { encoding: 'utf8' }).trim() === '1'; } catch { return false; } };
let file;
if (process.platform === 'darwin') file = `KTX-Software-${VERSION}-Darwin-${appleSilicon() ? 'arm64' : 'x86_64'}.pkg`;
else if (process.platform === 'linux' && process.arch === 'x64') file = `KTX-Software-${VERSION}-Linux-x86_64.tar.bz2`;
else { console.error('[ktx] no prebuilt tools for this platform. Install KTX-Software yourself and copy bin/ and lib/ into tools/.cache/ktx.'); process.exit(1); }

await rm(TMP, { recursive: true, force: true });
await mkdir(TMP, { recursive: true });
console.log(`[ktx] downloading ${file}`);
const res = await fetch(BASE + file);
if (!res.ok) throw new Error(`[ktx] ${file}: HTTP ${res.status}`);
const archive = join(TMP, file);
await writeFile(archive, Buffer.from(await res.arrayBuffer()));

await mkdir(join(OUT, 'bin'), { recursive: true });
await mkdir(join(OUT, 'lib'), { recursive: true });
if (file.endsWith('.pkg')) {
  const x = join(TMP, 'x');
  execFileSync('pkgutil', ['--expand-full', archive, x]);
  for (const part of await readdir(x)) {
    const local = join(x, part, 'Payload', 'usr', 'local');
    if (part.endsWith('-tools.pkg')) await cp(join(local, 'bin'), join(OUT, 'bin'), { recursive: true });
    if (part.endsWith('-library.pkg')) await cp(join(local, 'lib'), join(OUT, 'lib'), { recursive: true, verbatimSymlinks: true });
  }
} else {
  execFileSync('tar', ['xjf', archive, '-C', TMP]);
  const dir = join(TMP, file.replace('.tar.bz2', ''));
  await cp(join(dir, 'bin'), join(OUT, 'bin'), { recursive: true });
  await cp(join(dir, 'lib'), join(OUT, 'lib'), { recursive: true, verbatimSymlinks: true });
}
console.log(`[ktx] installed: ${execFileSync(join(OUT, 'bin', 'ktx'), ['--version'], { encoding: 'utf8' }).trim()}`);
