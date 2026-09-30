// Every web address in the story must be made up. This finds every address
// the content can show, including every lookalike the generator can make,
// and asks the real DNS whether the domain exists. A registered domain means
// a real site someone owns: a player could type it into a real browser, so
// it has to be renamed.
//
//   node tools/check-domains.mjs [content/netizen]
//
// Exits 1 if any address is registered. Needs a network connection.
import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { Resolver } from 'node:dns/promises';
import { TECHNIQUES, registrableDomain } from '../engine/scenario/lookalike.js';

const dir = process.argv[2] || 'content/netizen';

// Endings that can never be registered: reserved for examples and tests.
const RESERVED = ['example', 'test', 'invalid', 'localhost'];
// Addresses that are ours and real on purpose.
const OURS = ['hamcodes.com'];
// Single hosts that are ours on someone else's domain (the Hacker's Notes
// book on GitBook).
const OURS_HOSTS = ['hamcodes.gitbook.io'];
const TLDS = 'com|net|org|uk|io|gg|tv|app|xyz|club|link|ly|co|me|shop|site|online|info|search|example|test|invalid|social|chat|game|games|live|news|store|dev|page|help|support|email|mail|cloud|biz|us';
const HOST = new RegExp(`\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b`, 'gi');
const NOT_HOSTS = /\.(png|jpe?g|svg|exe|pdf|js|json|css|glb|ktx2|txt|zip)$/i;

async function files(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...await files(p));
    else if (['.js', '.json', '.html', '.css'].includes(extname(e.name))) out.push(p);
  }
  return out;
}

const hosts = new Map();
// Endings named in the text ("school addresses end in sch.uk") are not sites.
const SUFFIXES = ['co.uk', 'sch.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au'];
// Scenario action names that happen to look like an address.
const ACTION_NAMES = ['site.page'];
const add = (host, where) => {
  host = host.toLowerCase().replace(/\.$/, '');
  if (NOT_HOSTS.test(host) || SUFFIXES.includes(host) || ACTION_NAMES.includes(host)) return;
  if (!hosts.has(host)) hosts.set(host, new Set());
  hosts.get(host).add(where);
};

// The text inside string literals, so code like world.game or ctx.link is
// never mistaken for an address. Good enough for this content: no regex
// literals contain quotes.
function strings(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 2; if (i < 2) break; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      let buf = '';
      let depth = 0;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') { buf += src[j + 1] || ''; j += 2; continue; }
        if (c === '`' && d === '$' && src[j + 1] === '{') { depth++; j += 2; buf += ' '; continue; }
        if (depth && d === '}') { depth--; j++; continue; }
        if (!depth && d === c) break;
        if (!depth) buf += d;
        j++;
      }
      out.push(buf);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join('\n');
}

for (const f of await files(dir)) {
  const raw = await readFile(f, 'utf8');
  const text = f.endsWith('.js') ? strings(raw) : raw;
  for (const m of text.matchAll(HOST)) {
    // A match straight after a dot is an ending (.sch.uk), not a site.
    const before = text[m.index - 1] || '';
    if (/[A-Za-z0-9_$.]/.test(before)) continue;
    add(m[0], f);
  }
  const text2 = raw;
  // Every lookalike a scenario can generate, with its options.
  if (f.endsWith('.json')) {
    const json = JSON.parse(text2);
    for (const def of Object.values(json.vars || {})) {
      if (!def || typeof def !== 'object' || !('lookalike' in def)) continue;
      const [brand, ...rest] = def.lookalike.split('.');
      const tld = rest.join('.') || 'com';
      for (const [id, t] of Object.entries(TECHNIQUES)) add(t.make(brand, tld, def), `${f} (lookalike: ${id})`);
    }
  }
}

// Addresses a product generates in code (fake versions of every site) are
// listed by its sites module, if it has one.
try {
  const mod = await import(new URL(`../${dir}/sites/lookalikes.js`, import.meta.url));
  if (mod.allHosts) for (const h of mod.allHosts()) add(h, `${dir}/sites/lookalikes.js (generated)`);
} catch (err) {
  if (err.code !== 'ERR_MODULE_NOT_FOUND') throw err;
}

const resolver = new Resolver({ timeout: 4000, tries: 2 });
async function registered(domain) {
  for (const type of ['NS', 'SOA', 'A']) {
    try {
      const r = await resolver.resolve(domain, type);
      if (r && (Array.isArray(r) ? r.length : true)) return type;
    } catch (err) {
      if (!['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'ENONAME', 'EREFUSED'].includes(err.code)) throw err;
    }
  }
  return null;
}

const rows = [];
let bad = 0;
const seen = new Map();
for (const [host, where] of [...hosts].sort()) {
  const owner = registrableDomain(host);
  const tld = owner.split('.').pop();
  let status;
  if (RESERVED.includes(tld)) status = 'reserved';
  else if (OURS.some((o) => owner === o) || OURS_HOSTS.includes(host)) status = 'ours';
  else {
    if (!seen.has(owner)) seen.set(owner, await registered(owner));
    status = seen.get(owner) ? `REGISTERED (${seen.get(owner)})` : 'free';
  }
  if (status.startsWith('REGISTERED')) bad++;
  rows.push([host, owner, status, [...where][0].replace(/^.*content\//, '')]);
}
const w = Math.max(...rows.map((r) => r[0].length));
for (const r of rows) console.log(`${r[2].startsWith('REG') ? '✗' : '·'} ${r[0].padEnd(w)}  ${r[2].padEnd(18)} ${r[3]}`);
console.log(`\n${rows.length} addresses, ${bad} registered.`);
process.exit(bad ? 1 : 0);
