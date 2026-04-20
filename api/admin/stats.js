import { redis, redisPipeline } from '../_lib/redis.js';
import {
  applySecurity, applyCors, clientIp, fail, ok, log,
} from '../_lib/http.js';
import { enforceRateLimit } from '../_lib/ratelimit.js';
import { requireAdmin } from '../_lib/auth.js';

/**
 * GET /api/admin/stats → everything an admin wants to see in one call.
 *
 * Admin-only. Protected by:
 *   1. Security headers + allow-listed CORS.
 *   2. Session cookie + role === 'admin' (requireAdmin).
 *   3. Rate limit per session to keep KEYS scans cheap.
 *
 * Returns aggregate counts, a per-user breakdown (saves/runs), and the
 * top Hall of Fame entries. KEYS + MGET are acceptable here because
 * the user base is small and this endpoint is never hit by regular players.
 */

const HOF_KEY = 'hof:runs';
const TOP_RUNS_LIMIT = 50;

export default async function handler(req, res) {
  applySecurity(res, { noStore: true });
  if (applyCors(req, res, 'GET, OPTIONS')) return;
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const me = await requireAdmin(req);
  if (!me) return fail(res, 403, 'Forbidden');

  if (await enforceRateLimit(req, res, {
    bucket: 'admin_stats', subject: me.name, limit: 60, windowSec: 60,
  })) return;

  try {
    const [usersRes, sessionsRes, savesKeysRes, hofCardRes, runsRawRes] = await redisPipeline([
      ['KEYS', 'user:*'],
      ['KEYS', 'session:*'],
      ['KEYS', 'saves:*'],
      ['ZCARD', HOF_KEY],
      ['ZREVRANGE', HOF_KEY, 0, TOP_RUNS_LIMIT - 1, 'WITHSCORES'],
    ]);

    const userKeys   = Array.isArray(usersRes.result)     ? usersRes.result     : [];
    const sessionCnt = Array.isArray(sessionsRes.result)  ? sessionsRes.result.length : 0;
    const saveKeys   = Array.isArray(savesKeysRes.result) ? savesKeysRes.result : [];
    const hofTotal   = Number(hofCardRes.result) || 0;
    const runsRaw    = Array.isArray(runsRawRes.result)   ? runsRawRes.result   : [];

    const topRuns = [];
    for (let i = 0; i < runsRaw.length; i += 2) {
      try {
        const run = JSON.parse(runsRaw[i]);
        run._score = Number(runsRaw[i + 1]);
        topRuns.push(run);
      } catch { /* skip corrupted entry */ }
    }

    // Pull every user record in one pipeline. Scrub salt/hash before sending.
    let users = [];
    if (userKeys.length > 0) {
      const pipeline = userKeys.map((k) => ['GET', k]);
      const resp = await redisPipeline(pipeline);
      users = (Array.isArray(resp) ? resp : []).map((r, i) => {
        try {
          const u = JSON.parse(r.result);
          return {
            name: u.name,
            role: u.role === 'admin' ? 'admin' : 'user',
            createdAt: Number(u.createdAt) || 0,
            key: userKeys[i],
          };
        } catch { return null; }
      }).filter(Boolean);
    }
    users.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Count saves per user by walking each saves:<name> hash length.
    const savesPerUser = {};
    let savesTotal = 0;
    if (saveKeys.length > 0) {
      const pipeline = saveKeys.map((k) => ['HLEN', k]);
      const resp = await redisPipeline(pipeline);
      (Array.isArray(resp) ? resp : []).forEach((r, i) => {
        const count = Number(r.result) || 0;
        const nameLc = saveKeys[i].replace(/^saves:/, '');
        savesPerUser[nameLc] = count;
        savesTotal += count;
      });
    }

    // Count runs per user (from the top-runs window only; ZSCAN on a small
    // sorted set would double the round trips for little gain).
    const runsPerUser = {};
    for (const run of topRuns) {
      const k = String(run.name || '').toLowerCase();
      if (!k) continue;
      runsPerUser[k] = (runsPerUser[k] || 0) + 1;
    }

    const usersWithDetails = users.map((u) => {
      const lc = String(u.name || '').toLowerCase();
      return { ...u, saves: savesPerUser[lc] || 0, runsInTop: runsPerUser[lc] || 0 };
    });

    return ok(res, {
      totals: {
        users:            users.length,
        activeSessions:   sessionCnt,
        playersWithSaves: Object.keys(savesPerUser).length,
        totalSaves:       savesTotal,
        hallOfFameRuns:   hofTotal,
      },
      users: usersWithDetails,
      topRuns,
      generatedAt: Date.now(),
    });
  } catch (err) {
    log('error', 'admin.stats.fail', { msg: err && err.message });
    return fail(res, 500, 'Failed to fetch stats');
  }
}
