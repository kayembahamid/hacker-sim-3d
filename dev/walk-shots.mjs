// Captures the stills for the "how the room works" walkthrough on
// labs.hamcodes.com. Run against a preview of the build:
//   npx vite preview --port 4174 &  node dev/walk-shots.mjs <outDir>
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';

const out = process.argv[2] || '.';
const base = 'http://127.0.0.1:4174/sim/';
const rosetta = process.platform === 'darwin' && process.arch === 'x64' && (() => {
  try { return execSync('sysctl -n hw.optional.arm64', { encoding: 'utf8' }).trim() === '1'; } catch { return false; }
})();
const browser = await chromium.launch({
  ...(rosetta ? { executablePath: new URL('./chrome-native.sh', import.meta.url).pathname } : { channel: 'chrome' }),
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal']
});

async function start(id, autoNext) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  if (autoNext) await page.addInitScript(() => { window.__simAutoNext = true; });
  await page.goto(`${base}?scenario=${id}`);
  await page.waitForSelector('.st-card');
  await page.click('.st-mode[data-mode="training"]');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await page.waitForTimeout(2500);
  return page;
}

// 1. the room, with the coach saying what to do now
let page = await start('vendor-bank-change', true);
await page.screenshot({ path: `${out}/walk-room.jpg`, type: 'jpeg', quality: 80 });

// 0. the bare room, no panels: the poster behind the play button
const box = await page.locator('canvas').first().boundingBox();
await page.addStyleTag({ content: 'body *{visibility:hidden !important} canvas{visibility:visible !important}' });
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/walk-bare.jpg`, type: 'jpeg', quality: 82, clip: box });
await page.addStyleTag({ content: 'body *{visibility:visible !important}' });
await page.waitForTimeout(300);

// 2. the computer, open on the desktop
await page.locator('.coach-go').click();
await page.waitForFunction(() => sim.shell.deviceOpen || sim.rig.currentPose === 'computer');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/walk-device.jpg`, type: 'jpeg', quality: 80 });
await page.close();

// 3. a finished step, waiting on Next
page = await start('invoice-attachment', false);
await page.evaluate(() => sim.bus.emit('file:deleted', { danger: true }));
await page.locator('.next-step').waitFor({ state: 'visible' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/walk-next.jpg`, type: 'jpeg', quality: 80 });
await page.close();

await browser.close();
console.log('shots in', out);
