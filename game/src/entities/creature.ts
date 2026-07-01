// Prototype entities: plain state + a GridMover. No render references —
// the renderer owns the Object3D and reads mover coordinates each frame.
// F2+ replaces the hardcoded template with catalog data (T-023/T-024).

import {
  PLAYER_ACTION_DELAY_BASE_MS,
  PLAYER_BASE_DAMAGE,
  PLAYER_MOVE_DURATION_BASE_MS,
} from '../core/config';
import { GridMover } from '../systems/movement';

export interface CombatantStats {
  maxHp: number;
  hp: number;
  /** Max damage per hit (pre floor-multiplier for creatures). */
  maxDamage: number;
  /** Min ms between attacks (action throttling, as in the 2D engine). */
  actionDelayMs: number;
}

export class Combatant {
  readonly mover: GridMover;
  stats: CombatantStats;
  lastActionAtMs = -Infinity;
  alive = true;

  constructor(
    readonly id: string,
    readonly title: string,
    gx: number,
    gy: number,
    stats: CombatantStats,
    moveDurationMs: number,
  ) {
    this.mover = new GridMover(gx, gy, moveDurationMs);
    this.stats = stats;
  }

  canActAt(nowMs: number): boolean {
    return this.alive && nowMs - this.lastActionAtMs >= this.stats.actionDelayMs;
  }

  takeDamage(amount: number): void {
    this.stats.hp = Math.max(0, this.stats.hp - amount);
    if (this.stats.hp === 0) this.alive = false;
  }

  /** Chebyshev adjacency — melee range includes diagonals, as in 2D. */
  isAdjacentTo(other: Combatant): boolean {
    return (
      Math.max(
        Math.abs(this.mover.gx - other.mover.gx),
        Math.abs(this.mover.gy - other.mover.gy),
      ) === 1
    );
  }
}

export function makePlayer(gx: number, gy: number, maxHp: number): Combatant {
  return new Combatant(
    'player',
    'Player',
    gx,
    gy,
    {
      maxHp,
      hp: maxHp,
      maxDamage: PLAYER_BASE_DAMAGE,
      actionDelayMs: PLAYER_ACTION_DELAY_BASE_MS,
    },
    PLAYER_MOVE_DURATION_BASE_MS,
  );
}

/** Prototype enemy roughly tuned like an early-floor Tibia rat pack member. */
export function makePrototypeEnemy(id: string, gx: number, gy: number): Combatant {
  return new Combatant(
    id,
    'Cave Brute',
    gx,
    gy,
    {
      maxHp: 60,
      hp: 60,
      maxDamage: 10,
      actionDelayMs: 900,
    },
    260, // slower than the player
  );
}
