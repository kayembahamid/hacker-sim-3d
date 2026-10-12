import { el, clear } from '../../engine/core/dom.js';
import { bus } from '../../engine/core/bus.js';
import { audio } from '../../engine/core/audio.js';
import { speak, hush } from '../../engine/core/voice.js';
import { format } from '../../engine/core/clock.js';
import { icon } from '../../engine/ui/icons.js';

// The desk phone on Sam's desk: internal extensions, and outside lines on 9.
// It is the independent channel the call back procedure depends on, so every
// call it places is logged with the number actually dialled. Scripts come from
// the scenario (world.office.deskphone.lines, for the moment) or the product's
// standing directory (IT, security, Dan...). Everything lives in the world
// store, so a rewind puts the phone back too.
//
// Events: deskphone:dialed { number, raw, external }, deskphone:connected
// { number, name, genuine, verifies }, deskphone:choice { number, choice },
// deskphone:ended { number, by }, deskphone:ringing, deskphone:answered,
// deskphone:missed.
const digits = (s) => String(s || '').replace(/[^0-9]/g, '');

export function normalise(raw) {
  const d = digits(raw);
  // 9 for an outside line; an internal extension is four digits.
  if (d.length > 4 && d.startsWith('9')) return { number: d.slice(1), external: true };
  return { number: d, external: d.length > 4 };
}

export class DeskPhone {
  constructor({ screen, store, product }) {
    this.screen = screen;
    this.store = store;
    this.product = product;
    this.timers = [];
  }

  get state() { return this.store.get().office.deskphone; }

  update(fn, reason) { this.store.update((s) => fn(s.office.deskphone), reason); }

  mount() {
    const root = this.screen.root;
    root.classList.add('deskphone-os');
    this.lcd = el('div', { class: 'dp-lcd' });
    this.body = el('div', { class: 'dp-body' });
    root.append(this.lcd, this.body);
    bus.on('world:changed', () => this.render());
    bus.on('clock:changed', () => this.renderLcd());
    bus.on('scenario:rewind', () => { hush(); audio.stopLoop('deskring'); });
    this.render();
    return this;
  }

  // --------------------------------------------------------------- render
  render() {
    if (!this.store.get().office) { this.lcd.replaceChildren(); this.body.replaceChildren(); this.key = null; return; }
    const s = this.state;
    const key = JSON.stringify([s.call && { ...s.call, script: undefined }, s.dial, s.view, s.log.length]);
    if (key === this.key) return;
    this.key = key;
    this.renderLcd();
    clear(this.body);
    this.screen.root.classList.toggle('is-ringing', !!(s.call && s.call.state === 'ringing'));
    if (s.call) this.body.append(this.callView(s.call));
    else if (s.view === 'directory') this.body.append(this.directoryView());
    else if (s.view === 'recent') this.body.append(this.recentView());
    else this.body.append(this.keypadView());
  }

  renderLcd() {
    if (!this.store.get().office) return;
    const s = this.state;
    const c = s.call;
    const clock = format(this.store.get().clock.minutes);
    clear(this.lcd);
    this.lcd.append(
      el('div', { class: 'dp-lcd-top' }, [el('span', { text: `Ext ${this.product.deskphone.extension}` }), el('span', { class: 'mono', text: clock })]),
      el('div', { class: 'dp-lcd-main mono', text: c ? (c.label || c.number) : (s.dial || 'Ready') }),
      el('div', { class: 'dp-lcd-sub', text: c ? ({ dialing: 'Calling…', ringing: 'Incoming call', active: 'Connected' }[c.state] || '') + (c.external ? ' · outside line' : '') : (s.dial ? (normalise(s.dial).external ? 'Outside line' : 'Extension') : 'Dial 9 for an outside line') })
    );
  }

  tabs(active) {
    const tab = (id, label, ic) => el('button', {
      class: `dp-tab ${active === id ? 'is-on' : ''}`, type: 'button',
      onclick: () => this.update((d) => { d.view = id; }, 'dp-view')
    }, [icon(ic), el('span', { text: label })]);
    return el('div', { class: 'dp-tabs' }, [tab('keypad', 'Keypad', 'deskphone'), tab('directory', 'Directory', 'users'), tab('recent', 'Recent', 'clock')]);
  }

  keypadView() {
    const s = this.state;
    const press = (k) => { audio.play('tap'); this.update((d) => { d.dial = `${d.dial || ''}${k}`.slice(0, 16); }, 'dp-key'); };
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    return el('div', { class: 'dp-keypad-wrap' }, [
      this.tabs('keypad'),
      el('div', { class: 'dp-keypad' }, keys.map((k) => el('button', { class: 'dp-key', type: 'button', 'aria-label': k, onclick: () => press(k) }, [el('b', { text: k })]))),
      el('div', { class: 'dp-actions' }, [
        el('button', { class: 'dp-btn', type: 'button', 'aria-label': 'Delete', onclick: () => this.update((d) => { d.dial = (d.dial || '').slice(0, -1); }, 'dp-del') }, [icon('back')]),
        el('button', { class: 'dp-btn dp-call', type: 'button', disabled: !s.dial ? '' : null, onclick: () => this.call(s.dial) }, [icon('phone'), el('span', { text: 'Call' })])
      ])
    ]);
  }

  directoryView() {
    return el('div', { class: 'dp-list-wrap' }, [
      this.tabs('directory'),
      el('ul', { class: 'dp-list' }, this.product.deskphone.directory.map((e) => el('li', {}, [
        el('button', { class: 'dp-row', type: 'button', onclick: () => this.call(e.number, e.name) }, [
          el('span', { class: 'dp-row-main' }, [el('b', { text: e.name }), el('small', { text: e.note || '' })]),
          el('span', { class: 'dp-row-num mono', text: e.number })
        ])
      ])))
    ]);
  }

  recentView() {
    const log = this.state.log;
    return el('div', { class: 'dp-list-wrap' }, [
      this.tabs('recent'),
      log.length ? el('ul', { class: 'dp-list' }, log.slice(0, 8).map((c) => el('li', {}, [
        el('button', { class: 'dp-row', type: 'button', onclick: () => this.call(c.outgoing ? c.raw || c.number : c.number, c.label) }, [
          el('span', { class: 'dp-row-main' }, [el('b', { text: c.label || c.number }), el('small', { text: `${c.outgoing ? 'Out' : 'In'} · ${c.result || ''} · ${c.at}` })]),
          el('span', { class: 'dp-row-num mono', text: c.number })
        ])
      ]))) : el('p', { class: 'dp-empty', text: 'No calls yet.' })
    ]);
  }

  callView(c) {
    const step = c.script && c.script[c.step];
    const choices = c.state === 'active' && step && step.choices ? step.choices : null;
    return el('div', { class: `dp-call-view is-${c.state}` }, [
      el('div', { class: 'dp-transcript' }, (c.said || []).slice(-3).map((l) => el('p', { class: `dp-line ${l.who === 'me' ? 'is-me' : ''}` }, [el('b', { text: l.who === 'me' ? 'You' : (c.label || 'Caller') }), ` ${l.text}`]))),
      choices ? el('div', { class: 'dp-choices' }, choices.map((ch) => el('button', { class: 'dp-choice', type: 'button', dataset: { choice: ch.id || '' }, onclick: () => this.choose(ch) }, [ch.label]))) : null,
      el('div', { class: 'dp-actions' }, c.state === 'ringing' ? [
        el('button', { class: 'dp-btn dp-end', type: 'button', onclick: () => this.hangUp('declined') }, [icon('phoneOff'), el('span', { text: 'Decline' })]),
        el('button', { class: 'dp-btn dp-call', type: 'button', onclick: () => this.answer() }, [icon('phone'), el('span', { text: 'Answer' })])
      ] : [
        el('button', { class: 'dp-btn dp-end', type: 'button', onclick: () => this.hangUp('me') }, [icon('phoneOff'), el('span', { text: 'Hang up' })])
      ])
    ]);
  }

  // ---------------------------------------------------------------- calls
  lineFor(number) {
    const scenario = (this.state.lines || {})[number];
    if (scenario) return scenario;
    const standing = this.product.deskphone.lines[number];
    return standing || null;
  }

  later(ms, fn) { const t = setTimeout(fn, ms); this.timers.push(t); return t; }

  call(raw, name) {
    if (!raw || this.state.call) return;
    const { number, external } = normalise(raw);
    const line = this.lineFor(number);
    const entry = this.product.deskphone.directory.find((e) => e.number === number);
    const call = {
      id: `dp-${Date.now()}`, number, raw: digits(raw), external, outgoing: true,
      label: (line && line.name) || name || (entry && entry.name) || (external ? `0${number.replace(/^0/, '')}` : number),
      genuine: line ? line.genuine !== false : true, verifies: line && line.verifies, voice: (line && line.voice) || {},
      script: line ? JSON.parse(JSON.stringify(line.script || [])) : [], step: 0, said: [], state: 'dialing', at: format(this.store.get().clock.minutes)
    };
    this.update((d) => { d.call = call; d.dial = ''; }, 'dp-dial');
    audio.play('tap');
    bus.emit('deskphone:dialed', { number, raw: call.raw, external, known: !!line });
    const id = call.id;
    if (!line) {
      this.later(4200, () => {
        if (!this.state.call || this.state.call.id !== id) return;
        const text = external ? `${call.label} did not answer.` : 'The extension you dialled is not recognised.';
        bus.emit('caption', { speaker: 'Desk phone', text });
        this.finish('no answer');
      });
      return;
    }
    this.later(line.pickupMs ?? 2200, () => {
      if (!this.state.call || this.state.call.id !== id) return;
      this.update((d) => { d.call.state = 'active'; }, 'dp-connect');
      bus.emit('deskphone:connected', { number, name: call.label, genuine: call.genuine, verifies: call.verifies || null });
      this.playStep();
    });
  }

  // A call coming in to the desk phone (registered as the deskphone.ring action).
  ring(def) {
    if (this.state.call) return;
    const call = {
      id: def.id || `dp-in-${Date.now()}`, number: digits(def.number), label: def.label || def.number, outgoing: false,
      external: digits(def.number).length > 4, genuine: def.genuine !== false, voice: def.voice || {}, verifies: def.verifies,
      script: JSON.parse(JSON.stringify(def.script || [])), step: 0, said: [], state: 'ringing', at: format(this.store.get().clock.minutes)
    };
    this.update((d) => { d.call = call; }, 'dp-ring');
    audio.loop('deskring', 2.6);
    bus.emit('room:vibrate', { object: 'deskphone' });
    bus.emit('deskphone:ringing', { id: call.id, number: call.number, label: call.label, genuine: call.genuine });
    this.later(def.missAfterMs ?? 25000, () => {
      if (this.state.call && this.state.call.id === call.id && this.state.call.state === 'ringing') {
        audio.stopLoop('deskring');
        bus.emit('deskphone:missed', { number: call.number, genuine: call.genuine });
        this.finish('missed');
      }
    });
  }

  answer() {
    const c = this.state.call;
    if (!c || c.state !== 'ringing') return;
    audio.stopLoop('deskring');
    this.update((d) => { d.call.state = 'active'; }, 'dp-answer');
    bus.emit('deskphone:answered', { number: c.number, label: c.label, genuine: c.genuine });
    this.playStep();
  }

  async playStep() {
    const c = this.state.call;
    if (!c || c.state !== 'active') return;
    const step = c.script[c.step];
    if (!step) { this.finish('ended', 'them'); return; }
    if (step.say) {
      this.update((d) => { d.call.said = [...(d.call.said || []), { who: 'them', text: step.say }]; }, 'dp-say');
      await speak(step.say, { speaker: c.label, gender: c.voice.gender, tone: c.voice.tone });
    }
    const cur = this.state.call;
    if (!cur || cur.id !== c.id || cur.state !== 'active') return;
    if (step.choices) { this.render(); return; }
    if (step.end) { this.finish('ended', 'them'); return; }
    this.update((d) => { d.call.step += 1; }, 'dp-next');
    this.playStep();
  }

  choose(ch) {
    const c = this.state.call;
    if (!c) return;
    this.update((d) => {
      d.call.said = [...(d.call.said || []), { who: 'me', text: ch.label }];
      const next = ch.goto !== undefined ? d.call.script.findIndex((x) => x.id === ch.goto) : d.call.step + 1;
      d.call.step = next >= 0 ? next : d.call.step + 1;
    }, 'dp-choice');
    bus.emit('deskphone:choice', { number: c.number, choice: ch.id, genuine: c.genuine, verifies: c.verifies || null });
    if (ch.emit) bus.emit(ch.emit, { number: c.number, genuine: c.genuine });
    if (ch.hangUp) { this.hangUp('me'); return; }
    this.playStep();
  }

  hangUp(by = 'me') {
    audio.stopLoop('deskring');
    hush();
    if (by === 'declined') bus.emit('deskphone:declined', { number: this.state.call && this.state.call.number });
    this.finish(by === 'declined' ? 'declined' : 'ended', by);
  }

  finish(result, by = 'me') {
    const c = this.state.call;
    if (!c) return;
    this.update((d) => { d.log.unshift({ number: c.number, raw: c.raw, label: c.label, outgoing: c.outgoing, result, at: c.at }); d.call = null; }, 'dp-end');
    bus.emit('deskphone:ended', { number: c.number, by, result, genuine: c.genuine, verifies: c.verifies || null });
  }
}
