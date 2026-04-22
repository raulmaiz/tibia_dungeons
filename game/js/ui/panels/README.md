# `ui/panels/` — inventory-panel sub-modules

Decomposition of the former 1.6k-line `ui/inventoryPanel.js` into focused sibling files. The orchestrator (`../inventoryPanel.js`) is now ~130 lines of wiring; every piece of actual logic lives in one of the files below.

## Files

| File | Owns |
|---|---|
| [`state.js`](state.js) | `panelState` — the shared mutable state + cross-module helper references. Every sub-module imports from here. |
| [`constants.js`](constants.js) | `SLOT_RULES`, `ARMOR_AUTO_SLOT_BY_TYPE`. Pure data, no logic. |
| [`characterSelect.js`](characterSelect.js) | Sex / class buttons + player-name input focus. Writes `panelState.selectedSex`/`selectedClass`. |
| [`hunger.js`](hunger.js) | `setHungryUi` + `installHungerWindowApi` (exposes `window.setHungryUi` for the engine). |
| [`accessoryTimers.js`](accessoryTimers.js) | Ring / amulet duration countdown — clears the slot + logs expiry when the timer hits zero. |
| [`itemTooltip.js`](itemTooltip.js) | Hover + touch-mode tooltip: `formatItemTooltip`, `bindTooltip`, `showTouchLootTooltip`, plus `escapeHtml` / `getFoodTimeSeconds` helpers. |
| [`coins.js`](coins.js) | `ensureCoinTemplatesLoaded`, `normalizeCoinStacks`, `addCoinsToInventory`, `getTotalGoldInInventory`, `setCoinsFromTotalGold`, `spendGoldFromInventory`. Emits `coins-changed` + `EVENTS.COINS_CHANGED`. |
| [`equipment.js`](equipment.js) | Equipment-slot mutation + auto-equip rules: `setEquippedSlotVisual`, `clearEquippedSlotVisual`, `canEquipItemInSlot`, `resolveEquipSlotForItem`, `tryAutoEquip*`, `resolveSellUnitPrice`, `applyCapacityForLevel`, `writeEquipmentFootText`. |
| [`lootBag.js`](lootBag.js) | Loot-bag rendering + insertion + right-click context menu + equipped-slot sell/unequip handlers: `renderLootSlots`, `addLootItemToBag`, `showLootContextMenu`, `hideLootContextMenu`, `setupLootBagContextMenu`, `setupEquippedSlotHandlers`. |
| [`equipFlow.js`](equipFlow.js) | Async equipment flows: `equipBagByArticleId`, `equipItemInSlot` (catalog lookup + validation + delegation to `setEquippedSlotVisual`). |
| [`bootFlow.js`](bootFlow.js) | `setupBootFlow({ startGame })` — wires "Enter Dungeon" click, Enter key, `window.tdGame` (resume / delete / save-id), `window._resetInventoryForNewRun`. Holds the `_starting` / `currentSaveId` closure state. |
| [`debugApi.js`](debugApi.js) | `installDebugInventoryApi()` — attaches `window.debugInventory` for console poking (equip by article_id, dump state, add/spend gold, find/consume items). |

## The `panelState.helpers` pattern

Sub-modules that would otherwise cause a circular import call back through `panelState.helpers.<name>()`. The orchestrator in [`../inventoryPanel.js`](../inventoryPanel.js) wires these once at the top of `setupInventoryPanel`. `state.js` declares every slot upfront so the contract is visible in one place.

Current cross-module paths using helpers:

- `equipment.js` → `lootBag.js` (`addLootItemToBag`) for the two-handed ↔ shield swap that dumps the displaced item into the bag.
- `lootBag.js` → `equipFlow.js` (`equipBagByArticleId`) for left-click on a container inside the bag.

Every other inter-module call is a direct ES module import — helpers is the escape hatch, not the default.

## Adding a new sub-module

1. Create `panels/<Name>.js`.
2. Import `panelState` (and anything else you need).
3. If a call would be a circular import, route it through `panelState.helpers.<name>(...)` and add a slot in [`state.js`](state.js).
4. Import + call your `setup…()` or exported functions from `inventoryPanel.js`.
5. Update this README.
