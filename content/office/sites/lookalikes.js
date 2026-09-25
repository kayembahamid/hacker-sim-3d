import { BRANDS, ATTACKER_DOMAINS, EXTRA_WORDS } from './brands.js';

// Fake versions of a real address, made with the tricks phishing really uses.
// Deterministic (no randomness), so every address can be checked against the
// real DNS before shipping. Pure functions, no DOM.
//
// A domain is split into the part a company registered (the registrable
// domain, e.g. harbourbank.co.uk) and anything in front of it (business.).
const SECOND = ['co.uk', 'org.uk', 'sch.uk', 'ac.uk', 'gov.uk'];

export function split(host) {
  const parts = host.split('.');
  const last2 = parts.slice(-2).join('.');
  const tldParts = SECOND.includes(last2) ? 2 : 1;
  const tld = parts.slice(-tldParts).join('.');
  const name = parts[parts.length - tldParts - 1];
  const sub = parts.slice(0, parts.length - tldParts - 1).join('.');
  return { sub, name, tld };
}

const join = (sub, name, tld) => `${sub ? `${sub}.` : ''}${name}.${tld}`;

export const TRICKS = {
  homoglyph: {
    label: 'A number standing in for a letter',
    explain: 'There is a zero where the letter o should be, or a one where an l should be. At a glance they look the same.',
    make: ({ sub, name, tld }) => (name.includes('o') ? join(sub, name.replace('o', '0'), tld) : name.includes('l') ? join(sub, name.replace('l', '1'), tld) : null)
  },
  'letter-swap': {
    label: 'Two letters swapped round',
    explain: 'Two letters next to each other have been swapped. Your eye fixes it for you without telling you.',
    make: ({ sub, name, tld }) => {
      const i = Math.max(1, Math.floor(name.length / 2) - 1);
      if (name[i] === name[i + 1] || !/[a-z]/.test(name[i]) || !/[a-z]/.test(name[i + 1])) return null;
      return join(sub, `${name.slice(0, i)}${name[i + 1]}${name[i]}${name.slice(i + 2)}`, tld);
    }
  },
  'double-letter': {
    label: 'A letter doubled',
    explain: 'One letter appears twice. Your eyes skip over it; a computer does not.',
    make: ({ sub, name, tld }) => {
      const i = Math.floor(name.length / 2);
      if (!/[a-z]/.test(name[i])) return null;
      return join(sub, `${name.slice(0, i)}${name[i]}${name.slice(i)}`, tld);
    }
  },
  'extra-word': {
    label: 'A word bolted on',
    explain: 'The real name with a word added by a hyphen. Anybody can register that, and anybody did.',
    make: ({ sub, name, tld }, brand) => `${name}${sub ? `-${sub.split('.')[0]}` : ''}-${EXTRA_WORDS[brand.kind] || 'secure'}.${tld === 'co.uk' ? 'com' : tld}`
  },
  'wrong-tld': {
    label: 'The wrong ending',
    explain: 'The name is right but the ending is not the one the company uses.',
    make: ({ sub, name, tld }) => join(sub, name, { com: 'co', 'co.uk': 'org.uk', io: 'net', app: 'site' }[tld] || 'com')
  },
  'subdomain-trick': {
    label: 'The real name hidden in front',
    explain: 'Read the address backwards from the first slash. The last two parts decide who owns it, and here that is the attacker.',
    make: (_parts, brand, i) => `${brand.domain}.${ATTACKER_DOMAINS[i % ATTACKER_DOMAINS.length]}`
  }
};

// Every fake address for one brand, with the trick that made it.
export function lookalikesFor(brand, index = 0) {
  const parts = split(brand.domain);
  const out = [];
  for (const trick of brand.lookalike || []) {
    const host = TRICKS[trick].make(parts, brand, index);
    if (host && host !== brand.domain && !out.find((o) => o.host === host)) out.push({ host, trick });
  }
  return out;
}

// For the domain audit: every real and fake address the sites answer to.
export function allHosts() {
  const hosts = [];
  BRANDS.forEach((b, i) => {
    hosts.push(b.domain);
    for (const l of lookalikesFor(b, i)) hosts.push(l.host);
  });
  return hosts;
}

// Pick one lookalike of a brand for a run, with the plain words for its trick.
// rng is the runner's seeded generator (rng.pick / rng.int).
import { BRANDS as _BRANDS } from './brands.js';
export function pickLookalike(brandId, rng) {
  const brand = _BRANDS.find((b) => b.id === brandId);
  if (!brand) return null;
  const i = rng && rng.int ? rng.int(0, 5) : 0;
  const options = lookalikesFor(brand, i);
  if (!options.length) return null;
  const chosen = rng && rng.pick ? rng.pick(options) : options[0];
  const t = TRICKS[chosen.trick];
  return { host: chosen.host, trick: chosen.trick, label: t.label, explain: t.explain, real: brand.domain, brand: brandId };
}
