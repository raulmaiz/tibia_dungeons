# `ui/` — DOM panels

Everything that touches the DOM. Panels are mounted at boot and live for the entire session (no scene teardown).

## Files

- [`inventoryPanel.js`](inventoryPanel.js) — orchestrator for the character-select / inventory / loot / equip / boot flow. **~130 lines** of pure wiring after Phase 3b; every piece of panel logic lives in [`panels/`](panels/).
- [`loadingScreen.js`](loadingScreen.js) — single `setLoadingProgress(pct, label)` function that updates the `#loadingBar` / `#loadingLabel` / `#loadingPct` DOM nodes. Imported by both engine (preload) and panel (bootGame).
- [`panelLayout.js`](panelLayout.js) — Phaser↔DOM panel sync wiring (sidebar widths, toggle buttons).
- [`auth.js`](auth.js) — login + character-select shell. Routes through `offline-api.js` when `OFFLINE_BUILD`.

## Subfolders

- [`panels/`](panels/) — inventory-panel sub-modules (`state`, `constants`, `characterSelect`, `hunger`, `accessoryTimers`, `itemTooltip`, `coins`, `equipment`, `lootBag`, `equipFlow`, `bootFlow`, `debugApi`). See [`panels/README.md`](panels/README.md).

## The `setupInventoryPanel(deps)` orchestrator

The panel is mounted by the engine via:

```js
setupInventoryPanel({ startGame });
```

Internally `inventoryPanel.js`:

1. Owns `selectedSex` / `selectedClass` / `playerConfig` as private locals (only it reads/writes them).
2. Reads live bindings from [`../state/playerSession.js`](../state/playerSession.js) for the cross-module callbacks (`onPanelLog`, `onConsumeFood`, `onUseLiquid`, `onUseTool`, `lastLootRejectReason`).
3. Calls setters from playerSession to publish its own callbacks to the engine (`setOnPlayerLevelStatsUpdate`, `setInventorySetEquippedSlotVisual`, etc.).
4. On `startBtn` click → `bootGame(cfg)` → `loadEngineData()` (engine-side) + `equipBagByArticleId()` + `ensureCoinTemplatesLoaded()` (panel-side) → `startGame(playerConfig)`.
5. Exposes `window.tdGame = { resume, getCurrentSaveId, setCurrentSaveId, deleteCurrentSave }` for the saves screen.

## DOM contract

Every selector the panel uses is hardcoded against the markup in [`/game/index.html`](../../index.html). Notable IDs:

- Character select: `#choiceMale`, `#choiceFemale`, `#classKnight`/`Paladin`/`Sorcerer`/`Druid`, `#startBtn`, `#playerName`.
- Equipment slots: `#slot{Helmet,Bag,Hand,Armor,Shield,Ring,Legs,Ammo,Boots,Light,Amulet}` + `…Img` + `…Label`.
- Loot bag: `#lootContextMenu`, `#discardLootBtn`.
- Status: `#hungryIndicator`, `#hungryLabel`, `#equipmentFootText`.
- Loading: `#loadingOverlay`, `#loadingBar`, `#loadingPct`, `#loadingLabel`.
- Saves: `#savesOverlay`, `#startOverlay`.

## What does NOT belong here

- Game logic (combat, AI, movement) → engine.
- Pure data → [`../data/`](../data/).
- VFX (Phaser draws) → [`../rendering/`](../rendering/).
- DOM-only DOM helpers → keep them inline inside the panel until/unless they're shared.
