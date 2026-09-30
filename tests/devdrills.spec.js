import { test, expect } from '@playwright/test';
import { startScenario, stage, score, clearCards, wait, fly, desktopApp } from './helpers.js';

// The Developer Track drills (Workbench), each played on its own the way the
// catalogue opens it. The careful path: read the code, try normal use, break
// it, pick every right fix, then prove it. The bypassable path: apply a fix
// that can be walked round, see the consequence and rewind.
const SLUGS = ["sql-injection", "stored-xss", "ssrf", "broken-access-control", "hardcoded-secrets", "insecure-deserialization", "vulnerable-dependency", "password-storage", "bola", "mass-assignment", "no-rate-limit", "over-privileged-key", "excessive-data-exposure", "improper-inventory", "secret-in-history", "malicious-pr", "branch-protection", "dependency-confusion", "ci-log-leak", "public-bucket", "over-permissive-iam", "exposed-dashboard", "root-account", "cloud-logging", "public-snapshot"];

async function emit(page, t, p = {}, clear = true) {
  await page.evaluate(([type, payload]) => sim.bus.emit(type, payload), [t, p]);
  await wait(page, 250);
  if (clear) await clearCards(page);
}

for (const id of SLUGS) {
  test(`${id}: the careful path reaches the debrief with three stars`, async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await startScenario(page, id);
    await emit(page, 'bench:fileViewed', { vulnerable: true });
    await emit(page, 'bench:attempt', { exploited: false });
    await emit(page, 'bench:attempt', { exploited: true });
    await emit(page, 'bench:fixApplied', { ok: true, bad: '' });
    await emit(page, 'bench:retest', { exploit: false, fixed: true, blocked: false });
    await emit(page, 'bench:retest', { exploit: true, fixed: true, blocked: true });
    await page.waitForTimeout(400);
    await clearCards(page);
    expect(await stage(page)).toBe('done');
    expect((await score(page)).stars).toBe(3);
    expect(errs).toEqual([]);
  });

  test(`${id}: a bypassable fix shows its consequence and rewinds`, async ({ page }) => {
    await startScenario(page, id);
    await emit(page, 'bench:attempt', { exploited: true });
    await emit(page, 'bench:fixApplied', { ok: false, bad: 'weak' }, false);
    await expect(page.locator('.ov-buttons [data-choice="rewind"]')).toBeVisible();
    await page.click('.ov-buttons [data-choice="rewind"]');
    await page.waitForTimeout(400);
    expect(await stage(page)).toBe('fix');
  });
}

test('the Workbench works with real clicks: read, exploit, fix, prove', async ({ page }) => {
  await startScenario(page, 'sql-injection');
  await fly(page, 'computer');
  await expect(page.locator('.desktop-os .app-bench .bn-code')).toContainText('SELECT id, role FROM users');
  await page.click('.desktop-os .app-bench .ox-tab >> text="Exploit"');
  await page.click('.desktop-os [data-attempt="normal"]');
  await page.click('.desktop-os [data-attempt="inject"]');
  await expect(page.locator('.ov-title')).toHaveText('The password check disappeared');
  await clearCards(page);
  await page.click('.desktop-os .app-bench .ox-tab >> text="Fix"');
  await expect(page.locator('.desktop-os .bn-apply')).toBeDisabled();
  for (const o of ['param', 'lp']) await page.click(`.desktop-os [data-opt="${o}"]`);
  await page.click('.desktop-os .bn-apply');
  await expect(page.locator('.ov-title')).toHaveText('Data can no longer become code');
  await clearCards(page);
  await page.click('.desktop-os .app-bench .ox-tab >> text="Exploit"');
  await page.click('.desktop-os [data-attempt="normal"]');
  await page.click('.desktop-os [data-attempt="inject"]');
  await expect(page.locator('.desktop-os .app-bench .bn-io').last()).toContainText('bad login');
  await clearCards(page);
  expect(await stage(page)).toBe('done');
  expect((await score(page)).stars).toBe(3);
});

test('the Fix tab will not apply before the bug is reproduced', async ({ page }) => {
  await startScenario(page, 'bola');
  await fly(page, 'computer');
  await page.click('.desktop-os .app-bench .ox-tab >> text="Fix"');
  await expect(page.locator('.desktop-os [data-opt="scope"]')).toBeDisabled();
  await expect(page.locator('.desktop-os .bn-apply')).toBeDisabled();
});
