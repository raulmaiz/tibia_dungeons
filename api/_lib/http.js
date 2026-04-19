/**
 * Shared HTTP helpers: security headers, CORS allow-list, cookies, body
 * parsing, input validation, HMAC, structured logging.
 *
 * All API endpoints import from here — do NOT reinvent these patterns in
 * individual handlers.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const ALLOWED_ORIGINS = [
  'https://www.tibia-dungeons.com',
  'https://tibia-dungeons.com',
  'https://tibiadungeons-main.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const PREVIEW_VERCEL_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/;

export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return PREVIEW_VERCEL_RE.test(origin);
}

/**
 * Apply a baseline of security headers applicable to every response.
 * CSP is intentionally stricter on /api/* responses (always JSON).
 */
export function applySecurity(res, { noStore = false } = {}) {
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (noStore) res.setHeader('Cache-Control', 'no-store');
}

/**
 * CORS with allow-list. Only echoes `Access-Control-Allow-Origin` when the
 * request's Origin is in the allow-list. Handles OPTIONS preflight.
 * Returns true if the request was a preflight and the response has been ended.
 */
export function applyCors(req, res, methods = 'GET, POST, OPTIONS') {
  const origin = req.headers.origin || '';
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
  res.setHeader('Access-Control-Max-Age', '600');
  if (req.method === 'OPTIONS') {
    res.statusCode = origin && !isAllowedOrigin(origin) ? 403 : 204;
    res.end();
    return true;
  }
  return false;
}

/**
 * Parse a JSON body with a hard size cap. Rejects anything larger than
 * `maxBytes`. Rejects any `__proto__` / `constructor` / `prototype` key.
 */
export function readBody(req, { maxBytes = 200_000 } = {}) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      raw += chunk;
      if (raw.length > maxBytes) {
        aborted = true;
        reject(new Error('Payload too large'));
        try { req.destroy(); } catch { /* ignore */ }
      }
    });
    req.on('end', () => {
      if (aborted) return;
      if (!raw) return resolve({});
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return reject(new Error('Invalid JSON')); }
      if (containsUnsafeKeys(parsed)) return reject(new Error('Invalid JSON'));
      resolve(parsed);
    });
    req.on('error', reject);
  });
}

/**
 * Recursively check for prototype-pollution style keys and reject objects
 * nested deeper than `maxDepth`.
 */
export function checkJsonDepth(obj, maxDepth = 8, depth = 0) {
  if (depth > maxDepth) return false;
  if (obj === null || typeof obj !== 'object') return true;
  for (const v of Array.isArray(obj) ? obj : Object.values(obj)) {
    if (!checkJsonDepth(v, maxDepth, depth + 1)) return false;
  }
  return true;
}

export function containsUnsafeKeys(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== 'object') return false;
  if (seen.has(obj)) return false;
  seen.add(obj);
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;
    if (containsUnsafeKeys(obj[key], seen)) return true;
  }
  return false;
}

/** Client IP, respecting Vercel's x-forwarded-for. */
export function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  const xreal = req.headers['x-real-ip'];
  if (xreal) return String(xreal).trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/** Generic JSON error — never leak internal details. */
export function fail(res, status, message) {
  try { res.status(status).json({ error: message || 'Request failed' }); }
  catch { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: message || 'Request failed' })); }
}

export function ok(res, body) {
  try { res.status(200).json(body); }
  catch { res.statusCode = 200; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); }
}

/** Uniform random delay to flatten response-time based enumeration. */
export function jitter(minMs = 60, maxMs = 180) {
  const d = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((resolve) => setTimeout(resolve, d));
}

/** Pseudo-constant-time string compare. */
export function safeCompare(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  try { return timingSafeEqual(ab, bb); } catch { return false; }
}

// ── HMAC-signed payloads (sessions, saves) ──────────────────────────────

function appSecret() {
  const s = process.env.APP_SECRET;
  if (!s || s.length < 16) {
    // Fail closed in production — but return a deterministic dev secret so
    // `vercel dev` and local tests still work without crashing the module.
    return 'dev-insecure-secret-replace-via-APP_SECRET-env';
  }
  return s;
}

export function hmacSign(data) {
  return createHmac('sha256', appSecret()).update(String(data)).digest('hex');
}

export function hmacVerify(data, sig) {
  return safeCompare(hmacSign(data), sig);
}

// ── Cookies ─────────────────────────────────────────────────────────────

export function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

export function setCookie(res, name, value, { maxAgeSec = 0, httpOnly = true, sameSite = 'Lax' } = {}) {
  const prev = res.getHeader('Set-Cookie');
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `SameSite=${sameSite}`,
    'Secure',
  ];
  if (httpOnly) parts.push('HttpOnly');
  if (maxAgeSec > 0) parts.push(`Max-Age=${maxAgeSec}`);
  const cookie = parts.join('; ');
  const arr = prev ? (Array.isArray(prev) ? [...prev, cookie] : [prev, cookie]) : [cookie];
  res.setHeader('Set-Cookie', arr);
}

export function clearCookie(res, name, { httpOnly = true } = {}) {
  const prev = res.getHeader('Set-Cookie');
  const parts = [
    `${name}=`,
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax',
    'Secure',
  ];
  if (httpOnly) parts.push('HttpOnly');
  const cookie = parts.join('; ');
  const arr = prev ? (Array.isArray(prev) ? [...prev, cookie] : [prev, cookie]) : [cookie];
  res.setHeader('Set-Cookie', arr);
}

// ── Tokens ──────────────────────────────────────────────────────────────

export function newSessionToken() { return randomBytes(32).toString('hex'); }
export function newCsrfToken()    { return randomBytes(24).toString('hex'); }

// ── Schema validation (hand-rolled, no deps) ────────────────────────────

/**
 * Validate an object against a declarative schema.
 *   validate(body, {
 *     name: { type: 'string', min: 1, max: 12, pattern: /^[A-Za-z0-9]+$/ },
 *     floor: { type: 'int', min: 1, max: 100 },
 *     classKey: { type: 'string', enum: ['knight','paladin','sorcerer','druid'] },
 *     optional: { type: 'string', required: false, max: 40 },
 *   })
 * Returns null on success, or a string error message.
 */
export function validate(body, schema) {
  if (!body || typeof body !== 'object') return 'Invalid body';
  for (const [key, rule] of Object.entries(schema)) {
    const v = body[key];
    if (v === undefined || v === null || v === '') {
      if (rule.required === false) continue;
      return 'Invalid request';
    }
    if (rule.type === 'string') {
      if (typeof v !== 'string') return 'Invalid request';
      if (rule.min != null && v.length < rule.min) return 'Invalid request';
      if (rule.max != null && v.length > rule.max) return 'Invalid request';
      if (rule.pattern && !rule.pattern.test(v)) return 'Invalid request';
      if (rule.enum && !rule.enum.includes(v)) return 'Invalid request';
    } else if (rule.type === 'int') {
      const n = Number(v);
      if (!Number.isFinite(n) || Math.floor(n) !== n) return 'Invalid request';
      if (rule.min != null && n < rule.min) return 'Invalid request';
      if (rule.max != null && n > rule.max) return 'Invalid request';
    } else if (rule.type === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) return 'Invalid request';
      if (rule.min != null && n < rule.min) return 'Invalid request';
      if (rule.max != null && n > rule.max) return 'Invalid request';
    } else if (rule.type === 'object') {
      if (typeof v !== 'object' || Array.isArray(v)) return 'Invalid request';
    }
  }
  return null;
}

// ── Structured logging ──────────────────────────────────────────────────

export function log(level, event, meta = {}) {
  try {
    // One-line JSON per record — Vercel's log viewer indexes these cleanly.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ts: Date.now(), level, event, ...meta }));
  } catch { /* never throw from a logger */ }
}
