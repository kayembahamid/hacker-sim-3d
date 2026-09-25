import { bus } from '../core/bus.js';
import { runActions, cancelTimers } from './actions.js';
import { makeLookalike } from './lookalike.js';
import { now, format, setClock, clockRange } from '../core/clock.js';

// Reads a scenario JSON and plays it. The engine knows about stages, rules,
// outcomes and rewinds. It knows nothing about Blockfall, Gems, Bille, Veltrix
// or invoices: all of that is content.
//
// A scenario:
//   id, title, kind, brief, insight, maxPoints
//   vars      seeded choices, resolved once per run ({"pick": [...]},
//             {"lookalike": "playblockfall.com"}, {"byDifficulty": {...}}, ...)
//   setup     actions run when the scenario starts
//   stages    { id: { objective, insight, hint, target, auto, on: [rules], end } }
//   bonuses   rules that award points whenever they fire (careful habits)
//   guards    rules that take points whenever they fire (over reporting)
//
// A rule: { when: { event, match }, outcome: { points, verdict, label, what,
// ideal, card, effects, rewind }, go: nextStage }

function deepInterpolate(value, vars) {
  if (typeof value === 'string') {
    const whole = value.match(/^\{\{([\w.]+)\}\}$/);
    if (whole) { const v = lookup(vars, whole[1]); return v === undefined ? value : v; }
    return value.replace(/\{\{([\w.]+)\}\}/g, (m, path) => {
      const v = lookup(vars, path);
      return v === undefined ? m : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => deepInterpolate(v, vars));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepInterpolate(v, vars);
    return out;
  }
  return value;
}

function lookup(obj, path) {
  return path.split('.').reduce((acc, k) => (acc === undefined || acc === null ? undefined : acc[k]), obj);
}

function matches(matchSpec, payload) {
  if (!matchSpec) return true;
  for (const [key, want] of Object.entries(matchSpec)) {
    const got = lookup(payload, key);
    if (want === '*') { if (got === undefined) return false; continue; }
    if (Array.isArray(want)) { if (!want.includes(got)) return false; continue; }
    if (want && typeof want === 'object') {
      if ('not' in want) { if (got === want.not) return false; continue; }
      if ('includes' in want) { if (!String(got ?? '').toLowerCase().includes(String(want.includes).toLowerCase())) return false; continue; }
      if ('gte' in want) { if (!(Number(got) >= want.gte)) return false; continue; }
      if ('lte' in want) { if (!(Number(got) <= want.lte)) return false; continue; }
    }
    if (got !== want) return false;
  }
  return true;
}

function ruleFires(rule, type, payload, flags) {
  const when = rule.when || {};
  const events = [].concat(when.event || []);
  if (events.length && !events.includes(type)) return false;
  if (when.flag && !flags[when.flag]) return false;
  if (when.notFlag && flags[when.notFlag]) return false;
  return matches(when.match, payload);
}

const HINT_DELAY = { easy: 6000, training: 9000, normal: 25000 };
const HOTSPOT_DELAY = { easy: 0, training: 2500, normal: 14000 };

export class ScenarioRunner {
  constructor({ store, sites, rng, log, score, overlay, actionCtx, difficulty = 'normal', product }) {
    this.store = store;
    this.sites = sites;
    this.rng = rng;
    this.log = log;
    this.score = score;
    this.overlay = overlay;
    this.actionCtx = actionCtx;
    this.difficulty = difficulty;
    this.product = product;
    this.active = null;
    this.disposed = false;
    this.unsub = bus.on('*', (payload, type) => this.onEvent(type, payload));
    this.traceUnsub = bus.on('*', (payload, type) => this.trace(type, payload));
  }

  dispose() {
    this.disposed = true;
    if (this.unsub) this.unsub();
    if (this.traceUnsub) this.traceUnsub();
    if (this.active) clearTimeout(this.active.hintTimer);
    if (this.active) clearTimeout(this.active.hotspotTimer);
    cancelTimers();
    this.active = null;
  }

  // Everything the player does lands in the log, so the debrief can show the
  // careful habits even when they did not change the story.
  trace(type, payload) {
    if (!this.active || this.disposed) return;
    // Products can add their own plain language lines (product.trace).
    const t = TRACE[type] || (this.product.trace && this.product.trace[type]);
    if (!t) return;
    this.log.add({ scenario: this.active.scenario.id, minutes: now(), kind: 'trace', event: type, label: t(payload) });
  }

  resolveVars(spec = {}) {
    const vars = { difficulty: this.difficulty };
    for (const [name, def] of Object.entries(spec)) {
      if (def && typeof def === 'object' && !Array.isArray(def)) {
        if ('pick' in def) { vars[name] = this.rng.pick(def.pick); continue; }
        if ('lookalike' in def) {
          vars[name] = makeLookalike(def.lookalike, this.rng, def.technique || null, def);
          continue;
        }
        if ('int' in def) { vars[name] = this.rng.int(def.int[0], def.int[1]); continue; }
        if ('chance' in def) { vars[name] = this.rng.bool(def.chance); continue; }
        if ('byDifficulty' in def) { vars[name] = def.byDifficulty[this.difficulty] ?? def.byDifficulty.normal; continue; }
        if ('shuffle' in def) { vars[name] = this.rng.shuffle(def.shuffle); continue; }
        if ('value' in def) { vars[name] = def.value; continue; }
        // A product can resolve var types the engine does not know (the office
        // picks a lookalike address for one of its brands this way).
        if (this.product.resolveVar) {
          const v = this.product.resolveVar(def, { rng: this.rng, difficulty: this.difficulty, world: this.store.get() });
          if (v !== undefined) { vars[name] = v; continue; }
        }
      }
      vars[name] = def;
    }
    return vars;
  }

  run(raw, index, count) {
    const vars = this.resolveVars(raw.vars);
    // A second pass lets one var build on another ({{lookalike.host}} in a URL).
    for (const k of Object.keys(vars)) vars[k] = deepInterpolate(vars[k], vars);
    const scenario = deepInterpolate({ ...raw, vars: undefined }, vars);
    scenario.vars = vars;

    this.active = {
      scenario, vars, index, count,
      stageId: null, snapshot: null,
      awarded: new Set(), finished: false,
      resolve: null, hintTimer: null, hotspotTimer: null,
      startedAt: performance.now()
    };
    Object.assign(this.actionCtx.vars || {}, vars);

    // Scenarios can come in any order, so each one is given its own slot in the
    // evening and moves the clock there, unless it pins its own time.
    const { start, end } = clockRange();
    const slot = start + Math.round(((end - start) * (index + 0.25)) / (count + 0.2));
    if (scenario.clock !== false) setClock(Math.max(now(), scenario.startsAt ?? slot));

    this.score.ensure(scenario.id, scenario.title, scenario.maxPoints || 100, scenario.kind);
    this.log.add({ scenario: scenario.id, minutes: now(), kind: 'scenario-start', label: `${scenario.title} begins` });
    bus.emit('scenario:start', {
      id: scenario.id, title: scenario.title, brief: scenario.brief, kind: scenario.kindLabel || scenario.kind,
      insight: scenario.insight, index: index + 1, count
    });
    bus.emit('progress', { done: index, total: count });
    if (scenario.beat !== false) bus.emit('beat', { time: format(now()), text: scenario.title, tone: 'title' });

    runActions(scenario.setup, this.actionCtx);
    this.enter(scenario.start);
    return new Promise((resolve) => { this.active.resolve = resolve; });
  }

  enter(stageId) {
    const a = this.active;
    if (!a) return;
    const stage = a.scenario.stages[stageId];
    if (!stage) { console.warn('[scenario] missing stage', stageId); return; }
    a.stageId = stageId;
    a.fired = new Set();
    a.snapshot = this.store.snapshot();
    clearTimeout(a.hintTimer);
    clearTimeout(a.hotspotTimer);
    const hs = this.actionCtx.hotspots;
    if (hs) hs.clear();

    if (stage.objective) bus.emit('objective', { text: stage.objective, scenario: a.scenario.id });
    if (stage.insight) bus.emit('insight', { text: stage.insight });
    runActions(stage.auto, this.actionCtx);
    bus.emit('stage:entered', { scenario: a.scenario.id, stage: stageId, decision: !!stage.decision });

    const hintDelay = HINT_DELAY[this.difficulty];
    if (stage.hint && hintDelay !== undefined) {
      a.hintTimer = setTimeout(() => bus.emit('hint', { text: stage.hint.text || stage.hint }), stage.hint.afterMs ?? hintDelay);
    }
    const target = stage.target || (stage.hint && stage.hint.glow);
    const hsDelay = HOTSPOT_DELAY[this.difficulty];
    if (target && hs && hsDelay !== undefined) {
      a.hotspotTimer = setTimeout(() => hs.show(target, { label: stage.targetLabel }), hsDelay);
    }

    // A closing stage may put a card up first. Let it be read before the
    // scenario hands over to the next one or to the debrief.
    if (stage.end) this.overlay.whenIdle().then(() => this.finish(stage.endReason || 'complete'));
  }

  onEvent(type, payload) {
    const a = this.active;
    if (!a || a.finished || this.disposed || String(type).startsWith('scenario:')) return;
    const s = a.scenario;
    const flags = this.store.get().flags;

    for (const b of s.bonuses || []) {
      if (a.awarded.has(b.id) || !ruleFires(b, type, payload, flags)) continue;
      a.awarded.add(b.id);
      this.record(b, type, 'careful');
      if (b.outcome && b.outcome.effects) runActions(b.outcome.effects, this.actionCtx);
    }
    for (const g of [...(s.guards || []), ...(this.product.globalGuards || [])]) {
      if ((!g.repeat && a.awarded.has(g.id)) || !ruleFires(g, type, payload, flags)) continue;
      a.awarded.add(g.id);
      if (g.overReport) this.score.markOverReport(s.id);
      this.record(g, type, (g.outcome && g.outcome.verdict) || 'risky');
      if (g.outcome && g.outcome.effects) runActions(g.outcome.effects, this.actionCtx);
    }

    const stage = s.stages[a.stageId];
    if (!stage) return;
    const rule = (stage.on || []).find((r) => ruleFires(r, type, payload, flags) && !(a.fired && !r.outcome && !r.go && a.fired.has(`${a.stageId}:${(stage.on || []).indexOf(r)}`)));
    if (!rule) return;
    // A rule with only effects (no outcome, no stage change) is a trigger:
    // something happens, the stage stays, and later rules still get a turn.
    if (!rule.outcome && !rule.go && rule.effects) {
      if (!a.fired) a.fired = new Set();
      const key = `${a.stageId}:${(stage.on || []).indexOf(rule)}`;
      if (!a.fired.has(key)) { a.fired.add(key); runActions(rule.effects, this.actionCtx); }
      return;
    }
    clearTimeout(a.hintTimer);
    clearTimeout(a.hotspotTimer);
    this.applyRule(rule, type, payload);
  }

  record(rule, type, verdictDefault = 'neutral') {
    const a = this.active;
    const o = rule.outcome || rule;
    const verdict = o.verdict || verdictDefault;
    const points = o.points || 0;
    this.score.award(a.scenario.id, { points, verdict, label: o.label || o.title || type, detail: o.what, ideal: o.ideal });
    this.log.add({
      scenario: a.scenario.id, minutes: now(), kind: 'decision',
      event: type, label: o.label || o.title || type, detail: o.what, ideal: o.ideal, verdict, points
    });
    bus.emit('score:changed', { scenario: a.scenario.id, points });
    if (o.label && o.beat !== false) {
      bus.emit('beat', { time: format(now()), text: o.label, tone: verdict === 'safe' || verdict === 'careful' ? 'good' : verdict === 'neutral' ? 'neutral' : 'bad' });
    }
    if (verdict === 'safe' || verdict === 'careful') bus.emit('sfx', { name: 'good' });
    if (verdict === 'unsafe') bus.emit('sfx', { name: 'bad' });
  }

  async applyRule(rule, type, payload = {}) {
    const a = this.active;
    // Outcome text may quote the event that triggered it: {{event.field}}.
    const outcome = rule.outcome ? deepInterpolate(rule.outcome, { event: payload }) : null;
    if (rule.effects) runActions(deepInterpolate(rule.effects, { event: payload }), this.actionCtx);
    if (outcome) this.record({ ...rule, outcome }, type);
    if (outcome && outcome.effects) runActions(outcome.effects, this.actionCtx);

    if (outcome && outcome.card) {
      const before = a.snapshot;
      const bad = outcome.verdict === 'unsafe' || outcome.verdict === 'risky';
      const rewindAllowed = outcome.rewind !== false && bad && this.product.rewinds !== false && !(this.product.noRewindModes || []).includes(this.difficulty);
      const choice = await this.overlay.showCard({ ...outcome.card, verdict: outcome.card.verdict || outcome.verdict || 'neutral', allowRewind: rewindAllowed });
      if (this.disposed || this.active !== a) return;
      if (choice === 'rewind') {
        this.score.markRewind(a.scenario.id, outcome.points || 0);
        this.log.add({ scenario: a.scenario.id, minutes: now(), kind: 'rewind', label: 'Rewound to try the moment again', verdict: 'neutral' });
        cancelTimers();
        this.store.restore(before, 'rewind');
        bus.emit('scenario:rewind', { scenario: a.scenario.id, stage: a.stageId });
        this.enter(a.stageId);
        return;
      }
    }
    if (rule.go) this.enter(rule.go);
  }

  finish(reason) {
    const a = this.active;
    if (!a || a.finished) return;
    a.finished = true;
    clearTimeout(a.hintTimer);
    clearTimeout(a.hotspotTimer);
    if (this.actionCtx.hotspots) this.actionCtx.hotspots.clear();
    const stars = this.score.stars(a.scenario.id);
    const seconds = Math.round((performance.now() - a.startedAt) / 1000);
    this.log.add({ scenario: a.scenario.id, minutes: now(), kind: 'scenario-end', label: `${a.scenario.title} finished`, verdict: 'neutral' });
    bus.emit('scenario:complete', { id: a.scenario.id, title: a.scenario.title, stars, seconds, reason, vars: a.vars });
    bus.emit('progress', { done: a.index + 1, total: a.count });
    const resolve = a.resolve;
    this.active = null;
    if (resolve) resolve({ id: a.scenario.id, stars, seconds });
  }

  // Genuine traffic between scenarios: a text from Mum, a real email from the
  // game, a teacher's reminder. Seeded, and more of it on harder modes, so the
  // player has to judge each message rather than report everything.
  ambient(index) {
    const pool = (this.product.run && this.product.run.ambient) || [];
    if (!pool.length) return;
    const perGap = (this.product.run.ambientPerGap || {})[this.difficulty] ?? 1;
    const picks = this.rng.sample(pool.filter((p) => !this.usedAmbient.has(p.id)), perGap);
    for (const p of picks) {
      this.usedAmbient.add(p.id);
      runActions(deepInterpolate(p.actions, { index }), this.actionCtx);
    }
  }

  async runEpisode(scenarios) {
    const results = [];
    this.usedAmbient = new Set();
    for (let i = 0; i < scenarios.length; i++) {
      if (this.disposed) return results;
      results.push(await this.run(scenarios[i], i, scenarios.length));
      if (i < scenarios.length - 1 && !this.disposed) this.ambient(i);
    }
    if (!this.disposed) bus.emit('episode:complete', { results });
    return results;
  }
}

// Plain language lines for the timeline, for things that are worth seeing in
// the debrief even when no rule scored them.
const TRACE = {
  'sender:checked': (p) => `Checked who ${p.channel === 'mail' ? 'the email' : 'the message'} was really from`,
  'link:hovered': (p) => `Looked at where a link goes: ${p.href}`,
  'link:opened': (p) => `Opened a link: ${p.href}`,
  'domain:checked': (p) => `Checked who owns ${p.host}`,
  'cert:viewed': (p) => `Opened the certificate for ${p.host}`,
  'headers:viewed': () => 'Read the full email headers',
  'file:properties': (p) => `Opened the properties of ${p.name}`,
  'call:answered': (p) => `Answered a call from ${p.label || p.number}`,
  'call:declined': (p) => `Declined a call from ${p.label || p.number}`,
  'door:used': () => 'Went to talk to someone at home',
  'push:approved': () => 'Approved a sign in request',
  'push:denied': () => 'Denied a sign in request',
  'command:run': (p) => `Ran: ${p.command}`
};
