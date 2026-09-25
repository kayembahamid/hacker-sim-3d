import { test, expect } from '@playwright/test';
import { startScenario } from './helpers.js';

// The guided walkthrough: the coach should say what to do now and offer a ride
// to where to do it, and it should be possible to turn off.
test('coach shows the step and flies you to the target', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change');
  const coach = page.locator('.coach');
  await expect(coach).toBeVisible();
  await expect(page.locator('.coach-text')).not.toBeEmpty();

  const go = page.locator('.coach-go');
  await expect(go).toBeVisible();
  await go.click();
  // The first step points at the computer, so the camera flies in and the
  // screen opens; the coach steps aside to its tab while a device is open.
  await page.waitForFunction(() => window.sim && (sim.shell.deviceOpen || sim.rig.currentPose === 'computer'));
  await expect(page.locator('.coach-peek')).toBeVisible();
});

test('the guide toggle hides the coach and is remembered', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change');
  await expect(page.locator('.coach')).toBeVisible();

  await page.evaluate(() => sim.shell.toggleGuide());
  await expect(page.locator('.coach')).toBeHidden();
  expect(await page.evaluate(() => sim.shell.guide)).toBe(false);
  const saved = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.endsWith('.guide'));
    return k ? localStorage.getItem(k) : null;
  });
  expect(saved).toBe('false');
});
