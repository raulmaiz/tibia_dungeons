# How to add a creature

A "creature" in this codebase = a monster the player fights. They live in two places: a static template in JSON catalogs (the source of stats + sprite) and runtime instances spawned per floor.

## Quick path

If the creature already exists in the tibiawiki-sql dump (`game/data/creature.json`), you only need to make it spawn somewhere. Otherwise you also need to add the template.

## 1. Verify (or add) the template

Open [`game/data/creature.json`](../game/data/creature.json) and search by title or `article_id`. Each entry has at minimum:

```json
{
  "article_id": 1116,
  "title": "Rat",
  "type_primary": "Glires",
  "experience": 5,
  "hitpoints": 20,
  "max_damage": 8,
  "speed": 67,
  "runs_at": 5,
  "image": "creature/Rat.gif"
}
```

If the creature isn't in the dump:
- The cleanest route is to extend tibiawiki-sql and re-export. Lighter alternative: append a new entry to `creature.json` with a fresh `article_id` (use one >100000 to avoid collisions with future tibiawiki imports), put a sprite at `game/data/images/creature/<Title>.gif`, and run `node scripts/build.js` once so esbuild re-snapshots the data.
- **Sprite:** must be a transparent GIF (or PNG) named `<Title>.gif` matching the `image` field. The runtime fetches it via `imageUrl(creature.image)`.

## 2. Make it spawn

Edit [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js). Three options depending on how the creature should appear:

### A. Replace the entire pool of a floor

Add to `FORCED_CREATURE_TEMPLATE_BY_LEVEL` (single creature) or `FORCED_CREATURE_TEMPLATES_BY_LEVEL` (multi-creature pool). Example:

```js
export const FORCED_CREATURE_TEMPLATES_BY_LEVEL = {
  // …
  21: [
    { id: 99001, title: 'My New Beast', type_primary: 'MyTheme',
      experience: 1500, hitpoints: 800, maxDamage: 50,
      image: 'creature/My New Beast.gif', speed: 90, runs_at: 0 },
  ],
};
```

The template object is what spawns; the `article_id` reference into `creature.json` is optional but makes other tooling (drop tables, abilities) work.

### B. Just lock a specific id without overriding stats

Add to `FORCED_CREATURE_ID_BY_LEVEL` (single id) or `FORCED_CREATURE_IDS_BY_LEVEL` (multi). The runtime resolves the id against the catalog.

### C. Set the spawn count for a floor

Edit `FLOOR_CREATURE_COUNTS` at the bottom of the same file. Example:

```js
21: { 99001: 12 },          // 12 of my new beast
21: { 99001: 8, 1150: 4 },  // mixed pool
```

## 3. (Optional) Special abilities

If the creature should cast spells or use ranged attacks beyond plain melee, add an entry to [`game/data/creature_ability.json`](../game/data/creature_ability.json) keyed by `article_id`. The pattern (beam, cone, nova, …) is auto-inferred by [`game/js/creatures/abilityPatterns.js`](../game/js/creatures/abilityPatterns.js); per-ability VFX overrides can be wired through [`game/js/data/spellFxOverrides.js`](../game/js/data/spellFxOverrides.js) (keyed by ability title lowercase).

## 4. (Optional) Damage tuning per id

If a specific creature feels too strong / too weak after spawning, add a multiplier to [`game/js/data/creatureDamageModifiers.js`](../game/js/data/creatureDamageModifiers.js):

```js
export const CREATURE_DAMAGE_MULTIPLIER_BY_ID = new Map([
  [37051, 0.5],
  [99001, 0.8],   // soften my new beast
]);
```

## 5. (Optional) Loot drops

Drops live in [`game/data/creature_drop.json`](../game/data/creature_drop.json). Each entry maps `creature.article_id` → `[{ item_id, chance, count_min, count_max }, …]`. The pity tracker in [`game/js/mechanics/loot.js`](../game/js/mechanics/loot.js) guarantees a drop after enough dry kills.

## 6. Verify

```bash
node scripts/build.js                 # regenerate dist
# … then in browser, hard-refresh and play to the target floor
```

Bot smoke check: `TD_MODE=guest node scripts/playtest.js` will boot, pick a class, and play until death — useful to confirm the new creature doesn't crash anything during spawn.

## Where the spawn actually happens

For reference, the runtime spawn loop lives inside `startGame()` in [`game/js/runtime/core/engine/game.engine.js`](../game/js/runtime/core/engine/game.engine.js). Search for `pickRandomCreatures(` and `createCreatureSprite(`. Don't usually need to touch this code — adding a creature is a JSON + spawn-config change.
