import { el, clear } from '../core/dom.js';
import { bus } from '../core/bus.js';

// Captions are always on. Anything spoken in the game, by a caller, by Mum on
// the landing, by the page itself, is also written here.
export function mountCaptions(node) {
  let timer = null;
  bus.on('caption', ({ speaker, text, ms }) => {
    clearTimeout(timer);
    clear(node);
    node.append(
      speaker ? el('span', { class: 'cap-who', text: speaker }) : null,
      el('span', { class: 'cap-text', text })
    );
    node.classList.add('is-on');
    const dwell = ms ?? Math.min(9000, 2600 + String(text).length * 45);
    timer = setTimeout(() => node.classList.remove('is-on'), dwell);
  });
  return node;
}
