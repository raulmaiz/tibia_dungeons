# `rendering/` — entity sprites + VFX facade

The two seams that future visual work plugs into. Today these are minimal pass-throughs; that's intentional.

## Files

- [`SpriteFactory.js`](SpriteFactory.js) — every entity sprite (player, creature, ground tile, fire field, poison field) is constructed here. Owns `frameTextureName` / `deathTextureName` / `creatureKey` / `applyCreatureSize` plus six `createXxx(scene, …)` factory functions.
- [`Renderer.js`](Renderer.js) — re-export shim over [`../vfx.js`](../vfx.js). Engine imports VFX from here instead of from `vfx.js` directly.

## The contracts

```js
// ✅ correct
import { createCreatureSprite } from '../rendering/SpriteFactory.js';
import { tileSpellBurst } from '../rendering/Renderer.js';

const sprite = createCreatureSprite(scene, textureKey, gx, gy);
tileSpellBurst(scene, x, y, tileSize, color);

// ❌ regression — bypasses future Lights2D pipeline / post-FX wrapping
const sprite = scene.add.sprite(centerX(gx), centerY(gy), textureKey);
import { tileSpellBurst } from '../vfx.js';
```

## Why both files exist

When the visual work lands:

- **Normal maps + `Phaser.Lights2D`** plug into `SpriteFactory.createCreatureSprite` once (`sprite.setPipeline('Light2D')` + normal-map texture binding). Every spawned creature inherits the new pipeline. No engine changes.
- **Per-entity post-FX** (bloom on bosses, outline shaders on the player) plug in here too.
- **Scene-wide post-FX** (vignette, color grading, screen-shake variants) wrap individual exports of `Renderer.js`. The engine still imports the same names — wrapping is invisible.

## Caveats

- **`vfx.js` is the implementation.** It has all the actual draw routines. `Renderer.js` is just a re-export. Touch `vfx.js` to add a new VFX function, then add it to `Renderer.js`.
- **The ground-loot marker** is the one entity sprite NOT in `SpriteFactory` — it has a Y offset to look like a "badge" hovering over the tile. Centralising it would hide the offset quirk. Lives inline in [`../runtime/core/engine/game.engine.js`](../runtime/core/engine/game.engine.js).
- **`floorAtmosphere.js`** does its own draw routines (decorative wall/floor motifs). It's NOT routed through here because its arithmetic is tile-relative (`tileSize * 0.55`-style sizing), not world-coordinate. Its iso migration will be separate.
