import { defineConfig } from '@playwright/test';
import { execSync } from 'node:child_process';

// Runs against the Vite dev server. Chrome with the GPU on, because the room
// is WebGL: the tests check the real rendering path, not a software fallback.
//
// On an Apple Silicon Mac with an Intel build of Node, Chrome launched from
// Node runs under Rosetta too, and everything in it gets several times
// slower. dev/chrome-native.sh starts the native build instead.
const rosetta = process.platform === 'darwin' && process.arch === 'x64' && (() => {
  try { return execSync('sysctl -n hw.optional.arm64', { encoding: 'utf8' }).trim() === '1'; } catch { return false; }
})();
const browser = rosetta
  ? { executablePath: new URL('./dev/chrome-native.sh', import.meta.url).pathname }
  : { channel: 'chrome' };

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // The room is WebGL and the machine runs Chrome under heavy orchestration,
  // so a rare navigation stalls. One retry absorbs that environmental flake.
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174/sim/',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: { ...browser, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'] }
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174/sim/',
    reuseExistingServer: true,
    timeout: 60_000
  }
});
