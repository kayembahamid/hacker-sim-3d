import { el, clear } from '../../../core/dom.js';
import { createBrowser } from '../../browser.js';
import { browserKey } from '../../phone/apps/browserApp.js';

// The desktop browser: the shared browser with tabs and a bookmarks bar.
// Links opened from Mail or Chat arrive as params.url.
export function makeDesktopBrowser({ title = 'Browser', bookmarks = [] } = {}) {
  let api = null;
  let key = '';
  let lastUrl = null;
  const app = {
    id: 'browser', title, icon: 'browser', colour: 'linear-gradient(160deg,#5ea8ff,#2f6fd6)', w: 1100, h: 660, pinned: true, max: false,
    mount(ctx, params = {}) {
      api = createBrowser({ device: 'desktop', store: ctx.store, sites: ctx.sites, vars: ctx.vars, product: ctx.product, bar: ctx.bar, bookmarks });
      key = browserKey(ctx.world, 'desktop');
      // Navigate once the window exists, not while it is being built.
      if (params.url) { lastUrl = params.url; queueMicrotask(() => api.navigate(params.url, params.from || 'link')); }
      return api.node;
    },
    update(ctx, node, params = {}) {
      if (params.url && params.url !== lastUrl) {
        lastUrl = params.url;
        api.newTab(params.url);
        return;
      }
      const k = browserKey(ctx.world, 'desktop');
      if (k !== key) { key = k; api.render(); }
    },
    get api() { return api; }
  };
  return app;
}

export function makeNotesApp({ title = 'Notes', notes = [] } = {}) {
  const app = {
    id: 'notes', title, icon: 'note', colour: 'linear-gradient(160deg,#ffe38a,#f2b93b)', w: 520, h: 440,
    mount(ctx) {
      const node = el('div', { class: 'app-notes' });
      app.update(ctx, node);
      return node;
    },
    update(ctx, node) {
      const all = [...notes, ...ctx.world.desktop.notes];
      const k = String(all.length);
      if (node.dataset.key === k) return;
      node.dataset.key = k;
      clear(node);
      node.append(...all.map((n) => el('article', { class: 'nt-note' }, [
        el('h3', { text: n.title }),
        ...[].concat(n.lines || []).map((l) => el('p', { text: l })),
        n.sign ? el('p', { class: 'nt-sign', text: n.sign }) : null
      ])));
    }
  };
  return app;
}
