# `engine/` — the game engine

The biggest folder in the project. Treat with care.

## Files

- [`game.engine.js`](game.engine.js) — **~7 700 lines.** The game scene + all in-run logic.
- [`floorAtmosphere.js`](floorAtmosphere.js) — the darkness overlay, area lights, decorative wall/floor motifs (~2 100 lines). Per-floor color palette comes from [`../data/floorThemes.js`](../data/floorThemes.js).
- [`creatureSpellVfx.js`](creatureSpellVfx.js) — creature ability VFX dispatch (`castCreatureSpellVfx`, `castFireballExplosion`, etc.).

## Anatomy of `game.engine.js`

Three concentric scopes:

### Module scope (top of the file, ~200 lines)

- Imports, module-level mutable state (data catalogs filled by `loadEngineData`), config imports, the `CONJURE_AMMO_MAP`, miscellaneous helpers (`creaturePlural`, `pickRandomCreatures`, `pickRandomTileFrom`, `rollCreatureDrops`).
- `isWalkableTile(gx, gy)` — the only "outside-the-closure" tile helper.
- `loadEngineData(onProgress)` — engine-side data loader called from the inventory panel's `bootGame`.
- `loadProgressionDatabase()` — internal helper for the above.

### `startGame(configPlayer)` closure (lines ~200 – ~7700)

**Where everything else lives.** When a player clicks "Enter Dungeon" this gets called once. Inside its closure:

- All run state: `gridX`, `gridY`, `playerHp`, `playerMana`, `currentLevel`, `creatures[]`, `learnedSpellIds`, `spellCooldownUntil`, `bagLootItems`, `equippedSlots`, etc.
- The Phaser scene (`new Phaser.Game({ scene: { preload, create, update } })`).
- All combat: `performPlayerAttack`, projectile/spell hit resolution, damage rolls, ammo, crits.
- All movement: `update()` direction handling, `nextPlayerActionAt` throttling, facing.
- All AI: `creatureUpdate()`, target selection, ability picking.
- Save/load: snapshot/restore.
- Spawn / descend / floor transitions.
- HUD updates (inside the scene `update()` loop).

**The closure is intentional today.** Tearing it apart is **refactor Phase 4** — it requires modeling `Player` / `Creature` / `RunState` as proper modules. Until then, code that needs run-time state has to live inside this closure.

### Module scope (bottom of file, ~7700 – ~7770)

- `setupInventoryPanel({ startGame })` call site (mounts the UI panel).
- `setLoadingProgress` import (re-exported via [`../ui/loadingScreen.js`](../ui/loadingScreen.js)).
- `loadEngineData()` definition.

## Where to look for X (cheat sheet)

| Looking for | Search for |
|---|---|
| Player attack logic | `performPlayerAttack` |
| Creature AI tick | `creatureUpdate` |
| Spell cast resolution | `castLearnedSpell` |
| Floor descent | `descendLevel` |
| Hunger ticks / regeneration | `setHungryState`, `playerHp +=` |
| HP/MP bar updates | `updatePlayerBar`, `updateCreatureBar` |
| Save snapshot | `getRunSnapshot` |
| Death handling | `playerDead = true`, `showDeathSummary` |
| Magic weapon / ranged attack | `nextMagicWeaponShotAt`, `rangedProjectileLine` |
| Fire / poison fields | `addFireFieldTile`, `addPoisonFieldTile` |
| Dungeon generation | imported from [`../dungeon/generator.js`](../dungeon/generator.js) |

## Conventions inside the engine

- **All sprite construction goes through [`../rendering/SpriteFactory.js`](../rendering/SpriteFactory.js).** Never raw `this.add.sprite(...)`.
- **All VFX calls import from [`../rendering/Renderer.js`](../rendering/Renderer.js).** Never from `vfx.js` directly.
- **All coordinate math goes through [`../world/Projection.js`](../world/Projection.js).** Never inline `gx * tileSize + tileSize/2`.
- **Combat / movement / AI events emit through [`../core/EventBus.js`](../core/EventBus.js)** so future systems can listen.
- **Closure-shadowed reads** (e.g. `centerX`, `centerY`) are local aliases for Projection helpers. They exist for the dozens of capture sites — do not introduce new ones.

## Risk zones

- **The `startGame` closure is gigantic.** Editing inside it without understanding what closure variables exist is the #1 way to introduce silent bugs. When in doubt, search the variable name first to see how many places touch it.
- **Save/load + descend** is the most fragile path. Any change there should be smoke-tested by entering the dungeon, descending one floor, saving, reloading, and continuing.
- **Combat + AI are throttled** by `playerActionDelayMs` / `creature.nextActionAt`. If you add a new action type, decide whether it should respect or bypass the throttle.
