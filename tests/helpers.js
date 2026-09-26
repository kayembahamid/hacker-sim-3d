import { expect } from '@playwright/test';

// Start one scenario on its own (the ?scenario= switch) in a given mode.
// By default the runner runs straight through the Next button so a test can
// drive a whole scenario by its key events; pass { autoNext: false } to leave
// the Next button in the player's hands (used to test the button itself).
export async function startScenario(page, id, mode = 'training', { autoNext = true } = {}) {
  if (autoNext) await page.addInitScript(() => { window.__simAutoNext = true; });
  await page.goto(`./?scenario=${id}`);
  await page.waitForSelector('.st-card');
  await page.click(`.st-mode[data-mode="${mode}"]`);
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
}

export const wait = (page, ms = 400) => page.waitForTimeout(ms);

export async function fly(page, id) {
  await page.evaluate((x) => sim.interaction.activate(x), id);
  await page.waitForFunction((x) => sim.rig.currentPose === x && !sim.rig.flight, id);
  await wait(page, 300);
}

export async function desktopApp(page, id, params) {
  await page.evaluate(([x, p]) => sim.desktopOS.open(x, p || {}), [id, params]);
  await wait(page, 400);
}

// Fire an engine event (the scenarios react to events; the UI raises the same
// ones). Used to drive a scenario's key decisions without depending on the
// exact pixel of every control.
export async function emit(page, type, payload = {}) {
  await page.evaluate(([t, p]) => sim.bus.emit(t, p), [type, payload]);
  await wait(page, 250);
  await clearCards(page);
}

export async function clearCards(page) {
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('.overlay:not([hidden]) .btn-primary');
    if (!(await btn.count())) break;
    await btn.click();
    await wait(page, 300);
  }
}

export async function card(page, choice) {
  await page.waitForSelector('.overlay:not([hidden]) .ov-buttons button');
  await page.click(choice ? `.ov-buttons [data-choice="${choice}"]` : '.ov-buttons .btn-primary');
  await wait(page, 400);
}

export async function score(page) { return page.evaluate(() => sim.score.list()[0]); }
export async function stage(page) { return page.evaluate(() => (sim.runner.active ? sim.runner.active.stageId : 'done')); }
export async function labels(page) { return (await score(page)).events.map((e) => e.label); }
