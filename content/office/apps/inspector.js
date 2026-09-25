import { el } from '../../../engine/core/dom.js';
import { bus } from '../../../engine/core/bus.js';
import { format } from '../../../engine/core/clock.js';
import { registrableDomain } from '../../../engine/scenario/lookalike.js';
import { changed, btn, empty, badge, head, office } from './kit.js';

// The HTTP inspector: every request the desktop browser makes, the way a
// browser's developer tools show them. A page's look can be copied perfectly;
// where its login form sends the password cannot be hidden from here.
//
// Site templates declare what they load (site.requests) and where their login
// form posts (site.formAction). Recording goes through the store, so a rewind
// forgets it too.
//
// Events: inspector:viewed { host, offsite }, inspector:request { url, offsite }.
export function recordRequests(store, sites) {
  const add = (req) => store.update((s) => {
    const list = s.office.inspector.requests;
    list.unshift({ id: `rq-${list.length + 1}`, at: format(s.clock.minutes), ...req });
    if (list.length > 60) list.length = 60;
  }, 'inspector');
  bus.on('site:visited', (p) => {
    if (p.device !== 'desktop') return;
    const hit = sites.resolve(p.url);
    const site = hit && hit.site;
    add({ method: 'GET', url: p.url, host: p.host, type: 'document', status: site ? 200 : 404, page: p.host });
    for (const r of (site && site.requests) || []) add({ ...r, page: p.host });
    if (site && site.formAction) add({ method: 'FORM', url: site.formAction, host: hostOf(site.formAction), type: 'form', status: 'not sent', page: p.host, note: 'Where this page’s login form will send what you type.' });
  });
  bus.on('form:submitted', (p) => {
    if (p.device !== 'desktop') return;
    const hit = sites.resolve(p.url);
    const site = hit && hit.site;
    const target = (site && site.formAction) || p.url;
    add({ method: 'POST', url: target, host: hostOf(target), type: 'form', status: 200, page: p.host, payload: (p.asks || []).map((a) => `${a}=${a === 'password' ? '••••••••••' : 's.rivera'}`).join('&') });
  });
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };

export function makeInspectorApp() {
  const app = {
    id: 'inspector', title: 'HTTP inspector', icon: 'inspector', colour: 'linear-gradient(160deg,#8a94a6,#4b5467)', w: 1020, h: 560, pinned: false,
    mount(ctx) { const node = el('div', { class: 'ox-app app-inspector' }); app.update(ctx, node); return node; },
    update(ctx, node) {
      const x = ctx.extra('inspector');
      const reqs = ctx.world.office.inspector.requests;
      if (!changed(node, [reqs, x])) return;
      const pages = [...new Set(reqs.map((r) => r.page))];
      const page = x.page && pages.includes(x.page) ? x.page : pages[0];
      const list = reqs.filter((r) => r.page === page);
      const open = list.find((r) => r.id === x.open);
      node.append(
        head('HTTP inspector', 'Requests made by the browser on this computer', [btn('Clear', () => office(ctx, (o) => { o.inspector.requests = []; }, 'inspector-clear'))]),
        pages.length ? el('div', { class: 'in-pages' }, pages.map((p) => el('button', {
          class: `in-page ${p === page ? 'is-on' : ''}`, type: 'button',
          onclick: () => { ctx.setExtra('inspector', { page: p, open: null }); }
        }, [p]))) : null,
        list.length ? el('div', { class: 'ox-split in-split' }, [
          el('table', { class: 'ox-table in-table' }, [
            el('thead', {}, [el('tr', {}, ['Method', 'Host', 'Path', 'Type', 'Status'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, list.map((r) => {
              const offsite = registrableDomain(r.host) !== registrableDomain(page);
              return el('tr', {
                class: `${open && open.id === r.id ? 'is-on' : ''} ${offsite && r.type === 'form' ? 'is-bad' : offsite ? 'is-off' : ''}`, tabindex: '0', dataset: { req: r.id },
                onclick: () => {
                  ctx.setExtra('inspector', { open: r.id, page });
                  bus.emit('inspector:request', { url: r.url, host: r.host, type: r.type, offsite, page });
                }
              }, [
                el('td', { class: 'mono', text: r.method }), el('td', { class: 'mono', text: r.host }),
                el('td', { class: 'mono', text: pathOf(r.url) }), el('td', { text: r.type }), el('td', { class: 'mono', text: String(r.status) })
              ]);
            }))
          ]),
          open ? detail(open, page) : el('div', { class: 'ox-detail is-empty' }, [el('p', { text: 'Pick a request to see where it goes.' })])
        ]) : empty('Nothing recorded yet. Open a page in the browser.')
      );
      const offForm = list.find((r) => r.type === 'form' && registrableDomain(r.host) !== registrableDomain(page));
      if (page && x.seen !== page) {
        ctx.setExtra('inspector', { seen: page });
        bus.emit('inspector:viewed', { host: page, offsite: !!offForm, formHost: offForm ? offForm.host : null });
      }
    }
  };

  function detail(r, page) {
    const offsite = registrableDomain(r.host) !== registrableDomain(page);
    return el('div', { class: 'ox-detail' }, [
      el('h3', { class: 'mono', text: `${r.method} ${r.url}` }),
      el('div', { class: 'kv' }, [el('span', { text: 'Sent to' }), el('b', { class: 'mono', text: registrableDomain(r.host) })]),
      el('div', { class: 'kv' }, [el('span', { text: 'From the page' }), el('b', { class: 'mono', text: page })]),
      r.payload ? el('div', { class: 'kv' }, [el('span', { text: 'Form data' }), el('b', { class: 'mono', text: r.payload })]) : null,
      r.note ? el('p', { class: 'ox-note', text: r.note }) : null,
      offsite && r.type === 'form' ? el('p', { class: 'ox-bad-text' }, [badge('Warning', 'bad'), ` This login form sends what you type to ${registrableDomain(r.host)}, not to ${registrableDomain(page)}. A real sign in page sends it to its own company.`]) : null,
      offsite && r.type !== 'form' ? el('p', { class: 'ox-note', text: `Loaded from another domain (${registrableDomain(r.host)}). Pages often load fonts and scripts from elsewhere; forms are what matter.` }) : null
    ].filter(Boolean));
  }

  const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
  return app;
}
