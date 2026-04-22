// Async equipment flows. Two public entry points:
//
//   • equipBagByArticleId(articleId)  — BAG slot. Fetches the item from the
//     catalog, validates it's a Container, rewrites the bag slot visuals,
//     adjusts capacity, and re-renders the loot grid. Backpacks are proxied
//     through the canonical `bag` template so stored-item renderers don't
//     have to special-case colored/variant backpacks.
//
//   • equipItemInSlot(slotKey, articleId) — any other slot. Validates the
//     item matches the slot rules (type/class/secondary), then delegates to
//     setEquippedSlotVisual. Used by market purchases and the boot-time
//     restore path (both live in bootFlow.js).
//
// Kept separate from equipment.js because these are I/O-flavored (await +
// catalog lookup + error toasts) while equipment.js is synchronous DOM
// mutation. Also avoids a circular import with lootBag (which calls
// equipBagByArticleId for in-bag container swaps via helpers).

import { getItemByArticleId, imageUrl } from '../../dataService.js';
import { panelState } from './state.js';
import { SLOT_RULES } from './constants.js';
import { writeEquipmentFootText, setEquippedSlotVisual } from './equipment.js';
import { bindTooltip } from './itemTooltip.js';
import { renderLootSlots } from './lootBag.js';

export async function equipBagByArticleId(articleId) {
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
      panelState.currentBagItem = null;
      panelState.bagLootItems = [];
      renderLootSlots(0);
      return false;
    }
    if ((bag.item_type || '').toLowerCase() !== 'containers') {
      bagImg.style.display = 'none';
      bagIcon.textContent = 'BAG';
      bagLabel.textContent = 'Invalid';
      writeEquipmentFootText('BAG slot only supports Containers');
      panelState.currentBagCapacity = 0;
      panelState.currentBagItem = null;
      panelState.bagLootItems = [];
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
    if (panelState.bagLootItems.length > nextCapacity) {
      writeEquipmentFootText(`Cannot equip ${bag.title}: requires ${nextCapacity} slots, carrying ${panelState.bagLootItems.length}.`);
      return false;
    }
    panelState.currentBagCapacity = nextCapacity;
    panelState.currentBagItem = bag;
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
    panelState.currentBagItem = null;
    panelState.bagLootItems = [];
    renderLootSlots(0);
    return false;
  }
}

export async function equipItemInSlot(slotKey, articleId) {
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
      panelState.equippedSlots[slotKey] = null;
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
