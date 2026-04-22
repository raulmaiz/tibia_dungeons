// Combat log — 5-line ring buffer rendered into #gameLog0..#gameLog4.
//
// Used by the engine (combat/damage/ally events) and the inventory panel
// via the `setOnPanelLog(addCombatLog)` bridge in playerSession. Extracted
// to its own module so the engine doesn't carry the DOM ref + buffer state
// inside its already-huge closure.
//
// One instance per page. initCombatLog() MUST be called once at scene
// create time before any addCombatLog(). Safe to call addCombatLog()
// before init — it just no-ops until the DOM refs are grabbed.

export const LOG_COLORS = {
  DEFAULT: '#e8f0ff',
  HIT:     '#cbd5e1',
  CRIT:    '#fde047',
  SPELL:   '#7dd3fc',
};

const MAX_LINES = 5;
let gameLogEls = [];
const lines = [];

export function initCombatLog() {
  gameLogEls = [0, 1, 2, 3, 4].map((i) => document.getElementById(`gameLog${i}`));
  lines.length = 0;
  // Paint the (empty) initial state so leftover DOM text from a previous
  // run doesn't stick around.
  redraw();
}

export function addCombatLog(msg, color = LOG_COLORS.DEFAULT) {
  lines.push({ msg, color });
  if (lines.length > MAX_LINES) lines.shift();
  redraw();
}

function redraw() {
  for (let i = 0; i < gameLogEls.length; i += 1) {
    const el = gameLogEls[i];
    if (!el) continue;
    const line = lines[i];
    el.textContent = line ? String(line.msg) : '';
    el.style.color = line ? line.color : LOG_COLORS.DEFAULT;
  }
}
