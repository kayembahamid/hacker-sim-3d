import { bus } from './bus.js';
import { audio } from './audio.js';

// Phone calls talk, using the browser's own speech (speechSynthesis), and
// every line is also captioned, always. If a device has no voices of its
// own, or sound is off, the captions carry the call on their own, paced for
// reading.
//
// Voices are described, not named: { gender: 'male' | 'female', tone: 'calm'
// | 'pushy' | 'warm' }. Whatever English voices the device has are matched to
// that as well as they can be.

let voices = [];
function refresh() { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; }
if (typeof window !== 'undefined' && window.speechSynthesis) {
  refresh();
  window.speechSynthesis.onvoiceschanged = refresh;
}

const FEMALE = /(female|samantha|karen|moira|tessa|serena|victoria|fiona|susan|zira|hazel|libby|sonia|jenny|aria|kate|allison|ava)/i;
const MALE = /(male|daniel|alex|fred|oliver|arthur|george|ryan|thomas|david|mark|guy|james|tom|aaron)/i;

// Only voices that run on the device. Some browsers also offer online voices,
// which send the text to a speech service; the game makes no third party
// requests, so those are never used, and captions carry the call instead.
function pickVoice(gender) {
  const local = voices.filter((v) => v.localService);
  const english = local.filter((v) => /^en/i.test(v.lang));
  const pool = english.length ? english : local;
  const want = gender === 'female' ? FEMALE : gender === 'male' ? MALE : null;
  return (want && pool.find((v) => want.test(v.name))) || pool[0] || null;
}

export function speak(line, { speaker, gender, tone = 'calm', rate } = {}) {
  const text = typeof line === 'string' ? line : line.text;
  bus.emit('caption', { speaker, text });
  const readTime = Math.min(9000, 1400 + text.length * 55);
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const v = synth ? pickVoice(gender) : null;
    // No on device voice: the browser's default might be an online one, so
    // the captions carry the line on their own.
    if (!synth || !v || audio.muted || !audio.started) { setTimeout(resolve, readTime); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = v;
    u.rate = rate || (tone === 'pushy' ? 1.12 : tone === 'warm' ? 0.95 : 1.0);
    u.pitch = gender === 'female' ? 1.1 : 0.9;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    // Some browsers never fire onend; never let a call hang on that.
    setTimeout(finish, readTime + 4000);
    synth.speak(u);
  });
}

export function hush() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
