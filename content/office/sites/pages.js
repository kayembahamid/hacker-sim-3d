import { el } from '../../../engine/core/dom.js';
import { icon } from '../../../engine/ui/icons.js';
import { qrSvg } from '../../../engine/ui/qr.js';
import { registrableDomain } from '../../../engine/scenario/lookalike.js';
import { frame } from './render.js';

// Pages a scenario writes itself, as data: a courier's "pay the release fee"
// page, a scareware warning, an extension store listing, a café Wi-Fi portal.
// The site.page action registers one at a host for the run.
//
// SAFETY: the same rules as the brand templates. A form here is the engine's
// tap to type form, so nothing typed is read and nothing is sent; buttons only
// raise events for the scenario; no page is reachable outside the sim.
//
// spec: { id, host, title, owner, fake, secure, colour, accent, nav, ownerNote,
//   formAction, pages: { '/': [block], '/other': [block] } }
// block: { h } { h2 } { p } { muted } { note } { warn } { list: [] }
//   { kv: [[label, value]] } { cards: [{ title, text }] } { chat: [{ who, text }] }
//   { table: { head: [], rows: [[]] } } { qr, caption } { link, text }
//   { button, emit, payload, go, style, download } { form: { id, fields, submit, small } }
//   { scare: { title, lines, number } }
export function pageSite(spec) {
  const owner = registrableDomain(spec.host);
  const fake = !!spec.fake;
  const brand = {
    id: `page-${spec.id}`, name: spec.title, owner: spec.owner || owner, domain: spec.host, kind: 'page',
    colour: spec.colour || '#1f2937', accent: spec.accent || '#24c28a'
  };
  const cert = spec.cert || (fake || !spec.owner ? {
    issuedTo: 'No company name, address only',
    issuedBy: 'QuickCert Free SSL',
    valid: `Issued ${spec.certDays || 3} days ago`,
    explain: `The padlock only means nobody can read what you send. This certificate was issued to the address ${owner}, not to a named company. Anyone can get one in minutes, including scammers.`
  } : {
    issuedTo: spec.owner,
    issuedBy: 'Northlight Trust Organisation CA',
    valid: `Issued ${spec.certMonths || 14} months ago, to ${spec.owner}`,
    explain: `This certificate was issued to ${spec.owner}, a named company, after checks. The address and the company match.`
  });
  return {
    id: brand.id, host: [spec.host], title: spec.title, secure: spec.secure !== false, brand: brand.id, fake,
    cert: spec.secure === false ? null : cert,
    ownerNote: spec.ownerNote || (fake ? `This address is owned by ${owner}. Check it against the address you already trust before you type anything.` : `${spec.owner || owner}. The address is ${spec.host}.`),
    requests: spec.requests || [{ method: 'GET', url: `https://${spec.host}/app.css`, host: spec.host, type: 'style', status: 200 }],
    formAction: spec.formAction || (spec.pages && Object.values(spec.pages).flat().some((b) => b && b.form) ? `https://${fake ? `collect.${owner}` : spec.host}/submit` : null),
    render: (ctx) => renderPage(spec, brand, ctx)
  };
}

function renderPage(spec, brand, ctx) {
  const path = ctx.url.pathname.replace(/\/+$/, '') || '/';
  const pages = spec.pages || { '/': spec.blocks || [] };
  const blocks = pages[path] || pages['/'] || [];
  ctx.emit('page:shown', { page: spec.id, path, fake: !!spec.fake });
  const scare = blocks.find((b) => b.scare);
  if (scare) return scareScreen(scare.scare, ctx, spec);
  const body = el('div', { class: `sx-page ${spec.narrow === false ? '' : 'is-narrow'}` }, blocks.map((b) => block(b, ctx, spec, brand)).filter(Boolean));
  return frame(brand, !!spec.fake, [body], { nav: spec.nav || [], wide: !!spec.wide });
}

function block(b, ctx, spec, brand) {
  if (typeof b === 'string') return el('p', { text: b });
  if (b.h) return el('h1', { class: 'sx-ph', text: b.h });
  if (b.h2) return el('h2', { class: 'sx-ph2', text: b.h2 });
  if (b.p) return el('p', { class: 'sx-p', text: b.p });
  if (b.muted) return el('p', { class: 'sx-muted', text: b.muted });
  if (b.note) return el('p', { class: 'sx-pnote' }, [icon('info'), el('span', { text: b.note })]);
  if (b.warn) return el('p', { class: 'sx-pwarn' }, [icon('warning'), el('span', { text: b.warn })]);
  if (b.list) return el('ul', { class: 'sx-plist' }, b.list.map((l) => el('li', { text: l })));
  if (b.kv) return el('div', { class: 'sx-pkv' }, b.kv.map(([k, v]) => el('div', {}, [el('span', { text: k }), el('b', { text: v })])));
  if (b.cards) return el('div', { class: 'sx-grid' }, b.cards.map((c) => el('article', { class: 'sx-card' }, [el('h3', { text: c.title }), el('p', { text: c.text })])));
  if (b.chat) return el('div', { class: 'sx-pchat' }, b.chat.map((m) => el('div', { class: `sx-pmsg is-${m.who === 'me' ? 'me' : 'them'}` }, [el('b', { text: m.who === 'me' ? 'You' : (m.who || spec.title) }), el('p', { text: m.text })])));
  if (b.table) {
    return el('table', { class: 'sx-ptable' }, [
      el('thead', {}, [el('tr', {}, b.table.head.map((h) => el('th', { text: h })))]),
      el('tbody', {}, b.table.rows.map((r) => el('tr', {}, r.map((c) => el('td', { text: String(c) })))))
    ]);
  }
  if (b.qr) return el('figure', { class: 'sx-pqr' }, [qrSvg(b.qr), b.caption ? el('figcaption', { text: b.caption }) : null].filter(Boolean));
  if (b.link) return el('p', {}, [ctx.link(b.link, b.text || b.link)]);
  if (b.form) {
    const f = b.form;
    return el('div', { class: 'sx-card sx-signin' }, [ctx.form({
      id: f.id || `${spec.id}-form`, site: f.site || `page-${spec.id}`, title: f.title || '',
      fields: f.fields || [{ name: 'username', label: 'Email' }, { name: 'password', label: 'Password', type: 'password' }],
      submitLabel: f.submit || 'Continue', small: f.small, vault: f.vault,
      submitStyle: { background: brand.accent, color: '#08110d' }
    })]);
  }
  if (b.button) {
    return el('button', {
      class: `sx-btn sx-pbtn ${b.style || ''}`.trim(), type: 'button', dataset: { pageBtn: b.id || b.emit || b.go || 'btn' },
      onclick: () => {
        if (b.emit) ctx.emit(b.emit, { page: spec.id, ...(b.payload || {}) });
        if (b.download) ctx.download(b.download);
        if (b.go) ctx.navigate(b.go);
      }
    }, [b.icon ? icon(b.icon) : null, b.button].filter(Boolean));
  }
  if (b.row) return el('div', { class: 'sx-prow' }, b.row.map((x) => block(x, ctx, spec, brand)).filter(Boolean));
  return null;
}

// A browser locker: the whole page shouts that the computer is infected and
// that you must call a number now. The page itself is the attack. It cannot
// really lock anything: closing the tab or the browser ends it.
function scareScreen(s, ctx, spec) {
  return el('div', { class: 'sx-scare', role: 'alert' }, [
    el('div', { class: 'sx-scare-box' }, [
      el('p', { class: 'sx-scare-top' }, [icon('warning'), el('span', { text: s.brand || 'System Security Alert' })]),
      el('h1', { text: s.title || 'Your computer has been blocked' }),
      ...(s.lines || []).map((l) => el('p', { text: l })),
      s.number ? el('p', { class: 'sx-scare-call' }, [icon('phone'), el('span', { text: `Call now: ${s.number}` })]) : null,
      el('div', { class: 'sx-scare-actions' }, [
        el('button', { class: 'sx-btn', type: 'button', dataset: { pageBtn: 'scare-ok' }, onclick: () => ctx.emit('scare:clicked', { page: spec.id, button: 'ok' }) }, [s.ok || 'OK']),
        el('button', { class: 'sx-btn ghost', type: 'button', dataset: { pageBtn: 'scare-scan' }, onclick: () => ctx.emit('scare:clicked', { page: spec.id, button: 'scan' }) }, [s.scan || 'Scan now'])
      ]),
      el('small', { class: 'sx-scare-foot', text: s.foot || 'Do not close this window or restart your computer. Doing so may cause data loss.' })
    ])
  ]);
}
