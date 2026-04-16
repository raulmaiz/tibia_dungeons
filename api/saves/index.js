import { randomBytes } from 'node:crypto';

/**
 *   GET    /api/saves             → { saves: [...] }        (requires Bearer token)
 *   POST   /api/saves             → { id }                   body = { snapshot }
 *   DELETE /api/saves?id=<saveId> → { ok: true }
 *
 * Storage: one Redis hash per user:
 *   saves:{lowercase(name)}  →  field = saveId, value = JSON{id, ts, character, floor, snapshot}
 */

const MAX_SAVES_PER_USER = 20;
const MAX_SNAPSHOT_BYTES = 200_000;

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
      try { resolve(data ? JSON.parse(data) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

async function authenticate(req) {
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) return null;
  try {
    const { result: raw } = await redis('GET', `session:${token}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function savesKey(userName) {
  return `saves:${String(userName || '').toLowerCase()}`;
}

async function listSaves(res, userName) {
  const { result } = await redis('HGETALL', savesKey(userName));
  // Upstash returns HGETALL as a flat [field, value, field, value, ...] array.
  const saves = [];
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i += 2) {
      try { saves.push(JSON.parse(result[i + 1])); }
      catch { /* skip */ }
    }
  }
  saves.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return res.status(200).json({ saves });
}

async function createSave(req, res, userName) {
  const body = await readBody(req);
  const snapshot = body && body.snapshot;
  const upsertId = body && typeof body.id === 'string' && body.id ? body.id : null;
  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ error: 'Missing snapshot' });
  }
  const serialized = JSON.stringify(snapshot);
  if (serialized.length > MAX_SNAPSHOT_BYTES) {
    return res.status(413).json({ error: 'Snapshot too large' });
  }
  const { result: existingFlat } = await redis('HGETALL', savesKey(userName));
  const existing = [];
  if (Array.isArray(existingFlat)) {
    for (let i = 0; i < existingFlat.length; i += 2) {
      try { existing.push({ field: existingFlat[i], entry: JSON.parse(existingFlat[i + 1]) }); }
      catch { /* skip */ }
    }
  }
  // Upsert path: POST with an existing id → overwrite that slot in place,
  // preserving the save id so the same run keeps reusing it.
  let id;
  if (upsertId && existing.some((e) => e.field === upsertId)) {
    id = upsertId;
  } else {
    // New save — trim oldest if we're over the per-user cap.
    existing.sort((a, b) => (a.entry.ts || 0) - (b.entry.ts || 0));
    while (existing.length >= MAX_SAVES_PER_USER) {
      const oldest = existing.shift();
      await redis('HDEL', savesKey(userName), oldest.field);
    }
    id = randomBytes(8).toString('hex');
  }
  const entry = {
    id,
    ts:        Date.now(),
    character: {
      name:     String(snapshot.name || userName).slice(0, 20),
      classKey: String(snapshot.classKey || 'knight'),
      sex:      snapshot.sex === 'female' ? 'female' : 'male',
      level:    Math.max(1, Math.floor(Number(snapshot.playerLevel) || 1)),
    },
    floor:    Math.max(1, Math.floor(Number(snapshot.currentLevel) || 1)),
    gold:     Math.max(0, Math.floor(Number(snapshot.gold) || 0)),
    kills:    Math.max(0, Math.floor(Number(snapshot.runKills) || 0)),
    hp:       Math.max(0, Math.floor(Number(snapshot.playerHp) || 0)),
    maxHp:    Math.max(1, Math.floor(Number(snapshot.playerMaxHp) || 1)),
    snapshot,
  };
  await redis('HSET', savesKey(userName), id, JSON.stringify(entry));
  return res.status(200).json({ id });
}

async function deleteSave(res, userName, id) {
  if (!id) return res.status(400).json({ error: 'Missing id' });
  await redis('HDEL', savesKey(userName), id);
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const me = await authenticate(req);
  if (!me || !me.name) return res.status(401).json({ error: 'Not authenticated' });

  try {
    if (req.method === 'GET')    return await listSaves(res, me.name);
    if (req.method === 'POST')   return await createSave(req, res, me.name);
    if (req.method === 'DELETE') {
      const url = new URL(req.url, 'http://x');
      return await deleteSave(res, me.name, url.searchParams.get('id'));
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
