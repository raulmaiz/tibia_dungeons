// Real-time combat loop with action throttling — prototype port of the 2D
// engine's bump-attack flow using the pure domain math. Spells/ranged: F3.

import { bus } from '../core/events';
import { defaultRng, intBetween, type Rng } from '../core/rng';
import {
  applyCriticalDamage,
  clampIncomingCreatureDamage,
  didAttackCrit,
  didAttackMiss,
  pickCreatureDamage,
} from '../domain/combat/math';
import type { Combatant } from '../entities/creature';

export interface AttackResult {
  missed: boolean;
  crit: boolean;
  damage: number;
}

/** Player melee (bump) attack. Applies throttling; returns null when on cooldown or out of range. */
export function tryPlayerAttack(
  player: Combatant,
  target: Combatant,
  nowMs: number,
  rng: Rng = defaultRng,
): AttackResult | null {
  if (!player.canActAt(nowMs) || !target.alive) return null;
  if (!player.isAdjacentTo(target)) return null;
  player.lastActionAtMs = nowMs;

  if (didAttackMiss(null, rng)) {
    return { missed: true, crit: false, damage: 0 };
  }
  let damage = intBetween(rng, 1, player.stats.maxDamage);
  const crit = didAttackCrit(rng);
  if (crit) damage = applyCriticalDamage(damage);
  target.takeDamage(damage);
  bus.emit('entity:damaged', {
    id: target.id,
    amount: damage,
    crit,
    gx: target.mover.gx,
    gy: target.mover.gy,
  });
  if (!target.alive) {
    bus.emit('entity:died', {
      id: target.id,
      title: target.title,
      gx: target.mover.gx,
      gy: target.mover.gy,
    });
  }
  return { missed: false, crit, damage };
}

/** Creature melee attack against the player, with the 2D anti-spike clamps. */
export function tryCreatureAttack(
  creature: Combatant,
  player: Combatant,
  floorLevel: number,
  nowMs: number,
  rng: Rng = defaultRng,
): AttackResult | null {
  if (!creature.canActAt(nowMs) || !player.alive) return null;
  if (!creature.isAdjacentTo(player)) return null;
  creature.lastActionAtMs = nowMs;

  const rolled = pickCreatureDamage(creature.stats.maxDamage, floorLevel, rng);
  const damage = clampIncomingCreatureDamage(
    rolled,
    creature.stats.maxDamage,
    floorLevel,
    player.stats.maxHp,
  );
  player.takeDamage(damage);
  bus.emit('entity:damaged', {
    id: player.id,
    amount: damage,
    crit: false,
    gx: player.mover.gx,
    gy: player.mover.gy,
  });
  if (!player.alive) {
    bus.emit('player:dead', {});
  }
  return { missed: false, crit: false, damage };
}
