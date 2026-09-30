import { test, expect } from '@playwright/test';
import { startScenario, fly, desktopApp, wait } from './helpers.js';

// The walkthrough's pointer: a ring and a label on the exact control the step
// needs, inside the phone, the computer and the desk phone.
const label = (page) => page.locator('.coach-bubble').first();

test('inside the computer it points at the way in, then at the control', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change', 'training', { autoNext: false });
  await fly(page, 'computer');
  // Nothing open yet: it points at the app the step needs.
  await expect(page.locator('.coach-mark')).toHaveCount(1);
  await expect(label(page)).toContainText(/Open (Finance|Mail)/);
  await desktopApp(page, 'erp');
  await expect(label(page)).toContainText(/Open this request|Open Bank detail changes/);
  await page.click('.desktop-os [data-change="FS-4471"]');
  await expect(label(page)).toContainText('Press Reject change');
  await expect(page.locator('.desktop-os .coach-mark')).toContainText('Reject');
});

test('it never points at the risky move', async ({ page }) => {
  await startScenario(page, 'vendor-bank-change', 'training', { autoNext: false });
  await fly(page, 'computer');
  await desktopApp(page, 'erp');
  await page.click('.desktop-os [data-change="FS-4471"]');
  await wait(page, 700);
  const marked = await page.locator('.desktop-os .coach-mark').allTextContents();
  expect(marked.join(' ')).not.toContain('Approve');
});

test('on the Workbench it walks through the tabs', async ({ page }) => {
  await startScenario(page, 'sql-injection', 'training', { autoNext: false });
  await fly(page, 'computer');
  await expect(label(page)).toContainText('Open the Exploit tab');
  await page.click('.desktop-os .app-bench .ox-tab >> text="Exploit"');
  await expect(label(page)).toContainText('Send this request');
});

test('a finished step names what comes next', async ({ page }) => {
  await startScenario(page, 'invoice-attachment', 'training', { autoNext: false });
  await page.evaluate(() => sim.bus.emit('file:deleted', { danger: true, id: 'x', name: 'x' }));
  const next = page.locator('.next-step');
  await expect(next).toBeVisible();
  await expect(next.locator('.ns-about')).toContainText('Next: Report the email');
  await next.click();
  await wait(page, 400);
  expect(await page.evaluate(() => sim.runner.active.stageId)).toBe('reported');
});

test('with nothing touched, the guide takes the player to the device after a pause', async ({ page }) => {
  await startScenario(page, 'sql-injection', 'training', { autoNext: false });
  await page.waitForFunction(() => sim.rig.currentPose === 'computer', null, { timeout: 12000 });
});

test('a player who acts first is not taken anywhere', async ({ page }) => {
  await startScenario(page, 'sql-injection', 'training', { autoNext: false });
  await page.mouse.click(700, 400);
  await wait(page, 6500);
  expect(await page.evaluate(() => sim.rig.currentPose)).toBe('overview');
});

test('the pointer works on a phone sized screen too', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('./?scenario=sql-injection');
  await page.waitForSelector('.st-card');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await fly(page, 'computer');
  await expect(label(page)).toContainText('Open the Exploit tab');
  const box = await page.locator('.desktop-os .app-bench').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  await ctx.close();
});

test('on a phone, tapping a desktop icon opens the app, and the pointer leads there', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('./?scenario=shared-document');
  await page.waitForSelector('.st-card');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await fly(page, 'computer');
  await expect(label(page)).toContainText('Open Mail');
  await page.tap('.desktop-os .dk-icon[data-app="mail"]');
  await wait(page, 600);
  expect(await page.evaluate(() => sim.desktopOS.world.desktop.windows.some((w) => w.app === 'mail'))).toBe(true);
  await ctx.close();
});
