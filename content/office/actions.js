import { store } from '../../engine/core/store.js';
import { bus } from '../../engine/core/bus.js';
import { registerActions } from '../../engine/scenario/actions.js';
import { DeskPhone } from './deskphone.js';
import { OpsBoard } from './opsBoard.js';
import { recordRequests } from './apps/inspector.js';

// The office's own pieces of the engine: the desk phone and the ops board on
// the second monitor, the HTTP inspector's recorder, and the scenario actions
// only this product needs.
export function installOffice(engine) {
  const { product, sites } = engine;
  if (engine.screens.deskphone) engine.deskphone = new DeskPhone({ screen: engine.screens.deskphone, store, product }).mount();
  if (engine.screens.second) engine.opsBoard = new OpsBoard({ screen: engine.screens.second, store, product }).mount();
  recordRequests(store, sites);
}

// A small seeded generator, so the same seed writes the same logs and two
// seeds write clearly different ones.
function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = [
  ['s.rivera', '10.20.3.71'], ['t.becker', '10.20.3.75'], ['l.haddad', '10.20.3.82'], ['m.okafor', '10.20.3.73'],
  ['d.whitlock', '10.20.3.90'], ['j.patel', '10.20.3.77'], ['r.singh', '10.20.3.84'], ['k.moss', '10.20.3.86']
];
const BENIGN = [
  'https://sso.veltrix-logistics.com/', 'https://intranet.veltrix-logistics.com/news', 'https://erp.veltrix-logistics.com/ap/queue',
  'https://mail.veltrix-logistics.com/inbox', 'https://filebridge.io/v/q3-accruals', 'https://business.harbourbank.co.uk/payments',
  'https://freightledger.news/rates', 'https://seekly.search/?q=port+delays', 'https://static.filebridge.io/app.js',
  'https://servicedesk.veltrix-logistics.com/tickets', 'https://hr.veltrix-logistics.com/benefits', 'https://kestrelfreight.co.uk/tracking'
];

const pad = (n) => String(n).padStart(2, '0');
const time = (sec) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;

// The logs for "Something already happened": yesterday's proxy log with the
// phishing domain in it, and the sign in log with the attacker using a stolen
// session to add a hidden rule to Sam's mailbox.
export function buildDataset({ badHost, forwardTo, attackerIp, attackerPlace = 'Rotterdam, NL', victims = [] }, seed) {
  const rnd = seeded(`${seed}|${badHost}`);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const lines = [];
  // A working day of ordinary browsing, 08:30 to 17:30.
  for (let i = 0; i < 150; i++) {
    const [user, ip] = pick(USERS);
    const sec = 8 * 3600 + 1800 + Math.floor(rnd() * 9 * 3600);
    lines.push({ sec, text: `2026-09-23 ${time(sec)} ${ip} ${user} GET ${pick(BENIGN)} 200 ${1000 + Math.floor(rnd() * 90000)}` });
  }
  // Who fell for it, and who only looked.
  const clicked = [['t.becker', '10.20.3.75', 16 * 3600 + 47 * 60 + 3, true], ['s.rivera', '10.20.3.71', 16 * 3600 + 51 * 60 + 40, true], ...victims.map((v, i) => [v, (USERS.find((u) => u[0] === v) || ['', '10.20.3.99'])[1], 16 * 3600 + (53 + i * 7) * 60 + Math.floor(rnd() * 50), false])];
  for (const [user, ip, sec, posted] of clicked) {
    lines.push({ sec, text: `2026-09-23 ${time(sec)} ${ip} ${user} GET https://${badHost}/login 200 18231` });
    if (posted) {
      lines.push({ sec: sec + 31, text: `2026-09-23 ${time(sec + 31)} ${ip} ${user} POST https://${badHost}/login 302 412` });
      lines.push({ sec: sec + 32, text: `2026-09-23 ${time(sec + 32)} ${ip} ${user} GET https://sso.veltrix-logistics.com/ 200 9120` });
    }
  }
  lines.sort((a, b) => a.sec - b.sec);

  const auth = [
    `2026-09-23 08:41:02 sso user=s.rivera result=success ip=10.20.3.71 geo=Leeds,GB method=push(number-matched) app=Browser`,
    `2026-09-23 09:02:15 sso user=t.becker result=success ip=10.20.3.75 geo=Leeds,GB method=push(number-matched) app=Browser`,
    `2026-09-23 16:47:36 sso user=t.becker result=success ip=${attackerIp} geo=${attackerPlace.replace(', ', ',')} method=session-token app=Mail`,
    `2026-09-23 16:48:10 mail user=t.becker action=search query="invoice OR remittance" ip=${attackerIp}`,
    `2026-09-23 16:52:14 sso user=s.rivera result=success ip=${attackerIp} geo=${attackerPlace.replace(', ', ',')} method=session-token app=Mail`,
    `2026-09-23 16:53:02 mail user=s.rivera action=new-inbox-rule name="." forward=${forwardTo} ip=${attackerIp}`,
    `2026-09-23 17:31:40 sso user=t.becker result=success ip=${attackerIp} geo=${attackerPlace.replace(', ', ',')} method=session-token app=Mail`,
    `2026-09-24 08:39:51 sso user=s.rivera result=success ip=10.20.3.71 geo=Leeds,GB method=push(number-matched) app=Browser`,
    `2026-09-24 16:21:09 sso user=s.rivera result=success ip=10.20.3.71 geo=Leeds,GB method=push(number-matched) app=Browser`
  ];

  const created = (days) => `2026-09-${pad(24 - days)}T${pad(Math.floor(rnd() * 23))}:${pad(Math.floor(rnd() * 59))}:00Z`;
  const net = {
    [badHost]: { a: `203.0.113.${20 + Math.floor(rnd() * 200)}`, created: created(3), registrar: 'QuickNames LLC', org: 'REDACTED FOR PRIVACY', country: 'REDACTED', ns: ['ns1.fastparking-dns.net'], cert: { cn: badHost, issuer: 'QuickCert Free SSL', from: 'Sep 21 2026', to: 'Dec 20 2026' }, http: { status: 200, server: 'nginx' } },
    'veltrix-logistics.com': { a: '198.51.100.10', mx: 'mx.veltrix-logistics.com', created: '2009-03-12T10:04:11Z', registrar: 'Albion Registrars Ltd', org: 'Veltrix Logistics Ltd', country: 'GB', ns: ['ns1.veltrix-logistics.com', 'ns2.veltrix-logistics.com'], cert: { cn: '*.veltrix-logistics.com', o: 'Veltrix Logistics Ltd', issuer: 'Northlight Trust Organisation CA', from: 'Mar 2 2026', to: 'Mar 3 2027' }, http: { status: 200, server: 'veltrix-edge' } },
    'sso.veltrix-logistics.com': { a: '198.51.100.10', created: '2009-03-12T10:04:11Z', registrar: 'Albion Registrars Ltd', org: 'Veltrix Logistics Ltd', country: 'GB', cert: { cn: '*.veltrix-logistics.com', o: 'Veltrix Logistics Ltd', issuer: 'Northlight Trust Organisation CA', from: 'Mar 2 2026', to: 'Mar 3 2027' }, http: { status: 200, server: 'veltrix-edge' } }
  };
  const fwdDomain = forwardTo.split('@')[1];
  if (fwdDomain) net[fwdDomain] = { a: `203.0.113.${20 + Math.floor(rnd() * 200)}`, created: created(5), registrar: 'QuickNames LLC', org: 'REDACTED FOR PRIVACY', country: 'REDACTED', mx: `mx.${fwdDomain}` };

  return {
    files: {
      '/home/s.rivera/README.txt': ['Proxy log for yesterday: /var/log/proxy.log', 'Sign in and mailbox audit log: /var/log/auth.log', 'Format: date time ip user method url status bytes'],
      '/var/log/proxy.log': lines.map((l) => l.text),
      '/var/log/auth.log': auth,
      '/etc/hostname': ['VLX-PC-4471']
    },
    net
  };
}

registerActions({
  // Register a fake of a brand at a run specific lookalike host, so the
  // browser shows the decoy there (and only there).
  'site.fake': (a, ctx) => ctx.sites.registerFake && ctx.sites.registerFake(a.brand, a.host, a.trick || 'extra-word', a.extra || {}),

  // A page the scenario writes itself, as data, at a host for this run.
  'site.page': (a, ctx) => ctx.sites.page && ctx.sites.page(a),

  // Point a real host at a brand template, or override its fields.
  'site.alias': (a, ctx) => ctx.sites.alias && ctx.sites.alias(a.host, a.siteId, a.extra || {}),

  // Ring the desk phone with a script (see content/office/deskphone.js).
  'deskphone.ring': (a, ctx) => ctx.engine && ctx.engine.deskphone && ctx.engine.deskphone.ring(a),

  // Put a script on a desk phone number for the moment: who answers when Sam
  // dials it.
  'deskphone.line': (a, ctx) => ctx.store.update((s) => { s.office.deskphone.lines[String(a.number).replace(/[^0-9]/g, '')] = JSON.parse(JSON.stringify(a.line)); }, 'dp-line'),

  // The terminal's logs and DNS records for this run.
  'terminal.dataset': (a, ctx) => ctx.store.update((s) => {
    const data = buildDataset(a, s.seed || 'seed');
    const t = s.office.terminal;
    t.files = { ...(t.files || {}), ...data.files };
    t.net = { ...(t.net || {}), ...data.net };
    if (a.suggest) t.suggest = a.suggest;
  }, 'terminal-data'),

  // A DNS, registration and certificate record for one host, for dig, whois,
  // curl and openssl.
  'terminal.host': (a, ctx) => ctx.store.update((s) => {
    const t = s.office.terminal;
    t.net = { ...(t.net || {}), [a.host]: a.record };
  }, 'terminal-host'),

  // One file for the terminal (a path can hold dots, so world.set cannot).
  'terminal.file': (a, ctx) => ctx.store.update((s) => {
    const t = s.office.terminal;
    t.files = { ...(t.files || {}), [a.path]: [].concat(a.lines || []) };
    if (a.suggest) t.suggest = a.suggest;
  }, 'terminal-file'),

  // Ransomware at work: the next few files in a folder get encrypted and
  // renamed. The scenario decides the pace (after + if on a flag).
  'files.encrypt': (a, ctx) => {
    let done = 0; let total = 0;
    ctx.store.update((s) => {
      const list = s.desktop.files.filter((f) => f.folder === a.folder && !f.deleted && !f.note_ransom);
      total = list.length;
      let n = a.count || 2;
      for (const f of list) {
        if (f.encrypted) { done++; continue; }
        if (n-- <= 0) continue;
        f.encrypted = true; f.name = `${f.name}${a.ext || '.locked'}`; f.icon = 'text'; f.type = 'Encrypted file'; f.trueType = 'Encrypted by ransomware, unreadable'; f.opens = null;
        done++;
      }
    }, 'files-encrypt');
    bus.emit('ransom:progress', { folder: a.folder, encrypted: done, total, all: done >= total });
  },

  // Tick an item off a clean desk: office.clean.<id> = true.
  'office.flag': (a, ctx) => ctx.store.update((s) => { s.office.clean[a.id] = a.value ?? true; }, 'office-flag')
});

// Plain language lines for the debrief timeline, for office events.
export const officeTrace = {
  'deskphone:dialed': (p) => `Dialled ${p.external ? 'an outside line' : 'extension'} ${p.number} on the desk phone`,
  'deskphone:answered': (p) => `Answered the desk phone: ${p.label || p.number}`,
  'terminal:command': (p) => `Ran in the terminal: ${p.command}`,
  'erp:changeViewed': (p) => `Opened bank change request ${p.id}`,
  'erp:vendorViewed': (p) => `Checked the vendor record for ${p.id}`,
  'inspector:viewed': (p) => `Looked at the requests made by ${p.host}`,
  'agent:viewed': () => 'Opened the agent console',
  'doc:hiddenShown': () => 'Showed the hidden text in a document',
  'signins:viewed': () => 'Read the sign in activity',
  'mailrule:removed': (p) => (p.malicious ? 'Deleted a hidden forwarding rule' : 'Deleted a mailbox rule'),
  'ticket:raised': (p) => `Raised helpdesk ticket ${p.id}`,
  'drawer:opened': () => 'Took out the vendor master file',
  'notebook:read': () => 'Checked the numbers in the notebook',
  'vpn:connected': () => 'Connected to the VPN',
  'endpoint:viewed': () => 'Opened endpoint security',
  'bank:transactionChecked': (p) => `Checked a bank transaction: ${p.what}`,
  'desktop:locked': () => 'Locked the computer',
  'desktop:shutdown': () => 'Shut the computer down',
  'network:disconnected': (p) => (p.how === 'cable' ? 'Unplugged the network cable' : p.how === 'wifi' ? 'Turned Wi-Fi off' : 'Took the computer off every network'),
  'wifi:joined': (p) => `Joined a Wi-Fi network${p.open ? ' with no password' : ''}`,
  'qr:scanned': (p) => `Scanned a QR code that opens ${p.url}`,
  'qr:opened': (p) => `Opened the QR code link: ${p.url}`,
  'recovery:removed': () => 'Removed a recovery option',
  'recovery:viewed': () => 'Read the account recovery options',
  'case:action': (p) => `Decided a request in the work queue (${p.action})`,
  'doc:macroKept': () => 'Kept the macros switched off'
};
