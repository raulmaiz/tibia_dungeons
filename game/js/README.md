# `game/js/` — JavaScript modules

Frontend game code. Bundled by esbuild into `game/dist/` at build time.

> **First time here?** Read `/CLAUDE.md` and `/docs/architecture.md` instead. This README is the in-tree map; the docs explain *why*.

## Top-level files

| File | Owns |
|---|---|
| [`main.js`](main.js) | Entry point — two imports: `ui/auth.js` + `engine/game.engine.js`. |
| [`loading-screen.js`](loading-screen.js) | **Separate bundle entry** (loaded by `index.html` before `main.min.js`). Service-worker registration + boot-time changelog scroller. Unrelated to `ui/loadingScreen.js`. |
| [`dataService.js`](dataService.js) | JSON catalog loaders (`getCreatureDropTable`, `getItemShopCatalog`, …) + `imageUrl()` helper. |
| [`offline-api.js`](offline-api.js) | localStorage stub for `/api/*` calls in the itch.io build. Selected at build time via the `OFFLINE_BUILD` esbuild define. |
| [`vfx.js`](vfx.js) | Low-level Phaser draw routines (camera shake, sparks, beams). **Don't import directly** — go through [`rendering/Renderer.js`](rendering/Renderer.js). |

## Subfolders

| Folder | Purpose |
|---|---|
| [`config/`](config/) | All magic numbers (gameplay + visual). |
| [`core/`](core/) | Cross-cutting infrastructure (EventBus). |
| [`world/`](world/) | World↔screen coordinate transform (the iso seam). |
| [`rendering/`](rendering/) | SpriteFactory + Renderer shim (the Lights2D / post-FX seams). |
| [`systems/`](systems/) | Reusable behaviour modules (currently `lighting/`). |
| [`state/`](state/) | Shared mutable state across modules (currently `playerSession.js`). |
| [`ui/`](ui/) | DOM panels: `auth.js`, `inventoryPanel.js`, `loadingScreen.js`, `panelLayout.js`. |
| [`data/`](data/) | Static world-tuning tables (no logic): floor configs, changelog, version. |
| [`entities/`](entities/) | Per-entity domain modules: `Creature/`, `Spell/`, `Item/`, `Player/`. |
| [`engine/`](engine/) | `game.engine.js` + `floorAtmosphere.js` + `creatureSpellVfx.js`. The biggest folder. |
| `dungeon/` | Procedural floor generator. |
| `mechanics/` | Progression curves + loot pity tracker. |

## Naming conventions

- **PascalCase** for "module exports a single thing": `EventBus.js`, `Projection.js`, `SpriteFactory.js`, `LightItems.js`.
- **dot.notation** for config / engine markers: `game.config.js`, `visual.config.js`, `game.engine.js`, `playerSession.js`.
- **camelCase** for misc helpers / data files: `dataService.js`, `auth.js`, `floorAtmosphere.js`, `vfx.js`, `fxOverrides.js`.
- **`<Entity>/<concern>.js`** inside `entities/` — the Entity is PascalCase, the concern file is usually camelCase (e.g. `Creature/abilityPatterns.js`).

There is no fully enforced rule — pick the convention that matches what already exists in the same folder. *To be normalized in refactor Phase 5.*

## What NOT to add here

- New components that should be one of `creature` / `item` / `spell` / `player` data → [`entities/<Domain>/`](entities/).
- New magic numbers → [`config/`](config/), not inline.
- New VFX helpers → extend [`vfx.js`](vfx.js) and re-export from [`rendering/Renderer.js`](rendering/Renderer.js).
- New cross-module mutable state → [`state/`](state/) with the setter pattern (never `window.*` globals).
