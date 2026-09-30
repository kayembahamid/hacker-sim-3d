import { el } from '../../../engine/core/dom.js';
import { icon } from '../../../engine/ui/icons.js';

// Page templates for the fictional websites in the training sim, one per kind
// of site.
//
// SAFETY: nothing here is a working login. The `ctx.form` helper is the
// engine's tap to type form: tapping a field fills in a fixed placeholder,
// and "submit" only raises a `form:submitted` event for the scenario to
// score. No text is read, nothing is sent anywhere, and none of these pages
// is reachable outside the sim. The `fake` versions are training decoys drawn
// with the small tells real phishing has (a stale copyright, a made up
// urgency line) so the player learns to read the address bar, which is the
// one thing the browser chrome shows truthfully and the page cannot fake.
const foot = (fake) => (fake ? '2024' : '2026');

export function frame(brand, fake, body, { nav = [], wide = false } = {}) {
  return el('div', { class: `site site-ox site-${brand.kind} ${fake ? 'is-fake' : ''}`, style: { '--b': brand.colour, '--a': brand.accent } }, [
    el('header', { class: 'sx-head' }, [
      el('span', { class: 'sx-logo' }, [el('span', { class: 'sx-mark', text: brand.name[0] }), el('b', { text: brand.name })]),
      nav.length ? el('nav', { class: 'sx-nav' }, nav.map((n) => el('span', { text: n }))) : null
    ].filter(Boolean)),
    el('main', { class: `sx-main ${wide ? 'is-wide' : ''}` }, body),
    el('footer', { class: 'sx-foot' }, [
      el('span', { text: `© ${foot(fake)} ${brand.owner}` }),
      el('span', { text: fake ? 'Privacy · Terms · Cookies' : `Registered in England · ${brand.domain}` })
    ])
  ]);
}

// The engine's non-functional form. It sends nothing; submit raises an event.
function signInForm(ctx, brand, fake, { title, fields, submit, small, id }) {
  return ctx.form({
    id: id || `${brand.id}-signin${fake ? '-decoy' : ''}`, site: fake ? `${brand.id}-fake` : brand.id, title,
    fields, submitLabel: submit || 'Sign in', small,
    submitStyle: { background: brand.accent, color: '#08110d' }
  });
}

const WORK_FIELDS = [{ name: 'username', label: 'Work email' }, { name: 'password', label: 'Password', type: 'password' }];

const KINDS = {
  sso(ctx, brand, fake) {
    if (!fake && ctx.url.pathname.startsWith('/oauth/consent')) return consent(ctx, brand);
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-signin' }, [
        el('h1', { text: 'Sign in to Veltrix' }),
        el('p', { class: 'sx-muted', text: fake ? 'Your session has expired. Sign in again to view the shared document.' : 'Use your Veltrix work account. Your authenticator will confirm it is you.' }),
        signInForm(ctx, brand, fake, { title: '', fields: WORK_FIELDS, small: fake ? 'Keep me signed in' : 'Only ever sign in on sso.veltrix-logistics.com. Check the address above.' }),
        fake ? null : el('p', { class: 'sx-small' }, [icon('shield'), ' Number matching is on for every sign in.'])
      ].filter(Boolean))
    ]);
  },

  intranet(ctx, brand, fake) {
    return frame(brand, fake, [
      el('h1', { text: 'Good afternoon, Sam' }),
      el('div', { class: 'sx-grid' }, [
        card('AP call back procedure', 'Any request to change where money goes is verified by calling the supplier on the number in the vendor master file, never the number in the request. Two people approve.'),
        card('Report phishing', 'Use Report phishing in Mail, or raise a Helpdesk ticket. Out of hours: security on 4999.'),
        card('Project Kestrel', 'The new carrier portal goes live Friday. Expect genuine emails from the Kestrel team this week.')
      ])
    ], { nav: ['News', 'People', 'Policies', 'IT'] });
  },

  portal(ctx, brand, fake) {
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-signin' }, [
        el('h1', { text: brand.name }),
        el('p', { class: 'sx-muted', text: fake ? 'Action required: confirm your details to avoid interruption to your pay.' : (brand.blurb || '') }),
        fake ? signInForm(ctx, brand, fake, { title: 'Confirm your account', fields: WORK_FIELDS, submit: 'Confirm' })
          : el('button', { class: 'sx-btn', type: 'button', onclick: () => ctx.navigate('https://sso.veltrix-logistics.com/') }, ['Sign in with Veltrix'])
      ])
    ]);
  },

  meet(ctx, brand, fake) {
    const room = ctx.url.pathname.replace(/^\//, '') || 'finance';
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-signin' }, [
        el('h1', { text: fake ? 'Your meeting app needs an update' : `Join “${room}”` }),
        el('p', { class: 'sx-muted', text: fake ? 'To join, install the latest Veltrix Meet plugin.' : 'Veltrix Meet opens in the Meet app on your computer.' }),
        fake ? el('button', { class: 'sx-btn', type: 'button', onclick: () => ctx.download({ id: 'dl-meet', name: 'VeltrixMeet_Update.exe', size: '2.4 MB', icon: 'file', type: 'Application', trueType: 'Application (.exe), a program that runs when opened', danger: true, motw: true, signed: null }) }, ['Download update'])
          : el('button', { class: 'sx-btn', type: 'button', onclick: () => ctx.emit('meet:handoff', { room }) }, ['Open in Meet'])
      ])
    ]);
  },

  vendor(ctx, brand, fake) {
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-signin' }, [
        el('h1', { text: fake ? 'Update your remittance details' : 'Supplier portal' }),
        el('p', { class: 'sx-muted', text: fake ? 'Following a change of banking provider, suppliers must re-enter payment details before the next run.' : 'Suppliers sign in here. Every bank detail change is verified by a call back from Veltrix before it is used.' }),
        signInForm(ctx, brand, fake, { title: fake ? 'Supplier sign in' : '', fields: [{ name: 'username', label: 'Supplier ID' }, { name: 'password', label: 'Password', type: 'password' }] })
      ])
    ]);
  },

  bank(ctx, brand, fake) {
    const business = brand.id.endsWith('-biz');
    return frame(brand, fake, [
      el('div', { class: 'sx-hero' }, [el('h1', { text: business ? 'Business online banking' : 'Online banking' }), el('p', { text: fake ? 'Unusual activity on your account. Sign in now to keep it open.' : 'We will never ask you to move money to keep it safe, or to share a code from your app.' })]),
      el('div', { class: 'sx-card sx-signin' }, [
        signInForm(ctx, brand, fake, {
          title: 'Log in',
          fields: business ? [{ name: 'username', label: 'Customer ID' }, { name: 'password', label: 'Passcode', type: 'password' }] : [{ name: 'username', label: 'Username' }, { name: 'password', label: 'Password', type: 'password' }],
          submit: 'Log in', small: fake ? 'Secured by 256 bit encryption' : `${brand.name} will never text you a link to log in.`
        })
      ])
    ], { nav: ['Accounts', 'Payments', 'Help'] });
  },

  share(ctx, brand, fake) {
    const doc = decodeURIComponent((ctx.url.pathname.split('/')[2] || 'document').replace(/-/g, ' '));
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-file' }, [
        el('span', { class: 'sx-fileicon' }, [icon('sheet')]),
        el('h1', { text: `${doc}.xlsx` }),
        el('p', { class: 'sx-muted', text: `Shared by Marta Okafor · ${fake ? 'sign in to view' : 'preview below'}` }),
        fake ? signInForm(ctx, brand, fake, { title: 'Sign in to view', fields: WORK_FIELDS, submit: 'View document' })
          : el('div', {}, [el('div', { class: 'sx-preview', text: 'Q3 accruals. Read only. Opens in the viewer.' }), el('p', { class: 'sx-small', text: 'Filebridge never asks for your Veltrix password. You are already signed in.' })])
      ])
    ]);
  },

  docs(ctx, brand, fake) {
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-file' }, [
        el('span', { class: 'sx-fileicon' }, [icon('doc')]),
        el('h1', { text: fake ? 'A document is waiting for your signature' : 'Docuvane' }),
        el('p', { class: 'sx-muted', text: fake ? 'Sign in with your work account to review and sign.' : 'Send and sign documents.' }),
        fake ? signInForm(ctx, brand, fake, { title: 'Sign in to continue', fields: WORK_FIELDS, submit: 'Continue' })
          : el('p', { class: 'sx-small', text: 'Genuine Docuvane requests open a document, they do not ask for your Veltrix password.' })
      ])
    ]);
  },

  saas(ctx, brand, fake) {
    return frame(brand, fake, [
      el('div', { class: 'sx-card sx-signin' }, [
        el('h1', { text: brand.name }),
        el('p', { class: 'sx-muted', text: fake ? 'Your subscription could not be renewed. Confirm your details to keep access.' : 'Sign in to your account.' }),
        signInForm(ctx, brand, fake, { title: '', fields: [{ name: 'username', label: 'Email' }, { name: 'password', label: 'Password', type: 'password' }] })
      ])
    ]);
  },

  company(ctx, brand) {
    return frame(brand, false, [
      el('div', { class: 'sx-hero' }, [el('h1', { text: brand.name }), el('p', { text: `${brand.city} · supplier to Veltrix Logistics since ${brand.since}.` })]),
      el('div', { class: 'sx-grid' }, [
        card('Contact', `Accounts: ${brand.phone}. This is the number to call back on, and it matches the vendor master file.`),
        card('About', `${brand.owner} supplies Veltrix on standard payment terms. We will never ask you to change our bank details by email.`)
      ])
    ], { nav: ['Home', 'Services', 'Contact'] });
  },

  news(ctx, brand) {
    return frame(brand, false, [
      el('h1', { class: 'sx-masthead', text: 'The Freight Ledger' }),
      article('Port delays ease as backlog clears', 'Container dwell times at the main terminals fell this week, easing pressure on hauliers before the weekend.'),
      article('Fuel surcharge held for a third month', 'The industry benchmark surcharge is unchanged, giving freight buyers a rare stretch of certainty.'),
      article('Fraud warning: fake supplier bank changes on the rise', 'Finance teams are urged to verify any bank detail change by calling the supplier on a number they already hold, never one from the email.')
    ], { nav: ['News', 'Rates', 'Opinion'] });
  },

  search(ctx, brand) {
    const q = ctx.url.searchParams.get('q') || '';
    // A scenario can add results of its own (world.office.search): the ad that
    // outbids the real bank, the page that shows what the internet knows.
    const extra = ((ctx.world.office && ctx.world.office.search) || []).filter((r) => q && q.toLowerCase().includes(r.q));
    const results = [...extra, ...(SEARCH[q.toLowerCase().trim()] || (q ? GENERIC(q) : []))];
    return frame(brand, false, [
      el('div', { class: 'sx-search' }, [
        el('div', { class: 'sx-searchbar' }, [icon('search'), el('span', { text: q || 'Search Seekly' })]),
        results.length ? el('div', { class: 'sx-results' }, results.map((r) => el('div', { class: `sx-result ${r.ad ? 'is-ad' : ''}` }, [
          r.ad ? el('small', { class: 'sx-ad', text: 'Sponsored' }) : null,
          el('a', { class: 'sx-result-link', href: r.url, onclick: (ev) => { ev.preventDefault(); ctx.navigate(r.url); }, onpointerenter: () => ctx.link && null }, [r.title]),
          el('span', { class: 'sx-result-url mono', text: r.url }),
          el('p', { text: r.text })
        ].filter(Boolean)))) : el('p', { class: 'sx-muted', text: 'Type a query in the address bar, for example seekly.search/?q=harbour+bank' })
      ])
    ]);
  }
};

function card(title, text) { return el('article', { class: 'sx-card' }, [el('h3', { text: title }), el('p', { text })]); }
function article(title, text) { return el('article', { class: 'sx-article' }, [el('h2', { text: title }), el('p', { text })]); }

function consent(ctx, brand) {
  const appName = ctx.url.searchParams.get('app') || 'Third party app';
  const scopes = (ctx.url.searchParams.get('scopes') || 'read your email,send email as you').split(',');
  return frame(brand, false, [
    el('div', { class: 'sx-card sx-consent' }, [
      el('h1', { text: 'Permissions requested' }),
      el('p', {}, [el('b', { text: appName }), ' wants permission to:']),
      el('ul', { class: 'sx-scopes' }, scopes.map((s) => el('li', {}, [icon('warning'), el('span', { text: s.trim() })]))),
      el('p', { class: 'sx-small', text: 'Only allow apps you recognise. An app that can read and send your mail can move money and cover its tracks.' }),
      el('div', { class: 'sx-consent-actions' }, [
        el('button', { class: 'sx-btn ghost', type: 'button', onclick: () => ctx.emit('oauth:declined', { app: appName }) }, ['Cancel']),
        el('button', { class: 'sx-btn', type: 'button', onclick: () => ctx.emit('oauth:consented', { app: appName, scopes }) }, ['Allow'])
      ])
    ])
  ]);
}

const SEARCH = {
  'harbour bank': [
    { title: 'Harbour Bank Business online banking', url: 'https://business.harbourbank.co.uk/', text: 'Log in to Harbour Bank Business.' },
    { title: 'Harbour Bank Business: secure login', url: 'https://harbourbank-verify.com/', text: 'Verify your Harbour Bank account now.', ad: true }
  ],
  'veltrix login': [
    { title: 'Veltrix sign in', url: 'https://sso.veltrix-logistics.com/', text: 'Sign in to your Veltrix work account.' }
  ]
};
const GENERIC = (q) => [
  { title: `Results for ${q}`, url: `https://freightledger.news/?s=${encodeURIComponent(q)}`, text: 'The Freight Ledger, freight and logistics news.' },
  { title: `${q} on Seekly`, url: `https://seekly.search/?q=${encodeURIComponent(q)}`, text: 'More results on Seekly.' }
];

export function renderSite(brand, ctx, fake) {
  const fn = KINDS[brand.kind] || KINDS.portal;
  const node = fn(ctx, brand, fake);
  ctx.emit(fake ? 'site:fakeShown' : 'site:realShown', { brand: brand.id, kind: brand.kind });
  return node;
}
