/**
 * Auth bootstrap. Runs before the game code.
 *
 * - If a valid session token sits in localStorage → jump straight to the
 *   character-creation overlay with the name prefilled and locked.
 * - Otherwise → keep the character-creation overlay hidden and show the
 *   login / register panel. Successful auth auto-transitions to the
 *   character overlay (register flow auto-logs in as part of the same
 *   POST response).
 */

const AUTH_TOKEN_KEY = 'td.authToken';
const AUTH_NAME_KEY  = 'td.authName';

function setAuth(token, name) {
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_NAME_KEY, name);
  } catch { /* ignore quota / private mode */ }
}
function clearAuth() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_NAME_KEY);
  } catch { /* ignore */ }
}
function getAuthToken() {
  try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

// Expose the token so other modules (game engine) can call /api/saves
// without having to re-implement the localStorage key constants.
window.tdAuth = {
  getToken: getAuthToken,
  clear:    clearAuth,
};

async function verifyToken() {
  const t = getAuthToken();
  if (!t) return null;
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${t}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data && data.name ? data : null;
  } catch { return null; }
}

async function submitAuth(mode, name, password) {
  const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-json */ }
    if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
    return { token: data.token, name: data.name };
  } catch {
    return { error: 'Network error — is the server running?' };
  }
}

function showCharacterOverlay(name, { guest = false } = {}) {
  const authOverlay  = document.getElementById('authOverlay');
  const startOverlay = document.getElementById('startOverlay');
  const playerName   = document.getElementById('playerName');
  const loadBtn      = document.getElementById('loadGameBtn');
  if (authOverlay) authOverlay.style.display = 'none';
  if (startOverlay) startOverlay.style.display = '';
  if (playerName) {
    playerName.value = name || '';
    // Guests pick their own display name; authenticated users keep theirs.
    playerName.readOnly = !guest;
    setTimeout(() => {
      const target = guest ? playerName : document.getElementById('startBtn');
      if (target) target.focus();
    }, 30);
  }
  // "Load saved game" is reserved for authenticated users only.
  if (loadBtn) loadBtn.style.display = guest ? 'none' : '';
}

function showAuthOverlay() {
  const authOverlay  = document.getElementById('authOverlay');
  const startOverlay = document.getElementById('startOverlay');
  const savesOverlay = document.getElementById('savesOverlay');
  if (authOverlay) authOverlay.style.display = '';
  if (startOverlay) startOverlay.style.display = 'none';
  if (savesOverlay) savesOverlay.style.display = 'none';
  const firstField = document.getElementById('authName');
  if (firstField) firstField.focus();
}

const CLASS_ICON = { knight: '⚔️', paladin: '🏹', sorcerer: '🔥', druid: '🌿' };
const CLASS_LABEL = { knight: 'Knight', paladin: 'Paladin', sorcerer: 'Sorcerer', druid: 'Druid' };

function formatSaveTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000)    return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let cachedSaves = [];
async function fetchSaves() {
  const token = getAuthToken();
  if (!token) { cachedSaves = []; return []; }
  try {
    const res = await fetch('/api/saves', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { cachedSaves = []; return []; }
    const data = await res.json();
    cachedSaves = Array.isArray(data && data.saves) ? data.saves : [];
    return cachedSaves;
  } catch { cachedSaves = []; return []; }
}

async function deleteSaveById(id) {
  const token = getAuthToken();
  if (!token || !id) return false;
  try {
    const res = await fetch(`/api/saves?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch { return false; }
}

// Mode that drives the save-list UI:
//   'load' → Resume + Delete (default, reached from character overlay)
//   'save' → Save button only, plus a "Save as new slot" card at the top
let savesMode = 'load';

function readPendingSnapshot() {
  try {
    const raw = sessionStorage.getItem('td.pendingSnapshot');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function readPendingSaveId() {
  try { return sessionStorage.getItem('td.pendingSaveId') || null; } catch { return null; }
}
function clearPendingSnapshot() {
  try {
    sessionStorage.removeItem('td.pendingSnapshot');
    sessionStorage.removeItem('td.pendingSaveId');
  } catch { /* ignore */ }
}

async function postSnapshot(snapshot, id) {
  const token = getAuthToken();
  if (!token) return { error: 'Not authenticated' };
  try {
    const res = await fetch('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(id ? { snapshot, id } : { snapshot }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
    return { id: data.id };
  } catch { return { error: 'Network error' }; }
}

function renderSaveCard(save, mode) {
  const c = save.character || {};
  const classKey = String(c.classKey || 'knight').toLowerCase();
  const icon  = CLASS_ICON[classKey] || '•';
  const label = CLASS_LABEL[classKey] || 'Adventurer';
  const actions = mode === 'save'
    ? `<button type="button" class="save-action resume" data-action="save" data-id="${save.id}">Save</button>`
    : `
      <button type="button" class="save-action resume" data-action="resume" data-id="${save.id}">Resume</button>
      <button type="button" class="save-action delete" data-action="delete" data-id="${save.id}">Delete</button>
    `;
  const card = document.createElement('div');
  card.className = 'save-card';
  card.innerHTML = `
    <div class="save-class-icon">${icon}</div>
    <div class="save-main">
      <div class="save-name">${escapeHtml(c.name || 'Adventurer')} <span style="color:#64748b;font-weight:500;font-size:0.78rem;"> · ${label}</span></div>
      <div class="save-sub">
        <span><span class="save-stat-label">Lv</span><span class="save-stat-val">${c.level || 1}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Floor</span><span class="save-stat-val">${save.floor || 1}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">HP</span><span class="save-stat-val">${save.hp || 0}/${save.maxHp || 0}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Gold</span><span class="save-stat-val">${save.gold || 0}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Kills</span><span class="save-stat-val">${save.kills || 0}</span></span>
        <span class="sep">·</span>
        <span style="color:#64748b;">${formatSaveTimestamp(save.ts)}</span>
      </div>
    </div>
    <div class="save-actions">${actions}</div>
  `;
  return card;
}

function renderPendingRunCard(snapshot) {
  // First-time save for this run — no existing slot yet. We preview the
  // current run stats straight from the pending snapshot so the player
  // sees what they're about to commit.
  if (!snapshot) return null;
  const classKey = String(snapshot.classKey || 'knight').toLowerCase();
  const icon  = CLASS_ICON[classKey] || '•';
  const label = CLASS_LABEL[classKey] || 'Adventurer';
  const card = document.createElement('div');
  card.className = 'save-card';
  card.innerHTML = `
    <div class="save-class-icon">${icon}</div>
    <div class="save-main">
      <div class="save-name">${escapeHtml(snapshot.name || 'Adventurer')} <span style="color:#64748b;font-weight:500;font-size:0.78rem;"> · ${label}</span></div>
      <div class="save-sub">
        <span><span class="save-stat-label">Lv</span><span class="save-stat-val">${snapshot.playerLevel || 1}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Floor</span><span class="save-stat-val">${snapshot.currentLevel || 1}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">HP</span><span class="save-stat-val">${snapshot.playerHp || 0}/${snapshot.playerMaxHp || 0}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Gold</span><span class="save-stat-val">${snapshot.gold || 0}</span></span>
        <span class="sep">·</span>
        <span><span class="save-stat-label">Kills</span><span class="save-stat-val">${snapshot.runKills || 0}</span></span>
        <span class="sep">·</span>
        <span style="color:#64748b;">current run</span>
      </div>
    </div>
    <div class="save-actions">
      <button type="button" class="save-action resume" data-action="save" data-id="">Save</button>
    </div>
  `;
  return card;
}

async function finalizeSaveAndExit(id) {
  // Returning to the character-creation overlay — same behaviour as closing
  // the run. We clear the pending snapshot and the hash, then hand over to
  // the overlay the user would see on a fresh boot.
  clearPendingSnapshot();
  if (window.location.hash) {
    // Strip the hash without triggering a reload.
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  const name = (localStorage.getItem(AUTH_NAME_KEY) || '').trim();
  if (name) showCharacterOverlay(name);
  else showAuthOverlay();
}

async function renderSavesScreen() {
  const list = document.getElementById('savesList');
  const titleEl = document.querySelector('#savesOverlay .panel-title');
  if (!list) return;
  if (titleEl) titleEl.textContent = savesMode === 'save' ? 'Save Game' : 'Load Game';
  list.innerHTML = '<div class="saves-empty">Loading…</div>';
  const saves = await fetchSaves();
  list.innerHTML = '';

  if (savesMode === 'save') {
    // The Save screen is strictly about the current run: only show the slot
    // this run lives in (if we resumed from one) so the Save button can
    // overwrite that same record. No "new slot" option.
    const pendingId = readPendingSaveId();
    const pendingSnapshot = readPendingSnapshot();
    if (pendingId) {
      const match = saves.find((s) => s.id === pendingId);
      if (match) list.appendChild(renderSaveCard(match, 'save'));
      else if (pendingSnapshot) list.appendChild(renderPendingRunCard(pendingSnapshot));
    } else if (pendingSnapshot) {
      list.appendChild(renderPendingRunCard(pendingSnapshot));
    } else {
      list.innerHTML = '<div class="saves-empty">No active run to save. Press "Save and Exit" from the game.</div>';
    }
    return;
  }

  if (!saves.length) {
    list.innerHTML = '<div class="saves-empty">No saved games yet.</div>';
    return;
  }
  for (const save of saves) list.appendChild(renderSaveCard(save, savesMode));
}

// Permanent event delegation on the saves list — we attach it once at
// bootstrap time (wireSavesScreen) so re-renders don't leak listeners and
// a stray click in the grid doesn't consume a "once" handler.
async function handleSavesListClick(ev) {
  const btn = ev.target.closest('.save-action');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id || null;

  if (action === 'delete') {
    if (!confirm('Delete this save? This cannot be undone.')) return;
    btn.disabled = true;
    const ok = await deleteSaveById(id);
    if (ok) renderSavesScreen();
    else btn.disabled = false;
    return;
  }
  if (action === 'resume') {
    const save = (cachedSaves || []).find((s) => s.id === id);
    const snapshot = save && save.snapshot;
    if (!snapshot) { alert('This save is missing its snapshot and cannot be resumed.'); return; }
    if (!window.tdGame || typeof window.tdGame.resume !== 'function') {
      alert('Game engine not ready yet. Reload the page and try again.'); return;
    }
    window.tdGame.resume(snapshot, save.id);
    return;
  }
  if (action === 'save') {
    const snapshot = readPendingSnapshot();
    if (!snapshot) {
      alert('No active run to save — return to the game and use "Save and Exit".');
      return;
    }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Saving…';
    // Empty id → first save for this run (server creates the slot).
    // Non-empty id → overwrite the existing slot for this run.
    const targetId = id || null;
    const result = await postSnapshot(snapshot, targetId);
    if (result.error) {
      alert(`Save failed: ${result.error}`);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    await finalizeSaveAndExit(result.id);
  }
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showSavesOverlay(mode = 'load') {
  savesMode = mode === 'save' ? 'save' : 'load';
  const authOverlay  = document.getElementById('authOverlay');
  const startOverlay = document.getElementById('startOverlay');
  const savesOverlay = document.getElementById('savesOverlay');
  if (authOverlay)  authOverlay.style.display = 'none';
  if (startOverlay) startOverlay.style.display = 'none';
  if (savesOverlay) savesOverlay.style.display = '';
  renderSavesScreen();
}

function wireSavesScreen() {
  const closeBtn = document.getElementById('savesCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      // Going "back" drops the user on the character overlay. If they were
      // in Save Game mode without committing, discard the pending snapshot
      // so it isn't dangling in sessionStorage.
      if (savesMode === 'save') clearPendingSnapshot();
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      const name = (localStorage.getItem(AUTH_NAME_KEY) || '').trim();
      if (name) showCharacterOverlay(name);
      else showAuthOverlay();
    });
  }
  const list = document.getElementById('savesList');
  if (list) list.addEventListener('click', handleSavesListClick);
}

// Exposed by wireAuthForm so bootstrapAuth can flip the form into the
// "register" tab when we detect a guest run that needs to be saved.
let authSetMode = null;

function wireAuthForm() {
  const form       = document.getElementById('authForm');
  const nameEl     = document.getElementById('authName');
  const passEl     = document.getElementById('authPassword');
  const repEl      = document.getElementById('authRepeat');
  const repGroup   = document.getElementById('authRepeatGroup');
  const errEl      = document.getElementById('authError');
  const submit     = document.getElementById('authSubmit');
  const tabLogin   = document.getElementById('authTabLogin');
  const tabReg     = document.getElementById('authTabRegister');
  const subtitleEl = document.getElementById('authSubtitle');
  if (!form || !nameEl || !passEl || !submit || !tabLogin || !tabReg) return;

  let mode = 'login';

  const setMode = (m) => {
    mode = m;
    tabLogin.classList.toggle('active', m === 'login');
    tabReg.classList.toggle('active', m === 'register');
    if (repGroup) repGroup.style.display = m === 'register' ? '' : 'none';
    submit.textContent = m === 'register' ? 'Create account' : 'Log in';
    const hasPendingSave = !!readPendingSnapshot();
    if (subtitleEl) {
      if (hasPendingSave) {
        subtitleEl.textContent = m === 'register'
          ? 'Create an account to save your run'
          : 'Sign in to save your run';
      } else {
        subtitleEl.textContent = m === 'register' ? 'Create your account' : 'Sign in to play';
      }
    }
    errEl.textContent = '';
    if (repEl) repEl.value = '';
  };
  authSetMode = setMode;

  tabLogin.addEventListener('click', (ev) => { ev.preventDefault(); setMode('login'); });
  tabReg.addEventListener('click',  (ev) => { ev.preventDefault(); setMode('register'); });

  const guestBtn = document.getElementById('authGuestBtn');
  if (guestBtn) {
    guestBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      clearAuth();
      showCharacterOverlay('', { guest: true });
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errEl.textContent = '';
    const name     = (nameEl.value || '').trim();
    const password = passEl.value || '';
    const repeat   = (repEl && repEl.value) || '';

    // Client-side validation mirroring the server.
    if (!name)              { errEl.textContent = 'Name required'; return; }
    if (name.length > 12)   { errEl.textContent = 'Name too long (max 12)'; return; }
    if (password.length < 6){ errEl.textContent = 'Password must be at least 6 characters'; return; }
    if (mode === 'register' && password !== repeat) {
      errEl.textContent = 'Passwords do not match';
      return;
    }

    submit.disabled = true;
    const prevLabel = submit.textContent;
    submit.textContent = mode === 'register' ? 'Creating…' : 'Signing in…';
    const result = await submitAuth(mode, name, password);
    submit.disabled = false;
    submit.textContent = prevLabel;

    if (result.error) {
      errEl.textContent = result.error;
      return;
    }
    setAuth(result.token, result.name);
    // If the player arrived from an in-game "Save and Exit" while still a
    // guest, there's a pending snapshot waiting — drop them on the Save
    // Game screen so they can commit it right away.
    if (window.location.hash === '#/saves/save' && readPendingSnapshot()) {
      showSavesOverlay('save');
      return;
    }
    showCharacterOverlay(result.name);
  });

  nameEl.focus();
}

function wireLoadGameButton() {
  const btn = document.getElementById('loadGameBtn');
  if (!btn) return;
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    window.location.hash = '#/saves/load';
    showSavesOverlay('load');
  });
}

async function bootstrapAuth() {
  // Hide overlays until we've decided which one belongs on screen.
  const startOverlay = document.getElementById('startOverlay');
  const savesOverlay = document.getElementById('savesOverlay');
  if (startOverlay) startOverlay.style.display = 'none';
  if (savesOverlay) savesOverlay.style.display = 'none';

  wireAuthForm();
  wireLoadGameButton();
  wireSavesScreen();

  const me = await verifyToken();
  if (me && me.name) {
    // URL-hash routing: #/saves/save → Save Game screen,
    //                   #/saves/load → Load Game screen,
    //                   #/saves       → legacy alias for load.
    const h = window.location.hash;
    if (h === '#/saves/save') {
      showSavesOverlay('save');
      return;
    }
    if (h === '#/saves/load' || h === '#/saves') {
      showSavesOverlay('load');
      return;
    }
    showCharacterOverlay(me.name);
    return;
  }
  clearAuth();
  showAuthOverlay();
  // Guest player who just hit "Save and Exit" — nudge them straight to
  // the Register tab so the default submit creates an account and then
  // commits the pending snapshot.
  if (window.location.hash === '#/saves/save' && readPendingSnapshot() && typeof authSetMode === 'function') {
    authSetMode('register');
  }
}

// Run immediately; the overlays are in the DOM because this module is
// loaded as `type="module"` at the end of <body>.
bootstrapAuth();

export const authApi = {
  getAuthToken,
  clearAuth,
};
