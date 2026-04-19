/**
 * Session + CSRF handling.
 *
 *   authenticate(req)        → { name } | null
 *   createSession(name, res) → { token, csrf, name }   (also sets cookies)
 *   destroySession(req, res) → Promise<void>
 *   requireCsrf(req)         → true if X-CSRF-Token matches td_csrf cookie
 */

import { redis } from './redis.js';
import {
  readCookie, setCookie, clearCookie,
  newSessionToken, newCsrfToken, safeCompare,
} from './http.js';

export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days (down from 30)
export const SESSION_COOKIE = 'td_session';
export const CSRF_COOKIE    = 'td_csrf';

/**
 * Returns { name } for the authenticated caller, or null.
 * Prefers the HttpOnly `td_session` cookie; falls back to Bearer for legacy
 * clients during the migration period.
 */
export async function authenticate(req) {
  const cookieTok = readCookie(req, SESSION_COOKIE);
  const auth = req.headers.authorization || '';
  const bm = /^Bearer\s+(.+)$/i.exec(auth);
  const headerTok = bm ? bm[1].trim() : '';
  const token = cookieTok || headerTok;
  if (!token) return null;
  try {
    const { result: raw } = await redis('GET', `session:${token}`);
    if (!raw) return null;
    const sess = JSON.parse(raw);
    return sess && sess.name ? { name: sess.name, token, viaCookie: !!cookieTok } : null;
  } catch { return null; }
}

/**
 * Create a fresh session: generate token + csrf, persist, set cookies, and
 * return the pair so handlers can include them in the body too (helpful for
 * bootstrapping the double-submit CSRF token on the client).
 */
export async function createSession(name, res) {
  const token = newSessionToken();
  const csrf  = newCsrfToken();
  await redis('SETEX', `session:${token}`, SESSION_TTL_SECONDS,
    JSON.stringify({ name, createdAt: Date.now(), csrf }));
  setCookie(res, SESSION_COOKIE, token, { maxAgeSec: SESSION_TTL_SECONDS, httpOnly: true, sameSite: 'Lax' });
  // CSRF cookie is readable by JS so the client can echo it in X-CSRF-Token.
  setCookie(res, CSRF_COOKIE,    csrf,  { maxAgeSec: SESSION_TTL_SECONDS, httpOnly: false, sameSite: 'Lax' });
  return { token, csrf, name };
}

export async function destroySession(req, res) {
  const cookieTok = readCookie(req, SESSION_COOKIE);
  const auth = req.headers.authorization || '';
  const bm = /^Bearer\s+(.+)$/i.exec(auth);
  const headerTok = bm ? bm[1].trim() : '';
  const token = cookieTok || headerTok;
  if (token) {
    try { await redis('DEL', `session:${token}`); } catch { /* best-effort */ }
  }
  clearCookie(res, SESSION_COOKIE);
  clearCookie(res, CSRF_COOKIE, { httpOnly: false });
}

/**
 * Double-submit CSRF check. The client reads `td_csrf` (JS-readable cookie)
 * and echoes it in the `X-CSRF-Token` header. SameSite=Lax already blocks
 * most CSRF paths; this header check defends against subdomain takeover
 * leaking the session cookie alone without the CSRF cookie.
 *
 * Only enforced on state-changing methods.
 */
export function requireCsrf(req) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return true;
  const header = req.headers['x-csrf-token'] || '';
  const cookie = readCookie(req, CSRF_COOKIE);
  if (!header || !cookie) return false;
  return safeCompare(header, cookie);
}
