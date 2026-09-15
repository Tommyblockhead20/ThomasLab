const marks = [];
const start = globalThis.performance?.now?.() ?? Date.now();

export function markStartup(stage) {
  const now = globalThis.performance?.now?.() ?? Date.now();
  marks.push({ stage, atMs: Math.round((now - start) * 10) / 10 });
}

export function getStartupTimings() {
  const navigation = globalThis.performance?.getEntriesByType?.('navigation')?.[0];
  return {
    navigation: navigation ? {
      responseEndMs: Math.round(navigation.responseEnd),
      domInteractiveMs: Math.round(navigation.domInteractive)
    } : null,
    stages: marks.map((mark, index) => ({
      ...mark,
      sincePreviousMs: Math.round((mark.atMs - (marks[index - 1]?.atMs ?? 0)) * 10) / 10
    }))
  };
}

export function reportStartupTimings() {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('startup')) {
    // The opt-in overlay lets a browser smoke test capture timings without a devtools
    // connection; normal gameplay never creates it.
    globalThis.setTimeout(() => {
      const report = getStartupTimings();
      console.table(report.stages);
      const panel = document.createElement('pre');
      panel.id = 'startup-timings';
      panel.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99999;max-width:420px;max-height:90vh;overflow:auto;padding:10px;background:#102a27ee;color:#e8fff2;font:11px/1.4 monospace;pointer-events:none';
      panel.textContent = report.stages.map(({ stage, atMs, sincePreviousMs }) =>
        `${stage}: ${atMs}ms (+${sincePreviousMs}ms)`).join('\n');
      document.body.appendChild(panel);
    }, 500);
  }
}
