import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { icon } from '../../../ui/icons.js';

// The phone app: recents, contacts and a keypad. Ringing a saved contact is
// the "second channel": the way to check whether a message really came from
// the person it claims to. A scenario can pick the call up and script it; if
// nobody does, it rings out.
export const callsApp = {
  id: 'calls',
  name: 'Phone',
  icon: 'phone',
  colour: 'linear-gradient(160deg,#5be38a,#1f9c55)',
  dock: true,
  badge: (world) => world.phone.callLog.filter((c) => c.state === 'missed' && !c.seen).length,

  mount(ctx) { const node = el('div', { class: 'app app-calls' }); this.update(ctx, node); return node; },

  update(ctx, node) {
    clear(node);
    const tab = ctx.view('calls').tab || 'recents';
    const tabs = el('nav', { class: 'seg' }, [['recents', 'Recents'], ['contacts', 'Contacts'], ['keypad', 'Keypad']].map(([id, label]) => el('button', {
      class: `seg-btn ${tab === id ? 'is-on' : ''}`, type: 'button', onclick: () => {
        ctx.setView('calls', { tab: id });
        if (id === 'recents') ctx.store.update((s) => { s.phone.callLog.forEach((c) => { c.seen = true; }); }, 'calls-seen');
      }
    }, [label])));
    node.append(el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: 'Phone' })]), tabs);
    if (tab === 'contacts') node.append(contacts(ctx));
    else if (tab === 'keypad') node.append(keypad(ctx));
    else node.append(recents(ctx));
  }
};

export function placeCall(ctx, { number, name, contactId }) {
  const call = { id: `out-${Date.now()}`, number, label: name || number, known: !!contactId, state: 'dialing', script: [], voice: {}, outgoing: true, contactId };
  ctx.store.update((s) => { s.phone.call = call; }, 'call-dial');
  bus.emit('call:placed', { number, name, contact: contactId });
  bus.emit('sfx', { name: 'tap' });
  // Nobody picks up unless a scenario connects the call.
  setTimeout(() => {
    const cur = ctx.store.get().phone.call;
    if (cur && cur.id === call.id && cur.state === 'dialing') {
      ctx.store.update((s) => { s.phone.callLog.unshift({ ...call, state: 'no answer' }); s.phone.call = null; }, 'call-noanswer');
      bus.emit('call:noanswer', { number, contact: contactId });
      bus.emit('caption', { speaker: 'Phone', text: `${name || number} did not answer.` });
    }
  }, 5200);
}

function recents(ctx) {
  const log = ctx.world.phone.callLog;
  if (!log.length) return el('p', { class: 'app-empty', text: 'No recent calls.' });
  return el('ul', { class: 'cl-list' }, log.map((c, i) => el('li', { class: `cl-row is-${String(c.state).replace(/\s/g, '-')}` }, [
    el('span', { class: 'cl-icon' }, [icon(c.outgoing ? 'phone' : c.state === 'missed' ? 'phoneOff' : 'phoneIn')]),
    el('span', { class: 'cl-main' }, [el('b', { text: c.label }), el('small', { class: 'mono', text: c.known ? c.number : `${c.number} · not a contact` }), el('small', { class: 'cl-when', text: `${c.state} ${c.at || ''}` })]),
    !c.known && !c.outgoing ? el('button', {
      class: `tool-btn ${c.reported ? '' : 'warn'}`, type: 'button', disabled: c.reported ? '' : null,
      onclick: () => {
        ctx.store.update((s) => { const x = s.phone.callLog[i]; if (x) x.reported = true; }, 'call-report');
        bus.emit('call:reported', { number: c.number, label: c.label, genuine: !!c.genuine });
      }
    }, [icon('flag'), c.reported ? 'Reported' : 'Report']) : null
  ])));
}

function contacts(ctx) {
  const list = ctx.world.phone.contacts || [];
  return el('ul', { class: 'cl-list' }, list.map((c) => el('li', { class: 'cl-row', dataset: { contact: c.id } }, [
    el('span', { class: 'cl-avatar', text: c.name[0] }),
    el('span', { class: 'cl-main' }, [el('b', { text: c.name }), el('small', { class: 'mono', text: c.number }), c.note ? el('small', { text: c.note }) : null]),
    el('button', { class: 'icon-btn call', type: 'button', 'aria-label': `Call ${c.name}`, onclick: () => placeCall(ctx, { number: c.number, name: c.name, contactId: c.id }) }, [icon('phone')])
  ])));
}

function keypad(ctx) {
  const v = ctx.view('calls');
  const digits = v.dial || '';
  const set = (d) => ctx.setView('calls', { dial: d });
  return el('div', { class: 'kp' }, [
    el('div', { class: 'kp-display mono', text: digits || ' ' }),
    el('div', { class: 'ph-pad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0', 'del'].map((d) => el('button', {
      class: 'ph-key', type: 'button', 'aria-label': d === 'del' ? 'Delete' : d,
      onclick: () => set(d === 'del' ? digits.slice(0, -1) : (digits + d).slice(0, 16))
    }, [d === 'del' ? icon('back') : el('b', { text: d })]))),
    el('button', { class: 'kp-call', type: 'button', disabled: digits.length < 3 ? '' : null, 'aria-label': 'Call', onclick: () => {
      const c = (ctx.world.phone.contacts || []).find((x) => x.number.replace(/\s/g, '') === digits.replace(/\s/g, ''));
      placeCall(ctx, { number: digits, name: c ? c.name : null, contactId: c ? c.id : null });
    } }, [icon('phone')])
  ]);
}
