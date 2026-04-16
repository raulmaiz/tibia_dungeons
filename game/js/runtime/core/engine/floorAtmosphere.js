/**
 * Floor Atmosphere — visual layer applied on top of the tile grid.
 *
 * Adds per-tile palette variation, wall bevels/seams, scattered
 * decorations (theme-specific), ambient particles (drift/fall/rise/
 * erratic), a screen-space vignette/tint, the "pit" graphic that
 * replaces the old staircase indicator, and the "rope anchor"
 * drawn on the spawn tile to hint that the player can climb up here.
 *
 * Gameplay is untouched — this module only creates cosmetic objects.
 */

import { getFloorTheme } from '../../../data/floorThemes.js';

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function shadeColor(hex, delta) {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 0xff) + delta));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 0xff) + delta));
  const b = Math.max(0, Math.min(255, (hex & 0xff) + delta));
  return (r << 16) | (g << 8) | b;
}

export function createFloorAtmosphere(scene, opts) {
  const { tileSize, mapTiles, MAX_DUNGEON_W, MAX_DUNGEON_H } = opts;

  const decorLayer      = scene.add.graphics().setDepth(1);
  const wallAccentLayer = scene.add.graphics().setDepth(2);
  const particleLayer   = scene.add.container(0, 0).setDepth(3);
  const pitLayer        = scene.add.container(0, 0).setDepth(4);
  const ropeLayer       = scene.add.container(0, 0).setDepth(6);
  const ambientTint     = scene.add.graphics().setDepth(119).setScrollFactor(0);
  // Vignette is a RenderTexture (not a Graphics) so we can carve a halo hole
  // at the player's screen position whenever a light source is active. This
  // stops the corner-band gradient from darkening the halo when the camera
  // clamps at the edge of the dungeon.
  let vignetteRT    = null;
  let vignetteBrush = null;

  // One seed per scene lifetime — determines how floors 21+ are themed for
  // this run. A fresh scene (new run) re-rolls it, so each playthrough has
  // a unique sequence of random deep-floor archetypes.
  const runSeed = (Math.floor(Math.random() * 0xffffffff)) >>> 0;
  let theme = getFloorTheme(1, runSeed);
  let level = 1;
  let pitObjects = [];
  let pitTween = null;
  let ropeObjects = [];
  let ropeTweens = [];
  const particleSprites = [];

  // ── Darkness / light system ────────────────────────────────────────
  // Without any light source the player can only see their own tile and a
  // sliver of the neighbours — a real "grope in the dark" feel. Equipping a
  // torch / light item or casting an illumination spell dominates via
  // max(base, equipment, spell) in updateDarkness.
  const BASE_LIGHT_TILES  = 1;
  const DARKNESS_ALPHA    = 0.97;
  let darknessRT    = null;
  let lightBrushG   = null;
  let activeLightSpells = []; // { id, initialRadius, startTime, duration }
  // Equipment light (torch, wand, lamp...). Radius fades linearly to 0 over
  // `duration` ms if duration > 0; otherwise stays constant at `initialRadius`.
  let equipmentLightRadiusPx = 0;
  let equipmentLightDurationMs = 0;
  let equipmentLightStartTime = 0;
  // Transient lights — short-lived point lights anywhere in the world. Used by
  // creature-spell VFX to illuminate the projectile trajectory.
  let transientLights = []; // { x, y, radius, startTime, duration, peakAlpha }
  // Area lights — long-lived point lights at a fixed world position (fire
  // fields and similar). Keep their full radius for most of the duration and
  // fade out in the final stretch, same envelope as player-cast light spells.
  let activeAreaLights = []; // { id, x, y, radius, startTime, duration }
  let lastDarkUpdate = 0;
  let lastDarkPx = -9e9;
  let lastDarkPy = -9e9;
  let lastCamSx = -9e9;
  let lastCamSy = -9e9;

  function setThemeForLevel(newLevel) {
    level = Number(newLevel) || 1;
    theme = getFloorTheme(level, runSeed);
    rebuildVignette();
  }

  function getTileColor(gx, gy, isWall, rng) {
    const p = theme.palette;
    if (isWall) {
      const jitter = Math.floor((rng() - 0.5) * 18);
      return shadeColor(p.wall, jitter);
    }
    const base = ((gx + gy) & 1) === 0 ? p.floorBase : p.floorAlt;
    if (rng() < (theme.noise?.dampProb ?? 0)) return p.floorDamp;
    const jitter = Math.floor((rng() - 0.5) * 14);
    return shadeColor(base, jitter);
  }

  function applyTilePalette(currentMap, dungeonW, dungeonH) {
    const p = theme.palette;
    const rng = mulberry32(level * 9973 + 7);
    for (let y = 0; y < MAX_DUNGEON_H; y += 1) {
      for (let x = 0; x < MAX_DUNGEON_W; x += 1) {
        if (y >= dungeonH || x >= dungeonW) {
          mapTiles[y][x].setFillStyle(p.outer, 1);
        } else {
          const isWall = currentMap[y][x] === '#';
          mapTiles[y][x].setFillStyle(getTileColor(x, y, isWall, rng), 1);
        }
      }
    }
  }

  function hasFloorNeighbor(map, x, y, w, h) {
    if (y > 0 && map[y - 1][x] !== '#') return true;
    if (y < h - 1 && map[y + 1][x] !== '#') return true;
    if (x > 0 && map[y][x - 1] !== '#') return true;
    if (x < w - 1 && map[y][x + 1] !== '#') return true;
    return false;
  }

  function rebuildWallAccents(currentMap, dungeonW, dungeonH) {
    const p = theme.palette;
    const wa = theme.wallArt || { basePattern: 'bricks', motifDensity: 0, motifWeights: {} };
    wallAccentLayer.clear();
    const rng = mulberry32(level * 31337 + 77);

    // Pass 1 — base wall pattern + edge highlights/shadows + floor inner shadows.
    for (let y = 0; y < dungeonH; y += 1) {
      for (let x = 0; x < dungeonW; x += 1) {
        const isWall = currentMap[y][x] === '#';
        const cx = x * tileSize;
        const cy = y * tileSize;
        if (isWall) {
          if (hasFloorNeighbor(currentMap, x, y, dungeonW, dungeonH)) {
            drawWallBase(wa.basePattern, cx, cy, p, x, y, rng);
          }
          if (y > 0 && currentMap[y - 1][x] !== '#') {
            wallAccentLayer.fillStyle(p.wallEdge, 0.80);
            wallAccentLayer.fillRect(cx + 1, cy, tileSize - 2, 4);
          }
          if (y < dungeonH - 1 && currentMap[y + 1][x] !== '#') {
            wallAccentLayer.fillStyle(p.wallShadow, 0.9);
            wallAccentLayer.fillRect(cx + 1, cy + tileSize - 5, tileSize - 2, 4);
          }
        } else {
          if (y > 0 && currentMap[y - 1][x] === '#') {
            wallAccentLayer.fillStyle(p.wallShadow, 0.55);
            wallAccentLayer.fillRect(cx + 1, cy, tileSize - 2, 3);
          }
          if (y < dungeonH - 1 && currentMap[y + 1][x] === '#') {
            wallAccentLayer.fillStyle(p.wallShadow, 0.30);
            wallAccentLayer.fillRect(cx + 1, cy + tileSize - 4, tileSize - 2, 3);
          }
          if (x > 0 && currentMap[y][x - 1] === '#') {
            wallAccentLayer.fillStyle(p.wallShadow, 0.45);
            wallAccentLayer.fillRect(cx, cy + 1, 3, tileSize - 2);
          }
          if (x < dungeonW - 1 && currentMap[y][x + 1] === '#') {
            wallAccentLayer.fillStyle(p.wallShadow, 0.45);
            wallAccentLayer.fillRect(cx + tileSize - 4, cy + 1, 3, tileSize - 2);
          }
        }
      }
    }

    // Pass 2 — scatter motifs (torches, skulls, runes, veins, ...) on visible walls.
    if (wa.motifDensity > 0 && wa.motifWeights) {
      const entries = Object.entries(wa.motifWeights);
      const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
      const buckets = [];
      let acc = 0;
      for (const [n, w] of entries) { acc += w / total; buckets.push({ n, upto: acc }); }
      for (let y = 0; y < dungeonH; y += 1) {
        for (let x = 0; x < dungeonW; x += 1) {
          if (currentMap[y][x] !== '#') continue;
          if (!hasFloorNeighbor(currentMap, x, y, dungeonW, dungeonH)) continue;
          if (rng() > wa.motifDensity) continue;
          const r = rng();
          let kind = buckets[0] ? buckets[0].n : null;
          for (const b of buckets) { if (r <= b.upto) { kind = b.n; break; } }
          if (kind) drawWallMotif(kind, x * tileSize, y * tileSize, p, rng, x, y);
        }
      }
    }
  }

  // ── Wall base patterns (applied to every visible wall tile) ───────
  function drawWallBase(pattern, cx, cy, p, gx, gy, rng) {
    switch (pattern) {
      case 'bricks':    drawPattern_bricks(cx, cy, p, gx, gy); break;
      case 'rough':     drawPattern_rough(cx, cy, p, gx, gy, rng); break;
      case 'frost':     drawPattern_frost(cx, cy, p, gx, gy, rng); break;
      case 'flesh':     drawPattern_flesh(cx, cy, p, gx, gy, rng); break;
      case 'obsidian':  drawPattern_obsidian(cx, cy, p, gx, gy, rng); break;
      case 'gothic':    drawPattern_gothic(cx, cy, p, gx, gy); break;
      case 'metal':     drawPattern_metal(cx, cy, p, gx, gy, rng); break;
      case 'sandstone': drawPattern_sandstone(cx, cy, p, gx, gy, rng); break;
      case 'webbed':    drawPattern_webbed(cx, cy, p, gx, gy, rng); break;
      case 'fungal':    drawPattern_fungal(cx, cy, p, gx, gy, rng); break;
      default:          drawPattern_bricks(cx, cy, p, gx, gy);
    }
  }

  function drawPattern_bricks(cx, cy, p, gx, gy) {
    const g = wallAccentLayer;
    const half = tileSize / 2;
    // Horizontal mortar line at the middle of the tile
    g.fillStyle(p.wallShadow, 0.70);
    g.fillRect(cx + 1, cy + half - 1, tileSize - 2, 2);
    // Running-bond vertical mortars — upper row vs lower row offset by half
    if ((gy & 1) === 0) {
      g.fillRect(cx + half, cy + 1, 1.4, half - 2);
      g.fillRect(cx + tileSize / 4,     cy + half + 1, 1.4, half - 2);
      g.fillRect(cx + 3 * tileSize / 4, cy + half + 1, 1.4, half - 2);
    } else {
      g.fillRect(cx + tileSize / 4,     cy + 1, 1.4, half - 2);
      g.fillRect(cx + 3 * tileSize / 4, cy + 1, 1.4, half - 2);
      g.fillRect(cx + half, cy + half + 1, 1.4, half - 2);
    }
    // Top-edge highlight on each brick
    g.fillStyle(p.wallEdge, 0.35);
    g.fillRect(cx + 1, cy + 1, tileSize - 2, 1);
    g.fillRect(cx + 1, cy + half + 1, tileSize - 2, 1);
    // Subtle left-edge shadow on bricks
    g.fillStyle(p.wallShadow, 0.35);
    g.fillRect(cx + 1, cy + 2, 1, half - 3);
    g.fillRect(cx + 1, cy + half + 2, 1, half - 3);
  }

  function drawPattern_rough(cx, cy, p, gx, gy, rng) {
    const g = wallAccentLayer;
    // Organic rocky surface — dark hollows + lighter bumps
    g.fillStyle(p.wallShadow, 0.55);
    for (let i = 0; i < 6; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 1.5 + rng() * 2.5);
    }
    g.fillStyle(p.wallEdge, 0.30);
    for (let i = 0; i < 4; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 1 + rng() * 1.8);
    }
    // A few short gouges
    g.lineStyle(0.8, p.wallShadow, 0.65);
    for (let i = 0; i < 2; i += 1) {
      const x1 = cx + rng() * tileSize, y1 = cy + rng() * tileSize;
      const a = rng() * Math.PI * 2;
      g.beginPath(); g.moveTo(x1, y1);
      g.lineTo(x1 + Math.cos(a) * 5, y1 + Math.sin(a) * 5);
      g.strokePath();
    }
  }

  function drawPattern_frost(cx, cy, p, gx, gy, rng) {
    drawPattern_bricks(cx, cy, p, gx, gy);
    const g = wallAccentLayer;
    // White frost blooms clustered in corners
    g.fillStyle(0xbdd4e4, 0.38);
    for (let i = 0; i < 3; i += 1) {
      const corner = Math.floor(rng() * 4);
      const ccx = cx + (corner & 1) * tileSize;
      const ccy = cy + ((corner >> 1) & 1) * tileSize;
      g.fillCircle(ccx, ccy, 3 + rng() * 2.5);
      g.fillStyle(0xe8f0f8, 0.55);
      g.fillCircle(ccx, ccy, 1 + rng() * 1.2);
      g.fillStyle(0xbdd4e4, 0.38);
    }
    // Crystalline star
    const sx = cx + tileSize / 2 + (rng() - 0.5) * 10;
    const sy = cy + tileSize / 2 + (rng() - 0.5) * 10;
    g.lineStyle(1, 0xe8f4fc, 0.70);
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * Math.PI;
      g.beginPath();
      g.moveTo(sx - Math.cos(a) * 3, sy - Math.sin(a) * 3);
      g.lineTo(sx + Math.cos(a) * 3, sy + Math.sin(a) * 3);
      g.strokePath();
    }
  }

  function drawPattern_flesh(cx, cy, p, gx, gy, rng) {
    const g = wallAccentLayer;
    // Pink-red tinge wash
    g.fillStyle(0x4a1614, 0.20);
    g.fillRect(cx + 1, cy + 1, tileSize - 2, tileSize - 2);
    // Wavy primary vein
    g.lineStyle(1.4, 0x7a2028, 0.65);
    const segs = 8;
    const startY = cy + tileSize * (0.25 + rng() * 0.5);
    g.beginPath(); g.moveTo(cx, startY);
    for (let i = 1; i <= segs; i += 1) {
      const t = i / segs;
      g.lineTo(cx + tileSize * t, startY + Math.sin(t * Math.PI * 2 + rng() * Math.PI) * 3);
    }
    g.strokePath();
    // Secondary capillaries
    g.lineStyle(0.7, 0x551014, 0.55);
    for (let i = 0; i < 3; i += 1) {
      const bx = cx + rng() * tileSize;
      const by = cy + rng() * tileSize;
      g.beginPath(); g.moveTo(bx, by);
      g.lineTo(bx + (rng() - 0.5) * 8, by + (rng() - 0.5) * 8);
      g.strokePath();
    }
    // Wet highlights
    g.fillStyle(0x8a2828, 0.45);
    for (let i = 0; i < 3; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 0.9 + rng());
    }
  }

  function drawPattern_obsidian(cx, cy, p, gx, gy, rng) {
    const g = wallAccentLayer;
    // Darker wash
    g.fillStyle(0x080506, 0.35);
    g.fillRect(cx + 1, cy + 1, tileSize - 2, tileSize - 2);
    // Angular facet highlights (triangles)
    g.fillStyle(p.wallEdge, 0.38);
    for (let i = 0; i < 3; i += 1) {
      const fx = cx + rng() * tileSize;
      const fy = cy + rng() * tileSize;
      const s = 4 + rng() * 5;
      g.fillTriangle(fx, fy, fx + s, fy + s * 0.45, fx + s * 0.3, fy + s);
    }
    // Sharp bright streak
    g.lineStyle(1, 0x8a7a78, 0.50);
    const sx = cx + rng() * tileSize;
    g.beginPath();
    g.moveTo(sx, cy + 2);
    g.lineTo(sx + (rng() - 0.5) * 12, cy + tileSize - 2);
    g.strokePath();
  }

  function drawPattern_gothic(cx, cy, p, gx, gy) {
    drawPattern_bricks(cx, cy, p, gx, gy);
    const g = wallAccentLayer;
    // Central vertical pilaster groove
    g.fillStyle(p.wallShadow, 0.55);
    g.fillRect(cx + tileSize / 2 - 1, cy + 1, 2.2, tileSize - 2);
    g.fillStyle(p.wallEdge, 0.40);
    g.fillRect(cx + tileSize / 2 + 0.6, cy + 1, 0.8, tileSize - 2);
    // Small ornament knobs at top and bottom
    g.fillStyle(p.wallEdge, 0.55);
    g.fillCircle(cx + tileSize / 2, cy + 3, 1.3);
    g.fillCircle(cx + tileSize / 2, cy + tileSize - 3, 1.3);
  }

  function drawPattern_metal(cx, cy, p, gx, gy, rng) {
    const g = wallAccentLayer;
    // 3 horizontal metal bands
    const bands = 3;
    const bh = tileSize / bands;
    for (let i = 0; i < bands; i += 1) {
      const yy = cy + (i + 0.5) * bh;
      g.fillStyle(p.wallShadow, 0.60);
      g.fillRect(cx, yy - 2, tileSize, 4);
      g.fillStyle(p.wallEdge, 0.42);
      g.fillRect(cx, yy - 2, tileSize, 0.9);
      // Rivets along each band
      for (let j = 0; j < 3; j += 1) {
        const rx = cx + (j + 0.5) * (tileSize / 3);
        g.fillStyle(0x1c1816, 0.90);
        g.fillCircle(rx, yy, 1.4);
        g.fillStyle(p.wallEdge, 0.60);
        g.fillCircle(rx - 0.4, yy - 0.4, 0.6);
      }
    }
    // Occasional scratch
    if (rng() < 0.4) {
      g.lineStyle(0.8, p.wallEdge, 0.4);
      const sx = cx + rng() * tileSize;
      const sy = cy + rng() * tileSize;
      g.beginPath(); g.moveTo(sx, sy);
      g.lineTo(sx + (rng() - 0.5) * 8, sy + (rng() - 0.5) * 8);
      g.strokePath();
    }
  }

  function drawPattern_sandstone(cx, cy, p, gx, gy, rng) {
    const g = wallAccentLayer;
    // Horizontal sediment layers (alternating shading)
    const bands = 5;
    for (let i = 0; i < bands; i += 1) {
      const bandY = cy + (i * tileSize) / bands;
      const dark = (i & 1) === 0;
      g.fillStyle(dark ? p.wallShadow : p.wallEdge, dark ? 0.28 : 0.22);
      g.fillRect(cx + 1, bandY, tileSize - 2, tileSize / bands);
    }
    // Sand grain speckles
    g.fillStyle(p.wallShadow, 0.50);
    for (let i = 0; i < 6; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 0.7);
    }
    // Delicate band separator
    g.fillStyle(p.wallShadow, 0.45);
    g.fillRect(cx + 1, cy + tileSize / 2, tileSize - 2, 0.8);
  }

  function drawPattern_webbed(cx, cy, p, gx, gy, rng) {
    drawPattern_bricks(cx, cy, p, gx, gy);
    const g = wallAccentLayer;
    // Thin web strands criss-crossing the wall
    g.lineStyle(0.7, 0xd8d0b8, 0.40);
    const ox = cx + rng() * tileSize;
    const oy = cy + rng() * tileSize;
    for (let i = 0; i < 4; i += 1) {
      const a = rng() * Math.PI * 2;
      g.beginPath();
      g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a) * tileSize, oy + Math.sin(a) * tileSize);
      g.strokePath();
    }
  }

  function drawPattern_fungal(cx, cy, p, gx, gy, rng) {
    drawPattern_bricks(cx, cy, p, gx, gy);
    const g = wallAccentLayer;
    // Moss blobs scattered
    g.fillStyle(0x2a4020, 0.55);
    for (let i = 0; i < 4; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 2 + rng() * 3);
    }
    g.fillStyle(0x3a5a28, 0.45);
    for (let i = 0; i < 6; i += 1) {
      g.fillCircle(cx + rng() * tileSize, cy + rng() * tileSize, 0.8 + rng());
    }
    // Occasional small mushroom
    if (rng() < 0.35) {
      const mx = cx + tileSize * 0.25 + rng() * tileSize * 0.5;
      const my = cy + tileSize * 0.3 + rng() * tileSize * 0.5;
      g.fillStyle(0x9a5030, 0.85);
      g.fillEllipse(mx, my, 4, 2);
      g.fillStyle(0xc8b0a0, 0.85);
      g.fillRect(mx - 0.6, my, 1.2, 3);
    }
  }

  // ── Wall motifs (sparse, feature-size details on visible walls) ───
  function drawWallMotif(kind, cx, cy, p, rng, gx, gy) {
    const g = wallAccentLayer;
    const mx = cx + tileSize / 2;
    const my = cy + tileSize / 2;
    switch (kind) {
      case 'wallCrack': {
        g.lineStyle(1.3, 0x030201, 0.90);
        const len = tileSize * (0.6 + rng() * 0.3);
        const a = rng() * Math.PI * 2;
        const x1 = mx - Math.cos(a) * len / 2, y1 = my - Math.sin(a) * len / 2;
        const x2 = mx + Math.cos(a) * len / 2, y2 = my + Math.sin(a) * len / 2;
        g.beginPath();
        g.moveTo(x1, y1);
        const segs = 5;
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t + (rng() - 0.5) * 4, y1 + (y2 - y1) * t + (rng() - 0.5) * 4);
        }
        g.strokePath();
        // Branches
        g.lineStyle(0.8, 0x030201, 0.70);
        g.beginPath(); g.moveTo(mx, my);
        g.lineTo(mx + (rng() - 0.5) * 8, my + (rng() - 0.5) * 8);
        g.strokePath();
        break;
      }
      case 'torch': {
        // Iron bracket + flame + warm halo
        g.fillStyle(0x1a1208, 0.95);
        g.fillRect(mx - 1, my - 2, 2, tileSize * 0.30);
        g.fillStyle(0x3a2a18, 0.92);
        g.fillRect(mx - 4, my - 3, 8, 2.4);
        // Glow halo (additive feel via translucent orange)
        g.fillStyle(0xffb848, 0.18);
        g.fillCircle(mx, my - 5, 13);
        g.fillStyle(0xffd860, 0.14);
        g.fillCircle(mx, my - 5, 9);
        // Flame layers
        g.fillStyle(0xb02408, 0.80);
        g.fillEllipse(mx, my - 7, 7, 11);
        g.fillStyle(0xff6820, 0.85);
        g.fillEllipse(mx, my - 7, 4.5, 8);
        g.fillStyle(0xffb848, 0.80);
        g.fillEllipse(mx, my - 7, 2.5, 5.5);
        g.fillStyle(0xfff0c0, 0.85);
        g.fillEllipse(mx, my - 6, 1.2, 2.6);
        break;
      }
      case 'skull': {
        // Mounted skull plaque
        g.fillStyle(0x060404, 0.55);
        g.fillEllipse(mx, my + 6, 14, 2.4);
        g.fillStyle(0xc8bca0, 0.92);
        g.fillCircle(mx, my - 1, 6.5);
        g.fillEllipse(mx, my + 2, 11, 9);
        g.fillStyle(0x070404, 1);
        g.fillCircle(mx - 2.5, my - 0.5, 1.8);
        g.fillCircle(mx + 2.5, my - 0.5, 1.8);
        g.fillRect(mx - 0.9, my + 1.6, 1.8, 2);
        g.lineStyle(1, 0x3a2a20, 0.75);
        g.beginPath();
        g.moveTo(mx - 3.2, my + 4); g.lineTo(mx + 3.2, my + 4);
        g.strokePath();
        // Crack above skull
        g.lineStyle(0.7, 0x3a2a20, 0.55);
        g.beginPath();
        g.moveTo(mx - 1, my - 5); g.lineTo(mx + 0.8, my - 2);
        g.strokePath();
        break;
      }
      case 'niche': {
        // Carved alcove with a small skull / dark recess
        const nw = tileSize * 0.48, nh = tileSize * 0.6;
        g.fillStyle(0x030201, 0.95);
        g.fillRect(mx - nw / 2, my - nh / 2, nw, nh);
        // Rim highlight
        g.lineStyle(1, p.wallEdge, 0.80);
        g.strokeRect(mx - nw / 2, my - nh / 2, nw, nh);
        // Arched top
        g.fillStyle(0x030201, 0.95);
        g.fillTriangle(mx - nw / 2, my - nh / 2, mx + nw / 2, my - nh / 2, mx, my - nh / 2 - 4);
        g.lineStyle(1, p.wallEdge, 0.8);
        g.beginPath();
        g.moveTo(mx - nw / 2, my - nh / 2);
        g.lineTo(mx, my - nh / 2 - 4);
        g.lineTo(mx + nw / 2, my - nh / 2);
        g.strokePath();
        // Tiny skull inside
        g.fillStyle(0xa89878, 0.8);
        g.fillCircle(mx, my + 1, 3);
        g.fillStyle(0x030201, 1);
        g.fillCircle(mx - 1, my, 0.8);
        g.fillCircle(mx + 1, my, 0.8);
        break;
      }
      case 'runeGlow': {
        // Carved rune with faint pulsing glow (drawn static)
        g.fillStyle(0x000000, 0.7);
        g.fillCircle(mx, my, 10);
        g.lineStyle(1.3, 0x8a40c8, 0.90);
        const r = 7;
        const pts = 5;
        g.beginPath();
        for (let i = 0; i <= pts; i += 1) {
          const a = (i / pts) * Math.PI * 2 - Math.PI / 2;
          const x = mx + Math.cos(a) * r;
          const y = my + Math.sin(a) * r;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.strokePath();
        g.lineStyle(0.8, 0xd890ff, 0.80);
        g.strokeCircle(mx, my, r + 2);
        g.fillStyle(0xa860f0, 0.35);
        g.fillCircle(mx, my, 4);
        break;
      }
      case 'pentagramWall': {
        g.fillStyle(0x1a0404, 0.85);
        g.fillCircle(mx, my, 13);
        g.lineStyle(1.5, 0xff3020, 0.88);
        const rp = 11;
        const pts = [];
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          pts.push([mx + Math.cos(a) * rp, my + Math.sin(a) * rp]);
        }
        g.beginPath();
        g.moveTo(...pts[0]); g.lineTo(...pts[2]); g.lineTo(...pts[4]);
        g.lineTo(...pts[1]); g.lineTo(...pts[3]); g.lineTo(...pts[0]);
        g.strokePath();
        g.lineStyle(1, 0xff6040, 0.70);
        g.strokeCircle(mx, my, rp);
        g.fillStyle(0xff4020, 0.30);
        g.fillCircle(mx, my, 3);
        break;
      }
      case 'mossStreak': {
        // Hanging moss drip from top of tile
        g.fillStyle(0x2e4a1e, 0.75);
        const streakCount = 2 + Math.floor(rng() * 2);
        for (let i = 0; i < streakCount; i += 1) {
          const sx = cx + tileSize * (0.2 + i * (0.6 / Math.max(1, streakCount - 1)) + (rng() - 0.5) * 0.1);
          const len = tileSize * (0.3 + rng() * 0.4);
          g.fillRect(sx - 1.2, cy, 2.4, len);
          g.fillStyle(0x4a6a22, 0.55);
          g.fillRect(sx - 0.6, cy, 1.2, len * 0.8);
          g.fillStyle(0x2e4a1e, 0.75);
          // Dripping bottom
          g.fillCircle(sx, cy + len, 1.8);
        }
        // Moss patches on top edge
        g.fillStyle(0x3a5a24, 0.6);
        for (let i = 0; i < 4; i += 1) {
          g.fillCircle(cx + rng() * tileSize, cy + rng() * 4, 1.2 + rng() * 0.8);
        }
        break;
      }
      case 'webWall': {
        // Large web across the wall tile
        const anchor = Math.floor(rng() * 4);
        const ax = cx + (anchor & 1 ? tileSize - 1 : 1);
        const ay = cy + (anchor & 2 ? tileSize - 1 : 1);
        g.lineStyle(0.9, 0xe4dcc8, 0.65);
        for (let i = 0; i < 6; i += 1) {
          const a = rng() * Math.PI * 2;
          g.beginPath();
          g.moveTo(ax, ay);
          g.lineTo(ax + Math.cos(a) * tileSize * 0.9, ay + Math.sin(a) * tileSize * 0.9);
          g.strokePath();
        }
        g.lineStyle(0.7, 0xe4dcc8, 0.50);
        for (let ring = 1; ring <= 3; ring += 1) {
          g.beginPath();
          g.arc(ax, ay, tileSize * 0.25 * ring, 0, Math.PI * 2);
          g.strokePath();
        }
        break;
      }
      case 'eggSacWall': {
        // Mounted egg sac with silk threads
        g.lineStyle(0.7, 0xdcd8c0, 0.55);
        g.beginPath(); g.moveTo(mx - 5, cy + 2); g.lineTo(mx, my - 4); g.strokePath();
        g.beginPath(); g.moveTo(mx + 5, cy + 2); g.lineTo(mx, my - 4); g.strokePath();
        g.fillStyle(0x342a18, 0.85);
        g.fillEllipse(mx, my, 11, 9);
        g.fillStyle(0xbeae80, 0.95);
        g.fillEllipse(mx, my - 1, 9, 7);
        g.fillStyle(0xe8dcb0, 0.55);
        g.fillEllipse(mx - 2, my - 2, 3, 2);
        g.lineStyle(0.8, 0x5a5236, 0.75);
        g.strokeEllipse(mx, my, 11, 9);
        break;
      }
      case 'iceCrystal': {
        // Cluster of ice spikes
        g.fillStyle(0x4a6a80, 0.6);
        g.fillCircle(mx, my, 6);
        g.fillStyle(0xbde4f0, 0.85);
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          const r1 = 2.5;
          const r2 = 7 + rng() * 2;
          g.fillTriangle(
            mx + Math.cos(a) * r2, my + Math.sin(a) * r2,
            mx + Math.cos(a - 0.4) * r1, my + Math.sin(a - 0.4) * r1,
            mx + Math.cos(a + 0.4) * r1, my + Math.sin(a + 0.4) * r1,
          );
        }
        g.fillStyle(0xffffff, 0.75);
        g.fillCircle(mx - 1, my - 1, 1.4);
        break;
      }
      case 'wallVeinRed': {
        g.lineStyle(2.2, 0x2a0606, 0.85);
        const x1 = cx, y1 = cy + tileSize * (0.2 + rng() * 0.6);
        const x2 = cx + tileSize, y2 = cy + tileSize * (0.2 + rng() * 0.6);
        g.beginPath(); g.moveTo(x1, y1);
        const segs = 6;
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * 7) * 3);
        }
        g.strokePath();
        g.lineStyle(1, 0xb02828, 0.90);
        g.beginPath(); g.moveTo(x1, y1);
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * 7) * 3);
        }
        g.strokePath();
        // Pulsing nodes
        g.fillStyle(0xff5020, 0.75);
        for (let i = 0; i < 2; i += 1) {
          g.fillCircle(cx + (0.3 + rng() * 0.4) * tileSize, cy + tileSize * (0.3 + rng() * 0.4), 1.5);
        }
        break;
      }
      case 'wallVeinLava': {
        g.lineStyle(2.8, 0x2a0a02, 0.92);
        const x1 = cx, y1 = cy + tileSize * (0.2 + rng() * 0.6);
        const x2 = cx + tileSize, y2 = cy + tileSize * (0.2 + rng() * 0.6);
        g.beginPath(); g.moveTo(x1, y1);
        const segs = 6;
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * 7) * 3.5);
        }
        g.strokePath();
        g.lineStyle(1.5, 0xff6820, 0.95);
        g.beginPath(); g.moveTo(x1, y1);
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * 7) * 3.5);
        }
        g.strokePath();
        g.lineStyle(0.7, 0xffe8a0, 0.85);
        g.beginPath(); g.moveTo(x1, y1);
        for (let i = 1; i <= segs; i += 1) {
          const t = i / segs;
          g.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + Math.sin(t * 7) * 3.5);
        }
        g.strokePath();
        // Glow bulges
        g.fillStyle(0xffc050, 0.65);
        for (let i = 0; i < 2; i += 1) {
          g.fillCircle(cx + (0.3 + rng() * 0.4) * tileSize, cy + tileSize * (0.3 + rng() * 0.4), 2);
        }
        break;
      }
      case 'chain': {
        // Vertical hanging chain with links
        const baseX = mx + (rng() - 0.5) * 8;
        const linkCount = 5;
        const linkH = 4;
        const startY = cy + 2;
        for (let i = 0; i < linkCount; i += 1) {
          const ly = startY + i * linkH;
          g.fillStyle(0x1a1a1e, 0.95);
          g.fillEllipse(baseX, ly, 3.5, 3);
          g.fillStyle(0x58585e, 0.85);
          g.fillEllipse(baseX, ly, 2.3, 1.8);
          g.fillStyle(0x98989e, 0.60);
          g.fillEllipse(baseX - 0.5, ly - 0.5, 1, 0.8);
        }
        // Top bracket
        g.fillStyle(0x1a1612, 0.9);
        g.fillRect(baseX - 3, cy, 6, 2);
        break;
      }
      case 'banner': {
        // Tattered banner hanging from top of wall
        const bw = tileSize * 0.5;
        const bh = tileSize * 0.75;
        const bx = mx - bw / 2 + (rng() - 0.5) * 4;
        const by = cy + 2;
        // Rod
        g.fillStyle(0x1a1612, 0.95);
        g.fillRect(bx - 2, by, bw + 4, 2);
        // Cloth
        g.fillStyle(0x681218, 0.88);
        g.fillRect(bx, by + 2, bw, bh);
        // Stripe highlight
        g.fillStyle(0x8a1c24, 0.75);
        g.fillRect(bx + 1, by + 2, bw - 2, 3);
        // Dark stain
        g.fillStyle(0x1a0306, 0.55);
        g.fillEllipse(bx + bw / 2, by + bh * 0.55, bw * 0.4, 4);
        // Tattered bottom
        for (let i = 0; i < 3; i += 1) {
          const tx = bx + (i + 0.5) * (bw / 3);
          g.fillTriangle(tx, by + bh, tx + 2, by + bh + 3, tx - 2, by + bh + 3);
          g.fillStyle(0x681218, 0.88);
        }
        break;
      }
      case 'bloodSplatter': {
        g.fillStyle(0x5a0810, 0.85);
        g.fillEllipse(mx, my, 12, 8);
        g.fillStyle(0x8a1020, 0.70);
        g.fillEllipse(mx - 2, my - 1, 8, 5);
        // Spatter droplets
        g.fillStyle(0x7a0812, 0.80);
        for (let i = 0; i < 8; i += 1) {
          const a = rng() * Math.PI * 2;
          const d = 8 + rng() * 10;
          g.fillCircle(mx + Math.cos(a) * d, my + Math.sin(a) * d, 0.8 + rng() * 1.2);
        }
        // Streaks down
        g.lineStyle(1, 0x5a0810, 0.75);
        for (let i = 0; i < 2; i += 1) {
          const sx = mx + (rng() - 0.5) * 8;
          g.beginPath(); g.moveTo(sx, my + 2);
          g.lineTo(sx + (rng() - 0.5) * 2, my + 8 + rng() * 4);
          g.strokePath();
        }
        break;
      }
      case 'gargoyle': {
        // Embossed gargoyle face (stylized)
        g.fillStyle(0x060405, 0.85);
        g.fillEllipse(mx, my + 8, 16, 3);
        g.fillStyle(p.wallEdge, 0.90);
        // Head
        g.fillEllipse(mx, my, 12, 11);
        // Horns
        g.fillTriangle(mx - 5, my - 5, mx - 3, my - 5, mx - 7, my - 10);
        g.fillTriangle(mx + 5, my - 5, mx + 3, my - 5, mx + 7, my - 10);
        // Shadow under horns
        g.fillStyle(p.wallShadow, 0.85);
        g.fillEllipse(mx, my - 3, 10, 3);
        // Eyes (glowing red)
        g.fillStyle(0x000000, 1);
        g.fillCircle(mx - 2.6, my - 1, 1.5);
        g.fillCircle(mx + 2.6, my - 1, 1.5);
        g.fillStyle(0xff3018, 0.90);
        g.fillCircle(mx - 2.6, my - 1, 0.9);
        g.fillCircle(mx + 2.6, my - 1, 0.9);
        // Mouth (fangs)
        g.fillStyle(0x080404, 0.95);
        g.fillRect(mx - 3.5, my + 2, 7, 2.5);
        g.fillStyle(0xe8e0c8, 0.85);
        g.fillTriangle(mx - 2.5, my + 2, mx - 1.5, my + 2, mx - 2, my + 5);
        g.fillTriangle(mx + 1.5, my + 2, mx + 2.5, my + 2, mx + 2, my + 5);
        break;
      }
      case 'hieroglyphWall': {
        g.lineStyle(1, 0x2a1d0a, 0.85);
        const rows = 3;
        for (let r = 0; r < rows; r += 1) {
          const y = cy + tileSize * (0.25 + r * 0.25);
          const glyphs = 2 + Math.floor(rng() * 2);
          for (let i = 0; i < glyphs; i += 1) {
            const x = cx + 5 + i * 10 + (rng() - 0.5) * 4;
            const kind = Math.floor(rng() * 4);
            g.beginPath();
            if (kind === 0) { g.moveTo(x, y - 3); g.lineTo(x + 4, y); g.lineTo(x, y + 3); }
            else if (kind === 1) { g.moveTo(x - 3, y); g.lineTo(x + 3, y); g.moveTo(x, y - 3); g.lineTo(x, y + 3); }
            else if (kind === 2) { g.moveTo(x - 3, y - 2); g.lineTo(x + 3, y - 2); g.lineTo(x, y + 3); g.lineTo(x - 3, y - 2); }
            else { g.moveTo(x, y - 3); g.lineTo(x + 3, y); g.lineTo(x, y + 3); g.lineTo(x - 3, y); g.lineTo(x, y - 3); }
            g.strokePath();
          }
        }
        break;
      }
      case 'oreVein': {
        // Dark streak + metallic glints
        g.fillStyle(0x1a1610, 0.78);
        g.fillEllipse(mx, my, tileSize * 0.62, tileSize * 0.28);
        g.fillStyle(0xe8c460, 0.90);
        for (let i = 0; i < 5; i += 1) {
          g.fillCircle(mx + (rng() - 0.5) * tileSize * 0.55, my + (rng() - 0.5) * 8, 1.3 + rng() * 0.8);
        }
        g.fillStyle(0xfff0a0, 0.75);
        for (let i = 0; i < 3; i += 1) {
          g.fillCircle(mx + (rng() - 0.5) * tileSize * 0.4, my + (rng() - 0.5) * 5, 0.6);
        }
        break;
      }
      case 'scorchMark': {
        g.fillStyle(0x000000, 0.80);
        g.fillEllipse(mx, my, tileSize * 0.55, tileSize * 0.42);
        g.fillStyle(0x1a0a04, 0.65);
        g.fillEllipse(mx, my, tileSize * 0.40, tileSize * 0.28);
        // Sooty flecks radiating out
        g.fillStyle(0x000000, 0.55);
        for (let i = 0; i < 7; i += 1) {
          const a = rng() * Math.PI * 2;
          const d = 14 + rng() * 6;
          g.fillCircle(mx + Math.cos(a) * d, my + Math.sin(a) * d, 0.6 + rng() * 0.8);
        }
        break;
      }
      case 'spike': {
        // Iron spike jutting out of wall
        const sx = mx + (rng() - 0.5) * 4;
        g.fillStyle(0x1a1a1e, 0.95);
        g.fillEllipse(sx, my + 6, 6, 2.2);
        g.fillStyle(0x3a3a42, 0.95);
        g.fillTriangle(sx - 2, my + 5, sx + 2, my + 5, sx, my - 5);
        g.fillStyle(0x8a8a92, 0.60);
        g.fillTriangle(sx - 0.6, my + 4, sx + 0.4, my + 4, sx, my - 4);
        // Blood drip
        g.fillStyle(0x5a0810, 0.75);
        g.fillEllipse(sx, my - 3, 1.8, 1);
        g.fillRect(sx - 0.6, my - 3, 1.2, 4);
        break;
      }
      case 'scrapPatch': {
        const w = tileSize * 0.55, h = tileSize * 0.45;
        const px = mx - w / 2 + (rng() - 0.5) * 4;
        const py = my - h / 2 + (rng() - 0.5) * 4;
        g.fillStyle(0x2e2a24, 0.85);
        g.fillRect(px, py, w, h);
        g.lineStyle(1, 0x5a5248, 0.80);
        g.strokeRect(px, py, w, h);
        // Rust
        g.fillStyle(0x8a4820, 0.55);
        g.fillCircle(px + 2, py + 2, 1.4);
        g.fillCircle(px + w - 2, py + h - 2, 1.4);
        // Rivets
        g.fillStyle(0x060404, 0.95);
        g.fillCircle(px + 2, py + 2, 0.8);
        g.fillCircle(px + w - 2, py + 2, 0.8);
        g.fillCircle(px + 2, py + h - 2, 0.8);
        g.fillCircle(px + w - 2, py + h - 2, 0.8);
        break;
      }
      case 'graffitiWall': {
        g.lineStyle(1.2, 0xc85028, 0.80);
        // Crude tribal mark
        g.beginPath();
        g.moveTo(mx - 7, my - 3); g.lineTo(mx - 2, my + 3); g.lineTo(mx + 3, my - 4); g.lineTo(mx + 7, my + 4);
        g.strokePath();
        g.lineStyle(1, 0xe88038, 0.75);
        g.beginPath();
        g.moveTo(mx - 6, my + 5); g.lineTo(mx + 6, my + 5);
        g.strokePath();
        // Dot accents
        g.fillStyle(0xc85028, 0.8);
        g.fillCircle(mx - 4, my - 6, 1);
        g.fillCircle(mx + 4, my - 6, 1);
        break;
      }
      case 'goldInlay': {
        // Decorative gold pattern
        g.lineStyle(1.3, 0xffc850, 0.90);
        g.beginPath();
        g.moveTo(cx + 4, my); g.lineTo(cx + tileSize - 4, my);
        g.strokePath();
        g.fillStyle(0xffd870, 0.88);
        g.fillCircle(mx, my, 2.8);
        g.fillStyle(0xfff0a0, 0.80);
        g.fillCircle(mx - 0.6, my - 0.6, 1.2);
        // Side ornaments
        g.fillStyle(0xffc850, 0.85);
        for (let i = 0; i < 2; i += 1) {
          const ox = i === 0 ? -10 : 10;
          g.fillTriangle(mx + ox, my, mx + ox - 2, my - 2, mx + ox - 2, my + 2);
          g.fillTriangle(mx + ox, my, mx + ox + 2, my - 2, mx + ox + 2, my + 2);
        }
        break;
      }
      default:
        break;
    }
  }

  function rebuildDecorations(currentMap, dungeonW, dungeonH, pitTile, spawnTile) {
    decorLayer.clear();
    const rng = mulberry32(level * 1337 + 42);
    const decorCfg = theme.decor || { density: 0, weights: {} };
    const entries = Object.entries(decorCfg.weights || {});
    const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
    const buckets = [];
    let acc = 0;
    for (const [name, w] of entries) {
      acc += w / total;
      buckets.push({ name, upto: acc });
    }
    const pickDecor = () => {
      const r = rng();
      for (const b of buckets) if (r <= b.upto) return b.name;
      return buckets.length ? buckets[buckets.length - 1].name : null;
    };

    for (let y = 0; y < dungeonH; y += 1) {
      for (let x = 0; x < dungeonW; x += 1) {
        if (currentMap[y][x] !== '.') continue;
        if (pitTile && pitTile.gx === x && pitTile.gy === y) continue;
        if (spawnTile && spawnTile.gx === x && spawnTile.gy === y) continue;
        if (rng() > decorCfg.density) continue;
        const kind = pickDecor();
        if (kind) drawDecor(kind, x, y, rng);
      }
    }

    const webCfg = theme.cornerWeb;
    if (webCfg && webCfg.probability > 0) {
      for (let y = 0; y < dungeonH; y += 1) {
        for (let x = 0; x < dungeonW; x += 1) {
          if (currentMap[y][x] !== '.') continue;
          const isWall = (dx, dy) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= dungeonW || ny >= dungeonH) return true;
            return currentMap[ny][nx] === '#';
          };
          const corners = [
            { sx: -1, sy: -1 }, { sx: 1, sy: -1 },
            { sx: -1, sy:  1 }, { sx: 1, sy:  1 },
          ];
          for (const c of corners) {
            if (isWall(c.sx, 0) && isWall(0, c.sy) && rng() < webCfg.probability) {
              drawWeb(x, y, c, webCfg);
            }
          }
        }
      }
    }
  }

  function drawDecor(kind, gx, gy, rng) {
    const cx = gx * tileSize + tileSize / 2;
    const cy = gy * tileSize + tileSize / 2;
    const g = decorLayer;
    switch (kind) {
      case 'droppings': {
        g.fillStyle(0x140d07, 0.88);
        for (let i = 0; i < 5; i += 1) {
          g.fillEllipse(cx + (rng() - 0.5) * 26, cy + (rng() - 0.5) * 26,
            3 + rng() * 2, 1.4 + rng() * 0.9);
        }
        break;
      }
      case 'puddle': {
        const w = tileSize * (0.38 + rng() * 0.22);
        const h = tileSize * (0.22 + rng() * 0.14);
        g.fillStyle(0x08100f, 0.78); g.fillEllipse(cx, cy, w, h);
        g.fillStyle(0x3a5a5a, 0.35); g.fillEllipse(cx - w * 0.18, cy - h * 0.22, w * 0.32, h * 0.22);
        break;
      }
      case 'crack': {
        g.lineStyle(1, 0x040302, 0.85);
        const len = tileSize * (0.30 + rng() * 0.32);
        const ang = rng() * Math.PI * 2;
        const x1 = cx - Math.cos(ang) * len * 0.5, y1 = cy - Math.sin(ang) * len * 0.5;
        const x2 = cx + Math.cos(ang) * len * 0.5, y2 = cy + Math.sin(ang) * len * 0.5;
        const mx = (x1 + x2) / 2 + (rng() - 0.5) * 4, my = (y1 + y2) / 2 + (rng() - 0.5) * 4;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(mx, my); g.lineTo(x2, y2); g.strokePath();
        break;
      }
      case 'moss': {
        g.fillStyle(0x2b3a18, 0.55);
        for (let i = 0; i < 9; i += 1) g.fillCircle(cx + (rng() - 0.5) * 30, cy + (rng() - 0.5) * 30, 1 + rng() * 1.8);
        g.fillStyle(0x405a20, 0.45);
        for (let i = 0; i < 4; i += 1) g.fillCircle(cx + (rng() - 0.5) * 26, cy + (rng() - 0.5) * 26, 0.8 + rng() * 1.2);
        break;
      }
      case 'bones': {
        const ang = rng() * Math.PI;
        const len = 7 + rng() * 5;
        const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
        g.lineStyle(2, 0xbfb297, 0.78);
        g.beginPath(); g.moveTo(cx - dx / 2, cy - dy / 2); g.lineTo(cx + dx / 2, cy + dy / 2); g.strokePath();
        g.fillStyle(0xc9bda3, 0.8);
        g.fillEllipse(cx - dx / 2, cy - dy / 2, 3.2, 2.2);
        g.fillEllipse(cx + dx / 2, cy + dy / 2, 3.2, 2.2);
        break;
      }
      case 'grain': {
        g.fillStyle(0x6b5a2a, 0.72);
        for (let i = 0; i < 7; i += 1) g.fillCircle(cx + (rng() - 0.5) * 28, cy + (rng() - 0.5) * 28, 0.7 + rng() * 0.8);
        g.fillStyle(0x4a3d1c, 0.55);
        g.fillEllipse(cx + (rng() - 0.5) * 6, cy + (rng() - 0.5) * 6, 4, 2);
        break;
      }
      case 'brickPatch': {
        const w = tileSize * 0.55, h = tileSize * 0.38;
        g.fillStyle(0x070503, 0.55); g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.lineStyle(1, 0x1c1510, 0.7); g.strokeRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x1c1510, 0.5); g.fillRect(cx - w / 2, cy, w, 1);
        break;
      }

      // ── Floor 2: Wolves (snow) ────────────────────────────────────
      case 'snow': {
        g.fillStyle(0xe8edf2, 0.65);
        g.fillEllipse(cx, cy + (rng() - 0.5) * 6, tileSize * (0.5 + rng() * 0.3), tileSize * (0.25 + rng() * 0.15));
        g.fillStyle(0xffffff, 0.45);
        for (let i = 0; i < 4; i += 1) g.fillCircle(cx + (rng() - 0.5) * 22, cy + (rng() - 0.5) * 12, 0.8 + rng() * 1.2);
        break;
      }
      case 'pine': {
        g.lineStyle(1, 0x2a3a22, 0.75);
        for (let i = 0; i < 4; i += 1) {
          const ang = rng() * Math.PI * 2;
          const x1 = cx + (rng() - 0.5) * 18, y1 = cy + (rng() - 0.5) * 18;
          const x2 = x1 + Math.cos(ang) * 6, y2 = y1 + Math.sin(ang) * 6;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
          g.fillStyle(0x3a5028, 0.6);
          for (let k = 0; k < 4; k += 1) g.fillCircle(x1 + Math.cos(ang) * k * 1.8, y1 + Math.sin(ang) * k * 1.8, 0.9);
        }
        break;
      }
      case 'fur': {
        g.fillStyle(0x5a4832, 0.7);
        for (let i = 0; i < 10; i += 1) {
          const a = rng() * Math.PI * 2;
          g.fillEllipse(cx + (rng() - 0.5) * 22, cy + (rng() - 0.5) * 22, 2.6, 1.1);
        }
        g.fillStyle(0x3a2d1e, 0.5);
        for (let i = 0; i < 6; i += 1) g.fillEllipse(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 20, 1.8, 0.8);
        break;
      }
      case 'icePatch': {
        g.fillStyle(0x8ac0d8, 0.4);
        g.fillEllipse(cx, cy, tileSize * (0.55 + rng() * 0.2), tileSize * (0.3 + rng() * 0.15));
        g.lineStyle(1, 0xbfe0ec, 0.55);
        for (let i = 0; i < 3; i += 1) {
          const a = rng() * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * 10, cy + Math.sin(a) * 6);
          g.strokePath();
        }
        break;
      }
      case 'pawprint': {
        g.fillStyle(0x0a0604, 0.75);
        const ang = rng() * Math.PI * 2;
        for (let i = 0; i < 2; i += 1) {
          const ox = Math.cos(ang + Math.PI / 2) * (i === 0 ? -5 : 5);
          const oy = Math.sin(ang + Math.PI / 2) * (i === 0 ? -5 : 5);
          g.fillEllipse(cx + ox, cy + oy, 4, 3);
          for (let k = 0; k < 3; k += 1) {
            const toeA = ang - 0.5 + k * 0.5;
            g.fillCircle(cx + ox + Math.cos(toeA) * 4, cy + oy + Math.sin(toeA) * 4, 1);
          }
        }
        break;
      }

      // ── Floor 3: Rotworms (gore) ──────────────────────────────────
      case 'gore': {
        g.fillStyle(0x5a0810, 0.78);
        g.fillEllipse(cx, cy, tileSize * 0.55, tileSize * 0.28);
        g.fillStyle(0x8a1020, 0.65);
        for (let i = 0; i < 5; i += 1) g.fillCircle(cx + (rng() - 0.5) * 22, cy + (rng() - 0.5) * 10, 1.5 + rng() * 1.5);
        g.fillStyle(0x2a0204, 0.5);
        g.fillEllipse(cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 6, 4, 2);
        break;
      }
      case 'maggot': {
        g.fillStyle(0xd8c8a0, 0.8);
        for (let i = 0; i < 6; i += 1) {
          const x = cx + (rng() - 0.5) * 26, y = cy + (rng() - 0.5) * 22;
          g.fillEllipse(x, y, 3 + rng() * 1.2, 1.3);
        }
        g.fillStyle(0x8a7a5a, 0.6);
        for (let i = 0; i < 3; i += 1) g.fillEllipse(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 18, 2, 0.9);
        break;
      }
      case 'bile': {
        g.fillStyle(0x4a5020, 0.75);
        g.fillEllipse(cx, cy, tileSize * 0.45, tileSize * 0.25);
        g.fillStyle(0x7a8030, 0.55);
        g.fillEllipse(cx - 4, cy - 3, tileSize * 0.2, tileSize * 0.10);
        break;
      }
      case 'wormTrail': {
        g.lineStyle(3, 0x2a0a08, 0.55);
        g.beginPath();
        const steps = 12;
        const len = tileSize * 0.7;
        const baseAng = rng() * Math.PI * 2;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const px = cx - Math.cos(baseAng) * len / 2 + Math.cos(baseAng) * len * t + Math.sin(t * 7) * 3;
          const py = cy - Math.sin(baseAng) * len / 2 + Math.sin(baseAng) * len * t + Math.cos(t * 7) * 3;
          if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
        }
        g.strokePath();
        break;
      }

      // ── Floor 4: Trolls (primitive) ───────────────────────────────
      case 'mud': {
        g.fillStyle(0x2a1e10, 0.75);
        g.fillEllipse(cx, cy, tileSize * 0.6, tileSize * 0.3);
        g.fillStyle(0x15100a, 0.6);
        for (let i = 0; i < 4; i += 1) g.fillCircle(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 10, 2 + rng() * 2);
        break;
      }
      case 'bigBone': {
        const ang = rng() * Math.PI;
        const len = 16 + rng() * 10;
        const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
        g.lineStyle(5, 0xb0a487, 0.85);
        g.beginPath(); g.moveTo(cx - dx / 2, cy - dy / 2); g.lineTo(cx + dx / 2, cy + dy / 2); g.strokePath();
        g.fillStyle(0xcac0a0, 0.9);
        g.fillEllipse(cx - dx / 2, cy - dy / 2, 6, 4);
        g.fillEllipse(cx + dx / 2, cy + dy / 2, 6, 4);
        g.fillStyle(0x554a32, 0.55);
        g.fillEllipse(cx - dx / 2 + 1, cy - dy / 2 + 1, 4, 2);
        break;
      }
      case 'crushedRock': {
        g.fillStyle(0x3a3228, 0.7);
        for (let i = 0; i < 5; i += 1) {
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillRect(x - 2, y - 1.5, 3 + rng() * 2, 2 + rng() * 1.5);
        }
        g.fillStyle(0x1a1610, 0.65);
        for (let i = 0; i < 6; i += 1) g.fillCircle(cx + (rng() - 0.5) * 24, cy + (rng() - 0.5) * 24, 0.8 + rng());
        break;
      }

      // ── Floor 5: Undead (crypt) ───────────────────────────────────
      case 'skull': {
        g.fillStyle(0xbab0a0, 0.85);
        g.fillEllipse(cx, cy - 1, 9, 8);
        g.fillStyle(0xd8ccbe, 0.85);
        g.fillCircle(cx - 0.5, cy - 2, 4);
        g.fillStyle(0x101008, 0.95);
        g.fillCircle(cx - 2.2, cy - 1, 1.3);
        g.fillCircle(cx + 2.2, cy - 1, 1.3);
        g.fillRect(cx - 1, cy + 1, 2, 2);
        g.lineStyle(1, 0x3a3428, 0.7);
        g.beginPath(); g.moveTo(cx - 3, cy + 3); g.lineTo(cx + 3, cy + 3); g.strokePath();
        break;
      }
      case 'coffinLid': {
        const w = tileSize * 0.5, h = tileSize * 0.6;
        g.fillStyle(0x2a1d12, 0.8);
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.lineStyle(1, 0x554432, 0.7);
        g.strokeRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x554432, 0.7);
        g.fillRect(cx - 1, cy - h / 2 + 2, 2, h - 4);
        g.fillRect(cx - w / 2 + 2, cy - 1, w - 4, 2);
        break;
      }
      case 'ashPile': {
        g.fillStyle(0x3a3540, 0.65);
        g.fillEllipse(cx, cy + 3, tileSize * 0.5, tileSize * 0.2);
        g.fillStyle(0x202028, 0.55);
        for (let i = 0; i < 8; i += 1) g.fillCircle(cx + (rng() - 0.5) * 22, cy + rng() * 8, 0.7 + rng() * 1.2);
        break;
      }

      // ── Floor 6: Humans (bandit camp) ─────────────────────────────
      case 'firepit': {
        g.fillStyle(0x1a0f08, 0.85);
        g.fillCircle(cx, cy, 7);
        g.fillStyle(0x2a1a0a, 0.75);
        g.fillCircle(cx, cy, 5);
        g.fillStyle(0x6a3a0a, 0.7);
        g.fillCircle(cx, cy, 2.5);
        g.lineStyle(1.5, 0x4a3a20, 0.8);
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          g.beginPath();
          g.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6);
          g.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
          g.strokePath();
        }
        break;
      }
      case 'bladeShard': {
        const ang = rng() * Math.PI;
        const len = 10 + rng() * 4;
        const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
        g.lineStyle(2, 0x98a0aa, 0.85);
        g.beginPath(); g.moveTo(cx - dx / 2, cy - dy / 2); g.lineTo(cx + dx / 2, cy + dy / 2); g.strokePath();
        g.fillStyle(0x6a5a42, 0.85);
        g.fillEllipse(cx - dx / 2, cy - dy / 2, 3, 2);
        break;
      }
      case 'leather': {
        const w = tileSize * (0.35 + rng() * 0.15);
        const h = tileSize * (0.25 + rng() * 0.12);
        g.fillStyle(0x3a2614, 0.8);
        g.fillEllipse(cx, cy, w, h);
        g.fillStyle(0x1a0d08, 0.6);
        g.fillEllipse(cx - 2, cy + 1, w * 0.7, h * 0.55);
        break;
      }

      // ── Floor 7: Dwarves (mine) ───────────────────────────────────
      case 'ore': {
        g.fillStyle(0x2a2018, 0.75);
        g.fillEllipse(cx, cy, tileSize * 0.4, tileSize * 0.25);
        g.fillStyle(0xe8c878, 0.9);
        for (let i = 0; i < 3; i += 1) g.fillCircle(cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 6, 1 + rng() * 0.8);
        g.fillStyle(0xffeaa0, 0.8);
        g.fillCircle(cx + (rng() - 0.5) * 6, cy + (rng() - 0.5) * 4, 0.9);
        break;
      }
      case 'rail': {
        g.fillStyle(0x3a2a1e, 0.85);
        g.fillRect(cx - tileSize * 0.4, cy - 1, tileSize * 0.8, 2);
        g.fillStyle(0x55463a, 0.9);
        for (let i = 0; i < 5; i += 1) {
          g.fillRect(cx - tileSize * 0.4 + i * (tileSize * 0.18), cy - 4, 3, 8);
        }
        break;
      }
      case 'soot': {
        g.fillStyle(0x0a0706, 0.65);
        g.fillEllipse(cx, cy, tileSize * (0.5 + rng() * 0.2), tileSize * (0.28 + rng() * 0.1));
        for (let i = 0; i < 6; i += 1) {
          g.fillStyle(0x1a1614, 0.6);
          g.fillCircle(cx + (rng() - 0.5) * 22, cy + (rng() - 0.5) * 12, 1 + rng() * 1.2);
        }
        break;
      }

      // ── Floor 8, 10, 11, 17: Blood / torch / weapons / banner ─────
      case 'blood': {
        g.fillStyle(0x5a0810, 0.85);
        g.fillEllipse(cx, cy, tileSize * (0.35 + rng() * 0.15), tileSize * (0.18 + rng() * 0.1));
        g.fillStyle(0x2a0306, 0.7);
        g.fillEllipse(cx + (rng() - 0.5) * 8, cy + (rng() - 0.5) * 5, tileSize * 0.18, tileSize * 0.08);
        for (let i = 0; i < 3; i += 1) {
          g.fillStyle(0x7a0812, 0.6);
          g.fillCircle(cx + (rng() - 0.5) * 26, cy + (rng() - 0.5) * 20, 1 + rng() * 1.2);
        }
        break;
      }
      case 'bloodPool': {
        g.fillStyle(0x3a0308, 0.85);
        g.fillEllipse(cx, cy, tileSize * 0.7, tileSize * 0.38);
        g.fillStyle(0x5e0812, 0.75);
        g.fillEllipse(cx, cy, tileSize * 0.55, tileSize * 0.28);
        g.fillStyle(0x8a1020, 0.45);
        g.fillEllipse(cx - 3, cy - 2, tileSize * 0.18, tileSize * 0.08);
        break;
      }
      case 'torchMark': {
        g.fillStyle(0x080604, 0.7);
        g.fillEllipse(cx, cy, tileSize * 0.35, tileSize * 0.18);
        g.fillStyle(0x3a1a05, 0.55);
        g.fillEllipse(cx, cy, tileSize * 0.22, tileSize * 0.11);
        for (let i = 0; i < 3; i += 1) {
          g.fillStyle(0xd88040, 0.55);
          g.fillCircle(cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 5, 0.8 + rng() * 0.8);
        }
        break;
      }
      case 'tornBanner': {
        const ang = rng() * 0.6 - 0.3;
        const w = tileSize * 0.3, h = tileSize * 0.55;
        g.fillStyle(0x5a0a14, 0.80);
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x7a1a20, 0.65);
        g.fillRect(cx - w / 2 + 1, cy - h / 2 + 1, w - 2, 4);
        g.fillStyle(0x2a0408, 0.6);
        g.fillRect(cx - w / 2, cy + h / 2 - 3, w * 0.4, 3);
        g.fillRect(cx + w / 2 - w * 0.3, cy + h / 2 - 6, w * 0.3, 2);
        break;
      }
      case 'weaponShards': {
        g.fillStyle(0x6a6a72, 0.85);
        for (let i = 0; i < 4; i += 1) {
          const a = rng() * Math.PI * 2;
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillTriangle(
            x, y,
            x + Math.cos(a) * 5, y + Math.sin(a) * 5,
            x + Math.cos(a + 0.6) * 3, y + Math.sin(a + 0.6) * 3,
          );
        }
        break;
      }

      // ── Floor 9: Goblin junk ──────────────────────────────────────
      case 'scrap': {
        for (let i = 0; i < 5; i += 1) {
          const col = [0x5a5a48, 0x7a6a50, 0x3a3226, 0x55483a][i % 4];
          g.fillStyle(col, 0.85);
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          if (i % 2 === 0) g.fillRect(x - 2, y - 1, 4 + rng() * 3, 2);
          else g.fillTriangle(x, y, x + 4, y + 2, x + 2, y + 4);
        }
        break;
      }
      case 'graffiti': {
        g.lineStyle(1, 0x8a4820, 0.80);
        const baseX = cx - 10;
        for (let i = 0; i < 3; i += 1) {
          const x = baseX + i * 6;
          g.beginPath();
          g.moveTo(x, cy - 3 + rng() * 2);
          g.lineTo(x + 3, cy + 2 + rng() * 2);
          g.lineTo(x, cy + 4 + rng() * 2);
          g.strokePath();
        }
        break;
      }

      // ── Floor 11, 14: Runes ───────────────────────────────────────
      case 'rune': {
        g.lineStyle(1.2, 0x8a3a1a, 0.85);
        const arms = 5;
        const r = 8;
        g.beginPath();
        for (let i = 0; i < arms; i += 1) {
          const a = (i / arms) * Math.PI * 2 - Math.PI / 2;
          const a2 = ((i + 2) / arms) * Math.PI * 2 - Math.PI / 2;
          if (i === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          g.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
        }
        g.strokePath();
        g.fillStyle(0xc04820, 0.5);
        g.fillCircle(cx, cy, 1.5);
        break;
      }

      // ── Floor 12, 16, 20: Lava / ember / scorch ───────────────────
      case 'lavaCrack': {
        g.lineStyle(2.5, 0xff6818, 0.9);
        const len = tileSize * (0.5 + rng() * 0.3);
        const ang = rng() * Math.PI * 2;
        const x1 = cx - Math.cos(ang) * len / 2, y1 = cy - Math.sin(ang) * len / 2;
        const x2 = cx + Math.cos(ang) * len / 2, y2 = cy + Math.sin(ang) * len / 2;
        const mx = (x1 + x2) / 2 + (rng() - 0.5) * 6, my = (y1 + y2) / 2 + (rng() - 0.5) * 6;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(mx, my); g.lineTo(x2, y2); g.strokePath();
        g.lineStyle(1, 0xffe090, 0.75);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(mx, my); g.lineTo(x2, y2); g.strokePath();
        break;
      }
      case 'ember': {
        g.fillStyle(0xff8030, 0.85);
        g.fillCircle(cx + (rng() - 0.5) * 14, cy + (rng() - 0.5) * 14, 1.4 + rng());
        g.fillStyle(0xffc860, 0.65);
        g.fillCircle(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 18, 0.8 + rng() * 0.6);
        break;
      }
      case 'anvil': {
        const w = tileSize * 0.42, h = tileSize * 0.22;
        g.fillStyle(0x1a1812, 0.88);
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x3a3428, 0.75);
        g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, 3);
        g.fillStyle(0x0a0906, 0.7);
        g.fillRect(cx - 4, cy + h / 2, 8, 4);
        break;
      }
      case 'scorch': {
        g.fillStyle(0x0a0402, 0.80);
        g.fillEllipse(cx, cy, tileSize * (0.5 + rng() * 0.2), tileSize * (0.32 + rng() * 0.12));
        g.fillStyle(0x1a0a04, 0.65);
        for (let i = 0; i < 5; i += 1) g.fillCircle(cx + (rng() - 0.5) * 24, cy + (rng() - 0.5) * 18, 1 + rng() * 1.5);
        break;
      }
      case 'obsidianShard': {
        g.fillStyle(0x15100e, 0.92);
        const a = rng() * Math.PI * 2;
        const x = cx + (rng() - 0.5) * 8, y = cy + (rng() - 0.5) * 8;
        g.fillTriangle(
          x, y - 5 + rng() * 2,
          x + 3, y + 4,
          x - 3, y + 3,
        );
        g.lineStyle(0.8, 0x55504e, 0.7);
        g.strokeTriangle(
          x, y - 5 + rng() * 2,
          x + 3, y + 4,
          x - 3, y + 3,
        );
        break;
      }
      case 'lava': {
        g.fillStyle(0x3a0a02, 0.85);
        g.fillEllipse(cx, cy, tileSize * 0.6, tileSize * 0.36);
        g.fillStyle(0xc0401a, 0.88);
        g.fillEllipse(cx, cy, tileSize * 0.48, tileSize * 0.26);
        g.fillStyle(0xffa040, 0.85);
        g.fillEllipse(cx, cy, tileSize * 0.3, tileSize * 0.14);
        g.fillStyle(0xffe8a0, 0.7);
        g.fillEllipse(cx - 2, cy - 1, tileSize * 0.12, tileSize * 0.05);
        break;
      }
      case 'brimstone': {
        g.fillStyle(0x1a0806, 0.7);
        for (let i = 0; i < 4; i += 1) {
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillTriangle(x, y - 3, x + 3, y + 2, x - 3, y + 2);
        }
        g.fillStyle(0xc8a818, 0.85);
        for (let i = 0; i < 3; i += 1) {
          const x = cx + (rng() - 0.5) * 18, y = cy + (rng() - 0.5) * 18;
          g.fillCircle(x, y, 1 + rng());
        }
        break;
      }
      case 'pentagram': {
        g.lineStyle(1.2, 0x8a0a18, 0.80);
        const r = 11;
        const points = [];
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
        }
        g.beginPath();
        g.moveTo(...points[0]);
        g.lineTo(...points[2]);
        g.lineTo(...points[4]);
        g.lineTo(...points[1]);
        g.lineTo(...points[3]);
        g.lineTo(...points[0]);
        g.strokePath();
        g.strokeCircle(cx, cy, r);
        break;
      }

      // ── Floor 13: Lizards (sandstone) ─────────────────────────────
      case 'sand': {
        g.fillStyle(0xc8a858, 0.55);
        g.fillEllipse(cx, cy, tileSize * 0.65, tileSize * 0.35);
        g.fillStyle(0xe8d088, 0.4);
        for (let i = 0; i < 5; i += 1) g.fillCircle(cx + (rng() - 0.5) * 22, cy + (rng() - 0.5) * 12, 0.8 + rng() * 1.3);
        break;
      }
      case 'hieroglyph': {
        g.lineStyle(1, 0x3a2810, 0.80);
        const strokes = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < strokes; i += 1) {
          const x1 = cx - 8 + rng() * 16, y1 = cy - 6 + rng() * 12;
          const x2 = x1 + (rng() - 0.5) * 6, y2 = y1 + 3 + rng() * 4;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
        }
        g.fillStyle(0x55432a, 0.7);
        g.fillCircle(cx + (rng() - 0.5) * 10, cy + (rng() - 0.5) * 8, 1.2);
        break;
      }
      case 'scaleShed': {
        g.fillStyle(0x4a5a2a, 0.7);
        for (let i = 0; i < 5; i += 1) {
          const a = rng() * Math.PI * 2;
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillEllipse(x, y, 3.5, 2);
        }
        g.fillStyle(0x6a7a3a, 0.55);
        for (let i = 0; i < 3; i += 1) g.fillEllipse(cx + (rng() - 0.5) * 20, cy + (rng() - 0.5) * 18, 2.5, 1.3);
        break;
      }

      // ── Floor 14: Vampires (gothic) ───────────────────────────────
      case 'petals': {
        g.fillStyle(0x5a0a10, 0.85);
        for (let i = 0; i < 6; i += 1) {
          const a = rng() * Math.PI * 2;
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillEllipse(x, y, 2.5, 1.3);
        }
        g.fillStyle(0x8a1820, 0.65);
        for (let i = 0; i < 3; i += 1) g.fillEllipse(cx + (rng() - 0.5) * 18, cy + (rng() - 0.5) * 16, 2, 1);
        break;
      }
      case 'candleWax': {
        g.fillStyle(0x080408, 0.7);
        g.fillCircle(cx, cy - 2, 2.5);
        g.fillStyle(0xc8b8a0, 0.85);
        g.fillCircle(cx, cy, 3);
        g.fillRect(cx - 0.8, cy + 2, 1.6, 5);
        g.fillStyle(0xe8d8b0, 0.75);
        g.fillEllipse(cx, cy + 3, 6, 2);
        for (let i = 0; i < 3; i += 1) {
          g.fillStyle(0xc8b8a0, 0.7);
          g.fillCircle(cx + (rng() - 0.5) * 12, cy + 4 + rng() * 4, 0.8 + rng() * 0.6);
        }
        break;
      }

      // ── Floor 15: Spiders (webs) ──────────────────────────────────
      case 'webPatch': {
        g.lineStyle(1, 0xdcd8c0, 0.5);
        const origin = { x: cx + (rng() - 0.5) * 6, y: cy + (rng() - 0.5) * 6 };
        const r = tileSize * 0.38;
        for (let i = 0; i < 5; i += 1) {
          const a = (i / 5) * Math.PI * 2;
          g.beginPath();
          g.moveTo(origin.x, origin.y);
          g.lineTo(origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r);
          g.strokePath();
        }
        for (let ring = 1; ring <= 3; ring += 1) {
          g.beginPath();
          const rr = r * (ring / 3);
          g.strokeCircle(origin.x, origin.y, rr);
        }
        break;
      }
      case 'eggSac': {
        g.fillStyle(0x2a2418, 0.75);
        g.fillEllipse(cx, cy, 10, 8);
        g.fillStyle(0xb0a87a, 0.88);
        g.fillEllipse(cx, cy - 1, 8, 6);
        g.fillStyle(0xe8dcb0, 0.5);
        g.fillEllipse(cx - 1.5, cy - 2, 3, 2);
        g.lineStyle(0.8, 0x5a5236, 0.7);
        g.strokeEllipse(cx, cy, 10, 8);
        break;
      }
      case 'chitin': {
        g.fillStyle(0x1a120a, 0.85);
        for (let i = 0; i < 3; i += 1) {
          const a = rng() * Math.PI;
          const x = cx + (rng() - 0.5) * 18, y = cy + (rng() - 0.5) * 18;
          g.fillTriangle(
            x, y,
            x + Math.cos(a) * 6, y + Math.sin(a) * 6,
            x + Math.cos(a + 0.7) * 4, y + Math.sin(a + 0.7) * 4,
          );
        }
        break;
      }

      // ── Floor 18: Dragons (hoard) ─────────────────────────────────
      case 'goldPile': {
        g.fillStyle(0x5a4812, 0.65);
        g.fillEllipse(cx, cy + 2, tileSize * 0.5, tileSize * 0.22);
        for (let i = 0; i < 10; i += 1) {
          const x = cx + (rng() - 0.5) * 24, y = cy + (rng() - 0.5) * 14;
          g.fillStyle(0xffc848, 0.92);
          g.fillCircle(x, y, 1.6 + rng() * 0.8);
          g.fillStyle(0xfff0a0, 0.65);
          g.fillCircle(x - 0.5, y - 0.5, 0.6);
        }
        break;
      }
      case 'dragonScale': {
        g.fillStyle(0x3a1a1a, 0.85);
        for (let i = 0; i < 4; i += 1) {
          const x = cx + (rng() - 0.5) * 22, y = cy + (rng() - 0.5) * 22;
          g.fillEllipse(x, y, 4, 3);
          g.fillStyle(0x6a2a28, 0.6);
          g.fillEllipse(x - 0.5, y - 0.5, 2.5, 1.5);
          g.fillStyle(0x3a1a1a, 0.85);
        }
        break;
      }

      // ── Floor 19: Behemoths ───────────────────────────────────────
      case 'brokenPillar': {
        const w = tileSize * 0.42, h = tileSize * 0.30;
        g.fillStyle(0x3a3a42, 0.88);
        g.fillRect(cx - w / 2, cy - h / 2, w, h);
        g.fillStyle(0x55555e, 0.7);
        g.fillRect(cx - w / 2 + 2, cy - h / 2, w - 4, 3);
        g.fillStyle(0x1a1a22, 0.8);
        g.fillTriangle(
          cx - w / 2, cy - h / 2,
          cx - w / 2 + 5, cy - h / 2 - 3,
          cx + w / 2, cy - h / 2,
        );
        g.lineStyle(1, 0x0a0a10, 0.7);
        g.strokeRect(cx - w / 2, cy - h / 2, w, h);
        break;
      }

      default:
        break;
    }
  }

  function drawWeb(gx, gy, corner, cfg) {
    const ax = gx * tileSize + (corner.sx < 0 ? 1 : tileSize - 1);
    const ay = gy * tileSize + (corner.sy < 0 ? 1 : tileSize - 1);
    const size = tileSize * 0.55;
    const baseAng = Math.atan2(-corner.sy, -corner.sx);
    const spread = Math.PI * 0.48;
    decorLayer.lineStyle(1, cfg.color, cfg.alpha);
    for (let i = 0; i < 5; i += 1) {
      const t = i / 4;
      const ang = baseAng - spread / 2 + spread * t;
      decorLayer.beginPath();
      decorLayer.moveTo(ax, ay);
      decorLayer.lineTo(ax + Math.cos(ang) * size, ay + Math.sin(ang) * size);
      decorLayer.strokePath();
    }
    for (let ring = 1; ring <= 2; ring += 1) {
      const r = size * (0.32 * ring + 0.18);
      decorLayer.lineStyle(1, cfg.color, cfg.alpha * 0.65);
      decorLayer.beginPath();
      decorLayer.arc(ax, ay, r, baseAng - spread / 2, baseAng + spread / 2, false);
      decorLayer.strokePath();
    }
  }

  // ── Pit (level exit) ────────────────────────────────────────────────
  function clearPit() {
    if (pitTween) { pitTween.stop(); pitTween = null; }
    for (const o of pitObjects) o.destroy();
    pitObjects = [];
  }

  function renderPit(gx, gy) {
    clearPit();
    const pcfg = theme.pit;
    const cx = gx * tileSize + tileSize / 2;
    const cy = gy * tileSize + tileSize / 2;
    const baseR = tileSize;

    const rim = scene.add.graphics();
    rim.lineStyle(2, pcfg.rimHighlight.color, pcfg.rimHighlight.alpha);
    rim.beginPath();
    rim.arc(cx, cy, baseR * 0.47, Math.PI * 0.85, Math.PI * 1.95, false);
    rim.strokePath();
    rim.lineStyle(2, 0x000000, 0.55);
    rim.beginPath();
    rim.arc(cx, cy, baseR * 0.47, 0, Math.PI * 0.85, false);
    rim.strokePath();
    pitLayer.add(rim);
    pitObjects.push(rim);

    for (const ring of pcfg.rings) {
      const g = scene.add.graphics();
      g.fillStyle(ring.color, ring.alpha);
      g.fillCircle(cx, cy, baseR * ring.r);
      pitLayer.add(g);
      pitObjects.push(g);
    }

    const glow = scene.add.graphics();
    glow.fillStyle(pcfg.innerGlow.color, pcfg.innerGlow.alpha);
    glow.fillCircle(cx, cy, baseR * 0.09);
    pitLayer.add(glow);
    pitObjects.push(glow);
    pitTween = scene.tweens.add({
      targets: glow,
      alpha: { from: pcfg.innerGlow.alpha * 0.4, to: pcfg.innerGlow.alpha * 1.3 },
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    });

    const rubbleRng = mulberry32(gx * 7919 + gy * 104729 + level);
    for (let i = 0; i < pcfg.rubbleCount; i += 1) {
      const ang = rubbleRng() * Math.PI * 2;
      const dist = baseR * (0.47 + rubbleRng() * 0.07);
      const rx = cx + Math.cos(ang) * dist;
      const ry = cy + Math.sin(ang) * dist;
      const rock = scene.add.rectangle(rx, ry,
        2.5 + rubbleRng() * 3.5, 1.8 + rubbleRng() * 2.2, pcfg.rubbleColor);
      rock.rotation = rubbleRng() * Math.PI;
      pitLayer.add(rock);
      pitObjects.push(rock);
    }

    pitLayer.setVisible(false);
  }

  function showPit(visible) { pitLayer.setVisible(Boolean(visible)); }

  // ── Rope anchor (spawn tile, hints "use rope here to climb up") ────
  function clearRopeAnchor() {
    for (const t of ropeTweens) t.stop();
    ropeTweens = [];
    for (const o of ropeObjects) o.destroy();
    ropeObjects = [];
  }

  function renderRopeAnchor(gx, gy) {
    clearRopeAnchor();
    const p = theme.palette;
    const cx = gx * tileSize + tileSize / 2;
    const cy = gy * tileSize + tileSize / 2;

    // Ceiling hole (oval) at top of tile, with darker outer ring + brighter
    // interior suggesting daylight / upper floor above.
    const holeCx = cx;
    const holeCy = cy - tileSize * 0.22;
    const holeW = tileSize * 0.60;
    const holeH = tileSize * 0.26;

    const ceiling = scene.add.graphics();
    // Outer stone rim (shadowed)
    ceiling.fillStyle(p.wallShadow, 0.95);
    ceiling.fillEllipse(holeCx, holeCy + 1, holeW + 4, holeH + 3);
    // Interior (dark shaft going up)
    ceiling.fillStyle(0x020202, 0.95);
    ceiling.fillEllipse(holeCx, holeCy, holeW, holeH);
    // Rim highlight along the top half of the ellipse (suggests stone lip)
    ceiling.lineStyle(2, p.wallEdge, 0.85);
    ceiling.beginPath();
    const rimSegs = 24;
    for (let i = 0; i <= rimSegs; i += 1) {
      const t = i / rimSegs;
      const ang = Math.PI + Math.PI * t;
      const rx = holeCx + Math.cos(ang) * (holeW / 2);
      const ry = holeCy + Math.sin(ang) * (holeH / 2);
      if (i === 0) ceiling.moveTo(rx, ry); else ceiling.lineTo(rx, ry);
    }
    ceiling.strokePath();
    // Darker lip on the front (bottom) edge
    ceiling.lineStyle(1.5, 0x000000, 0.75);
    ceiling.beginPath();
    for (let i = 0; i <= rimSegs; i += 1) {
      const t = i / rimSegs;
      const ang = Math.PI * 2 - Math.PI * t;
      const rx = holeCx + Math.cos(ang) * (holeW / 2);
      const ry = holeCy + Math.sin(ang) * (holeH / 2);
      if (i === 0) ceiling.moveTo(rx, ry); else ceiling.lineTo(rx, ry);
    }
    ceiling.strokePath();
    ropeLayer.add(ceiling);
    ropeObjects.push(ceiling);

    // Light beam inside hole (pulsing — soft suggestion of "way up")
    const beam = scene.add.graphics();
    beam.fillStyle(0xffe8a0, 0.35);
    beam.fillEllipse(holeCx, holeCy, holeW * 0.55, holeH * 0.55);
    beam.fillStyle(0xfff6d0, 0.45);
    beam.fillEllipse(holeCx, holeCy - 1, holeW * 0.28, holeH * 0.28);
    ropeLayer.add(beam);
    ropeObjects.push(beam);
    ropeTweens.push(scene.tweens.add({
      targets: beam,
      alpha: { from: 0.55, to: 1.0 },
      duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    }));

    // Hanging rope — inside a container so we can sway it from the top.
    const ropeTopX = holeCx;
    const ropeTopY = holeCy + holeH * 0.1;
    const ropeLen = tileSize * 0.70;
    const ropeEndY = ropeTopY + ropeLen;

    const ropeContainer = scene.add.container(ropeTopX, ropeTopY);
    const ropeGfx = scene.add.graphics();
    // Rope body — two-toned for volume (highlight left, shadow right)
    ropeGfx.fillStyle(0x5a3f1f, 1);
    ropeGfx.fillRect(0, 0, 2, ropeLen);
    ropeGfx.fillStyle(0x9a7842, 1);
    ropeGfx.fillRect(-2, 0, 2, ropeLen);
    // Coil knots (three wraps for silhouette readability)
    const knotCount = 3;
    for (let i = 0; i < knotCount; i += 1) {
      const ky = (ropeLen / (knotCount + 1)) * (i + 1);
      ropeGfx.fillStyle(0x7a5a2a, 1);
      ropeGfx.fillEllipse(0, ky, 5.2, 2.6);
      ropeGfx.lineStyle(0.7, 0x2a1a08, 0.9);
      ropeGfx.strokeEllipse(0, ky, 5.2, 2.6);
      ropeGfx.fillStyle(0xc29858, 0.55);
      ropeGfx.fillEllipse(-0.6, ky - 0.6, 3.2, 1.1);
    }
    // Frayed bottom end (a small cone of threads)
    ropeGfx.lineStyle(1, 0x7a5a2a, 0.85);
    for (let i = -2; i <= 2; i += 1) {
      ropeGfx.beginPath();
      ropeGfx.moveTo(0, ropeLen);
      ropeGfx.lineTo(i * 1.4, ropeLen + 3 + Math.abs(i));
      ropeGfx.strokePath();
    }
    ropeContainer.add(ropeGfx);
    ropeLayer.add(ropeContainer);
    ropeObjects.push(ropeContainer);

    // Gentle sway (rotate container around its top anchor)
    ropeTweens.push(scene.tweens.add({
      targets: ropeContainer,
      rotation: { from: -0.05, to: 0.05 },
      duration: 2400, yoyo: true, repeat: -1, ease: 'Sine.inOut',
    }));

    // Small drifting dust-from-above inside the beam
    const dustCount = 3;
    for (let i = 0; i < dustCount; i += 1) {
      const d = scene.add.circle(
        holeCx + (Math.random() - 0.5) * holeW * 0.4,
        holeCy + (Math.random() - 0.3) * holeH * 0.4,
        0.8 + Math.random() * 0.6,
        0xffe8a0, 0.7,
      );
      ropeLayer.add(d);
      ropeObjects.push(d);
      ropeTweens.push(scene.tweens.add({
        targets: d,
        y: d.y + tileSize * 0.45,
        alpha: { from: 0.9, to: 0 },
        duration: 2200 + Math.random() * 1500,
        repeat: -1,
        delay: Math.random() * 1800,
        ease: 'Sine.out',
      }));
    }

    ropeLayer.setVisible(false);
  }

  function showRopeAnchor(visible) { ropeLayer.setVisible(Boolean(visible)); }

  // ── Ambient particles ───────────────────────────────────────────────
  function rebuildParticles(dungeonW, dungeonH) {
    for (const s of particleSprites) {
      if (s.tween) s.tween.stop();
      s.obj.destroy();
    }
    particleSprites.length = 0;
    const pc = theme.particles;
    if (!pc) return;
    const worldW = dungeonW * tileSize;
    const worldH = dungeonH * tileSize;
    const mode = pc.mode || 'drift';

    for (let i = 0; i < pc.count; i += 1) {
      const startX = Math.random() * worldW;
      const startY = Math.random() * worldH;
      const size = pc.size.min + Math.random() * (pc.size.max - pc.size.min);
      const sprite = scene.add.circle(startX, startY, size, pc.color, 0);
      particleLayer.add(sprite);
      const alpha = pc.alpha.min + Math.random() * (pc.alpha.max - pc.alpha.min);
      const speed = pc.speed.min + Math.random() * (pc.speed.max - pc.speed.min);

      let tween;
      if (mode === 'fall') {
        sprite.alpha = alpha;
        tween = scene.tweens.add({
          targets: sprite,
          y: startY + worldH + tileSize,
          duration: (worldH / speed) * 120 + Math.random() * 800,
          repeat: -1,
          delay: Math.random() * 3000,
          onRepeat: () => {
            sprite.x = Math.random() * worldW;
            sprite.y = -tileSize;
          },
          ease: 'Linear',
        });
      } else if (mode === 'rise') {
        sprite.alpha = 0;
        tween = scene.tweens.add({
          targets: sprite,
          y: startY - tileSize * 3,
          alpha: { from: alpha, to: 0 },
          duration: 2800 + Math.random() * 2200,
          repeat: -1,
          delay: Math.random() * 2500,
          onRepeat: () => {
            sprite.x = Math.random() * worldW;
            sprite.y = Math.random() * worldH;
            sprite.alpha = 0;
          },
          ease: 'Sine.out',
        });
      } else if (mode === 'erratic') {
        sprite.alpha = alpha;
        const jitter = () => {
          const nx = sprite.x + (Math.random() - 0.5) * 50;
          const ny = sprite.y + (Math.random() - 0.5) * 50;
          scene.tweens.add({
            targets: sprite, x: nx, y: ny,
            duration: 350 + Math.random() * 450,
            ease: 'Sine.inOut',
            onComplete: jitter,
          });
        };
        jitter();
        tween = null;
      } else {
        // drift (default)
        const driftX = (Math.random() - 0.5) * speed;
        const driftY = -Math.abs(Math.random() * speed * 0.8) - 2;
        tween = scene.tweens.add({
          targets: sprite,
          x: startX + driftX * 6,
          y: startY + driftY * 6,
          alpha: { from: 0, to: alpha },
          duration: 4500 + Math.random() * 5500,
          yoyo: true, repeat: -1, ease: 'Sine.inOut',
        });
      }
      particleSprites.push({ obj: sprite, tween });
    }
  }

  // ── Vignette + ambient tint (screen-space overlays) ─────────────────
  function ensureVignetteRT() {
    const cam = scene.cameras.main;
    const w = Math.max(1, Math.floor(cam.width));
    const h = Math.max(1, Math.floor(cam.height));
    if (!vignetteBrush) vignetteBrush = scene.make.graphics({ add: false });
    if (!vignetteRT) {
      vignetteRT = scene.add.renderTexture(0, 0, w, h)
        .setScrollFactor(0).setOrigin(0, 0).setDepth(120);
    } else if (vignetteRT.width !== w || vignetteRT.height !== h) {
      vignetteRT.setSize(w, h);
    }
  }

  function rebuildVignette() {
    const cam = scene.cameras.main;
    const w = cam.width, h = cam.height;
    const p = theme.palette;
    ambientTint.clear();
    ambientTint.fillStyle(p.ambientTint, p.ambientTintAlpha);
    ambientTint.fillRect(0, 0, w, h);
    ensureVignetteRT();
    // Actual vignette gradient + halo is painted each frame by
    // repaintVignetteScreenSpace from updateDarkness.
  }

  // Composes the corner-gradient vignette onto the screen-space RT, then
  // carves a soft halo centred on the player's screen position whenever
  // there's an effective light radius. This guarantees that the area around
  // the player is visible even at the edges of the dungeon, where the camera
  // clamps and the player ends up under the vignette's dark band.
  function repaintVignetteScreenSpace(playerScreenX, playerScreenY, haloRadius) {
    ensureVignetteRT();
    const cam = scene.cameras.main;
    const w = cam.width, h = cam.height;
    const p = theme.palette;
    const a = p.vignetteAlpha;
    const bandH = h * 0.38, bandW = w * 0.32;

    const g = vignetteBrush;
    g.clear();
    g.fillGradientStyle(0, 0, 0, 0, a, a, 0, 0); g.fillRect(0, 0, w, bandH);
    g.fillGradientStyle(0, 0, 0, 0, 0, 0, a, a); g.fillRect(0, h - bandH, w, bandH);
    g.fillGradientStyle(0, 0, 0, 0, a, 0, a, 0); g.fillRect(0, 0, bandW, h);
    g.fillGradientStyle(0, 0, 0, 0, 0, a, 0, a); g.fillRect(w - bandW, 0, bandW, h);

    vignetteRT.clear();
    vignetteRT.draw(g);

    if (haloRadius > 8) {
      ensureLightBrush();
      const b = lightBrushG;
      b.clear();
      const falloff = haloRadius * 1.5;
      b.fillStyle(0xffffff, 0.20); b.fillCircle(playerScreenX, playerScreenY, falloff);
      b.fillStyle(0xffffff, 0.55); b.fillCircle(playerScreenX, playerScreenY, (haloRadius + falloff) / 2);
      b.fillStyle(0xffffff, 0.98); b.fillCircle(playerScreenX, playerScreenY, haloRadius);
      vignetteRT.erase(b);
    }
  }

  scene.scale.on('resize', rebuildVignette);

  // ── Darkness overlay ────────────────────────────────────────────────
  function ensureLightBrush() {
    if (!lightBrushG) lightBrushG = scene.make.graphics({ add: false });
  }

  function setWorldSize(dungeonW, dungeonH) {
    ensureLightBrush();
    const w = dungeonW * tileSize;
    const h = dungeonH * tileSize;
    if (darknessRT) darknessRT.destroy();
    darknessRT = scene.add.renderTexture(0, 0, w, h);
    darknessRT.setOrigin(0, 0);
    darknessRT.setDepth(110);
    lastDarkPx = -9e9;
    lastDarkPy = -9e9;
  }

  function addLightSpell(id, radiusTiles, durationMs) {
    activeLightSpells.push({
      id,
      initialRadius: radiusTiles * tileSize,
      startTime: scene.time.now,
      duration: durationMs,
    });
  }

  function addAreaLight(id, x, y, radiusTiles, durationMs) {
    activeAreaLights.push({
      id,
      x, y,
      radius: Math.max(0, Number(radiusTiles) || 0) * tileSize,
      startTime: scene.time.now,
      duration: Math.max(1, Number(durationMs) || 1),
    });
    lastDarkUpdate = 0;
  }
  function removeAreaLight(id) {
    activeAreaLights = activeAreaLights.filter((l) => l.id !== id);
    lastDarkUpdate = 0;
  }
  function clearAreaLights() {
    activeAreaLights = [];
    lastDarkUpdate = 0;
  }

  function addTransientLight(x, y, radiusTiles, durationMs, opts = {}) {
    transientLights.push({
      x, y,
      radius: Math.max(0, Number(radiusTiles) || 0) * tileSize,
      startTime: scene.time.now,
      duration: Math.max(1, Number(durationMs) || 1),
      peakAlpha: Number.isFinite(opts.peakAlpha) ? opts.peakAlpha : 1.0,
    });
    // Force redraw so the transient shows up immediately.
    lastDarkUpdate = 0;
  }

  function setEquipmentLight(radiusTiles, durationMs = 0, elapsedMs = 0) {
    equipmentLightRadiusPx = Math.max(0, Number(radiusTiles) || 0) * tileSize;
    equipmentLightDurationMs = Math.max(0, Number(durationMs) || 0);
    const sceneNow = Number(scene.time && scene.time.now) || 0;
    equipmentLightStartTime = equipmentLightDurationMs > 0
      ? (sceneNow - Math.max(0, Number(elapsedMs) || 0))
      : 0;
    // Force a redraw on next updateDarkness even if the player hasn't moved.
    lastDarkUpdate = 0;
  }

  function paintLightAt(x, y, coreRadius, falloffRadius) {
    if (coreRadius <= 0) return;
    ensureLightBrush();
    if (!lightBrushG || !darknessRT) return;
    const g = lightBrushG;
    g.clear();
    // Paint outside-in so the opaque core lands on top and fully clears the
    // darkness within `coreRadius`, while the outer halo fades softly.
    g.fillStyle(0xffffff, 0.18); g.fillCircle(x, y, falloffRadius);
    g.fillStyle(0xffffff, 0.45); g.fillCircle(x, y, (coreRadius + falloffRadius) / 2);
    g.fillStyle(0xffffff, 0.98); g.fillCircle(x, y, coreRadius);
    darknessRT.erase(g);
  }

  function updateDarkness(nowMs, px, py) {
    if (!darknessRT) return;
    // Drop expired spells / transient lights / area lights.
    activeLightSpells = activeLightSpells.filter((l) => (nowMs - l.startTime) < l.duration);
    transientLights = transientLights.filter((l) => (nowMs - l.startTime) < l.duration);
    activeAreaLights = activeAreaLights.filter((l) => (nowMs - l.startTime) < l.duration);

    // When transient lights are flashing we need smooth per-frame redraws so
    // the light trail animates properly. We also redraw when the camera
    // scrolls even if the player is still — otherwise the screen-space halo
    // on the vignette would lag behind the camera smoothing. Otherwise
    // throttle to ~8 Hz.
    const cam = scene.cameras.main;
    const dx = px - lastDarkPx;
    const dy = py - lastDarkPy;
    const cdx = cam.scrollX - lastCamSx;
    const cdy = cam.scrollY - lastCamSy;
    const moved = (dx * dx + dy * dy) > 0.5 || (cdx * cdx + cdy * cdy) > 0.5;
    const hasTransient = transientLights.length > 0;
    if (!moved && !hasTransient && (nowMs - lastDarkUpdate < 120)) return;
    lastDarkPx = px; lastDarkPy = py; lastDarkUpdate = nowMs;
    lastCamSx = cam.scrollX; lastCamSy = cam.scrollY;

    // Compute effective player-centred radius = max(base, equipment, spells).
    // Spells keep their full radius for 75% of the duration and then fade
    // linearly to 0. Equipment lights (torch, lantern…) stay at their full
    // radius for the whole duration and hard-cut to 0 when they burn out —
    // the slot icon shows the visual progression separately.
    const FADE_START_T = 0.75;
    const spellEnvelope = (t) => {
      if (!(t > 0)) return 1;
      if (t >= 1) return 0;
      if (t <= FADE_START_T) return 1;
      return (1 - t) / (1 - FADE_START_T);
    };
    const baseCore = BASE_LIGHT_TILES * tileSize;
    let coreR = baseCore;
    if (equipmentLightRadiusPx > 0) {
      let eqR = equipmentLightRadiusPx;
      if (equipmentLightDurationMs > 0) {
        const t = (nowMs - equipmentLightStartTime) / equipmentLightDurationMs;
        eqR = t >= 1 ? 0 : equipmentLightRadiusPx;
      }
      if (eqR > coreR) coreR = eqR;
    }
    for (const spell of activeLightSpells) {
      const t = (nowMs - spell.startTime) / spell.duration;
      const sR = spell.initialRadius * spellEnvelope(t);
      if (sR > coreR) coreR = sR;
    }

    darknessRT.clear();
    darknessRT.fill(0x000000, DARKNESS_ALPHA);
    paintLightAt(px, py, coreR, coreR * 1.5);

    // World-space area lights (fire fields etc.) — steady radius with a
    // soft tail at the end, painted at their stored world coordinates.
    for (const al of activeAreaLights) {
      const t = (nowMs - al.startTime) / al.duration;
      const r = al.radius * spellEnvelope(t);
      if (r > 8) paintLightAt(al.x, al.y, r, r * 1.4);
    }
    // Transient lights stack on top of the main player-centred light. Each
    // one follows a fast-up / slow-down envelope so flashes feel punchy.
    for (const tl of transientLights) {
      const age = nowMs - tl.startTime;
      const u = age / tl.duration;
      const env = u < 0.18 ? (u / 0.18) : Math.max(0, 1 - (u - 0.18) / 0.82);
      const r = tl.radius * env * tl.peakAlpha;
      if (r > 8) paintLightAt(tl.x, tl.y, r, r * 1.4);
    }

    // Repaint the screen-space vignette with a matching halo at the player's
    // screen position. Without this, the corner gradients still darken the
    // player's surroundings whenever the camera clamps at the dungeon edge.
    const screenX = (px - cam.scrollX) * cam.zoom;
    const screenY = (py - cam.scrollY) * cam.zoom;
    repaintVignetteScreenSpace(screenX, screenY, coreR * cam.zoom);
  }

  function clearLightSpells() { activeLightSpells = []; }

  function rebuildAll(currentMap, dungeonW, dungeonH, pitTile, spawnTile) {
    applyTilePalette(currentMap, dungeonW, dungeonH);
    rebuildWallAccents(currentMap, dungeonW, dungeonH);
    rebuildDecorations(currentMap, dungeonW, dungeonH, pitTile, spawnTile);
    rebuildParticles(dungeonW, dungeonH);
    if (pitTile) renderPit(pitTile.gx, pitTile.gy);
    if (spawnTile) renderRopeAnchor(spawnTile.gx, spawnTile.gy);
    setWorldSize(dungeonW, dungeonH);
  }

  return {
    setThemeForLevel,
    rebuildAll,
    renderPit,
    showPit,
    renderRopeAnchor,
    showRopeAnchor,
    rebuildVignette,
    setWorldSize,
    addLightSpell,
    setEquipmentLight,
    addTransientLight,
    addAreaLight,
    removeAreaLight,
    clearAreaLights,
    updateDarkness,
    clearLightSpells,
  };
}
