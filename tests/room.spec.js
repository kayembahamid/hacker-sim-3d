import { test, expect } from '@playwright/test';
import { fly, wait } from './helpers.js';

test('title screen, then the baked office', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.st-title')).toHaveText('Night Shift at Veltrix');
  await expect(page.locator('.st-mode')).toHaveCount(3);
  // The fictional websites' styles must never leak onto the game's own UI.
  const radius = await page.evaluate(() => getComputedStyle(document.querySelector('.st-go .btn-primary')).borderRadius);
  expect(radius).not.toBe('50%');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  const room = await page.evaluate(() => ({
    ix: [...sim.room.interactive.keys()].sort(),
    screens: [...sim.room.screens.keys()].sort(),
    textures: sim.roomMaterials.filter((m) => m.map).length,
    deskphone: !!sim.deskphone, ops: !!sim.opsBoard
  }));
  expect(room.ix).toEqual(['badge', 'computer', 'deskphone', 'drawer', 'intercom', 'notebook', 'phone', 'printer', 'shredder', 'sticky', 'usb', 'whiteboard']);
  expect(room.screens).toEqual(['computer', 'deskphone', 'phone', 'second']);
  expect(room.textures).toBeGreaterThan(10);
  expect(room.deskphone).toBe(true);
  expect(room.ops).toBe(true);
});

test('every object is reachable, and the desktop has more than twenty apps', async ({ page }) => {
  await page.goto('./');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await page.click('.tool[aria-haspopup]');
  await expect(page.locator('.places .place')).toHaveCount(12);
  await page.keyboard.press('Escape');
  const apps = await page.evaluate(() => sim.desktopOS.apps.size);
  expect(apps).toBeGreaterThanOrEqual(20);
});

test('the desk phone dials out, and 9 gives an outside line', async ({ page }) => {
  await page.goto('./');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  await fly(page, 'deskphone');
  await expect(page.locator('.deskphone-os .dp-lcd-main')).toContainText('Ready');
  await page.click('.dp-key >> text="9"');
  await page.click('.dp-key >> text="4"');
  await page.click('.dp-key >> text="0"');
  await page.click('.dp-key >> text="4"');
  await page.click('.dp-key >> text="0"');
  await expect(page.locator('.dp-lcd-sub')).toContainText('Outside line');
});
