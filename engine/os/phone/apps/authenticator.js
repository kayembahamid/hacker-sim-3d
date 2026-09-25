import { el, clear } from '../../../core/dom.js';
import { bus } from '../../../core/bus.js';
import { icon } from '../../../ui/icons.js';

// The authenticator: 6 digit codes that change every 30 seconds, and the sign
// in requests that arrive as prompts. The codes are made up (a hash of the
// account and the half minute), they only need to behave like the real thing.
export function totp(seed, t = Date.now()) {
  const step = Math.floor(t / 30000);
  let h = 2166136261;
  const s = `${seed}:${step}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return String(h % 1000000).padStart(6, '0');
}

export function makeAuthenticatorApp({ name = 'Codes', colour = 'linear-gradient(160deg,#39a0c8,#1d5f86)' } = {}) {
  let ticker = null;
  const app = {
    id: 'authenticator', name, icon: 'shield', colour,
    badge: (world) => world.phone.pushes.filter((p) => p.state === 'pending').length,
    mount(ctx) {
      const node = el('div', { class: 'app app-auth' });
      app.update(ctx, node);
      bus.emit('authenticator:viewed', {});
      clearInterval(ticker);
      ticker = setInterval(() => { if (node.isConnected) app.update(ctx.os.ctx(), node); }, 1000);
      return node;
    },
    update(ctx, node) {
      clear(node);
      const left = 30 - Math.floor((Date.now() / 1000) % 30);
      const codes = ctx.world.phone.codes;
      node.append(
        el('header', { class: 'app-head' }, [el('h1', { class: 'app-title', text: name })]),
        codes.length ? el('ul', { class: 'au-list' }, codes.map((c) => el('li', { class: 'au-row' }, [
          el('span', { class: 'au-main' }, [el('b', { text: c.issuer }), el('small', { text: c.account })]),
          el('span', { class: 'au-code mono', text: `${totp(c.seed).slice(0, 3)} ${totp(c.seed).slice(3)}` }),
          el('span', { class: 'au-timer', style: { '--left': String(left / 30) }, 'aria-label': `${left} seconds left` }, [el('small', { text: String(left) })])
        ]))) : el('p', { class: 'app-empty', text: 'No accounts added yet.' }),
        el('h3', { class: 'au-section', text: 'Sign in requests' }),
        ctx.world.phone.pushes.length ? el('ul', { class: 'au-pushes' }, ctx.world.phone.pushes.map((p) => el('li', { class: `au-push is-${p.state}` }, [
          icon(p.state === 'approved' ? 'check' : p.state === 'denied' ? 'close' : 'alert'),
          el('span', {}, [el('b', { text: `${p.service} · ${p.state}` }), el('small', { text: `${p.location || 'Unknown place'} · ${p.at}` })])
        ]))) : el('p', { class: 'app-empty', text: 'None.' })
      );
    }
  };
  return app;
}
