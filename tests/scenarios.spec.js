import { test, expect } from '@playwright/test';
import { startScenario, emit, stage, score, labels } from './helpers.js';

// Each scenario is driven through its key decisions (the same engine events the
// UI raises). The safe path reaches the debrief with a good score; the unsafe
// path shows its consequence and a rewind.

const SAFE = {
  'vendor-bank-change': [['drawer:opened', {}], ['erp:vendorViewed', { id: 'ferrum' }], ['headers:viewed', { genuine: false }], ['deskphone:connected', { verifies: 'ferrum', genuine: true }], ['erp:changeRejected', { id: 'FS-4471', genuine: false, verified: true }]],
  'push-storm': [['push:denied', { id: 'ps-1' }], ['push:denied', { id: 'ps-2' }], ['deskphone:choice', { choice: 'check' }], ['deskphone:connected', { number: '4040', genuine: true }], ['password:changed', { service: 'veltrix' }]],
  'shared-document': [['domain:checked', { device: 'desktop' }], ['cert:viewed', { device: 'desktop' }], ['vault:refused', { device: 'desktop' }], ['inspector:viewed', { offsite: true }], ['mail:reported', { genuine: false }]],
  'invoice-attachment': [['headers:viewed', { genuine: false }], ['file:properties', { danger: true }], ['file:scanned', { danger: true }], ['file:deleted', { danger: true }], ['mail:reported', { genuine: false }]],
  'already-happened': [['terminal:command', { cmd: 'grep', hits: 2 }], ['signins:viewed', {}], ['mailrule:viewed', { malicious: true }], ['mailrule:removed', { malicious: true }], ['ticket:raised', { category: 'account' }]],
  'helpful-assistant': [['doc:hiddenShown', { hasHidden: true }], ['assistant:asked', { id: 'sum-contract' }], ['agent:viewed', { dangerous: true }], ['agent:blocked', { dangerous: true }], ['ticket:raised', { category: 'data' }]],
  'ceo-calls': [['call:choice', { choice: 'process' }], ['deskphone:connected', { verifies: 'ceo', number: '4001', genuine: true }], ['erp:paymentHeld', { id: 'P-URGENT', genuine: false }], ['ticket:raised', { category: 'call' }]],
  'after-hours': [['intercom:security', {}], ['deskphone:connected', { number: '4999', genuine: true }], ['usb:handedIn', {}]]
};

const UNSAFE = {
  'vendor-bank-change': { events: [['erp:changeApproved', { id: 'FS-4471', genuine: false }]], title: 'The money is gone', back: 'decide' },
  'push-storm': { events: [['push:approved', { genuine: false }]], title: 'You let them in', back: 'storm' },
  'shared-document': { events: [['form:submitted', { site: 'vlx-sso-fake' }]], title: 'Straight to the attacker', back: 'decide' },
  'invoice-attachment': { events: [['file:opened', { danger: true }]], title: 'It was not an invoice', back: 'decide' },
  'helpful-assistant': { events: [['assistant:asked', { id: 'sum-contract' }], ['agent:approved', { dangerous: true }]], title: 'The mailbox walked out', back: 'decide' },
  'ceo-calls': { events: [['erp:paymentReleased', { id: 'P-URGENT', bypass: true, genuine: false }]], title: 'The voice was not the CEO', back: 'decide' },
  'after-hours': { events: [['intercom:buzzed', {}]], title: 'A stranger on the floor', back: 'door' }
};

for (const [id, events] of Object.entries(SAFE)) {
  test(`${id}: the safe path reaches the debrief with a good score`, async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await startScenario(page, id);
    for (const [t, p] of events) await emit(page, t, p);
    await page.waitForTimeout(400);
    expect(await stage(page)).toBe('done');
    const s = await score(page);
    expect(s.points).toBeGreaterThan(0);
    expect(s.stars).toBeGreaterThanOrEqual(2);
    expect(errs).toEqual([]);
  });
}

for (const [id, { events, title, back }] of Object.entries(UNSAFE)) {
  test(`${id}: the unsafe path shows its consequence and rewinds`, async ({ page }) => {
    await startScenario(page, id);
    for (const [t, p] of events.slice(0, -1)) await emit(page, t, p);
    const [lt, lp] = events[events.length - 1];
    await page.evaluate(([t, p]) => sim.bus.emit(t, p), [lt, lp]);
    await expect(page.locator('.ov-title')).toHaveText(title);
    await page.click('.ov-buttons [data-choice="rewind"]');
    await page.waitForTimeout(400);
    expect(await stage(page)).toBe(back);
  });
}
