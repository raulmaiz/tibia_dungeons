// Creature pathfinding + single-step move helpers. BFS to an adjacent
// tile of a target, wandering, ranged-distance maintenance, flee.
// Stateless aside from the injected deps bag — call into engine grid
// predicates (isWalkable, creatureAt, isOccupiedByActor) and sprite
// orientation / tile-map invalidation callbacks.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

/** @typedef {import('../../types.js').Creature} Creature */

/**
 * @typedef {object} CreatureMovementDeps
 * @property {any} playerState
 * @property {(gx: number) => number} centerX
 * @property {(gy: number) => number} centerY
 * @property {(gx: number, gy: number) => boolean} isWalkable
 * @property {(ax: number, ay: number, bx: number, by: number) => boolean} isCreatureMeleeAdjacent
 * @property {(gx: number, gy: number) => Creature | null | undefined} creatureAt
 * @property {(gx: number, gy: number) => boolean} isOccupiedByActor
 * @property {() => Creature[]} aliveCreatures
 * @property {() => void} _invalidateCreatureTileMap
 * @property {(creature: Creature) => void} updateCreatureBar
 * @property {(creature: Creature, dx: number, dy: number) => void} orientCreatureSprite
 */

/**
 * Build creature movement helpers bound to engine state. Returns a
 * destructurable object.
 *
 * @param {CreatureMovementDeps} deps
 */
export function setupCreatureMovement(deps) {
  const {
    playerState,
    centerX, centerY,
    isWalkable, isCreatureMeleeAdjacent,
    creatureAt, isOccupiedByActor,
    aliveCreatures, _invalidateCreatureTileMap,
    updateCreatureBar, orientCreatureSprite,
  } = deps;

  const tileKey = (x, y) => `${x},${y}`;

  /** Nearest alive enemy to (fromX, fromY) by Manhattan distance. */
  function findNearestEnemy(fromX, fromY) {
    let best = null;
    let bestDist = Infinity;
    for (const c of aliveCreatures()) {
      const d = Math.abs(c.gx - fromX) + Math.abs(c.gy - fromY);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  /**
   * BFS toward any tile adjacent to (targetGX, targetGY). Returns the
   * first cardinal step or null if blocked / already adjacent.
   */
  function findNextStepToTarget(fromX, fromY, targetGX, targetGY) {
    const startKey = tileKey(fromX, fromY);
    if (isCreatureMeleeAdjacent(fromX, fromY, targetGX, targetGY)) return null;
    const goalKeys = new Set();
    const neigh = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dx, dy] of neigh) {
      const px = targetGX + dx;
      const py = targetGY + dy;
      if (!isWalkable(px, py)) continue;
      const blocker = creatureAt(px, py);
      if (blocker && (px !== fromX || py !== fromY)) continue;
      goalKeys.add(tileKey(px, py));
    }
    if (goalKeys.size === 0) return null;
    const queue = [{ x: fromX, y: fromY }];
    let head = 0;
    const visited = new Set([startKey]);
    const prev = new Map();
    const dirs = [{ x:1,y:0 },{ x:-1,y:0 },{ x:0,y:1 },{ x:0,y:-1 }];
    const MAX_BFS_NODES = 400;
    while (head < queue.length && visited.size < MAX_BFS_NODES) {
      const cur = queue[head++];
      const curKey = tileKey(cur.x, cur.y);
      if (goalKeys.has(curKey)) {
        if (curKey === startKey) return null;
        let step = { x: cur.x, y: cur.y };
        let stepPrev = prev.get(curKey);
        while (stepPrev && tileKey(stepPrev.x, stepPrev.y) !== startKey) {
          step = stepPrev;
          stepPrev = prev.get(tileKey(stepPrev.x, stepPrev.y));
        }
        return step;
      }
      for (const d of dirs) {
        const nx = cur.x + d.x;
        const ny = cur.y + d.y;
        const key = tileKey(nx, ny);
        if (visited.has(key)) continue;
        if (!isWalkable(nx, ny)) continue;
        if (key !== startKey && isOccupiedByActor(nx, ny)) continue;
        visited.add(key);
        prev.set(key, cur);
        queue.push({ x: nx, y: ny });
      }
    }
    return null;
  }

  /** Same as findNextStepToTarget but hard-coded to the player's tile. */
  function findNextStepToPlayer(fromX, fromY) {
    return findNextStepToTarget(fromX, fromY, playerState.gridX, playerState.gridY);
  }

  /**
   * One step BFS toward the player, applying the move to the creature.
   * Returns true if the creature moved.
   */
  function tryMoveCreature(creature) {
    const next = findNextStepToPlayer(creature.gx, creature.gy);
    if (!next) return false;
    if (next.x === playerState.gridX && next.y === playerState.gridY) return false;
    orientCreatureSprite(creature, next.x - creature.gx, next.y - creature.gy);
    creature.gx = next.x;
    creature.gy = next.y;
    _invalidateCreatureTileMap();
    creature.sprite.x = centerX(creature.gx);
    creature.sprite.y = centerY(creature.gy);
    updateCreatureBar(creature);
    return true;
  }

  /**
   * One-tile cardinal wander on a per-creature cooldown. Random direction
   * preference. Returns true if the creature moved.
   */
  function tryWanderCreature(creature, now) {
    if (now < creature.nextWanderAt) return false;
    creature.nextWanderAt = now + Phaser.Math.Between(900, 1600);
    const cardinalDirections = [
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
    ];
    const firstIndex = Phaser.Math.Between(0, cardinalDirections.length - 1);
    for (let i = 0; i < cardinalDirections.length; i += 1) {
      const d = cardinalDirections[(firstIndex + i) % cardinalDirections.length];
      const nx = creature.gx + d.dx;
      const ny = creature.gy + d.dy;
      if (!isWalkable(nx, ny)) continue;
      if (isOccupiedByActor(nx, ny)) continue;
      orientCreatureSprite(creature, d.dx, d.dy);
      creature.gx = nx;
      creature.gy = ny;
      _invalidateCreatureTileMap();
      creature.sprite.x = centerX(creature.gx);
      creature.sprite.y = centerY(creature.gy);
      updateCreatureBar(creature);
      return true;
    }
    return false;
  }

  /**
   * Ranged creatures try to keep `creature.range` tiles from the player:
   * if too close, step to maximise distance; if too far, approach via BFS.
   * Returns true if the creature moved.
   */
  function tryMoveRangedCreature(creature) {
    const dist = Math.max(Math.abs(creature.gx - playerState.gridX), Math.abs(creature.gy - playerState.gridY));
    const targetRange = creature.range;
    if (dist === targetRange) return false;

    const options = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];

    if (dist < targetRange) {
      let best = null;
      let bestDist = dist;
      for (const d of options) {
        const nx = creature.gx + d.dx;
        const ny = creature.gy + d.dy;
        if (!isWalkable(nx, ny)) continue;
        if (isOccupiedByActor(nx, ny)) continue;
        const nd = Math.max(Math.abs(nx - playerState.gridX), Math.abs(ny - playerState.gridY));
        if (nd > bestDist) { bestDist = nd; best = { nx, ny, d }; }
      }
      if (!best) return false;
      orientCreatureSprite(creature, best.d.dx, best.d.dy);
      creature.gx = best.nx; creature.gy = best.ny;
      _invalidateCreatureTileMap();
      creature.sprite.x = centerX(creature.gx);
      creature.sprite.y = centerY(creature.gy);
      updateCreatureBar(creature);
      return true;
    }

    const next = findNextStepToPlayer(creature.gx, creature.gy);
    if (!next) return false;
    orientCreatureSprite(creature, next.x - creature.gx, next.y - creature.gy);
    creature.gx = next.x; creature.gy = next.y;
    _invalidateCreatureTileMap();
    creature.sprite.x = centerX(creature.gx);
    creature.sprite.y = centerY(creature.gy);
    updateCreatureBar(creature);
    return true;
  }

  /** Wounded creatures flee (Tibia's "runs at" behaviour). */
  const shouldFlee = (creature) => creature.runsAt > 0 && creature.hp <= creature.runsAt;

  function tryFleeCreature(creature) {
    const options = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    let best = null;
    let bestDist = Math.abs(creature.gx - playerState.gridX) + Math.abs(creature.gy - playerState.gridY);
    for (const d of options) {
      const nx = creature.gx + d.dx;
      const ny = creature.gy + d.dy;
      if (!isWalkable(nx, ny)) continue;
      if (isOccupiedByActor(nx, ny)) continue;
      const dist = Math.abs(nx - playerState.gridX) + Math.abs(ny - playerState.gridY);
      if (dist > bestDist) {
        bestDist = dist;
        best = { nx, ny, d };
      }
    }
    if (!best) return false;
    orientCreatureSprite(creature, best.d.dx, best.d.dy);
    creature.gx = best.nx;
    creature.gy = best.ny;
    _invalidateCreatureTileMap();
    creature.sprite.x = centerX(creature.gx);
    creature.sprite.y = centerY(creature.gy);
    updateCreatureBar(creature);
    return true;
  }

  return {
    tileKey,
    findNearestEnemy,
    findNextStepToTarget,
    findNextStepToPlayer,
    tryMoveCreature,
    tryWanderCreature,
    tryMoveRangedCreature,
    shouldFlee,
    tryFleeCreature,
  };
}
