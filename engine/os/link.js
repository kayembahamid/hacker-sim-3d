import { el, onLongPress } from '../core/dom.js';
import { bus } from '../core/bus.js';

// Every link in the game is a real link. Hovering shows the true destination in
// the status bar, and a long press or the Details button does the same for
// touch and keyboard players. Nothing is hover only.
export function statusBar() {
  const node = el('div', { class: 'status-bar', role: 'status', 'aria-live': 'polite' });
  node.show = (text) => { node.textContent = text; node.classList.add('is-on'); };
  node.hide = () => { node.classList.remove('is-on'); };
  return node;
}

export function makeLink({ href, text, source, bar, onOpen, className = '' }) {
  const a = el('a', {
    class: `link ${className}`,
    href,
    'data-href': href,
    text: text ?? href,
    onclick: (ev) => { ev.preventDefault(); reveal(); if (onOpen) onOpen(href); }
  });

  const reveal = () => {
    if (bar) bar.show(href);
    bus.emit('link:hovered', { href, text: text ?? href, source });
  };

  a.addEventListener('pointerenter', reveal);
  a.addEventListener('focus', reveal);
  a.addEventListener('pointerleave', () => bar && bar.hide());
  a.addEventListener('blur', () => bar && bar.hide());
  onLongPress(a, reveal);
  return a;
}

// The non hover route to the same clue.
export function detailsButton({ label = 'Details', onClick }) {
  return el('button', { class: 'btn btn-ghost btn-details', type: 'button', text: label, onclick: onClick });
}
