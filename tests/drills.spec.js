import { test, expect } from '@playwright/test';
import { startScenario, stage, score, clearCards, wait } from './helpers.js';

// The Labs drills (content/office/scenarios/1xx..4xx), each played on its own
// the way the catalogue opens it (?scenario=id), on training difficulty.
// Every drill is driven through its careful path to the debrief with three
// stars, and through its worst decision to the consequence card and a rewind.
//
// A step is [event, payload], ['@choice', id] to answer a choice card, or
// ['@eval', code]. A payload string starting with $ is read from the run's
// resolved vars, so a seeded lookalike host is matched exactly.
async function step(page, [t, p], { clear = true } = {}) {
  if (t === '@choice') {
    await page.waitForSelector(`.overlay:not([hidden]) [data-choice="${p}"]`);
    await page.click(`.overlay:not([hidden]) [data-choice="${p}"]`);
    await wait(page, 400);
  } else if (t === '@eval') {
    await page.evaluate(p);
    await wait(page, 250);
  } else {
    await page.evaluate(([type, payload]) => {
      const vars = (sim.runner.active && sim.runner.active.vars) || {};
      const look = (path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), vars);
      const out = {};
      for (const [k, v] of Object.entries(payload || {})) out[k] = typeof v === 'string' && v.startsWith('$') ? look(v.slice(1)) : v;
      sim.bus.emit(type, out);
    }, [t, p]);
    await wait(page, 250);
  }
  if (clear) await clearCards(page);
}

export const DRILLS = {
  'gift-card-request': {
    safe: [['sender:checked', { id: 'gc-mail', genuine: false }], ['headers:viewed', { id: 'gc-mail', genuine: false }], ['deskphone:connected', { verifies: 'dan', number: '4410', genuine: true }], ['mail:reported', { id: 'gc-mail', genuine: false }]],
    unsafe: { steps: [['mail:replied', { id: 'gc-mail', kind: 'comply' }]], title: 'The codes were spent in minutes', back: 'decide' }
  },
  'reply-chain-phishing': {
    safe: [['call:choice', { choice: 'check' }], ['call:finished', {}], ['sender:checked', { id: 'rc-mail', genuine: false }], ['domain:checked', { host: '$dv.host', device: 'desktop' }], ['deskphone:connected', { verifies: 'northbank', genuine: true }], ['mail:reported', { id: 'rc-mail', genuine: false }]],
    unsafe: { steps: [['call:finished', {}], ['form:submitted', { site: 'docuvane-fake' }]], title: 'The call did its job', back: 'email' }
  },
  'spear-phishing': {
    safe: [['sender:checked', { id: 'sp-mail' }], ['page:shown', { page: 'sam-profile' }], ['profile:trimmed', {}], ['deskphone:connected', { verifies: 'it' }], ['mail:reported', { id: 'sp-mail', genuine: false }]],
    unsafe: { steps: [['form:submitted', { site: 'lb-activate' }]], title: 'It only knew what you posted', back: 'decide' }
  },
  'callback-phishing': {
    safe: [['sender:checked', { id: 'cb-mail' }], ['headers:viewed', { id: 'cb-mail' }], ['page:shown', { page: 'sh-help' }], ['deskphone:connected', { verifies: 'spendhawk' }], ['mail:reported', { id: 'cb-mail', genuine: false }]],
    unsafe: { steps: [['deskphone:choice', { choice: 'install' }]], title: 'The number was the link', back: 'decide' }
  },
  'qr-phishing': {
    safe: [['sender:checked', { id: 'qr-mail' }], ['headers:viewed', { id: 'qr-mail' }], ['qr:closed', { id: 'qr-it' }], ['deskphone:connected', { verifies: 'it' }], ['mail:reported', { id: 'qr-mail', genuine: false }]],
    unsafe: { steps: [['form:submitted', { site: 'qr-fake', device: 'phone' }]], title: 'A link in disguise', back: 'decide' }
  },
  'smishing-package': {
    safe: [['sender:checked', { threadId: 't-dropwell' }], ['link:hovered', { source: 'sms:t-dropwell' }], ['page:shown', { page: 'dw-track' }], ['message:reported', { threadId: 't-dropwell', genuine: false }]],
    unsafe: { steps: [['form:submitted', { site: 'dw-pay' }]], titleRe: 'for your card details', back: 'decide' }
  },
  'chat-impersonation': {
    safe: [['sender:checked', { threadId: 't-helen-new' }], ['chat:replied', { chatId: 'dm-helen', replyId: 'ask' }], ['message:reported', { threadId: 't-helen-new', genuine: false }]],
    unsafe: { steps: [['message:replied', { threadId: 't-helen-new', replyId: 'send', kind: 'comply' }]], title: 'It was never Helen', back: 'decide' }
  },
  'whaling-deepfake': {
    safe: [['video:choice', { choice: 'test' }], ['video:choice', { choice: 'process2' }], ['deskphone:connected', { verifies: 'ceo' }], ['erp:paymentHeld', { id: 'P-ESCROW', genuine: false }], ['ticket:raised', { category: 'call' }]],
    unsafe: { steps: [['erp:paymentReleased', { id: 'P-ESCROW', genuine: false }]], title: 'The face was generated', back: 'decide' }
  },
  'ransomware-first-ten-minutes': {
    safe: [['endpoint:alertOpened', { id: 'al-rw' }], ['file:selected', { id: 'rw-1', name: 'Q3 accruals.xlsx.vlxlock' }], ['network:disconnected', { how: 'cable', offline: true }], ['deskphone:connected', { verifies: 'it' }], ['ticket:raised', { category: 'device' }]],
    unsafe: { steps: [['desktop:shutdown', {}]], title: 'Stopped, but the evidence went with it', back: 'contain' }
  },
  'malicious-attachment': {
    safe: [['sender:checked', { id: 'tt-mail' }], ['file:properties', { id: 'd-ttinv' }], ['doc:macroKept', { id: 'd-ttinv' }], ['deskphone:connected', { verifies: 'talon' }], ['file:deleted', { id: 'd-ttinv' }], ['mail:reported', { id: 'tt-mail', genuine: false }]],
    unsafe: { steps: [['doc:macroEnabled', { id: 'd-ttinv' }]], title: 'One yellow button', back: 'decide' }
  },
  'tech-support-scam': {
    safe: [['domain:checked', { host: '$host' }], ['deskphone:connected', { verifies: 'it' }], ['app:closed', { device: 'desktop', app: 'browser' }], ['ticket:raised', { category: 'other' }]],
    unsafe: { steps: [['deskphone:choice', { choice: 'comply' }]], title: 'The warning was the attack', back: 'decide' }
  },
  'account-recovery': {
    safe: [['signins:viewed', {}], ['recovery:viewed', {}], ['call:choice', { choice: 'refuse' }], ['recovery:removed', { id: 'rc-mail', stale: true }], ['recovery:removed', { id: 'rc-phone', stale: true }], ['recovery:removed', { id: 'rc-q', stale: true }], ['password:changed', { service: 'veltrix' }], ['ticket:raised', { category: 'account' }]],
    unsafe: { steps: [['call:choice', { choice: 'give' }]], title: 'The code was the key', back: 'decide' }
  },
  'password-reuse': {
    safe: [['signins:viewed', {}], ['mail:opened', { id: 'pw-breach', genuine: true }], ['@choice', 'all'], ['vault:strengthened', { host: 'kettlewren.shop' }], ['vault:strengthened', { host: 'spendhawk.app' }], ['vault:strengthened', { host: 'freightledger.news' }], ['ticket:raised', { category: 'account' }], ['method:changed', { id: 'passkey', on: true }]],
    unsafe: { steps: [['mail:opened', { id: 'pw-breach', genuine: true }], ['@choice', 'only']], title: 'The leak was already being tried', back: 'decide' }
  },
  'tailgating-side-door': {
    safe: [['tailgate:refused', {}], ['@choice', 'firm'], ['deskphone:connected', { verifies: 'security', number: '4999' }]],
    unsafe: { steps: [['tailgate:held', {}]], title: 'A stranger on the finance floor', back: 'door' }
  },
  'unlocked-workstation': {
    safe: [['deskphone:ended', { number: '4410' }], ['@eval', 'sim.desktopOS.lock()'], ['desk:left', {}]],
    unsafe: { steps: [['deskphone:ended', { number: '4410' }], ['desk:left', {}]], title: 'Five minutes, one open screen', back: 'leave' }
  },
  'public-wifi-hygiene': {
    safe: [['wifi:inspected', { id: 'twin', evil: true }], ['wifi:joined', { id: 'cafe', evil: false, open: false }], ['vpn:connected', {}], ['@choice', 'cover']],
    unsafe: { steps: [['form:submitted', { site: 'wf-portal' }]], title: 'The hotspot was the trap', back: 'connect' }
  },
  'https-safety': {
    safe: [['cert:viewed', { host: '$fake.host' }], ['domain:checked', { host: '$fake.host' }], ['vault:refused', { host: '$fake.host' }], ['site:visited', { host: 'business.harbourbank.co.uk' }], ['form:submitted', { site: 'harbour-biz' }]],
    unsafe: { steps: [['form:submitted', { site: 'harbour-biz-fake' }]], title: 'Private, not honest', back: 'decide' }
  },
  'report-fast': {
    safe: [['deskphone:connected', { verifies: 'it' }], ['mail:reported', { id: 'rf-mail', genuine: false }]],
    unsafe: { steps: [['form:submitted', { site: 'filebridge-fake' }]], title: 'Now the clock matters even more', back: 'decide' }
  },
  'open-bucket-incident': {
    safe: [['terminal:command', { command: 'grep customer_export /var/log/filebridge-audit.log', cmd: 'grep', hits: 6 }], ['site:visited', { host: 'seekly.search', url: 'https://seekly.search/?q=veltrix%20customer' }], ['mail:replied', { id: 'ob-mail', kind: 'thanks' }], ['deskphone:connected', { verifies: 'dpo' }], ['share:linkChanged', { id: 'sh-export', to: 'off' }], ['ticket:raised', { category: 'data' }]]
  },
  'payroll-diversion-incident': {
    safe: [['sender:checked', { id: 'pd-mail' }], ['headers:viewed', { id: 'pd-mail' }], ['hr:changeViewed', { id: 'HR-3317' }], ['deskphone:connected', { verifies: 'jordan' }], ['hr:changeRejected', { id: 'HR-3317', genuine: false }], ['ticket:raised', { category: 'payment' }]],
    unsafe: { steps: [['hr:changeApproved', { id: 'HR-3317', genuine: false }]], title: 'Friday’s salary, gone', titleRe: 'salary, gone', back: 'decide' }
  },
  'supply-chain-incident': {
    safe: [['endpoint:alertOpened', { id: 'al-kf' }], ['deskphone:connected', { verifies: 'kestrel' }], ['oauth:declined', {}], ['erp:paymentHeld', { id: 'P-7711', genuine: true }], ['oauth:revoked', { id: 'o-kestrel' }], ['ticket:raised', { category: 'data' }]],
    unsafe: { steps: [['oauth:consented', { app: 'Kestrel Portal Sync' }]], title: 'Let in through the supplier', back: 'decide' }
  }
};

for (const [id, { safe }] of Object.entries(DRILLS)) {
  test(`${id}: the careful path reaches the debrief with three stars`, async ({ page }) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await startScenario(page, id);
    for (const s of safe) await step(page, s);
    await page.waitForTimeout(500);
    await clearCards(page);
    expect(await stage(page)).toBe('done');
    const s = await score(page);
    expect(s.stars).toBe(3);
    expect(errs).toEqual([]);
  });
}

for (const [id, { unsafe }] of Object.entries(DRILLS)) {
  if (!unsafe) continue;
  test(`${id}: the worst decision shows its consequence and rewinds`, async ({ page }) => {
    await startScenario(page, id);
    const steps = unsafe.steps;
    for (const s of steps.slice(0, -1)) await step(page, s);
    await step(page, steps[steps.length - 1], { clear: false });
    if (unsafe.titleRe) await expect(page.locator('.ov-title')).toContainText(unsafe.titleRe);
    else await expect(page.locator('.ov-title')).toHaveText(unsafe.title);
    await page.click('.ov-buttons [data-choice="rewind"]');
    await page.waitForTimeout(400);
    expect(await stage(page)).toBe(unsafe.back);
  });
}
