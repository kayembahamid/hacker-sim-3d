import { bus } from './bus.js';

// One serialisable world for both devices. Every screen renders from here, so
// a rewind is just "put the old snapshot back and redraw", and a scam that
// starts as a call on the phone and ends in the browser on the computer is one
// continuous piece of state.
export function freshTab(id = 't1') {
  return { id, history: [], index: -1 };
}

export function freshWorld(product = {}) {
  const w = {
    clock: { minutes: product.clock ? product.clock.start : 19 * 60 },
    difficulty: 'normal',
    seed: '',
    flags: {},
    phone: {
      locked: true,
      pin: (product.phone && product.phone.pin) || '2048',
      pinKnown: false,
      app: null,
      view: {},
      notifications: [],
      threads: [],
      chats: [],
      call: null,
      callLog: [],
      codes: [],
      pushes: [],
      photos: [],
      social: { posts: [], draft: null },
      game: {},
      bank: {},
      mail: [],
      browser: { tabs: [freshTab()], active: 0 },
      settings: { location: true, locationTagging: true, twoStep: false, visibility: 'public' },
      contacts: (product.phone && product.phone.contacts) ? JSON.parse(JSON.stringify(product.phone.contacts)) : []
    },
    desktop: {
      windows: [],
      focus: null,
      z: 10,
      startOpen: false,
      mail: { folders: { inbox: [], sent: [], junk: [], deleted: [] }, folder: 'inbox', open: null },
      files: [],
      browser: { tabs: [freshTab()], active: 0 },
      vault: { setup: false, locked: true, entries: [] },
      // One entry per online account the player looks after (the game, the
      // school, the work account), each with its own security settings.
      account: { active: null, services: {} },
      chat: { channels: [], open: null },
      notes: [],
      game: {},
      extra: {}
    },
    room: {},
    game: {}
  };
  if (product.initialWorld) product.initialWorld(w);
  return w;
}

export class Store {
  constructor(state = freshWorld()) { this.state = state; }

  get() { return this.state; }

  // Mutate through here so every screen knows to redraw.
  update(fn, reason = 'update') {
    fn(this.state);
    bus.emit('world:changed', { reason, state: this.state });
    return this.state;
  }

  snapshot() { return JSON.parse(JSON.stringify(this.state)); }

  restore(snap, reason = 'rewind') {
    this.state = JSON.parse(JSON.stringify(snap));
    bus.emit('world:changed', { reason, state: this.state });
    return this.state;
  }
}

export const store = new Store();
