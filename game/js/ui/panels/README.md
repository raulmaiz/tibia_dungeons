# `ui/panels/` — inventory-panel sub-modules

Decomposition of the former 1.6k-line `ui/inventoryPanel.js` into focused sibling files. Each sub-module has one concern and is ≤300 lines.

## Files

| File | Owns |
|---|---|
| [`state.js`](state.js) | `panelState` — the shared mutable state + cross-module helper references. Every sub-module imports from here. |
| [`constants.js`](constants.js) | `SLOT_RULES`, `ARMOR_AUTO_SLOT_BY_TYPE`, `COIN_TEMPLATE_SEEDS`. Pure data, no logic. |
| [`characterSelect.js`](characterSelect.js) | Sex / class buttons + player-name input focus. Writes `panelState.selectedSex`/`selectedClass`. |
| [`hunger.js`](hunger.js) | `setHungryUi` + `installHungerWindowApi` (exposes `window.setHungryUi` for the engine). |
| [`accessoryTimers.js`](accessoryTimers.js) | Ring / amulet duration countdown — clears the slot + logs expiry when the timer hits zero. |
| [`itemTooltip.js`](itemTooltip.js) | Hover + touch-mode tooltip: `formatItemTooltip` (HTML generator), `bindTooltip` (desktop hover), `showTouchLootTooltip` (tap-mode action sheet), plus `escapeHtml` and `getFoodTimeSeconds` helpers. |

## Still in `../inventoryPanel.js`

The **stateful core** that hasn't been carved yet (Phase 3b of the refactor):

- Equipment slot logic: `setEquippedSlotVisual`, `canEquipItemInSlot`, `resolveEquipSlotForItem`, `clearEquippedSlotVisual`, `tryAutoEquipArmorUpgrade` / `ShieldUpgrade` / `WeaponUpgrade` / `Accessory`, `resolveSellUnitPrice`.
- Loot bag: `renderLootSlots`, `addLootItemToBag`, `showLootContextMenu`, `hideLootContextMenu`.
- Coin management: `ensureCoinTemplatesLoaded`, `normalizeCoinStacks`, `addCoinsToInventory`, `getTotalGoldInInventory`, `setCoinsFromTotalGold`, `spendGoldFromInventory`.
- Equip flow: `equipBagByArticleId`, `equipItemInSlot`.
- Boot flow: `bootGame`, `startBtn` click handler, `window.tdGame` assignment, `playerNameInput` keydown.

These share state heavily (`equippedSlots`, `bagLootItems`, `currentBagCapacity`, `currentBagItem`, `currentPlayerCapacity`) and will move to sibling files in Phase 3b once the full state is migrated to `panelState`.

## The `panelState.helpers` pattern

Sub-modules that need to call back into panel-internal functions (e.g. `accessoryTimers` calling `clearEquippedSlotVisual` and `renderLootSlots`, or `itemTooltip` calling `resolveEquipSlotForItem`) do so through `panelState.helpers.<name>()`. The orchestrator in [`../inventoryPanel.js`](../inventoryPanel.js) wires these once at the top of `setupInventoryPanel`.

This avoids import cycles: sub-modules import `panelState` only; panel-internal functions are attached by name, not imported. When Phase 3b lands and those helpers move to their own files, the `panelState.helpers` slots get wired from those files instead — all call sites inside sub-modules continue to work unchanged.

## Adding a new sub-module

1. Create `panels/<Name>.js`.
2. Import `panelState` (and anything else you need from outside the panel).
3. If your module needs to *call back* into panel-internal functions (e.g. `setEquippedSlotVisual`), use `panelState.helpers.<name>(...)`.
4. If your module needs to *expose* functions that other sub-modules will call, add a field in `panelState.helpers` in [`state.js`](state.js) and wire it from the orchestrator.
5. Import + call it from `inventoryPanel.js`.
6. Update this README.
