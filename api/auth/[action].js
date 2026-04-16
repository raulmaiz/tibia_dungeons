import { randomBytes, scryptSync } from 'node:crypto';

/**
 * /api/auth/register  POST { name, password } → { token, name }
 * /api/auth/login     POST { name, password } → { token, name }
 * /api/auth/me        GET  (Authorization: Bearer <token>) → { name }
 *
 * Storage (Upstash Redis):
 *   user:{lowercase(name)}   JSON { name, salt, hash, createdAt }
 *   session:{token}          JSON { name, createdAt }         (30-day TTL)
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

const NAME_RE = /^[A-Za-z0-9 _-]+$/;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function hashPassword(password, salt) {
  return scryptSync(password, salt, 64).toString('hex');
}

function validateName(n) {
  if (!n || typeof n !== 'string') return 'Name required';
  const t = n.trim();
  if (t.length < 1) return 'Name required';
  if (t.length > 12) return 'Name too long (max 12)';
  if (!NAME_RE.test(t)) return 'Name can only contain letters, numbers, spaces, _ and -';
  return null;
}

function validatePassword(p) {
  if (!p || typeof p !== 'string') return 'Password required';
  if (p.length < 6) return 'Password must be at least 6 characters';
  if (p.length > 100) return 'Password too long';
  return null;
}

async function handleRegister(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const nameErr = validateName(name); if (nameErr) return res.status(400).json({ error: nameErr });
  const passErr = validatePassword(password); if (passErr) return res.status(400).json({ error: passErr });

  const userKey = `user:${name.toLowerCase()}`;
  const { result: existing } = await redis('GET', userKey);
  if (existing) return res.status(409).json({ error: 'Name already taken' });

  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  const user = { name, salt, hash, createdAt: Date.now() };
  await redis('SET', userKey, JSON.stringify(user));

  const token = randomBytes(32).toString('hex');
  await redis('SETEX', `session:${token}`, SESSION_TTL_SECONDS,
    JSON.stringify({ name, createdAt: Date.now() }));

  return res.status(200).json({ token, name });
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await readBody(req);
  const name = String(body.name || '').trim();
  const password = String(body.password || '');
  const nameErr = validateName(name); if (nameErr) return res.status(400).json({ error: nameErr });
  const passErr = validatePassword(password); if (passErr) return res.status(400).json({ error: passErr });

  const userKey = `user:${name.toLowerCase()}`;
  const { result: raw } = await redis('GET', userKey);
  if (!raw) return res.status(401).json({ error: 'Invalid credentials' });
  let user;
  try { user = JSON.parse(raw); } catch { return res.status(500).json({ error: 'Corrupted user' }); }
  const hash = hashPassword(password, user.salt);
  if (hash !== user.hash) return res.status(401).json({ error: 'Invalid credentials' });

  const token = randomBytes(32).toString('hex');
  await redis('SETEX', `session:${token}`, SESSION_TTL_SECONDS,
    JSON.stringify({ name: user.name, createdAt: Date.now() }));

  return res.status(200).json({ token, name: user.name });
}

async function handleMe(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) return res.status(401).json({ error: 'No token' });

  const { result: raw } = await redis('GET', `session:${token}`);
  if (!raw) return res.status(401).json({ error: 'Invalid or expired session' });
  let sess;
  try { sess = JSON.parse(raw); } catch { return res.status(500).json({ error: 'Corrupted session' }); }
  return res.status(200).json({ name: sess.name });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const action = (req.query && req.query.action) || '';
  try {
    if (action === 'register') return await handleRegister(req, res);
    if (action === 'login')    return await handleLogin(req, res);
    if (action === 'me')       return await handleMe(req, res);
    return res.status(404).json({ error: 'Unknown auth action' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
