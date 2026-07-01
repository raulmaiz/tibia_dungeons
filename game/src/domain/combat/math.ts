// Pure damage math — TS port of game/js/engine/systems/CombatMath.js.
// Every function takes all its inputs as arguments (no closure state, no
// scene, no globals) and the RNG is injected for deterministic tests.
// Formulas are byte-identical to the 2D version: numbers here are balance.

import { clamp, defaultRng, intBetween, type Rng } from '../../core/rng';

/**
 * Roll a single creature attack's damage. `attackerMaxDamage` is the
 * creature's template `maxDamage` after per-id damage multiplier. The
 * floor multiplier escalates damage slowly as floors climb, capped
 * at ×3.5 so floor-20 bosses don't one-shot.
 */
export function pickCreatureDamage(
  attackerMaxDamage: number,
  floorLevel: number,
  rng: Rng = defaultRng,
): number {
  const max = Math.max(1, Number(attackerMaxDamage || 1));
  const floorMultiplier = clamp(1 + (floorLevel - 1) * 0.12, 1, 3.5);
  const rolled = intBetween(rng, 1, max);
  return Math.max(1, Math.floor(rolled * floorMultiplier));
}

/**
 * Hard cap on any incoming hit relative to the player's max HP. Grows
 * slowly with floor but avoids unfair one-shots.
 */
export function maxIncomingHitByFloor(floorLevel: number, playerMaxHp: number): number {
  const floorFactor = clamp(0.34 + (floorLevel - 1) * 0.02, 0.34, 0.55);
  return Math.max(18, Math.floor(playerMaxHp * floorFactor));
}

/**
 * Combined "anti-spike" clamp applied before writing the damage back to
 * the player. Takes the lower of (per-creature cap ≈ 2.2× max) and the
 * floor cap, then clamps the raw roll to that.
 */
export function clampIncomingCreatureDamage(
  damage: number,
  creatureMaxDamage: number,
  floorLevel: number,
  playerMaxHp: number,
): number {
  const raw = Math.max(1, Math.floor(Number(damage) || 1));
  const byCreature = Math.max(12, Math.floor(Math.max(1, Number(creatureMaxDamage || 1)) * 2.2));
  const byFloor = maxIncomingHitByFloor(floorLevel, playerMaxHp);
  const hardCap = Math.min(byCreature, byFloor);
  return clamp(raw, 1, hardCap);
}

/**
 * Miss roll. Throwing weapons miss ~50% of the time; everything else 10%.
 * The 2D version received the whole weapon Item; here we only need its
 * `type_secondary` string (the caller owns the item shape).
 */
export function didAttackMiss(weaponSecondaryType: string | null = null, rng: Rng = defaultRng): boolean {
  const secondary = String(weaponSecondaryType ?? '').toLowerCase();
  if (secondary === 'throwing weapons') return rng() < 0.5;
  return rng() < 0.1;
}

/** Crit rate: 10% flat. */
export function didAttackCrit(rng: Rng = defaultRng): boolean {
  return rng() < 0.1;
}

/** Crit multiplier: +150% (×2.5). */
export function applyCriticalDamage(baseDamage: number): number {
  return Math.max(1, Math.round(baseDamage * 2.5));
}

/**
 * Equipment defense summary consumed by `applyShieldingReduction`.
 * The 2D version read the live inventory through a window bridge
 * (`window.debugInventory.state()`); the 3D port inverts that: the
 * inventory system (F4) computes this summary and passes it in, keeping
 * the math pure. Field semantics preserved from the original:
 *  - totalDefenseValue = shield value + shield/weapon `defense` attrs
 *    + armor values/attrs of non-weapon slots.
 *  - accessoryPhysicalResistPct = sum of `physical%` attr on ring + amulet.
 */
export interface EquipmentDefenseSummary {
  totalDefenseValue: number;
  accessoryPhysicalResistPct: number;
}

export const NO_EQUIPMENT: EquipmentDefenseSummary = {
  totalDefenseValue: 0,
  accessoryPhysicalResistPct: 0,
};

/**
 * Shield / armor / accessory-based damage reduction on incoming player
 * hits. Shielding skill amps the reduction. Formula identical to 2D.
 */
export function applyShieldingReduction(
  incomingDamage: number,
  shieldingLevel: number,
  equipment: EquipmentDefenseSummary = NO_EQUIPMENT,
): number {
  const raw = Math.max(1, Math.floor(Number(incomingDamage) || 1));
  const totalDefenseValue = Math.max(0, Number(equipment.totalDefenseValue) || 0);
  if (totalDefenseValue <= 0) return raw;
  const skillValue = Math.max(10, Number(shieldingLevel || 10));
  // Total mitigation: shield + weapon defense + armor.
  const percentReduction = clamp(
    0.08 + totalDefenseValue * 0.009 + (skillValue - 10) * 0.004,
    0.08,
    0.72,
  );
  const flatReduction = Math.floor(totalDefenseValue * 0.18 + (skillValue - 10) * 0.08);
  const reducedByPercent = Math.floor(raw * (1 - percentReduction));
  const reduced = Math.max(1, reducedByPercent - flatReduction);
  const accessoryResistPct = Math.max(0, Number(equipment.accessoryPhysicalResistPct) || 0);
  if (accessoryResistPct > 0) {
    return Math.max(1, Math.floor(reduced * (1 - Math.min(50, accessoryResistPct) / 100)));
  }
  return reduced;
}

/**
 * Bonus damage when multiple creatures attack the player the same turn.
 * +15% per extra attacker, capped at ×2.1.
 */
export function applyMultiAttackerPressure(baseDamage: number, attackersPressure: number): number {
  const raw = Math.max(1, Math.floor(Number(baseDamage) || 1));
  const bonusMultiplier = clamp(1 + Math.max(0, attackersPressure) * 0.15, 1, 2.1);
  return Math.max(1, Math.floor(raw * bonusMultiplier));
}
