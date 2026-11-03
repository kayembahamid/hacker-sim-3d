// A participant explicitly downloads this result. Export only the learning
// record shown in the debrief; never serialize the store, URL, browser storage,
// form fields, or other page state.
export function resultFor({ product, log, score, seed, mode }) {
  return {
    schemaVersion: 1,
    product: 'Hamcodes Labs',
    mode: { id: mode, label: product.modes.find((m) => m.id === mode)?.label || mode },
    seed,
    durationSeconds: log.elapsedSeconds(),
    totals: score.total(),
    scenarios: score.list().map(({ id, title, kind, points, max, stars, rewinds, overReports, events }) => ({
      id, title, kind, points, max, stars, rewinds, overReports,
      events: events.map(({ points, label, verdict, detail, ideal }) => ({ points, label, verdict, detail, ideal }))
    })),
    timeline: log.entries.filter((entry) => entry.kind !== 'trace').map(({ scenario, storyTime, kind, label, verdict, points }) => ({
      scenario, storyTime, kind, label, ...(verdict ? { verdict } : {}), ...(points !== undefined ? { points } : {})
    }))
  };
}

export function exportResult(engine) {
  const result = resultFor(engine);
  const content = `${JSON.stringify(result, null, 2)}\n`;
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `hamcodes-result-${result.scenarios.length === 1 ? result.scenarios[0].id : 'shift'}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to begin the download before releasing its object URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
