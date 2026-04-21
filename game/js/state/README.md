# `state/` — shared mutable state across modules

Modules that hold mutable bindings consumed by other modules. Today only one — but the folder exists so future state buckets land here predictably instead of getting tucked into random places.

## Files

- [`playerSession.js`](playerSession.js) — eight callbacks plus `lastLootRejectReason`. Bridges the inventory panel and the engine.

## The setter pattern

ES module exports are *bindings*, not values. The reader sees the writer's update if both import the same `let` export. Writes have to go through a setter because imported bindings are read-only:

```js
// state/playerSession.js
export let onPanelLog = null;
export function setOnPanelLog(fn) { onPanelLog = fn; }
```

```js
// ui/inventoryPanel.js  (writer)
import { setOnPanelLog } from '../state/playerSession.js';
setOnPanelLog(addCombatLog);   // ✅
// onPanelLog = addCombatLog;  // ❌ TypeError: Assignment to constant variable
```

```js
// engine/game.engine.js  (reader)
import { onPanelLog } from '../state/playerSession.js';
if (typeof onPanelLog === 'function') onPanelLog('Combat ready.');   // ✅ live binding
```

When in doubt, pick this pattern over:
- `window.X` globals (untyped, no module graph signal).
- Direct cross-module references (creates circular imports the moment a third consumer appears).
- Singletons with method-call mutation (works but adds boilerplate when a `let` export is enough).

## When to add a new file here

Add a new file when:

1. The state is needed by **two or more** modules.
2. Sharing it through one of the existing seams (EventBus events, Projection, Renderer) doesn't fit.
3. The state is genuinely run-state-mutable, not config (constants → [`../config/`](../config/)).

Otherwise prefer keeping state inside the owning module.
