/**
 * Fixed-window rate limiter backed by Upstash Redis.
 *
 *   await rateLimit({ bucket: 'login', subject: ip, limit: 10, windowSec: 60 });
 *   → { ok, remaining, resetMs }
 *
 * Fail-open: if Redis is unreachable we log and allow the request through,
 * so Redis outages don't make the API unusable. The Upstash free tier is
 * plenty for these buckets (one INCR + one EXPIRE per hit).
 */

import { redisPipeline } from './redis.js';
import { log } from './http.js';

export async function rateLimit({ bucket, subject, limit, windowSec }) {
  if (!bucket || !subject || !limit || !windowSec) {
    return { ok: true, remaining: limit, resetMs: 0 };
  }
  const windowId = Math.floor(Date.now() / (windowSec * 1000));
  const key = `rl:${bucket}:${subject}:${windowId}`;
  try {
    const resp = await redisPipeline([
      ['INCR', key],
      ['EXPIRE', key, windowSec],
    ]);
    const count = Number(Array.isArray(resp) && resp[0] && resp[0].result) || 0;
    const remaining = Math.max(0, limit - count);
    const resetMs = (windowId + 1) * windowSec * 1000;
    if (count > limit) {
      log('warn', 'ratelimit.block', { bucket, subject, count, limit });
      return { ok: false, remaining: 0, resetMs };
    }
    return { ok: true, remaining, resetMs };
  } catch (e) {
    log('warn', 'ratelimit.error', { bucket, msg: e.message });
    return { ok: true, remaining: limit, resetMs: 0 };
  }
}

/** Apply rate-limit headers + send 429 if blocked. Returns true if blocked. */
export async function enforceRateLimit(req, res, opts) {
  const result = await rateLimit(opts);
  res.setHeader('X-RateLimit-Limit', String(opts.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetMs / 1000)));
  if (!result.ok) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.resetMs - Date.now()) / 1000))));
    try { res.status(429).json({ error: 'Too many requests' }); }
    catch { res.statusCode = 429; res.end(JSON.stringify({ error: 'Too many requests' })); }
    return true;
  }
  return false;
}
