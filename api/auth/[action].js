import { randomBytes, scryptSync } from 'node:crypto';
import { redis } from '../_lib/redis.js';
import {
  applySecurity, applyCors, readBody, clientIp, fail, ok, jitter,
  validate, log,
} from '../_lib/http.js';
import { enforceRateLimit } from '../_lib/ratelimit.js';
import {
  authenticate, createSession, destroySession,
} from '../_lib/auth.js';

/**
 * /api/auth/register  POST { name, password }  → sets td_session + td_csrf cookies, body { name, csrf }
 * /api/auth/login     POST { name, password }  → sets td_session + td_csrf cookies, body { name, csrf }
 * /api/auth/logout    POST                     → clears session + cookies
 * /api/auth/me        GET                      → { name, csrf }
 *
 * Security layers (in order):
 *   1. Security headers + allow-listed CORS (applied on every response).
 *   2. IP-based rate limiting (brute force + registration spam).
 *   3. Input schema validation.
 *   4. Generic errors + random jitter (anti-enumeration on login/register).
 *   5. HttpOnly + Secure session cookie; JS-readable CSRF cookie for double-submit.
 */

const NAME_RE = /^[A-Za-z0-9 _-]+$/;

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const ip = clientIp(req);
  if (await enforceRateLimit(req, res, { bucket: 'register', subject: ip, limit: 5, windowSec: 3600 })) return;

  let body;
  try { body = await readBody(req, { maxBytes: 2048 }); } catch { return fail(res, 400, 'Invalid request'); }
  const err = validate(body, {
    name:     { type: 'string', min: 1, max: 12, pattern: NAME_RE },
    password: { type: 'string', min: 6, max: 100 },
  });
  if (err) { await jitter(); return fail(res, 400, 'Invalid credentials'); }

  const name = String(body.name).trim();
  const password = String(body.password);
  const userKey = `user:${name.toLowerCase()}`;
  const { result: existing } = await redis('GET', userKey);
  if (existing) {
    // Same 401 + delay as a failed login so name-taken vs wrong-password
    // can't be distinguished through the register endpoint.
    await jitter();
    return fail(res, 401, 'Invalid credentials');
  }

  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  // role is never writable via the public register endpoint — admin is only
  // created out-of-band by scripts/seed-admin.js.
  const user = { name, salt, hash, role: 'user', createdAt: Date.now() };
  await redis('SET', userKey, JSON.stringify(user));
  const { csrf } = await createSession(name, res, { role: 'user' });
  log('info', 'auth.register', { name, ip });
  return ok(res, { name, csrf });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const ip = clientIp(req);
  if (await enforceRateLimit(req, res, { bucket: 'login', subject: ip, limit: 10, windowSec: 60 })) return;

  let body;
  try { body = await readBody(req, { maxBytes: 2048 }); } catch { return fail(res, 400, 'Invalid request'); }
  const err = validate(body, {
    name:     { type: 'string', min: 1, max: 12, pattern: NAME_RE },
    password: { type: 'string', min: 6, max: 100 },
  });
  if (err) { await jitter(); return fail(res, 401, 'Invalid credentials'); }

  const name = String(body.name).trim();
  const password = String(body.password);
  const userKey = `user:${name.toLowerCase()}`;
  const { result: raw } = await redis('GET', userKey);
  await jitter(); // flatten "missing user" vs "wrong password" timing
  if (!raw) return fail(res, 401, 'Invalid credentials');
  let user;
  try { user = JSON.parse(raw); } catch { return fail(res, 401, 'Invalid credentials'); }
  if (hashPassword(password, user.salt) !== user.hash) {
    log('warn', 'auth.login.fail', { name: user.name, ip });
    return fail(res, 401, 'Invalid credentials');
  }
  const role = user.role === 'admin' ? 'admin' : 'user';
  const { csrf } = await createSession(user.name, res, { role });
  log('info', 'auth.login', { name: user.name, ip, role });
  return ok(res, { name: user.name, csrf, role });
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  await destroySession(req, res);
  return ok(res, { ok: true });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');
  const ip = clientIp(req);
  if (await enforceRateLimit(req, res, { bucket: 'me', subject: ip, limit: 120, windowSec: 60 })) return;
  const me = await authenticate(req);
  if (!me) return fail(res, 401, 'Not authenticated');
  // Return CSRF token so the client can bootstrap the double-submit flow
  // even if the JS-readable cookie was missed on a hard reload.
  try {
    const { result: raw } = await redis('GET', `session:${me.token}`);
    const sess = raw ? JSON.parse(raw) : null;
    return ok(res, { name: me.name, role: me.role, csrf: sess && sess.csrf ? sess.csrf : '' });
  } catch { return ok(res, { name: me.name, role: me.role, csrf: '' }); }
}

export default async function handler(req, res) {
  applySecurity(res, { noStore: true });
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return;
  const action = (req.query && req.query.action) || '';
  try {
    if (action === 'register') return await handleRegister(req, res);
    if (action === 'login')    return await handleLogin(req, res);
    if (action === 'logout')   return await handleLogout(req, res);
    if (action === 'me')       return await handleMe(req, res);
    return fail(res, 404, 'Unknown auth action');
  } catch (e) {
    log('error', 'auth.handler', { action, msg: e && e.message });
    return fail(res, 500, 'Server error');
  }
}
