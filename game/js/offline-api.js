/**
 * Offline API stub for the itch.io / standalone build.
 *
 * Responds to the same /api/* URLs that the real Vercel backend does, but
 * everything is kept in localStorage on the player's machine. No network,
 * no accounts, no global leaderboard — just a personal Hall of Fame and
 * personal saves for whoever owns this browser profile.
 *
 * This file is only imported when `OFFLINE_BUILD` is true (esbuild define).
 * In online builds tree-shaking removes it — but we still ship it, since
 * auth.js imports it unconditionally and the online branch simply never
 * calls `offlineFetch`.
 */

const LS_USER   = 'td.offline.user';
const LS_SAVES  = 'td.offline.saves';
const LS_RUNS   = 'td.offline.runs';

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

function randomId() {
  const bytes = new Uint8Array(8);
  (globalThis.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function currentUser() {
  let u = read(LS_USER, null);
  if (!u || !u.name) {
    u = { name: 'Adventurer', role: 'user', createdAt: Date.now() };
    write(LS_USER, u);
  }
  return u;
}

function jsonResponse(body, status = 200) {
  const text = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    async json() { return JSON.parse(text); },
    async text() { return text; },
    clone() { return jsonResponse(body, status); },
  };
}

// ── /api/auth/* ─────────────────────────────────────────────────────────
function handleAuthMe() {
  const u = currentUser();
  return jsonResponse({ name: u.name, role: u.role });
}
function handleAuthLogin(body) {
  const name = String((body && body.name) || '').trim().slice(0, 12) || 'Adventurer';
  const u = { name, role: 'user', createdAt: Date.now() };
  write(LS_USER, u);
  return jsonResponse({ name: u.name, role: u.role });
}
function handleAuthLogout() {
  // In offline mode "logout" just clears the name — but we keep saves/runs so
  // the player doesn't lose progress if they re-enter a different name.
  return jsonResponse({ ok: true });
}

// ── /api/saves ──────────────────────────────────────────────────────────
function handleSavesList() {
  const saves = read(LS_SAVES, []);
  return jsonResponse({ saves });
}
function handleSavesPost(body) {
  const saves = read(LS_SAVES, []);
  const id = (body && body.id) || randomId();
  const snapshot = body && body.snapshot;
  if (!snapshot) return jsonResponse({ error: 'missing snapshot' }, 400);

  // Store a lean save record mirroring the shape returned by the real API.
  const record = {
    id,
    ts: Date.now(),
    floor:    Number(snapshot.currentLevel || snapshot.floor || 1),
    hp:       Number(snapshot.playerHp || 0),
    maxHp:    Number(snapshot.playerMaxHp || 0),
    gold:     Number(snapshot.gold || 0),
    kills:    Number(snapshot.runKills || snapshot.kills || 0),
    character: {
      name:     String(snapshot.name || 'Adventurer'),
      classKey: String(snapshot.classKey || 'knight'),
      level:    Number(snapshot.playerLevel || 1),
    },
    snapshot,
  };

  const idx = saves.findIndex((s) => s.id === id);
  if (idx >= 0) saves[idx] = record;
  else saves.unshift(record);

  // Cap at 20 to keep localStorage quota healthy.
  if (saves.length > 20) saves.length = 20;
  write(LS_SAVES, saves);
  return jsonResponse({ id });
}
function handleSavesDelete(id) {
  if (!id) return jsonResponse({ error: 'missing id' }, 400);
  const saves = read(LS_SAVES, []);
  const next = saves.filter((s) => s.id !== id);
  write(LS_SAVES, next);
  return jsonResponse({ ok: true });
}

// ── /api/runs (Hall of Fame) ────────────────────────────────────────────
function handleRunsList() {
  const runs = read(LS_RUNS, []);
  // Sort by floor desc, then kills desc, then ts desc — matches the server.
  runs.sort((a, b) =>
    (b.floor - a.floor) || (b.kills - a.kills) || (b.ts - a.ts)
  );
  return jsonResponse({ runs: runs.slice(0, 100) });
}
function handleRunsPost(body) {
  const run = {
    ts:          Date.now(),
    name:        String((body && body.name) || 'Adventurer').slice(0, 12),
    classKey:    String((body && body.classKey) || 'knight'),
    sex:         String((body && body.sex) || 'male'),
    floor:       Math.max(0, Number((body && body.floor) || 0)),
    kills:       Math.max(0, Number((body && body.kills) || 0)),
    playerLevel: Math.max(0, Number((body && body.playerLevel) || 1)),
    gold:        Math.max(0, Number((body && body.gold) || 0)),
    killedBy:    String((body && body.killedBy) || '—').slice(0, 40),
  };
  const runs = read(LS_RUNS, []);
  runs.push(run);
  if (runs.length > 200) runs.splice(0, runs.length - 200);
  write(LS_RUNS, runs);
  return jsonResponse({ ok: true });
}

// ── Router ──────────────────────────────────────────────────────────────
export async function offlineFetch(url, opts = {}) {
  const method = String(opts.method || 'GET').toUpperCase();
  const u = new URL(url, 'http://local');
  const path = u.pathname;
  let body = null;
  if (opts.body) {
    try { body = JSON.parse(opts.body); } catch { body = null; }
  }

  if (path === '/api/auth/me'      && method === 'GET')  return handleAuthMe();
  if (path === '/api/auth/login'   && method === 'POST') return handleAuthLogin(body);
  if (path === '/api/auth/register'&& method === 'POST') return handleAuthLogin(body);
  if (path === '/api/auth/logout'  && method === 'POST') return handleAuthLogout();

  if (path === '/api/saves' && method === 'GET')    return handleSavesList();
  if (path === '/api/saves' && method === 'POST')   return handleSavesPost(body);
  if (path === '/api/saves' && method === 'DELETE') return handleSavesDelete(u.searchParams.get('id'));

  if (path === '/api/runs' && method === 'GET')  return handleRunsList();
  if (path === '/api/runs' && method === 'POST') return handleRunsPost(body);

  return jsonResponse({ error: 'not found' }, 404);
}

export function offlineCurrentName() {
  return currentUser().name;
}
export function offlineSetName(name) {
  const trimmed = String(name || '').trim().slice(0, 12) || 'Adventurer';
  const u = currentUser();
  u.name = trimmed;
  write(LS_USER, u);
  return trimmed;
}
