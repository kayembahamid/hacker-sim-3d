// Scoring rewards what a careful person does, and takes points off for
// treating every genuine message as a scam. Judgement, not paranoia.
export function starsFor(points, max) {
  if (max <= 0) return 0;
  const ratio = points / max;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 2;
  if (ratio >= 0.2) return 1;
  return 0;
}

export class Scoreboard {
  constructor() { this.scenarios = new Map(); }

  ensure(id, title, max, kind) {
    if (!this.scenarios.has(id)) {
      this.scenarios.set(id, { id, title, kind, points: 0, max, events: [], rewinds: 0, overReports: 0 });
    }
    return this.scenarios.get(id);
  }

  award(id, { points = 0, label, verdict = 'neutral', detail, ideal }) {
    const s = this.scenarios.get(id);
    if (!s) return;
    s.points += points;
    s.events.push({ points, label, verdict, detail, ideal });
  }

  markRewind(id) { const s = this.scenarios.get(id); if (s) s.rewinds += 1; }
  markOverReport(id) { const s = this.scenarios.get(id); if (s) s.overReports += 1; }

  stars(id) {
    const s = this.scenarios.get(id);
    return s ? starsFor(s.points, s.max) : 0;
  }

  total() {
    let points = 0; let max = 0; let stars = 0;
    for (const s of this.scenarios.values()) { points += s.points; max += s.max; stars += this.stars(s.id); }
    return { points, max, stars, maxStars: this.scenarios.size * 3 };
  }

  list() { return [...this.scenarios.values()].map((s) => ({ ...s, stars: this.stars(s.id) })); }
}
