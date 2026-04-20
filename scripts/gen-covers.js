#!/usr/bin/env node
/**
 * Generate CrazyGames cover images (and any other store that asks for the
 * 16:9 / 2:3 / 1:1 trio) from the existing 1024×1024 key art.
 *
 *   node scripts/gen-covers.js
 *
 * Output (written next to the source key art):
 *   data/images/game/cover-landscape-1920x1080.jpg   (16:9, from explore.jpg)
 *   data/images/game/cover-portrait-800x1200.jpg    (2:3,  from explore.jpg)
 *   data/images/game/cover-square-800x800.jpg        (1:1,  from sword.jpg)
 *
 * Dependency: `sharp` (installed on demand — not in package.json).
 */

const path   = require('path');
const fsp    = require('node:fs/promises');
const sharp  = require('sharp');

const ROOT      = path.resolve(__dirname, '..');
const GAME_IMGS = path.join(ROOT, 'game/data/images/game');

const SRC_EXPLORE = path.join(GAME_IMGS, 'explore.jpg');
const SRC_SWORD   = path.join(GAME_IMGS, 'sword.jpg');

const OUT = {
  landscape: path.join(GAME_IMGS, 'cover-landscape-1920x1080.jpg'),
  portrait:  path.join(GAME_IMGS, 'cover-portrait-800x1200.jpg'),
  square:    path.join(GAME_IMGS, 'cover-square-800x800.jpg'),
};

// All three covers use sharp's `fit: cover` with the natural subject anchor
// so the frame is filled edge-to-edge without blurred borders. Source art
// (explore.jpg, sword.jpg) is 1024×1024 with the hero roughly centered — a
// center crop preserves the knight + torch on every aspect ratio.
const RESIZE_OPTS = {
  fit: 'cover',
  position: 'centre',
  kernel: 'lanczos3',
};

async function makeLandscape() {
  // Source 1024×1024 → target 1920×1080 (16:9).
  // Center-crop to 16:9 first, then upscale — Lanczos keeps stone textures
  // sharp enough for a store hero banner.
  await sharp(SRC_EXPLORE)
    .resize(1920, 1080, RESIZE_OPTS)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(OUT.landscape);
}

async function makePortrait() {
  // 2:3 vertical (800×1200). Source is square so the center crop loses some
  // floor + stone either side, but the subject (knight + treasure) survives.
  await sharp(SRC_EXPLORE)
    .resize(800, 1200, RESIZE_OPTS)
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(OUT.portrait);
}

async function makeSquare() {
  // Sword.jpg already has the most cinematic shot (glowing blue enchanted
  // sword + treasure chest + knight) — prefer it for the icon-sized cover.
  await sharp(SRC_SWORD)
    .resize(800, 800, { fit: 'cover' })
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(OUT.square);
}

(async () => {
  console.log('── generating store covers ──');
  await makeLandscape();
  console.log('✓', path.relative(ROOT, OUT.landscape));
  await makePortrait();
  console.log('✓', path.relative(ROOT, OUT.portrait));
  await makeSquare();
  console.log('✓', path.relative(ROOT, OUT.square));
  for (const p of Object.values(OUT)) {
    const s = await fsp.stat(p);
    console.log('  ', path.basename(p).padEnd(36), `${(s.size / 1024).toFixed(0)} KB`);
  }
})().catch((err) => { console.error(err); process.exit(1); });
