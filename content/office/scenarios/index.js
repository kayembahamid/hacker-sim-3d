// Every JSON file in this folder is a scenario. Drop one in, it is picked up.
// No engine change, no registration list to edit.
const modules = import.meta.glob('./*.json', { eager: true, import: 'default' });

export const ALL_SCENARIOS = Object.entries(modules)
  .map(([path, data]) => ({ ...data, _file: path.replace('./', '') }))
  .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

export function scenarioById(id) { return ALL_SCENARIOS.find((s) => s.id === id); }
