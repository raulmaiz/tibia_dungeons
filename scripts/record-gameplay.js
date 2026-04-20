#!/usr/bin/env node
/**
 * Record a scripted 19-second gameplay clip for store submissions
 * (CrazyGames, Poki, etc.).
 *
 *   node scripts/record-gameplay.js
 *
 * Output:
 *   dist/gameplay-19s.mp4   (1920×1080, H.264, ~19s, silent)
 *
 * Requires an offline dev server on :5173 (so the auth screen is skipped
 * and the bot lands straight on character select):
 *
 *   OFFLINE_BUILD=1 npm run dev
 *
 * Dependencies (installed on demand, not in package.json):
 *   - playwright         (headless Chromium driver + video recording)
 *   - ffmpeg-static      (bundled ffmpeg binary for WebM → MP4 transcode)
 */

const path = require('path');
const fsp  = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const ffmpegPath = require('ffmpeg-static');

const ROOT       = path.resolve(__dirname, '..');
const DIST       = path.join(ROOT, 'dist');
const REC_DIR    = path.join(DIST, 'gameplay-raw');
const OUT_MP4    = path.join(DIST, 'gameplay-19s.mp4');
const URL        = process.env.GAME_URL || 'https://www.tibia-dungeons.com/';
const FINAL_SEC  = 19;
const PLAY_SEC   = 24;   // record a bit more than FINAL_SEC as a safety buffer

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function record() {
  await fsp.rm(REC_DIR, { recursive: true, force: true });
  await fsp.mkdir(REC_DIR, { recursive: true });

  console.log('[playwright] launching system Chrome (full GPU, real graphics stack)');
  // Bundled Chromium — even headed — stalls Phaser's preload at 45% because
  // the WebGL pipeline behind Playwright's automation context misbehaves with
  // Phaser's texture atlas warmup. Using the user's system Chrome install
  // (channel:'chrome') gives Phaser the regular production graphics stack.
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--disable-features=AutomationControlled'],
  });
  // tCtx0 = wall clock right before the recording stream starts. Every
  // subsequent milestone is measured against it so ffmpeg can cut the
  // final clip exactly at "gameplay begins" instead of a guessed offset.
  const tCtx0 = Date.now();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: REC_DIR, size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warning') console.log(`[console ${t}]`, msg.text());
  });
  page.on('requestfailed', (req) => {
    console.log('[net fail]', req.url(), '-', req.failure()?.errorText);
  });
  page.on('response', (res) => {
    const s = res.status();
    if (s >= 400) console.log(`[http ${s}]`, res.url());
  });

  console.log(`[playwright] opening ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });

  // 1) Production shows the auth overlay (login / register / guest).
  //    Click "Play as guest" to reach character select without credentials.
  //    If we're on the offline build, authOverlay never appears and we skip
  //    straight to startOverlay.
  console.log('[bot] waiting for auth or character select');
  const landed = await Promise.race([
    page.waitForSelector('#authOverlay',  { state: 'visible', timeout: 45_000 }).then(() => 'auth'),
    page.waitForSelector('#startOverlay', { state: 'visible', timeout: 45_000 }).then(() => 'start'),
  ]);
  if (landed === 'auth') {
    console.log('[bot] auth overlay visible — clicking "Play as guest"');
    await sleep(400);
    await page.click('#authGuestBtn');
    await page.waitForSelector('#startOverlay', { state: 'visible', timeout: 15_000 });
  }
  await page.waitForSelector('#loadingOverlay', { state: 'hidden', timeout: 5_000 }).catch(() => {});
  await page.waitForSelector('#classPaladin', { state: 'visible' });
  await sleep(600);

  // 2) Pick Paladin (ranged, spell FX visible from distance) + Male.
  //    Guest mode leaves #playerName empty and editable; type a name so
  //    production's startBtn guard accepts the submission.
  console.log('[bot] selecting class: Paladin');
  await page.fill('#playerName', 'TibiaHero');
  await sleep(200);
  await page.click('#classPaladin');
  await sleep(250);
  await page.click('#choiceMale');
  await sleep(400);

  // 3) Start the run.
  console.log('[bot] entering dungeon');
  await page.click('#startBtn');

  // 4) bootGame() re-shows #loadingOverlay while it loads creature textures
  //    via Phaser. The canvas is attached early but the game isn't visible
  //    until that second loading pass completes. We wait for:
  //      - the Phaser canvas to exist
  //      - #startOverlay to be gone (character select dismissed)
  //      - #loadingOverlay to drop back to display:none (in-game preload
  //        fades it out when the engine's ready-state fires)
  //    Then a short settle window for the first tiles and atmosphere fade-in.
  await page.waitForSelector('#phaser canvas', { state: 'attached', timeout: 30_000 });
  await page.waitForSelector('#startOverlay', { state: 'hidden', timeout: 15_000 });
  try {
    await page.waitForFunction(() => {
      const el = document.getElementById('loadingOverlay');
      if (!el) return true;
      const cs = getComputedStyle(el);
      return cs.display === 'none' || parseFloat(cs.opacity) === 0;
    }, null, { timeout: 25_000, polling: 200 });
  } catch {
    // If the in-game preload stalls (some texture 404ing quietly), force
    // progress by dismissing the overlay so we at least record whatever the
    // engine has rendered so far — better than a clip of the loading bar.
    const pct = await page.evaluate(() => document.getElementById('loadingPct')?.textContent);
    console.log(`[bot] loading overlay timed out at ${pct} — forcing dismiss`);
    await page.evaluate(() => {
      const el = document.getElementById('loadingOverlay');
      if (el) el.style.display = 'none';
    });
  }
  await sleep(1200);  // let the map + atmosphere finish fading in

  const gameplayStartSec = (Date.now() - tCtx0) / 1000;
  console.log(`[bot] gameplay begins at t=${gameplayStartSec.toFixed(2)}s of the recording`);

  // 5) Scripted play loop.
  console.log(`[bot] scripted play for ${PLAY_SEC}s`);
  const deadline = Date.now() + PLAY_SEC * 1000;
  const dirs   = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  const spells = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];
  let step = 0;
  while (Date.now() < deadline) {
    const dir = dirs[step % dirs.length];
    await page.keyboard.down(dir);
    await sleep(800 + Math.floor(Math.random() * 500));
    await page.keyboard.up(dir);

    await page.keyboard.press(spells[step % spells.length]);
    await sleep(200);

    if (step % 4 === 3) {
      await page.keyboard.press('KeyF');
      await sleep(120);
    }
    if (step % 5 === 2) {
      const perp = dirs[(step + 1) % dirs.length];
      await page.keyboard.down(perp);
      await sleep(320);
      await page.keyboard.up(perp);
    }
    step++;
  }

  console.log('[playwright] stopping recording');
  await context.close();
  await browser.close();

  const files = (await fsp.readdir(REC_DIR)).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error('no .webm produced');
  const webm = path.join(REC_DIR, files[0]);
  const stats = await fsp.stat(webm);
  console.log(`[playwright] raw webm: ${files[0]} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  return { webm, gameplayStartSec };
}

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    p.on('error', reject);
  });
}

async function transcode(webm, trimStart) {
  await fsp.rm(OUT_MP4, { force: true });
  const start = Math.max(0, trimStart).toFixed(2);
  console.log(`[ffmpeg] trimming from t=${start}s for ${FINAL_SEC}s, re-encoding H.264`);
  await ffmpeg([
    '-y',
    '-ss', start,
    '-i', webm,
    '-t', String(FINAL_SEC),
    '-vf', 'scale=1920:1080:flags=lanczos',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-an',                 // no audio — Playwright doesn't capture it
    OUT_MP4,
  ]);
  const stats = await fsp.stat(OUT_MP4);
  console.log(`[ffmpeg] ${path.relative(ROOT, OUT_MP4)} — ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
}

(async () => {
  const { webm, gameplayStartSec } = await record();
  await transcode(webm, gameplayStartSec);
  console.log('done.');
})().catch((err) => {
  console.error('record failed:', err);
  process.exit(1);
});
