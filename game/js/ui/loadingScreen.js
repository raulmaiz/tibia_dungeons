// Loading-screen progress bar. Phase 5b hotfix — extracted from the engine
// so both the engine's preload phase AND the inventory panel's bootGame
// flow can drive it without crossing module boundaries via globals.

export function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loadingBar');
  const lbl = document.getElementById('loadingLabel');
  const num = document.getElementById('loadingPct');
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  if (bar) bar.style.width = `${p}%`;
  if (num) num.textContent = `${p}%`;
  if (lbl && label) lbl.textContent = label;
}
