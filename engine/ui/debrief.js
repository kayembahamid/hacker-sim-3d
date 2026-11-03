import { el } from '../core/dom.js';
import { icon } from './icons.js';
import { bus } from '../core/bus.js';

// The end screen: the run replayed as a timeline, what happened at each
// decision and what a careful person would have done, stars per scenario, and
// a link to the matching comic episode (Netizen) or Hacker's Notes article
// (office).
function playedFor(seconds) {
  if (seconds < 90) return `${seconds} seconds`;
  const mins = Math.round(seconds / 60);
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

function stars(n, max = 3) {
  return el('span', { class: 'db-stars', role: 'img', 'aria-label': `${n} of ${max} stars` },
    Array.from({ length: max }, (_, i) => icon('star', i < n ? 'is-on' : 'is-off')));
}

const VERDICT_ICON = { safe: 'check', careful: 'check', neutral: 'info', risky: 'warning', unsafe: 'warning' };
const FEEDBACK_URL = 'https://forms.gle/LzeAYGEg8NerX5SW7';

export function buildDebrief({ product, log, score, seed, mode, links = {}, onReplay, onNewRun, onExport }) {
  const totals = score.total();
  const list = score.list();
  const good = list.flatMap((s) => s.events.filter((e) => e.verdict === 'safe' || e.verdict === 'careful'));
  const bad = list.flatMap((s) => s.events.filter((e) => e.verdict === 'risky' || e.verdict === 'unsafe'));

  const root = el('div', { class: 'debrief' });
  root.append(el('header', { class: 'db-head' }, [
    el('p', { class: 'db-kicker', text: product.debriefKicker || 'Debrief' }),
    el('h1', { text: product.debriefTitle || 'The evening, replayed' }),
    el('div', { class: 'db-summary' }, [
      el('div', { class: 'db-big' }, [stars(Math.round((totals.stars / Math.max(1, totals.maxStars)) * 3)), el('span', { text: `${totals.stars} of ${totals.maxStars} stars` })]),
      el('div', { class: 'db-stat' }, [el('b', { text: String(totals.points) }), el('span', { text: 'points' })]),
      el('div', { class: 'db-stat' }, [el('b', { text: playedFor(log.elapsedSeconds()) }), el('span', { text: 'played' })]),
      el('div', { class: 'db-stat' }, [el('b', { text: String(good.length) }), el('span', { text: 'careful moves' })]),
      el('div', { class: 'db-stat' }, [el('b', { text: String(bad.length) }), el('span', { text: 'risky moves' })])
    ]),
    el('p', { class: 'db-seed' }, ['Seed ', el('code', { text: seed }), ` · ${mode}. The same seed replays the same run.`])
  ]));

  const cards = el('div', { class: 'db-cards' });
  for (const s of list) {
    const link = links[s.id];
    const moments = el('ol', { class: 'db-moments' }, s.events.map((e) => el('li', { class: `db-moment db-${e.verdict}` }, [
      el('div', { class: 'db-moment-head' }, [
        icon(VERDICT_ICON[e.verdict] || 'info'),
        el('strong', { text: e.label }),
        el('span', { class: 'db-points', text: `${e.points > 0 ? '+' : ''}${e.points}` })
      ]),
      e.detail ? el('p', { text: e.detail }) : null,
      e.ideal ? el('p', { class: 'db-ideal' }, [el('b', { text: 'A careful person ' }), e.ideal]) : null
    ])));
    const meta = [`${s.points} of ${s.max} points`];
    if (s.rewinds) meta.push(`rewound ${s.rewinds} time${s.rewinds > 1 ? 's' : ''}`);
    if (s.overReports) meta.push(`reported ${s.overReports} genuine message${s.overReports > 1 ? 's' : ''}`);
    cards.append(el('section', { class: 'db-card' }, [
      el('div', { class: 'db-card-head' }, [
        el('div', {}, [el('small', { text: s.kind || '' }), el('h2', { text: s.title })]),
        stars(s.stars)
      ]),
      el('p', { class: 'db-meta', text: meta.join(', ') }),
      s.events.length ? moments : el('p', { class: 'db-empty', text: 'Nothing was decided here.' }),
      link ? el('a', { class: 'db-link', href: link.url, target: '_blank', rel: 'noopener' }, [icon('external'), link.label]) : null
    ]));
  }
  root.append(el('h2', { class: 'db-section', text: 'Scenario by scenario' }), cards);

  root.append(el('section', { class: 'db-timeline-wrap' }, [
    el('h2', { class: 'db-section', text: product.timelineTitle || 'Timeline' }),
    el('ol', { class: 'db-timeline' }, log.entries.filter((e) => e.kind !== 'trace').map((e) => el('li', { class: `db-tl db-${e.verdict || 'neutral'}` }, [
      el('span', { class: 'db-tl-time', text: e.storyTime }),
      el('span', { class: 'db-tl-label', text: e.label }),
      e.points ? el('span', { class: 'db-tl-points', text: `${e.points > 0 ? '+' : ''}${e.points}` }) : null
    ])))
  ]));

  if (product.workplaceActions || product.workplaceFallback) {
    root.append(el('section', { class: 'db-workplace', 'aria-labelledby': 'db-workplace-title' }, [
      el('h2', { id: 'db-workplace-title', class: 'db-section', text: 'What to do at work' }),
      ...list.map((scenario) => el('div', { class: 'db-card', dataset: { workplaceScenario: scenario.id } }, [
        el('h3', { text: scenario.title }),
        el('p', { text: product.workplaceActions?.[scenario.id] || product.workplaceFallback })
      ]))
    ]));
  }

  root.append(el('div', { class: 'db-buttons' }, [
    el('button', { class: 'btn btn-primary', type: 'button', onclick: () => onReplay && onReplay() }, [icon('refresh'), 'Replay this seed']),
    el('button', { class: 'btn', type: 'button', onclick: () => onNewRun && onNewRun() }, [icon('play'), product.newRunLabel || 'New run']),
    onExport ? el('button', { class: 'btn btn-ghost', type: 'button', onclick: () => onExport() }, [icon('download'), 'Export my result']) : null
  ]));

  root.append(el('p', { class: 'db-feedback' }, [
    'Used this with your team or class? ',
    el('a', { href: FEEDBACK_URL, target: '_blank', rel: 'noopener', text: 'Tell me how it went.' })
  ]));

  bus.emit('debrief:shown', { stars: totals.stars, points: totals.points, seed });
  return root;
}
