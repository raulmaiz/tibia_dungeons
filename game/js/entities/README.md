# `entities/` — domain modules grouped by entity

One subfolder per game-domain entity. The aim is that everything about a single entity (data, helpers, types, eventually classes) lives in **one place** so a session working on creatures opens one folder, not six.

## Subfolders

| Folder | Status | Owns |
|---|---|---|
| [`Creature/`](Creature/) | populated | ability-pattern inference + per-creature damage modifiers |
| [`Spell/`](Spell/) | populated | spell-title blacklist + per-spell VFX overrides |
| [`Item/`](Item/) | placeholder | **TODO** — currently most item logic still lives in [`../ui/inventoryPanel.js`](../ui/inventoryPanel.js). To be carved when the panel is split (refactor Phase 3) |
| [`Player/`](Player/) | placeholder | **TODO** — currently all player state lives in the engine `startGame()` closure. To be carved when the closure is broken (refactor Phase 4) |

## Convention

Each folder contains:

- `README.md` — what this entity is, what files live here, where the rest of its lifecycle lives if it spans multiple folders.
- One `.js` per concern (no `index.js` re-exporter — direct imports are fine and clearer).
- Pure-data files use `camelCase.js` (e.g. `damageModifiers.js`).
- Logic modules use `PascalCase.js` (e.g. eventually `Creature.js`).

## What does NOT belong here

- **Spawn / floor configuration** → [`../data/floorSpawnConfig.js`](../data/floorSpawnConfig.js). It's tuning, not entity definition. Even though it references creature ids, the lifecycle owner is the world (floors), not the creature.
- **Catalog data dumps** → [`/game/data/*.json`](../../data/). The entity folder consumes them, but they live with the JSON dump because they come from tibiawiki-sql.
- **Sprite construction** → [`../rendering/SpriteFactory.js`](../rendering/SpriteFactory.js). Entity folders own data + behaviour; sprite *construction* is its own seam.

## ISO migration note

When the engine closure is broken (refactor Phase 4) and `Creature` / `Player` become real classes, they land here. Until then the `Player/` and `Item/` folders are intentionally near-empty — they're claim-staking the directory.
