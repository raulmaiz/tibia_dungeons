# `game/js/data/` — runtime data tables

Static tuning data the engine reads at boot. **No logic** — these files are pure exports of constants, maps, and arrays.

> Don't confuse with [`/game/data/`](../../data/) — that one is the JSON dump from tibiawiki + sprites. This one is our project-specific tuning.

## Files

| File | What it tunes |
|---|---|
| [`floorSpawnConfig.js`](floorSpawnConfig.js) | Per-floor creature pool: `FORCED_CREATURE_*_BY_LEVEL`, `FLOOR_CREATURE_COUNTS`, `FLOOR_DISPLAY_LABEL`, `EARLY_LEVELS`, plus the `TROLL_ALLOWED_IDS` whitelist. |
| [`floorThemes.js`](floorThemes.js) | Per-floor visual theme: tile palette, wall accents, decorations, particles, vignette, pit (stairs) styling. Drives [`../engine/floorAtmosphere.js`](../engine/floorAtmosphere.js). |
| [`changelog.js`](changelog.js) | Loading-screen "What's new" animation entries. **Update before each Vercel deploy.** |
| [`version.js`](version.js) | Auto-managed `VERSION` + `RELEASE_DATE`. Don't edit by hand — use `npm run push` (patch) or `npm run release` (minor). |

## Lives *elsewhere*

Per-entity tuning moved to the [`../entities/`](../entities/) tree during refactor Phase 2:

- Per-creature damage multipliers → [`../entities/Creature/damageModifiers.js`](../entities/Creature/damageModifiers.js)
- Per-spell VFX overrides → [`../entities/Spell/fxOverrides.js`](../entities/Spell/fxOverrides.js)

`floorSpawnConfig.js` stays here because it's world-scoped (which creatures spawn on which floor) rather than per-creature.

## Adding data

- New floor → see [`/docs/how-to-add-floor.md`](../../../docs/how-to-add-floor.md).
- New spell FX → see [`/docs/how-to-add-spell.md`](../../../docs/how-to-add-spell.md).
- New creature → mostly belongs in [`/game/data/creature.json`](../../data/creature.json), but spawn config comes here. See [`/docs/how-to-add-creature.md`](../../../docs/how-to-add-creature.md).

## Import contract

All files export named constants only — no default exports, no functions, no side effects. If you find yourself wanting to add logic to one of these files, the logic belongs in [`../systems/`](../systems/), [`../entities/<Domain>/`](../entities/), or the engine; this folder stays inert.
