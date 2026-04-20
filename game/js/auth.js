/**
 * Auth bootstrap. Runs before the game code.
 *
 * Sessions now live in an HttpOnly cookie (`td_session`). This module:
 *   - Never touches the session token — the browser sends it automatically.
 *   - Reads `td_csrf` (non-HttpOnly) and echoes it in `X-CSRF-Token` on every
 *     state-changing request (double-submit).
 *   - Keeps the display name in localStorage for UX only (avoids a round-trip
 *     to /api/auth/me on cold boot to decide which overlay to show).
 *
 * When built with OFFLINE_BUILD=true (scripts/build.js --offline), every
 * `/api/*` call is routed through `offlineFetch` (localStorage-backed), and
 * the login overlay is bypassed — the player goes straight into character
 * select with a persisted guest name.
 */

import { offlineFetch, offlineCurrentName, offlineSetName } from './offline-api.js';

const AUTH_NAME_KEY = 'td.authName';
const CSRF_COOKIE   = 'td_csrf';

// Cached role for the signed-in session. Updated by verifyToken() / submitAuth()
// / logout(). Used by the engine to gate admin-only debug tooling
// (window.debugGod). This is a UX guard — a determined user with DevTools can
// always patch client-side state, so no security decision should depend on it.
let currentRole = 'user';
function setCurrentRole(role) { currentRole = role === 'admin' ? 'admin' : 'user'; }

function readCookie(name) {
  const raw = document.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function csrfToken() { return readCookie(CSRF_COOKIE); }

function setAuthName(name) {
  try { localStorage.setItem(AUTH_NAME_KEY, name); } catch { /* ignore */ }
}
function clearAuthName() {
  try { localStorage.removeItem(AUTH_NAME_KEY); } catch { /* ignore */ }
}
function getAuthName() {
  try { return localStorage.getItem(AUTH_NAME_KEY) || ''; } catch { return ''; }
}

async function apiFetch(url, opts = {}) {
  if (OFFLINE_BUILD) return offlineFetch(url, opts);
  const headers = Object.assign({}, opts.headers || {});
  const method = (opts.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const t = csrfToken();
    if (t) headers['X-CSRF-Token'] = t;
  }
  return fetch(url, Object.assign({}, opts, { headers, credentials: 'same-origin' }));
}

async function logout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); }
  catch { /* best effort — the cookies will be cleared server-side */ }
  clearAuthName();
  setCurrentRole('user');
}

let openedFromActiveGame = false;

window.tdAuth = {
  getName:    getAuthName,
  isLoggedIn: () => !!getAuthName(),
  getRole:    () => currentRole,
  isAdmin:    () => currentRole === 'admin',
  csrfToken,
  apiFetch,
  clear:      logout,
  openSaveScreen() {
    if (getAuthName()) {
      openedFromActiveGame = true;
      window.location.hash = '#/saves/save';
      showSavesOverlay('save');
    } else {
      window.location.hash = '#/saves/save';
      window.location.reload();
    }
  },
};

async function verifyToken() {
  try {
    const res = await apiFetch('/api/auth/me');
    if (!res.ok) { setCurrentRole('user'); return null; }
    const data = await res.json();
    if (data && data.name) {
      setCurrentRole(data.role || 'user');
      return data;
    }
    setCurrentRole('user');
    return null;
  } catch { setCurrentRole('user'); return null; }
}

async function submitAuth(mode, name, password) {
  const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
  try {
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* non-json */ }
    if (!res.ok) return { error: data.error || 'Sign-in failed' };
    setAuthName(data.name || name);
    setCurrentRole(data.role || 'user');
    return { name: data.name };
  } catch {
    return { error: 'Network error — is the server running?' };
  }
}

function showCharacterOverlay(name, { guest = false } = {}) {
  const authOverlay  = document.getElementById('authOverlay');
  const startOverlay = document.getElementById('startOverlay');
  const playerName   = document.getElementById('playerName');
  const loadBtn      = document.getElementById('loadGameBtn');
  const logoutBtn    = document.getElementById('logoutBtn');
  if (authOverlay) authOverlay.style.display = 'none';
  if (startOverlay) startOverlay.style.display = '';
  if (playerName) {
    playerName.value = name || '';
    playerName.readOnly = !guest;
    setTimeout(() => {
      const target = guest ? playerName : document.getElementById('startBtn');
      if (target) target.focus();
    }, 30);
  }
  if (loadBtn)   loadBtn.style.display   = guest ? 'none' : '';
  if (logoutBtn) logoutBtn.style.display = guest ? 'none' : '';
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

const CLASS_ICON  = { knight: '⚔️', paladin: '🏹', sorcerer: '🔥', druid: '🌿' };
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
  try {
    const res = await apiFetch('/api/saves');
    if (!res.ok) { cachedSaves = []; return []; }
    const data = await res.json();
    cachedSaves = Array.isArray(data && data.saves) ? data.saves : [];
    return cachedSaves;
  } catch { cachedSaves = []; return []; }
}

async function deleteSaveById(id) {
  if (!id || !/^[a-f0-9]{8,64}$/.test(id)) return false;
  try {
    const res = await apiFetch(`/api/saves?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  } catch { return false; }
}

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
  try {
    const res = await apiFetch('/api/saves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { snapshot, id } : { snapshot }),
    });
    let data = {};
    try { data = await res.json(); } catch { /* ignore */ }
    if (!res.ok) return { error: data.error || 'Save failed' };
    return { id: data.id };
  } catch { return { error: 'Network error' }; }
}

// ── Safe DOM builders (Level 6: no more innerHTML for user data) ──────
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'style') node.setAttribute('style', v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function buildStat(label, value) {
  return el('span', {}, [
    el('span', { class: 'save-stat-label' }, [label]),
    el('span', { class: 'save-stat-val' }, [String(value)]),
  ]);
}
function sep() { return el('span', { class: 'sep' }, ['·']); }

function renderSaveCardDOM({ classKey, iconChar, label, name, level, floor, hp, maxHp, gold, kills, tsText, actionBtns, tamperedFlag }) {
  const card = el('div', { class: 'save-card' });
  card.appendChild(el('div', { class: 'save-class-icon' }, [iconChar]));
  const main = el('div', { class: 'save-main' });
  // Name + ` · Label`
  const nameRow = el('div', { class: 'save-name' }, [String(name)]);
  nameRow.appendChild(el('span', { style: 'color:#64748b;font-weight:500;font-size:0.78rem;' }, [' · ' + String(label)]));
  if (tamperedFlag) {
    nameRow.appendChild(el('span', { style: 'color:#f87171;font-size:0.72rem;margin-left:6px;', title: 'This save failed its integrity check.' }, ['⚠ tampered']));
  }
  main.appendChild(nameRow);
  const sub = el('div', { class: 'save-sub' }, [
    buildStat('Lv',    String(level)),    sep(),
    buildStat('Floor', String(floor)),    sep(),
    buildStat('HP',    `${hp}/${maxHp}`), sep(),
    buildStat('Gold',  String(gold)),     sep(),
    buildStat('Kills', String(kills)),    sep(),
    el('span', { style: 'color:#64748b;' }, [tsText]),
  ]);
  main.appendChild(sub);
  card.appendChild(main);
  card.appendChild(el('div', { class: 'save-actions' }, actionBtns));
  // Mirror the classKey on the card for styling hooks.
  card.dataset.classKey = classKey;
  return card;
}

function renderSaveCard(save, mode) {
  const c = save.character || {};
  const classKey = String(c.classKey || 'knight').toLowerCase();
  const iconChar = CLASS_ICON[classKey] || '•';
  const label    = CLASS_LABEL[classKey] || 'Adventurer';
  const actionBtns = [];
  if (mode === 'save') {
    actionBtns.push(el('button', {
      type: 'button', class: 'save-action resume',
      'data-action': 'save', 'data-id': save.id,
    }, ['Save']));
  } else {
    actionBtns.push(el('button', {
      type: 'button', class: 'save-action resume',
      'data-action': 'resume', 'data-id': save.id,
    }, ['Resume']));
    actionBtns.push(el('button', {
      type: 'button', class: 'save-action delete',
      'data-action': 'delete', 'data-id': save.id,
    }, ['Delete']));
  }
  return renderSaveCardDOM({
    classKey, iconChar, label,
    name:  String(c.name || 'Adventurer').slice(0, 40),
    level: Math.max(0, Number(c.level || 1)),
    floor: Math.max(0, Number(save.floor || 1)),
    hp:    Math.max(0, Number(save.hp || 0)),
    maxHp: Math.max(0, Number(save.maxHp || 0)),
    gold:  Math.max(0, Number(save.gold || 0)),
    kills: Math.max(0, Number(save.kills || 0)),
    tsText: formatSaveTimestamp(save.ts),
    actionBtns,
    tamperedFlag: !!save._tampered,
  });
}

function renderPendingRunCard(snapshot) {
  if (!snapshot) return null;
  const classKey = String(snapshot.classKey || 'knight').toLowerCase();
  const iconChar = CLASS_ICON[classKey] || '•';
  const label    = CLASS_LABEL[classKey] || 'Adventurer';
  const btn = el('button', {
    type: 'button', class: 'save-action resume',
    'data-action': 'save', 'data-id': '',
  }, ['Save']);
  return renderSaveCardDOM({
    classKey, iconChar, label,
    name:  String(snapshot.name || 'Adventurer').slice(0, 40),
    level: Math.max(0, Number(snapshot.playerLevel || 1)),
    floor: Math.max(0, Number(snapshot.currentLevel || 1)),
    hp:    Math.max(0, Number(snapshot.playerHp || 0)),
    maxHp: Math.max(0, Number(snapshot.playerMaxHp || 0)),
    gold:  Math.max(0, Number(snapshot.gold || 0)),
    kills: Math.max(0, Number(snapshot.runKills || 0)),
    tsText: 'current run',
    actionBtns: [btn],
  });
}

async function finalizeSaveAndExit() {
  clearPendingSnapshot();
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  if (openedFromActiveGame) {
    openedFromActiveGame = false;
    window.location.reload();
    return;
  }
  const name = getAuthName();
  if (name) showCharacterOverlay(name);
  else showAuthOverlay();
}

async function renderSavesScreen() {
  const list = document.getElementById('savesList');
  const titleEl = document.querySelector('#savesOverlay .panel-title');
  if (!list) return;
  if (titleEl) titleEl.textContent = savesMode === 'save' ? 'Save Game' : 'Load Game';
  list.replaceChildren(el('div', { class: 'saves-empty' }, ['Loading…']));
  const saves = await fetchSaves();
  list.replaceChildren();

  if (savesMode === 'save') {
    const pendingId = readPendingSaveId();
    const pendingSnapshot = readPendingSnapshot();
    if (pendingId) {
      const match = saves.find((s) => s.id === pendingId);
      if (match) list.appendChild(renderSaveCard(match, 'save'));
      else if (pendingSnapshot) {
        const card = renderPendingRunCard(pendingSnapshot);
        if (card) list.appendChild(card);
      }
    } else if (pendingSnapshot) {
      const card = renderPendingRunCard(pendingSnapshot);
      if (card) list.appendChild(card);
    } else {
      list.replaceChildren(el('div', { class: 'saves-empty' }, ['No active run to save. Press "Save and Exit" from the game.']));
    }
    return;
  }

  if (!saves.length) {
    list.replaceChildren(el('div', { class: 'saves-empty' }, ['No saved games yet.']));
    return;
  }
  for (const save of saves) list.appendChild(renderSaveCard(save, savesMode));
}

async function handleSavesListClick(ev) {
  const btn = ev.target.closest('.save-action');
  if (!btn || btn.disabled) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id || null;

  if (action === 'delete') {
    if (!confirm('Delete this save? This cannot be undone.')) return;
    btn.disabled = true;
    const okDel = await deleteSaveById(id);
    if (okDel) renderSavesScreen();
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
    const targetId = id || null;
    const result = await postSnapshot(snapshot, targetId);
    if (result.error) {
      alert(`Save failed: ${result.error}`);
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    await finalizeSaveAndExit();
  }
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
      if (savesMode === 'save') clearPendingSnapshot();
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      if (openedFromActiveGame) {
        openedFromActiveGame = false;
        const savesOverlay = document.getElementById('savesOverlay');
        if (savesOverlay) savesOverlay.style.display = 'none';
        return;
      }
      const name = getAuthName();
      if (name) showCharacterOverlay(name);
      else showAuthOverlay();
    });
  }
  const list = document.getElementById('savesList');
  if (list) list.addEventListener('click', handleSavesListClick);
}

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
    guestBtn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await logout();
      showCharacterOverlay('', { guest: true });
    });
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errEl.textContent = '';
    const name     = (nameEl.value || '').trim();
    const password = passEl.value || '';
    const repeat   = (repEl && repEl.value) || '';

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

function wireLogoutButton() {
  const btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Logging out…';
    try { await logout(); } finally {
      btn.disabled = false;
      btn.textContent = prev;
    }
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    showAuthOverlay();
  });
}

async function bootstrapAuth() {
  const startOverlay = document.getElementById('startOverlay');
  const savesOverlay = document.getElementById('savesOverlay');
  if (startOverlay) startOverlay.style.display = 'none';
  if (savesOverlay) savesOverlay.style.display = 'none';

  wireAuthForm();
  wireLoadGameButton();
  wireLogoutButton();
  wireSavesScreen();

  // Offline (itch.io / standalone) build: there is no server and no accounts.
  // Skip auth entirely, load the persisted guest name from localStorage, and
  // drop the player straight into character select with the name editable.
  if (OFFLINE_BUILD) {
    const authOverlay = document.getElementById('authOverlay');
    if (authOverlay) authOverlay.style.display = 'none';
    const badge = document.getElementById('offlineOnlineBadge');
    if (badge) badge.style.display = '';
    const name = offlineCurrentName();
    setAuthName(name);
    setCurrentRole('user');
    // Persist any edit the player makes to the name on character select so
    // next run they see the same adventurer.
    const nameInput = document.getElementById('playerName');
    if (nameInput) {
      const persist = () => {
        const trimmed = offlineSetName(nameInput.value);
        setAuthName(trimmed);
      };
      nameInput.addEventListener('blur', persist);
      nameInput.addEventListener('change', persist);
    }
    const h = window.location.hash;
    if (h === '#/saves/load' || h === '#/saves') { showSavesOverlay('load'); return; }
    showCharacterOverlay(name, { guest: true });
    return;
  }

  const me = await verifyToken();
  if (me && me.name) {
    setAuthName(me.name);
    const h = window.location.hash;
    if (h === '#/saves/save') { showSavesOverlay('save'); return; }
    if (h === '#/saves/load' || h === '#/saves') { showSavesOverlay('load'); return; }
    showCharacterOverlay(me.name);
    return;
  }
  clearAuthName();
  showAuthOverlay();
  if (window.location.hash === '#/saves/save' && readPendingSnapshot() && typeof authSetMode === 'function') {
    authSetMode('register');
  }
}

bootstrapAuth();

export const authApi = {
  getAuthName,
  clearAuth: logout,
  apiFetch,
};
