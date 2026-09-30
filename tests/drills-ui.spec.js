import { test, expect } from '@playwright/test';
import { startScenario, fly, desktopApp, stage, labels, clearCards, wait } from './helpers.js';

// The new pieces the Labs drills are built from, clicked for real rather than
// driven by events: the drill title card, scenario pages, the lock button,
// the Network app, the phone camera, the recovery tab, choice cards and the
// scareware tab.

test('a drill link opens on its own title card, and a track lists its drills', async ({ page }) => {
  await page.goto('./?scenario=gift-card-request');
  await expect(page.locator('.st-title')).toHaveText('Gift cards for the boss');
  await expect(page.locator('.st-kicker')).toContainText('Business email compromise');
  await page.goto('./?track=security-awareness');
  await expect(page.locator('.st-title')).toHaveText('Security Awareness');
  await expect(page.locator('.st-kicker')).toContainText('23 drills');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  const ids = await page.evaluate(() => sim.runList.map((s) => s.id));
  expect(ids).toHaveLength(23);
  expect(ids).toContain('gift-card-request');
  expect(ids).toContain('vendor-bank-change');
});

test('the flagship shift never deals a Labs drill', async ({ page }) => {
  await page.goto('./');
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  const ids = await page.evaluate(() => sim.runList.map((s) => s.id));
  expect(ids).toHaveLength(6);
  const order = await page.evaluate(() => sim.runList.map((s) => s.order));
  expect(order.every((o) => o < 100)).toBe(true);
});

test('a scenario page renders and its buttons score', async ({ page }) => {
  await startScenario(page, 'spear-phishing');
  await fly(page, 'computer');
  await desktopApp(page, 'browser', { url: 'https://workfolk.social/in/sam-rivera' });
  await expect(page.locator('.desktop-os .sx-ph')).toHaveText('Sam Rivera');
  await page.click('.desktop-os [data-page-btn="profile:trimmed"]');
  await wait(page, 300);
  expect(await labels(page)).toEqual(expect.arrayContaining(['Looked yourself up', 'Trimmed what your profile gives away']));
});

test('closing the scareware tab ends it', async ({ page }) => {
  await startScenario(page, 'tech-support-scam');
  await fly(page, 'computer');
  await expect(page.locator('.desktop-os .sx-scare h1')).toHaveText('Your computer has been blocked');
  await page.click('.desktop-os .br-tab.is-on .br-tab-x');
  await expect(page.locator('.ov-title')).toHaveText('It was only ever a web page');
});

test('the lock button locks the desktop and sets the flag', async ({ page }) => {
  await startScenario(page, 'unlocked-workstation');
  await fly(page, 'computer');
  await page.click('.desktop-os .dk-lockbtn');
  await expect(page.locator('.desktop-os .dk-lock')).toBeVisible();
  expect(await page.evaluate(() => sim.runner.store.get().flags['desktop.locked'])).toBe(true);
  expect(await labels(page)).toContain('Locked the screen');
  await page.click('.desktop-os .dk-lock .tb-btn');
  await expect(page.locator('.desktop-os .dk-lock')).toBeHidden();
});

test('unplugging the cable in the Network app stops the ransomware', async ({ page }) => {
  await startScenario(page, 'ransomware-first-ten-minutes');
  await fly(page, 'computer');
  await desktopApp(page, 'network');
  await page.click('.desktop-os .nw-unplug');
  await expect(page.locator('.ov-title')).toHaveText('Cut off, still switched on');
  await clearCards(page);
  expect(await stage(page)).toBe('raise');
  expect(await page.evaluate(() => sim.runner.store.get().flags['net.off'])).toBe(true);
});

test('the phone camera shows where a QR code goes before opening it', async ({ page }) => {
  await startScenario(page, 'qr-phishing');
  await page.evaluate(() => { sim.phoneOS.store.update((s) => { s.phone.locked = false; }); sim.phoneOS.openApp('camera'); });
  await fly(page, 'phone');
  await page.click('.app-camera [data-scan="qr-it"]');
  const host = await page.evaluate(() => sim.runner.active.vars.qrHost);
  await expect(page.locator('.app-camera .cm-url')).toContainText(host.split('.').slice(-2).join('.'));
  await page.click('.app-camera [data-qr="close"]');
  await wait(page, 300);
  expect(await labels(page)).toContain('Read where the code goes, and did not open it');
});

test('removing stale recovery options in Account security closes the back door', async ({ page }) => {
  await startScenario(page, 'account-recovery');
  await fly(page, 'computer');
  await desktopApp(page, 'security');
  await page.click('.desktop-os .app-security .ox-tab >> text="Recovery"');
  for (const id of ['rc-mail', 'rc-phone', 'rc-q']) {
    await page.click(`.desktop-os [data-recovery="${id}"] .tb-btn`);
    await wait(page, 250);
  }
  await expect(page.locator('.ov-title')).toHaveText('The back door is shut');
});

test('the object card and the choice card at the side door', async ({ page }) => {
  await startScenario(page, 'tailgating-side-door');
  await page.evaluate(() => sim.interaction.activate('badge'));
  await page.click('.ov-buttons [data-choice="refuse"]');
  await page.click('.overlay:not([hidden]) [data-choice="firm"]');
  await wait(page, 400);
  expect(await stage(page)).toBe('report');
  expect(await labels(page)).toEqual(expect.arrayContaining(['Said no, politely', 'Held firm under pressure']));
});

test('a scenario prompt appears in Veltrix Assist, and a wrong answer can be reported', async ({ page }) => {
  await startScenario(page, 'hallucination-trust');
  await fly(page, 'computer');
  await desktopApp(page, 'assistant');
  await page.click('.desktop-os [data-prompt="early"]');
  await expect(page.locator('.desktop-os .as-a').first()).toContainText('FIN-7.3');
  await page.click('.desktop-os [data-flag="early"]');
  await wait(page, 300);
  expect(await labels(page)).toContain('Reported the wrong answer');
});

test('the flagship assistant scenario offers its contract prompt', async ({ page }) => {
  await startScenario(page, 'helpful-assistant');
  await fly(page, 'computer');
  await desktopApp(page, 'assistant');
  await expect(page.locator('.desktop-os [data-prompt="sum-contract"]')).toBeVisible();
});

test('a Meet call shows its bot and other people, and nothing stray', async ({ page }) => {
  await startScenario(page, 'ai-notetaker-consent');
  await fly(page, 'computer');
  await desktopApp(page, 'video');
  await page.click('.desktop-os .app-video .vc-controls button');
  await expect(page.locator('.desktop-os .vc-tile.is-bot .vc-rec')).toHaveText('REC');
  await expect(page.locator('.desktop-os .app-video')).not.toContainText('null');
});

test('the Work queue will not send until every required question is answered', async ({ page }) => {
  await startScenario(page, 'subject-access-request');
  await fly(page, 'computer');
  await desktopApp(page, 'cases');
  await expect(page.locator('.desktop-os .cs-act-send')).toBeDisabled();
  for (const o of ['match', 'orders', 'calls', 'segments', 'thread-redacted', 'month']) await page.click(`.desktop-os [data-opt="${o}"]`);
  await expect(page.locator('.desktop-os .cs-act-send')).toBeEnabled();
});
