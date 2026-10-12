import { bus } from '../core/bus.js';
import { runActions, cancelTimers } from './actions.js';
import { makeLookalike } from './lookalike.js';
import { now, format, setClock, clockRange } from '../core/clock.js';
import { load } from '../core/storage.js';

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
    // The Next button at the bottom of the room advances a completed step.
    this.nextUnsub = bus.on('coach:next', () => this.next());
    // A scenario with a to do list (several jobs in any order) is led one item
    // at a time: the walkthrough follows the first job not yet ticked.
    this.listUnsubs = [
      bus.on('checklist', ({ items }) => { if (this.active) { this.active.checklist = items || null; this.active.listItem = null; this.guideList(); } }),
      bus.on('world:changed', () => this.guideList())
    ];
  }

  dispose() {
    this.disposed = true;
    if (this.unsub) this.unsub();
    if (this.traceUnsub) this.traceUnsub();
    if (this.nextUnsub) this.nextUnsub();
    for (const u of this.listUnsubs || []) u();
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
      stageId: null, snapshot: null, pendingNext: null, visited: [], checklist: null, listItem: null,
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
    a.pendingNext = null;
    if (!stage.end && !a.visited.includes(stageId)) a.visited.push(stageId);
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

    // The guided walkthrough (the coach) gets the full step guidance straight
    // away: what to do now, and where to go to do it. The player can turn the
    // coach off; then the hint below still appears, on a delay, as before.
    const guide = this.guideFor(stage);
    this.emitSteps();
    if (!stage.end) {
      a.listItem = null;
      bus.emit('coach:step', {
        scenario: a.scenario.id, index: (a.index ?? 0) + 1, count: a.count ?? 1, stage: stageId,
        objective: stage.objective || '',
        hint: (stage.hint && (stage.hint.text || stage.hint)) || '',
        why: stage.insight || '',
        target: guide.target,
        targetLabel: stage.targetLabel || null,
        decision: !!stage.decision,
        points: guide.points, events: guide.events,
        choices: this.goodChoices(stage),
        ...this.stepPosition()
      });
      // A to do list set up by this stage leads from its first open job.
      if (a.checklist) setTimeout(() => this.guideList(), 0);
    }

    const hintDelay = HINT_DELAY[this.difficulty];
    if (stage.hint && hintDelay !== undefined) {
      a.hintTimer = setTimeout(() => bus.emit('hint', { text: stage.hint.text || stage.hint }), stage.hint.afterMs ?? hintDelay);
    }
    const target = guide.target;
    // With the guided walkthrough on, the marker that says "look here" comes up
    // almost at once, so "where to go" is never a guess. With it off, it keeps
    // the by difficulty pace.
    const guided = load('guide', true);
    const hsDelay = guided ? 500 : HOTSPOT_DELAY[this.difficulty];
    if (target && hs && hsDelay !== undefined) {
      // Led modes name the marker, so it reads as "the next step is here".
      const label = stage.targetLabel || (guided && !['expert', 'assessment'].includes(this.difficulty) ? 'Next step' : undefined);
      a.hotspotTimer = setTimeout(() => hs.show(target, { label }), hsDelay);
    }

    // A closing stage may put a card up first. Let it be read before the
    // scenario hands over to the next one or to the debrief.
    if (stage.end) this.overlay.whenIdle().then(() => this.finish(stage.endReason || 'complete'));
  }

  // ------------------------------------------------------------ the steps
  // The steps of a scenario as the player sees them: every stage they have
  // been through, then the best way on from where they are now (the safe or
  // careful move the guide leads to first), up to the closing stage. Stages are a
  // graph, so the list can grow or shrink when the player takes another road;
  // the ticks stay honest because they only ever mark stages really visited.
  pathFrom(stageId) {
    const stages = this.active.scenario.stages;
    const out = [];
    const seen = new Set();
    let id = stageId;
    while (id && stages[id] && !stages[id].end && !seen.has(id)) {
      seen.add(id);
      out.push(id);
      // The same order the pointer uses, so the list matches where it leads.
      const rule = (stages[id].on || []).find((r) => r.go && r.go !== id && (!r.outcome || r.outcome.verdict === 'safe' || r.outcome.verdict === 'careful'));
      id = rule && rule.go;
    }
    return out;
  }

  stepLabel(stage) {
    if (stage.step) return stage.step;
    const t = stage.objective || ((stage.auto || []).find((x) => x.do === 'objective') || {}).text || '';
    return t.split(/(?<=\.)\s/)[0] || t;
  }

  steps() {
    const a = this.active;
    if (!a) return [];
    const stages = a.scenario.stages;
    const current = a.stageId;
    const ahead = stages[current] && !stages[current].end ? this.pathFrom(current) : [];
    const ids = [...a.visited.filter((id) => !ahead.includes(id)), ...ahead];
    const ended = !stages[current] || stages[current].end;
    return ids.map((id) => ({
      id, label: this.stepLabel(stages[id]),
      state: id === current && !a.pendingNext && !ended ? 'now' : a.visited.includes(id) && (id !== current || a.pendingNext || ended) ? 'done' : 'todo'
    }));
  }

  stepPosition() {
    const list = this.steps();
    const i = list.findIndex((x) => x.state === 'now');
    return { step: i < 0 ? list.filter((x) => x.state === 'done').length : i + 1, steps: list.length };
  }

  emitSteps() {
    const a = this.active;
    if (!a) return;
    const list = this.steps();
    const done = list.filter((x) => x.state === 'done').length;
    bus.emit('steps', { scenario: a.scenario.id, steps: list, done, total: list.length, index: a.index, count: a.count });
    // The bar in the story panel moves with each finished step, not only with
    // each finished scenario.
    const part = list.length ? done / list.length : 0;
    bus.emit('progress', { done: a.index, total: a.count, fraction: (a.index + Math.min(0.95, part)) / Math.max(1, a.count) });
  }

  // A to do list is led one job at a time. Each item may say which event ticks
  // it ({ event, match }) and where it is done ({ target }); the walkthrough
  // then treats the first job not yet ticked as the step to lead.
  guideList() {
    const a = this.active;
    if (!a || !a.checklist || a.pendingNext || this.disposed) return;
    const stage = a.scenario.stages[a.stageId];
    if (!stage || stage.end) return;
    const flags = this.store.get().flags || {};
    const items = a.checklist;
    const open = items.findIndex((it) => !flags[it.flag]);
    if (open < 0 || a.listItem === open) return;
    const first = a.listItem === null;
    a.listItem = open;
    const it = items[open];
    // An item can name its own pointers (points), or say which event ticks it
    // and let the product's map find the controls.
    const guide = this.guideFor({ target: it.target, points: it.points, on: it.event ? [{ when: { event: it.event, match: it.match }, go: '_' }] : [] });
    const done = items.filter((x) => flags[x.flag]).length;
    bus.emit('coach:step', {
      scenario: a.scenario.id, index: (a.index ?? 0) + 1, count: a.count ?? 1, stage: a.stageId,
      objective: stage.objective || '',
      hint: it.hint || it.label,
      why: it.why || stage.insight || '',
      target: guide.target, targetLabel: null, decision: false, points: guide.points, events: guide.events, choices: this.goodChoices(stage),
      step: open + 1, steps: items.length, listDone: done, item: it.label, marks: items.map((x) => !!flags[x.flag]),
      // Not the first job: the last one was just ticked, so say so.
      ticked: first ? null : (items.filter((x) => flags[x.flag]).pop() || {}).label || null
    });
  }

  // A set up move has happened: lead on from there, same step.
  reguide() {
    const a = this.active;
    const stage = a && a.scenario.stages[a.stageId];
    if (!stage || stage.end || a.checklist || a.pendingNext) return;
    const guide = this.guideFor(stage);
    bus.emit('coach:step', {
      scenario: a.scenario.id, index: (a.index ?? 0) + 1, count: a.count ?? 1, stage: a.stageId,
      objective: stage.objective || '',
      hint: (stage.hint && (stage.hint.text || stage.hint)) || '',
      why: stage.insight || '',
      target: guide.target, targetLabel: stage.targetLabel || null, decision: !!stage.decision,
      points: guide.points, events: guide.events, choices: this.goodChoices(stage),
      ...this.stepPosition()
    });
  }

  // On a call, what to say: the reply ids the scenario scores as safe or
  // careful (stage rules and bonuses), so the guide can ring the right line.
  goodChoices(stage) {
    const out = [];
    const rules = [...(stage.on || []), ...((this.active && this.active.scenario.bonuses) || [])];
    for (const r of rules) {
      const ev = [].concat((r.when || {}).event || []);
      if (!ev.some((x) => x === 'call:choice' || x === 'deskphone:choice' || x === 'video:choice')) continue;
      const v = r.outcome && r.outcome.verdict;
      if (v && v !== 'safe' && v !== 'careful') continue;
      for (const c of [].concat(((r.when || {}).match || {}).choice || [])) if (typeof c === 'string') out.push(c);
    }
    return out;
  }

  // What the walkthrough needs to lead the player through a step: where on the
  // phone or computer it is done (its points), and which thing in the room to go
  // to first (its target). A stage can say both itself (stage.points,
  // stage.target); otherwise they come from the product's map of events to the
  // controls that raise them, for every move the stage would reward. The risky
  // move is never pointed at. An entry can also name a room object
  // ({ room: 'door' }) or only a device ({ device: 'phone' }), for steps done
  // somewhere without a control to ring.
  guideFor(stage) {
    const map = this.product.coachPoints || {};
    const DEVICE_OBJECT = { desktop: 'computer', phone: 'phone', deskphone: 'deskphone' };
    const out = [];
    const seen = new Set();
    const rooms = [];
    const devices = [];
    const events = [];
    // What a wanted event comes down to on screen: the product's map of
    // controls; or, for a goal made of parts (a check that raises it once
    // several careful moves are done), each part not yet done; or the object in
    // the room whose card offers it as a choice.
    const expand = (ev, ctx, depth = 0) => {
      events.push(ev);
      const specs = [].concat(map[ev] || []);
      if (specs.length) return specs.map((spec) => [ev, ctx, spec]);
      if (depth > 2) return [];
      const parts = this.partsOf(ev);
      if (parts.length) return parts.flatMap((x) => expand(x.event, x.match || {}, depth + 1));
      const room = this.cardObjectFor(ev);
      if (room) return [[ev, ctx, { room }]];
      // A button on a web page that raises it directly.
      return [[ev, ctx, { device: 'desktop', app: 'browser', sel: [`[data-page-btn="${ev}"]`], label: ['Press this'], soft: true }]];
    };
    if (Array.isArray(stage.points)) {
      for (const p of stage.points) out.push(p);
    } else {
      // A set up move (a rule that only makes something happen, such as asking
      // the assistant, which puts its risky action up for review) is led first,
      // until it has happened.
      const a = this.active;
      const all = stage.on || [];
      const fired = (r) => !!(a && a.fired && a.fired.has(`${a.stageId}:${all.indexOf(r)}`));
      const setUp = (r) => !r.outcome && !r.go && r.effects && !fired(r);
      for (const r of [...all.filter(setUp), ...all.filter((r) => !setUp(r))]) {
        const o = r.outcome;
        if (o && o.verdict !== 'safe' && o.verdict !== 'careful') continue;
        if (!o && !r.go && !setUp(r)) continue;
        const when = r.when || {};
        for (const wanted of [].concat(when.event || [])) {
          for (const [ev, ctx, spec] of expand(wanted, when.match || {})) {
            const key = ev + JSON.stringify(ctx) + (spec.device || '') + (spec.room || '');
            if (seen.has(key)) continue;
            seen.add(key);
            if (spec.room) { rooms.push(spec.room); continue; }
            if (!spec.sel) { if (spec.device) devices.push(spec.device); continue; }
            const fill = (text) => {
              let ok = true;
              const done = String(text).replace(/\{(\w+)\}/g, (m, k) => {
                const v = [].concat(ctx[k])[0];
                if (v === undefined || typeof v === 'object') { ok = false; return m; }
                return String(v);
              });
              return ok ? done : null;
            };
            const sel = []; const label = [];
            spec.sel.forEach((c, i) => { const f = fill(c); if (f) { sel.push(f); label.push((spec.label || [])[i] || (spec.label || [])[0] || ''); } });
            if (sel.length) out.push({ device: spec.device, app: spec.app, sel, label, soft: !!spec.soft });
          }
        }
      }
    }
    const lead = out.find((p) => !p.soft);
    const firstDevice = (lead && !lead.room && (lead.device || 'desktop')) || devices[0];
    const target = stage.target || (stage.hint && stage.hint.glow) || rooms[0] || (firstDevice ? DEVICE_OBJECT[firstDevice] : null) || null;
    return { points: out, target, events: [...new Set(events)] };
  }

  // The parts of a goal: bonuses whose effects raise the event through a check
  // of several flags, and which have not been earned yet.
  partsOf(ev) {
    const a = this.active;
    if (!a) return [];
    const raises = (fx) => [].concat(fx || []).some((x) => x && x.do === 'check' && x.emit === ev);
    const out = [];
    for (const b of a.scenario.bonuses || []) {
      if (a.awarded.has(b.id)) continue;
      if (!raises(b.effects) && !raises(b.outcome && b.outcome.effects)) continue;
      for (const e of [].concat((b.when || {}).event || [])) out.push({ event: e, match: (b.when || {}).match });
    }
    return out;
  }

  // The room object whose card raises the event, by opening it or as one of its
  // choices: scenario cards (object.card) first, then the product's own.
  cardObjectFor(ev) {
    const a = this.active;
    if (!a) return null;
    const has = (card) => card && (card.event === ev || (card.choices || []).some((c) => c.emit === ev));
    let found = null;
    const walk = (v) => {
      if (found || !v || typeof v !== 'object') return;
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (v.do === 'object.card' && has(v.card)) { found = v.id; return; }
      Object.values(v).forEach(walk);
    };
    walk([a.scenario.setup, a.scenario.stages, a.scenario.bonuses]);
    if (found) return found;
    for (const [id, card] of Object.entries(this.product.objectCards || {})) if (has(card)) return id;
    return null;
  }

  onEvent(type, payload) {
    const a = this.active;
    if (!a || a.finished || this.disposed || String(type).startsWith('scenario:')) return;
    // A step is done and waiting on the Next button: hold everything until the
    // player moves on, so one completed step cannot trip the next one early.
    if (a.pendingNext) return;
    const s = a.scenario;
    const flags = this.store.get().flags;

    for (const b of s.bonuses || []) {
      if (a.awarded.has(b.id) || !ruleFires(b, type, payload, flags)) continue;
      a.awarded.add(b.id);
      this.record(b, type, 'careful');
      if (b.outcome && b.outcome.effects) runActions(b.outcome.effects, this.actionCtx);
      setTimeout(() => this.reguide(), 0);
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
      if (!a.fired.has(key)) { a.fired.add(key); runActions(rule.effects, this.actionCtx); this.reguide(); }
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
    if (rule.go) {
      // A card gave the player an explicit "Continue" already; a silent step
      // gets a Next button instead, so finishing a step is always a clear,
      // deliberate moment and it is obvious how to move on.
      const hadCard = !!(outcome && outcome.card);
      if (hadCard || rule.instant) this.enter(rule.go);
      else this.queueNext(rule.go, outcome);
    }
  }

  // The step is complete but silent. Put the Next button up and wait, unless
  // automation asked to run straight through (shouldAutoAdvance).
  queueNext(go, outcome) {
    const a = this.active;
    if (!a) return;
    a.pendingNext = go;
    clearTimeout(a.hintTimer);
    clearTimeout(a.hotspotTimer);
    if (this.actionCtx.hotspots) this.actionCtx.hotspots.clear();
    const next = a.scenario.stages[go] || {};
    const stage = a.scenario.stages[a.stageId] || {};
    this.emitSteps();
    const pos = this.stepPosition();
    bus.emit('stage:complete', {
      scenario: a.scenario.id, stage: a.stageId, next: go, last: !!next.end,
      nextObjective: next.end ? '' : (next.objective || ((next.auto || []).find((x) => x.do === 'objective') || {}).text || ''),
      // What the player just did and why it matters: the lesson of the step.
      did: (outcome && outcome.label) || this.stepLabel(stage),
      learned: (outcome && outcome.what) || stage.insight || '',
      step: pos.step, steps: pos.steps
    });
    if (this.shouldAutoAdvance()) this.next();
  }

  next() {
    const a = this.active;
    if (!a || this.disposed) return;
    const go = a.pendingNext;
    if (!go) return;
    a.pendingNext = null;
    this.enter(go);
  }

  lessonList(items) {
    const ul = document.createElement('ul');
    ul.className = 'ov-lessons';
    for (const t of items) {
      const li = document.createElement('li');
      li.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      ul.append(li);
    }
    return ul;
  }

  // Tests drive many scenarios end to end; the flag lets them run straight
  // through the Next button. It is never set for a real player.
  shouldAutoAdvance() {
    return globalThis.__simAutoNext === true;
  }

  async finish(reason) {
    const a = this.active;
    if (!a || a.finished) return;
    a.finished = true;
    clearTimeout(a.hintTimer);
    clearTimeout(a.hotspotTimer);
    if (this.actionCtx.hotspots) this.actionCtx.hotspots.clear();
    a.stageId = null;
    this.emitSteps();
    // The point of the game is the lesson, so each scenario closes on what it
    // taught, with a clear Next. Not in the unguided modes, and not when
    // automation runs straight through.
    const teaches = a.scenario.teaches || [];
    if (teaches.length && !(this.product.lessonModes && !this.product.lessonModes.includes(this.difficulty)) && !this.shouldAutoAdvance()) {
      const more = a.index + 1 < a.count;
      bus.emit('lesson', { scenario: a.scenario.id, title: a.scenario.title, teaches });
      await this.overlay.showCard({
        kicker: `Lesson ${a.index + 1} of ${a.count} complete`, verdict: 'safe',
        title: a.scenario.lessonTitle || `What “${a.scenario.title}” taught you`,
        body: [a.scenario.insight, this.lessonList(teaches)].filter(Boolean),
        continueLabel: more ? 'Next lesson' : 'See how it went'
      });
      if (this.disposed) return;
    }
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
