import { redis } from './_lib/redis.js';
import {
  applySecurity, applyCors, readBody, clientIp, fail, ok,
  validate, log,
} from './_lib/http.js';
import { enforceRateLimit } from './_lib/ratelimit.js';
import { authenticate, requireCsrf } from './_lib/auth.js';

/**
 *   GET  /api/runs  → { runs: [...] }      (public, top 100)
 *   POST /api/runs  → { ok: true }         (authenticated + CSRF)
 *
 * Security layers:
 *   1. Security headers + CORS allow-list.
 *   2. Auth required for POST (Level 4: Hall of Fame cannot be spoofed anonymously).
 *   3. Rate limit: GET 60/min/IP, POST 10/h/user.
 *   4. Strict schema validation + progression caps (floor ≤ 100, kills ≤ floor×200,
 *      level ≤ 200, gold ≤ 10M).
 *   5. Score is computed server-side — `score` in the body is ignored.
 *   6. `name` must match the authenticated user (leaderboard identity is the account).
 *   7. Generic error responses; internals only in structured logs.
 */

const KEY = 'hof:runs';
const MAX = 100;

const CLASS_KEYS = ['knight', 'paladin', 'sorcerer', 'druid'];

const MAX_FLOOR = 100;
const MAX_LEVEL = 200;
const MAX_GOLD  = 10_000_000;

const NAME_RE = /^[A-Za-z0-9 _-]+$/;
const KILLED_BY_RE = /^[\p{L}\p{N} _\-'().,!?]+$/u;

export default async function handler(req, res) {
  applySecurity(res);
  if (applyCors(req, res, 'GET, POST, OPTIONS')) return;

  if (req.method === 'GET') {
    const ip = clientIp(req);
    if (await enforceRateLimit(req, res, { bucket: 'runs_read', subject: ip, limit: 60, windowSec: 60 })) return;
    try {
      const { result } = await redis('ZREVRANGE', KEY, 0, MAX - 1, 'WITHSCORES');
      const arr = Array.isArray(result) ? result : [];
      const runs = [];
      for (let i = 0; i < arr.length; i += 2) {
        try {
          const run = JSON.parse(arr[i]);
          run._score = Number(arr[i + 1]);
          runs.push(run);
        } catch { /* skip corrupted entry */ }
      }
      return ok(res, { runs });
    } catch (e) {
      log('error', 'runs.get', { msg: e && e.message });
      return fail(res, 500, 'Server error');
    }
  }

  if (req.method === 'POST') {
    const me = await authenticate(req);
    if (!me || !me.name) return fail(res, 401, 'Not authenticated');
    if (!requireCsrf(req)) return fail(res, 403, 'CSRF token missing or invalid');

    // Admin accounts are for testing + moderation — their deaths must never
    // pollute the Hall of Fame. Accept the request so clients don't retry,
    // but don't write anything.
    if (me.role === 'admin') {
      log('info', 'runs.post.skip_admin', { name: me.name });
      return ok(res, { ok: true, skipped: 'admin' });
    }

    if (await enforceRateLimit(req, res, { bucket: 'runs_post', subject: me.name, limit: 10, windowSec: 3600 })) return;

    let body;
    try { body = await readBody(req, { maxBytes: 4096 }); }
    catch { return fail(res, 400, 'Invalid request'); }

    const err = validate(body, {
      name:        { type: 'string', min: 1, max: 20, pattern: NAME_RE },
      classKey:    { type: 'string', enum: CLASS_KEYS },
      floor:       { type: 'int', min: 1, max: MAX_FLOOR },
      kills:       { type: 'int', min: 0, max: MAX_FLOOR * 200 },
      playerLevel: { type: 'int', min: 1, max: MAX_LEVEL },
      gold:        { type: 'int', min: 0, max: MAX_GOLD },
      killedBy:    { type: 'string', min: 1, max: 40, pattern: KILLED_BY_RE, required: false },
      sex:         { type: 'string', enum: ['male', 'female'], required: false },
    });
    if (err) return fail(res, 400, 'Invalid request');

    // Authenticated users post under their account name only. Guests cannot
    // post — the prior "any name" free-for-all is what let scoreboards be
    // spoofed.
    const authName = String(me.name).trim();
    const claimedName = String(body.name).trim();
    if (authName.toLowerCase() !== claimedName.toLowerCase()) {
      return fail(res, 403, 'Name does not match authenticated user');
    }

    // Progression cap: kills cannot exceed 200 per floor reached.
    if (Number(body.kills) > Number(body.floor) * 200) {
      return fail(res, 400, 'Invalid request');
    }

    const entry = {
      name:        authName.slice(0, 20),
      classKey:    String(body.classKey),
      sex:         body.sex === 'female' ? 'female' : 'male',
      floor:       Math.floor(Number(body.floor)),
      kills:       Math.floor(Number(body.kills)),
      playerLevel: Math.floor(Number(body.playerLevel)),
      gold:        Math.floor(Number(body.gold)),
      killedBy:    body.killedBy ? String(body.killedBy).trim().slice(0, 40) : 'Unknown',
      ts:          Date.now(),
    };
    // Score is always computed server-side — ignore anything the client sent.
    const score = entry.floor * 1_000_000 + entry.kills * 1_000 + entry.playerLevel;

    try {
      await redis('ZADD', KEY, score, JSON.stringify(entry));
      await redis('ZREMRANGEBYRANK', KEY, 0, -(MAX + 1));
      log('info', 'runs.post', { name: entry.name, floor: entry.floor, score });
      return ok(res, { ok: true });
    } catch (e) {
      log('error', 'runs.post.fail', { msg: e && e.message });
      return fail(res, 500, 'Server error');
    }
  }

  return fail(res, 405, 'Method not allowed');
}
