// Death-summary + Hall of Fame overlays - Phase 4 extraction.
//
// Two full-screen overlays that live outside the Phaser canvas:
//
//   showDeathSummary(run, { onPlayAgain })
//       Shown when the player dies. Saves the run to the leaderboard,
//       displays stats (killed by / floor / kills / level / gold), and
//       offers "Hall of Fame" + "Play Again" buttons. The Play Again
//       teardown is engine-owned (it has to destroy the Phaser game
//       instance), so we take it as a callback.
//
//   showHallOfFame()
//       Standalone leaderboard viewer. Fetches /api/runs and renders a
//       top-100 table. Accessible from the start screen too (for a
//       peek before committing to a run).

/**
 * @typedef {object} DeathSummaryDeps
 * @property {() => void} onPlayAgain   - engine destroys the Phaser game + resets
 */

/** @type {DeathSummaryDeps | null} */
let deps = null;

/** @param {DeathSummaryDeps} _deps */
export function setupDeathSummary(_deps) {
  deps = _deps;
}

const CLASS_META = {
  knight:   { label: 'Elite Knight',    icon: '⚔️' },
  paladin:  { label: 'Royal Paladin',   icon: '🏹' },
  sorcerer: { label: 'Master Sorcerer', icon: '🔥' },
  druid:    { label: 'Elder Druid',     icon: '🌿' },
};

function fmtGold(g) {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M gp`;
  if (g >= 1_000)     return `${(g / 1_000).toFixed(1)}k gp`;
  return `${g} gp`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000)          return 'just now';
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function saveRun(run) {
  // Hall of Fame submissions are now authenticated (Level 4 security plan).
  // Guests silently skip posting - their run still stays on their screen but
  // doesn't land on the leaderboard.
  //
  // In the OFFLINE build there is no real leaderboard to pollute; every run
  // goes to localStorage so the player's personal Hall of Fame stays populated.
  const api = window.tdAuth && window.tdAuth.apiFetch;
  if (!api) return;
  if (!OFFLINE_BUILD) {
    const loggedIn = window.tdAuth.isLoggedIn && window.tdAuth.isLoggedIn();
    if (!loggedIn) return;
    // Admins play for testing - their deaths should never pollute the board,
    // even though god mode is available to them.
    if (window.tdAuth.isAdmin && window.tdAuth.isAdmin()) return;
  }
  try {
    await api('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
  } catch { /* silent - offline */ }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function showHallOfFame() {
  const existing = document.getElementById('hofOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'hofOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10001;
    background:
      radial-gradient(ellipse at 50% 30%, rgba(4,6,14,0.6) 0%, rgba(3,5,12,0.93) 65%, rgba(1,2,6,0.98) 100%),
      url('/data/images/game/sword.jpg') center/cover no-repeat fixed,
      #05070f;
    display: flex; flex-direction: column; align-items: center;
    font-family: "Segoe UI", system-ui, sans-serif; color: #efe4c9;
    animation: hofFadeIn 0.35s ease; overflow: hidden;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes hofFadeIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
      #hofOverlay::before {
        content: ''; position: absolute; inset: 0;
        background: repeating-linear-gradient(0deg, rgba(0,0,0,0.08) 0 1px, transparent 1px 3px);
        pointer-events: none; mix-blend-mode: multiply; opacity: 0.5;
      }
      #hofOverlay .hof-panel {
        position: relative;
        width: 100%; max-width: 920px;
        margin: 28px 16px;
        flex: 1; min-height: 0;
        display: flex; flex-direction: column;
        background: linear-gradient(165deg, rgba(24,18,10,0.88) 0%, rgba(10,12,24,0.92) 100%);
        border: 1px solid rgba(226,160,48,0.32);
        border-radius: 18px;
        box-shadow:
          0 0 0 1px rgba(226,160,48,0.08) inset,
          0 32px 80px rgba(0,0,0,0.85),
          0 0 90px rgba(226,160,48,0.08);
        backdrop-filter: blur(6px);
      }
      #hofOverlay .hof-panel::before {
        content: ''; position: absolute; top: 0; left: 14%; right: 14%; height: 2px;
        background: linear-gradient(90deg, transparent, #e2a030 50%, transparent);
        filter: blur(0.4px); opacity: 0.8;
      }
      #hofOverlay .hof-header {
        padding: 26px 32px 0;
        display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
      }
      #hofOverlay .hof-title-wrap { display: flex; align-items: center; gap: 14px; }
      #hofOverlay .hof-trophy { font-size: 2.2rem; filter: drop-shadow(0 0 14px rgba(244,192,84,0.7)); }
      #hofOverlay .hof-title {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: clamp(1.4rem, 3vw, 1.9rem); font-weight: 900;
        letter-spacing: 0.14em; text-transform: uppercase; color: #f4c054;
        text-shadow:
          0 0 24px rgba(226,160,48,0.55),
          0 0 4px rgba(255,200,120,0.7),
          0 2px 0 rgba(0,0,0,0.7);
      }
      #hofOverlay .hof-subtitle { font-size: 0.72rem; color: #c9b589; letter-spacing: 0.22em; text-transform: uppercase; margin-top: 3px; opacity: 0.8; }
      #hofOverlay .hof-close {
        background: rgba(138, 42, 42, 0.28); border: 1px solid rgba(215, 72, 72, 0.45);
        border-radius: 8px; color: #f5c5c5; font-size: 0.78rem; font-weight: 700;
        padding: 8px 14px;
        letter-spacing: 0.12em; text-transform: uppercase;
        cursor: pointer; font-family: inherit;
        transition: background 0.15s, color 0.15s, box-shadow 0.15s;
      }
      #hofOverlay .hof-close:hover {
        background: rgba(153, 27, 27, 0.55); color: #fff;
        box-shadow: 0 0 18px rgba(215,72,72,0.3);
      }
      #hofOverlay .hof-divider {
        height: 1px; margin: 18px 32px 0; flex-shrink: 0;
        background: linear-gradient(90deg, transparent, rgba(226,160,48,0.45), transparent);
      }
      #hofOverlay .hof-scroll {
        flex: 1; overflow-y: auto; padding: 0 32px 28px;
        scrollbar-width: thin; scrollbar-color: rgba(226,160,48,0.3) transparent;
      }
      #hofOverlay .hof-scroll::-webkit-scrollbar { width: 5px; }
      #hofOverlay .hof-scroll::-webkit-scrollbar-thumb { background: rgba(226,160,48,0.35); border-radius: 3px; }
      #hofOverlay table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      #hofOverlay thead th {
        font-size: 0.68rem; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase;
        color: #c9b589; padding: 0 10px 10px; text-align: left; white-space: nowrap;
        border-bottom: 1px solid rgba(226,160,48,0.25);
        opacity: 0.85;
      }
      #hofOverlay thead th.col-num { text-align: center; width: 44px; }
      #hofOverlay thead th.col-num2 { text-align: right; }
      #hofOverlay tbody tr {
        border-bottom: 1px solid rgba(226,160,48,0.08);
        transition: background 0.12s;
      }
      #hofOverlay tbody tr:hover { background: rgba(226,160,48,0.07); }
      #hofOverlay tbody tr.hof-me {
        background: linear-gradient(90deg, rgba(226,160,48,0.1), rgba(226,160,48,0.04));
        box-shadow: inset 3px 0 0 #f4c054;
      }
      #hofOverlay tbody tr.hof-me td { color: #ffe7ba; }
      #hofOverlay tbody td {
        padding: 11px 10px; font-size: 0.88rem; color: #d9cba8; white-space: nowrap;
      }
      #hofOverlay td.col-rank { text-align: center; font-weight: 900; font-size: 1rem; width: 44px; color: #c9b589; }
      #hofOverlay td.col-num2 { text-align: right; }
      #hofOverlay .col-name { font-weight: 700; color: #efe4c9; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
      #hofOverlay .col-class { color: #c9b589; }
      #hofOverlay .col-floor { font-weight: 800; font-size: 1rem; color: #efe4c9; }
      #hofOverlay .col-gold { color: #f4c054; font-weight: 700; text-shadow: 0 0 6px rgba(226,160,48,0.35); }
      #hofOverlay .col-killedby { color: #f5a9a9; font-size: 0.82rem; }
      #hofOverlay .col-date { color: #8c7858; font-size: 0.78rem; }
      #hofOverlay .rank-medal { font-size: 1.15rem; filter: drop-shadow(0 0 6px rgba(244,192,84,0.55)); }
      #hofOverlay .hof-loading, #hofOverlay .hof-empty, #hofOverlay .hof-error {
        text-align: center; padding: 60px 20px; color: #9a8468;
        font-size: 0.95rem; letter-spacing: 0.1em;
      }
      #hofOverlay .hof-error { color: #f5a9a9; }
      #hofOverlay .hof-spinner {
        display: inline-block; width: 28px; height: 28px;
        border: 3px solid rgba(226,160,48,0.18); border-top-color: #f4c054;
        border-radius: 50%; animation: hofSpin 0.7s linear infinite; margin-bottom: 14px;
      }
      @keyframes hofSpin { to { transform: rotate(360deg); } }
    </style>
    <div class="hof-panel">
      <div class="hof-header">
        <div class="hof-title-wrap">
          <span class="hof-trophy">🏆</span>
          <div>
            <div class="hof-title">Hall of Fame</div>
            <div class="hof-subtitle">${OFFLINE_BUILD ? 'Your personal top runs on this device' : 'Top 100 adventurers of all time'}</div>
          </div>
        </div>
        <button class="hof-close" id="hofCloseBtn">✕ Close</button>
      </div>
      <div class="hof-divider"></div>
      <div class="hof-scroll">
        <div class="hof-loading" id="hofContent">
          <div class="hof-spinner"></div><br>Loading leaderboard...
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('hofCloseBtn').addEventListener('click', () => overlay.remove());

  const MEDALS = ['🥇', '🥈', '🥉'];

  const hofFetch = (window.tdAuth && window.tdAuth.apiFetch) || fetch;
  hofFetch('/api/runs')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ runs }) => {
      const content = document.getElementById('hofContent');
      if (!content) return;
      if (!runs || runs.length === 0) {
        content.outerHTML = '<div class="hof-empty">No runs recorded yet. Be the first!</div>';
        return;
      }
      const rows = runs.map((run, i) => {
        const rank = i + 1;
        const medal = MEDALS[i] ?? rank;
        const cls = CLASS_META[run.classKey] || { label: escHtml(String(run.classKey || '—')), icon: '❓' };
        const sexIcon = run.sex === 'female' ? '♀' : '♂';
        return `
          <tr>
            <td class="col-rank">${rank <= 3 ? `<span class="rank-medal">${medal}</span>` : rank}</td>
            <td class="col-name">${sexIcon} ${escHtml(run.name)}</td>
            <td class="col-class">${cls.icon} ${escHtml(cls.label)}</td>
            <td class="col-floor col-num2">${Number(run.floor) || 0}</td>
            <td class="col-num2">${Number(run.kills) || 0}</td>
            <td class="col-num2">${Number(run.playerLevel) || 0}</td>
            <td class="col-gold col-num2">${fmtGold(Number(run.gold) || 0)}</td>
            <td class="col-killedby">${escHtml(run.killedBy || '—')}</td>
            <td class="col-date col-num2">${fmtDate(Number(run.ts) || 0)}</td>
          </tr>`;
      }).join('');

      content.outerHTML = `
        <table>
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>Name</th>
              <th>Class</th>
              <th class="col-num2">Floor</th>
              <th class="col-num2">Kills</th>
              <th class="col-num2">Level</th>
              <th class="col-num2">Gold</th>
              <th>Killed by</th>
              <th class="col-num2">Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .catch(() => {
      const content = document.getElementById('hofContent');
      if (content) content.outerHTML = '<div class="hof-error">Could not load leaderboard.<br><small>Hall of Fame requires the deployed version.</small></div>';
    });
}

export function showDeathSummary({ name, classKey, sex, floor, kills, playerLevel, gold, killedBy }) {
  const existing = document.getElementById('deathSummaryOverlay');
  if (existing) existing.remove();

  // Save run to leaderboard silently
  saveRun({ name, classKey, sex, floor, kills, playerLevel, gold, killedBy });

  const cls = CLASS_META[String(classKey).toLowerCase()] || { label: classKey, icon: '' };

  const overlay = document.createElement('div');
  overlay.id = 'deathSummaryOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: radial-gradient(ellipse at center, rgba(10,15,30,0.97) 0%, rgba(5,8,18,0.99) 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: "Segoe UI", system-ui, sans-serif; color: #e2e8f0;
    animation: fadeInOverlay 0.6s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes fadeInOverlay { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
      @keyframes pulseRed { 0%,100% { text-shadow:0 0 30px #ef4444,0 0 60px #ef444488; } 50% { text-shadow:0 0 50px #ef4444,0 0 100px #ef444455; } }
      #deathSummaryOverlay .death-title {
        font-size: clamp(2.5rem,6vw,4.5rem); font-weight:900; letter-spacing:0.15em;
        color:#ef4444; text-transform:uppercase;
        animation:pulseRed 2s ease-in-out infinite; margin-bottom:0.2em;
      }
      #deathSummaryOverlay .death-subtitle {
        font-size:clamp(0.85rem,2vw,1.05rem); color:#64748b; letter-spacing:0.18em;
        text-transform:uppercase; margin-bottom:2em;
      }
      #deathSummaryOverlay .stats-card {
        background:linear-gradient(165deg,rgba(22,36,58,0.9) 0%,rgba(8,14,26,0.95) 100%);
        border:1px solid rgba(56,189,248,0.18); border-radius:16px;
        padding:1.6em 2.8em; min-width:min(400px,90vw);
        box-shadow:0 20px 60px rgba(0,0,0,0.6); margin-bottom:2em;
      }
      #deathSummaryOverlay .stat-row {
        display:flex; justify-content:space-between; align-items:center;
        padding:0.5em 0; border-bottom:1px solid rgba(255,255,255,0.06);
        font-size:clamp(0.88rem,1.8vw,1rem);
      }
      #deathSummaryOverlay .stat-row:last-child { border-bottom:none; }
      #deathSummaryOverlay .stat-label { color:#64748b; }
      #deathSummaryOverlay .stat-value { color:#e2e8f0; font-weight:700; }
      #deathSummaryOverlay .btn-row { display:flex; gap:12px; }
      #deathSummaryOverlay .btn-hof {
        background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.3));
        color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); border-radius:10px;
        padding:0.85em 1.6em; font-size:clamp(0.88rem,1.8vw,1rem);
        font-weight:700; letter-spacing:0.06em; cursor:pointer;
        transition:transform 0.15s,box-shadow 0.15s,background 0.15s;
      }
      #deathSummaryOverlay .btn-hof:hover {
        background:linear-gradient(135deg,rgba(99,102,241,0.35),rgba(99,102,241,0.45));
        transform:translateY(-2px); box-shadow:0 6px 20px rgba(99,102,241,0.25);
      }
      #deathSummaryOverlay .btn-play {
        background:linear-gradient(135deg,#1e40af,#1d4ed8);
        color:#fff; border:none; border-radius:10px;
        padding:0.85em 2em; font-size:clamp(0.88rem,1.8vw,1rem);
        font-weight:700; letter-spacing:0.08em; cursor:pointer;
        box-shadow:0 6px 24px rgba(29,78,216,0.4);
        transition:transform 0.15s,box-shadow 0.15s,background 0.15s;
        text-transform:uppercase;
      }
      #deathSummaryOverlay .btn-play:hover {
        background:linear-gradient(135deg,#2563eb,#3b82f6);
        transform:translateY(-2px); box-shadow:0 10px 32px rgba(59,130,246,0.5);
      }
      #deathSummaryOverlay .btn-play:active,
      #deathSummaryOverlay .btn-hof:active { transform:translateY(0); }
    </style>
    <div class="death-title">You Died</div>
    <div class="death-subtitle">${cls.icon} ${escHtml(name)} &mdash; ${cls.label}</div>
    <div class="stats-card">
      <div class="stat-row"><span class="stat-label">Killed by</span><span class="stat-value" style="color:#f87171;">${escHtml(killedBy || 'Unknown')}</span></div>
      <div class="stat-row"><span class="stat-label">Floor reached</span><span class="stat-value">${floor}</span></div>
      <div class="stat-row"><span class="stat-label">Creatures killed</span><span class="stat-value">${kills}</span></div>
      <div class="stat-row"><span class="stat-label">Player level</span><span class="stat-value">${playerLevel}</span></div>
      <div class="stat-row"><span class="stat-label">Gold earned</span><span class="stat-value">${fmtGold(gold)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn-hof" id="hofBtn">🏆 Hall of Fame</button>
      <button class="btn-play" id="playAgainBtn">▶ Play Again</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('hofBtn').addEventListener('click', () => showHallOfFame());

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    overlay.remove();
    if (deps && typeof deps.onPlayAgain === 'function') deps.onPlayAgain();
    if (typeof window._resetInventoryForNewRun === 'function') {
      window._resetInventoryForNewRun();
    }
    const startOverlay = document.getElementById('startOverlay');
    if (startOverlay) startOverlay.style.display = '';
  });
}
