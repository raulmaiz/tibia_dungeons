// Equipment-slot mutation + auto-equip rules. Owns every write to
// `panelState.equippedSlots`: the actual `img/icon/label` DOM updates, the
// two-handed ↔ shield swap, the accessory-timer kickoff, and the "is this
// loot an upgrade?" heuristics triggered by addLootItemToBag.
//
// Cross-module calls go through `panelState.helpers.*`:
//   • addLootItemToBag    — lootBag.js (for swap-to-loot flows)
//   • renderLootSlots     — lootBag.js (called after applyCapacityForLevel)
//
// Directly imports `bindTooltip` from itemTooltip.js because tooltip binding
// is pure DOM and doesn't touch panel-shared state beyond the tooltip itself.

import { imageUrl } from '../../dataService.js';
import { progressionStatsForLevel } from '../../mechanics/progression.js';
import {
  applyEquipmentLightFromItem,
} from '../../systems/lighting/LightItems.js';
import { onPanelLog } from '../../state/playerSession.js';
import { panelState } from './state.js';
import { SLOT_RULES, ARMOR_AUTO_SLOT_BY_TYPE } from './constants.js';
import { startAccessoryTimer, stopAccessoryTimer } from './accessoryTimers.js';
import { bindTooltip } from './itemTooltip.js';

// Rewrites the equipment-panel footer without disturbing the status chips
// that live alongside it. Exported so equipFlow.js can reuse it.
export function writeEquipmentFootText(text) {
  const textEl = document.getElementById('equipmentFootText');
  if (textEl) textEl.textContent = String(text == null ? '' : text);
}

export function setEquippedSlotVisual(slotKey, item, equipmentFootText = null, options = {}) {
  const rule = SLOT_RULES[slotKey];
  if (!rule) return false;
  const slotImg = /** @type {HTMLImageElement | null} */ (document.getElementById(`slot${rule.id}Img`));
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
    if (isTwoHanded && panelState.equippedSlots.shield) {
      const shieldToBag = { ...panelState.equippedSlots.shield };
      const excludeBagIndex = Number.isInteger(options && options.excludeBagIndex)
        ? Number(options.excludeBagIndex)
        : null;
      const storedShield = panelState.helpers.addLootItemToBag(shieldToBag, {
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
    const hand = panelState.equippedSlots.hand;
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
      const storedHand = panelState.helpers.addLootItemToBag(handToBag, {
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
  panelState.equippedSlots[slotKey] = item;
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

export function canEquipItemInSlot(slotKey, item) {
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

export function resolveEquipSlotForItem(item) {
  if (!item) return null;
  const preferredOrder = ['hand', 'ammunition', 'armor', 'shield', 'legs', 'boots', 'ring', 'helmet', 'amulet', 'light'];
  for (const key of preferredOrder) {
    if (canEquipItemInSlot(key, item)) return key;
  }
  return null;
}

export function clearEquippedSlotVisual(slotKey, footText = null) {
  const rule = SLOT_RULES[slotKey];
  if (!rule) return false;
  const slotRoot = document.getElementById(`slot${rule.id}`);
  const slotImg = /** @type {HTMLImageElement | null} */ (document.getElementById(`slot${rule.id}Img`));
  const slotIcon = document.getElementById(`slot${rule.id}Icon`);
  const slotLabel = document.getElementById(`slot${rule.id}Label`);
  const equipmentFoot = document.getElementById('equipmentFoot');
  if (!slotRoot || !slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
  panelState.equippedSlots[slotKey] = null;
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

export function tryAutoEquipArmorUpgrade(item) {
  const slotKey = ARMOR_AUTO_SLOT_BY_TYPE[(item.item_type || '').toLowerCase()];
  if (!slotKey) return false;
  const nextArmor = Number(item.armor_value || 0);
  if (!Number.isFinite(nextArmor) || nextArmor <= 0) return false;
  const equippedArmor = Number((panelState.equippedSlots[slotKey] && panelState.equippedSlots[slotKey].armor_value) || 0);
  if (nextArmor <= equippedArmor) return false;
  return setEquippedSlotVisual(
    slotKey,
    item,
    `Auto-equipped ${item.title} (${nextArmor}) > current (${equippedArmor}).`
  );
}

export function tryAutoEquipShieldUpgrade(item) {
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
  const hand = panelState.equippedSlots.hand;
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
  const equippedDefense = readDefenseAttr(panelState.equippedSlots.shield);
  // Requirement: only if incoming shield has higher defense than current shield.
  if (nextDefense <= equippedDefense) return false;
  const previousShield = panelState.equippedSlots.shield ? { ...panelState.equippedSlots.shield } : null;
  if (previousShield) {
    const storedPreviousShield = panelState.helpers.addLootItemToBag(previousShield, {
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

export function tryAutoEquipWeaponUpgrade(item) {
  if (String(item.item_type || '').toLowerCase() === 'ammunition') return false;
  if ((item.item_class || '').toLowerCase() !== 'weapons') return false;
  // Only auto-equip looted weapons when hand slot is empty.
  if (panelState.equippedSlots.hand) return false;
  const nextAttack = Number(item.attack_value || 0);
  if (!Number.isFinite(nextAttack) || nextAttack <= 0) return false;
  return setEquippedSlotVisual(
    'hand',
    item,
    `Auto-equipped ${item.title} (hand was empty).`
  );
}

export function tryAutoEquipAccessory(item) {
  const type = String(item.item_type || '').toLowerCase();
  if (type === 'rings') {
    if (panelState.equippedSlots.ring) return false;
    return setEquippedSlotVisual('ring', item, `Auto-equipped ring: ${item.title}.`);
  }
  if (type === 'amulets and necklaces') {
    if (panelState.equippedSlots.amulet) return false;
    return setEquippedSlotVisual('amulet', item, `Auto-equipped amulet: ${item.title}.`);
  }
  return false;
}

export function resolveSellUnitPrice(item) {
  const sell = Number((item && item.raw && item.raw.value_sell) || 0);
  const buy = Number((item && item.raw && item.raw.value_buy) || 0);
  return sell > 0 ? sell : buy;
}

export function applyCapacityForLevel(level) {
  const stats = progressionStatsForLevel(level, panelState.selectedClass);
  panelState.currentPlayerCapacity = stats.capacity;
  panelState.helpers.renderLootSlots(panelState.currentBagCapacity);
}
