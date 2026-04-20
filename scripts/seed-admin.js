#!/usr/bin/env node
/**
 * One-time seed for the admin user.
 *
 * Usage:
 *   vercel env pull .env.production.local
 *   node --env-file=.env.production.local scripts/seed-admin.js
 *
 * Respects:
 *   - ADMIN_USERNAME  (default: admin)
 *   - ADMIN_PASSWORD  (default: Fl0yDP1nk)
 * Writes: user:<lowercase(name)> with role=admin.
 *
 * Safe to re-run: overwrites the existing record with a fresh salt + hash.
 */
import { randomBytes, scryptSync } from 'node:crypto';

const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;
if (!url || !token) {
  console.error('❌  UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set.');
  console.error('    Run: vercel env pull .env.production.local');
  process.exit(1);
}

async function redis(cmd, ...args) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([cmd, ...args]),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  return res.json();
}

const name     = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'Fl0yDP1nk';
const salt     = randomBytes(16).toString('hex');
const hash     = scryptSync(password, salt, 64).toString('hex');

const user = { name, salt, hash, role: 'admin', createdAt: Date.now() };
await redis('SET', `user:${name.toLowerCase()}`, JSON.stringify(user));
console.log(`✅  Seeded admin user "${name}" (role=admin).`);
