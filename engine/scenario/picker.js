// Which scenarios a run gets, and in what order. Seeded, so a seed always
// deals the same hand.
//
// A product's run config:
//   count     how many of the regular scenarios to play (the rest sit out)
//   first     ids that always open the run, in this order
//   last      ids that always close it (the cliffhanger)
//   byMode    optional per mode overrides of count
//
// Scenarios opt out of the shuffle with "pool": false (ambient content).
export function pickScenarios(all, run = {}, rng, mode) {
  const firstIds = run.first || [];
  const lastIds = run.last || all.filter((s) => s.finale).map((s) => s.id);
  const byId = new Map(all.map((s) => [s.id, s]));
  const first = firstIds.map((id) => byId.get(id)).filter(Boolean);
  const last = lastIds.map((id) => byId.get(id)).filter(Boolean);
  const pool = all.filter((s) => s.pool !== false && !firstIds.includes(s.id) && !lastIds.includes(s.id));
  const count = (run.byMode && run.byMode[mode] && run.byMode[mode].count) ?? run.count ?? pool.length;
  const middle = rng.sample(pool, Math.max(0, Math.min(pool.length, count - first.length)));
  return [...first, ...middle, ...last];
}
