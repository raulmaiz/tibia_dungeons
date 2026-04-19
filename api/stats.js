import { redisPipeline } from './_lib/redis.js';
import {
  applySecurity, applyCors, clientIp, fail, ok, log,
} from './_lib/http.js';
import { enforceRateLimit } from './_lib/ratelimit.js';

/**
 * GET /api/stats → { users, activeSessions, playersWithSaves, hallOfFameRuns }
 * Public aggregate counts. Rate-limited to prevent hammering KEYS *.
 */

export default async function handler(req, res) {
  applySecurity(res);
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const ip = clientIp(req);
  if (await enforceRateLimit(req, res, { bucket: 'stats', subject: ip, limit: 30, windowSec: 60 })) return;

  try {
    const [usersRes, sessionsRes, savesRes, runsRes] = await redisPipeline([
      ['KEYS', 'user:*'],
      ['KEYS', 'session:*'],
      ['KEYS', 'saves:*'],
      ['ZCARD', 'hof:runs'],
    ]);

    const users = Array.isArray(usersRes.result) ? usersRes.result.length : 0;
    const sessions = Array.isArray(sessionsRes.result) ? sessionsRes.result.length : 0;
    const saves = Array.isArray(savesRes.result) ? savesRes.result.length : 0;
    const runs = Number(runsRes.result) || 0;

    return ok(res, {
      users,
      activeSessions: sessions,
      playersWithSaves: saves,
      hallOfFameRuns: runs,
    });
  } catch (err) {
    log('error', 'stats.fail', { msg: err && err.message });
    return fail(res, 500, 'Failed to fetch stats');
  }
}
