// Pure damage math helpers. Every function takes all its inputs as
// arguments (no closure state, no scene) and returns a number or boolean.
//
// Extracted from game.engine.js Phase 4 — unblocks the PlayerAttack /
// CreatureAI extraction by giving them a dep-free math module to call.

/** @typedef {import('../../types.js').Item} Item */

/**
 * Roll a single creature attack's damage. `attackerMaxDamage` is the
 * creature's template `maxDamage` after per-id damage multiplier. The
 * floor multiplier escalates damage slowly as floors climb, capped
 * at ×3.5 so floor-20 bosses don't one-shot.
 *
 * @param {number} attackerMaxDamage
 * @param {number} floorLevel
 */
export function pickCreatureDamage(attackerMaxDamage, floorLevel) {
  const max = Math.max(1, Number(attackerMaxDamage || 1));
  const floorMultiplier = Phaser.Math.Clamp(1 + ((floorLevel - 1) * 0.12), 1, 3.5);
  const rolled = Phaser.Math.Between(1, max);
  return Math.max(1, Math.floor(rolled * floorMultiplier));
}

/**
 * Hard cap on any incoming hit relative to the player's max HP. Grows
 * slowly with floor but avoids unfair one-shots.
 *
 * @param {number} floorLevel
 * @param {number} playerMaxHp
 */
export function maxIncomingHitByFloor(floorLevel, playerMaxHp) {
  const floorFactor = Phaser.Math.Clamp(0.34 + ((floorLevel - 1) * 0.02), 0.34, 0.55);
  return Math.max(18, Math.floor(playerMaxHp * floorFactor));
}

/**
 * Combined "anti-spike" clamp applied before writing the damage back to
 * the player. Takes the lower of (per-creature cap ≈ 2.2× max) and the
 * floor cap, then clamps the raw roll to that.
 *
 * @param {number} damage
 * @param {number} creatureMaxDamage
 * @param {number} floorLevel
 * @param {number} playerMaxHp
 */
export function clampIncomingCreatureDamage(damage, creatureMaxDamage, floorLevel, playerMaxHp) {
  const raw = Math.max(1, Math.floor(Number(damage) || 1));
  const byCreature = Math.max(12, Math.floor(Math.max(1, Number(creatureMaxDamage || 1)) * 2.2));
  const byFloor = maxIncomingHitByFloor(floorLevel, playerMaxHp);
  const hardCap = Math.min(byCreature, byFloor);
  return Phaser.Math.Clamp(raw, 1, hardCap);
}

/**
 * Miss roll. Throwing weapons miss ~50% of the time; everything else 10%.
 *
 * @param {Item | null} [weapon]
 */
export function didAttackMiss(weapon = null) {
  const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
  if (secondary === 'throwing weapons') return Math.random() < 0.5;
  return Math.random() < 0.1;
}

/** Crit rate: 10% flat. */
export function didAttackCrit() {
  return Math.random() < 0.1;
}

/**
 * Crit multiplier: +150% (×2.5).
 * @param {number} baseDamage
 */
export function applyCriticalDamage(baseDamage) {
  return Math.max(1, Math.round(baseDamage * 2.5));
}

/**
 * Shield / armor / accessory-based damage reduction on incoming player
 * hits. Reads the full equipment snapshot through the panel bridge
 * (`window.debugInventory.state()`) to total up shield + weapon defense,
 * armor contribution from non-weapon slots, plus `physical%` resist on
 * ring + amulet. Shielding skill amps the reduction.
 *
 * @param {number} incomingDamage
 * @param {number} shieldingLevel   — `playerState.shieldingLevel`
 */
export function applyShieldingReduction(incomingDamage, shieldingLevel) {
  const raw = Math.max(1, Math.floor(Number(incomingDamage) || 1));
  const readAttrValue = (it, attrName) => {
    const attrs = Array.isArray(it && it.attributes) ? it.attributes : [];
    const row = attrs.find((a) => (
      a
      && String(a.name || '').toLowerCase() === String(attrName || '').toLowerCase()
    ));
    const n = Number(row && row.value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const state = window.debugInventory && typeof window.debugInventory.state === 'function'
    ? window.debugInventory.state()
    : null;
  const equipped = (state && state.equipped) ? state.equipped : {};
  const shield = equipped.shield || null;
  const hand = equipped.hand || null;
  const shieldDefense = (shield && String(shield.item_type || '').toLowerCase() === 'shields')
    ? readAttrValue(shield, 'defense')
    : 0;
  const handDefense = hand ? readAttrValue(hand, 'defense') : 0;
  const shieldValue = Math.max(0, Number((shield && shield.shielding_value) || 0)) + shieldDefense;
  const armorFromEquipment = Object.entries(equipped)
    .filter(([slot, eq]) => eq && slot !== 'hand' && slot !== 'shield' && slot !== 'ammunition' && slot !== 'bag')
    .reduce((acc, [, eq]) => {
      const baseArmor = Math.max(0, Number(eq && eq.armor_value) || 0);
      const armorAttr = readAttrValue(eq, 'armor');
      return acc + baseArmor + armorAttr;
    }, 0);
  const totalDefenseValue = shieldValue + handDefense + armorFromEquipment;
  if (totalDefenseValue <= 0) return raw;
  const skillValue = Math.max(10, Number(shieldingLevel || 10));
  // Total mitigation: shield + weapon defense + armor.
  const percentReduction = Phaser.Math.Clamp(
    0.08 + (totalDefenseValue * 0.009) + ((skillValue - 10) * 0.004),
    0.08,
    0.72
  );
  const flatReduction = Math.floor((totalDefenseValue * 0.18) + ((skillValue - 10) * 0.08));
  const reducedByPercent = Math.floor(raw * (1 - percentReduction));
  const reduced = Math.max(1, reducedByPercent - flatReduction);
  // Apply elemental/physical resistance from ring and amulet (physical% attribute)
  let accessoryResistPct = 0;
  for (const accSlot of ['ring', 'amulet']) {
    const acc = equipped[accSlot];
    if (!acc) continue;
    const accAttrs = Array.isArray(acc.attributes) ? acc.attributes : [];
    const physRow = accAttrs.find((a) => a && String(a.name || '').toLowerCase() === 'physical%');
    if (physRow) {
      const v = Number(physRow.value);
      if (Number.isFinite(v) && v > 0) accessoryResistPct += v;
    }
  }
  if (accessoryResistPct > 0) {
    return Math.max(1, Math.floor(reduced * (1 - Math.min(50, accessoryResistPct) / 100)));
  }
  return reduced;
}

/**
 * Bonus damage when multiple creatures attack the player the same turn.
 * +15% per extra attacker, capped at ×2.1.
 *
 * @param {number} baseDamage
 * @param {number} attackersPressure  — count of attackers this turn
 */
export function applyMultiAttackerPressure(baseDamage, attackersPressure) {
  const raw = Math.max(1, Math.floor(Number(baseDamage) || 1));
  const bonusMultiplier = Phaser.Math.Clamp(
    1 + (Math.max(0, attackersPressure) * 0.15),
    1,
    2.1
  );
  return Math.max(1, Math.floor(raw * bonusMultiplier));
}
