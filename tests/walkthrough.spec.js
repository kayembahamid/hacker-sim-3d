import { test, expect } from '@playwright/test';
import { startScenario, card, wait } from './helpers.js';

// The learning walkthrough: every drill shows its steps and ticks them off,
// each finished step says what was done and why it matters, each drill ends on
// what it taught, and a player who only ever presses what the guide points at
// gets all the way through.

test('Guided training is the mode a new player starts on', async ({ page }) => {
  await page.goto('./?scenario=vendor-bank-change');
  await page.waitForSelector('.st-card');
  await expect(page.locator('.st-mode.is-on')).toHaveAttribute('data-mode', 'training');
});

test('the story panel lists the steps and ticks them off', async ({ page }) => {
  await startScenario(page, 'invoice-attachment', 'training', { autoNext: false });
  const steps = page.locator('.ss-steps li');
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0)).toHaveClass(/is-now/);
  await expect(page.locator('.coach-kicker')).toHaveText('Step 1 of 2');

  await page.evaluate(() => sim.bus.emit('file:deleted', { danger: true, name: 'x' }));
  await expect(steps.nth(0)).toHaveClass(/is-done/);
  await expect(page.locator('.next-step .ns-kicker')).toHaveText('Step 1 of 2 done');
  await expect(page.locator('.next-step .ns-did')).not.toBeEmpty();
  await page.click('.next-step');
  await expect(steps.nth(1)).toHaveClass(/is-now/);
  await expect(page.locator('.coach-kicker')).toHaveText('Step 2 of 2');
});

test('a drill ends on what it taught, with a clear next', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change', 'training', { autoNext: false });
  await page.evaluate(() => sim.bus.emit('erp:changeRejected', { id: 'FS-4471' }));
  await card(page);
  await expect(page.locator('.ov-lessons li')).toHaveCount(3);
  await card(page);
  await page.waitForSelector('.screen-root.is-debrief:not([hidden])');
});

test('no lesson card in Assessment', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change', 'assessment', { autoNext: false });
  await page.evaluate(() => sim.bus.emit('erp:changeRejected', { id: 'FS-4471' }));
  await card(page);
  await page.waitForSelector('.screen-root.is-debrief:not([hidden])');
  await expect(page.locator('.ov-lessons')).toHaveCount(0);
});

// Press only what the guide points at: the ringed control, the Back button when
// the step is elsewhere, Next, and the cards. The guide drives the camera.
async function followTheGuide(page, maxTicks = 90) {
  for (let i = 0; i < maxTicks; i++) {
    await wait(page, 1100);
    if (await page.$('.screen-root.is-debrief:not([hidden])')) return true;
    if (await page.$('.overlay:not([hidden]) .ov-buttons button')) {
      const pick = (await page.$('.overlay .coach-mark')) ? '.overlay .coach-mark' : (await page.$('.ov-buttons .btn-primary')) ? '.ov-buttons .btn-primary' : '.ov-buttons button';
      await page.click(pick);
      continue;
    }
    if (await page.$('.next-step:not([hidden])')) { await page.click('.next-step'); continue; }
    const mark = page.locator('.coach-mark').first();
    if (await mark.count()) await mark.click({ force: true }).catch(() => {});
  }
  return false;
}

for (const id of ['vendor-bank-change', 'push-storm', 'sql-injection']) {
  test(`following only the guide finishes ${id}`, async ({ page }) => {
    test.setTimeout(180_000);
    await startScenario(page, id, 'training', { autoNext: false });
    expect(await followTheGuide(page)).toBe(true);
  });
}
