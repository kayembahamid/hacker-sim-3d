import { test, expect } from '@playwright/test';
import { fly, wait, clearCards } from './helpers.js';

// The game has to play the same on a phone, a phone held sideways, a tablet
// (upright and sideways) and a desktop. For each: nothing runs off the side, the
// computer's windows fit the screen, the text is a size a person can read, and
// a drill can be played to its end using nothing but taps.
const SIZES = [
  ['phone', 390, 844, true], ['phone sideways', 844, 390, true], ['tablet', 820, 1180, true],
  ['tablet sideways', 1180, 820, true], ['laptop', 1280, 720, false]
];

async function open(browser, w, h, touch, url) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch && Math.min(w, h) < 500 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForSelector('.st-card');
  return { ctx, page, errs };
}

const readable = (page, sel, floor = 13) => page.evaluate(([s, f]) => {
  const small = [];
  document.querySelectorAll(s).forEach((root) => {
    root.querySelectorAll('*').forEach((e) => {
      if (!e.offsetParent || ![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return;
      const px = parseFloat(getComputedStyle(e).fontSize);
      if (px < f) small.push(`${e.textContent.trim().slice(0, 24)} ${px.toFixed(1)}px`);
    });
  });
  return small;
}, [sel, floor]);

for (const [name, w, h, touch] of SIZES) {
  test(`${name}: the title card, the room and the coach fit and read well`, async ({ browser }) => {
    const { ctx, page, errs } = await open(browser, w, h, touch, './?scenario=sql-injection');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    const card = await page.locator('.st-card').boundingBox();
    expect(card.x).toBeGreaterThanOrEqual(-1);
    expect(card.x + card.width).toBeLessThanOrEqual(w + 1);
    await page.click('.st-go .btn-ghost');
    await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
    await wait(page, 800);
    expect(await readable(page, '.side, .stage-top, .coach, .coach-peek, .next-step')).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    expect(errs).toEqual([]);
    await ctx.close();
  });

  test(`${name}: the computer's windows fit the screen`, async ({ browser }) => {
    const { ctx, page } = await open(browser, w, h, touch, './?scenario=sql-injection');
    await page.click('.st-go .btn-ghost');
    await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
    await fly(page, 'computer');
    await wait(page, 600);
    for (const app of ['bench', 'mail', 'erp', 'cases', 'security']) {
      await page.evaluate((x) => { for (const win of [...sim.desktopOS.world.desktop.windows]) sim.desktopOS.close(win.id); sim.desktopOS.open(x); }, app);
      await wait(page, 350);
      const box = await page.locator(`.desktop-os .dk-app-${app}`).boundingBox();
      const stage = await page.locator('.stage').boundingBox();
      expect(box.x, `${app} left`).toBeGreaterThanOrEqual(stage.x - 1);
      expect(box.x + box.width, `${app} right`).toBeLessThanOrEqual(stage.x + stage.width + 1);
    }
    expect(await readable(page, '.desktop-os .dk-app-security', 12)).toEqual([]);
    await ctx.close();
  });
}

test('a drill can be played from start to finish with taps on a phone', async ({ browser }) => {
  const { ctx, page, errs } = await open(browser, 390, 844, true, './?scenario=sql-injection');
  await page.tap('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await page.tap('.coach-go');
  await page.waitForFunction(() => sim.rig.currentPose === 'computer' && !sim.rig.flight);
  await wait(page, 700);
  await page.tap('.desktop-os .app-bench .ox-tab >> text="Exploit"');
  await page.tap('.desktop-os [data-attempt="inject"]');
  await page.waitForSelector('.overlay:not([hidden]) .btn-primary');
  await page.tap('.overlay:not([hidden]) .btn-primary');
  await wait(page, 400);
  await page.tap('.desktop-os .app-bench .ox-tab >> text="Fix"');
  for (const o of ['param', 'lp']) await page.tap(`.desktop-os [data-opt="${o}"]`);
  await page.tap('.desktop-os .bn-apply');
  await page.waitForSelector('.overlay:not([hidden]) .btn-primary');
  await page.tap('.overlay:not([hidden]) .btn-primary');
  await wait(page, 400);
  await page.tap('.desktop-os .app-bench .ox-tab >> text="Exploit"');
  await page.tap('.desktop-os [data-attempt="inject"]');
  await page.waitForSelector('.overlay:not([hidden]) .btn-primary');
  await page.tap('.overlay:not([hidden]) .btn-primary');
  await wait(page, 600);
  await page.waitForSelector('.next-step:not([hidden]), .db-head', { timeout: 15000 });
  expect(errs).toEqual([]);
  await ctx.close();
});
