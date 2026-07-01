// Prototype chase AI: replan A* toward the player with a throttle, attack
// when adjacent. The shared flow-field (one BFS for all creatures) replaces
// per-creature A* in T-050 when floors hold 10-15 creatures.

import type { TileMap } from '../domain/dungeon/tilemap';
import type { Combatant } from '../entities/creature';
import { findPath } from './pathfinding';

const REPLAN_EVERY_MS = 400;
const AGGRO_RANGE_TILES = 9;

export class ChaseAI {
  private lastPlanAtMs = -Infinity;

  constructor(private creature: Combatant) {}

  update(tm: TileMap, player: Combatant, nowMs: number): void {
    const c = this.creature;
    if (!c.alive || !player.alive) {
      c.mover.stop();
      return;
    }
    const dist = Math.max(
      Math.abs(c.mover.gx - player.mover.gx),
      Math.abs(c.mover.gy - player.mover.gy),
    );
    if (dist > AGGRO_RANGE_TILES) return;
    if (dist <= 1) {
      c.mover.stop();
      return; // in melee range — combat system handles the attack
    }
    if (nowMs - this.lastPlanAtMs < REPLAN_EVERY_MS) return;
    this.lastPlanAtMs = nowMs;
    const path = findPath(
      tm,
      { gx: c.mover.gx, gy: c.mover.gy },
      { gx: player.mover.gx, gy: player.mover.gy },
    );
    if (!path) return;
    // Stop one tile short of the player (attack from adjacency).
    path.pop();
    c.mover.setPath(path);
  }
}
