// Follow the guide: start a scenario on Guided and only ever press what the
// walkthrough points at (the ringed control, Take me there, Next, card buttons).
//   node dev/look.mjs <outdir> [scenario] [w] [h] [steps]
import { chromium } from '@playwright/test';
const out = process.argv[2];
const scen = process.argv[3] || 'its-me-jawu';
const w = +(process.argv[4] || 1440), h = +(process.argv[5] || 900);
const max = +(process.argv[6] || 60);
const browser = await chromium.launch({ executablePath: new URL('./chrome-native.sh', import.meta.url).pathname, args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'] });
const p = await browser.newPage({ viewport: { width: w, height: h } });
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
const base = process.env.BASE || "http://127.0.0.1:5174/sim/";
await p.goto(`${base}${scen === 'all' ? '?seed=guide-test' : `?scenario=${scen}`}`);
await p.waitForSelector('.st-card');
await p.screenshot({ path: `${out}/00-title.png` });
await p.click('.st-go .btn-ghost');
await p.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
let n = 1;
const shots = process.env.SHOTS !== '0';
const shot = async (name) => { if (!shots && name !== 'debrief') return; await p.screenshot({ path: `${out}/${String(n++).padStart(2, '0')}-${name}.png` }); };
await p.waitForTimeout(900);
await shot('room');
for (let i = 0; i < max; i++) {
  await p.waitForTimeout(1300);
  const state = await p.evaluate(() => ({
    stage: sim.runner.active ? `${sim.runner.active.scenario.id}/${sim.runner.active.stageId}` : 'done',
    card: !!document.querySelector('.overlay:not([hidden]) .ov-buttons button'),
    next: !!document.querySelector('.next-step:not([hidden])'),
    mark: (() => { const m = document.querySelector('.coach-mark'); return m ? (document.querySelector('.coach-bubble') || {}).textContent || 'mark' : null; })(),
    debrief: document.querySelector('.screen-root.is-debrief:not([hidden])') ? true : false,
    pose: sim.rig.currentPose,
    coach: (document.querySelector('.coach:not([hidden]) .coach-kicker') || {}).textContent || null
  }));
  console.log(i, JSON.stringify(state));
  if (state.debrief) { await shot('debrief'); break; }
  if (state.card) {
    await shot('card');
    const pick = (await p.$('.overlay .coach-mark')) ? '.overlay .coach-mark' : (await p.$('.ov-buttons .btn-primary')) ? '.ov-buttons .btn-primary' : '.ov-buttons button';
    await p.click(pick);
    continue;
  }
  if (state.next) { await shot('next'); await p.click('.next-step'); continue; }
  if (state.mark) { await shot('mark'); await p.locator('.coach-mark').first().click({ force: true }).catch((e) => console.log('click fail', e.message)); continue; }
}
await browser.close();
