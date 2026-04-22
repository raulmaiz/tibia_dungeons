// Elemental damage mod helpers. Every function is pure.
//
// The creature-to-element multiplier lives on each creature instance as
// `creature.elementMods` — 100 = neutral, <100 = resist, >100 = weakness.
// This module reads those mods + the catalog's per-creature-id overrides
// (passed in as a Map) to compute incoming damage scaling.

/** @typedef {import('../../types.js').Spell} Spell */
/** @typedef {import('../../types.js').Creature} Creature */

/** @returns {Record<string, number>} */
export function defaultElementMods() {
  return {
    physical: 100,
    earth: 100,
    fire: 100,
    ice: 100,
    energy: 100,
    death: 100,
    holy: 100,
    drown: 100,
    lifedrain: 100,
    healing: 100,
  };
}

/**
 * Apply per-creature-id overrides (from the catalog) on top of the neutral
 * 100/100/... baseline. Returns a fresh object.
 *
 * @param {number} creatureId
 * @param {Map<number, Record<string, number>>} creatureDamageModifiersById
 */
export function mergeCreatureElementModsForId(creatureId, creatureDamageModifiersById) {
  const row = creatureDamageModifiersById.get(Number(creatureId));
  const base = defaultElementMods();
  if (!row) return base;
  const out = { ...base };
  for (const k of Object.keys(base)) {
    if (row[k] != null && Number.isFinite(Number(row[k]))) out[k] = Number(row[k]);
  }
  return out;
}

/**
 * Map an item or spell's damage_type string (catalog text) to the
 * creature.elementMods key. Returns null when the string doesn't match any
 * known element.
 *
 * @param {string | null | undefined} raw
 */
export function normalizeDamageTypeToModifierKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const direct = {
    physical: 'physical',
    phys: 'physical',
    earth: 'earth',
    terra: 'earth',
    fire: 'fire',
    ice: 'ice',
    frost: 'ice',
    energy: 'energy',
    elec: 'energy',
    electric: 'energy',
    death: 'death',
    holy: 'holy',
    drown: 'drown',
    lifedrain: 'lifedrain',
    life: 'lifedrain',
    healing: 'healing',
    poison: 'earth',
  };
  if (direct[s]) return direct[s];
  if (s.includes('earth') || s.includes('terra')) return 'earth';
  if (s.includes('fire') || s.includes('flame')) return 'fire';
  if (s.includes('ice') || s.includes('frost')) return 'ice';
  if (s.includes('energy') || s.includes('lightning')) return 'energy';
  if (s.includes('death')) return 'death';
  if (s.includes('holy')) return 'holy';
  if (s.includes('physical')) return 'physical';
  return null;
}

/**
 * Guess a spell's element from its title + effect text. Fallback is
 * 'energy' so a mis-guessed spell still deals a standard element.
 *
 * @param {Spell | null} spell
 */
export function inferSpellDamageElementKey(spell) {
  const t = String((spell && spell.title) || '').toLowerCase();
  const e = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
  const both = `${t} ${e}`;
  if (/(fire|flame|burn|great fireball|scorch)/.test(both)) return 'fire';
  if (/(ice|frost|freeze|avalanche)/.test(both)) return 'ice';
  if (/(earth|terra|stone|stalagmite|poison)/.test(both)) return 'earth';
  if (/(energy|lightning|thunder|electric|great energy)/.test(both)) return 'energy';
  if (/(death|soul|curse|decay|great death)/.test(both)) return 'death';
  if (/(holy|divine)/.test(both)) return 'holy';
  return 'energy';
}

/**
 * Scale an incoming damage number by the creature's per-element
 * mod. Clamped to [0, ×3] so a 300% weakness doesn't uncap.
 *
 * @param {number} baseDamage
 * @param {Creature | null} creature
 * @param {string | null} elementKey
 */
export function applyIncomingElementalDamage(baseDamage, creature, elementKey) {
  const raw = Math.max(0, Math.floor(Number(baseDamage) || 0));
  if (!creature || !elementKey) return raw;
  const mods = creature.elementMods;
  if (!mods) return raw;
  const pct = Number(mods[elementKey]);
  const m = Number.isFinite(pct) ? pct : 100;
  const mult = Math.min(3, Math.max(0, m / 100));
  return Math.max(0, Math.floor(raw * mult));
}
