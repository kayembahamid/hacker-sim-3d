import { el } from '../core/dom.js';
import { makeSeedWords } from '../core/rng.js';
import { icon } from './icons.js';

// The title card, laid over the room like RansomLeak's briefing card: who you
// are tonight, what kind of run you want, and the seed. The seed field lives in
// this tab only: nothing typed here is stored or sent anywhere.
export function buildStartScreen({ product, intro, defaultMode, onStart, lastRun, seed }) {
  const modes = product.modes;
  let mode = modes.find((m) => m.id === defaultMode) ? defaultMode : modes[1 % modes.length].id;

  const seedInput = el('input', {
    class: 'st-seed', type: 'text', id: 'seed-input', value: seed || makeSeedWords(),
    maxlength: '24', spellcheck: 'false', autocomplete: 'off', inputmode: 'latin',
    'aria-describedby': 'seed-help'
  });

  const modeButtons = modes.map((m) => el('button', {
    class: `st-mode ${m.id === mode ? 'is-on' : ''}`, type: 'button', role: 'radio',
    'aria-checked': String(m.id === mode), dataset: { mode: m.id },
    onclick: () => {
      mode = m.id;
      root.querySelectorAll('.st-mode').forEach((b) => {
        const on = b.dataset.mode === m.id;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', String(on));
      });
    }
  }, [el('strong', { text: m.label }), el('span', { text: m.desc })]));

  const start = (sound) => {
    const seed = (seedInput.value || makeSeedWords()).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || makeSeedWords();
    onStart({ seed, mode, sound });
  };

  const root = el('div', { class: 'start' }, [
    el('div', { class: 'st-card' }, [
      el('p', { class: 'st-kicker', text: intro ? intro.kicker : product.kicker }),
      el('h1', { class: 'st-title', text: intro ? intro.title : product.title }),
      el('p', { class: 'st-lede', text: intro ? intro.lede : product.lede }),
      el('div', { class: 'st-player' }, [
        el('span', { class: 'st-avatar', text: product.player.initial || product.player.name[0] }),
        el('span', {}, [
          el('b', { text: `You are ${product.player.name}` }),
          el('small', { text: (intro && intro.role) || product.player.bio })
        ])
      ]),
      el('div', { class: 'st-modes', role: 'radiogroup', 'aria-label': product.modeLabel || 'Difficulty' }, modeButtons),
      el('details', { class: 'st-more' }, [
        el('summary', { text: 'Seed and replay' }),
        el('div', { class: 'st-seedrow' }, [
          el('label', { for: 'seed-input', text: 'Seed' }),
          seedInput,
          el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { seedInput.value = makeSeedWords(); } }, [icon('refresh'), 'New'])
        ]),
        el('p', { class: 'st-help', id: 'seed-help', text: product.seedHelp || 'The seed decides which scams turn up, in what order, and which tricks they use. Same seed, same run.' })
      ]),
      lastRun ? el('p', { class: 'st-last' }, [icon('star'), `Last run: ${lastRun.stars} of ${lastRun.maxStars} stars on seed ${lastRun.seed}.`]) : null,
      el('div', { class: 'st-go' }, [
        el('button', { class: 'btn btn-primary st-play', type: 'button', onclick: () => start(true) }, [icon('soundOn'), product.startLabel || 'Start with sound']),
        el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => start(false) }, [icon('soundOff'), 'Start muted'])
      ]),
      el('p', { class: 'st-note', text: product.fictionNote })
    ])
  ]);
  return root;
}
