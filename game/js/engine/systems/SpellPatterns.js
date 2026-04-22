// Tile-generation helpers for spells + creature abilities.
//
// All functions are pure: given a caster position (gridX, gridY,
// facingFrame) or explicit points, they return an array of
// { gx, gy } tiles. No closure state, no scene.
//
// Extracted from game.engine.js Phase 4 (Combat prep). The engine
// keeps the small `spellAttackPattern(spell)` dispatcher local because
// it depends on SPELL_FX_OVERRIDES + inferSpellRange.

/**
 * @typedef {object} Pos
 * @property {number} gridX
 * @property {number} gridY
 * @property {number} facingFrame   - 0 S, 1 E, 2 N, 3 W
 */

// ── Player-facing patterns ────────────────────────────────────────────

/**
 * 3 tiles directly in front of the caster. 0 = south, 2 = north, 1 = east, else west.
 * @param {Pos} p
 */
export function frontSweepTiles(p) {
  const { gridX, gridY, facingFrame } = p;
  if (facingFrame === 0) return [{ gx: gridX - 1, gy: gridY + 1 }, { gx: gridX, gy: gridY + 1 }, { gx: gridX + 1, gy: gridY + 1 }];
  if (facingFrame === 2) return [{ gx: gridX - 1, gy: gridY - 1 }, { gx: gridX, gy: gridY - 1 }, { gx: gridX + 1, gy: gridY - 1 }];
  if (facingFrame === 1) return [{ gx: gridX + 1, gy: gridY - 1 }, { gx: gridX + 1, gy: gridY }, { gx: gridX + 1, gy: gridY + 1 }];
  return [{ gx: gridX - 1, gy: gridY - 1 }, { gx: gridX - 1, gy: gridY }, { gx: gridX - 1, gy: gridY + 1 }];
}

/** @param {Pos} p */
export function frontSingleTile(p) {
  const { gridX, gridY, facingFrame } = p;
  if (facingFrame === 0) return { gx: gridX, gy: gridY + 1 };
  if (facingFrame === 2) return { gx: gridX, gy: gridY - 1 };
  if (facingFrame === 1) return { gx: gridX + 1, gy: gridY };
  return { gx: gridX - 1, gy: gridY };
}

/**
 * Cone expanding away from the caster. Depth rows, widening by 1 tile per row.
 * @param {Pos} p
 * @param {number} [depth]
 */
export function frontConeTiles(p, depth = 3) {
  const { gridX, gridY, facingFrame } = p;
  const tiles = [];
  for (let i = 1; i <= depth; i += 1) {
    const spread = Math.min(2, i - 1);
    for (let s = -spread; s <= spread; s += 1) {
      let gx = gridX;
      let gy = gridY;
      if (facingFrame === 0) { gx += s; gy += i; }
      else if (facingFrame === 2) { gx += s; gy -= i; }
      else if (facingFrame === 1) { gx += i; gy += s; }
      else { gx -= i; gy += s; }
      tiles.push({ gx, gy });
    }
  }
  return tiles;
}

/**
 * Straight beam of length `len` from the caster in the facing direction.
 * @param {Pos} p
 * @param {number} [len]
 */
export function frontBeamTiles(p, len = 5) {
  const { gridX, gridY, facingFrame } = p;
  const tiles = [];
  for (let i = 1; i <= len; i += 1) {
    let gx = gridX;
    let gy = gridY;
    if (facingFrame === 0) gy += i;
    else if (facingFrame === 2) gy -= i;
    else if (facingFrame === 1) gx += i;
    else gx -= i;
    tiles.push({ gx, gy });
  }
  return tiles;
}

/**
 * Filled square ring around the caster. Excludes the caster tile.
 * @param {Pos} p
 * @param {number} [radius]
 */
export function aroundCasterTiles(p, radius = 1) {
  const { gridX, gridY } = p;
  const tiles = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      tiles.push({ gx: gridX + dx, gy: gridY + dy });
    }
  }
  return tiles;
}

/**
 * Only the perimeter (hollow ring) at distance `radius` in chebyshev metric.
 * @param {Pos} p
 * @param {number} radius
 */
export function ringAroundCasterTiles(p, radius) {
  const { gridX, gridY } = p;
  const r = Math.max(1, Math.floor(Number(radius) || 1));
  const tiles = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      tiles.push({ gx: gridX + dx, gy: gridY + dy });
    }
  }
  return tiles;
}

/**
 * Plus pattern landing `reach` tiles ahead (centre + 4 cardinals).
 * @param {Pos} p
 * @param {number} [reach]
 */
export function frontPlusTiles(p, reach = 2) {
  const { gridX, gridY, facingFrame } = p;
  let cx = gridX;
  let cy = gridY;
  const rk = Math.max(1, Math.floor(Number(reach) || 1));
  if (facingFrame === 0) cy += rk;
  else if (facingFrame === 2) cy -= rk;
  else if (facingFrame === 1) cx += rk;
  else cx -= rk;
  return [
    { gx: cx, gy: cy },
    { gx: cx - 1, gy: cy },
    { gx: cx + 1, gy: cy },
    { gx: cx, gy: cy - 1 },
    { gx: cx, gy: cy + 1 },
  ];
}

/**
 * Rectangular box extending `depth` rows in front of the caster, `width` wide.
 * @param {Pos} p
 * @param {number} width
 * @param {number} depth
 */
export function frontBoxTiles(p, width, depth) {
  const { gridX, gridY, facingFrame } = p;
  const tiles = [];
  const w = Math.max(1, Math.floor(Number(width) || 3));
  const d = Math.max(1, Math.floor(Number(depth) || 1));
  const half = Math.floor(w / 2);
  for (let row = 1; row <= d; row += 1) {
    for (let c = -half; c <= half; c += 1) {
      let gx = gridX;
      let gy = gridY;
      if (facingFrame === 0) { gx += c; gy += row; }
      else if (facingFrame === 2) { gx += c; gy -= row; }
      else if (facingFrame === 1) { gx += row; gy += c; }
      else { gx -= row; gy += c; }
      tiles.push({ gx, gy });
    }
  }
  return tiles;
}

/**
 * Dispatcher for spell attack patterns. Returns null for projectile
 * patterns (the engine handles those separately).
 *
 * @param {Pos} p
 * @param {{ kind?: string, depth?: number, radius?: number, reach?: number, width?: number } | null} pattern
 */
export function resolvePatternTiles(p, pattern) {
  if (!pattern || pattern.kind === 'projectile') return null;
  switch (pattern.kind) {
    case 'front_sweep': return frontSweepTiles(p);
    case 'beam':        return frontBeamTiles(p, pattern.depth ?? 5);
    case 'cone':        return frontConeTiles(p, pattern.depth ?? 3);
    case 'nova':        return aroundCasterTiles(p, pattern.radius ?? 1);
    case 'ring':        return ringAroundCasterTiles(p, pattern.radius ?? 2);
    case 'plus':        return frontPlusTiles(p, pattern.reach ?? 2);
    case 'front_box':   return frontBoxTiles(p, pattern.width ?? 3, pattern.depth ?? 2);
    default:            return null;
  }
}

// ── Raw geometry helpers ──────────────────────────────────────────────

/**
 * Bresenham line from (x0,y0) to (x1,y1). Guarded against runaway loops.
 * @returns {Array<{ gx: number, gy: number }>}
 */
export function bresenhamLineTiles(x0, y0, x1, y1) {
  const pts = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let guard = 0;
  while (true) {
    guard += 1;
    if (guard > 256) {
      pts.push({ gx: x1, gy: y1 });
      break;
    }
    pts.push({ gx: x, gy: y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx)  { err += dx; y += sy; }
  }
  return pts;
}

/** Filled nova (chebyshev ≤ r) centred at (px, py). */
export function tilesNovaAtPoint(px, py, radius) {
  const r = Math.max(0, Math.floor(Number(radius) || 1));
  const tiles = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      tiles.push({ gx: px + dx, gy: py + dy });
    }
  }
  return tiles;
}

/** 5-tile plus at (px, py). */
export function plusTilesAt(px, py) {
  return [
    { gx: px, gy: py },
    { gx: px - 1, gy: py },
    { gx: px + 1, gy: py },
    { gx: px, gy: py - 1 },
    { gx: px, gy: py + 1 },
  ];
}

/** Hollow square ring at (px, py), chebyshev === r. */
export function ringTilesAt(px, py, radius) {
  const r = Math.max(1, Math.floor(Number(radius) || 2));
  const tiles = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      tiles.push({ gx: px + dx, gy: py + dy });
    }
  }
  return tiles;
}

/** Nova centered on a creature. */
export function tilesNovaAroundCreature(creature, radius, excludeCenter = true) {
  const r = Math.max(0, Math.floor(Number(radius) || 1));
  const cx = creature.gx;
  const cy = creature.gy;
  const tiles = [];
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      if (excludeCenter && dx === 0 && dy === 0) continue;
      tiles.push({ gx: cx + dx, gy: cy + dy });
    }
  }
  return tiles;
}

/**
 * Creature-flavoured cone pointing at the player. Snaps to the dominant
 * cardinal of (px-cx, py-cy). Useful for enemy breath/wave abilities.
 */
export function creatureConeTowardPlayer(creature, playerGridX, playerGridY, depth) {
  const d = Math.max(1, Math.floor(Number(depth) || 3));
  const cx = creature.gx;
  const cy = creature.gy;
  const px = playerGridX - cx;
  const py = playerGridY - cy;
  if (px === 0 && py === 0) return [];
  let sx = 0;
  let sy = 0;
  const ax = Math.abs(px);
  const ay = Math.abs(py);
  if (ax >= ay) sx = Math.sign(px);
  else sy = Math.sign(py);
  const tiles = [];
  for (let i = 1; i <= d; i += 1) {
    const spread = Math.min(2, i - 1);
    for (let k = -spread; k <= spread; k += 1) {
      let gx = cx + sx * i;
      let gy = cy + sy * i;
      if (sx !== 0) gy += k;
      else gx += k;
      tiles.push({ gx, gy });
    }
  }
  return tiles;
}

/**
 * Straight line from creature to player, stopping at the first non-walkable
 * tile. Caller provides the walkability predicate so this module stays pure.
 */
export function lineToPlayerFromCreature(creature, playerGridX, playerGridY, maxLen, isWalkable, isWall) {
  const lim = Math.max(1, Math.floor(Number(maxLen) || 6));
  const line = bresenhamLineTiles(creature.gx, creature.gy, playerGridX, playerGridY);
  if (line.length <= 1) return [{ gx: playerGridX, gy: playerGridY }];
  const out = [];
  for (let i = 1; i < line.length && out.length < lim; i += 1) {
    const p = line[i];
    if (!isWalkable(p.gx, p.gy)) break;
    if (isWall(p.gx, p.gy)) break;
    out.push(p);
    if (p.gx === playerGridX && p.gy === playerGridY) break;
  }
  return out;
}
