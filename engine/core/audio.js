import { bus } from './bus.js';
import { load, save } from './storage.js';

// Every sound is made live with the Web Audio API: no audio files to
// download, nothing to license. Nothing plays before the first click (the
// browser insists, and a sim that shouts at a kid on page load is rude), and
// the mute choice is remembered on this device only.
class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.started = false;
    this.loops = new Map();
    this.tone = null;
  }

  start() {
    if (this.started) return;
    this.muted = load('muted', false);
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this.roomTone();
      bus.emit('audio:muted', { muted: this.muted });
    } catch (e) {
      this.started = false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    save('muted', muted);
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    if (muted && window.speechSynthesis) window.speechSynthesis.cancel();
    bus.emit('audio:muted', { muted });
  }

  toggle() { this.setMuted(!this.muted); return this.muted; }

  // A low, soft hum so the room never sits in dead silence.
  roomTone() {
    const c = this.ctx;
    const buffer = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 2.2;
    }
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = c.createGain();
    gain.gain.value = 0.03;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.tone = gain;
  }

  env(gain, t, peak, attack, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  osc(type, freq, t, dur, peak = 0.2, attack = 0.01) {
    const c = this.ctx;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    this.env(g, t, peak, attack, dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
    return o;
  }

  noise(t, dur, { type = 'bandpass', freq = 1000, q = 1, peak = 0.3, attack = 0.005 } = {}) {
    const c = this.ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * (dur + attack)));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, peak, attack, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + attack + dur + 0.05);
  }

  play(name) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime + 0.01;
    const fx = SOUNDS[name];
    if (fx) fx(this, t);
  }

  // Sounds that repeat until something stops them: a ringing phone.
  loop(name, every = 3.2) {
    this.stopLoop(name);
    this.play(name);
    const id = setInterval(() => this.play(name), every * 1000);
    this.loops.set(name, id);
    return () => this.stopLoop(name);
  }

  stopLoop(name) {
    const id = this.loops.get(name);
    if (id) clearInterval(id);
    this.loops.delete(name);
  }
}

const SOUNDS = {
  // Phone buzzing on a wooden desk: two short rattles.
  buzz(a, t) {
    for (const s of [0, 0.42]) {
      a.noise(t + s, 0.26, { type: 'lowpass', freq: 160, peak: 0.55 });
      a.osc('square', 58, t + s, 0.26, 0.05);
    }
  },
  notify(a, t) { a.osc('sine', 880, t, 0.16, 0.18); a.osc('sine', 1320, t + 0.09, 0.22, 0.12); },
  message(a, t) { a.osc('sine', 1046, t, 0.1, 0.16); a.osc('sine', 1568, t + 0.07, 0.16, 0.1); },
  mail(a, t) { a.osc('triangle', 660, t, 0.18, 0.14); a.osc('triangle', 990, t + 0.12, 0.25, 0.1); },
  tap(a, t) { a.osc('square', 1500, t, 0.03, 0.03, 0.002); },
  type(a, t) { a.noise(t, 0.03, { freq: 3200, q: 2, peak: 0.12, attack: 0.002 }); },
  keys(a, t) { for (let i = 0; i < 6; i++) a.noise(t + i * 0.07 + Math.random() * 0.03, 0.03, { freq: 2600 + Math.random() * 1400, q: 2, peak: 0.1, attack: 0.002 }); },
  click(a, t) { a.noise(t, 0.02, { freq: 4000, q: 1, peak: 0.12, attack: 0.001 }); },
  door(a, t) { a.noise(t, 0.35, { type: 'lowpass', freq: 400, peak: 0.35 }); a.osc('sine', 110, t + 0.25, 0.3, 0.2); },
  ring(a, t) {
    for (const s of [0, 0.5]) {
      a.osc('sine', 740, t + s, 0.32, 0.14);
      a.osc('sine', 932, t + s, 0.32, 0.1);
    }
  },
  deskRing(a, t) { for (const s of [0, 0.36]) { a.osc('square', 440, t + s, 0.28, 0.05); a.osc('square', 480, t + s, 0.28, 0.05); } },
  // An office desk phone: a soft electronic trill, twice.
  deskring(a, t) { for (let i = 0; i < 12; i++) a.osc('sine', i % 2 ? 1180 : 940, t + i * 0.045 + (i >= 6 ? 0.35 : 0), 0.045, 0.09, 0.003); },
  intercom(a, t) { a.osc('triangle', 587, t, 0.35, 0.16); a.osc('triangle', 466, t + 0.38, 0.45, 0.16); },
  unlock(a, t) { a.osc('sine', 523, t, 0.08, 0.12); a.osc('sine', 784, t + 0.08, 0.14, 0.12); },
  error(a, t) { a.osc('square', 196, t, 0.18, 0.06); a.osc('square', 147, t + 0.16, 0.24, 0.06); },
  printer(a, t) { for (let i = 0; i < 8; i++) a.noise(t + i * 0.22, 0.18, { freq: 900 + (i % 2) * 300, q: 3, peak: 0.12 }); },
  shredder(a, t) { a.noise(t, 1.6, { type: 'bandpass', freq: 240, q: 0.6, peak: 0.3, attack: 0.05 }); a.osc('sawtooth', 72, t, 1.5, 0.05, 0.05); },
  shutter(a, t) { a.noise(t, 0.05, { freq: 5000, q: 1, peak: 0.2, attack: 0.001 }); a.noise(t + 0.09, 0.06, { freq: 3000, q: 1, peak: 0.15, attack: 0.001 }); },
  whoosh(a, t) { a.noise(t, 0.45, { type: 'bandpass', freq: 700, q: 0.7, peak: 0.06, attack: 0.18 }); },
  good(a, t) { [523, 659, 784].forEach((f, i) => a.osc('sine', f, t + i * 0.08, 0.3, 0.12)); },
  bad(a, t) { a.osc('triangle', 220, t, 0.35, 0.14); a.osc('triangle', 165, t + 0.2, 0.45, 0.14); },
  reveal(a, t) { [392, 523, 659, 784, 1046].forEach((f, i) => a.osc('sine', f, t + i * 0.07, 0.4, 0.09)); },
  alarm(a, t) { for (let i = 0; i < 4; i++) a.osc('sawtooth', i % 2 ? 620 : 880, t + i * 0.18, 0.16, 0.05); }
};

export const audio = new Audio();
bus.on('sfx', ({ name }) => audio.play(name));
