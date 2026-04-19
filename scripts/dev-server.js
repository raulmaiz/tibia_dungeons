#!/usr/bin/env node
/**
 * Zero-dependency local dev server for Tibia Dungeons.
 *
 *   node scripts/dev-server.js            # → http://localhost:5173
 *   PORT=3000 node scripts/dev-server.js  # → http://localhost:3000
 *
 * Mirrors the production API (auth, saves, runs, events, csp-report) and
 * applies the same security posture (cookies, CSRF, rate limiting, schema
 * validation, HMAC-signed saves). Uses in-memory stores backed by local
 * JSON files (`.runs.local.json`, `.auth.local.json`, `.saves.local.json`).
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT       = path.resolve(__dirname, '..');
const GAME_DIR   = path.join(ROOT, 'game');
const RUNS_FILE  = path.join(ROOT, '.runs.local.json');
const AUTH_FILE  = path.join(ROOT, '.auth.local.json');
const SAVES_FILE = path.join(ROOT, '.saves.local.json');
const PORT       = Number(process.env.PORT || 5173);

const MAX_RUNS              = 100;
const MAX_SAVES_PER_USER    = 20;
const MAX_SNAPSHOT_BYTES    = 200_000;
const MAX_SNAPSHOT_DEPTH    = 8;
const MAX_FLOOR             = 100;
const MAX_LEVEL             = 200;
const MAX_GOLD              = 10_000_000;
const MAX_KILLS             = MAX_FLOOR * 200;
const SESSION_TTL_MS        = 7 * 24 * 60 * 60 * 1000;
const SESSION_COOKIE        = 'td_session';
const CSRF_COOKIE           = 'td_csrf';

const NAME_RE    = /^[A-Za-z0-9 _-]+$/;
const KILLED_BY_RE = /^[\p{L}\p{N} _\-'().,!?]+$/u;
const CLASS_KEYS = new Set(['knight', 'paladin', 'sorcerer', 'druid']);

const APP_SECRET = process.env.APP_SECRET || 'dev-insecure-secret-replace-via-APP_SECRET-env';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png':  'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif':  'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
};

// ── File-backed stores ──────────────────────────────────────────────
function loadJson(file, fallback) {
  try { const d = JSON.parse(fs.readFileSync(file, 'utf8')); return d != null ? d : fallback; }
  catch { return fallback; }
}
function persistJson(file, data, label) {
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }
  catch (e) { console.warn(`[dev-server] could not persist ${label}:`, e.message); }
}

let runs = (() => { const d = loadJson(RUNS_FILE, []); return Array.isArray(d) ? d : []; })();
const authStore  = (() => { const d = loadJson(AUTH_FILE, {}); return { users: d.users || {}, sessions: d.sessions || {} }; })();
const savesStore = (() => { const d = loadJson(SAVES_FILE, {}); return typeof d === 'object' && d ? d : {}; })();
const rateBuckets = new Map(); // in-memory fixed-window rate limiter

function persistAuth()  { persistJson(AUTH_FILE,  authStore,  'auth'); }
function persistSaves() { persistJson(SAVES_FILE, savesStore, 'saves'); }
function persistRuns()  { persistJson(RUNS_FILE,  runs,       'runs'); }

// ── Security helpers ────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'https://www.tibia-dungeons.com', 'https://tibia-dungeons.com',
]);

function applySecurity(res) {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}
function applyCors(req, res, methods) {
  const origin = req.headers.origin || '';
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return true; }
  return false;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
function rateLimit({ bucket, subject, limit, windowSec }) {
  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${bucket}:${subject}:${windowId}`;
  const count = (rateBuckets.get(key) || 0) + 1;
  rateBuckets.set(key, count);
  // cheap GC: occasionally prune old keys
  if (rateBuckets.size > 5000) {
    for (const k of rateBuckets.keys()) if (k.endsWith(`:${windowId - 1}`) || k.endsWith(`:${windowId - 2}`)) rateBuckets.delete(k);
  }
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetMs: (windowId + 1) * windowSec * 1000 };
}
function enforceRateLimit(req, res, opts) {
  const r = rateLimit(opts);
  res.setHeader('X-RateLimit-Limit', String(opts.limit));
  res.setHeader('X-RateLimit-Remaining', String(r.remaining));
  if (!r.ok) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((r.resetMs - Date.now()) / 1000))));
    sendJson(res, 429, { error: 'Too many requests' });
    return true;
  }
  return false;
}
function jitter(min = 60, max = 180) {
  const d = Math.floor(min + Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, d));
}
function safeCompare(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8'); const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch { return false; }
}
function containsUnsafeKeys(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return false;
  if (seen.has(obj)) return false; seen.add(obj);
  for (const k of Object.keys(obj)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') return true;
    if (containsUnsafeKeys(obj[k], seen)) return true;
  }
  return false;
}
function checkJsonDepth(obj, max, d = 0) {
  if (d > max) return false;
  if (obj === null || typeof obj !== 'object') return true;
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) if (!checkJsonDepth(v, max, d + 1)) return false;
  return true;
}
function validate(body, schema) {
  if (!body || typeof body !== 'object') return 'Invalid body';
  for (const [k, r] of Object.entries(schema)) {
    const v = body[k];
    if (v === undefined || v === null || v === '') { if (r.required === false) continue; return 'Invalid request'; }
    if (r.type === 'string') {
      if (typeof v !== 'string') return 'Invalid request';
      if (r.min != null && v.length < r.min) return 'Invalid request';
      if (r.max != null && v.length > r.max) return 'Invalid request';
      if (r.pattern && !r.pattern.test(v)) return 'Invalid request';
      if (r.enum && !r.enum.includes(v)) return 'Invalid request';
    } else if (r.type === 'int') {
      const n = Number(v);
      if (!Number.isFinite(n) || Math.floor(n) !== n) return 'Invalid request';
      if (r.min != null && n < r.min) return 'Invalid request';
      if (r.max != null && n > r.max) return 'Invalid request';
    }
  }
  return null;
}
function canonicalStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalStringify).join(',') + ']';
  const ks = Object.keys(v).sort();
  return '{' + ks.map((k) => JSON.stringify(k) + ':' + canonicalStringify(v[k])).join(',') + '}';
}
function hmacSign(data) { return crypto.createHmac('sha256', APP_SECRET).update(String(data)).digest('hex'); }
function hmacVerify(data, sig) { return safeCompare(hmacSign(data), sig); }
function signatureFor(entry) {
  return hmacSign(canonicalStringify({ id: entry.id, ts: entry.ts, userLc: entry.userLc, snapshot: entry.snapshot }));
}

// ── Cookies / auth ──────────────────────────────────────────────────
function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('='); if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function appendCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? (Array.isArray(prev) ? [...prev, cookie] : [prev, cookie]) : [cookie]);
}
function setCookie(res, name, value, { maxAgeSec = 0, httpOnly = true, sameSite = 'Lax' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', `SameSite=${sameSite}`];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAgeSec > 0) parts.push(`Max-Age=${maxAgeSec}`);
  // No `Secure` flag on localhost so the cookie actually gets set.
  appendCookie(res, parts.join('; '));
}
function clearCookie(res, name, { httpOnly = true } = {}) {
  const parts = [`${name}=`, 'Path=/', 'Max-Age=0', 'SameSite=Lax']; if (httpOnly) parts.push('HttpOnly');
  appendCookie(res, parts.join('; '));
}
function newToken(n) { return crypto.randomBytes(n).toString('hex'); }

function authenticate(req) {
  const cookieTok = readCookie(req, SESSION_COOKIE);
  const auth = req.headers.authorization || '';
  const bm = /^Bearer\s+(.+)$/i.exec(auth);
  const token = cookieTok || (bm ? bm[1].trim() : '');
  if (!token) return null;
  const sess = authStore.sessions[token]; if (!sess) return null;
  if ((sess.createdAt || 0) + SESSION_TTL_MS < Date.now()) { delete authStore.sessions[token]; persistAuth(); return null; }
  return { name: sess.name, token, csrf: sess.csrf };
}
function createSession(name, res) {
  const token = newToken(32); const csrf = newToken(24);
  authStore.sessions[token] = { name, createdAt: Date.now(), csrf };
  persistAuth();
  const ttl = Math.floor(SESSION_TTL_MS / 1000);
  setCookie(res, SESSION_COOKIE, token, { maxAgeSec: ttl, httpOnly: true });
  setCookie(res, CSRF_COOKIE, csrf, { maxAgeSec: ttl, httpOnly: false });
  return { token, csrf };
}
function destroySession(req, res) {
  const t = readCookie(req, SESSION_COOKIE) || ''; if (t && authStore.sessions[t]) { delete authStore.sessions[t]; persistAuth(); }
  clearCookie(res, SESSION_COOKIE); clearCookie(res, CSRF_COOKIE, { httpOnly: false });
}
function requireCsrf(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const header = req.headers['x-csrf-token'] || ''; const cookie = readCookie(req, CSRF_COOKIE);
  if (!header || !cookie) return false;
  return safeCompare(header, cookie);
}
function hashPassword(p, salt) { return crypto.scryptSync(p, salt, 64).toString('hex'); }

// ── HTTP helpers ────────────────────────────────────────────────────
function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status; res.end(JSON.stringify(body));
}
function readJsonBody(req, maxBytes = 200_000) {
  return new Promise((resolve, reject) => {
    let raw = ''; let aborted = false;
    req.on('data', (c) => {
      if (aborted) return;
      raw += c; if (raw.length > maxBytes) { aborted = true; reject(new Error('Payload too large')); try { req.destroy(); } catch { /* ignore */ } }
    });
    req.on('end', () => {
      if (aborted) return;
      if (!raw) return resolve({});
      try { const p = JSON.parse(raw); if (containsUnsafeKeys(p)) return reject(new Error('Invalid JSON')); resolve(p); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

// ── /api/runs ───────────────────────────────────────────────────────
function sortRuns() { runs.sort((a, b) => (b._score || 0) - (a._score || 0)); if (runs.length > MAX_RUNS) runs.length = MAX_RUNS; }

async function handleRuns(req, res) {
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return;
  if (req.method === 'GET') {
    if (enforceRateLimit(req, res, { bucket: 'runs_read', subject: clientIp(req), limit: 60, windowSec: 60 })) return;
    return sendJson(res, 200, { runs: runs.slice(0, MAX_RUNS) });
  }
  if (req.method === 'POST') {
    const me = authenticate(req); if (!me) return sendJson(res, 401, { error: 'Not authenticated' });
    if (!requireCsrf(req)) return sendJson(res, 403, { error: 'CSRF token missing or invalid' });
    if (enforceRateLimit(req, res, { bucket: 'runs_post', subject: me.name, limit: 10, windowSec: 3600 })) return;

    let body; try { body = await readJsonBody(req, 4096); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
    const err = validate(body, {
      name:        { type: 'string', min: 1, max: 20, pattern: NAME_RE },
      classKey:    { type: 'string', enum: [...CLASS_KEYS] },
      floor:       { type: 'int', min: 1, max: MAX_FLOOR },
      kills:       { type: 'int', min: 0, max: MAX_KILLS },
      playerLevel: { type: 'int', min: 1, max: MAX_LEVEL },
      gold:        { type: 'int', min: 0, max: MAX_GOLD },
      killedBy:    { type: 'string', min: 1, max: 40, pattern: KILLED_BY_RE, required: false },
      sex:         { type: 'string', enum: ['male', 'female'], required: false },
    });
    if (err) return sendJson(res, 400, { error: 'Invalid request' });
    if (String(body.name).trim().toLowerCase() !== me.name.toLowerCase()) return sendJson(res, 403, { error: 'Name does not match authenticated user' });
    if (Number(body.kills) > Number(body.floor) * 200) return sendJson(res, 400, { error: 'Invalid request' });

    const entry = {
      name:        me.name.slice(0, 20), classKey: String(body.classKey),
      sex:         body.sex === 'female' ? 'female' : 'male',
      floor:       Math.floor(Number(body.floor)), kills: Math.floor(Number(body.kills)),
      playerLevel: Math.floor(Number(body.playerLevel)), gold: Math.floor(Number(body.gold)),
      killedBy:    body.killedBy ? String(body.killedBy).trim().slice(0, 40) : 'Unknown',
      ts:          Date.now(),
    };
    entry._score = entry.floor * 1_000_000 + entry.kills * 1_000 + entry.playerLevel;
    runs.push(entry); sortRuns(); persistRuns();
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

// ── /api/auth/* ─────────────────────────────────────────────────────
async function handleAuthRegister(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (enforceRateLimit(req, res, { bucket: 'register', subject: clientIp(req), limit: 5, windowSec: 3600 })) return;

  let body; try { body = await readJsonBody(req, 2048); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  const err = validate(body, {
    name:     { type: 'string', min: 1, max: 12, pattern: NAME_RE },
    password: { type: 'string', min: 6, max: 100 },
  });
  if (err) { await jitter(); return sendJson(res, 400, { error: 'Invalid credentials' }); }
  const name = String(body.name).trim(); const key = name.toLowerCase();
  if (authStore.users[key]) { await jitter(); return sendJson(res, 401, { error: 'Invalid credentials' }); }
  const salt = crypto.randomBytes(16).toString('hex'); const hash = hashPassword(body.password, salt);
  authStore.users[key] = { name, salt, hash, createdAt: Date.now() };
  const { csrf } = createSession(name, res);
  return sendJson(res, 200, { name, csrf });
}

async function handleAuthLogin(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  if (enforceRateLimit(req, res, { bucket: 'login', subject: clientIp(req), limit: 10, windowSec: 60 })) return;

  let body; try { body = await readJsonBody(req, 2048); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  const err = validate(body, {
    name:     { type: 'string', min: 1, max: 12, pattern: NAME_RE },
    password: { type: 'string', min: 6, max: 100 },
  });
  if (err) { await jitter(); return sendJson(res, 401, { error: 'Invalid credentials' }); }
  await jitter();
  const user = authStore.users[String(body.name).trim().toLowerCase()];
  if (!user) return sendJson(res, 401, { error: 'Invalid credentials' });
  if (hashPassword(body.password, user.salt) !== user.hash) return sendJson(res, 401, { error: 'Invalid credentials' });
  const { csrf } = createSession(user.name, res);
  return sendJson(res, 200, { name: user.name, csrf });
}

function handleAuthLogout(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  destroySession(req, res); return sendJson(res, 200, { ok: true });
}

function handleAuthMe(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (enforceRateLimit(req, res, { bucket: 'me', subject: clientIp(req), limit: 120, windowSec: 60 })) return;
  const me = authenticate(req); if (!me) return sendJson(res, 401, { error: 'Not authenticated' });
  return sendJson(res, 200, { name: me.name, csrf: me.csrf || '' });
}

// ── /api/saves ──────────────────────────────────────────────────────
async function handleSaves(req, res) {
  if (applyCors(req, res, 'GET, POST, DELETE, OPTIONS')) return;
  const me = authenticate(req); if (!me) return sendJson(res, 401, { error: 'Not authenticated' });
  const userLc = me.name.toLowerCase();
  if (!savesStore[userLc]) savesStore[userLc] = {};
  const userSaves = savesStore[userLc];

  const isMutation = req.method === 'POST' || req.method === 'DELETE';
  if (isMutation) {
    if (enforceRateLimit(req, res, { bucket: 'saves_write', subject: `${me.name}:${clientIp(req)}`, limit: 60, windowSec: 60 })) return;
  } else {
    if (enforceRateLimit(req, res, { bucket: 'saves_read', subject: me.name, limit: 300, windowSec: 60 })) return;
  }

  if (req.method === 'GET') {
    const list = Object.values(userSaves).map((entry) => {
      if (entry && entry._sig && !hmacVerify(signatureFor(entry), entry._sig)) entry._tampered = true;
      return entry;
    }).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return sendJson(res, 200, { saves: list });
  }
  if (req.method === 'POST') {
    if (!requireCsrf(req)) return sendJson(res, 403, { error: 'CSRF token missing or invalid' });
    let body; try { body = await readJsonBody(req, MAX_SNAPSHOT_BYTES + 4096); } catch { return sendJson(res, 413, { error: 'Payload too large' }); }
    const snapshot = body && body.snapshot;
    const upsertId = body && typeof body.id === 'string' && /^[a-f0-9]{8,64}$/.test(body.id) ? body.id : null;
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return sendJson(res, 400, { error: 'Invalid snapshot' });
    if (!checkJsonDepth(snapshot, MAX_SNAPSHOT_DEPTH)) return sendJson(res, 400, { error: 'Snapshot too deep' });
    const serialized = JSON.stringify(snapshot); if (serialized.length > MAX_SNAPSHOT_BYTES) return sendJson(res, 413, { error: 'Snapshot too large' });

    const classKey = CLASS_KEYS.has(String(snapshot.classKey)) ? String(snapshot.classKey) : 'knight';
    const character = {
      name:  String(snapshot.name || me.name).slice(0, 20),
      classKey, sex: snapshot.sex === 'female' ? 'female' : 'male',
      level: Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(snapshot.playerLevel) || 1))),
    };
    const floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(snapshot.currentLevel) || 1)));
    const gold  = Math.max(0, Math.min(MAX_GOLD,  Math.floor(Number(snapshot.gold) || 0)));
    const kills = Math.max(0, Math.min(MAX_KILLS, Math.floor(Number(snapshot.runKills) || 0)));
    const hp    = Math.max(0, Math.floor(Number(snapshot.playerHp) || 0));
    const maxHp = Math.max(1, Math.floor(Number(snapshot.playerMaxHp) || 1));

    let id;
    if (upsertId && userSaves[upsertId]) { id = upsertId; }
    else {
      const ex = Object.values(userSaves).sort((a, b) => (a.ts || 0) - (b.ts || 0));
      while (ex.length >= MAX_SAVES_PER_USER) { const oldest = ex.shift(); delete userSaves[oldest.id]; }
      id = crypto.randomBytes(8).toString('hex');
    }
    const entry = { id, ts: Date.now(), userLc, character, floor, gold, kills, hp, maxHp, snapshot };
    entry._sig = signatureFor(entry);
    userSaves[id] = entry; persistSaves();
    return sendJson(res, 200, { id });
  }
  if (req.method === 'DELETE') {
    if (!requireCsrf(req)) return sendJson(res, 403, { error: 'CSRF token missing or invalid' });
    const u = new URL(req.url, 'http://x'); const id = u.searchParams.get('id');
    if (!id || !/^[a-f0-9]{8,64}$/.test(id)) return sendJson(res, 400, { error: 'Invalid id' });
    if (userSaves[id]) { delete userSaves[id]; persistSaves(); }
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 405, { error: 'Method not allowed' });
}

// ── /api/events + /api/csp-report ───────────────────────────────────
async function handleEvents(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  const me = authenticate(req); if (!me) return sendJson(res, 401, { error: 'Not authenticated' });
  if (!requireCsrf(req)) return sendJson(res, 403, { error: 'CSRF token missing or invalid' });
  if (enforceRateLimit(req, res, { bucket: 'events', subject: `${me.name}:${clientIp(req)}`, limit: 120, windowSec: 60 })) return;
  try { await readJsonBody(req, 4096); } catch { return sendJson(res, 400, { error: 'Invalid request' }); }
  return sendJson(res, 200, { ok: true }); // dev-server drops events on the floor
}

async function handleCspReport(req, res) {
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
  try { const body = await readJsonBody(req, 8192); console.warn('[csp]', JSON.stringify(body)); } catch { /* ignore */ }
  res.statusCode = 204; return res.end();
}

function handleStats(req, res) {
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  if (enforceRateLimit(req, res, { bucket: 'stats', subject: clientIp(req), limit: 30, windowSec: 60 })) return;
  const saveCount = Object.values(savesStore).reduce((n, u) => n + Object.keys(u || {}).length, 0);
  return sendJson(res, 200, {
    users: Object.keys(authStore.users).length,
    activeSessions: Object.keys(authStore.sessions).length,
    playersWithSaves: Object.keys(savesStore).length,
    hallOfFameRuns: runs.length,
    saves: saveCount,
  });
}

// ── Static file serving ─────────────────────────────────────────────
const DATA_REFERER_RE = /^https?:\/\/([a-z0-9-]+\.)*(tibia-dungeons\.com|vercel\.app|localhost|127\.0\.0\.1)(:\d+)?(\/|$).*/;

function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  // Mirror the production referer gate for /data/*.json so devs hit the same
  // behavior locally — DevTools-initiated fetches from the game still work,
  // a raw `curl http://localhost:5173/data/creature.json` returns 403.
  if (pathname.startsWith('/data/') && pathname.endsWith('.json')) {
    const ref = req.headers.referer || '';
    if (!DATA_REFERER_RE.test(ref)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex, nofollow' });
      return res.end('Forbidden');
    }
  }
  const full = path.normalize(path.join(GAME_DIR, pathname));
  if (!full.startsWith(GAME_DIR)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end(`404 Not Found: ${pathname}`); }
    const ext = path.extname(full).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self'; manifest-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/csp-report",
    };
    if (pathname.startsWith('/data/') && pathname.endsWith('.json')) {
      headers['X-Robots-Tag'] = 'noindex, nofollow';
    }
    res.writeHead(200, headers);
    fs.createReadStream(full).pipe(res);
  });
}

// ── Server ──────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  applySecurity(res);
  try {
    if (req.url.startsWith('/api/runs'))             return await handleRuns(req, res);
    if (req.url.startsWith('/api/auth/register'))    return await handleAuthRegister(req, res);
    if (req.url.startsWith('/api/auth/login'))       return await handleAuthLogin(req, res);
    if (req.url.startsWith('/api/auth/logout'))      return handleAuthLogout(req, res);
    if (req.url.startsWith('/api/auth/me'))          return handleAuthMe(req, res);
    if (req.url.startsWith('/api/saves'))            return await handleSaves(req, res);
    if (req.url.startsWith('/api/events'))           return await handleEvents(req, res);
    if (req.url.startsWith('/api/csp-report'))       return await handleCspReport(req, res);
    if (req.url.startsWith('/api/stats'))            return handleStats(req, res);
    if (req.url.startsWith('/api/'))                 return sendJson(res, 404, { error: 'Unknown endpoint' });
    return serveStatic(req, res);
  } catch (e) {
    console.error('[dev-server] handler error:', e.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Server error' });
  }
});

server.listen(PORT, () => {
  // Prune expired sessions on boot.
  const now = Date.now(); let pruned = 0;
  for (const [t, s] of Object.entries(authStore.sessions)) {
    if (!s || (s.createdAt || 0) + SESSION_TTL_MS < now) { delete authStore.sessions[t]; pruned++; }
  }
  if (pruned) persistAuth();
  console.log('┌──────────────────────────────────────────────');
  console.log(`│  Tibia Dungeons — local dev server`);
  console.log(`│  URL:      http://localhost:${PORT}`);
  console.log(`│  Game:     ${GAME_DIR}`);
  console.log(`│  HoF DB:   ${RUNS_FILE}   (${runs.length} runs)`);
  console.log(`│  Auth DB:  ${AUTH_FILE}   (${Object.keys(authStore.users).length} users, pruned ${pruned} sessions)`);
  const saveCount = Object.values(savesStore).reduce((n, u) => n + Object.keys(u || {}).length, 0);
  console.log(`│  Saves DB: ${SAVES_FILE}  (${saveCount} saves)`);
  if (!process.env.APP_SECRET) console.log(`│  ⚠  APP_SECRET not set — using dev fallback. Set one before prod.`);
  console.log('└──────────────────────────────────────────────');
});
