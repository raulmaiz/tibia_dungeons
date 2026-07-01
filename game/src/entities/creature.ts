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

export interface CreatureSpawnSpec {
  title: string;
  hitpoints: number;
  maxDamage: number;
  moveDurationMs: number;
}

/** Creature built from a catalog/spawn-config template (T-024). */
export function makeCreature(id: string, gx: number, gy: number, spec: CreatureSpawnSpec): Combatant {
  return new Combatant(
    id,
    spec.title,
    gx,
    gy,
    {
      maxHp: spec.hitpoints,
      hp: spec.hitpoints,
      maxDamage: spec.maxDamage,
      actionDelayMs: 900, // creature ability cadence parity is T-050
    },
    spec.moveDurationMs,
  );
}
