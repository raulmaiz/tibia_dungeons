#!/usr/bin/env node
/**
 * Bumps the patch version in game/js/data/version.js.
 * Called automatically by `npm run push` on every git push.
 *
 * 0.0.0 → 0.0.1 → 0.0.2 ...
 * Minor + Major are not touched.
 */
const fs   = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../game/js/data/version.js');
const src = fs.readFileSync(versionFile, 'utf8');

const match = src.match(/VERSION\s*=\s*'(\d+)\.(\d+)\.(\d+)'/);
if (!match) {
  console.error('❌  Could not find VERSION in', versionFile);
  process.exit(1);
}

const [, major, minor, patch] = match;
const next = `${major}.${minor}.${Number(patch) + 1}`;

const today = new Date().toISOString().slice(0, 10);
const updated = src
  .replace(/VERSION\s*=\s*'[\d.]+'/, `VERSION      = '${next}'`)
  .replace(/RELEASE_DATE\s*=\s*'[\d-]+'/, `RELEASE_DATE = '${today}'`);

fs.writeFileSync(versionFile, updated, 'utf8');
console.log(`✅  Patch bumped to v${next}  (${today})`);
