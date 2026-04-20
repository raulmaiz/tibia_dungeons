#!/usr/bin/env node
/**
 * Build + package the offline (itch.io / standalone) flavor of the game.
 *
 *   node scripts/build-itch.js
 *
 * Output: dist/tibia-dungeons.zip
 *
 * Contents of the ZIP: a self-contained `tibia-dungeons/` directory with
 * `index.html` at the root (itch.io requirement) and everything it needs
 * (bundled JS, data, images, icons, manifest, favicon).
 *
 * The original `game/` tree is never mutated — all work happens in
 * `dist/itch-staging/`. The service worker and Vercel-specific assets
 * (sw.js, stats.html, api references) are stripped from the staged copy.
 */

const path   = require('path');
const fs     = require('node:fs');
const fsp    = require('node:fs/promises');
const crypto = require('node:crypto');
const zlib   = require('node:zlib');
const esbuild = require('esbuild');

const ROOT         = path.resolve(__dirname, '..');
const GAME_DIR     = path.join(ROOT, 'game');
const DIST_DIR     = path.join(ROOT, 'dist');
const STAGING_DIR  = path.join(DIST_DIR, 'itch-staging');
const STAGED_GAME  = path.join(STAGING_DIR, 'tibia-dungeons');
const ZIP_OUT      = path.join(DIST_DIR, 'tibia-dungeons.zip');

// Everything under game/ that is NOT needed for the standalone build.
// Paths are relative to GAME_DIR (POSIX separators).
const EXCLUDE = new Set([
  'sw.js',            // Service worker — breaks inside the itch.io iframe.
  'stats.html',       // Admin-only page; the stats API doesn't ship offline.
  'og-image.svg',     // Obsolete (replaced by preview.jpg on production).
  'README.md',
  // Heavy image trees — itch.io caps ZIPs at 1000 files and the union of
  // these folders is ~14k files. The offline build fetches them on demand
  // from the production CDN (IMAGE_BASE_URL=https://www.tibia-dungeons.com).
  // The tiny `data/images/game/` and `data/images/outfit_frames/` +
  // `data/images/other/` folders stay local so character select, FX, and
  // death screens render instantly without a network round-trip.
  'data/images/item',
  'data/images/creature',
  'data/images/npc',
  'data/images/outfit',
  'data/images/mount',
  'data/images/spell',
  'data/images/imbuement',
  'data/images/charm',
]);

async function copyTree(src, dst, rel = '') {
  const entries = await fsp.readdir(src, { withFileTypes: true });
  await fsp.mkdir(dst, { recursive: true });
  for (const entry of entries) {
    const relPath = rel ? path.posix.join(rel, entry.name) : entry.name;
    if (EXCLUDE.has(relPath)) continue;
    // Skip the bundle output dir — we'll regenerate it into staging.
    if (relPath === 'dist') continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyTree(s, d, relPath);
    else await fsp.copyFile(s, d);
  }
}

async function patchIndexHtml() {
  const file = path.join(STAGED_GAME, 'index.html');
  let html = await fsp.readFile(file, 'utf8');

  // Drop the <link rel="manifest"> line — a PWA manifest inside an iframe is
  // invalid and itch.io would try to proxy it unnecessarily. The file itself
  // still ships but nothing links to it.
  html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');

  // Replace the production og:image/twitter:image URLs with local paths so
  // the page stays coherent if someone inspects the source on itch.io. (The
  // service worker registration already lives inside loading-screen.js and
  // is tree-shaken by OFFLINE_BUILD, so nothing to patch here.)
  html = html.replace(
    /https:\/\/www\.tibia-dungeons\.com\/data\/images\/game\/preview\.jpg/g,
    './data/images/game/preview.jpg'
  );

  await fsp.writeFile(file, html, 'utf8');
}

async function bundleOffline() {
  await esbuild.build({
    entryPoints: [
      path.join(STAGED_GAME, 'js/main.js'),
      path.join(STAGED_GAME, 'js/loading-screen.js'),
    ],
    bundle: true,
    minify: true,
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    format: 'esm',
    outdir: path.join(STAGED_GAME, 'dist'),
    outExtension: { '.js': '.min.js' },
    target: 'es2020',
    legalComments: 'none',
    logLevel: 'info',
    drop: ['debugger'],
    define: {
      OFFLINE_BUILD:   'true',
      ONLINE_SITE_URL: JSON.stringify('https://www.tibia-dungeons.com'),
      // Point image URLs at the production CDN so the itch.io ZIP doesn't
      // need to carry the 14k-file image tree (itch caps ZIPs at 1000 files).
      IMAGE_BASE_URL:  JSON.stringify('https://www.tibia-dungeons.com'),
    },
  });
  // Remove the source after bundling — only the minified bundle ships.
  await fsp.rm(path.join(STAGED_GAME, 'js'), { recursive: true, force: true });
}

// ── Minimal pure-Node ZIP writer ───────────────────────────────────────
// PowerShell's Compress-Archive writes backslashes in ZIP entry paths on
// Windows, which violates the ZIP spec and breaks itch.io (it 403s on
// requests because files are stored as `dist\main.min.js` but browsers
// ask for `dist/main.min.js`). This writer always uses forward slashes.
//
// Layout per file: Local File Header → file data
// Followed by:     Central Directory  → EOCD record
// DEFLATE-compressed when it shrinks the payload; STORE otherwise.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// DOS timestamp for the current instant. Precision = 2 seconds — fine for a build.
function dosTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() >> 1) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

async function collectFiles(dir, base = dir, out = []) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(full, base, out);
    else out.push({
      full,
      rel: path.relative(base, full).split(path.sep).join('/'),
    });
  }
  return out;
}

async function writeZipSpecCompliant(srcDir, outFile) {
  const files = await collectFiles(srcDir);
  files.sort((a, b) => a.rel.localeCompare(b.rel));

  const { time, date } = dosTime();
  const chunks = [];
  const centralEntries = [];
  let offset = 0;

  for (const f of files) {
    const data = await fsp.readFile(f.full);
    const crc = crc32(data);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const nameBuf = Buffer.from(f.rel, 'utf8');

    // Local File Header
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);      // signature
    lfh.writeUInt16LE(20, 4);              // version needed
    lfh.writeUInt16LE(0x0800, 6);          // flags — bit 11 = UTF-8 names
    lfh.writeUInt16LE(method, 8);
    lfh.writeUInt16LE(time, 10);
    lfh.writeUInt16LE(date, 12);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(payload.length, 18); // compressed size
    lfh.writeUInt32LE(data.length, 22);    // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);              // extra field length

    chunks.push(lfh, nameBuf, payload);

    // Central Directory Entry (written at the end)
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);      // signature
    cdh.writeUInt16LE(0x033f, 4);          // version made by (UNIX + 3.F)
    cdh.writeUInt16LE(20, 6);              // version needed
    cdh.writeUInt16LE(0x0800, 8);          // flags
    cdh.writeUInt16LE(method, 10);
    cdh.writeUInt16LE(time, 12);
    cdh.writeUInt16LE(date, 14);
    cdh.writeUInt32LE(crc, 16);
    cdh.writeUInt32LE(payload.length, 20);
    cdh.writeUInt32LE(data.length, 24);
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);              // extra field length
    cdh.writeUInt16LE(0, 32);              // comment length
    cdh.writeUInt16LE(0, 34);              // disk number
    cdh.writeUInt16LE(0, 36);              // internal attrs
    cdh.writeUInt32LE(0, 38);              // external attrs
    cdh.writeUInt32LE(offset, 42);         // local header offset
    centralEntries.push({ cdh, nameBuf });

    offset += lfh.length + nameBuf.length + payload.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const { cdh, nameBuf } of centralEntries) {
    chunks.push(cdh, nameBuf);
    cdSize += cdh.length + nameBuf.length;
  }

  // End of Central Directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                // disk number
  eocd.writeUInt16LE(0, 6);                // disk with CD
  eocd.writeUInt16LE(files.length, 8);     // entries on this disk
  eocd.writeUInt16LE(files.length, 10);    // total entries
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  eocd.writeUInt16LE(0, 20);               // comment length
  chunks.push(eocd);

  await fsp.writeFile(outFile, Buffer.concat(chunks));
}

async function zipStaging() {
  await fsp.rm(ZIP_OUT, { force: true });
  await writeZipSpecCompliant(STAGED_GAME, ZIP_OUT);
}

async function sha256(file) {
  const buf = await fsp.readFile(file);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

(async () => {
  console.log('── Tibia Dungeons — itch.io / standalone build ──');

  await fsp.rm(STAGING_DIR, { recursive: true, force: true });
  await fsp.mkdir(STAGED_GAME, { recursive: true });

  console.log('• copying game/ → staging/ (excluding sw.js, stats.html, og-image.svg)');
  await copyTree(GAME_DIR, STAGED_GAME);

  console.log('• bundling with OFFLINE_BUILD=true');
  await bundleOffline();

  console.log('• patching index.html (drop SW + manifest link, localize preview URL)');
  await patchIndexHtml();

  console.log('• zipping → dist/tibia-dungeons.zip');
  await zipStaging();

  const stat = await fsp.stat(ZIP_OUT);
  const hash = await sha256(ZIP_OUT);
  console.log('');
  console.log(`✓ ${path.relative(ROOT, ZIP_OUT)}`);
  console.log(`  size:   ${fmtBytes(stat.size)}`);
  console.log(`  sha256: ${hash}`);
  console.log('');
  console.log('Upload that ZIP on itch.io as the game file. In "Kind of project"');
  console.log('pick HTML, then check "This file will be played in the browser".');
})().catch((err) => {
  console.error('itch build failed:', err);
  process.exit(1);
});
