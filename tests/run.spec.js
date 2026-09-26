import { test, expect } from '@playwright/test';

// A whole shift from the title screen to the debrief, driven by the key
// decision of each scenario (the scenario tests cover the clicking). This
// checks the run itself: the seeded order, six of the eight scenarios, the
// genuine traffic in between, and the debrief, with nothing requested from
// another origin.
const SAFE = {
  'vendor-bank-change': [['drawer:opened', {}], ['deskphone:connected', { verifies: 'ferrum', genuine: true }], ['erp:changeRejected', { id: 'FS-4471', genuine: false, verified: true }]],
  'push-storm': [['push:denied', { id: 'ps-1' }], ['deskphone:connected', { number: '4040', genuine: true }], ['password:changed', { service: 'veltrix' }]],
  'shared-document': [['domain:checked', { device: 'desktop' }], ['vault:refused', { device: 'desktop' }], ['mail:reported', { genuine: false }]],
  'invoice-attachment': [['file:properties', { danger: true }], ['file:deleted', { danger: true }], ['mail:reported', { genuine: false }]],
  'already-happened': [['terminal:command', { cmd: 'grep', hits: 2 }], ['mailrule:removed', { malicious: true }], ['ticket:raised', { category: 'account' }]],
  'helpful-assistant': [['doc:hiddenShown', { hasHidden: true }], ['assistant:asked', { id: 'sum-contract' }], ['agent:blocked', { dangerous: true }], ['ticket:raised', { category: 'data' }]],
  'ceo-calls': [['call:choice', { choice: 'process' }], ['erp:paymentHeld', { id: 'P-URGENT', genuine: false }], ['deskphone:connected', { verifies: 'ceo', number: '4001', genuine: true }], ['ticket:raised', { category: 'call' }]],
  'after-hours': [['intercom:security', {}], ['usb:handedIn', {}]]
};

async function startSeeded(page, seed) {
  await page.addInitScript(() => { window.__simAutoNext = true; });
  await page.goto('./');
  await page.waitForSelector('.st-card');
  await page.click('.st-more summary');
  await page.fill('#seed-input', seed);
  await page.click('.st-go .btn-ghost');
  await page.waitForFunction(() => window.sim && sim.runner && sim.runner.active);
  return page.evaluate(() => sim.runList.map((s) => s.id));
}

async function clearCards(page) {
  for (let i = 0; i < 6; i++) {
    const btn = page.locator('.overlay:not([hidden]) .btn-primary');
    if (!(await btn.count())) break;
    await btn.click();
    await page.waitForTimeout(350);
  }
}

test('a seed always deals the same shift, and different seeds differ', async ({ page }) => {
  const a1 = await startSeeded(page, 'amber-onyx-42');
  const a2 = await startSeeded(page, 'amber-onyx-42');
  const b = await startSeeded(page, 'swift-otter-7');
  expect(a1).toEqual(a2);
  expect(a1).toHaveLength(6);
  expect(b).not.toEqual(a1);
});

test('a whole shift, from the title screen to the debrief', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  const order = await startSeeded(page, 'amber-onyx-42');
  for (const id of order) {
    await page.waitForFunction((x) => sim.runner.active && sim.runner.active.scenario.id === x, id, { timeout: 30_000 });
    for (const [t, p] of SAFE[id]) {
      await page.evaluate(([t, p]) => sim.bus.emit(t, p), [t, p]);
      await page.waitForTimeout(300);
      await clearCards(page);
    }
    await page.waitForTimeout(400);
    await clearCards(page);
  }

  await expect(page.locator('.db-head')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.db-card')).toHaveCount(order.length);
  const totals = await page.evaluate(() => sim.score.total());
  expect(totals.points).toBeGreaterThan(0);
  expect(totals.stars).toBeGreaterThan(0);

  // Genuine traffic arrives between scenarios: mail, chat, calls, an invite.
  const ambient = await page.evaluate(() => (sim.desktopOS.world.desktop.mail.folders.inbox || []).length + sim.desktopOS.world.office.calendar.events.length);
  expect(ambient).toBeGreaterThan(3);

  // Nothing leaves the browser: only this product's storage, and no request to
  // another origin.
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored.every((k) => k.startsWith('hackersnotes3d.'))).toBe(true);
  const origin = new URL(page.url()).origin;
  const elsewhere = requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(elsewhere).toEqual([]);
  expect(errors).toEqual([]);
});

test('?seed= fills in the seed', async ({ page }) => {
  await page.goto('./?seed=Amber-Onyx-42');
  await page.waitForSelector('.st-card');
  await page.click('.st-more summary');
  await expect(page.locator('#seed-input')).toHaveValue('amber-onyx-42');
});
