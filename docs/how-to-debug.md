# How to debug

Where to look when something is wrong. The runtime has no central logger — most signals are in the browser console, the in-game combat log, or the DOM stats bar.

## First: separate the two failure modes

| Symptom | Likely cause | First check |
|---|---|---|
| Page is blank / spinner stuck on "Loading creature data..." | Module import failed at parse time | DevTools Console — look for `ReferenceError`, `Cannot find module`, 404 on a `.js` file |
| Page loads, character select shows, "Enter Dungeon" hangs | `bootGame()` threw inside a Promise | DevTools Console — `loadEngineData` / `equipBagByArticleId` / `setLoadingProgress` ReferenceError most likely culprits |
| Game starts, then crashes on first attack / loot / spell | Runtime ReferenceError inside an event-loop callback | DevTools Console + the stack trace's first non-Phaser frame |
| Game runs but a number / behavior is wrong | Logic bug | In-game combat log first, then `git blame` the relevant function |

## Tools

### Browser console (always tab 1)

- `tdEvents` — the EventBus. Use `tdEvents.on('entity:died', e => console.log(e))` to instrument anything mid-session. Catalog of events: [`game/js/core/EventBus.js`](../game/js/core/EventBus.js).
- `tdGame` — `{ resume, getCurrentSaveId, setCurrentSaveId, deleteCurrentSave }`. Set up in [`game/js/ui/inventoryPanel.js`](../game/js/ui/inventoryPanel.js).
- `tdAuth` — auth state from [`game/js/ui/auth.js`](../game/js/ui/auth.js). Useful to check `tdAuth.isLoggedIn()`.
- `debugInventory` — `{ addGold, addLoot }`. Hand-craft inventory state without playing the game.
- `_resetInventoryForNewRun` — wipe the bag/equipment without restarting.

### In-game combat log

The 5 most recent `.game-log-row` elements show what just happened in player-readable form. Combat outcomes, level-ups, loot pickups, deaths. If gameplay seems off, this is usually the fastest signal.

### Stats bar selectors

`#sbHpText`, `#sbMpText`, `#sbLevel`, `#sbFloor`, `#sbML`, `#sbFist`, `#sbShield`, `#sbCap`, `#sbCharName`, `#sbCreatures` — all are populated continuously. Read them from the console (`document.getElementById('sbHpText').textContent`).

### Network tab

API failures show here. Common ones:
- 401 `/api/auth/me` — session expired, normal during dev
- 429 `/api/auth/register` — rate-limited (5 registrations per IP)
- 500 `/api/saves` — usually means the local JSON store got corrupted; delete `.saves.local.json` and retry

### Service worker

After moving files: `Application` tab → `Service Workers` → check the cache version. If still `tibia-dungeons-v6` (or older), bump `CACHE` in [`game/sw.js`](../game/sw.js), unregister the SW, hard-refresh.

## Common runtime errors and what they mean

### `Uncaught ReferenceError: <name> is not defined`

Some symbol used by the inventoryPanel or engine is no longer in scope after a refactor. Walk the stack: if it points at a function call inside a callback, the symbol is probably an engine helper that wasn't exported, or a module-scope `let` that got moved without updating the imports.

### `TypeError: Cannot read properties of undefined (reading 'X')`

Usually a state object that wasn't initialized at the time the code ran. Frequent in `loadEngineData()` — check whether the catalog (creatures/items/spells) finished loading before the consumer fires.

### Sprite at the wrong position / wrong size

You probably bypassed the rendering layer. Search for raw `this.add.sprite(` in the engine — it should always go through `createCreatureSprite` / `createPlayerSprite` etc. from [`game/js/rendering/SpriteFactory.js`](../game/js/rendering/SpriteFactory.js). Same for `gx * tileSize + tileSize/2` math — always `worldToScreen()` from [`game/js/world/Projection.js`](../game/js/world/Projection.js).

### "Loot bag is full" but the bag is clearly not full

`lastLootRejectReason` distinguishes `'capacity'` (weight) from `'slots'`. Capacity = item weight × stack count > player capacity. Set in [`game/js/state/playerSession.js`](../game/js/state/playerSession.js).

### Light not turning on after equipping a torch

`attachAtmosphereLightSink()` may have failed to fire (called once during scene `create()`). The torch state itself is in [`game/js/systems/lighting/LightItems.js`](../game/js/systems/lighting/LightItems.js). Check `tdEvents.on('coins:changed', …)` is firing too — if events are dead, the engine probably never fully booted.

## Reproduction recipes

### Force a specific class / sex

Pre-fill before `bootGame`:

```js
// In console BEFORE clicking "Enter Dungeon":
document.getElementById('classKnight').click();
document.getElementById('choiceMale').click();
document.getElementById('playerName').value = 'TestKnight';
document.getElementById('startBtn').click();
```

Or use the bot: `TD_MODE=guest TD_FORCE_CLASS=knight node scripts/playtest.js` (env var support in [`scripts/playtest.js`](../scripts/playtest.js)).

### Speed-run to a target floor

Skip combat with debug helpers from the console:

```js
// instakill nearby creatures (doesn't exist out of the box — add a temporary helper inside startGame)
// alternative: use debugInventory to add gold + a powerful weapon, then descend manually
debugInventory.addGold(100000);
debugInventory.addLoot({ id: <weapon_id>, title: 'Cheat Sword', /* … */ });
```

### Check what changed since last working version

```bash
git log --oneline -20
git diff HEAD~1 -- game/js/engine/game.engine.js
```

Most recent regression-prone files: the engine, `inventoryPanel.js`, and anything in `runtime/`.

## When all else fails

The previous working state is a `git revert` away. The refactor commit history is intentionally atomic — every commit boots cleanly. `git bisect run node scripts/build.js` will narrow a build break to a single commit fast.
