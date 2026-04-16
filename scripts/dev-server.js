#!/usr/bin/env node
/**
 * Zero-dependency local dev server for Tibia Dungeons.
 *
 *   node scripts/dev-server.js            # → http://localhost:5173
 *   PORT=3000 node scripts/dev-server.js  # → http://localhost:3000
 *
 * - Serves the static game/ directory at /
 * - Implements /api/runs (GET + POST) with the same shape as
 *   api/runs.js on Vercel, but backed by a local JSON file
 *   (.runs.local.json at the repo root) so the Hall of Fame persists
 *   between dev-server restarts without needing Upstash Redis.
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT      = path.resolve(__dirname, '..');
const GAME_DIR  = path.join(ROOT, 'game');
const RUNS_FILE  = path.join(ROOT, '.runs.local.json');
const AUTH_FILE  = path.join(ROOT, '.auth.local.json');
const SAVES_FILE = path.join(ROOT, '.saves.local.json');
const PORT       = Number(process.env.PORT || 5173);
const MAX_RUNS   = 100;
const MAX_SAVES_PER_USER  = 20;
const MAX_SNAPSHOT_BYTES  = 200_000;
const NAME_RE    = /^[A-Za-z0-9 _-]+$/;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CLASS_KEYS = new Set(['knight', 'paladin', 'sorcerer', 'druid']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.otf':   'font/otf',
};

// ── Runs store (file-backed) ────────────────────────────────────────
function loadRuns() {
  try {
    const data = JSON.parse(fs.readFileSync(RUNS_FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}
function persistRuns(runs) {
  try { fs.writeFileSync(RUNS_FILE, JSON.stringify(runs, null, 2)); } catch (e) {
    console.warn('[dev-server] could not persist runs:', e.message);
  }
}
let runs = loadRuns();

function sortRuns() {
  runs.sort((a, b) => (b._score || 0) - (a._score || 0));
  if (runs.length > MAX_RUNS) runs.length = MAX_RUNS;
}

// ── Auth store (file-backed) ────────────────────────────────────────
function loadAuth() {
  try {
    const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
    return { users: data.users || {}, sessions: data.sessions || {} };
  } catch { return { users: {}, sessions: {} }; }
}
function persistAuth(store) {
  try { fs.writeFileSync(AUTH_FILE, JSON.stringify(store, null, 2)); } catch (e) {
    console.warn('[dev-server] could not persist auth:', e.message);
  }
}
const authStore = loadAuth();
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function validateName(n) {
  if (!n || typeof n !== 'string') return 'Name required';
  const t = n.trim();
  if (t.length < 1) return 'Name required';
  if (t.length > 12) return 'Name too long (max 12)';
  if (!NAME_RE.test(t)) return 'Name can only contain letters, numbers, spaces, _ and -';
  return null;
}
function validatePassword(p) {
  if (!p || typeof p !== 'string') return 'Password required';
  if (p.length < 6) return 'Password must be at least 6 characters';
  if (p.length > 100) return 'Password too long';
  return null;
}
// ── Saves store (file-backed) ───────────────────────────────────────
function loadSaves() {
  try {
    const data = JSON.parse(fs.readFileSync(SAVES_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch { return {}; }
}
function persistSaves(store) {
  try { fs.writeFileSync(SAVES_FILE, JSON.stringify(store, null, 2)); } catch (e) {
    console.warn('[dev-server] could not persist saves:', e.message);
  }
}
const savesStore = loadSaves();

function authenticateByHeader(req) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) return null;
  const sess = authStore.sessions[token];
  if (!sess) return null;
  if ((sess.createdAt || 0) + SESSION_TTL_MS < Date.now()) return null;
  return sess;
}

function pruneSessions() {
  const now = Date.now();
  let mutated = false;
  for (const [tok, sess] of Object.entries(authStore.sessions)) {
    if (!sess || (sess.createdAt || 0) + SESSION_TTL_MS < now) {
      delete authStore.sessions[tok];
      mutated = true;
    }
  }
  if (mutated) persistAuth(authStore);
}

// ── HTTP helpers ────────────────────────────────────────────────────
function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── /api/runs handler (mirrors api/runs.js) ─────────────────────────
async function handleRuns(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }
  if (req.method === 'GET') {
    return sendJson(res, 200, { runs: runs.slice(0, MAX_RUNS) });
  }
  if (req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const { name, floor, classKey } = body;
      if (!name || !floor || !classKey) {
        return sendJson(res, 400, { error: 'Missing required fields' });
      }
      const classNorm = String(classKey).toLowerCase();
      const entry = {
        name:        String(name).trim().slice(0, 20) || 'Adventurer',
        classKey:    CLASS_KEYS.has(classNorm) ? classNorm : 'knight',
        sex:         String(body.sex || 'male') === 'female' ? 'female' : 'male',
        floor:       Math.max(1, Math.min(9999, Math.floor(Number(floor)) || 1)),
        kills:       Math.max(0, Math.floor(Number(body.kills) || 0)),
        playerLevel: Math.max(1, Math.min(9999, Math.floor(Number(body.playerLevel) || 1))),
        gold:        Math.max(0, Math.floor(Number(body.gold) || 0)),
        killedBy:    body.killedBy ? String(body.killedBy).trim().slice(0, 40) : 'Unknown',
        ts:          Date.now(),
      };
      entry._score = entry.floor * 1_000_000 + entry.kills * 1_000 + entry.playerLevel;
      runs.push(entry);
      sortRuns();
      persistRuns(runs);
      return sendJson(res, 200, { ok: true });
    } catch (e) {
      return sendJson(res, 400, { error: e.message || 'Bad request' });
    }
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

// ── /api/auth/* handlers (mirrors api/auth/[action].js) ─────────────
async function handleAuthRegister(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  let body;
  try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const ne = validateName(name); if (ne) return sendJson(res, 400, { error: ne });
  const pe = validatePassword(password); if (pe) return sendJson(res, 400, { error: pe });
  const key = name.toLowerCase();
  if (authStore.users[key]) return sendJson(res, 409, { error: 'Name already taken' });
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  authStore.users[key] = { name, salt, hash, createdAt: Date.now() };
  const token = crypto.randomBytes(32).toString('hex');
  authStore.sessions[token] = { name, createdAt: Date.now() };
  persistAuth(authStore);
  return sendJson(res, 200, { token, name });
}

async function handleAuthLogin(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  let body;
  try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const ne = validateName(name); if (ne) return sendJson(res, 400, { error: ne });
  const pe = validatePassword(password); if (pe) return sendJson(res, 400, { error: pe });
  const user = authStore.users[name.toLowerCase()];
  if (!user) return sendJson(res, 401, { error: 'Invalid credentials' });
  if (hashPassword(password, user.salt) !== user.hash) {
    return sendJson(res, 401, { error: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  authStore.sessions[token] = { name: user.name, createdAt: Date.now() };
  persistAuth(authStore);
  return sendJson(res, 200, { token, name: user.name });
}

function handleAuthMe(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) return sendJson(res, 401, { error: 'No token' });
  const sess = authStore.sessions[token];
  if (!sess) return sendJson(res, 401, { error: 'Invalid or expired session' });
  if ((sess.createdAt || 0) + SESSION_TTL_MS < Date.now()) {
    delete authStore.sessions[token];
    persistAuth(authStore);
    return sendJson(res, 401, { error: 'Invalid or expired session' });
  }
  return sendJson(res, 200, { name: sess.name });
}

// ── /api/saves handlers (mirrors api/saves/index.js) ────────────────
async function handleSaves(req, res) {
  const me = authenticateByHeader(req);
  if (!me) return sendJson(res, 401, { error: 'Not authenticated' });
  const userLc = String(me.name || '').toLowerCase();
  if (!savesStore[userLc]) savesStore[userLc] = {};
  const userSaves = savesStore[userLc];

  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }
  if (req.method === 'GET') {
    const list = Object.values(userSaves).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return sendJson(res, 200, { saves: list });
  }
  if (req.method === 'POST') {
    let body;
    try { body = await readJsonBody(req); } catch { return sendJson(res, 400, { error: 'Invalid JSON' }); }
    const snapshot = body && body.snapshot;
    const upsertId = body && typeof body.id === 'string' && body.id ? body.id : null;
    if (!snapshot || typeof snapshot !== 'object') {
      return sendJson(res, 400, { error: 'Missing snapshot' });
    }
    const serialized = JSON.stringify(snapshot);
    if (serialized.length > MAX_SNAPSHOT_BYTES) {
      return sendJson(res, 413, { error: 'Snapshot too large' });
    }
    let id;
    if (upsertId && userSaves[upsertId]) {
      // Overwrite the existing slot in place.
      id = upsertId;
    } else {
      // New save — trim oldest if we're over the cap.
      const existing = Object.values(userSaves).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      while (existing.length >= MAX_SAVES_PER_USER) {
        const oldest = existing.shift();
        delete userSaves[oldest.id];
      }
      id = crypto.randomBytes(8).toString('hex');
    }
    const entry = {
      id,
      ts:        Date.now(),
      character: {
        name:     String(snapshot.name || me.name).slice(0, 20),
        classKey: String(snapshot.classKey || 'knight'),
        sex:      snapshot.sex === 'female' ? 'female' : 'male',
        level:    Math.max(1, Math.floor(Number(snapshot.playerLevel) || 1)),
      },
      floor:  Math.max(1, Math.floor(Number(snapshot.currentLevel) || 1)),
      gold:   Math.max(0, Math.floor(Number(snapshot.gold) || 0)),
      kills:  Math.max(0, Math.floor(Number(snapshot.runKills) || 0)),
      hp:     Math.max(0, Math.floor(Number(snapshot.playerHp) || 0)),
      maxHp:  Math.max(1, Math.floor(Number(snapshot.playerMaxHp) || 1)),
      snapshot,
    };
    userSaves[id] = entry;
    persistSaves(savesStore);
    return sendJson(res, 200, { id });
  }
  if (req.method === 'DELETE') {
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('id');
    if (!id) return sendJson(res, 400, { error: 'Missing id' });
    if (userSaves[id]) {
      delete userSaves[id];
      persistSaves(savesStore);
    }
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

// ── Static file serving ─────────────────────────────────────────────
function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  const full = path.normalize(path.join(GAME_DIR, pathname));
  if (!full.startsWith(GAME_DIR)) {
    res.writeHead(403); return res.end('forbidden');
  }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end(`404 Not Found: ${pathname}`);
    }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(full).pipe(res);
  });
}

// ── Server ──────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/runs')) return handleRuns(req, res);
  if (req.url.startsWith('/api/auth/register')) return handleAuthRegister(req, res);
  if (req.url.startsWith('/api/auth/login')) return handleAuthLogin(req, res);
  if (req.url.startsWith('/api/auth/me')) return handleAuthMe(req, res);
  if (req.url.startsWith('/api/saves')) return handleSaves(req, res);
  if (req.url.startsWith('/api/')) return sendJson(res, 404, { error: 'Unknown endpoint' });
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  pruneSessions();
  console.log('┌──────────────────────────────────────────────');
  console.log(`│  Tibia Dungeons — local dev server`);
  console.log(`│  URL:      http://localhost:${PORT}`);
  console.log(`│  Game:     ${GAME_DIR}`);
  console.log(`│  HoF DB:   ${RUNS_FILE}   (${runs.length} runs)`);
  console.log(`│  Auth DB:  ${AUTH_FILE}   (${Object.keys(authStore.users).length} users)`);
  const saveCount = Object.values(savesStore).reduce((n, u) => n + Object.keys(u || {}).length, 0);
  console.log(`│  Saves DB: ${SAVES_FILE}  (${saveCount} total saves)`);
  console.log('└──────────────────────────────────────────────');
});
