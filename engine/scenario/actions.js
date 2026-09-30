import { bus } from '../core/bus.js';
import { setClock, advance, format, now } from '../core/clock.js';
import { audio } from '../core/audio.js';
import { speak } from '../core/voice.js';

// The verbs a scenario JSON can use. Content authors get these and nothing
// else, which is what keeps scenarios out of the engine code.
//
// Every action may carry "delayMs": it then runs that long after the actions
// around it. Pending delays are cancelled on a rewind or a new run.

const timers = new Set();
export function cancelTimers() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}
function later(ms, fn) {
  const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
  timers.add(t);
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] === undefined) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const ACTIONS = {
  // ------------------------------------------------------------ clock
  'clock.set': (a) => setClock(a.minutes),
  'clock.advance': (a) => advance(a.minutes || 1),

  // ------------------------------------------------------------ phone
  'sms.deliver': (a, ctx) => {
    const thread = clone(a.thread);
    ctx.store.update((s) => {
      thread.unread = thread.unread ?? 1;
      thread.at = thread.at || format(s.clock.minutes);
      for (const m of thread.messages || []) m.at = m.at || thread.at;
      const i = s.phone.threads.findIndex((t) => t.id === thread.id);
      if (i >= 0) s.phone.threads.splice(i, 1);
      s.phone.threads.unshift(thread);
    }, 'sms-deliver');
    bus.emit('message:arrived', { channel: 'sms', threadId: thread.id, genuine: !!thread.genuine, from: thread.from && thread.from.name });
    if (a.notify !== false && thread.unread) {
      const last = thread.messages[thread.messages.length - 1];
      ACTIONS.notify({ app: 'messages', appName: 'Messages', threadId: thread.id, title: thread.from.name, body: last ? last.text : '', silent: a.silent }, ctx);
    }
  },

  // Add a message to a thread if it exists, or start the thread if it does
  // not: for genuine texts from people who may or may not have texted yet.
  'sms.push': (a, ctx) => {
    const exists = ctx.store.get().phone.threads.find((t) => t.id === a.thread.id);
    if (exists) ACTIONS['sms.append']({ threadId: a.thread.id, message: a.message, notify: a.notify }, ctx);
    else ACTIONS['sms.deliver']({ thread: { ...a.thread, messages: [a.message] }, notify: a.notify }, ctx);
  },

  'sms.append': (a, ctx) => {
    ctx.store.update((s) => {
      const t = s.phone.threads.find((x) => x.id === a.threadId);
      if (!t) return;
      const m = clone(a.message);
      m.at = m.at || format(s.clock.minutes);
      m.dir = m.dir || 'in';
      t.messages.push(m);
      if (m.dir === 'in') t.unread = (t.unread || 0) + 1;
      if (a.replies) t.replies = clone(a.replies);
      const i = s.phone.threads.indexOf(t);
      s.phone.threads.splice(i, 1);
      s.phone.threads.unshift(t);
    }, 'sms-append');
    bus.emit('message:arrived', { channel: 'sms', threadId: a.threadId });
    if (a.notify !== false && (a.message.dir || 'in') === 'in') {
      const t = ctx.store.get().phone.threads.find((x) => x.id === a.threadId);
      ACTIONS.notify({ app: 'messages', appName: 'Messages', threadId: a.threadId, title: t ? t.from.name : 'Messages', body: a.message.text, silent: a.silent }, ctx);
    }
  },

  // Group chats and DMs in the chat app. "chat" is a whole conversation.
  'chat.deliver': (a, ctx) => {
    const chat = clone(a.chat);
    ctx.store.update((s) => {
      chat.unread = chat.unread ?? (chat.messages || []).filter((m) => m.from !== 'me').length;
      for (const m of chat.messages || []) m.at = m.at || format(s.clock.minutes);
      const i = s.phone.chats.findIndex((c) => c.id === chat.id);
      if (i >= 0) s.phone.chats.splice(i, 1);
      s.phone.chats.unshift(chat);
    }, 'chat-deliver');
    bus.emit('message:arrived', { channel: 'chat', chatId: chat.id, genuine: !!chat.genuine });
    const last = (chat.messages || [])[chat.messages.length - 1];
    if (a.notify !== false && last) {
      ACTIONS.notify({ app: 'chat', appName: ctx.product.chatAppName || 'Chat', chatId: chat.id, title: chat.name, body: last.from ? `${last.fromName || last.from}: ${last.text}` : last.text, silent: a.silent }, ctx);
    }
  },

  'chat.append': (a, ctx) => {
    let chat = null;
    ctx.store.update((s) => {
      chat = s.phone.chats.find((c) => c.id === a.chatId);
      if (!chat) return;
      const msgs = [].concat(a.message || a.messages);
      for (const raw of msgs) {
        const m = clone(raw);
        m.at = m.at || format(s.clock.minutes);
        chat.messages.push(m);
        if (m.from !== 'me') chat.unread = (chat.unread || 0) + 1;
      }
      if (a.replies) chat.replies = clone(a.replies);
      const i = s.phone.chats.indexOf(chat);
      s.phone.chats.splice(i, 1);
      s.phone.chats.unshift(chat);
    }, 'chat-append');
    const last = [].concat(a.message || a.messages).pop();
    bus.emit('message:arrived', { channel: 'chat', chatId: a.chatId });
    if (chat && a.notify !== false && last && last.from !== 'me') {
      ACTIONS.notify({ app: 'chat', appName: ctx.product.chatAppName || 'Chat', chatId: a.chatId, title: chat.name, body: `${last.fromName || last.from}: ${last.text}`, silent: a.silent }, ctx);
    }
  },

  notify: (a, ctx) => {
    const n = {
      id: a.id || uid('n'), app: a.app || 'messages', appName: a.appName || 'Messages',
      threadId: a.threadId || null, chatId: a.chatId || null, title: a.title, body: a.body,
      at: format(ctx.store.get().clock.minutes)
    };
    ctx.store.update((s) => { s.phone.notifications.push(n); if (s.phone.notifications.length > 12) s.phone.notifications.shift(); }, 'notify');
    bus.emit('phone:banner', n);
    bus.emit('notification:shown', n);
    if (!a.silent) {
      bus.emit('sfx', { name: 'buzz' });
      bus.emit('room:vibrate', { object: 'phone' });
      bus.emit('device:ping', { device: 'phone', title: n.title, body: n.body, app: n.app });
    }
  },

  // An incoming call. The phone rings until it is answered, declined or
  // missed. The script plays once answered: lines with optional choices.
  'call.incoming': (a, ctx) => {
    const call = {
      id: a.id || uid('call'), number: a.number, label: a.label || a.number, known: !!a.known,
      note: a.note || '', voice: a.voice || {}, script: clone(a.script || []), state: 'ringing',
      genuine: !!a.genuine, at: format(ctx.store.get().clock.minutes)
    };
    ctx.store.update((s) => { s.phone.call = call; }, 'call-in');
    audio.loop('ring', 3.2);
    bus.emit('room:vibrate', { object: 'phone' });
    bus.emit('call:ringing', { id: call.id, number: call.number, label: call.label, genuine: call.genuine });
    bus.emit('device:ping', { device: 'phone', title: `Incoming call`, body: call.label, app: 'calls' });
    const missAfter = a.missAfterMs ?? 30000;
    later(missAfter, () => {
      const cur = ctx.store.get().phone.call;
      if (cur && cur.id === call.id && cur.state === 'ringing') {
        audio.stopLoop('ring');
        ctx.store.update((s) => { s.phone.callLog.unshift({ ...call, state: 'missed' }); s.phone.call = null; }, 'call-missed');
        bus.emit('call:missed', { id: call.id, number: call.number, genuine: call.genuine });
      }
    });
  },

  'call.connect': (a, ctx) => ctx.phone && ctx.phone.connect(a),

  'call.say': (a) => speak(a.text, { speaker: a.speaker, gender: a.gender, tone: a.tone }),

  'call.end': (a, ctx) => {
    audio.stopLoop('ring');
    const cur = ctx.store.get().phone.call;
    if (!cur) return;
    ctx.store.update((s) => { s.phone.callLog.unshift({ ...s.phone.call, state: a.state || 'ended' }); s.phone.call = null; }, 'call-end');
    bus.emit('call:ended', { id: cur.id, by: 'them' });
  },

  // A sign in request on the authenticator: approve or deny, with a number to
  // match on the sign in screen.
  'push.prompt': (a, ctx) => {
    const push = {
      id: a.id || uid('push'), service: a.service, account: a.account, location: a.location,
      device: a.device, number: a.number, choices: a.choices || null, genuine: !!a.genuine,
      state: 'pending', at: format(ctx.store.get().clock.minutes)
    };
    ctx.store.update((s) => { s.phone.pushes.unshift(push); }, 'push');
    ACTIONS.notify({ app: 'authenticator', appName: ctx.product.authAppName || 'Authenticator', title: 'Sign in request', body: `${push.service}: are you trying to sign in? ${push.location || ''}`.trim() }, ctx);
    bus.emit('push:shown', { id: push.id, genuine: push.genuine });
  },

  'code.add': (a, ctx) => {
    ctx.store.update((s) => {
      if (!s.phone.codes.find((c) => c.id === a.id)) s.phone.codes.push({ id: a.id, issuer: a.issuer, account: a.account, seed: a.seed || a.id });
    }, 'code-add');
  },

  'photo.add': (a, ctx) => {
    ctx.store.update((s) => { s.phone.photos.unshift(clone(a.photo)); }, 'photo-add');
  },

  // ---------------------------------------------------------- desktop
  'mail.deliver': (a, ctx) => {
    const mail = clone(a.mail);
    ctx.store.update((s) => {
      mail.id = mail.id || uid('mail');
      mail.unread = mail.unread ?? true;
      mail.at = mail.at || format(s.clock.minutes);
      const folder = mail.folder || 'inbox';
      s.desktop.mail.folders[folder] = s.desktop.mail.folders[folder] || [];
      s.desktop.mail.folders[folder].unshift(mail);
    }, 'mail-deliver');
    bus.emit('mail:arrived', { id: mail.id, genuine: !!mail.genuine, from: mail.from && mail.from.address });
    if (a.notify !== false) {
      bus.emit('desktop:toast', { app: 'mail', title: mail.from.name, body: mail.subject });
      bus.emit('sfx', { name: 'mail' });
      bus.emit('device:ping', { device: 'computer', title: mail.from.name, body: mail.subject, app: 'mail' });
    }
  },

  'files.add': (a, ctx) => {
    ctx.store.update((s) => {
      const f = clone(a.file);
      f.id = f.id || uid('file');
      if (!s.desktop.files.find((x) => x.id === f.id)) s.desktop.files.unshift(f);
    }, 'file-add');
  },

  toast: (a) => bus.emit('desktop:toast', { app: a.app, title: a.title, body: a.body }),

  'desktop.open': (a, ctx) => ctx.desktop && ctx.desktop.open(a.app, a.params || {}),

  // --------------------------------------------------------------- world
  'site.register': (a, ctx) => ctx.sites.alias(a.host, a.siteId, a.extra || {}),
  'flag.set': (a, ctx) => ctx.store.update((s) => { s.flags[a.key] = a.value ?? true; }, 'flag'),
  'world.set': (a, ctx) => ctx.store.update((s) => { setPath(s, a.path, clone(a.value)); }, 'world-set'),
  'world.push': (a, ctx) => ctx.store.update((s) => {
    const arr = getPath(s, a.path);
    if (Array.isArray(arr)) { if (a.front) arr.unshift(clone(a.value)); else arr.push(clone(a.value)); }
  }, 'world-push'),

  'phone.lock': (a, ctx) => ctx.store.update((s) => { s.phone.locked = true; s.phone.app = null; }, 'phone-lock'),
  'phone.revealPin': (a, ctx) => ctx.store.update((s) => { s.phone.pinKnown = true; }, 'pin'),
  'phone.open': (a, ctx) => ctx.store.update((s) => {
    s.phone.app = a.app;
    s.phone.view[a.app] = { ...(s.phone.view[a.app] || {}), ...(a.view || {}) };
  }, 'phone-open'),

  // ---------------------------------------------------------------- room
  // Swap the close up card for an object for the rest of the run (the
  // backpack shows the notebook once The Notebook starts).
  'object.card': (a, ctx) => ctx.store.update((s) => { s.room.cards = s.room.cards || {}; s.room.cards[a.id] = clone(a.card); }, 'object-card'),
  'object.available': (a, ctx) => ctx.interaction && ctx.interaction.setAvailable(a.id, a.available !== false),
  hotspot: (a, ctx) => ctx.hotspots && (a.on === false ? ctx.hotspots.hide(a.id) : ctx.hotspots.show(a.id, { label: a.label })),
  glow: (a, ctx) => ACTIONS.hotspot(a, ctx),
  camera: (a, ctx) => ctx.rig && ctx.rig.flyTo(a.pose || 'overview'),
  vibrate: (a) => bus.emit('room:vibrate', { object: a.object || 'phone' }),
  sfx: (a) => bus.emit('sfx', { name: a.name }),
  'room.banner': (a, ctx) => ctx.shell && ctx.shell.roomBanner({
    title: a.title, body: a.body, icon: a.icon,
    action: a.object ? (a.action || 'Look') : null,
    onAction: a.object ? () => ctx.interaction.activate(a.object) : null
  }),

  // ------------------------------------------------------------- story
  caption: (a) => bus.emit('caption', { speaker: a.speaker, text: a.text, ms: a.ms }),
  speak: (a) => speak(a.text, { speaker: a.speaker, gender: a.gender, tone: a.tone }),
  objective: (a) => bus.emit('objective', { text: a.text }),
  insight: (a) => bus.emit('insight', { text: a.text, title: a.title }),
  beat: (a) => bus.emit('beat', { time: format(now()), text: a.text, tone: a.tone || 'neutral' }),
  card: (a) => bus.emit('overlay:card', a),
  // A decision put to the player as a card: each choice raises its own event
  // (and the card raises choice:made), so a stage rule can score it.
  choice: (a, ctx) => {
    if (!ctx.overlay) return;
    ctx.overlay.showCard({
      kicker: a.kicker, title: a.title, body: a.body, verdict: a.verdict || 'story', noEscape: true,
      image: a.image ? `${import.meta.env.BASE_URL}${a.image}` : null, imageAlt: a.imageAlt, wide: !!a.image,
      choices: (a.choices || []).map((c) => ({ id: c.id, label: c.label, icon: c.icon }))
    }).then((picked) => {
      const c = (a.choices || []).find((x) => x.id === picked);
      bus.emit('choice:made', { id: a.id, choice: picked });
      if (c && c.emit) bus.emit(c.emit, { id: a.id, choice: picked, ...(c.payload || {}) });
      if (c && c.effects) runActions(c.effects, ctx);
    });
  },
  emit: (a) => bus.emit(a.event, a.payload || {}),

  // A to do list in the story panel, ticked by flags.
  checklist: (a) => bus.emit('checklist', { items: a.items }),
  // When every flag in the list is set, fire an event (once per stage entry).
  // required: flags that must all be set; atLeast: how many of `all` in total.
  check: (a, ctx) => {
    const flags = ctx.store.get().flags;
    const need = a.all || [];
    const have = need.filter((f) => flags[f]).length;
    const requiredOk = (a.required || []).every((f) => flags[f]);
    if (requiredOk && (a.atLeast ? have >= a.atLeast : have === need.length)) bus.emit(a.emit, { count: have });
  },

  // --------------------------------------------------------------- flow
  after: (a, ctx) => later(a.ms || 0, () => runActions(a.actions, ctx)),
  if: (a, ctx) => {
    const flags = ctx.store.get().flags;
    const val = a.path ? getPath(ctx.store.get(), a.path) : flags[a.flag];
    const ok = 'equals' in a ? val === a.equals : !!val;
    runActions(ok ? a.then : a.else, ctx);
  }
};

// Products can add actions of their own (a desk phone that rings, a terminal
// that needs its logs), without the engine knowing about them.
export function registerActions(map) {
  for (const [name, fn] of Object.entries(map)) {
    if (ACTIONS[name]) throw new Error(`[actions] ${name} already exists`);
    ACTIONS[name] = fn;
  }
}

export function runAction(action, ctx) {
  const fn = ACTIONS[action.do];
  if (!fn) { console.warn('[scenario] unknown action', action.do); return; }
  try { fn(action, ctx); } catch (err) { console.error('[scenario] action failed', action.do, err); }
}

export function runActions(list, ctx) {
  for (const a of list || []) {
    if (a.delayMs) later(a.delayMs, () => runAction(a, ctx));
    else runAction(a, ctx);
  }
}
