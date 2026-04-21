# `entities/Creature/`

Everything about creatures (monsters the player fights) that isn't already tuning data or inside the engine closure.

## Files

- [`abilityPatterns.js`](abilityPatterns.js) — infers the VFX shape for a creature ability from its text (beam / cone / projectile / nova / …). Used when a creature casts a spell the engine doesn't have an explicit override for.
- [`damageModifiers.js`](damageModifiers.js) — `Map<creatureId, damageMultiplier>`. Applied to `max_damage` at spawn time. Single entry today (`37051 → 0.5`); add here when a specific creature needs to be softened or hardened.

## Also about creatures (but not here)

| Concern | Lives in | Why |
|---|---|---|
| Stat dump (HP, max dmg, speed, sprite) | [`/game/data/creature.json`](../../../data/creature.json) | tibiawiki-sql export |
| Ability list per creature id | [`/game/data/creature_ability.json`](../../../data/creature_ability.json) | tibiawiki-sql export |
| Drop table per creature id | [`/game/data/creature_drop.json`](../../../data/creature_drop.json) | tibiawiki-sql export |
| Spawn pool + count per floor | [`../../data/floorSpawnConfig.js`](../../data/floorSpawnConfig.js) | world-tuning, not entity-definition |
| Sprite construction | [`../../rendering/SpriteFactory.js`](../../rendering/SpriteFactory.js) → `createCreatureSprite()` | renders seam |
| Runtime instance (gx, gy, hp, sprite, alive, …) | engine `startGame()` closure (`creatures[]`) | will move to `Creature.js` here in refactor Phase 4 |
| AI tick (`creatureUpdate`) | engine `startGame()` closure | will move to `engine/systems/AI.js` + call `Creature.act()` in refactor Phase 4 |

## Adding a new creature

See [`/docs/how-to-add-creature.md`](../../../../docs/how-to-add-creature.md). Short version: JSON entry in `/game/data/creature.json` + sprite + spawn config in `../../data/floorSpawnConfig.js`. You rarely need to touch this folder unless:

- The creature has an exotic ability the inference doesn't handle → extend [`abilityPatterns.js`](abilityPatterns.js).
- The creature's damage feels too strong/weak → add to [`damageModifiers.js`](damageModifiers.js).
