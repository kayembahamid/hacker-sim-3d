// Lookalike domain techniques. A run picks one, so the same scam reads
// differently every time and the player has to actually read the address.
//
// Each technique makes a host from the real brand and ending, and says in
// plain words what the trick is.
export const TECHNIQUES = {
  'letter-swap': {
    name: 'Swapped letter',
    make: (brand, tld) => `${brand.includes('l') ? brand.replace(/l(?=[^l]*$)/, '1') : brand.replace(/i/, '1')}.${tld}`,
    explain: 'One letter l has been swapped for the number 1. At a glance they look the same.'
  },
  'rn-for-m': {
    name: 'Letters pretending to be another letter',
    make: (brand, tld) => (brand.includes('m') ? `${brand.replace('m', 'rn')}.${tld}` : `${brand}-garnes.${tld}`),
    explain: 'The letters r and n side by side look like an m, so garnes passes for games at a glance. Read it slowly.'
  },
  'extra-word': {
    name: 'Extra word bolted on',
    make: (brand, tld, o) => `${brand}-${o.word || 'rewards'}.${tld}`,
    explain: 'The real name has a word stuck on with a hyphen. Anyone can register that.'
  },
  'wrong-tld': {
    name: 'Wrong ending',
    make: (brand, tld, o) => `${brand}.${o.altTld || (tld === 'com' ? 'co' : 'com')}`,
    explain: 'The name is right but the ending is wrong. Check it against the address you already trust.'
  },
  'subdomain-trick': {
    name: 'Real name hidden in front',
    make: (brand, tld, o) => `${brand}.${tld}.${o.owner || 'account-check.net'}`,
    explain: 'Read the address backwards from the first slash. The last two parts decide who owns it, and here that is not the real company.'
  },
  homoglyph: {
    name: 'Number pretending to be a letter',
    make: (brand, tld) => `${brand.includes('o') ? brand.replace(/o/, '0') : brand.replace(/e/, '3')}.${tld}`,
    explain: 'There is a zero where the letter o should be.'
  },
  'double-letter': {
    name: 'A letter doubled',
    make: (brand, tld) => {
      const i = Math.max(1, Math.floor(brand.length / 2));
      return `${brand.slice(0, i)}${brand[i]}${brand.slice(i)}.${tld}`;
    },
    explain: 'One letter appears twice. Your eyes skip over it, a computer does not.'
  }
};

export const TECHNIQUE_IDS = Object.keys(TECHNIQUES);

// realDomain is the genuine one, for example playblockfall.com.
// Options: techniques (allowed list), path, word, altTld, owner.
export function makeLookalike(realDomain, rng, forced = null, opts = {}) {
  const [brand, ...rest] = realDomain.split('.');
  const tld = rest.join('.') || 'com';
  const allowed = opts.techniques || TECHNIQUE_IDS;
  const id = forced || rng.pick(allowed);
  const tech = TECHNIQUES[id] || TECHNIQUES['extra-word'];
  let host = tech.make(brand, tld, opts);
  if (host === realDomain) host = TECHNIQUES['extra-word'].make(brand, tld, opts);
  const path = opts.path || '/claim';
  return {
    host,
    url: `https://${host}${path}`,
    technique: id,
    techniqueName: tech.name,
    explain: tech.explain,
    real: realDomain,
    owner: registrableDomain(host)
  };
}

// The part of a host that actually decides who owns it. Knows the two part
// endings the sims use (co.uk, sch.uk, org.uk).
const SECOND_LEVEL = ['co.uk', 'sch.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au'];
export function registrableDomain(host) {
  const parts = String(host).toLowerCase().split('.').filter(Boolean);
  const lastTwo = parts.slice(-2).join('.');
  if (SECOND_LEVEL.includes(lastTwo)) return parts.slice(-3).join('.');
  return lastTwo;
}
