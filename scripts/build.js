#!/usr/bin/env node
/**
 * Bundle + minify the game's client JS with esbuild.
 *
 *   node scripts/build.js             # dev build (unminified, inline sourcemaps)
 *   node scripts/build.js --prod      # prod build (minified, mangled, no maps,
 *                                       deletes game/js/ source after bundling)
 *   node scripts/build.js --prod --offline
 *                                     # offline build for itch.io / standalone
 *                                       (OFFLINE_BUILD=true → localStorage stubs
 *                                       replace /api/* calls; tree-shake drops
 *                                       the online branch)
 *   node scripts/build.js --watch     # dev build + watch game/js/ for changes
 *
 * Entry points:
 *   game/js/main.js            → game/dist/main.min.js
 *   game/js/loading-screen.js  → game/dist/loading-screen.min.js
 *
 * Phaser is loaded from the CDN via a <script> tag before the module
 * runs, so we leave it as a plain global (no import) — esbuild has
 * nothing to bundle for it.
 */

const path = require('path');
const { rm } = require('node:fs/promises');
const esbuild = require('esbuild');

const ROOT    = path.resolve(__dirname, '..');
const JS_DIR  = path.join(ROOT, 'game/js');
const OUT_DIR = path.join(ROOT, 'game/dist');

const prod    = process.argv.includes('--prod') || !!process.env.VERCEL;
const watch   = process.argv.includes('--watch');
const offline = process.argv.includes('--offline') || process.env.OFFLINE_BUILD === '1';

const opts = {
  entryPoints: [
    path.join(JS_DIR, 'main.js'),
    path.join(JS_DIR, 'loading-screen.js'),
  ],
  bundle: true,
  minify: prod,
  minifyIdentifiers: prod,
  minifySyntax: prod,
  minifyWhitespace: prod,
  format: 'esm',
  outdir: OUT_DIR,
  outExtension: { '.js': '.min.js' },
  target: 'es2020',
  legalComments: 'none',
  sourcemap: prod ? false : 'inline',
  logLevel: 'info',
  // Build-time constants. `OFFLINE_BUILD` toggles the itch.io / standalone
  // flavor (localStorage-backed API stubs, no login screen). esbuild replaces
  // the identifier in source, and minification dead-code-eliminates the
  // unused branch so online and offline bundles stay lean.
  define: {
    OFFLINE_BUILD:    String(offline),
    ONLINE_SITE_URL:  JSON.stringify('https://www.tibia-dungeons.com'),
    // Prefix for /data/images/* URLs. Empty for online builds (served from the
    // same origin); the Vercel domain for the offline build, so the itch.io
    // ZIP can omit the 14k-file image tree and fetch images on demand.
    IMAGE_BASE_URL:   JSON.stringify(offline ? 'https://www.tibia-dungeons.com' : ''),
  },
  // Prod builds keep no identifying strings that make reverse-engineering
  // trivial. dev builds keep everything for stack traces.
  drop: prod ? ['debugger'] : [],
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(opts);
    await ctx.rebuild();
    await ctx.watch();
    console.log('✓ esbuild watching game/js/ → game/dist/ (dev, unminified)');
    return;
  }

  await esbuild.build(opts);
  const label = prod ? 'prod (minified, mangled)' : 'dev (readable, sourcemaps)';
  const flavor = offline ? ' [OFFLINE — itch.io / standalone]' : '';
  console.log(`✓ bundled → game/dist/ [${label}]${flavor}`);

  if (prod) {
    // Don't ship the original sources to Vercel — only the bundle and the
    // handful of non-JS assets under game/ are served.
    await rm(JS_DIR, { recursive: true, force: true });
    console.log('✓ removed game/js/ (prod output: only dist/ ships)');
  }
})().catch((err) => { console.error(err); process.exit(1); });
