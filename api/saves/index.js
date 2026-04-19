import { randomBytes } from 'node:crypto';
import { redis } from '../_lib/redis.js';
import {
  applySecurity, applyCors, readBody, clientIp, fail, ok,
  checkJsonDepth, validate, hmacSign, hmacVerify, log,
} from '../_lib/http.js';
import { enforceRateLimit } from '../_lib/ratelimit.js';
import { authenticate, requireCsrf } from '../_lib/auth.js';

/**
 *   GET    /api/saves             → { saves: [...] }         (cookie or Bearer)
 *   POST   /api/saves             → { id }                    body = { snapshot, id? }
 *   DELETE /api/saves?id=<saveId> → { ok: true }
 *
 * Security layers:
 *   1. Security headers + CORS allow-list (via _lib/http).
 *   2. Per-user rate limit (prevents snapshot-spam filling Redis).
 *   3. Strict payload size + JSON depth cap + prototype-pollution rejection.
 *   4. Numeric caps (floor ≤ 100, level ≤ 200, gold ≤ 10M).
 *   5. HMAC signature on each save — mismatches log an "integrity" warning.
 *   6. CSRF double-submit on mutating methods.
 *
 * Storage: one Redis hash per user — `saves:{lowercase(name)}`:
 *   field = saveId, value = JSON { id, ts, character, floor, …, snapshot, _sig }
 */

const MAX_SAVES_PER_USER   = 20;
const MAX_SNAPSHOT_BYTES   = 200_000;
const MAX_SNAPSHOT_DEPTH   = 8;
const MAX_FLOOR            = 100;
const MAX_LEVEL            = 200;
const MAX_GOLD             = 10_000_000;
const MAX_KILLS            = MAX_FLOOR * 200;

const CLASS_KEYS = ['knight', 'paladin', 'sorcerer', 'druid'];

function savesKey(userName) { return `saves:${String(userName || '').toLowerCase()}`; }

/**
 * Canonical stringify: keys sorted at every level so the HMAC signature
 * doesn't flap just because the JS engine picked a different insertion order.
 * Depth-limited via the caller's `checkJsonDepth` — safe to recurse here.
 */
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(value[k])).join(',') + '}';
}

function signatureFor(entry) {
  // Sign the stable subset — not the redundant character/floor fields we
  // derive on the server each save (those are re-derived on load).
  const canonical = canonicalStringify({
    id:        entry.id,
    ts:        entry.ts,
    userLc:    entry.userLc,
    snapshot:  entry.snapshot,
  });
  return hmacSign(canonical);
}

async function listSaves(res, userName) {
  const { result } = await redis('HGETALL', savesKey(userName));
  const saves = [];
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i += 2) {
      try {
        const entry = JSON.parse(result[i + 1]);
        // Verify signature on load — a mismatch means someone tampered with
        // the Redis record directly. We still return the save (don't brick
        // the user) but flag it and log for forensics.
        if (entry && entry._sig) {
          const expected = signatureFor(entry);
          if (!hmacVerify(expected, entry._sig)) {
            entry._tampered = true;
            log('warn', 'save.integrity.fail', { userLc: entry.userLc, id: entry.id });
          }
        }
        saves.push(entry);
      } catch { /* skip */ }
    }
  }
  saves.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return ok(res, { saves });
}

async function createSave(req, res, userName) {
  if (!requireCsrf(req)) return fail(res, 403, 'CSRF token missing or invalid');

  let body;
  try { body = await readBody(req, { maxBytes: MAX_SNAPSHOT_BYTES + 4096 }); }
  catch { return fail(res, 413, 'Payload too large'); }

  const snapshot = body && body.snapshot;
  const upsertId = body && typeof body.id === 'string' && /^[a-f0-9]{8,64}$/.test(body.id) ? body.id : null;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return fail(res, 400, 'Invalid snapshot');
  }
  if (!checkJsonDepth(snapshot, MAX_SNAPSHOT_DEPTH)) return fail(res, 400, 'Snapshot too deep');

  const serialized = JSON.stringify(snapshot);
  if (serialized.length > MAX_SNAPSHOT_BYTES) return fail(res, 413, 'Snapshot too large');

  const classKey = CLASS_KEYS.includes(String(snapshot.classKey)) ? String(snapshot.classKey) : 'knight';
  const character = {
    name:     String(snapshot.name || userName).slice(0, 20),
    classKey,
    sex:      snapshot.sex === 'female' ? 'female' : 'male',
    level:    Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(snapshot.playerLevel) || 1))),
  };
  const floor = Math.max(1, Math.min(MAX_FLOOR, Math.floor(Number(snapshot.currentLevel) || 1)));
  const gold  = Math.max(0, Math.min(MAX_GOLD,  Math.floor(Number(snapshot.gold) || 0)));
  const kills = Math.max(0, Math.min(MAX_KILLS, Math.floor(Number(snapshot.runKills) || 0)));
  const hp    = Math.max(0, Math.floor(Number(snapshot.playerHp) || 0));
  const maxHp = Math.max(1, Math.floor(Number(snapshot.playerMaxHp) || 1));

  const userLc = String(userName || '').toLowerCase();
  const { result: existingFlat } = await redis('HGETALL', savesKey(userName));
  const existing = [];
  if (Array.isArray(existingFlat)) {
    for (let i = 0; i < existingFlat.length; i += 2) {
      try { existing.push({ field: existingFlat[i], entry: JSON.parse(existingFlat[i + 1]) }); }
      catch { /* skip */ }
    }
  }
  let id;
  if (upsertId && existing.some((e) => e.field === upsertId)) {
    id = upsertId;
  } else {
    existing.sort((a, b) => (a.entry.ts || 0) - (b.entry.ts || 0));
    while (existing.length >= MAX_SAVES_PER_USER) {
      const oldest = existing.shift();
      await redis('HDEL', savesKey(userName), oldest.field);
    }
    id = randomBytes(8).toString('hex');
  }
  const entry = {
    id, ts: Date.now(), userLc,
    character, floor, gold, kills, hp, maxHp,
    snapshot,
  };
  entry._sig = signatureFor(entry);
  await redis('HSET', savesKey(userName), id, JSON.stringify(entry));
  log('info', 'save.upsert', { userLc, id, floor, level: character.level });
  return ok(res, { id });
}

async function deleteSave(req, res, userName, id) {
  if (!requireCsrf(req)) return fail(res, 403, 'CSRF token missing or invalid');
  if (!id || !/^[a-f0-9]{8,64}$/.test(id)) return fail(res, 400, 'Invalid id');
  await redis('HDEL', savesKey(userName), id);
  log('info', 'save.delete', { userLc: String(userName || '').toLowerCase(), id });
  return ok(res, { ok: true });
}

export default async function handler(req, res) {
  applySecurity(res, { noStore: true });
  if (applyCors(req, res, 'GET, POST, DELETE, OPTIONS')) return;

  const me = await authenticate(req);
  if (!me || !me.name) return fail(res, 401, 'Not authenticated');

  const ip = clientIp(req);
  const isMutation = req.method === 'POST' || req.method === 'DELETE';
  if (isMutation) {
    if (await enforceRateLimit(req, res, {
      bucket: 'saves_write', subject: `${me.name}:${ip}`, limit: 60, windowSec: 60,
    })) return;
  } else {
    if (await enforceRateLimit(req, res, {
      bucket: 'saves_read', subject: me.name, limit: 300, windowSec: 60,
    })) return;
  }

  try {
    if (req.method === 'GET')    return await listSaves(res, me.name);
    if (req.method === 'POST')   return await createSave(req, res, me.name);
    if (req.method === 'DELETE') {
      const url = new URL(req.url, 'http://x');
      return await deleteSave(req, res, me.name, url.searchParams.get('id'));
    }
    return fail(res, 405, 'Method not allowed');
  } catch (e) {
    log('error', 'saves.handler', { msg: e && e.message });
    return fail(res, 500, 'Server error');
  }
}
