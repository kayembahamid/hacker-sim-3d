import { BRANDS } from './brands.js';
import { lookalikesFor, split } from './lookalikes.js';
import { renderSite } from './render.js';
import { pageSite } from './pages.js';
import { registrableDomain } from '../../../engine/scenario/lookalike.js';

// Turns the brand data into the site descriptors the browser resolves. Every
// real address gets a genuine certificate naming the company that owns it;
// every fake address gets a giveaway certificate (a free one issued days ago,
// to an address and not a company) and a login form that "posts" to the
// attacker's own domain, which is what the HTTP inspector reveals.
//
// A descriptor: { id, host[], title, secure, cert, ownerNote, requests,
// formAction, render(ctx) }.
const CDN = ['https://cdn.veltrix-logistics.com/app.css', 'https://cdn.veltrix-logistics.com/app.js', 'https://static.filebridge.io/vendor.js'];

function realCert(brand) {
  return {
    issuedTo: brand.owner,
    issuedBy: 'Northlight Trust Organisation CA',
    valid: `Issued ${18 + (brand.name.length % 9)} months ago, to ${brand.owner}`,
    explain: `This certificate was issued to ${brand.owner}, a named company, after checks. The address and the company match.`
  };
}

function fakeCert(brand, host) {
  const owner = registrableDomain(host);
  return {
    issuedTo: 'No company name, address only',
    issuedBy: 'QuickCert Free SSL',
    valid: 'Issued 3 days ago',
    explain: `The padlock only means nobody can read what you send. This certificate was issued three days ago to the address ${owner}, not to a company, and not to ${brand.owner}. Anyone can get one in minutes.`
  };
}

function realSite(brand) {
  const formAction = `https://${brand.domain}/auth`;
  return {
    id: brand.id, host: [brand.domain], title: brand.name, secure: true, brand: brand.id,
    cert: realCert(brand),
    ownerNote: `${brand.owner}. The address is ${brand.domain}. Check it against the one you already trust.`,
    requests: CDN.slice(0, 2).map((url) => ({ method: 'GET', url, host: hostOf(url), type: 'style', status: 200 })),
    formAction,
    render: (ctx) => renderSite(brand, ctx, false)
  };
}

function fakeSite(brand, host, trick) {
  // Where a fake login form sends what is typed: the attacker's own domain.
  const owner = registrableDomain(host);
  const attacker = trick === 'subdomain-trick' ? owner : owner;
  return {
    id: `${brand.id}-fake`, host: [host], title: brand.name, secure: true, brand: brand.id, fake: true, trick,
    cert: fakeCert(brand, host),
    ownerNote: `The real ${brand.name} address is ${brand.domain}. This address is ${host}: read the part just before the first slash. It is owned by ${owner}, not ${brand.owner}.`,
    requests: [{ method: 'GET', url: `https://${host}/style.css`, host, type: 'style', status: 200 }],
    formAction: `https://collect.${attacker}/submit`,
    render: (ctx) => renderSite(brand, ctx, true)
  };
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

export class SiteRegistry {
  constructor() {
    this.byId = new Map();
    this.byHost = new Map();
    BRANDS.forEach((brand, i) => {
      this.add(realSite(brand));
      for (const { host, trick } of lookalikesFor(brand, i)) this.add(fakeSite(brand, host, trick));
    });
  }

  add(site) {
    this.byId.set(site.id, site);
    for (const host of [].concat(site.host)) this.byHost.set(host.toLowerCase(), site);
  }

  // Point a run specific host at a template, or override fields on it.
  alias(host, siteId, extra = {}) {
    const site = this.byId.get(siteId);
    if (!site) return;
    this.byHost.set(String(host).toLowerCase(), { ...site, host: [host], ...extra });
  }

  // Attach a fresh fake of a brand at a specific host (used by scenarios that
  // pick their own lookalike for the run).
  registerFake(brandId, host, trick = 'extra-word', extra = {}) {
    const brand = BRANDS.find((b) => b.id === brandId);
    if (!brand) return null;
    const site = { ...fakeSite(brand, host, trick), ...extra };
    this.byHost.set(host.toLowerCase(), site);
    return site;
  }

  // A page written by a scenario, as data (see pages.js).
  page(spec) {
    const site = pageSite(spec);
    this.byHost.set(String(spec.host).toLowerCase(), site);
    return site;
  }

  resolve(url) {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    const site = this.byHost.get(parsed.hostname.toLowerCase());
    return site ? { site, url: parsed } : null;
  }

  brand(id) { return BRANDS.find((b) => b.id === id); }
  list() { return [...this.byId.values()]; }
}

export const sites = new SiteRegistry();
export { BRANDS, split };
