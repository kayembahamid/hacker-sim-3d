// Everything that makes this product "Night Shift at Veltrix" rather than
// Netizen. The engine reads this and contains no office logic of its own.
//
// Veltrix Logistics is invented, and so is every person, vendor, bank, domain
// and phone number in it. Phone numbers are in Ofcom's drama ranges and IP
// addresses in the ranges reserved for documentation.
import { pickLookalike } from './sites/lookalikes.js';
const art = (f) => `assets/art/${f}`;
const NOTES = 'https://hamcodes.gitbook.io/hackersnotes';

// Mail headers that pass every check, for genuine internal mail.
const internal = (from) => ({
  returnPath: from,
  spf: { result: 'pass', explain: 'Veltrix’s own mail server sent it, and it is allowed to send for veltrix-logistics.com.' },
  dkim: { result: 'pass', explain: 'Signed by veltrix-logistics.com and not changed on the way.' },
  dmarc: { result: 'pass', explain: 'The From address matches the domain that passed both checks.' },
  received: ['from mail.veltrix-logistics.com (198.51.100.10) by mx.veltrix-logistics.com'],
  messageId: `${from.split('@')[0]}-${Math.abs(from.length * 7919)}@veltrix-logistics.com`
});

export const product = {
  id: 'office',
  storagePrefix: 'hackersnotes3d',
  brand: 'Hacker’s Notes 3D',
  episodeLabel: 'Night Shift at Veltrix',
  kicker: 'Hacker’s Notes · Live exercise',
  title: 'Night Shift at Veltrix',
  lede: 'It is 16:30 on a Thursday and you are covering the late shift in accounts payable. The payment run closes at 19:00. Several people want something from you before then, and some of them are lying.',
  logo: 'logo.png',
  // The sim ships on two sites (hacker.hamcodes.com and labs.hamcodes.com),
  // so "back" goes to whichever one is hosting it.
  home: '/',
  homeLabel: 'Back to ' + ((typeof location !== 'undefined' && /hamcodes\.com$/.test(location.hostname)) ? location.hostname : 'hacker.hamcodes.com'),
  loadingText: 'Switching on the third floor',
  feedTitle: 'Your shift so far',
  debriefKicker: 'Night Shift at Veltrix',
  debriefTitle: 'Your shift, replayed',
  timelineTitle: 'Timeline of the shift',
  newRunLabel: 'New shift',
  startLabel: 'Start with sound',
  fictionNote: 'Veltrix Logistics and every person, vendor, bank and website in it are made up. No page here is a real login, and nothing you do leaves this browser.',
  seedHelp: 'The seed decides which attacks turn up, in what order, which vendor and domain the attacker uses, and what is in the logs. Same seed, same shift.',
  theme: { accent: '#24ff9c' },
  exportResult: true,

  // The office picks a lookalike address for one of its brands with a
  // { fake: '<brand id>' } var; scenario text reads {{name.host}} etc.
  resolveVar(def, { rng }) {
    if (def && typeof def === 'object' && 'fake' in def) {
      const la = pickLookalike(def.fake, rng);
      return la ? { ...la, path: def.path || '/', url: `https://${la.host}${def.path || '/'}` } : { host: def.fake, url: `https://${def.fake}/` };
    }
    return undefined;
  },

  player: {
    name: 'Sam Rivera', initial: 'S', role: 'Accounts Payable · late shift',
    bio: 'Three years in accounts payable. Careful, busy, and tonight the only person on the third floor.'
  },

  clock: { start: 16 * 60 + 30, end: 19 * 60 },

  modeLabel: 'Mode',
  defaultMode: 'training',
  modes: [
    { id: 'training', label: 'Training', desc: 'Markers, hints and rewinds. Learn the moves.' },
    { id: 'assessment', label: 'Assessment', desc: 'No hints, no rewinds. One score at the end.', singleScore: true },
    { id: 'expert', label: 'Expert', desc: 'No hints, more genuine traffic, tighter deadlines.' }
  ],
  noRewindModes: ['assessment'],

  // Six of the eight scenarios, in a seeded order. Between them genuine work
  // arrives: at least a third of everything that reaches Sam is real, so
  // reporting everything costs points.
  run: {
    count: 6,
    ambientPerGap: { training: 2, assessment: 2, expert: 3 },
    ambient: [
      { id: 'dan-reminder', actions: [{ do: 'mail.deliver', mail: {
        genuine: true, from: { name: 'Dan Whitlock', address: 'd.whitlock@veltrix-logistics.com' }, subject: 'Payment run tonight',
        body: ['Sam,', 'Final list for tonight’s run by 18:30 please. Anything over 10k needs my approval in the ERP as usual, and nothing jumps the queue without it.', { sign: 'Dan' }],
        headers: internal('d.whitlock@veltrix-logistics.com'),
        replies: [{ id: 'ok', label: 'Reply: will do', text: 'Will do, list by 18:30.' }]
      } }] },
      { id: 'it-maintenance', actions: [{ do: 'mail.deliver', mail: {
        genuine: true, from: { name: 'IT Service Desk', address: 'servicedesk@veltrix-logistics.com' }, subject: 'Planned VPN maintenance, Saturday 02:00',
        body: ['Hi all,', 'The VPN will be down for maintenance on Saturday from 02:00 to 04:00. You do not need to do anything.', 'We will never ask you for your password or to approve a sign in you did not start.', { sign: 'Priya Raman\nIT Service Desk, x4040' }],
        headers: internal('servicedesk@veltrix-logistics.com')
      } }] },
      { id: 'hr-benefits', actions: [{ do: 'mail.deliver', mail: {
        genuine: true, from: { name: 'Veltrix People Team', address: 'people@veltrix-logistics.com' }, subject: 'Benefits window opens Monday',
        body: ['The benefits window opens on Monday. Make your choices in the HR portal, not by email.', { link: 'https://hr.veltrix-logistics.com/', text: 'hr.veltrix-logistics.com' }, { sign: 'Leila Haddad\nPeople Team' }],
        headers: internal('people@veltrix-logistics.com')
      } }] },
      { id: 'kestrel-change', actions: [
        { do: 'world.push', path: 'office.erp.changes', value: { id: 'KF-2291', vendor: 'kestrel', vendorName: 'Kestrel Freight Ltd', genuine: true, from: 'Vendor portal (signed in as Kestrel Freight)', received: 'Mon 21 Sep', newBank: 'Harbour Bank', sort: '20-41-18', account: '5530 9127', status: 'awaiting second approver', verification: { done: true, by: 'Marta Okafor', number: '0161 496 0548', note: 'Called back on the number in the vendor file. Aisha Kaur confirmed the new account. 21 Sep 15:10.' } } },
        { do: 'mail.deliver', mail: {
          genuine: true, from: { name: 'Veltrix ERP', address: 'erp-noreply@veltrix-logistics.com' }, subject: 'Second approval needed: KF-2291 Kestrel Freight',
          body: ['A bank detail change for Kestrel Freight Ltd is waiting for a second approver.', 'It was submitted through the vendor portal and verified by call back by Marta Okafor on 21 Sep.', { link: 'https://erp.veltrix-logistics.com/changes/KF-2291', text: 'Open KF-2291 in the ERP' }],
          headers: internal('erp-noreply@veltrix-logistics.com')
        } }
      ] },
      { id: 'team-chat', actions: [{ do: 'chat.append', chatId: 'ap-team', message: [{ from: 'tom', fromName: 'Tom Becker', text: 'anyone else find the new expense tool slow?' }, { from: 'leila', fromName: 'Leila Haddad', text: 'only on Thursdays apparently' }] }] },
      { id: 'dan-invite', actions: [{ do: 'world.push', path: 'office.calendar.events', value: { id: 'ev-checkin', title: 'Payment run check in', from: 'Dan Whitlock', address: 'd.whitlock@veltrix-logistics.com', when: 'Today 18:45', where: 'meet.veltrix-logistics.com/finance', link: 'https://meet.veltrix-logistics.com/finance', genuine: true, state: 'new' } }, { do: 'toast', app: 'calendar', title: 'New invitation', body: 'Payment run check in, 18:45, from Dan Whitlock' }] },
      { id: 'marta-share', actions: [{ do: 'mail.deliver', mail: {
        genuine: true, external: false, from: { name: 'Filebridge', address: 'noreply@filebridge.io' }, subject: 'Marta Okafor shared “Q3 accruals.xlsx” with you',
        body: ['Marta Okafor shared a file with you on Filebridge.', { button: 'Open in Filebridge', href: 'https://filebridge.io/v/q3-accruals' }, { small: 'You got this because you are a Veltrix Logistics user on Filebridge.' }],
        headers: { returnPath: 'bounce@mail.filebridge.io', spf: { result: 'pass', explain: 'Filebridge’s mail service is allowed to send for filebridge.io.' }, dkim: { result: 'pass', explain: 'Signed by filebridge.io, unchanged in transit.' }, dmarc: { result: 'pass', explain: 'The From address matches the signed domain.' }, received: ['from mail.filebridge.io (203.0.113.40) by mx.veltrix-logistics.com'], messageId: 'share-q3@mail.filebridge.io' }
      } }] },
      { id: 'priya-call', actions: [{ do: 'deskphone.ring', number: '4040', label: 'IT service desk', known: true, genuine: true, voice: { gender: 'female', tone: 'warm' }, script: [
        { say: 'Hi Sam, it is Priya on the service desk. Just letting you know the printer on three is fixed, the tray was jammed.' },
        { choices: [{ id: 'thanks', label: 'Thanks, Priya' }] },
        { say: 'No problem. Have a quiet shift.', end: true }
      ] }] },
      { id: 'partner-sms', actions: [{ do: 'sms.push', thread: { id: 't-alex', genuine: true, from: { name: 'Alex', number: '+44 7700 900318', known: true, details: ['Saved in your contacts as Alex.'] }, replies: [{ id: 'ok', text: 'will do x', kind: 'normal' }] }, message: { id: 'milk', dir: 'in', text: 'can you get milk on the way home' } }] },
      { id: 'bank-alert', actions: [{ do: 'notify', app: 'bank', appName: 'Harbour Bank', title: 'Card payment', body: '£3.20 at Northside Café. Not you? Open the app.' }] }
    ]
  },

  // Guards that apply in every scenario: reporting genuine work costs points.
  globalGuards: [
    { id: 'gg-mail', overReport: true, when: { event: 'mail:reported', match: { genuine: true } }, outcome: { points: -10, verdict: 'risky', label: 'Reported a genuine email as phishing', what: 'That email was genuine. Every check on it passed. Over reporting buries the real alerts.', ideal: 'checks the sender, the headers and the links, and reports what fails.' } },
    { id: 'gg-sms', overReport: true, when: { event: 'message:reported', match: { genuine: true } }, outcome: { points: -10, verdict: 'risky', label: 'Reported a genuine text', what: 'That text was from someone you know.', ideal: 'reports what fails a check, not everything.' } },
    { id: 'gg-chat', overReport: true, when: { event: 'chat:reported', match: { genuine: true } }, outcome: { points: -10, verdict: 'risky', label: 'Reported a genuine chat message', what: 'That was a colleague, on an internal account.', ideal: 'checks for the external badge and the account before reporting.' } },
    { id: 'gg-invite', overReport: true, when: { event: 'invite:reported', match: { genuine: true } }, outcome: { points: -10, verdict: 'risky', label: 'Reported a genuine meeting invite', what: 'Dan really did invite you, from his real address, to a Veltrix meeting link.', ideal: 'checks the organiser and the link before reporting.' } },
    { id: 'gg-change', overReport: true, when: { event: 'erp:changeRejected', match: { genuine: true } }, outcome: { points: -10, verdict: 'risky', label: 'Rejected a change that had been verified', what: 'KF-2291 came through the vendor portal and Marta had already called Kestrel back on the number in the file. Rejecting it holds up a real supplier’s payment.', ideal: 'reads the verification record and approves when the process was followed.' } },
    { id: 'gg-push', overReport: true, when: { event: 'push:denied', match: { genuine: true } }, outcome: { points: -3, verdict: 'neutral', label: 'Denied your own sign in', what: 'That request was yours: you had just connected to the VPN.', ideal: 'approves the prompts it started, and only those.' } }
  ],

  // Each debrief card links to the matching Hacker's Notes article.
  links: {
    'vendor-bank-change': { label: 'Read the note: Business email compromise', url: `${NOTES}#business-email-compromise` },
    'push-storm': { label: 'Read the note: MFA fatigue and vishing', url: `${NOTES}#mfa-fatigue` },
    'shared-document': { label: 'Read the note: Credential phishing pages', url: `${NOTES}#credential-phishing` },
    'invoice-attachment': { label: 'Read the note: Malicious attachments', url: `${NOTES}#malicious-attachments` },
    'already-happened': { label: 'Read the note: Mailbox rules and persistence', url: `${NOTES}#mailbox-rules` },
    'helpful-assistant': { label: 'Read the note: Prompt injection', url: `${NOTES}#prompt-injection` },
    'ceo-calls': { label: 'Read the note: Deepfake voice fraud', url: `${NOTES}#deepfake-voice` },
    'after-hours': { label: 'Read the note: Tailgating and baiting', url: `${NOTES}#physical-social-engineering` }
  },

  chatAppName: 'Chat',
  authAppName: 'Authenticator',
  searchUrl: 'https://seekly.search/',

  // What the login forms type for Sam when a field is tapped. The sim never
  // takes real typing in a login form.
  persona: { username: 's.rivera', email: 's.rivera@veltrix-logistics.com' },

  phone: {
    pin: '4471',
    pinHint: 'Your PIN: 4471.',
    pinHintKnown: 'Your PIN: 4471.',
    date: 'Thursday 24 September',
    widget: 'Payment run closes 19:00',
    contacts: [
      { id: 'alex', name: 'Alex', number: '+44 7700 900318', note: 'Home' },
      { id: 'dan', name: 'Dan Whitlock', number: '+44 7700 900610', note: 'Finance director' },
      { id: 'helen', name: 'Helen Marsh', number: '+44 7700 900222', note: 'CEO' },
      { id: 'priya', name: 'Priya Raman (IT)', number: '+44 7700 900404', note: 'IT service desk' },
      { id: 'marta', name: 'Marta Okafor', number: '+44 7700 900472', note: 'On leave' }
    ]
  },

  desktop: {
    startLabel: 'Sam Rivera',
    date: 'Thu 24 Sep',
    wallpaperText: 'VELTRIX',
    user: { name: 'Sam Rivera', account: 's.rivera@VLX-PC-4471' }
  },

  // The desk phone: internal extensions always answer with these, unless a
  // scenario has put its own script on a number for the moment.
  deskphone: {
    extension: '4471',
    directory: [
      { number: '4040', name: 'IT service desk', note: 'Priya Raman' },
      { number: '4999', name: 'Security', note: 'Out of hours desk' },
      { number: '4410', name: 'Dan Whitlock', note: 'Finance director' },
      { number: '4001', name: 'Office of the CEO', note: 'Helen Marsh’s office' },
      { number: '4300', name: 'Leila Haddad', note: 'Payroll' },
      { number: '4475', name: 'Tom Becker', note: 'Accounts payable' },
      { number: '4472', name: 'Marta Okafor', note: 'On leave' },
      { number: '4000', name: 'Reception', note: 'Closes at 18:00' }
    ],
    lines: {
      4040: { name: 'IT service desk', genuine: true, voice: { gender: 'female', tone: 'warm' }, script: [
        { say: 'IT service desk, Priya speaking.' },
        { choices: [{ id: 'report', label: 'I want to report something suspicious', goto: 'report' }, { id: 'nothing', label: 'Sorry, wrong number', hangUp: true }] },
        { id: 'report', say: 'Thanks for calling it in. Raise a ticket in the Helpdesk app with what you saw and I will pick it up tonight. And never approve a sign in you did not start.', end: true }
      ] },
      4999: { name: 'Security', genuine: true, voice: { gender: 'male', tone: 'calm' }, script: [
        { say: 'Security desk, Mo speaking.' },
        { choices: [{ id: 'door', label: 'Someone at the lobby door wants to be let in', goto: 'door' }, { id: 'usb', label: 'I found a USB stick in the car park', goto: 'usb' }, { id: 'none', label: 'Just checking the number', hangUp: true }] },
        { id: 'door', say: 'Do not buzz anyone in. I will check the camera and go down myself.', end: true },
        { id: 'usb', say: 'Good call not plugging it in. Drop it at the IT desk in an envelope, or log a ticket and I will collect it.', end: true }
      ] },
      4410: { name: 'Dan Whitlock', genuine: true, voice: { gender: 'male', tone: 'calm' }, script: [
        { say: 'Dan Whitlock.' },
        { choices: [{ id: 'check', label: 'Just checking in about the payment run', goto: 'check' }] },
        { id: 'check', say: 'List by half six please. And nothing over ten thousand goes without my approval in the ERP. Nothing.', end: true }
      ] },
      4001: { name: 'Office of the CEO', genuine: true, voice: { gender: 'female', tone: 'calm' }, script: [
        { say: 'Helen Marsh’s office, Chloe speaking. Helen is travelling today. Can I take a message?' },
        { choices: [{ id: 'msg', label: 'No thanks, it can wait', hangUp: true }] }
      ] },
      4300: { name: 'Leila Haddad', genuine: true, voice: { gender: 'female', tone: 'warm' }, script: [
        { say: 'Payroll, Leila speaking.' },
        { choices: [{ id: 'q', label: 'Just a quick question, I will email', hangUp: true }] }
      ] },
      4475: { name: 'Tom Becker', genuine: true, voice: { gender: 'male', tone: 'warm' }, script: [
        { say: 'Hi, you have reached Tom Becker. I am out of the office until tomorrow. Leave a message after the tone.', end: true }
      ] },
      4472: { name: 'Marta Okafor', genuine: true, voice: { gender: 'female', tone: 'calm' }, script: [
        { say: 'This is Marta. I am on leave until Monday. For anything urgent, call Dan on 4410.', end: true }
      ] },
      4000: { name: 'Reception', genuine: true, voice: { gender: 'female', tone: 'calm' }, script: [
        { say: 'Reception is closed. We are open from eight in the morning until six in the evening.', end: true }
      ] }
    }
  },

  initialWorld(w) {
    w.phone.pinKnown = true;
    w.phone.codes = [{ id: 'vlx', issuer: 'Veltrix Logistics', account: 's.rivera', seed: 'veltrix-sam' }];
    w.phone.bank = { balance: 1842.37, payees: ['Alex', 'Northside Lettings'], history: [
      { at: 'Today 08:12', what: 'Northside Café', amount: -3.2 },
      { at: 'Yesterday', what: 'Salary, Veltrix Logistics', amount: 2310.55 },
      { at: 'Tue', what: 'Northside Lettings', amount: -950 }
    ] };
    w.desktop.account.active = 'veltrix';
    w.desktop.account.services = {
      veltrix: {
        name: 'Veltrix sign in', domain: 'sso.veltrix-logistics.com', user: 's.rivera', twoStep: true, codeSeed: 'veltrix-sam',
        recovery: 's.rivera@veltrix-logistics.com',
        recoveryOptions: [{ label: 'Work email', address: 's.rivera@veltrix-logistics.com', trusted: true }],
        password: { strong: true, note: 'Changed 41 days ago.' },
        methods: [
          { id: 'push', label: 'Authenticator app push, with number matching', on: true },
          { id: 'totp', label: 'Authenticator app code', on: true },
          { id: 'sms', label: 'Text message to 07700 900471', on: false }
        ],
        sessions: [
          { id: 'v1', device: 'VLX-PC-4471, Browser', place: 'Leeds, UK (office)', ip: '198.51.100.10', when: 'Now', current: true },
          { id: 'v2', device: 'Phone, Mail app', place: 'Leeds, UK', ip: '198.51.100.77', when: 'Today 07:58' }
        ],
        signins: [
          { at: 'Today 16:21', place: 'Leeds, UK (office)', ip: '198.51.100.10', result: 'Success', method: 'Push, number matched' },
          { at: 'Today 07:58', place: 'Leeds, UK', ip: '198.51.100.77', result: 'Success', method: 'Remembered device' },
          { at: 'Yesterday 17:40', place: 'Leeds, UK (office)', ip: '198.51.100.10', result: 'Success', method: 'Push, number matched' }
        ],
        mailRules: [
          { id: 'r-news', name: 'Newsletters to Reading folder', when: 'From contains “newsletter”', then: 'Move to Reading', external: false, created: '12 Mar', by: 'You' }
        ],
        oauth: [
          { id: 'o-cal', name: 'Veltrix Calendar Sync', publisher: 'Veltrix IT (verified)', scopes: ['Read your calendar'], added: '2 Feb', verified: true }
        ],
        appPasswords: [
          { id: 'ap-printer', name: 'Scan to email (printer on 3)', created: '4 Jan', lastUsed: 'Today 09:14' }
        ]
      }
    };
    w.desktop.vault = { setup: true, locked: false, entries: [
      { id: 'v-sso', host: 'sso.veltrix-logistics.com', service: 'veltrix', username: 's.rivera', strong: true },
      { id: 'v-erp', host: 'erp.veltrix-logistics.com', service: 'veltrix', username: 's.rivera', strong: true },
      { id: 'v-bank', host: 'business.harbourbank.co.uk', service: 'harbour', username: 'VLX-AP-02', strong: true },
      { id: 'v-share', host: 'filebridge.io', service: 'filebridge', username: 's.rivera@veltrix-logistics.com', strong: true }
    ] };
    w.desktop.files = [
      { id: 'f-runlist', name: 'payment_run_24Sep.xlsx', folder: 'Documents', size: '48 KB', icon: 'sheet', type: 'Spreadsheet', trueType: 'Spreadsheet (.xlsx)', from: 'this computer', signed: null },
      { id: 'f-procedure', name: 'AP callback procedure.pdf', folder: 'Documents', size: '96 KB', icon: 'pdf', type: 'PDF document', trueType: 'PDF document (.pdf)', from: 'intranet.veltrix-logistics.com', signed: 'Veltrix Logistics' }
    ];
    w.phone.chats = [
      {
        id: 'ap-team', name: '#ap-team', group: true, colour: '#1f8f6a', genuine: true, channel: true,
        members: [
          { id: 'tom', name: 'Tom Becker', handle: '@tom.becker', known: true, colour: '#3f7fb5' },
          { id: 'leila', name: 'Leila Haddad', handle: '@leila.h', known: true, colour: '#c46b3a' },
          { id: 'marta', name: 'Marta Okafor', handle: '@marta.o', known: true, colour: '#7c55c9', note: 'On leave' },
          { id: 'me', name: 'Sam Rivera (you)', handle: '@sam.rivera', known: true, colour: '#24c28a' }
        ],
        messages: [
          { from: 'marta', fromName: 'Marta Okafor', text: 'Off from tomorrow. Sam has the run tonight. Callback procedure for any bank changes, no exceptions!', at: 'Wed 17:02' },
          { from: 'tom', fromName: 'Tom Becker', text: 'good luck sam 🫡', at: 'Wed 17:05' }
        ],
        unread: 0
      },
      {
        id: 'dm-dan', name: 'Dan Whitlock', group: false, colour: '#3a4f9a', genuine: true,
        members: [{ id: 'dan', name: 'Dan Whitlock', handle: '@dan.whitlock', known: true, colour: '#3a4f9a' }, { id: 'me', name: 'Sam Rivera (you)', handle: '@sam.rivera', known: true, colour: '#24c28a' }],
        messages: [{ from: 'dan', fromName: 'Dan Whitlock', text: 'Shout if anything odd comes in tonight. I’m on my phone.', at: '16:02' }],
        unread: 0
      }
    ];
    w.office = {
      deskphone: { call: null, log: [], dial: '', lines: {} },
      erp: {
        vendors: [
          { id: 'ferrum', name: 'Ferrum Steel Supply Ltd', vid: 'V-20418', bank: 'Albion Mutual', sort: '30-15-99', account: '•••• 2207', contact: 'Gary Holt', phone: '0114 496 0213', since: '2019' },
          { id: 'kestrel', name: 'Kestrel Freight Ltd', vid: 'V-20077', bank: 'Crestline Bank', sort: '40-11-62', account: '•••• 0419', contact: 'Aisha Kaur', phone: '0161 496 0548', since: '2021' },
          { id: 'northbank', name: 'Northbank Packaging', vid: 'V-20901', bank: 'Harbour Bank', sort: '20-41-18', account: '•••• 7712', contact: 'Owen Price', phone: '020 7946 0871', since: '2022' },
          { id: 'talon', name: 'Talon Tyres', vid: 'V-21140', bank: 'Albion Mutual', sort: '30-15-42', account: '•••• 5530', contact: 'Rhea Doyle', phone: '0113 496 0555', since: '2023' }
        ],
        changes: [],
        payments: [
          { id: 'P-7710', vendor: 'ferrum', vendorName: 'Ferrum Steel Supply Ltd', amount: 48250, due: 'Tonight', status: 'queued' },
          { id: 'P-7711', vendor: 'kestrel', vendorName: 'Kestrel Freight Ltd', amount: 12940, due: 'Tonight', status: 'queued' },
          { id: 'P-7712', vendor: 'northbank', vendorName: 'Northbank Packaging', amount: 3810, due: 'Tonight', status: 'queued' },
          { id: 'P-7713', vendor: 'talon', vendorName: 'Talon Tyres', amount: 7125, due: 'Tonight', status: 'queued' }
        ]
      },
      hr: { changes: [], employees: [
        { id: 'e-tom', name: 'Tom Becker', team: 'Accounts payable', bank: 'Harbour Bank •••• 3318' },
        { id: 'e-marta', name: 'Marta Okafor', team: 'Accounts payable', bank: 'Albion Mutual •••• 9021' },
        { id: 'e-sam', name: 'Sam Rivera', team: 'Accounts payable', bank: 'Harbour Bank •••• 4471' }
      ] },
      helpdesk: { tickets: [{ id: 'INC-5521', title: 'Printer on 3 jams on tray 2', status: 'Resolved', by: 'Sam Rivera', at: 'Tue' }] },
      calendar: { events: [
        { id: 'ev-standup', title: 'AP stand up', from: 'Marta Okafor', address: 'm.okafor@veltrix-logistics.com', when: 'Today 09:15', where: 'Room 3.2', genuine: true, state: 'accepted', past: true }
      ] },
      share: { files: [
        { id: 'sh-master', name: 'Vendor master (read only).xlsx', owner: 'Marta Okafor', link: { type: 'people', label: 'People in Veltrix Logistics with the link' } },
        { id: 'sh-remit', name: 'Remittance advice Q3', owner: 'Sam Rivera', link: { type: 'anyone', label: 'Anyone with the link, no sign in' }, risky: true }
      ] },
      vpn: { connected: false, server: 'vpn.veltrix-logistics.com' },
      endpoint: { alerts: [
        { id: 'al-yday', level: 'medium', at: 'Yesterday 16:48', device: 'VLX-PC-4475 (Tom Becker)', what: 'Browser visited a newly registered domain', status: 'Closed by user' }
      ] },
      git: { repos: [] },
      api: { tokens: [], log: [] },
      ai: { chats: [] },
      agent: { actions: [], log: [], mode: 'ask' },
      inspector: { requests: [] },
      terminal: { history: [] },
      door: { buzzed: false },
      clean: {}
    };
  },

  // Close ups of the objects in the office that are not devices.
  objectCards: {
    sticky: {
      title: 'A sticky note under the keyboard',
      image: art('sticky_marta.png'), imageAlt: 'A yellow sticky note: Marta O., Summer2026!, for the ERP',
      body: ['Marta’s ERP password, in her writing: Summer2026! She is on leave until Monday and left it for “emergencies”.', 'A password written next to the machine it unlocks is not a secret, it is a label. And logging in as someone else breaks the whole point of two approvers.'],
      event: 'sticky:read',
      choices: [
        { id: 'report', label: 'Tell IT so Marta’s password gets reset', primary: true, emit: 'sticky:reported' },
        { id: 'use', label: 'Keep it, it could speed up approvals tonight', emit: 'sticky:kept' }
      ]
    },
    notebook: {
      title: 'Your notebook',
      image: art('notebook_page.png'), imageAlt: 'A notebook page with the IT service desk number x4040, security x4999, and the callback procedure',
      body: ['Numbers you wrote down yourself, from sources you trusted at the time: the IT service desk on 4040, security on 4999.', 'A number you already had is worth more than any number in an email that just arrived.'],
      event: 'notebook:read'
    },
    drawer: {
      title: 'The vendor master file',
      body: [
        'The verified record of every supplier, checked when each account was opened:',
        'Ferrum Steel Supply Ltd · V-20418 · Gary Holt · 0114 496 0213',
        'Kestrel Freight Ltd · V-20077 · Aisha Kaur · 0161 496 0548',
        'Northbank Packaging · V-20901 · Owen Price · 020 7946 0871',
        'Talon Tyres · V-21140 · Rhea Doyle · 0113 496 0555',
        'To call out from the desk phone, dial 9 first.'
      ],
      event: 'drawer:opened'
    },
    usb: {
      title: 'The USB stick from the car park',
      body: ['Black, no brand, a printed label that says PAYROLL Q3. You picked it up by the loading bay this morning and meant to hand it in.', 'A labelled stick in a car park is not litter, it is bait. The label is chosen to make someone curious enough to plug it in.'],
      event: 'usb:examined',
      choices: [
        { id: 'hand', label: 'Hand it to IT without plugging it in', primary: true, emit: 'usb:handedIn' },
        { id: 'plug', label: 'Plug it in to see whose it is', emit: 'usb:plugged' }
      ]
    },
    badge: {
      title: 'Your badge and lanyard',
      image: art('badge.png'), imageAlt: 'Sam Rivera’s Veltrix badge, VL-4471-AP',
      body: ['S. RIVERA, Accounts Payable, VL-4471-AP. It opens the lobby door and the third floor, nothing else.', 'It is also your name, employer and department, worn face out on the train home. Tuck it away when you leave the building.'],
      event: 'badge:checked'
    },
    printer: {
      title: 'The shared printer',
      body: ['The output tray is empty. Priya fixed the jam on Tuesday.'],
      event: 'printer:checked'
    },
    shredder: {
      title: 'The shredder',
      body: ['Cross cut, about a third full.', 'Sensitive paper goes in here, not in the recycling and not face up in a tray overnight.'],
      event: 'shredder:checked'
    },
    whiteboard: {
      title: 'The team whiteboard',
      image: art('whiteboard.png'), imageAlt: 'The whiteboard: guest Wi-Fi password, payment run cut off, Project Kestrel go live, IT desk extension, Marta back Monday, Dan approves over 10k',
      body: ['Guest Wi-Fi and its password, the payment run cut off, a project go live date, the IT extension, who is away and who approves what.', 'None of it feels secret. Together it tells a stranger when you are under pressure, who is away and who to impersonate. It is visible from the lobby camera and the window.'],
      event: 'whiteboard:read',
      choices: [
        { id: 'wipe', label: 'Wipe the Wi-Fi password and the approval notes', primary: true, emit: 'whiteboard:wiped' },
        { id: 'leave', label: 'Leave it, it is only the team’s notes', emit: 'whiteboard:left' }
      ]
    },
    intercom: {
      title: 'The door intercom',
      body: ['A small screen, a camera on the lobby door, and a button that unlocks it.', 'Nobody is there right now.'],
      event: 'intercom:checked'
    }
  },
};
