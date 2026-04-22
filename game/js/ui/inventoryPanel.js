// Inventory / character-select panel — orchestrator.
//
// All the actual work lives in `panels/` sub-modules. This file:
//   • wires `panelState.helpers.*` so sibling modules can call each other
//     without circular imports,
//   • initializes per-run mutable state on `panelState`,
//   • registers global DOM dismissers for the tooltip,
//   • calls each sub-module's `setup…()` entry point,
//   • exposes `setEquippedSlotVisual` / `clearEquippedSlotVisual` on
//     playerSession so the engine can mutate equip slots via that seam.
//
// The engine is the only external caller of `setupInventoryPanel(deps)` —
// it hands in `startGame` so the boot flow isn't a circular import.

import { progressionStatsForLevel } from '../mechanics/progression.js';
import {
  GOLD_COIN_ID,
  PLATINUM_COIN_ID,
  CRYSTAL_COIN_ID,
} from '../config/game.config.js';
import {
  setLastLootRejectReason,
  setInventorySetEquippedSlotVisual,
  setInventoryClearEquippedSlotVisual,
  setOnPlayerLevelStatsUpdate,
} from '../state/playerSession.js';

import { panelState } from './panels/state.js';
import { setHungryUi, installHungerWindowApi } from './panels/hunger.js';
import { setupCharacterSelect } from './panels/characterSelect.js';
import { hideItemTooltip } from './panels/itemTooltip.js';
import {
  ensureCoinTemplatesLoaded,
  normalizeCoinStacks,
  addCoinsToInventory,
  getTotalGoldInInventory,
  setCoinsFromTotalGold,
  spendGoldFromInventory,
} from './panels/coins.js';
import {
  setEquippedSlotVisual,
  canEquipItemInSlot,
  resolveEquipSlotForItem,
  clearEquippedSlotVisual,
  tryAutoEquipArmorUpgrade,
  tryAutoEquipShieldUpgrade,
  tryAutoEquipWeaponUpgrade,
  tryAutoEquipAccessory,
  resolveSellUnitPrice,
  applyCapacityForLevel,
} from './panels/equipment.js';
import {
  renderLootSlots,
  addLootItemToBag,
  setupLootBagContextMenu,
  setupEquippedSlotHandlers,
} from './panels/lootBag.js';
import { equipBagByArticleId } from './panels/equipFlow.js';
import { setupBootFlow } from './panels/bootFlow.js';
import { installDebugInventoryApi } from './panels/debugApi.js';

export function setupInventoryPanel(deps) {
  const { startGame } = deps;

  // Character-select UI (sex/class buttons + name input focus).
  setupCharacterSelect();

  // Hunger indicator. Lives on window.setHungryUi for the engine to call.
  installHungerWindowApi();
  setHungryUi(true, 0);

  // Wire sub-module helpers into panelState. Only the few cross-module
  // paths that would otherwise be circular imports need a slot here — the
  // rest of the codebase imports these functions directly.
  panelState.helpers.setEquippedSlotVisual     = setEquippedSlotVisual;
  panelState.helpers.clearEquippedSlotVisual   = clearEquippedSlotVisual;
  panelState.helpers.canEquipItemInSlot        = canEquipItemInSlot;
  panelState.helpers.resolveEquipSlotForItem   = resolveEquipSlotForItem;
  panelState.helpers.resolveSellUnitPrice      = resolveSellUnitPrice;
  panelState.helpers.tryAutoEquipArmorUpgrade  = tryAutoEquipArmorUpgrade;
  panelState.helpers.tryAutoEquipShieldUpgrade = tryAutoEquipShieldUpgrade;
  panelState.helpers.tryAutoEquipWeaponUpgrade = tryAutoEquipWeaponUpgrade;
  panelState.helpers.tryAutoEquipAccessory     = tryAutoEquipAccessory;
  panelState.helpers.renderLootSlots           = renderLootSlots;
  panelState.helpers.addLootItemToBag          = addLootItemToBag;
  panelState.helpers.equipBagByArticleId       = equipBagByArticleId;
  panelState.helpers.ensureCoinTemplatesLoaded = ensureCoinTemplatesLoaded;
  panelState.helpers.normalizeCoinStacks       = normalizeCoinStacks;
  panelState.helpers.addCoinsToInventory       = addCoinsToInventory;
  panelState.helpers.getTotalGoldInInventory   = getTotalGoldInInventory;
  panelState.helpers.setCoinsFromTotalGold     = setCoinsFromTotalGold;
  panelState.helpers.spendGoldFromInventory    = spendGoldFromInventory;

  // All inventory state lives on panelState (declared in panels/state.js).
  // Initialize the per-run mutable bits here at boot time.
  panelState.currentBagItem = null;
  panelState.currentPlayerCapacity = progressionStatsForLevel(1, panelState.selectedClass).capacity;
  setLastLootRejectReason('');
  panelState.equippedSlots = {
    armor: null, shield: null, legs: null, boots: null, ring: null,
    ammunition: null, helmet: null, amulet: null, hand: null,
  };
  panelState.bagLootItems = [];
  panelState.coinTemplateById = new Map([
    [GOLD_COIN_ID,     { id: GOLD_COIN_ID,     title: 'Gold Coin',     isStackable: true, raw: { article_id: GOLD_COIN_ID,     value_sell: 1,     value_buy: 1,     weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [PLATINUM_COIN_ID, { id: PLATINUM_COIN_ID, title: 'Platinum Coin', isStackable: true, raw: { article_id: PLATINUM_COIN_ID, value_sell: 100,   value_buy: 100,   weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [CRYSTAL_COIN_ID,  { id: CRYSTAL_COIN_ID,  title: 'Crystal Coin',  isStackable: true, raw: { article_id: CRYSTAL_COIN_ID,  value_sell: 10000, value_buy: 10000, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
  ]);

  // Global tooltip dismissers (hover-mode and touch-mode).
  window.addEventListener('blur', hideItemTooltip);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideItemTooltip();
  });
  document.addEventListener('keydown', hideItemTooltip);
  document.addEventListener('click', (ev) => {
    // Don't dismiss touch-mode tooltip when clicking inside it (action buttons)
    const tt = document.getElementById('itemTooltip');
    if (tt && tt.classList.contains('touch-mode') && tt.contains(/** @type {Node} */ (ev.target))) return;
    hideItemTooltip();
  });

  // Expose equip visual mutators to combat/runtime code outside the panel
  // (engine spell/armor overrides read these via playerSession).
  setInventorySetEquippedSlotVisual(setEquippedSlotVisual);
  setInventoryClearEquippedSlotVisual(clearEquippedSlotVisual);

  applyCapacityForLevel(1);
  setOnPlayerLevelStatsUpdate((level) => applyCapacityForLevel(level));

  setupLootBagContextMenu();
  setupEquippedSlotHandlers();
  installDebugInventoryApi();
  setupBootFlow({ startGame });
}
