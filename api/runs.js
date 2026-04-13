const KEY = 'hof:runs';
const MAX = 100;

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

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const CLASS_LABELS = {
  knight: 'Elite Knight',
  paladin: 'Royal Paladin',
  sorcerer: 'Master Sorcerer',
  druid: 'Elder Druid',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
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
      return res.status(200).json({ runs });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { name, floor, classKey } = body;
      if (!name || !floor || !classKey) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const classNorm = String(classKey).toLowerCase();
      const entry = {
        name:        String(name).trim().slice(0, 20) || 'Adventurer',
        classKey:    CLASS_LABELS[classNorm] ? classNorm : 'knight',
        sex:         String(body.sex || 'male') === 'female' ? 'female' : 'male',
        floor:       Math.max(1, Math.min(9999, Math.floor(Number(floor)) || 1)),
        kills:       Math.max(0, Math.floor(Number(body.kills) || 0)),
        playerLevel: Math.max(1, Math.min(9999, Math.floor(Number(body.playerLevel) || 1))),
        gold:        Math.max(0, Math.floor(Number(body.gold) || 0)),
        killedBy:    body.killedBy ? String(body.killedBy).trim().slice(0, 40) : 'Unknown',
        ts:          Date.now(),
      };
      // Score: floor is primary (×10⁶), kills secondary (×10³), level tertiary
      const score = entry.floor * 1_000_000 + entry.kills * 1_000 + entry.playerLevel;
      await redis('ZADD', KEY, score, JSON.stringify(entry));
      // Keep only top MAX entries (remove lowest scoring excess)
      await redis('ZREMRANGEBYRANK', KEY, 0, -(MAX + 1));
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
