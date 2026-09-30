// Checks every scenario JSON before it ships, without a browser:
//   - the stage graph: start exists, every go leads somewhere, an end is reachable
//   - every action (do) is one the engine or the office knows
//   - every event a rule waits for is one something can actually raise
//   - every target is an object in the room
//   - no em or en dashes in any text
//   - a careful player can reach three stars, and maxPoints is not a giveaway
//   - drills built for the Labs catalogue stay out of the flagship shift
//
//   node tools/check-scenarios.mjs [content/office]
//
// Exits 1 on any error. Warnings are printed and do not fail.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'content/office';
const errors = [];
const warnings = [];

async function walk(d) {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

const code = [...await walk('engine'), ...await walk(dir)].filter((p) => p.endsWith('.js'));
const sources = await Promise.all(code.map((p) => readFile(p, 'utf8')));

// Events something can raise: every emit('name' in the code.
const EVENTS = new Set();
for (const src of sources) {
  for (const line of src.split('\n')) {
    if (!/emit\(/.test(line)) continue;
    for (const m of line.matchAll(/['"`]([a-z]+:[A-Za-z]+)['"`]/g)) EVENTS.add(m[1]);
  }
}
// A few are raised with a computed name.
['erp:changeApproved', 'erp:changeRejected', 'agent:approved', 'agent:blocked', 'mail:replied', 'mail:forwarded', 'mail:reported', 'mail:junked', 'mail:deleted', 'message:reported', 'message:blocked', 'message:deleted', 'invite:accepted', 'invite:declined', 'invite:reported', 'site:fakeShown', 'site:realShown'].forEach((e) => EVENTS.add(e));

// Actions a scenario can use.
const ACTIONS = new Set();
const eng = await readFile('engine/scenario/actions.js', 'utf8');
for (const m of eng.matchAll(/^\s{2}['"]?([a-z][\w.]*)['"]?\s*:\s*\(/gm)) ACTIONS.add(m[1]);
const off = await readFile(join(dir, 'actions.js'), 'utf8');
for (const m of off.matchAll(/^\s{2}'([a-z][\w.]*)'\s*:\s*\(/gm)) ACTIONS.add(m[1]);

const roomSrc = await readFile(join(dir, 'room/index.js'), 'utf8');
const OBJECTS = new Set([...roomSrc.matchAll(/^\s{4}([a-z]+): \{ label/gm)].map((m) => m[1]));

const files = (await readdir(join(dir, 'scenarios'))).filter((f) => f.endsWith('.json')).sort();
const scenarios = [];
for (const f of files) {
  const raw = await readFile(join(dir, 'scenarios', f), 'utf8');
  let s;
  try { s = JSON.parse(raw); } catch (e) { errors.push(`${f}: not valid JSON (${e.message})`); continue; }
  s._file = f;
  s._raw = raw;
  scenarios.push(s);
}

// Events a scenario raises itself (emit actions, card and phone choices, page buttons).
function collectEmits(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectEmits(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  if (node.do === 'emit' && node.event) out.add(node.event);
  if (typeof node.emit === 'string' && /:/.test(node.emit)) out.add(node.emit);
  if (node.card && node.card.event) out.add(node.card.event);
  if (node.do === 'object.card' && node.card && node.card.event) out.add(node.card.event);
  if (node.do === 'check' && node.emit) out.add(node.emit);
  for (const v of Object.values(node)) collectEmits(v, out);
}
const SCENARIO_EVENTS = new Set();
for (const s of scenarios) collectEmits(s, SCENARIO_EVENTS);
const productSrc = await readFile(join(dir, 'product.js'), 'utf8');
for (const m of productSrc.matchAll(/event: '([a-z]+:[A-Za-z]+)'/g)) SCENARIO_EVENTS.add(m[1]);
for (const m of productSrc.matchAll(/emit: '([a-z]+:[A-Za-z]+)'/g)) SCENARIO_EVENTS.add(m[1]);

const ids = new Map();
for (const s of scenarios) {
  const f = s._file;
  const err = (m) => errors.push(`${f}: ${m}`);
  const warn = (m) => warnings.push(`${f}: ${m}`);
  for (const k of ['id', 'title', 'kind', 'maxPoints', 'brief', 'start', 'stages']) if (s[k] === undefined) err(`missing ${k}`);
  if (ids.has(s.id)) err(`duplicate id ${s.id} (also ${ids.get(s.id)})`);
  ids.set(s.id, f);
  if ((s.order ?? 0) >= 100) {
    if (s.pool !== false) err('a Labs drill must set "pool": false so it stays out of the flagship shift');
    if (!s.track) err('a Labs drill needs a track');
  }
  if (/[—–]/.test(s._raw)) err('contains an em or en dash');

  const stages = s.stages || {};
  if (!stages[s.start]) err(`start stage "${s.start}" does not exist`);
  const events = [];
  const walkRules = (rules, where) => {
    for (const r of rules || []) {
      const w = r.when || {};
      for (const e of [].concat(w.event || [])) events.push([e, where]);
      if (r.go && !stages[r.go]) err(`${where}: go to missing stage "${r.go}"`);
    }
  };
  walkRules(s.bonuses, 'bonuses');
  walkRules(s.guards, 'guards');
  for (const [id, st] of Object.entries(stages)) {
    walkRules(st.on, `stage ${id}`);
    if (!st.end && !(st.on || []).some((r) => r.go)) err(`stage ${id} has no way out`);
    if (st.target && !OBJECTS.has(st.target)) err(`stage ${id}: target "${st.target}" is not a room object`);
    if (st.decision && !st.objective) warn(`stage ${id}: decision without an objective`);
  }
  for (const [e, where] of events) {
    if (!EVENTS.has(e) && !SCENARIO_EVENTS.has(e)) err(`${where}: waits for "${e}", which nothing raises`);
  }
  // Every action used anywhere in the scenario.
  const usedActions = new Set();
  (function find(n) {
    if (Array.isArray(n)) return n.forEach(find);
    if (!n || typeof n !== 'object') return;
    if (typeof n.do === 'string') usedActions.add(n.do);
    Object.values(n).forEach(find);
  })(s);
  for (const a of usedActions) if (!ACTIONS.has(a)) err(`unknown action "${a}"`);

  // Reachability and the best careful score.
  const seen = new Set();
  const stack = [s.start];
  let endReached = false;
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || !stages[id]) continue;
    seen.add(id);
    if (stages[id].end) endReached = true;
    for (const r of stages[id].on || []) if (r.go) stack.push(r.go);
  }
  if (!endReached) err('no end stage is reachable from start');
  for (const id of Object.keys(stages)) if (!seen.has(id)) warn(`stage ${id} can never be reached`);

  // Bonuses in the same group are alternatives (either channel verifies), so
  // only the best of each group counts.
  const groups = new Map();
  let bonus = 0;
  for (const b of s.bonuses || []) {
    const pts = Math.max(0, (b.outcome || b).points || 0);
    if (b.group) groups.set(b.group, Math.max(groups.get(b.group) || 0, pts)); else bonus += pts;
  }
  for (const v of groups.values()) bonus += v;
  const best = (id, visiting = new Set()) => {
    const st = stages[id];
    if (!st || st.end || visiting.has(id)) return 0;
    visiting.add(id);
    let top = -Infinity;
    for (const r of st.on || []) {
      const pts = (r.outcome && r.outcome.points) || 0;
      const via = r.go ? best(r.go, new Set(visiting)) : (r.outcome ? -Infinity : 0);
      if (r.go || r.outcome) top = Math.max(top, pts + (r.go ? via : 0));
    }
    return top === -Infinity ? 0 : top;
  };
  const guardsPositive = [...(s.guards || [])].reduce((n, g) => n + Math.max(0, (g.outcome || g).points || 0), 0);
  const path = best(s.start);
  const total = bonus + path + guardsPositive;
  if (total < s.maxPoints * 0.8) err(`a careful player can only reach ${total} of ${s.maxPoints}: three stars are out of reach`);
  if (total > s.maxPoints * 1.25) warn(`a careful path scores ${total} against maxPoints ${s.maxPoints}: stars come too easily`);
  s._best = total;
}

for (const w of warnings) console.log(`warn  ${w}`);
for (const e of errors) console.log(`ERROR ${e}`);
console.log(`\n${scenarios.length} scenarios, ${errors.length} errors, ${warnings.length} warnings.`);
if (process.argv.includes('--table')) for (const s of scenarios) console.log(`${s.id.padEnd(32)} max ${String(s.maxPoints).padStart(3)}  careful ${s._best}`);
process.exit(errors.length ? 1 : 0);
