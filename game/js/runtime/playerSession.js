// Shared session state. Phase 5b of the architectural refactor — owns the
// mutable callbacks and one-shot flags that bridge the inventory panel
// (game/js/ui/inventoryPanel.js) and the in-game engine
// (game/js/runtime/core/engine/game.engine.js).
//
// Why this module exists: ES modules export *bindings*, not values. By
// declaring these as `let` exports plus typed setters we let the engine
// keep its `if (typeof onPanelLog === 'function') onPanelLog(...)` style
// reads while the panel writes the actual function via setOnPanelLog().
// Without this layer the two consumers would need a circular import.
//
// Naming convention: every binding has a matching set<Name>() helper.
// Engines/panels NEVER reassign the imported binding directly (ESM
// imports are read-only); always go through the setter.

// ── Combat-log sink (panel → engine via inventoryPanel render path) ──────
export let onPanelLog = null;
export function setOnPanelLog(fn) { onPanelLog = fn; }

// ── Consumable callbacks (engine → panel: hunger ticks, etc.) ────────────
export let onConsumeFood = null;
export function setOnConsumeFood(fn) { onConsumeFood = fn; }

export let onUseLiquid = null;
export function setOnUseLiquid(fn) { onUseLiquid = fn; }

export let onUseTool = null;
export function setOnUseTool(fn) { onUseTool = fn; }

// ── Player progression callback (engine → panel: stat refresh on level up)
export let onPlayerLevelStatsUpdate = null;
export function setOnPlayerLevelStatsUpdate(fn) { onPlayerLevelStatsUpdate = fn; }

// ── Equipment-slot visual mutators (panel → engine for ammo refresh, etc)
export let inventorySetEquippedSlotVisual = null;
export function setInventorySetEquippedSlotVisual(fn) { inventorySetEquippedSlotVisual = fn; }

export let inventoryClearEquippedSlotVisual = null;
export function setInventoryClearEquippedSlotVisual(fn) { inventoryClearEquippedSlotVisual = fn; }

// ── Loot-rejection reason (panel → market UI for "couldn't add" messages)
export let lastLootRejectReason = '';
export function setLastLootRejectReason(reason) { lastLootRejectReason = reason || ''; }
