# `world/` — world↔screen abstraction

The single seam between game logic (which thinks in tile coordinates) and Phaser (which thinks in pixels). When the project migrates to isometric perspective, **only the file in this folder changes**.

## Files

- [`Projection.js`](Projection.js) — exports `worldToScreen(gx, gy) → {x, y}`, `screenToWorld(px, py) → {gx, gy}`, plus the orthogonal-only convenience helpers `worldX(gx)` and `worldY(gy)`. Reads `TILE_SIZE` from [`../config/game.config.js`](../config/game.config.js).

## The contract

Every coordinate transform in the codebase must go through this module:

```js
// ✅ correct
import { worldToScreen, worldX, worldY } from '../world/Projection.js';
const { x, y } = worldToScreen(creature.gx, creature.gy);

// ❌ regression — silently breaks the iso migration
const x = creature.gx * tileSize + tileSize / 2;
```

The engine's `centerX` / `centerY` are aliases for `worldX` / `worldY` — that's the only shortcut that's allowed (and it's documented as such inside the engine).

## ISO migration plan

When iso lands, `worldX` / `worldY` are deleted (they assume orthogonal projection where x/y are independent). All callers move to `worldToScreen(gx, gy)`. The change is mechanical because the call sites are concentrated inside the engine and `rendering/SpriteFactory.js`.
