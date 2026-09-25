import { format } from '../core/clock.js';

// Every action the player takes, with story time and wall time. The debrief
// timeline is built straight from this. Nothing leaves the browser.
export class ActionLog {
  constructor() { this.entries = []; this.startedAt = performance.now(); }

  add(entry) {
    const e = {
      wall: Math.round(performance.now() - this.startedAt),
      storyTime: format(entry.minutes ?? 0),
      kind: 'action',
      ...entry
    };
    this.entries.push(e);
    return e;
  }

  forScenario(id) { return this.entries.filter((e) => e.scenario === id); }
  reset() { this.entries = []; this.startedAt = performance.now(); }
  elapsedSeconds() { return Math.round((performance.now() - this.startedAt) / 1000); }
}
