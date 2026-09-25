import { el, clear } from '../../../engine/core/dom.js';
import { audio } from '../../../engine/core/audio.js';
import { icon } from '../../../engine/ui/icons.js';

// Small shared pieces for the office apps, so twenty windows look and behave
// like one company's software.

// Redraw a node only when what it shows has changed. Returns true when the
// caller should rebuild.
export function changed(node, value) {
  const key = typeof value === 'string' ? value : JSON.stringify(value);
  if (node.dataset.key === key) return false;
  node.dataset.key = key;
  clear(node);
  return true;
}

export function btn(label, onclick, { primary = false, warn = false, ic = null, disabled = false, cls = '' } = {}) {
  return el('button', {
    class: `tb-btn ${primary ? 'primary' : ''} ${warn ? 'warn' : ''} ${cls}`.trim(), type: 'button', disabled: disabled ? '' : null,
    onclick: (ev) => { if (disabled) return; audio.play('click'); onclick(ev); }
  }, [ic ? icon(ic) : null, label].filter(Boolean));
}

// Tabs whose choice lives in the desktop's per app view state.
export function tabs(ctx, key, list, current) {
  return el('nav', { class: 'ox-tabs', role: 'tablist' }, list.map(([id, label, ic]) => el('button', {
    class: `ox-tab ${current === id ? 'is-on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(current === id),
    onclick: () => ctx.setExtra(key, { tab: id })
  }, [ic ? icon(ic) : null, el('span', { text: label })].filter(Boolean))));
}

export function kv(label, value, { warn = false, mono = false } = {}) {
  return el('div', { class: `kv ${warn ? 'is-warn' : ''}` }, [el('span', { text: label }), el('b', { class: mono ? 'mono' : '', text: String(value) })]);
}

export function empty(text) { return el('p', { class: 'app-empty', text }); }

export function badge(text, tone = '') { return el('span', { class: `ox-badge ${tone}`.trim(), text }); }

export const money = (n) => `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export function head(title, sub, right = []) {
  return el('header', { class: 'ox-head' }, [
    el('div', {}, [el('h2', { text: title }), sub ? el('small', { text: sub }) : null].filter(Boolean)),
    el('div', { class: 'ox-head-right' }, right)
  ]);
}

// Update a slice of world.office through the store (so rewinds undo it).
export function office(ctx, fn, reason) { ctx.store.update((s) => fn(s.office), reason); }
