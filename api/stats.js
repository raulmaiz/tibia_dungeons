/**
 * GET /api/stats → { users, sessions, saves, runs }
 *
 * Public endpoint — returns aggregate counts from Redis.
 * No auth required (counts only, no personal data exposed).
 */

async function redis(cmd, ...args) {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (!url || !token) throw new Error('Redis not configured');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return res.json();
}

async function redisPipeline(commands) {
  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
  if (!url || !token) throw new Error('Redis not configured');
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Count keys by pattern using KEYS (fine for small datasets)
    const [usersRes, sessionsRes, savesRes, runsRes] = await redisPipeline([
      ['KEYS', 'user:*'],
      ['KEYS', 'session:*'],
      ['KEYS', 'saves:*'],
      ['LLEN', 'hof:runs'],
    ]);

    const users = Array.isArray(usersRes.result) ? usersRes.result.length : 0;
    const sessions = Array.isArray(sessionsRes.result) ? sessionsRes.result.length : 0;
    const saves = Array.isArray(savesRes.result) ? savesRes.result.length : 0;
    const runs = Number(runsRes.result) || 0;

    return res.status(200).json({
      users,
      activeSessions: sessions,
      playersWithSaves: saves,
      hallOfFameRuns: runs,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
}
