// Every organisation with a website in the sim. All invented. Pure data, no
// DOM, so tools/check-domains.mjs can read it and check that none of the
// addresses (or their lookalikes) is a real site.
//
// kind picks the page template (see render.js); lookalike lists the tricks
// used to make fake versions of the site (see lookalikes.js). owner is the
// organisation named in the certificate of the real site.
export const BRANDS = [
  { id: 'vlx-sso', kind: 'sso', name: 'Veltrix sign in', owner: 'Veltrix Logistics Ltd', domain: 'sso.veltrix-logistics.com', colour: '#0f2a33', accent: '#24c28a', since: '2009', lookalike: ['homoglyph', 'letter-swap', 'subdomain-trick', 'wrong-tld', 'extra-word', 'double-letter'] },
  { id: 'vlx-intranet', kind: 'intranet', name: 'Veltrix intranet', owner: 'Veltrix Logistics Ltd', domain: 'intranet.veltrix-logistics.com', colour: '#0f2a33', accent: '#24c28a', since: '2009', lookalike: [] },
  { id: 'vlx-hr', kind: 'portal', name: 'Veltrix People', owner: 'Veltrix Logistics Ltd', domain: 'hr.veltrix-logistics.com', colour: '#6b2a4f', accent: '#e86fa3', since: '2009', lookalike: ['subdomain-trick', 'extra-word'], blurb: 'Pay, leave and benefits. Bank detail changes for salary are made here, by you, signed in as you.' },
  { id: 'vlx-desk', kind: 'portal', name: 'Veltrix Service Desk', owner: 'Veltrix Logistics Ltd', domain: 'servicedesk.veltrix-logistics.com', colour: '#7a3b12', accent: '#f2994a', since: '2009', lookalike: ['subdomain-trick', 'extra-word'], blurb: 'Raise and track IT tickets. The service desk never asks for your password or to approve a sign in.' },
  { id: 'vlx-meet', kind: 'meet', name: 'Veltrix Meet', owner: 'Veltrix Logistics Ltd', domain: 'meet.veltrix-logistics.com', colour: '#0f3d38', accent: '#35c3b0', since: '2009', lookalike: ['subdomain-trick', 'extra-word'] },
  { id: 'vlx-suppliers', kind: 'vendor', name: 'Veltrix Supplier Portal', owner: 'Veltrix Logistics Ltd', domain: 'suppliers.veltrix-logistics.com', colour: '#12324a', accent: '#4fb3f6', since: '2009', lookalike: ['subdomain-trick', 'extra-word'] },
  { id: 'harbour-biz', kind: 'bank', name: 'Harbour Bank Business', owner: 'Harbour Bank plc', domain: 'business.harbourbank.co.uk', colour: '#0d3e55', accent: '#27a7c9', since: '1998', lookalike: ['subdomain-trick', 'extra-word', 'homoglyph', 'wrong-tld'] },
  { id: 'harbour', kind: 'bank', name: 'Harbour Bank', owner: 'Harbour Bank plc', domain: 'harbourbank.co.uk', colour: '#0d3e55', accent: '#27a7c9', since: '1998', lookalike: ['homoglyph', 'double-letter', 'extra-word', 'wrong-tld', 'subdomain-trick'] },
  { id: 'albion', kind: 'bank', name: 'Albion Mutual', owner: 'Albion Mutual Building Society', domain: 'albionmutual.co.uk', colour: '#3b2b6e', accent: '#9b7bff', since: '2001', lookalike: ['homoglyph', 'extra-word', 'wrong-tld', 'double-letter', 'subdomain-trick'] },
  { id: 'crestline', kind: 'bank', name: 'Crestline Bank', owner: 'Crestline Bank Ltd', domain: 'crestlinebank.co.uk', colour: '#5a1f1f', accent: '#e0674a', since: '2004', lookalike: ['letter-swap', 'extra-word', 'wrong-tld', 'double-letter', 'subdomain-trick'] },
  { id: 'filebridge', kind: 'share', name: 'Filebridge', owner: 'Filebridge Inc', domain: 'filebridge.io', colour: '#1c3f7a', accent: '#63a4ff', since: '2016', lookalike: ['homoglyph', 'letter-swap', 'subdomain-trick', 'extra-word', 'double-letter'] },
  { id: 'docuvane', kind: 'docs', name: 'Docuvane', owner: 'Docuvane Ltd', domain: 'docuvane.app', colour: '#2e2a5c', accent: '#8a7dff', since: '2018', lookalike: ['homoglyph', 'letter-swap', 'wrong-tld', 'extra-word', 'double-letter', 'subdomain-trick'] },
  { id: 'ledgerbay', kind: 'saas', name: 'Ledgerbay', owner: 'Ledgerbay Software Ltd', domain: 'ledgerbay.io', colour: '#123f2f', accent: '#3fbf74', since: '2015', lookalike: ['homoglyph', 'letter-swap', 'wrong-tld', 'extra-word', 'double-letter', 'subdomain-trick'] },
  { id: 'haulquote', kind: 'saas', name: 'Haulquote', owner: 'Haulquote Ltd', domain: 'haulquote.io', colour: '#3a1f4f', accent: '#c07cff', since: '2019', lookalike: ['homoglyph', 'wrong-tld', 'extra-word', 'double-letter'] },
  { id: 'portside', kind: 'saas', name: 'Portside Customs', owner: 'Portside Customs Brokers Ltd', domain: 'portsidecustoms.co.uk', colour: '#1f3b4d', accent: '#5fb3d6', since: '2006', lookalike: ['homoglyph', 'extra-word', 'wrong-tld', 'double-letter'] },
  { id: 'spendhawk', kind: 'saas', name: 'Spendhawk Expenses', owner: 'Spendhawk Software Ltd', domain: 'spendhawk.app', colour: '#4a3212', accent: '#f2b93b', since: '2020', lookalike: ['homoglyph', 'letter-swap', 'wrong-tld', 'extra-word', 'double-letter'] },
  { id: 'ferrum', kind: 'company', name: 'Ferrum Steel Supply', owner: 'Ferrum Steel Supply Ltd', domain: 'ferrumsteel.co.uk', colour: '#2d2f33', accent: '#c9793a', since: '2003', phone: '0114 496 0213', city: 'Sheffield', lookalike: ['homoglyph', 'double-letter', 'extra-word', 'wrong-tld', 'subdomain-trick'] },
  { id: 'kestrel', kind: 'company', name: 'Kestrel Freight', owner: 'Kestrel Freight Ltd', domain: 'kestrelfreight.co.uk', colour: '#1d3557', accent: '#e9a23b', since: '2011', phone: '0161 496 0548', city: 'Manchester', lookalike: ['homoglyph', 'extra-word', 'wrong-tld', 'double-letter', 'subdomain-trick'] },
  { id: 'northbank', kind: 'company', name: 'Northbank Packaging', owner: 'Northbank Packaging Ltd', domain: 'northbankpackaging.co.uk', colour: '#2f4a3a', accent: '#8fc07a', since: '2008', phone: '020 7946 0871', city: 'London', lookalike: ['homoglyph', 'extra-word', 'wrong-tld'] },
  { id: 'talon', kind: 'company', name: 'Talon Tyres', owner: 'Talon Tyres Ltd', domain: 'talontyres.co.uk', colour: '#262626', accent: '#f2c14e', since: '2014', phone: '0113 496 0555', city: 'Leeds', lookalike: ['homoglyph', 'extra-word', 'wrong-tld', 'double-letter'] },
  { id: 'dropwell', kind: 'company', name: 'Dropwell Couriers', owner: 'Dropwell Couriers Ltd', domain: 'dropwell.co.uk', colour: '#3a2a12', accent: '#f2994a', since: '2012', phone: '0118 496 0730', city: 'Reading', lookalike: ['homoglyph', 'extra-word', 'wrong-tld', 'double-letter'] },
  { id: 'freightledger', kind: 'news', name: 'The Freight Ledger', owner: 'Freight Ledger Media Ltd', domain: 'freightledger.news', colour: '#111111', accent: '#c43d3f', since: '2012', lookalike: ['homoglyph', 'extra-word'] },
  { id: 'seekly', kind: 'search', name: 'Seekly', owner: 'Seekly Search Ltd', domain: 'seekly.search', colour: '#ffffff', accent: '#2f6fd6', since: '2014', lookalike: ['homoglyph', 'double-letter'] }
];

// Attackers' own domains, used for the subdomain trick and as where fake
// forms send what is typed.
export const ATTACKER_DOMAINS = ['authgate-verify.net', 'docview-secure.net', 'signin-relay.net', 'account-check.net', 'vendor-remit.net', 'share-preview.net', 'session-check.net'];

// Extra words bolted on, per kind.
export const EXTRA_WORDS = { sso: 'login', intranet: 'staff', portal: 'secure', meet: 'join', vendor: 'update', bank: 'verify', share: 'docs', docs: 'sign', saas: 'billing', company: 'accounts', news: 'daily', search: 'find' };
