# Architecture

This document describes how the Tibia Dungeons codebase is organised and **why**. It is the result of a six-phase refactor (commits `b765f2a` → `7bc6b6c`) whose goal was to prepare the engine for upcoming visual work: isometric perspective, dynamic lighting (Phaser Lights2D), particle systems, post-FX shaders, normal maps, and a day/night cycle. The refactor moved code; it did not introduce those features yet. The seams where they will plug in are documented below.

If you only want a one-line takeaway: **the engine is no longer a 9 500-line monolith; it is a thin orchestrator on top of small, single-purpose modules, with a Projection layer and SpriteFactory between game logic and Phaser so the iso migration touches few files.**

---

## Layer map

```
game/js/
├── main.js                 ← entry point (imports ui/auth.js + engine/game.engine.js)
├── loading-screen.js       ← separate bundle entry (SW register + changelog scroller)
├── dataService.js          ← JSON catalog loaders + imageUrl()
├── offline-api.js          ← localStorage stubs for the itch.io build
├── vfx.js                  ← low-level Phaser draw routines (import through rendering/Renderer.js)
│
├── config/                 ← all magic numbers (gameplay + visual)
│   ├── game.config.js          tile size, dungeon dims, action timings, coin economy
│   └── visual.config.js        HUD pixel dims, light radii, torch-burn thresholds
│
├── core/                   ← cross-cutting infrastructure
│   └── EventBus.js             tiny pub/sub for entity:died / spell:cast / loot:dropped …
│
├── world/                  ← world↔screen abstraction
│   └── Projection.js           worldToScreen / screenToWorld / worldX / worldY
│
├── rendering/              ← entity sprite construction + VFX facade
│   ├── SpriteFactory.js        createPlayerSprite / createCreatureSprite / createGroundTile / …
│   └── Renderer.js             re-export shim over vfx.js (shake, flash, projectile lines)
│
├── systems/                ← reusable behaviour modules
│   └── lighting/
│       └── LightItems.js       equipped-light state, burn schedule, slot-icon resolution
│
├── state/                  ← shared mutable state across modules
│   └── playerSession.js        callbacks bridging panel ↔ engine via setters
│
├── ui/                     ← DOM panels and screens
│   ├── auth.js                 login + character-select shell
│   ├── inventoryPanel.js       1.6k-line panel: character select, equip, loot bag, shops
│   ├── loadingScreen.js        progress-bar driver
│   └── panelLayout.js          existing — pre-refactor
│
├── data/                   ← static data tables (no logic)
│   ├── floorSpawnConfig.js     per-floor creature pool + counts + labels
│   ├── floorThemes.js          per-floor visual theme (palette, decor)
│   ├── changelog.js            loading-screen "what's new"
│   └── version.js              auto-managed VERSION + RELEASE_DATE
│
├── entities/               ← domain grouping by entity type
│   ├── Creature/
│   │   ├── abilityPatterns.js      ability-VFX inference
│   │   └── damageModifiers.js      per-id damage multipliers
│   ├── Spell/
│   │   ├── filters.js              spell-title blacklist
│   │   └── fxOverrides.js          75 per-spell VFX recipes
│   ├── Item/                       (placeholder — logic still in ui/inventoryPanel.js)
│   └── Player/                     (placeholder — state still in engine closure)
│
├── engine/                 ← scene + all in-run logic
│   ├── game.engine.js              ← ~7 700 lines: scene lifecycle, combat, movement, AI, save/load
│   ├── floorAtmosphere.js          darkness overlay + floor decorations
│   └── creatureSpellVfx.js         creature ability VFX
│
├── dungeon/                ← procedural floor generator
└── mechanics/              ← progression curves + loot pity tracker
```

---

## The five seams that exist *for* future visual work

Each of these is a single point of change that an iso/lighting/particles patch will modify. They were created in this refactor with that future work in mind — there is no other reason for them to exist today.

### 1. `config/visual.config.js` — palette, light, layout numbers

When the day/night cycle ships it will read its base colours and torch radii from here. When iso lands the HUD pixel reservations (`TOP_PANELS_H`, `BOTTOM_BAR_H`, `RIGHT_SIDEBAR_W`) become the canvas viewport calculation in iso space.

### 2. `core/EventBus.js` — gameplay events

Today the engine emits five events: `coins:changed`, `entity:died`, `spell:cast`, `loot:dropped`, `floor:descended`. The combat code does NOT call into the (future) particle system; it emits `entity:died` and the particle system listens. Same for ambient audio, screen-shake variants, kill-feed tickers — none of them require a single line of change in combat code.

The bus is exposed on `window.tdEvents` so you can listen from the browser console while playtesting.

### 3. `world/Projection.js` — coordinate transform

The single source of truth for `(grid_x, grid_y) ↔ (pixel_x, pixel_y)`. Today the implementation is orthogonal:

```js
worldToScreen(gx, gy) → { x: gx*40 + 20, y: gy*40 + 20 }
```

When iso ships, **only this file changes**. Every sprite, projectile, AoE pattern, and click-to-tile calculation in the engine already routes through `worldToScreen`, `worldX`, or `worldY` (the latter two are orthogonal-only convenience helpers — they are deleted in the iso migration and their callers move to `worldToScreen`, which is mechanical work because the call sites are all in one file).

### 4. `rendering/SpriteFactory.js` — entity sprite construction

Every `this.add.sprite(...)` for a player, creature, ground tile, fire field or poison field goes through here. When normal maps and Lights2D pipelines arrive, they hook in once — `setPipeline('Light2D')` plus the normal-map texture binding go inside `createCreatureSprite` and every spawned creature inherits the new pipeline. No engine code changes.

This is also the seam for per-entity post-FX (bloom on bosses, outline shaders on the player).

### 5. `rendering/Renderer.js` — VFX facade

Pass-through over `vfx.js` today. When a post-processing pipeline lands (bloom, vignette, colour grading) it wraps the existing exports here. Engine imports `from '../../../rendering/Renderer.js'` — never `from '../vfx.js'` — so wrapping is invisible to callers.

---

## What the engine still owns (and why it was not extracted)

`game/js/engine/game.engine.js` is still ~7 700 lines after the refactor. Most of that mass is the body of `startGame(configPlayer)`, a single function whose closure captures the live game state: `gridX`, `gridY`, `playerHp`, `playerMana`, `creatures[]`, `learnedSpellIds`, `currentLevel`, dozens more. Inside that closure live:

- `performPlayerAttack`, projectile/spell hit resolution, damage rolls, ammo consumption
- Player input handling, action throttling, movement, facing
- Creature AI (target selection, pathing, ability picking)
- Scene lifecycle (preload, create, update, descend, save/load, death)

These were **not** extracted because doing so would require breaking the closure — which is a rewrite, not a move (rule #3 of the refactor). It is the right thing to do, but it belongs to the iso migration, where the closure is already going to be torn open to introduce `Player` / `Creature` classes with proper state and lifecycle methods. Extracting now would mean doing the work twice.

If you are touching combat/movement/AI today, you are working inside `startGame`. That is intentional.

---

## Module-shared state via `state/playerSession.js`

JavaScript ES modules export *bindings*, not values. We exploited this so the inventory panel and the engine can share mutable state without circular imports:

```js
// playerSession.js
export let onPanelLog = null;
export function setOnPanelLog(fn) { onPanelLog = fn; }
```

Both modules import `onPanelLog`. The panel does not write directly (ESM imports are read-only); it calls `setOnPanelLog(fn)`. The engine reads `onPanelLog` and sees the panel's update because the binding is live.

This pattern is used for eight callbacks (`onPanelLog`, `onConsumeFood`, `onUseLiquid`, `onUseTool`, `onPlayerLevelStatsUpdate`, `inventorySetEquippedSlotVisual`, `inventoryClearEquippedSlotVisual`, `lastLootRejectReason`). The naming convention is **always** `set<Name>(value)`. Never reassign the imported binding directly — it will throw `Assignment to constant variable`.

---

## Hard-won conventions

- **Always import VFX through `Renderer.js`**, never directly from `vfx.js`. The shim exists to let post-FX wrap individual exports later.
- **Always create entity sprites through `SpriteFactory.js`**. Direct `this.add.sprite(...)` calls in the engine bypass the future normal-map / Lights2D pipeline.
- **Always go through `Projection.worldToScreen` for coordinate math.** Inline `gx * tileSize + tileSize/2` is forbidden — it will silently break the iso migration.
- **Constants live in `config/`.** A new magic number anywhere outside `config/` is a refactor regression.
- **Cross-module state goes through `playerSession.js` setters**, never via direct binding mutation.
- **Floor decorations (`floorAtmosphere.js`) are tile-relative, not world-coordinate.** They use `tileSize * 0.55` style sizing; that survives the iso migration as long as the tile width stays constant. If the iso tiles become diamond-shaped, atmosphere needs its own pass.
- **Service worker cache must be bumped when bundle layout changes.** The cache key is `tibia-dungeons-v<N>` in `game/sw.js`. Bump on every refactor that moves files.

---

## Build & deploy (unchanged by this refactor)

- `npm run dev` — local file server on `:5173`. **Does not bundle.** You must run `node scripts/build.js` first (or alongside, in watch mode) so `game/dist/main.min.js` and `loading-screen.min.js` exist.
- `node scripts/build.js` — non-destructive dev bundle to `game/dist/`.
- `node scripts/build.js --watch` — same, with esbuild watch.
- `npm run build` — **destructive** prod bundle. Deletes `game/js/` after writing `game/dist/`. **Do not run locally to "verify"**; only Vercel runs this.
- `npm run push` / `npm run release` — version bump + commit + push. Patch on commit, minor on Vercel deploy.
- `npm run build:itch` — `OFFLINE_BUILD=1` flavor for itch.io. Stages to `dist/itch-staging/` so it never touches `game/`.

---

## Refactor history (six phases)

| Phase | Commit | What | Risk |
|-------|--------|------|------|
| 1 | `b765f2a` | Constants → `config/game.config.js` + `config/visual.config.js` | low |
| 2 | `a7138ed` | EventBus + 5 emit points (additive, no removals) | low |
| 3 | `8865b12` | Projection layer (`worldX`/`worldY`/`worldToScreen`) | medium |
| 4 | `0da5d1f` | SpriteFactory + Renderer shim | medium |
| 5a | `496de80` | Light subsystem + data tables → modules | low |
| 5b | `7b80f3f` | `setupSelectorUI` → `ui/inventoryPanel.js` + `state/playerSession.js` | high |
| 5b fix | `7bc6b6c` | Re-wire missing engine deps surfaced after 5b | — |
| 6 | this commit | Dedup `parseDuration*`, SW cache bump, this doc | low |

Engine line count: **9 491 → ~7 700** (-19 %).

---

## What is **not** documented here

- Game balance / progression formulas → see [`game/js/mechanics/progression.js`](../game/js/mechanics/progression.js).
- Floor themes & creature pools → see [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js) and [`game/js/data/floorThemes.js`](../game/js/data/floorThemes.js).
- Spell VFX shapes → see [`game/js/entities/Spell/fxOverrides.js`](../game/js/entities/Spell/fxOverrides.js) and [`game/js/entities/Creature/abilityPatterns.js`](../game/js/entities/Creature/abilityPatterns.js).
- Combat rules, gameplay quirks, controls → see the project root [`CLAUDE.md`](../CLAUDE.md).
