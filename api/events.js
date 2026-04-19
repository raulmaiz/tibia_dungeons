import { redis } from './_lib/redis.js';
import {
  applySecurity, applyCors, readBody, clientIp, fail, ok,
  validate, log,
} from './_lib/http.js';
import { enforceRateLimit } from './_lib/ratelimit.js';
import { authenticate, requireCsrf } from './_lib/auth.js';

/**
 * POST /api/events  → { ok: true }
 *
 * Level 9 (stub): append-only event log per user. This is the foundation
 * for future server-authoritative ranked runs — the client streams discrete
 * gameplay events ("enterFloor", "killCreature", "takeDamage") and the
 * server keeps a canonical record. Today it just persists the events; a
 * future version will recompute run state from them and reject inconsistent
 * submissions.
 *
 * Keyed as `events:{userLc}:{runId}` (Redis list, capped at 5000 events).
 * Events older than 7 days are garbage collected by the runIds-index TTL.
 */

const MAX_TYPE_LEN     = 32;
const MAX_EVENT_BYTES  = 4096;
const MAX_EVENTS_PER_RUN = 5000;
const RUN_TTL_SECONDS  = 7 * 24 * 3600;
const RUN_ID_RE        = /^[a-f0-9]{8,64}$/;
const TYPE_RE          = /^[a-zA-Z][a-zA-Z0-9_]{0,31}$/;

export default async function handler(req, res) {
  applySecurity(res, { noStore: true });
  if (applyCors(req, res, 'POST, OPTIONS')) return;
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const me = await authenticate(req);
  if (!me || !me.name) return fail(res, 401, 'Not authenticated');
  if (!requireCsrf(req)) return fail(res, 403, 'CSRF token missing or invalid');

  const ip = clientIp(req);
  if (await enforceRateLimit(req, res, {
    bucket: 'events', subject: `${me.name}:${ip}`, limit: 120, windowSec: 60,
  })) return;

  let body;
  try { body = await readBody(req, { maxBytes: MAX_EVENT_BYTES }); }
  catch { return fail(res, 400, 'Invalid request'); }

  const err = validate(body, {
    runId: { type: 'string', pattern: RUN_ID_RE },
    type:  { type: 'string', pattern: TYPE_RE },
  });
  if (err) return fail(res, 400, 'Invalid request');

  const userLc = String(me.name).toLowerCase();
  const key = `events:${userLc}:${body.runId}`;
  const record = JSON.stringify({
    t:   body.type,
    ts:  Date.now(),
    data: body.data && typeof body.data === 'object' ? body.data : null,
  });

  try {
    await redis('RPUSH', key, record);
    await redis('LTRIM', key, -MAX_EVENTS_PER_RUN, -1);
    await redis('EXPIRE', key, RUN_TTL_SECONDS);
    return ok(res, { ok: true });
  } catch (e) {
    log('error', 'events.post.fail', { msg: e && e.message });
    return fail(res, 500, 'Server error');
  }
}
