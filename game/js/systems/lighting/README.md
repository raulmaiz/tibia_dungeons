# `systems/lighting/`

Tracks the equipped light source's burn schedule and bridges it into the atmosphere overlay (the on-screen darkness/light layer).

## Files

- [`LightItems.js`](LightItems.js) — owns the equipped-light state, resolves slot icons (full / medium / small / extinguished torch variants), parses item duration attributes, and ships the data to `floorAtmosphere` via a callback.

## State (private)

- `_currentLightItemState` — `{ articleId, title, radius, duration, startTime, initialElapsed }` for the currently-equipped light item.
- `_knownItemImages` — Set of CDN-known image filenames (used to check whether a `Lit X.gif` / `Used X.gif` variant exists).
- `_setEquipmentLight` — callback into `floorAtmosphere.setEquipmentLight()`. Wired once via `attachAtmosphereLightSink()` during scene `create()`.

## Burn schedule

Burn progress is tracked **per item instance** (`item._burnElapsedMs`), not per `article_id`. This avoids the bug where a fresh torch from the market would inherit another torch's elapsed burn (commit `ab50069`).

Slot-icon thresholds (configurable in [`../../config/visual.config.js`](../../config/visual.config.js)):

```
[0%, 50%)    Lit Torch.gif             (full flame)
[50%, 80%)   Lit Torch (Medium).gif    (half-consumed)
[80%, 100%)  Lit Torch (Small).gif     (nearly out)
[100%, ∞)    Torch (Small).gif         (extinguished)
```

Non-torch light items follow a generic 2-state pattern: `Lit <title>.gif` while burning, `Used <title>.gif` (or just `<title>.gif`) when expired.

## Wiring

```js
// Engine (during scene create()):
import { attachAtmosphereLightSink, applyCurrentLightStateToAtmosphere } from '../../systems/lighting/LightItems.js';

attachAtmosphereLightSink((r, d, e) => floorAtmosphere.setEquipmentLight(r, d, e));
applyCurrentLightStateToAtmosphere();
```

```js
// Inventory panel (on equip/unequip):
import { applyEquipmentLightFromItem, getCurrentLightElapsedMs } from '../systems/lighting/LightItems.js';

applyEquipmentLightFromItem(itemBeingEquipped);             // start the burn
itemBeingUnequipped._burnElapsedMs = getCurrentLightElapsedMs();  // stamp progress before stowing
applyEquipmentLightFromItem(null);                          // turn off
```

## Adding new light source items

If the new item has the standard 2-state pattern (just `Lit X.gif` + `Used X.gif`), nothing to do — the runtime picks them up via `hasItemImage()`.

If it needs special icon progression (like the torch's 4-stage burn), add a sentinel id constant in [`../../config/visual.config.js`](../../config/visual.config.js) and a special case in `getLightItemImage()`.

If it needs a non-default radius (default is 4 tiles), add a constant in `visual.config.js` and a branch in `lightRadiusForLightSourceItem()`.
