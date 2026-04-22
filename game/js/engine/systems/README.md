# `engine/systems/` — Phase 4 extractions from the `startGame()` closure

The engine's `startGame()` function still holds ~5.7k lines of scene + combat + AI + save logic in a single closure. Phase 4 of the agent-ergonomics refactor peels cohesive slices out into modules here.

Rules for living in this folder:

- **Prefer pure functions.** A module in here should not capture engine state via closure — it should receive it as arguments (snapshot, ctx, scene, …) or mutate containers the caller passes in.
- **Mutable state lives in the engine until a matching `Player` / `Creature` / `RunState` object exists.** When we have objects, these functions will mutate those directly and the engine's `let` bindings will disappear.
- **No engine imports.** These modules must not import from `game.engine.js` (would be circular). Use the `../core/EventBus.js` bus for anything that wants to react.

## Files

| File | Scope |
|---|---|
| [`SaveLoad.js`](SaveLoad.js) | `captureSaveSnapshot(ctx)` builds the JSON snapshot for `/api/saves`. `restoreWeaponSkills(map, snap)` + `restoreLearnedSpells(ids, order, snap)` rehydrate the corresponding containers in place during the engine's resume flow. |

## Planned (not yet landed)

- `Combat.js` — player attack, damage rolls, ammo, crits.
- `Movement.js` — direction handling, action throttling.
- `AI.js` — creature target pick + ability pick.
- `Spawn.js` — `descendLevel`, dungeon gen wiring, creature spawn.
- `Scene.js` or similar — Phaser lifecycle + system orchestration.

Most of these need a `Player` / `RunState` object to exist first so they can mutate that instead of closure `let`s. Work in small slices and smoke-test each.
