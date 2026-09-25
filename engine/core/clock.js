import { bus } from './bus.js';
import { store } from './store.js';

// Story time, not wall time. Each product sets its own window (the bedroom
// runs 19:00 to 23:30, the office 16:30 to 19:00) and scenarios push the
// clock forward, so the window and the clock stay in step with the plot.
const range = { start: 19 * 60, end: 23 * 60 + 30 };

export function configureClock({ start, end }) {
  range.start = start;
  range.end = end;
}

export function clockRange() { return { ...range }; }

export function format(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function now() { return store.get().clock.minutes; }

export function setClock(minutes) {
  store.update((s) => { s.clock.minutes = minutes; }, 'clock');
  bus.emit('clock:changed', { minutes, label: format(minutes) });
}

export function advance(minutes) { setClock(now() + minutes); }

// 0 at the start of the story window, 1 at the end.
export function nightProgress() {
  const t = (now() - range.start) / Math.max(1, range.end - range.start);
  return Math.min(1, Math.max(0, t));
}
