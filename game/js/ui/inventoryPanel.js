// Inventory / character-select panel. Phase 5b of the architectural refactor.
// Moved verbatim from the 1583-line setupSelectorUI() that used to live at the
// top of game.engine.js. No logic changes — this is pure lift-and-shift —
// except that writes to module-shared state now go through setter calls
// exported by runtime/playerSession.js instead of direct reassignment.
//
// Owns (private to this module):
//   • panelState.selectedSex / panelState.selectedClass — chosen on the character screen
//   • panelState.playerConfig                — boot payload fed to startGame()
//   • bootGame / _starting        — one-shot guard + game boot
//   • currentSaveId               — backing store for window.tdGame API
//   • equippedSlots / bagLootItems / panelState.currentBagCapacity — inventory state
//
// Reads live bindings from runtime/playerSession.js:
//   • onPanelLog (combat-log sink), onConsumeFood, onUseLiquid, onUseTool
//   • lastLootRejectReason (for market-shop "can't buy" feedback)
//
// Exposes through window.* (contract with auth.js + engine update loop):
//   • tdGame { resume, getCurrentSaveId, setCurrentSaveId, deleteCurrentSave }
//   • setHungryUi, debugInventory, _resetInventoryForNewRun
//
// Dep injection: engine passes `startGame` in so we don't circular-import it.

import {
  getItemByArticleId,
  imageUrl,
} from '../dataService.js';
import { progressionStatsForLevel } from '../mechanics/progression.js';
import {
  GOLD_COIN_ID,
  PLATINUM_COIN_ID,
  CRYSTAL_COIN_ID,
  GOLD_PER_PLATINUM,
  PLATINUM_PER_CRYSTAL,
  START_BAG_ARTICLE_ID,
  MAX_FOOD_SECONDS,
} from '../config/game.config.js';
import { LIGHT_ITEM_ID_TORCH } from '../config/visual.config.js';
import {
  applyEquipmentLightFromItem,
  getCurrentLightElapsedMs,
  getLootLightItemImage,
} from '../systems/lighting/LightItems.js';
import {
  onPanelLog,
  onConsumeFood,
  onUseLiquid,
  onUseTool,
  lastLootRejectReason,
  setLastLootRejectReason,
  setInventorySetEquippedSlotVisual,
  setInventoryClearEquippedSlotVisual,
  setOnPlayerLevelStatsUpdate,
} from '../state/playerSession.js';
import { setLoadingProgress } from './loadingScreen.js';
import { bus, EVENTS } from '../core/EventBus.js';
// loadEngineData mutates engine-scope state (creature/spell/items
// catalogs + ammo cache) so it has to live in the engine module.
import { loadEngineData } from '../engine/game.engine.js';

// ── panel sub-modules (Phase 3a extractions) ────────────────────────────
import { panelState } from './panels/state.js';
import { SLOT_RULES, ARMOR_AUTO_SLOT_BY_TYPE } from './panels/constants.js';
import { setHungryUi, installHungerWindowApi } from './panels/hunger.js';
import { setupCharacterSelect } from './panels/characterSelect.js';
import { startAccessoryTimer, stopAccessoryTimer } from './panels/accessoryTimers.js';
import {
  hideItemTooltip,
  getFoodTimeSeconds,
  escapeHtml,
  formatItemTooltip,
  bindTooltip,
  showTouchLootTooltip,
} from './panels/itemTooltip.js';

// DOM helper local to this module. Rewrites the equipment-panel footer
// text without disturbing the status chips that live alongside it.
function writeEquipmentFootText(text) {
  const textEl = document.getElementById('equipmentFootText');
  if (textEl) textEl.textContent = String(text == null ? '' : text);
}

export function setupInventoryPanel(deps) {
  const { startGame } = deps;
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  const lootContextMenu = document.getElementById('lootContextMenu');
  const discardLootBtn = document.getElementById('discardLootBtn');

  // Character-select UI (sex/class buttons + name input focus).
  setupCharacterSelect();

  // Hunger indicator. Lives on window.setHungryUi for the engine to call.
  installHungerWindowApi();
  setHungryUi(true, 0);

  // Wire sub-module helpers into panelState so accessoryTimers + itemTooltip
  // can call back into the still-local functions (resolveEquipSlotForItem,
  // resolveSellUnitPrice, clearEquippedSlotVisual, renderLootSlots). Function
  // declarations are hoisted so these references resolve correctly even though
  // the functions are defined later in this file.
  panelState.helpers.resolveEquipSlotForItem = resolveEquipSlotForItem;
  panelState.helpers.resolveSellUnitPrice    = resolveSellUnitPrice;
  panelState.helpers.clearEquippedSlotVisual = clearEquippedSlotVisual;
  panelState.helpers.renderLootSlots         = renderLootSlots;

  // currentBagCapacity lives on panelState (initialized to 0 in state.js).
  let currentBagItem = null;
  let currentPlayerCapacity = progressionStatsForLevel(1, panelState.selectedClass).capacity;
  setLastLootRejectReason('');
  const equippedSlots = {
    armor: null,
    shield: null,
    legs: null,
    boots: null,
    ring: null,
    ammunition: null,
    helmet: null,
    amulet: null,
    hand: null,
  };
  // Sub-modules (accessoryTimers, itemTooltip) read equippedSlots via
  // panelState.equippedSlots. Share the reference so local reads and
  // sub-module reads stay in sync.
  panelState.equippedSlots = equippedSlots;
  let bagLootItems = [];
  const coinTemplateById = new Map([
    [GOLD_COIN_ID, { id: GOLD_COIN_ID, title: 'Gold Coin', isStackable: true, raw: { article_id: GOLD_COIN_ID, value_sell: 1, value_buy: 1, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [PLATINUM_COIN_ID, { id: PLATINUM_COIN_ID, title: 'Platinum Coin', isStackable: true, raw: { article_id: PLATINUM_COIN_ID, value_sell: 100, value_buy: 100, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [CRYSTAL_COIN_ID, { id: CRYSTAL_COIN_ID, title: 'Crystal Coin', isStackable: true, raw: { article_id: CRYSTAL_COIN_ID, value_sell: 10000, value_buy: 10000, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
  ]);

  let lootContextIndex = -1;
  window.addEventListener('blur', hideItemTooltip);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideItemTooltip();
  });
  document.addEventListener('keydown', hideItemTooltip);
  document.addEventListener('click', (ev) => {
    // Don't dismiss touch-mode tooltip when clicking inside it (action buttons)
    if (itemTooltip && itemTooltip.classList.contains('touch-mode') && itemTooltip.contains(ev.target)) return;
    hideItemTooltip();
  });
  const hideLootContextMenu = () => {
    if (!lootContextMenu) return;
    lootContextMenu.style.display = 'none';
    lootContextIndex = -1;
  };
  const showLootContextMenu = (x, y, index) => {
    if (!lootContextMenu) return;
    lootContextIndex = index;
    lootContextMenu.style.display = 'block';
    lootContextMenu.style.left = `${Math.min(window.innerWidth - 140, Math.max(0, x))}px`;
    lootContextMenu.style.top = `${Math.min(window.innerHeight - 70, Math.max(0, y))}px`;
  };
  document.addEventListener('click', hideLootContextMenu);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideLootContextMenu();
  });
  window.addEventListener('blur', hideLootContextMenu);
  if (discardLootBtn) {
    discardLootBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (lootContextIndex < 0 || lootContextIndex >= bagLootItems.length) {
        hideLootContextMenu();
        return;
      }
      const removed = bagLootItems[lootContextIndex];
      bagLootItems.splice(lootContextIndex, 1);
      hideLootContextMenu();
      renderLootSlots(panelState.currentBagCapacity);
      if (removed) {
        const equipmentFoot = document.getElementById('equipmentFoot');
        if (equipmentFoot) writeEquipmentFootText(`Discarded: ${removed.title}`);
      }
    });
  }
  async function ensureCoinTemplatesLoaded() {
    const ids = [GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID];
    await Promise.all(ids.map(async (id) => {
      try {
        const item = await getItemByArticleId(id);
        if (item) {
          coinTemplateById.set(id, {
            ...item,
            isStackable: true,
            count: 1,
          });
        }
      } catch (_err) {
        // Keep fallback template when lookup fails.
      }
    }));
  }


  function setEquippedSlotVisual(slotKey, item, equipmentFootText = null, options = {}) {
    const rule = SLOT_RULES[slotKey];
    if (!rule) return false;
    const slotImg = document.getElementById(`slot${rule.id}Img`);
    const slotIcon = document.getElementById(`slot${rule.id}Icon`);
    const slotLabel = document.getElementById(`slot${rule.id}Label`);
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
    if (slotKey === 'hand') {
      const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
      const isTwoHanded = attrs.some((a) => (
        a
        && String(a.name || '').toLowerCase() === 'hands'
        && String(a.value || '').toLowerCase() === 'two'
      ));
      if (isTwoHanded && equippedSlots.shield) {
        const shieldToBag = { ...equippedSlots.shield };
        const excludeBagIndex = Number.isInteger(options && options.excludeBagIndex)
          ? Number(options.excludeBagIndex)
          : null;
        const storedShield = addLootItemToBag(shieldToBag, {
          disableAutoEquip: true,
          excludeBagIndex,
        });
        if (!storedShield) {
          writeEquipmentFootText('Cannot equip two-handed weapon: no space/capacity to move shield to loot.');
          return false;
        }
        clearEquippedSlotVisual('shield');
      }
    }
    if (slotKey === 'shield') {
      const hand = equippedSlots.hand;
      const handAttrs = Array.isArray(hand && hand.attributes) ? hand.attributes : [];
      const handIsTwoHanded = handAttrs.some((a) => (
        a
        && String(a.name || '').toLowerCase() === 'hands'
        && String(a.value || '').toLowerCase() === 'two'
      ));
      if (handIsTwoHanded && hand) {
        const handToBag = { ...hand };
        const excludeBagIndex = Number.isInteger(options && options.excludeBagIndex)
          ? Number(options.excludeBagIndex)
          : null;
        const storedHand = addLootItemToBag(handToBag, {
          disableAutoEquip: true,
          excludeBagIndex,
        });
        if (!storedHand) {
          writeEquipmentFootText('Cannot equip shield: no space/capacity to move two-handed weapon to loot.');
          return false;
        }
        clearEquippedSlotVisual('hand');
      }
    }
    equippedSlots[slotKey] = item;
    if (item.image) {
      slotImg.src = imageUrl(item.image);
      slotImg.style.display = 'block';
      slotIcon.textContent = '';
    } else {
      slotImg.style.display = 'none';
      slotIcon.textContent = rule.iconDefault;
    }
    const qty = Math.max(1, Number(item.count || 1));
    slotLabel.textContent = qty > 1 ? `x${qty}` : (item.title || 'Equipped');
    const slotRoot = document.getElementById(`slot${rule.id}`);
    if (slotRoot) slotRoot.classList.add('equipped');
    bindTooltip(slotRoot, item);
    writeEquipmentFootText(equipmentFootText || `Equipped ${rule.footName}: ${item.title}`);
    if (slotKey === 'ring' || slotKey === 'amulet') startAccessoryTimer(slotKey, item);
    if (slotKey === 'light') applyEquipmentLightFromItem(item);
    return true;
  }
  // Backward-compatible alias for accidental casing typos in runtime/cached code paths.
  const setEquippedslotVisual = setEquippedSlotVisual;

  function canEquipItemInSlot(slotKey, item) {
    const rule = SLOT_RULES[slotKey];
    if (!rule || !item) return false;
    const matchesType = !rule.requireType || (item.item_type || '').toLowerCase() === rule.requireType.toLowerCase();
    const matchesClass = !rule.requireClass || (item.item_class || '').toLowerCase() === rule.requireClass.toLowerCase();
    const matchesSecondary = (!rule.requireSecondaryType && !rule.requireTypeAlt)
      || (rule.requireSecondaryType && String(item.type_secondary || '').toLowerCase() === rule.requireSecondaryType.toLowerCase())
      || (rule.requireTypeAlt && String(item.item_type || '').toLowerCase() === rule.requireTypeAlt.toLowerCase());
    if (slotKey === 'hand' && String(item.item_type || '').toLowerCase() === 'ammunition') return false;
    return matchesType && matchesClass && matchesSecondary;
  }

  function resolveEquipSlotForItem(item) {
    if (!item) return null;
    const preferredOrder = ['hand', 'ammunition', 'armor', 'shield', 'legs', 'boots', 'ring', 'helmet', 'amulet', 'light'];
    for (const key of preferredOrder) {
      if (canEquipItemInSlot(key, item)) return key;
    }
    return null;
  }

  function clearEquippedSlotVisual(slotKey, footText = null) {
    const rule = SLOT_RULES[slotKey];
    if (!rule) return false;
    const slotRoot = document.getElementById(`slot${rule.id}`);
    const slotImg = document.getElementById(`slot${rule.id}Img`);
    const slotIcon = document.getElementById(`slot${rule.id}Icon`);
    const slotLabel = document.getElementById(`slot${rule.id}Label`);
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!slotRoot || !slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
    equippedSlots[slotKey] = null;
    if (slotKey === 'ring' || slotKey === 'amulet') stopAccessoryTimer(slotKey);
    if (slotKey === 'light') applyEquipmentLightFromItem(null);
    slotImg.style.display = 'none';
    slotIcon.textContent = rule.iconDefault;
    slotLabel.textContent = 'Empty';
    slotRoot.title = '';
    slotRoot.classList.remove('equipped');
    if (footText) writeEquipmentFootText(footText);
    return true;
  }
  // Expose equip visual mutators to combat/runtime code outside setupSelectorUI scope.
  setInventorySetEquippedSlotVisual(setEquippedSlotVisual);
  setInventoryClearEquippedSlotVisual(clearEquippedSlotVisual);

  function tryAutoEquipArmorUpgrade(item) {
    const slotKey = ARMOR_AUTO_SLOT_BY_TYPE[(item.item_type || '').toLowerCase()];
    if (!slotKey) return false;
    const nextArmor = Number(item.armor_value || 0);
    if (!Number.isFinite(nextArmor) || nextArmor <= 0) return false;
    const equippedArmor = Number((equippedSlots[slotKey] && equippedSlots[slotKey].armor_value) || 0);
    if (nextArmor <= equippedArmor) return false;
    return setEquippedSlotVisual(
      slotKey,
      item,
      `Auto-equipped ${item.title} (${nextArmor}) > current (${equippedArmor}).`
    );
  }

  function tryAutoEquipShieldUpgrade(item) {
    if ((item.item_type || '').toLowerCase() !== 'shields') return false;
    const readDefenseAttr = (it) => {
      const attrs = Array.isArray(it && it.attributes) ? it.attributes : [];
      const row = attrs.find((a) => (
        a
        && String(a.name || '').toLowerCase() === 'defense'
      ));
      const n = Number(row && row.value);
      return Number.isFinite(n) ? n : 0;
    };
    const hand = equippedSlots.hand;
    const handAttrs = Array.isArray(hand && hand.attributes) ? hand.attributes : [];
    const isTwoHandedEquipped = handAttrs.some((a) => (
      a
      && String(a.name || '').toLowerCase() === 'hands'
      && String(a.value || '').toLowerCase() === 'two'
    ));
    // Requirement: only auto-equip shield when NOT using a two-handed weapon.
    if (isTwoHandedEquipped) return false;
    const nextDefense = readDefenseAttr(item);
    if (!Number.isFinite(nextDefense) || nextDefense <= 0) return false;
    const equippedDefense = readDefenseAttr(equippedSlots.shield);
    // Requirement: only if incoming shield has higher defense than current shield.
    if (nextDefense <= equippedDefense) return false;
    const previousShield = equippedSlots.shield ? { ...equippedSlots.shield } : null;
    if (previousShield) {
      const storedPreviousShield = addLootItemToBag(previousShield, {
        disableAutoEquip: true,
        excludeEquippedSlotKey: 'shield',
      });
      if (!storedPreviousShield) return false;
      if (typeof onPanelLog === 'function') {
        onPanelLog(`Stored previous shield in loot bag: ${previousShield.title}.`);
      }
    }
    return setEquippedSlotVisual(
      'shield',
      item,
      `Auto-equipped ${item.title} (def ${nextDefense}) > current (${equippedDefense}).`
    );
  }

  function tryAutoEquipWeaponUpgrade(item) {
    if (String(item.item_type || '').toLowerCase() === 'ammunition') return false;
    if ((item.item_class || '').toLowerCase() !== 'weapons') return false;
    // Only auto-equip looted weapons when hand slot is empty.
    if (equippedSlots.hand) return false;
    const nextAttack = Number(item.attack_value || 0);
    if (!Number.isFinite(nextAttack) || nextAttack <= 0) return false;
    return setEquippedSlotVisual(
      'hand',
      item,
      `Auto-equipped ${item.title} (hand was empty).`
    );
  }

  function tryAutoEquipAccessory(item) {
    const type = String(item.item_type || '').toLowerCase();
    if (type === 'rings') {
      if (equippedSlots.ring) return false;
      return setEquippedSlotVisual('ring', item, `Auto-equipped ring: ${item.title}.`);
    }
    if (type === 'amulets and necklaces') {
      if (equippedSlots.amulet) return false;
      return setEquippedSlotVisual('amulet', item, `Auto-equipped amulet: ${item.title}.`);
    }
    return false;
  }

  function resolveSellUnitPrice(item) {
    const sell = Number((item && item.raw && item.raw.value_sell) || 0);
    const buy = Number((item && item.raw && item.raw.value_buy) || 0);
    return sell > 0 ? sell : buy;
  }

  function renderLootSlots(slotCount) {
    const lootGrid = document.getElementById('lootGrid');
    const lootFoot = document.getElementById('lootFoot');
    if (!lootGrid || !lootFoot) return;
    hideItemTooltip();
    hideLootContextMenu();
    lootGrid.innerHTML = '';
    const count = Math.max(0, Math.floor(Number(slotCount) || 0));
    for (let i = 1; i <= count; i += 1) {
      const cell = document.createElement('div');
      const lootItem = bagLootItems[i - 1] || null;
      if (lootItem) {
        cell.className = 'loot-slot';
        cell.title = '';
        // Light-source items show their "used" image once burnt out, so the
        // loot bag reflects whether the lamp/candle has any charge left.
        const resolvedImage = getLootLightItemImage(lootItem) || lootItem.image;
        if (resolvedImage) {
          const img = document.createElement('img');
          img.src = imageUrl(resolvedImage);
          img.alt = lootItem.title || 'Loot item';
          cell.appendChild(img);
        } else {
          cell.textContent = '●';
        }
        if ((lootItem.count || 1) > 1) {
          const countTag = document.createElement('div');
          countTag.className = 'loot-count';
          countTag.textContent = `x${lootItem.count}`;
          cell.appendChild(countTag);
        }
        bindTooltip(cell, lootItem);
        cell.style.cursor = 'pointer';
        // Touch: show the Equip/Sell tooltip on tap, but only if the finger
        // didn't travel far enough to be a scroll gesture. Leaving touchstart
        // passive lets the browser scroll the sidebar normally when the user
        // drags inside the loot grid; we only consume touchend for real taps
        // so the synthesized mousedown (which auto-equips) is suppressed.
        let tStartX = 0;
        let tStartY = 0;
        let tMoved = false;
        cell.addEventListener('touchstart', (ev) => {
          const t = ev.touches && ev.touches[0];
          if (!t) return;
          tStartX = t.clientX;
          tStartY = t.clientY;
          tMoved = false;
        }, { passive: true });
        cell.addEventListener('touchmove', (ev) => {
          if (tMoved) return;
          const t = ev.touches && ev.touches[0];
          if (!t) return;
          if (Math.abs(t.clientX - tStartX) > 10 || Math.abs(t.clientY - tStartY) > 10) {
            tMoved = true;
          }
        }, { passive: true });
        cell.addEventListener('touchend', (ev) => {
          if (tMoved) return;
          ev.preventDefault();
          showTouchLootTooltip(cell, lootItem, i - 1);
        }, { passive: false });
        cell.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const idx = i - 1;
          const current = bagLootItems[idx];
          if (!current) return;
          const unitPrice = resolveSellUnitPrice(current);
          const amount = Math.max(1, Number(current.count || 1));
          const totalGold = Math.max(0, Math.floor(unitPrice * amount));
          bagLootItems.splice(idx, 1);
          addCoinsToInventory(totalGold);
          renderLootSlots(panelState.currentBagCapacity);
          if (typeof onPanelLog === 'function') {
            onPanelLog(`Sold ${current.title} for ${totalGold} gold.`);
          }
        });
        cell.addEventListener('mousedown', async (ev) => {
          if (ev.button !== 0) return; // left click only
          const idx = i - 1;
          const current = bagLootItems[idx];
          if (!current) return;

          if ((current.item_type || '').toLowerCase() === 'tools' && typeof onUseTool === 'function') {
            const used = onUseTool(current);
            if (used) return;
          }

          if ((current.item_type || '').toLowerCase() === 'food') {
            const foodSeconds = getFoodTimeSeconds(current);
            if (foodSeconds <= 0) return;
            if (typeof onConsumeFood !== 'function') return;
            const consumed = onConsumeFood(foodSeconds, current.title || 'Food');
            if (!consumed) return;
            if (current.count > 1) {
              current.count -= 1;
            } else {
              bagLootItems.splice(idx, 1);
            }
            renderLootSlots(panelState.currentBagCapacity);
            return;
          }
          if ((current.item_type || '').toLowerCase() === 'liquids') {
            if (typeof onUseLiquid !== 'function') return;
            const used = onUseLiquid(current);
            if (!used) return;
            if (current.count > 1) {
              current.count -= 1;
            } else {
              bagLootItems.splice(idx, 1);
            }
            renderLootSlots(panelState.currentBagCapacity);
            return;
          }

          const itemTypeLower = String((current && current.item_type) || '').toLowerCase();
          if (itemTypeLower === 'containers') {
            const bagArticleId = Number(
              (current && current.id)
              || (current && current.article_id)
              || (current && current.raw && current.raw.article_id)
            );
            if (!Number.isFinite(bagArticleId) || bagArticleId <= 0) return;
            const equippedBagCopy = currentBagItem ? { ...currentBagItem } : null;
            const equippedOk = await equipBagByArticleId(bagArticleId);
            if (!equippedOk) return;
            if (equippedBagCopy) {
              bagLootItems[idx] = equippedBagCopy;
            } else {
              bagLootItems.splice(idx, 1);
            }
            renderLootSlots(panelState.currentBagCapacity);
            return;
          }

          const slotKey = resolveEquipSlotForItem(current);
          if (!slotKey) return;
          const equipped = equippedSlots[slotKey];
          const equippedCopy = equipped ? { ...equipped } : null;
          // Torch being swapped out: freeze its burn progress onto the bag
          // copy so re-equipping resumes where we left off (and so a second
          // torch with the same article_id, e.g. a market purchase, doesn't
          // inherit this one's burn state).
          if (slotKey === 'light' && equippedCopy) {
            equippedCopy._burnElapsedMs = getCurrentLightElapsedMs();
          }
          const equipOk = setEquippedSlotVisual(
            slotKey,
            { ...current },
            `Equipped ${slotKey}: ${current.title}`,
            { excludeBagIndex: idx }
          );
          if (!equipOk) return;
          if (equippedCopy) {
            bagLootItems[idx] = equippedCopy;
          } else {
            bagLootItems.splice(idx, 1);
          }
          renderLootSlots(panelState.currentBagCapacity);
        });
      } else {
        cell.className = 'loot-slot empty-slot';
        cell.textContent = String(i);
      }
      lootGrid.appendChild(cell);
    }
    lootFoot.textContent = '';
  }

  function applyCapacityForLevel(level) {
    const stats = progressionStatsForLevel(level, panelState.selectedClass);
    currentPlayerCapacity = stats.capacity;
    renderLootSlots(panelState.currentBagCapacity);
  }
  applyCapacityForLevel(1);
  setOnPlayerLevelStatsUpdate((level) => applyCapacityForLevel(level));

  function normalizeCoinStacks() {
    const getCount = (id) => {
      const stack = bagLootItems.find((it) => Number(it.id) === id);
      return stack ? Math.max(1, Number(stack.count || 1)) : 0;
    };
    let gold = getCount(GOLD_COIN_ID);
    let platinum = getCount(PLATINUM_COIN_ID);
    let crystal = getCount(CRYSTAL_COIN_ID);
    platinum += Math.floor(gold / GOLD_PER_PLATINUM);
    gold %= GOLD_PER_PLATINUM;
    crystal += Math.floor(platinum / PLATINUM_PER_CRYSTAL);
    platinum %= PLATINUM_PER_CRYSTAL;
    bagLootItems = bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
    const putCoin = (id, count) => {
      if (count <= 0) return;
      const tpl = coinTemplateById.get(id);
      if (!tpl) return;
      bagLootItems.unshift({
        ...tpl,
        count,
      });
    };
    putCoin(CRYSTAL_COIN_ID, crystal);
    putCoin(PLATINUM_COIN_ID, platinum);
    putCoin(GOLD_COIN_ID, gold);
    window.dispatchEvent(new CustomEvent('coins-changed'));
    bus.emit(EVENTS.COINS_CHANGED);
  }

  function addCoinsToInventory(goldAmount) {
    const amount = Math.max(0, Math.floor(Number(goldAmount) || 0));
    if (amount <= 0) return;
    const goldTpl = coinTemplateById.get(GOLD_COIN_ID);
    if (!goldTpl) return;
    const incoming = {
      ...goldTpl,
      count: amount,
    };
    const stackIdx = bagLootItems.findIndex((it) => Number(it.id) === GOLD_COIN_ID);
    if (stackIdx >= 0) {
      bagLootItems[stackIdx].count = Math.max(1, Number(bagLootItems[stackIdx].count || 1)) + amount;
    } else if (bagLootItems.length < panelState.currentBagCapacity) {
      bagLootItems.push(incoming);
    } else {
      // If there is no slot, try to force conversion by replacing lower-value coin stacks if present.
      bagLootItems.push(incoming);
    }
    normalizeCoinStacks();
  }

  function getTotalGoldInInventory() {
    let gold = 0;
    let platinum = 0;
    let crystal = 0;
    for (const it of bagLootItems) {
      const id = Number(it && it.id);
      const count = Math.max(1, Number((it && it.count) || 1));
      if (id === GOLD_COIN_ID) gold += count;
      if (id === PLATINUM_COIN_ID) platinum += count;
      if (id === CRYSTAL_COIN_ID) crystal += count;
    }
    return gold + (platinum * GOLD_PER_PLATINUM) + (crystal * GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
  }

  function setCoinsFromTotalGold(totalGold) {
    let value = Math.max(0, Math.floor(Number(totalGold) || 0));
    const crystal = Math.floor(value / (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL));
    value %= (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
    const platinum = Math.floor(value / GOLD_PER_PLATINUM);
    const gold = value % GOLD_PER_PLATINUM;
    bagLootItems = bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
    const putCoin = (id, count) => {
      if (count <= 0) return;
      const tpl = coinTemplateById.get(id);
      if (!tpl) return;
      bagLootItems.unshift({
        ...tpl,
        count,
      });
    };
    putCoin(CRYSTAL_COIN_ID, crystal);
    putCoin(PLATINUM_COIN_ID, platinum);
    putCoin(GOLD_COIN_ID, gold);
    window.dispatchEvent(new CustomEvent('coins-changed'));
    bus.emit(EVENTS.COINS_CHANGED);
  }

  function spendGoldFromInventory(goldAmount) {
    const cost = Math.max(0, Math.floor(Number(goldAmount) || 0));
    if (cost <= 0) return true;
    const total = getTotalGoldInInventory();
    if (total < cost) return false;
    setCoinsFromTotalGold(total - cost);
    renderLootSlots(panelState.currentBagCapacity);
    return true;
  }

  function addLootItemToBag(itemData, opts = {}) {
    setLastLootRejectReason('');
    const disableAutoEquip = Boolean(opts && opts.disableAutoEquip);
    const excludeEquippedSlotKey = (opts && typeof opts.excludeEquippedSlotKey === 'string')
      ? String(opts.excludeEquippedSlotKey)
      : null;
    const excludeBagIndex = Number.isInteger(opts && opts.excludeBagIndex)
      ? Number(opts.excludeBagIndex)
      : null;
    const incoming = {
      id: itemData && itemData.id != null ? Number(itemData.id) : null,
      title: itemData && itemData.title ? itemData.title : 'Loot',
      image: itemData && itemData.image ? itemData.image : null,
      item_type: itemData && itemData.item_type ? itemData.item_type : null,
      item_class: itemData && itemData.item_class ? itemData.item_class : null,
      type_secondary: itemData && itemData.type_secondary ? itemData.type_secondary : null,
      armor_value: Number((itemData && itemData.armor_value) || 0),
      shielding_value: Number((itemData && itemData.shielding_value) || 0),
      attack_value: Number((itemData && itemData.attack_value) || 0),
      range_value: Number((itemData && itemData.range_value) || 1),
      throwable: Boolean(itemData && itemData.throwable),
      attributes: Array.isArray(itemData && itemData.attributes) ? itemData.attributes : [],
      raw: (itemData && itemData.raw && typeof itemData.raw === 'object') ? itemData.raw : {},
      isStackable: Boolean(itemData && itemData.isStackable),
      count: Math.max(1, Number((itemData && itemData.count) || 1)),
    };
    const itemUnitWeight = (it) => {
      if (!it) return 0;
      const rawW = it.raw && it.raw.weight != null ? Number(it.raw.weight) : Number(it.weight);
      if (Number.isFinite(rawW) && rawW > 0) return rawW;
      return 0;
    };
    const totalCarriedWeight = () => {
      let total = 0;
      if (currentBagItem) total += itemUnitWeight(currentBagItem);
      for (const [slotKey, eq] of Object.entries(equippedSlots)) {
        if (excludeEquippedSlotKey && slotKey === excludeEquippedSlotKey) continue;
        if (!eq) continue;
        total += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
      }
      for (let i = 0; i < bagLootItems.length; i += 1) {
        if (excludeBagIndex != null && i === excludeBagIndex) continue;
        const it = bagLootItems[i];
        total += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
      }
      return total;
    };
    const incomingWeight = itemUnitWeight(incoming) * Math.max(1, Number(incoming.count || 1));
    if (totalCarriedWeight() + incomingWeight > currentPlayerCapacity) {
      setLastLootRejectReason('capacity');
      return false;
    }
    const sameItemIdentity = (a, b) => {
      if (!a || !b) return false;
      if (a.id != null && b.id != null) return Number(a.id) === Number(b.id);
      return String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase();
    };
    if (!disableAutoEquip) {
      const equippedHand = equippedSlots.hand;
      const equippedAmmo = equippedSlots.ammunition;
      const equippedThrowable = Boolean(
        equippedHand
        && (equippedHand.throwable || String(equippedHand.type_secondary || '').toLowerCase() === 'throwing weapons')
      );
      const incomingThrowable = Boolean(
        incoming.throwable || String(incoming.type_secondary || '').toLowerCase() === 'throwing weapons'
      );
      const isSameThrowableAsEquipped = Boolean(
        equippedHand
        && equippedThrowable
        && incomingThrowable
        && sameItemIdentity(equippedHand, incoming)
      );
      // Fallback robusto: si ambos son distance+throwing y coinciden por id/titulo, apilar en HAND.
      const robustSameThrowable = Boolean(
        equippedHand
        && sameItemIdentity(equippedHand, incoming)
        && String(equippedHand.item_type || '').toLowerCase() === 'distance weapons'
        && String(incoming.item_type || '').toLowerCase() === 'distance weapons'
        && (
          equippedThrowable
          || incomingThrowable
          || String(equippedHand.type_secondary || '').toLowerCase() === 'throwing weapons'
          || String(incoming.type_secondary || '').toLowerCase() === 'throwing weapons'
        )
      );
      if (isSameThrowableAsEquipped || robustSameThrowable) {
        const next = {
          ...equippedHand,
          count: Math.max(1, Number(equippedHand.count || 1)) + Math.max(1, Number(incoming.count || 1)),
        };
        setEquippedSlotVisual('hand', next, `Throwable stack +${Math.max(1, Number(incoming.count || 1))}: ${incoming.title}.`);
        return true;
      }
      const incomingIsAmmoWeapon = Boolean(
        String(incoming.item_class || '').toLowerCase() === 'weapons'
        && String(incoming.item_type || '').toLowerCase() === 'ammunition'
      );
      const isSameAmmoAsEquipped = Boolean(
        incomingIsAmmoWeapon
        && equippedAmmo
        && sameItemIdentity(equippedAmmo, incoming)
      );
      if (incomingIsAmmoWeapon && !equippedAmmo) {
        setEquippedSlotVisual('ammunition', { ...incoming, count: Math.max(1, Number(incoming.count || 1)) }, `Auto-equipped ammunition: ${incoming.title}.`);
        return true;
      }
      if (isSameAmmoAsEquipped) {
        const nextAmmo = {
          ...equippedAmmo,
          count: Math.max(1, Number(equippedAmmo.count || 1)) + Math.max(1, Number(incoming.count || 1)),
        };
        setEquippedSlotVisual('ammunition', nextAmmo, `Ammunition stack +${Math.max(1, Number(incoming.count || 1))}: ${incoming.title}.`);
        return true;
      }
      const equippedNow = (
        tryAutoEquipArmorUpgrade(incoming)
        || tryAutoEquipShieldUpgrade(incoming)
        || tryAutoEquipWeaponUpgrade(incoming)
        || tryAutoEquipAccessory(incoming)
      );
      // If it was equipped, it should not occupy inventory space.
      if (equippedNow) return true;
    }
    if (incoming.isStackable) {
      const stackIdx = bagLootItems.findIndex((it) => (
        Boolean(it && it.isStackable)
        && (
          (incoming.id != null && it.id === incoming.id)
          || ((incoming.id == null || it.id == null) && it.title === incoming.title)
        )
      ));
      if (stackIdx >= 0) {
        bagLootItems[stackIdx].count = Math.max(1, Number(bagLootItems[stackIdx].count || 1)) + incoming.count;
        normalizeCoinStacks();
        renderLootSlots(panelState.currentBagCapacity);
        return true;
      }
    }
    const occupiedSlots = bagLootItems.length - (excludeBagIndex != null ? 1 : 0);
    if (occupiedSlots >= panelState.currentBagCapacity) {
      setLastLootRejectReason('slots');
      return false;
    }
    bagLootItems.push(incoming);
    normalizeCoinStacks();
    renderLootSlots(panelState.currentBagCapacity);
    return true;
  }

  async function equipBagByArticleId(articleId) {
    const bagImg = document.getElementById('slotBagImg');
    const bagIcon = document.getElementById('slotBagIcon');
    const bagLabel = document.getElementById('slotBagLabel');
    const bagRoot = document.getElementById('slotBag');
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!bagImg || !bagIcon || !bagLabel || !equipmentFoot || !bagRoot) return false;
    try {
      let bag = await getItemByArticleId(articleId);
      if (!bag) {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
        bagLabel.textContent = 'Empty';
        writeEquipmentFootText('No item equipped');
        panelState.currentBagCapacity = 0;
        currentBagItem = null;
        bagLootItems = [];
        renderLootSlots(0);
        return false;
      }
      if ((bag.item_type || '').toLowerCase() !== 'containers') {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
        bagLabel.textContent = 'Invalid';
        writeEquipmentFootText('BAG slot only supports Containers');
        panelState.currentBagCapacity = 0;
        currentBagItem = null;
        bagLootItems = [];
        renderLootSlots(0);
        return false;
      }
      const typeSecondary = String((bag && bag.type_secondary) || '').toLowerCase();
      if (typeSecondary === 'backpacks') {
        const equippedImage = bag.image;
        const equippedTitle = bag.title;
        const equippedName = bag.name;
        const equippedActualName = bag.actual_name;
        const canonicalBag = await getItemByArticleId(1589);
        bag = {
          ...(canonicalBag || bag),
          article_id: Number((bag && bag.article_id) || articleId),
          title: equippedTitle || (canonicalBag && canonicalBag.title) || 'Bag',
          name: equippedName || (canonicalBag && canonicalBag.name) || 'Bag',
          actual_name: equippedActualName || (canonicalBag && canonicalBag.actual_name) || 'bag',
          item_type: 'Containers',
          image: equippedImage || ((canonicalBag && canonicalBag.image) || null),
          weight: 20,
        };
      }
      const normalizedArticleId = Number((bag && bag.article_id) || articleId);
      bag = {
        ...bag,
        id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
        article_id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
        raw: {
          ...((bag && bag.raw && typeof bag.raw === 'object') ? bag.raw : {}),
          article_id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
          weight: Number(bag && bag.weight),
        },
      };
      if (bag.image) {
        bagImg.src = imageUrl(bag.image);
        bagImg.style.display = 'block';
        bagIcon.textContent = '';
      } else {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
      }
      const nextCapacity = Math.max(0, Math.floor(Number(bag.weight) || 0));
      if (bagLootItems.length > nextCapacity) {
        writeEquipmentFootText(`Cannot equip ${bag.title}: requires ${nextCapacity} slots, carrying ${bagLootItems.length}.`);
        return false;
      }
      panelState.currentBagCapacity = nextCapacity;
      currentBagItem = bag;
      bagLabel.textContent = bag.title;
      bindTooltip(bagRoot, bag);
      writeEquipmentFootText(`Equipped: ${bag.title}`);
      renderLootSlots(panelState.currentBagCapacity);
      return true;
    } catch (_err) {
      bagImg.style.display = 'none';
      bagIcon.textContent = 'BAG';
      bagLabel.textContent = 'Empty';
      writeEquipmentFootText('No item equipped');
      panelState.currentBagCapacity = 0;
      currentBagItem = null;
      bagLootItems = [];
      renderLootSlots(0);
      return false;
    }
  }

  async function equipItemInSlot(slotKey, articleId) {
    const rule = SLOT_RULES[slotKey];
    if (!rule) return false;
    const slotImg = document.getElementById(`slot${rule.id}Img`);
    const slotIcon = document.getElementById(`slot${rule.id}Icon`);
    const slotLabel = document.getElementById(`slot${rule.id}Label`);
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
    try {
      const item = await getItemByArticleId(articleId);
      if (!item) {
        slotImg.style.display = 'none';
        slotIcon.textContent = rule.iconDefault;
        slotLabel.textContent = 'Empty';
        equippedSlots[slotKey] = null;
        return false;
      }
      const matchesType = !rule.requireType || (item.item_type || '').toLowerCase() === rule.requireType.toLowerCase();
      const matchesClass = !rule.requireClass || (item.item_class || '').toLowerCase() === rule.requireClass.toLowerCase();
      const matchesSecondary = (!rule.requireSecondaryType && !rule.requireTypeAlt)
        || (rule.requireSecondaryType && String(item.type_secondary || '').toLowerCase() === rule.requireSecondaryType.toLowerCase())
        || (rule.requireTypeAlt && String(item.item_type || '').toLowerCase() === rule.requireTypeAlt.toLowerCase());
      if (slotKey === 'hand' && String(item.item_type || '').toLowerCase() === 'ammunition') {
        writeEquipmentFootText(`Cannot equip ${item.title} in HAND slot (use AMMO slot).`);
        return false;
      }
      if (!matchesType || !matchesClass || !matchesSecondary) {
        const req = (rule.requireSecondaryType || rule.requireTypeAlt)
          ? [rule.requireTypeAlt, rule.requireSecondaryType].filter(Boolean).join(' or ')
          : (rule.requireType || `item_class ${rule.requireClass}`);
        writeEquipmentFootText(`Cannot equip ${item.title} in ${slotKey.toUpperCase()} slot (requires ${req}).`);
        return false;
      }
      return setEquippedSlotVisual(slotKey, item, `Equipped ${rule.footName}: ${item.title}`);
    } catch (_err) {
      return false;
    }
  }

  // Debug helpers for runtime bag swaps while loot mechanics evolve.
  window.debugInventory = {
    async equipBag(articleId) {
      await equipBagByArticleId(articleId);
    },
    async equipArmor(articleId) {
      return equipItemInSlot('armor', articleId);
    },
    async equipShield(articleId) {
      return equipItemInSlot('shield', articleId);
    },
    async equipLegs(articleId) {
      return equipItemInSlot('legs', articleId);
    },
    async equipBoots(articleId) {
      return equipItemInSlot('boots', articleId);
    },
    async equipRing(articleId) {
      return equipItemInSlot('ring', articleId);
    },
    async equipAmmo(articleId) {
      return equipItemInSlot('ammunition', articleId);
    },
    async equipHelmet(articleId) {
      return equipItemInSlot('helmet', articleId);
    },
    async equipAmulet(articleId) {
      return equipItemInSlot('amulet', articleId);
    },
    async equipHand(articleId) {
      return equipItemInSlot('hand', articleId);
    },
    async equipLight(articleId) {
      return equipItemInSlot('light', articleId);
    },
    unequipHand() {
      return clearEquippedSlotVisual('hand', 'Your hand slot is empty.');
    },
    addLoot(item = 'Loot') {
      if (typeof item === 'string') {
        return addLootItemToBag({ title: item, image: null });
      }
      return addLootItemToBag({
        id: (item && item.id != null) ? Number(item.id) : null,
        title: (item && item.title) ? item.title : 'Loot',
        image: (item && item.image) ? item.image : null,
        item_type: (item && item.item_type) ? item.item_type : null,
        item_class: (item && item.item_class) ? item.item_class : null,
        type_secondary: (item && item.type_secondary) ? item.type_secondary : null,
        armor_value: Number((item && item.armor_value) || 0),
        shielding_value: Number((item && item.shielding_value) || 0),
        attack_value: Number((item && item.attack_value) || 0),
        range_value: Number((item && item.range_value) || 1),
        throwable: Boolean(item && item.throwable),
        attributes: Array.isArray(item && item.attributes) ? item.attributes : [],
        raw: (item && item.raw && typeof item.raw === 'object') ? item.raw : {},
        isStackable: Boolean(item && item.isStackable),
        count: Math.max(1, Number((item && item.count) || 1)),
      });
    },
    state() {
      const itemUnitWeight = (it) => {
        if (!it) return 0;
        const rawW = it.raw && it.raw.weight != null ? Number(it.raw.weight) : Number(it.weight);
        return Number.isFinite(rawW) && rawW > 0 ? rawW : 0;
      };
      let carriedWeight = 0;
      if (currentBagItem) carriedWeight += itemUnitWeight(currentBagItem);
      for (const eq of Object.values(equippedSlots)) {
        if (!eq) continue;
        carriedWeight += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
      }
      for (const it of bagLootItems) {
        carriedWeight += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
      }
      return {
        bag: currentBagItem,
        equipped: { ...equippedSlots },
        bagSlots: panelState.currentBagCapacity,
        capacity: currentPlayerCapacity,
        carriedWeight,
        used: bagLootItems.length,
        items: [...bagLootItems],
      };
    },
    getGold() {
      return getTotalGoldInInventory();
    },
    spendGold(amount) {
      return spendGoldFromInventory(amount);
    },
    addGold(amount) {
      addCoinsToInventory(amount);
      renderLootSlots(panelState.currentBagCapacity);
    },
    findConsumable(type) {
      for (let i = 0; i < bagLootItems.length; i++) {
        const it = bagLootItems[i];
        if (!it) continue;
        if (type === 'food') {
          if ((it.item_type || '').toLowerCase() === 'food') return { item: it, idx: i };
        } else if (type === 'mana') {
          if ((it.type_secondary || '').toLowerCase() === 'potions'
              && (it.title || '').toLowerCase().includes('mana')) return { item: it, idx: i };
        } else if (type === 'health') {
          if ((it.type_secondary || '').toLowerCase() === 'potions'
              && (it.title || '').toLowerCase().includes('health')) return { item: it, idx: i };
        }
      }
      return null;
    },
    consumeItem(type) {
      const found = this.findConsumable(type);
      if (!found) return false;
      const { item, idx } = found;
      let consumed = false;
      if (type === 'food') {
        const foodSeconds = getFoodTimeSeconds(item);
        if (foodSeconds <= 0) return false;
        if (typeof onConsumeFood !== 'function') return false;
        consumed = onConsumeFood(foodSeconds, item.title || 'Food');
      } else {
        if (typeof onUseLiquid !== 'function') return false;
        consumed = onUseLiquid(item);
      }
      if (!consumed) return false;
      if (item.count > 1) {
        item.count -= 1;
      } else {
        bagLootItems.splice(idx, 1);
      }
      renderLootSlots(panelState.currentBagCapacity);
      return true;
    },
  };

  // Left click equipped slot to unequip into loot bag when there is space/capacity.
  for (const slotKey of Object.keys(SLOT_RULES)) {
    const rule = SLOT_RULES[slotKey];
    const slotRoot = document.getElementById(`slot${rule.id}`);
    if (!slotRoot) continue;
    slotRoot.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const equipped = equippedSlots[slotKey];
      if (!equipped) return;
      const unitPrice = resolveSellUnitPrice(equipped);
      const amount = Math.max(1, Number(equipped.count || 1));
      const totalGold = Math.max(0, Math.floor(unitPrice * amount));
      clearEquippedSlotVisual(slotKey, `Sold ${equipped.title} for ${totalGold} gold.`);
      addCoinsToInventory(totalGold);
      renderLootSlots(panelState.currentBagCapacity);
      if (typeof onPanelLog === 'function') {
        onPanelLog(`Sold equipped ${equipped.title} for ${totalGold} gold.`);
      }
    });
    slotRoot.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      const equipped = equippedSlots[slotKey];
      if (!equipped) return;
      // Before shallow-copying the torch into the bag, freeze its current
      // burn progress on the object so re-equipping resumes correctly.
      if (slotKey === 'light') {
        equipped._burnElapsedMs = getCurrentLightElapsedMs();
      }
      const stored = addLootItemToBag(
        { ...equipped },
        { disableAutoEquip: true, excludeEquippedSlotKey: slotKey }
      );
      if (!stored) return;
      clearEquippedSlotVisual(slotKey);
      if (typeof onPanelLog === 'function') onPanelLog(`Unequipped ${equipped.title} to loot bag.`);
      renderLootSlots(panelState.currentBagCapacity);
    });
  }

  window._resetInventoryForNewRun = () => {
    bagLootItems = [];
    for (const slotKey of Object.keys(equippedSlots)) {
      equippedSlots[slotKey] = null;
      clearEquippedSlotVisual(slotKey);
    }
    panelState.currentBagCapacity = 0;
    currentBagItem = null;
    setLastLootRejectReason('');
    renderLootSlots(0);
    startBtn.disabled = false;
    _starting = false;
  };

  let _starting = false;
  // Save id of the currently-active run, so subsequent in-game "Save"
  // clicks can overwrite that slot instead of spawning new entries.
  //   null        → this run has never been saved (fresh game or guest)
  //   "<hex>"     → the id returned by the server on a previous save /
  //                 the id of the save we resumed from
  let currentSaveId = null;
  // Unified boot path used by both the "Enter Dungeon" click and the
  // "Resume" action from the Saved Games screen.
  //   cfg = { name, sex, classKey, resumeSnapshot?, resumeSaveId? }
  async function bootGame(cfg) {
    if (_starting) return;
    _starting = true;
    if (startBtn) startBtn.disabled = true;
    const snap = (cfg && cfg.resumeSnapshot) || null;
    currentSaveId = snap && typeof cfg.resumeSaveId === 'string' ? cfg.resumeSaveId : null;
    const playerName = String((cfg && cfg.name) || 'Adventurer').trim() || 'Adventurer';
    const sex = (cfg && cfg.sex) || 'male';
    const classKey = (cfg && cfg.classKey) || 'knight';
    currentPlayerCapacity = progressionStatsForLevel(1, classKey).capacity;
    panelState.playerConfig = { name: playerName, sex, classKey, resumeSnapshot: snap };

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0, 'Loading creature data...');

    // Progress bar driver — one tick per finished task. Engine tasks (6)
    // arrive via loadEngineData's onProgress callback; the panel-internal
    // tasks (bag + coin templates) tick on completion of their own promise.
    let jsonsDone = 0;
    const JSON_TASKS = 8;
    const jsonLabels = [
      'Loading creature data...', 'Preparing inventory...', 'Loading loot tables...',
      'Loading abilities...', 'Loading damage data...', 'Loading currencies...',
      'Loading spells...', 'Loading items...',
    ];
    const onJsonDone = () => {
      jsonsDone += 1;
      setLoadingProgress(
        Math.round((jsonsDone / JSON_TASKS) * 45),
        jsonLabels[jsonsDone] || 'Finalizing data...',
      );
    };

    const bagToEquip = snap && Number(snap.bagArticleId) ? Number(snap.bagArticleId) : START_BAG_ARTICLE_ID;
    await Promise.all([
      loadEngineData(onJsonDone),
      equipBagByArticleId(bagToEquip).then(onJsonDone),
      ensureCoinTemplatesLoaded().then(onJsonDone),
    ]);

    setLoadingProgress(45, 'Starting game engine...');
    addCoinsToInventory(0);
    if (snap) {
      // Restore the saved inventory: equipped slots + bag items + gold.
      // We equip by article_id; equipItemInSlot hydrates the full item from
      // the catalog so stats/sprites match the shop entries.
      const eq = (snap && snap.equippedSlots) || {};
      for (const [slotKey, item] of Object.entries(eq)) {
        if (!item) continue;
        const articleId = Number(item.article_id || item.id || 0);
        if (!articleId) continue;
        try { await equipItemInSlot(slotKey, articleId); } catch { /* skip bad slot */ }
      }
      const bag = Array.isArray(snap.bagLootItems) ? snap.bagLootItems : [];
      for (const item of bag) {
        if (!item) continue;
        try { addLootItemToBag({ ...item }); } catch { /* skip bad entry */ }
      }
      if (Number.isFinite(Number(snap.gold)) && Number(snap.gold) > 0) {
        addCoinsToInventory(Math.floor(Number(snap.gold)));
      }
    } else {
      // Default starting inventory: torch equipped and lit (3-tile radius).
      await equipItemInSlot('light', LIGHT_ITEM_ID_TORCH);
    }
    document.getElementById('startOverlay').style.display = 'none';
    const savesOv = document.getElementById('savesOverlay');
    if (savesOv) savesOv.style.display = 'none';
    startGame(panelState.playerConfig);
  }
  startBtn.addEventListener('click', () => {
    const playerName = (playerNameInput.value || '').trim() || 'Adventurer';
    bootGame({ name: playerName, sex: panelState.selectedSex, classKey: panelState.selectedClass });
  });
  // Exposed so the saves screen ("Resume") can re-enter the game.
  window.tdGame = {
    resume(snapshot, saveId) {
      if (!snapshot) return;
      // Clear the saves-screen hash so a subsequent refresh lands on the
      // character overlay (or the game, if it's already running).
      if (window.location.hash === '#/saves') window.location.hash = '';
      bootGame({
        name:     snapshot.name,
        sex:      snapshot.sex,
        classKey: snapshot.classKey,
        resumeSnapshot: snapshot,
        resumeSaveId:   saveId || null,
      });
    },
    // Shared-state accessors for the in-game Save button.
    getCurrentSaveId() { return currentSaveId; },
    setCurrentSaveId(id) { currentSaveId = id || null; },
    // Wipe the active run's save slot — called from death flows so a
    // completed/failed run doesn't keep polluting the Load Game list.
    async deleteCurrentSave() {
      const id = currentSaveId;
      if (!id) return false;
      const api = window.tdAuth && window.tdAuth.apiFetch;
      if (!api) return false;
      if (!OFFLINE_BUILD) {
        const loggedIn = window.tdAuth.isLoggedIn && window.tdAuth.isLoggedIn();
        if (!loggedIn) return false;
      }
      currentSaveId = null;
      try {
        await api(`/api/saves?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
      } catch { return false; }
    },
  };

  // Un único listener de Enter para el input (el document listener era redundante y causaba doble disparo)
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!startBtn.disabled && !_starting) startBtn.click();
    }
  });
}
