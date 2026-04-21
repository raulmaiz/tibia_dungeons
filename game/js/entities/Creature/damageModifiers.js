// Per-creature damage multipliers. Phase 5 of the architectural refactor.
// Keys are creature ids; values are multipliers applied to the creature's
// base maxDamage at spawn time. Use to soften or harden specific encounters
// without rebalancing the whole tier.

export const CREATURE_DAMAGE_MULTIPLIER_BY_ID = new Map([
  [37051, 0.5],
]);
