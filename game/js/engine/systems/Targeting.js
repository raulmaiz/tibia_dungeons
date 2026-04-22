// Ranged targeting helpers. Given player grid position + map walkability,
// picks the first enemy along a cardinal direction OR the nearest enemy
// within a Chebyshev radius + line-of-sight check.
//
// Extracted from game.engine.js Phase 4 (Combat prep). Pure w.r.t. engine
// state aside from captured deps.

/** @typedef {import('../../types.js').Creature} Creature */

/**
 * @typedef {object} TargetingDeps
 * @property {any} playerState
 * @property {(gx: number, gy: number) => boolean} isWalkableTile
 * @property {(gx: number, gy: number) => boolean} isWallTile
 * @property {(gx: number, gy: number) => Creature | null} enemyCreatureAt
 * @property {() => Creature[]} aliveCreatures
 */

/**
 * Build ranged-targeting helpers bound to engine state.
 *
 * @param {TargetingDeps} deps
 */
export function setupTargeting(deps) {
  const { playerState, isWalkableTile, isWallTile, enemyCreatureAt, aliveCreatures } = deps;

  /**
   * Walk outward from the player in (dx, dy) until we hit a wall, a
   * non-walkable tile, or the range limit. Returns the first enemy
   * creature encountered (null otherwise).
   */
  function findRangedTargetInDirection(dx, dy, rangeTiles) {
    const maxRange = Math.max(1, Math.floor(Number(rangeTiles) || 1));
    for (let step = 1; step <= maxRange; step += 1) {
      const tx = playerState.gridX + dx * step;
      const ty = playerState.gridY + dy * step;
      if (!isWalkableTile(tx, ty)) break;
      if (isWallTile(tx, ty)) break;
      const c = enemyCreatureAt(tx, ty);
      if (c) return c;
    }
    return null;
  }

  /**
   * Chebyshev-step line between two tiles: returns false if any wall
   * intervenes between from and to (exclusive of endpoints).
   */
  function hasRangedLineOfSight(fromX, fromY, toX, toY) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const sx = Math.round(fromX + dx * t);
      const sy = Math.round(fromY + dy * t);
      if (sx === toX && sy === toY) break;
      if (isWallTile(sx, sy)) return false;
    }
    return true;
  }

  /**
   * Closest enemy within `rangeTiles` Chebyshev distance that has
   * line-of-sight from the player. Null if nothing eligible.
   */
  function findNearestRangedTarget(rangeTiles) {
    const maxRange = Math.max(1, Math.floor(Number(rangeTiles) || 1));
    const candidates = aliveCreatures()
      .filter((c) => {
        const dist = Math.max(Math.abs(c.gx - playerState.gridX), Math.abs(c.gy - playerState.gridY));
        if (dist <= 0 || dist > maxRange) return false;
        return hasRangedLineOfSight(playerState.gridX, playerState.gridY, c.gx, c.gy);
      })
      .sort((a, b) => {
        const da = Math.max(Math.abs(a.gx - playerState.gridX), Math.abs(a.gy - playerState.gridY));
        const db = Math.max(Math.abs(b.gx - playerState.gridX), Math.abs(b.gy - playerState.gridY));
        return da - db;
      });
    return candidates[0] || null;
  }

  return { findRangedTargetInDirection, hasRangedLineOfSight, findNearestRangedTarget };
}
