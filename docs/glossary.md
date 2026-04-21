# Glossary

Domain terms used in code that aren't self-explanatory. If you see a name in a method or variable and aren't sure what it means, look here first.

Tibia-native terms are marked **(Tibia)** — they come from the original MMORPG that this game is inspired by. Everything else is project-specific.

## Player & character

- **Vocation (Tibia)** — character class. The four supported are `knight`, `paladin`, `sorcerer`, `druid`. In code these are lowercase string keys; UI labels live in `CLASS_META` near the bottom of [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js). Used throughout for stat lookup, sprite frames, learned-spell lists.
- **Sex** — `'male'` or `'female'`. Determines outfit sprite frame (e.g. `player_male_0`).
- **Magic Level (ML, Tibia)** — caster scaling stat. Increases spell damage / heal amounts. Bot-accessible at `#sbML`.
- **Fist** / **Fist Fighting (Tibia)** — bare-hand weapon skill. Levels mid-combat (`Fist Fighting advanced to 12.`). Internally `playerFistLevel` in the engine.
- **Shielding (Tibia)** — defensive skill. Same lifecycle as Fist.
- **Cap / Capacity (Tibia)** — carry-weight cap (oz × 100). Loot rejected when bag exceeds it. Bot-accessible at `#sbCap`. Set per-class via `progressionStatsForLevel()`.

## Combat & combat log

- **Bump-attack** — pressing a direction key into a tile occupied by a creature triggers a melee swing instead of moving. The engine treats movement and melee as the same input; the target tile decides which.
- **Action delay** — the cooldown between any two player actions (move OR attack). `playerActionDelayMs` clamped to `PLAYER_ACTION_DELAY_MIN/MAX_MS` from [`game/js/config/game.config.js`](../game/js/config/game.config.js). Smaller at higher level.
- **Move duration** — the tween length when the player slides between tiles. Independent of action delay.
- **Pivot** — single-direction holds attack nothing if creatures are off to the side. The bot uses a 4-direction rotation (~1.8 s per heading) to ensure it faces every approaching enemy. See [`docs/gameplay-notes.md`](gameplay-notes.md).

## Items & inventory

- **Light source** — items that emit light when equipped in the `slotLight` slot. Torch (article id `1396`), Magic Light Wand (`1671`), and a few others. Each has a burn duration; expired light items show a `Used X` icon variant. Implementation: [`game/js/systems/lighting/LightItems.js`](../game/js/systems/lighting/LightItems.js).
- **Loot bag** — the inventory container. Slots == bag capacity (depends on the equipped Bag item; the starter `Bag` (id `1589`) has 8). Items beyond capacity drop on the ground.
- **Loot reject reason** — when an incoming loot item doesn't fit, `lastLootRejectReason` is set to `'capacity'` (weight) or `'slots'` (no free bag slot) so UI can show a meaningful message.
- **Pity tracker** — drop-rate booster ([`game/js/mechanics/loot.js`](../game/js/mechanics/loot.js)) that guarantees a drop after enough dry runs against the same creature. Prevents 0-drop streaks ruining a run.
- **Conjure ammo** — spells that produce arrows/bolts. Mapped in `CONJURE_AMMO_MAP` in the engine. The actual item template is fetched at boot via `loadEngineData()`.

## Spells

- **Article ID** — the canonical numeric ID from the tibiawiki-sql dump. Used as the primary key for items, spells, and creatures in the JSONs. Shows up as `article_id` or sometimes just `id`.
- **Spell hotkey slots** — 10 slots (`1`–`9`, `0` = slot 10). The spell `articleId` in each slot lives in `learnedSpellOrder` (per-run). Numpad equivalents work too.
- **Spell FX override** — per-spell visual/timing recipe ([`game/js/entities/Spell/fxOverrides.js`](../game/js/entities/Spell/fxOverrides.js)). Keyed by `spell.title.toLowerCase()`. Missing entries fall back to inferred patterns from [`game/js/entities/Creature/abilityPatterns.js`](../game/js/entities/Creature/abilityPatterns.js).
- **Cooldown** — `spellCooldownUntil` Map (per-spell wall-clock ms) inside the engine. UI overlay reads from `spellCdDurations`.

## World

- **Floor** — one dungeon level. Numbered from 1 upward. Each floor is a fresh procedurally-generated map. `currentLevel` in the engine.
- **Floor theme** — the named tier of a floor (e.g. `Glires` for floor 1 = rats). Configured in [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js) and [`game/js/data/floorThemes.js`](../game/js/data/floorThemes.js). Drives creature pool, ambient color, base damage.
- **Tile** — a 40×40 px grid cell. Tile coordinates are `(gx, gy)`; pixel coordinates are `(x, y)`. Convert with `worldToScreen(gx, gy)` from [`game/js/world/Projection.js`](../game/js/world/Projection.js).
- **Stairs tile** — the exit tile of the current floor. Walking onto it descends only if all creatures are dead.
- **Atmosphere** — the darkness overlay + decorative wall/floor motifs ([`game/js/engine/floorAtmosphere.js`](../game/js/engine/floorAtmosphere.js)). Per-floor color palette comes from `floorThemes.js`.
- **Hazard fields** — fire / poison tiles created by spells. Sprite + light source + DoT. Implementation in the engine, search for `addFireFieldTile` / `addPoisonFieldTile`.

## Persistence

- **Save** — character snapshot (level, inventory, equipped slots, gold, HP/MP, current floor, kills). Stored server-side via [`api/saves/index.js`](../api/saves/index.js) or in localStorage when `OFFLINE_BUILD`. UI: "Resume" on the saves screen.
- **Run** — one play session ending in death. Recorded to the Hall of Fame ([`api/runs.js`](../api/runs.js) or local JSON in offline mode). One row per death.
- **`OFFLINE_BUILD`** — esbuild `define` flag that swaps the server API for a localStorage stub. Used for the itch.io zip. Skips login overlay, makes Hall of Fame per-device.

## Engine internals

- **`startGame(configPlayer)`** — the giant scene boot function in [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js). Captures all run state in its closure (`gridX`, `playerHp`, `creatures[]`, …). Phase 4 of the in-progress refactor will tear it apart.
- **`bootGame(cfg)`** — defined inside `setupInventoryPanel()`. Loads engine data + initial inventory, then calls `startGame()`. Triggered by the "Enter Dungeon" button.
- **`loadEngineData(onProgress)`** — engine-side data load (creature/spell/items catalogs). Mutates module-scope state. Called from `bootGame` in parallel with panel-side bag/coin loaders.
- **`playerSession`** — [`game/js/state/playerSession.js`](../game/js/state/playerSession.js). Mutable bindings shared between engine and inventoryPanel via setter functions. Engine reads `onPanelLog`, panel writes via `setOnPanelLog(fn)`.
- **`floorAtmosphere`** — instance returned by `createFloorAtmosphere(scene, opts)`. Owns the darkness overlay, area lights, decorative motifs. Engine wires the equipped-light callback into it via `attachAtmosphereLightSink()`.

## Build & deploy

- **`OFFLINE_BUILD`** — see Persistence above.
- **dist/** — esbuild output. Gitignored in `game/dist/`. The static page references `/dist/main.min.js` so this folder must exist for local play.
- **prod build** — `npm run build` (= `node scripts/build.js --prod`). **Destructive**: deletes `game/js/` after bundling. Only Vercel CI should run it.
- **itch build** — `npm run build:itch`. Stages to `dist/itch-staging/`, bundles with `OFFLINE_BUILD=true`, zips to `dist/tibia-dungeons-itch.zip`. Don't run unless explicitly asked.
- **SW cache** — `CACHE` const in [`game/sw.js`](../game/sw.js). Bump after any file move so clients re-download.
