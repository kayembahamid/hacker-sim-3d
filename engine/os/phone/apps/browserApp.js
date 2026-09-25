import { createBrowser } from '../../browser.js';

// The phone's browser: the shared browser in its phone layout. It only redraws
// when its own tabs or address change, never on unrelated world updates, so a
// page with a countdown on it keeps counting.
export function browserKey(world, device) {
  const b = world[device].browser;
  const t = b.tabs[b.active];
  return `${b.active}:${b.tabs.length}:${t ? t.index : -1}:${t ? t.history[t.index] : ''}`;
}

export function makePhoneBrowser({ store, sites, vars, product, bookmarks }) {
  const app = {
    id: 'browser',
    name: 'Browser',
    icon: 'browser',
    colour: 'linear-gradient(160deg,#5ea8ff,#2f6fd6)',
    dock: true,
    api: null,
    key: '',
    mount(ctx) {
      app.api = createBrowser({ device: 'phone', store, sites, vars, product, bar: ctx.bar, bookmarks: bookmarks || [] });
      app.key = browserKey(store.get(), 'phone');
      return app.api.node;
    },
    update() {
      const key = browserKey(store.get(), 'phone');
      if (key !== app.key) { app.key = key; app.api.render(); }
    }
  };
  return app;
}
