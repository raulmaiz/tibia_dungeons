# `game/js/` — JavaScript modules

Frontend game code. Bundled by esbuild into `game/dist/` at build time.

> **First time here?** Read `/CLAUDE.md` and `/docs/architecture.md` instead. This README is the in-tree map; the docs explain *why*.

## Top-level files

| File | Owns |
|---|---|
| [`main.js`](main.js) | Entry point — imports `auth.js` + `runtime/main.runtime.js`. |
| [`auth.js`](auth.js) | Login + character-select shell. Routes through `offline-api.js` when `OFFLINE_BUILD`. *Slated for `ui/auth.js` in refactor Phase 2.* |
| [`dataService.js`](dataService.js) | JSON catalog loaders (`getCreatureDropTable`, `getItemShopCatalog`, …) + `imageUrl()` helper. |
| [`offline-api.js`](offline-api.js) | localStorage stub for `/api/*` calls in the itch.io build. Selected at build time via the `OFFLINE_BUILD` esbuild define. |
| [`vfx.js`](vfx.js) | Low-level Phaser draw routines (camera shake, sparks, beams). **Don't import directly** — go through [`rendering/Renderer.js`](rendering/Renderer.js). |
| [`loading-screen.js`](loading-screen.js) | Boot-time loading screen + changelog scroller (separate bundle entry). |

## Subfolders

| Folder | Purpose |
|---|---|
| [`config/`](config/) | All magic numbers (gameplay + visual). |
| [`core/`](core/) | Cross-cutting infrastructure (EventBus). |
| [`world/`](world/) | World↔screen coordinate transform (the iso seam). |
| [`rendering/`](rendering/) | SpriteFactory + Renderer shim (the Lights2D / post-FX seams). |
| [`systems/`](systems/) | Reusable behaviour modules (currently `lighting/`). |
| [`ui/`](ui/) | DOM panels (inventory, loading screen, panel layout). |
| [`data/`](data/) | Static data tables (no logic): spell FX, floor configs, version, changelog. |
| [`runtime/`](runtime/) | Boot wiring, shared mutable state, and the (still-large) game engine. |
| `creatures/` | Legacy: ability pattern inference. *Will move to `entities/Creature/` in refactor Phase 2.* |
| `dungeon/` | Procedural floor generator. |
| `mechanics/` | Progression curves + loot pity tracker. |
| `spells/` | Spell title blacklist. *Will move to `entities/Spell/` in refactor Phase 2.* |

## Naming conventions

- **PascalCase** for "module exports a single thing": `EventBus.js`, `Projection.js`, `SpriteFactory.js`, `LightItems.js`.
- **dot.notation** for config / engine markers: `game.config.js`, `visual.config.js`, `game.engine.js`, `playerSession.js`.
- **camelCase** for misc helpers / data files: `dataService.js`, `auth.js`, `floorAtmosphere.js`, `vfx.js`, `spellFxOverrides.js`.

There is no enforced rule today — pick the convention that matches what already exists in the same folder. *To be normalized in refactor Phase 5.*

## What NOT to add here

- New components that should be one of `creature` / `item` / `spell` / `player` data → put them in [`data/`](data/) (if pure data) or in the future `entities/<Domain>/` (if logic).
- New magic numbers → [`config/`](config/), not inline.
- New VFX helpers → extend [`vfx.js`](vfx.js) and re-export from [`rendering/Renderer.js`](rendering/Renderer.js).
