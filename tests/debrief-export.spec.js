import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startScenario, emit, clearCards } from './helpers.js';

const BENCH = [
  ['bench:fileViewed', { vulnerable: true }],
  ['bench:attempt', { exploited: false }],
  ['bench:attempt', { exploited: true }],
  ['bench:fixApplied', { ok: true, bad: '' }],
  ['bench:retest', { exploit: false, fixed: true, blocked: false }],
  ['bench:retest', { exploit: true, fixed: true, blocked: true }]
];

const FEATURED = {
  'shared-document': { text: 'Check the full sender address', steps: [['domain:checked', { device: 'desktop' }], ['cert:viewed', { device: 'desktop' }], ['vault:refused', { device: 'desktop' }], ['inspector:viewed', { offsite: true }], ['mail:reported', { genuine: false }]] },
  'chatbot-data-leak': { text: 'approved AI tool', steps: [['page:shown', { page: 'qm', path: '/terms' }], ['page:shown', { page: 'policies' }], ['assistant:asked', { id: 'spend' }]] },
  'report-fast': { text: 'even if you already clicked', steps: [['deskphone:connected', { verifies: 'it' }], ['mail:reported', { id: 'rf-mail', genuine: false }]] },
  'vendor-bank-change': { text: 'contact route you already trust', steps: [['drawer:opened', {}], ['erp:vendorViewed', { id: 'ferrum' }], ['headers:viewed', { genuine: false }], ['deskphone:connected', { verifies: 'ferrum', genuine: true }], ['erp:changeRejected', { id: 'FS-4471', genuine: false, verified: true }]] },
  'push-storm': { text: 'Deny sign-in prompts you did not start', steps: [['push:denied', { id: 'ps-1' }], ['push:denied', { id: 'ps-2' }], ['deskphone:choice', { choice: 'check' }], ['deskphone:connected', { number: '4040', genuine: true }], ['password:changed', { service: 'veltrix' }]] },
  'account-recovery': { text: 'approved identity verification', steps: [['signins:viewed', {}], ['recovery:viewed', {}], ['call:choice', { choice: 'refuse' }], ['recovery:removed', { id: 'rc-mail', stale: true }], ['recovery:removed', { id: 'rc-phone', stale: true }], ['recovery:removed', { id: 'rc-q', stale: true }], ['password:changed', { service: 'veltrix' }], ['ticket:raised', { category: 'account' }]] },
  'sql-injection': { text: 'parameterized queries', steps: BENCH },
  'stored-xss': { text: 'output encoding', steps: BENCH },
  'broken-access-control': { text: 'permissions on the server', steps: BENCH }
};

async function complete(page, id) {
  await startScenario(page, id);
  for (const [event, payload] of FEATURED[id].steps) await emit(page, event, payload);
  await clearCards(page);
  await expect(page.locator('.debrief')).toBeVisible();
}

for (const [id, { text }] of Object.entries(FEATURED)) {
  test(`${id}: completed drill connects the debrief to a workplace action`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await complete(page, id);
    await expect(page.getByRole('heading', { name: 'What to do at work' })).toBeVisible();
    await expect(page.locator(`[data-workplace-scenario="${id}"]`)).toContainText(text);
    expect(await page.evaluate(() => sim.score.list()[0].stars)).toBe(3);
    expect(errors).toEqual([]);
  });
}

test('participant downloads the completed fictional result and can replay it', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('sessionBrief', 'FICTIONAL-INTERNAL-DETAIL-DO-NOT-EXPORT');
  });
  await complete(page, 'vendor-bank-change');
  // Export uses an explicit learning-record schema, not surrounding page state.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.name = 'approved-tool';
    input.value = 'FICTIONAL-INTERNAL-DETAIL-DO-NOT-EXPORT';
    document.body.append(input);
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export my result' }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe('hamcodes-result-vendor-bank-change.json');
  const downloadedPath = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(downloadedPath);
  const raw = await readFile(downloadedPath, 'utf8');
  const result = JSON.parse(raw);
  expect(result.mode).toEqual({ id: 'training', label: 'Guided training' });
  expect(result.scenarios).toEqual(await page.evaluate(() => sim.score.list()));
  expect(result.totals).toEqual(await page.evaluate(() => sim.score.total()));
  expect(result.timeline.map((entry) => entry.label)).toEqual(await page.locator('.db-tl-label').allTextContents());
  expect(result.scenarios[0].id).toBe('vendor-bank-change');
  expect(result.durationSeconds).toBeGreaterThanOrEqual(0);
  expect(raw).not.toContain('FICTIONAL-INTERNAL-DETAIL');
  expect(Object.keys(result)).toEqual(['schemaVersion', 'product', 'mode', 'seed', 'durationSeconds', 'totals', 'scenarios', 'timeline']);
  await testInfo.attach('Checked fictional download', { path: downloadedPath, contentType: 'application/json' });
  await page.getByRole('button', { name: 'Replay this seed' }).click();
  await page.waitForFunction(() => sim.runner.active?.scenario.id === 'vendor-bank-change');
  expect(await page.evaluate(() => ({ seed: sim.seed, mode: sim.mode }))).toEqual({ seed: result.seed, mode: result.mode.id });
  expect(errors).toEqual([]);
});

test('other drills get the workplace fallback after the existing timeline', async ({ page }) => {
  await startScenario(page, 'after-hours');
  for (const [event, payload] of [['intercom:security', {}], ['deskphone:connected', { number: '4999', genuine: true }], ['usb:handedIn', {}]]) await emit(page, event, payload);
  await expect(page.locator('[data-workplace-scenario="after-hours"]')).toContainText('Agree one action you will practise at work');
  expect(await page.locator('.db-timeline-wrap').evaluate((timeline) => timeline.nextElementSibling.className)).toBe('db-workplace');
});
