// Load performance: boot marks, main thread long tasks, bytes on the wire up
// to the start card, and the frame rate in the room afterwards.
//   node dev/perf.mjs [url] [--mobile] [--cpu=4]
import { chromium } from '@playwright/test';
const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4173/play/3d/';
const mobile = args.includes('--mobile');
const cpu = Number((args.find((a) => a.startsWith('--cpu=')) || '--cpu=1').split('=')[1]);
const native = process.platform === 'darwin' && process.arch === 'x64' && !process.env.NO_NATIVE;
const browser = await chromium.launch({ ...(native ? { executablePath: new URL('./chrome-native.sh', import.meta.url).pathname } : { channel: 'chrome' }), args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'] });
const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
await cdp.send('Network.enable');
let bytes = 0;
cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
await page.addInitScript(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true });
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
await page.goto(url);
await page.waitForSelector('.st-card', { timeout: 120000 });
const firstView = bytes;
await page.click('.st-go .btn-ghost');
await page.waitForTimeout(2500);
const r = await page.evaluate(() => new Promise((res) => {
  const times = [];
  let last = performance.now();
  const f = () => { const n = performance.now(); times.push(n - last); last = n; if (times.length < 300) requestAnimationFrame(f); else res(times); };
  requestAnimationFrame(f);
})).then(async (times) => {
  const info = await page.evaluate(() => ({ lt: window.__lt, marks: performance.getEntriesByType('mark').map((m) => `${m.name} ${Math.round(m.startTime)}`) }));
  const sorted = [...times].sort((a, b) => a - b);
  return { ...info, fps: (1000 / (times.reduce((a, b) => a + b, 0) / times.length)).toFixed(1), p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(1), worst: sorted[sorted.length - 1].toFixed(1) };
});
console.log(`${mobile ? 'phone 390x844@3x' : 'desktop 1440x900@2x'}${cpu > 1 ? ` cpu/${cpu}` : ''}`);
console.log('marks  ', r.marks.join(' | '));
console.log('long   ', r.lt.map(([s, d]) => `${s}+${d}`).join('  '));
console.log(`first view ${(firstView / 1e6).toFixed(2)} MB on the wire; fps ${r.fps} (p95 frame ${r.p95} ms, worst ${r.worst} ms)`);
if (errors.length) console.log('console:', [...new Set(errors)].join('\n  '));
await browser.close();
