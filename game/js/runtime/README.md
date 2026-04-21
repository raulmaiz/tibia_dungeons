# `runtime/` — boot wiring + shared state + the engine

The runtime is the orchestration layer between the panel (UI) and the engine (game). Most of what's here is small *except* the engine itself.

## Files

- [`main.runtime.js`](main.runtime.js) — entry hop from `/main.js`. One-liner that imports the bootstrap.
- [`playerSession.js`](playerSession.js) — **shared mutable state** between the engine and the inventory panel. Eight callbacks + one flag. Each is a `let` export with a matching `set<Name>()` helper because ESM imports are read-only. **Never reassign the imported binding** — call the setter.

## Subfolders

- [`bootstrap/`](bootstrap/) — boot sequencer. `game.bootstrap.js` is what `main.runtime.js` imports.
- [`core/engine/`](core/engine/) — the game engine. **Big.**

## The playerSession pattern (read this once)

```js
// playerSession.js
export let onPanelLog = null;
export function setOnPanelLog(fn) { onPanelLog = fn; }
```

```js
// inventoryPanel.js (the writer)
import { setOnPanelLog } from '../runtime/playerSession.js';
setOnPanelLog(addCombatLog);   // ✅ correct
// onPanelLog = addCombatLog;  // ❌ throws — ESM imports are read-only
```

```js
// engine.js (the reader)
import { onPanelLog } from '../../playerSession.js';
if (typeof onPanelLog === 'function') onPanelLog('Combat ready.');   // ✅ live binding
```

The reader sees the writer's update because module bindings are live, not snapshots. This is the pattern for any new cross-module mutable state — never globals on `window`, never circular imports.

## What's in `core/engine/`

The **monolith** that drives gameplay. See [`core/engine/README.md`](core/engine/README.md).

## What does NOT belong here

- DOM panels → [`../ui/`](../ui/).
- Static data → [`../data/`](../data/).
- Pure helpers (math, formatters) → [`core/engine/`](core/engine/) for now (they live inside the engine closure); will move to `engine/helpers/` in **refactor Phase 4**.
