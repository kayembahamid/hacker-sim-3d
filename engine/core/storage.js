// localStorage only, always wrapped. No accounts, no network, no personal
// data: text size, sound, difficulty, and the scores of finished runs. A
// private window or blocked storage just means nothing is remembered.
let PREFIX = 'sim3d.';

export function configureStorage(prefix) { PREFIX = prefix.endsWith('.') ? prefix : `${prefix}.`; }

export function save(key, value) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

export function load(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) { return fallback; }
}

export function remove(key) {
  try { localStorage.removeItem(PREFIX + key); } catch (e) { /* storage blocked */ }
}
