// Pure parsers + formulas for spell stats (range / healing / damage /
// pattern classification). Every function takes explicit inputs and
// returns a number or boolean. No closure state, no scene.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

/** @typedef {import('../../types.js').Spell} Spell */

/**
 * Guess a spell's effective range from its effect text.
 *   'adjacent'           → 1
 *   'around the caster'  → 2
 *   everything else      → 4  (generic projectile range)
 *
 * @param {Spell | null} spell
 */
export function inferSpellRange(spell) {
  const effect = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
  if (effect.includes('adjacent')) return 1;
  if (effect.includes('around the caster') || effect.includes('area')) return 2;
  return 4;
}

/**
 * Healing amount for `exura` family spells, scaled by player level +
 * magic level. Thresholds on the word in the title pick the tier.
 *
 * @param {Spell | null} spell
 * @param {number} playerLevel
 * @param {number} magicLevel
 */
export function inferHealingAmount(spell, playerLevel, magicLevel) {
  const title = String((spell && spell.title) || '').toLowerCase();
  const ml = Math.max(0, Number(magicLevel || 0));
  if (title.includes('ultimate')) return Math.max(20, Math.floor(36 + playerLevel * 1.2 + ml * 6.2));
  if (title.includes('intense'))  return Math.max(14, Math.floor(24 + playerLevel * 1.0 + ml * 4.6));
  if (title.includes('light'))    return Math.max(8,  Math.floor(12 + playerLevel * 0.7 + ml * 3.0));
  return                              Math.max(10, Math.floor(16 + playerLevel * 0.9 + ml * 3.8));
}

/**
 * Baseline spell damage derived from mana cost + player progression.
 *
 * @param {Spell | null} spell
 * @param {number} playerLevel
 * @param {number} magicLevel
 */
export function inferAttackDamage(spell, playerLevel, magicLevel) {
  const manaCost = Math.max(0, Number((spell && spell.mana) || 0));
  const ml = Math.max(0, Number(magicLevel || 0));
  return Math.max(6, Math.floor(4 + playerLevel * 0.8 + ml * 3.4 + manaCost * 0.18));
}

/**
 * Does this pattern hit exactly one tile? Projectiles always do; a 1×1
 * front_box counts; everything else (cone/beam/nova/ring/plus/sweep) is
 * multi-target.
 *
 * @param {{ kind?: string, width?: number, depth?: number } | null} pattern
 */
export function isSingleTargetAttackPattern(pattern) {
  if (!pattern || typeof pattern !== 'object') return true;
  if (pattern.kind === 'projectile') return true;
  if (pattern.kind === 'front_box') {
    const width = Math.max(1, Number(pattern.width || 1));
    const depth = Math.max(1, Number(pattern.depth || 1));
    return width === 1 && depth === 1;
  }
  return false;
}

/**
 * Parse a creature ability's damage range from its "effect" text
 * (catalog JSONs store it as "10-20", "50", "?" etc.). Falls back to
 * the creature's baseline `fallbackMax` (its template maxDamage) when
 * no numbers parse.
 *
 * @param {{ effect?: string } | null} ability
 * @param {number} fallbackMax
 */
export function parseAbilityDamage(ability, fallbackMax) {
  const raw = String((ability && ability.effect) || '');
  const nums = raw.match(/\d+/g) || [];
  const baseMax = Math.max(1, Number(fallbackMax || 1));
  const safeCap = Math.max(8, Math.floor(baseMax * 1.6));
  if (nums.length === 0) return Phaser.Math.Between(1, safeCap);
  if (nums.length === 1) return Phaser.Math.Clamp(Math.max(1, Number(nums[0])), 1, safeCap);
  const a = Math.max(1, Number(nums[0]));
  const b = Math.max(1, Number(nums[1]));
  const lo = Phaser.Math.Clamp(Math.min(a, b), 1, safeCap);
  const hi = Phaser.Math.Clamp(Math.max(a, b), lo, safeCap);
  return Phaser.Math.Between(lo, hi);
}

/**
 * Creature healing abilities clamp the effect-text roll to 10-40% of
 * the creature's own maxHp so Tibia-scale numbers don't under/over-heal.
 *
 * @param {{ effect?: string } | null} ability
 * @param {{ maxHp?: number } | null} creature
 */
export function parseAbilityHeal(ability, creature) {
  const raw = String((ability && ability.effect) || '');
  const nums = raw.match(/\d+/g) || [];
  const maxHp = Math.max(1, Number((creature && creature.maxHp) || 1));
  const minHeal = Math.max(1, Math.floor(maxHp * 0.10));
  const maxHeal = Math.max(minHeal + 1, Math.floor(maxHp * 0.40));
  if (nums.length === 0) return Phaser.Math.Between(minHeal, maxHeal);
  if (nums.length === 1) return Phaser.Math.Clamp(Math.max(1, Number(nums[0])), minHeal, maxHeal);
  const a = Math.max(1, Number(nums[0]));
  const b = Math.max(1, Number(nums[1]));
  const lo = Phaser.Math.Clamp(Math.min(a, b), minHeal, maxHeal);
  const hi = Phaser.Math.Clamp(Math.max(a, b), lo, maxHeal);
  return Phaser.Math.Between(lo, hi);
}

/**
 * Summon abilities: `effect` holds the max simultaneous summons as the
 * first integer in the string. Falls back to 1 for "?" / malformed.
 *
 * @param {{ effect?: string } | null} ability
 */
export function parseSummonMax(ability) {
  const raw = String((ability && ability.effect) || '');
  const nums = raw.match(/\d+/g) || [];
  if (nums.length === 0) return 1;
  return Phaser.Math.Clamp(Math.max(1, Number(nums[0])), 1, 8);
}

/**
 * Class-specific spell damage overrides on top of `inferAttackDamage`.
 *
 *   Paladin 'lesser ethereal spear': (weaponDmg + distanceSkill) × 10
 *   Sorcerer: base × 1.25
 *   Knight single-target: currentWeaponDamage × 2
 *   Knight area: base + currentWeaponDamage
 *   Druid: base (unchanged)
 *
 * @param {Spell | null} spell
 * @param {string} classKey
 * @param {number} playerLevel
 * @param {number} magicLevel
 * @param {() => number} getCurrentPlayerDamage     - engine's currentPlayerDamage
 * @param {(typeKey: string) => number} getWeaponSkillLevelByType
 * @param {{ area?: boolean }} [opts]
 */
export function inferClassAdjustedSpellDamage(spell, classKey, playerLevel, magicLevel, getCurrentPlayerDamage, getWeaponSkillLevelByType, opts = {}) {
  const baseSpellDamage = inferAttackDamage(spell, playerLevel, magicLevel);
  const spellTitle = String((spell && spell.title) || '').toLowerCase();
  if (classKey === 'paladin' && spellTitle === 'lesser ethereal spear') {
    const equippedWeaponDamage = Math.max(1, Number(getCurrentPlayerDamage()) || 1);
    const distanceFighting = Math.max(10, Number(getWeaponSkillLevelByType('distance weapons')) || 10);
    return Math.max(1, (equippedWeaponDamage + distanceFighting) * 10);
  }
  if (classKey === 'sorcerer') return Math.max(1, Math.floor(baseSpellDamage * 1.25));
  if (classKey !== 'knight') return baseSpellDamage;
  const currentWeaponDamage = Math.max(1, Number(getCurrentPlayerDamage()) || 1);
  const area = Boolean(opts.area);
  if (area) {
    // Knight AoE attack spells also include current weapon damage.
    return Math.max(1, baseSpellDamage + currentWeaponDamage);
  }
  // Knight single-target attack spells hit for double current weapon damage.
  return Math.max(1, currentWeaponDamage * 2);
}
