#!/usr/bin/env node
/**
 * Production playtest bot. Registers a fresh random account on
 * https://www.tibia-dungeons.com/, picks a random class + gender, and
 * plays until the character dies. Everything observed (starting stats,
 * combat log samples, shop prices, death cause, final stats) is dumped
 * to dist/playtest-run.log.
 *
 *   node scripts/playtest.js
 *
 * Credentials are saved to dist/playtest-creds.json so you can log back in.
 */

const path = require('path');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const ROOT  = path.resolve(__dirname, '..');
const DIST  = path.join(ROOT, 'dist');
const URL   = 'https://www.tibia-dungeons.com/';
const MAX_MINUTES = 25;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// Pool of short fantasy / adventurer names that fit inside the 12-char
// cap with a 2-3 digit suffix. These read like real players, not bots.
const NAME_POOL = [
  'Kael', 'Thorin', 'Lyra', 'Aiden', 'Ragnar', 'Elara', 'Finn', 'Mira',
  'Dante', 'Orin', 'Zara', 'Vale', 'Sera', 'Bran', 'Nyra', 'Drex',
  'Lila', 'Rylan', 'Soren', 'Mael', 'Kira', 'Ivar', 'Corvin', 'Sable',
  'Aeron', 'Juno', 'Talon', 'Rhea', 'Cass', 'Voss', 'Ember', 'Rune',
];
// Opt-in reuse: set TD_LOGIN_USER + TD_LOGIN_PASS to log into an existing
// account instead of hitting the register rate-limit. Useful when iterating.
const LOGIN_USER = process.env.TD_LOGIN_USER || '';
const LOGIN_PASS = process.env.TD_LOGIN_PASS || '';
const username = LOGIN_USER || (() => {
  const baseName = pick(NAME_POOL);
  const suffix   = String(Math.floor(Math.random() * 900) + 10);
  return (baseName + suffix).slice(0, 12);
})();
const password = LOGIN_PASS || crypto.randomBytes(6).toString('hex');
const selectedClass  = process.env.TD_CLASS
  ? 'class' + process.env.TD_CLASS[0].toUpperCase() + process.env.TD_CLASS.slice(1).toLowerCase()
  : pick(['classKnight', 'classPaladin', 'classSorcerer', 'classDruid']);
const selectedGender = pick(['choiceMale', 'choiceFemale']);

const observations = {
  meta: { startedAt: new Date().toISOString(), url: URL },
  credentials: { username, password, note: 'Generated for playtest — real production account' },
  character: { class: selectedClass.replace('class', ''), gender: selectedGender.replace('choice', '') },
  starting: {},
  sampledStates: [],
  combatLog: new Set(),
  floors: new Map(),
  death: null,
  finalStats: null,
  uniqueCreatures: new Set(),
  actionsTaken: 0,
  potionsUsed: 0,
  spellsCast: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
};

// --- helper: read current state out of the DOM ---------------------------
async function readState(page) {
  return page.evaluate(() => {
    const txt = (id) => document.getElementById(id)?.textContent?.trim() || null;
    const creatureStrip = document.getElementById('sbCreatures');
    return {
      ts: Date.now(),
      name:   txt('sbCharName'),
      level:  Number(txt('sbLevel')) || 0,
      floor:  Number(txt('sbFloor')) || 0,
      hp:     txt('sbHpText'),
      mp:     txt('sbMpText'),
      ml:     Number(txt('sbML')) || 0,
      xp:     txt('gameXpBarText'),
      cap:    txt('sbCap'),
      creatures: creatureStrip?.innerText || '',
      deathVisible: !!document.getElementById('deathSummaryOverlay'),
      logLines: Array.from(document.querySelectorAll('.game-log-row'))
        .map((el) => el.textContent.trim())
        .filter(Boolean),
    };
  });
}

// Pull the death summary fields out of the death overlay.
async function readDeathSummary(page) {
  return page.evaluate(() => {
    const overlay = document.getElementById('deathSummaryOverlay');
    if (!overlay) return null;
    const rows = Array.from(overlay.querySelectorAll('.stat-row'));
    const stats = {};
    for (const row of rows) {
      const label = row.querySelector('.stat-label')?.textContent?.trim();
      const value = row.querySelector('.stat-value')?.textContent?.trim();
      if (label) stats[label] = value;
    }
    stats._subtitle = overlay.querySelector('.death-subtitle')?.textContent?.trim();
    return stats;
  });
}

function parseHp(s) {
  // "120/150" → { cur:120, max:150 }
  if (!s) return null;
  const m = /(\d+)\s*\/\s*(\d+)/.exec(s);
  return m ? { cur: Number(m[1]), max: Number(m[2]) } : null;
}

// --- periodic log persistence: if Chrome crashes / window is closed we
//     still end up with whatever we'd managed to observe so far.
async function persistLog() {
  // Shallow-clone meta so we don't mutate observations.meta._startMs when we
  // strip it from the serialized copy.
  const log = {
    ...observations,
    meta: { ...observations.meta },
    combatLog: Array.from(observations.combatLog).slice(-80),
    uniqueCreatures: Array.from(observations.uniqueCreatures),
    floors: Object.fromEntries(observations.floors),
  };
  delete log.meta._startMs;
  await fsp.writeFile(path.join(DIST, 'playtest-run.log'), JSON.stringify(log, null, 2));
}

// --- bot decision loop ---------------------------------------------------
async function playUntilDeath(page) {
  const deadline = Date.now() + MAX_MINUTES * 60 * 1000;
  const dirs = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  let step = 0;
  let lastDir = 'ArrowRight';
  let stateSampledAt = 0;
  let lastPersistAt = 0;

  while (Date.now() < deadline) {
    let state;
    try {
      state = await readState(page);
    } catch (err) {
      // Page/context closed mid-run (Chrome crash or user closed window).
      console.log('[bot] page closed unexpectedly:', err.message);
      observations.death = { cause: 'browser-closed', error: err.message };
      return;
    }
    if (state.deathVisible) {
      console.log('[bot] death overlay detected');
      try { observations.death = await readDeathSummary(page); }
      catch { observations.death = { cause: 'death-read-failed' }; }
      return;
    }

    // Snapshot state every ~5s for the run log
    if (Date.now() - stateSampledAt > 5000) {
      observations.sampledStates.push({
        t: Math.round((Date.now() - observations.meta._startMs) / 1000),
        level: state.level, floor: state.floor,
        hp: state.hp, mp: state.mp, ml: state.ml, xp: state.xp,
        cap: state.cap, creatures: state.creatures.slice(0, 120),
      });
      stateSampledAt = Date.now();
      if (state.floor) {
        const prev = observations.floors.get(state.floor);
        if (!prev) observations.floors.set(state.floor, { reachedAtMs: Date.now() - observations.meta._startMs, atLevel: state.level });
      }
      // Harvest combat log lines
      for (const l of state.logLines) observations.combatLog.add(l);
      // Capture unique creature names from the strip ("Rat, Cave Rat, ...")
      for (const c of state.creatures.split(/[,·]/).map(s => s.trim()).filter(Boolean)) {
        observations.uniqueCreatures.add(c);
      }
    }

    // HP management — drink a potion (F) when under 40%.
    const hp = parseHp(state.hp);
    if (hp && hp.max > 0 && hp.cur / hp.max < 0.40) {
      await page.keyboard.press('KeyF');
      observations.potionsUsed += 1;
      await sleep(80);
    }

    // Engine combat rule (game.engine.js:9041-9059):
    //   pressing a direction → target tile = pos + dir →
    //     if creature there: performPlayerAttack()
    //     elif walkable: move one tile
    //     else (wall): nothing
    // So a single-heading hold only attacks creatures directly in that
    // direction. Rats that pile in from other sides get ignored. Pivot
    // rapidly through all four headings so anything adjacent from any
    // angle eats a swing per rotation.
    for (let i = 0; i < 4; i++) {
      const dir = dirs[(step + i) % dirs.length];
      await page.keyboard.down(dir);
      // 1.8s per heading: the engine's 190ms action throttle gives ~9
      // attempts per direction, which empirically clears the most rats
      // before the swarm catches up (best observed: 4/10 kills).
      await sleep(1800);
      await page.keyboard.up(dir);
      // Check state between pivots so we can potion / detect death fast.
      const mid = await readState(page).catch(() => null);
      if (!mid) return;
      if (mid.deathVisible) {
        observations.death = await readDeathSummary(page).catch(() => ({ cause: 'mid-pivot' }));
        return;
      }
      const midHp = parseHp(mid.hp);
      if (midHp && midHp.max > 0 && midHp.cur / midHp.max < 0.45) {
        for (const k of ['KeyF', 'KeyG', 'KeyH']) await page.keyboard.press(k);
        observations.potionsUsed += 3;
      }
    }

    // On HP pressure, cycle every consumable slot in case one of F/G/H has
    // something stocked (bag starters may include a health item).
    if (hp && hp.cur / hp.max < 0.6) {
      for (const k of ['KeyF', 'KeyG', 'KeyH']) {
        await page.keyboard.press(k);
        await sleep(80);
      }
    }

    // Spray the whole hotbar occasionally — cheap, any learned spell fires.
    if (step % 3 === 0) {
      for (const slot of [1, 2, 3, 4, 5]) {
        await page.keyboard.press(`Digit${slot}`);
        observations.spellsCast[slot] = (observations.spellsCast[slot] || 0) + 1;
      }
      await sleep(120);
    }

    observations.actionsTaken += 1;
    step += 1;

    // Flush the run log to disk every ~30s so a browser crash doesn't lose
    // everything. Cheap (the log file is <20 KB in practice).
    if (Date.now() - lastPersistAt > 30_000) {
      try { await persistLog(); } catch { /* ignore — last snapshot is fine */ }
      lastPersistAt = Date.now();
    }
  }
  console.log('[bot] max time reached without death');
}

async function snapshotStartingKit(page) {
  return page.evaluate(() => {
    const slots = {};
    const slotIds = ['slotAmulet','slotHelmet','slotBag','slotHand','slotArmor','slotShield','slotRing','slotLegs','slotAmmo','slotBoots','slotLight'];
    for (const id of slotIds) {
      const label = document.getElementById(id + 'Label')?.textContent?.trim();
      slots[id] = label || null;
    }
    const hp = document.getElementById('sbHpText')?.textContent?.trim();
    const mp = document.getElementById('sbMpText')?.textContent?.trim();
    const fist = document.getElementById('sbFist')?.textContent?.trim();
    const shield = document.getElementById('sbShield')?.textContent?.trim();
    const cap = document.getElementById('sbCap')?.textContent?.trim();
    return { hp, mp, fist, shield, cap, equipment: slots };
  });
}

(async () => {
  await fsp.mkdir(DIST, { recursive: true });
  await fsp.writeFile(path.join(DIST, 'playtest-creds.json'),
    JSON.stringify(observations.credentials, null, 2));

  console.log(`[bot] target: ${URL}`);
  console.log(`[bot] username: ${username}  (password saved to dist/playtest-creds.json)`);
  console.log(`[bot] class: ${observations.character.class}  gender: ${observations.character.gender}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Persist cookies so /api/auth/me is happy.
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error') console.log(`[page error] ${msg.text()}`);
  });

  observations.meta._startMs = Date.now();

  // --- REGISTER / LOGIN / GUEST -------------------------------------------
  //   TD_MODE=guest  →  skip auth via "Play as guest"
  //   TD_LOGIN_USER + TD_LOGIN_PASS  →  log into existing account
  //   otherwise  →  register a fresh random account
  const mode = process.env.TD_MODE === 'guest' ? 'guest'
    : LOGIN_USER ? 'login'
    : 'register';
  console.log(`[bot] opening site — auth mode: ${mode}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#authOverlay', { state: 'visible', timeout: 45_000 });
  if (mode === 'guest') {
    await page.click('#authGuestBtn');
  } else if (mode === 'register') {
    await page.click('#authTabRegister');
    await sleep(300);
    await page.fill('#authName', username);
    await page.fill('#authPassword', password);
    await page.fill('#authRepeat', password);
    await page.click('#authSubmit');
  } else {
    await page.fill('#authName', username);
    await page.fill('#authPassword', password);
    await page.click('#authSubmit');
  }

  // --- CHARACTER SELECT ---------------------------------------------------
  await page.waitForSelector('#startOverlay', { state: 'visible', timeout: 20_000 });
  console.log(`[bot] picking ${observations.character.class} / ${observations.character.gender}`);
  if (mode === 'guest') {
    // Guest mode leaves the name input empty + editable.
    await page.fill('#playerName', username);
    await sleep(150);
  }
  await page.click('#' + selectedClass);
  await sleep(200);
  await page.click('#' + selectedGender);
  await sleep(200);
  await page.click('#startBtn');

  // --- WAIT FOR GAME TO FULLY LOAD ---------------------------------------
  await page.waitForSelector('#phaser canvas', { state: 'attached', timeout: 30_000 });
  await page.waitForSelector('#startOverlay', { state: 'hidden', timeout: 15_000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('loadingOverlay');
    if (!el) return true;
    const cs = getComputedStyle(el);
    return cs.display === 'none' || parseFloat(cs.opacity) === 0;
  }, null, { timeout: 60_000, polling: 300 });
  await sleep(1500);

  observations.starting = await snapshotStartingKit(page);
  console.log('[bot] starting kit snapshotted — entering play loop');

  // --- PLAY UNTIL DEATH OR TIMEOUT ---------------------------------------
  await playUntilDeath(page);

  // One final state read for the end-of-run summary
  observations.finalStats = await readState(page);
  observations.meta.endedAt = new Date().toISOString();
  observations.meta.durationSec = Math.round((Date.now() - observations.meta._startMs) / 1000);

  await context.close();
  await browser.close();

  // --- WRITE THE RUN LOG -------------------------------------------------
  const log = {
    ...observations,
    meta: { ...observations.meta },
    combatLog: Array.from(observations.combatLog).slice(-80),
    uniqueCreatures: Array.from(observations.uniqueCreatures),
    floors: Object.fromEntries(observations.floors),
  };
  delete log.meta._startMs;
  const out = path.join(DIST, 'playtest-run.log');
  await fsp.writeFile(out, JSON.stringify(log, null, 2));
  console.log(`[bot] run log: ${path.relative(ROOT, out)}`);
  console.log(`[bot] duration: ${log.meta.durationSec}s  actions: ${log.actionsTaken}  potions: ${log.potionsUsed}`);
  if (log.death) {
    console.log(`[bot] died → floor ${log.death['Floor reached']} · kills ${log.death['Creatures killed']} · killedBy ${log.death['Killed by']}`);
  } else {
    console.log('[bot] ran out of time — still alive');
  }
})().catch((err) => { console.error('playtest failed:', err); process.exit(1); });
