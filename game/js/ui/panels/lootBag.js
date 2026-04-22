// Loot-bag rendering + insertion logic + right-click context menu.
// Owns every write to `panelState.bagLootItems` that isn't a coin stack
// rebalance (those live in coins.js).
//
// Cross-module calls (via helpers) go ONE-WAY into equipFlow for bag
// re-equip (because lootBag triggers an async bag swap when the user
// clicks a container). Auto-equip side of the fence uses direct imports
// from equipment.js - equipment.js already reaches back via
// `panelState.helpers.addLootItemToBag` so there is no circular load.
//
// The context menu holds one closure variable (`lootContextIndex`)
// shared between show/hide/discard - exposed via setupLootBagContextMenu.

import { imageUrl } from '../../dataService.js';
import {
  getCurrentLightElapsedMs,
  getLootLightItemImage,
} from '../../systems/lighting/LightItems.js';
import {
  onPanelLog,
  onConsumeFood,
  onUseLiquid,
  onUseTool,
  setLastLootRejectReason,
} from '../../state/playerSession.js';
import { panelState } from './state.js';
import {
  hideItemTooltip,
  bindTooltip,
  showTouchLootTooltip,
  getFoodTimeSeconds,
} from './itemTooltip.js';
import {
  setEquippedSlotVisual,
  clearEquippedSlotVisual,
  resolveEquipSlotForItem,
  resolveSellUnitPrice,
  tryAutoEquipArmorUpgrade,
  tryAutoEquipShieldUpgrade,
  tryAutoEquipWeaponUpgrade,
  tryAutoEquipAccessory,
} from './equipment.js';
import { SLOT_RULES } from './constants.js';
import {
  addCoinsToInventory,
  normalizeCoinStacks,
} from './coins.js';

// Closure state shared by show/hide/discard. -1 means "no row selected".
let lootContextIndex = -1;

export function hideLootContextMenu() {
  const lootContextMenu = document.getElementById('lootContextMenu');
  if (!lootContextMenu) return;
  lootContextMenu.style.display = 'none';
  lootContextIndex = -1;
}

export function showLootContextMenu(x, y, index) {
  const lootContextMenu = document.getElementById('lootContextMenu');
  if (!lootContextMenu) return;
  lootContextIndex = index;
  lootContextMenu.style.display = 'block';
  lootContextMenu.style.left = `${Math.min(window.innerWidth - 140, Math.max(0, x))}px`;
  lootContextMenu.style.top = `${Math.min(window.innerHeight - 70, Math.max(0, y))}px`;
}

// Right-click on an equipped slot → sell the item for its unit price.
// Left-click → move the item into the loot bag (if there is capacity).
// Lives here because both branches write into panelState.bagLootItems and
// re-render the grid. Called once from the orchestrator.
export function setupEquippedSlotHandlers() {
  for (const slotKey of Object.keys(SLOT_RULES)) {
    const rule = SLOT_RULES[slotKey];
    const slotRoot = document.getElementById(`slot${rule.id}`);
    if (!slotRoot) continue;
    slotRoot.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const equipped = panelState.equippedSlots[slotKey];
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
      const equipped = panelState.equippedSlots[slotKey];
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
}

// Wires every DOM-level handler that the loot context menu needs. Called
// once from the orchestrator after DOM refs are available.
export function setupLootBagContextMenu() {
  const discardLootBtn = document.getElementById('discardLootBtn');
  document.addEventListener('click', hideLootContextMenu);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideLootContextMenu();
  });
  window.addEventListener('blur', hideLootContextMenu);
  if (discardLootBtn) {
    discardLootBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (lootContextIndex < 0 || lootContextIndex >= panelState.bagLootItems.length) {
        hideLootContextMenu();
        return;
      }
      const removed = panelState.bagLootItems[lootContextIndex];
      panelState.bagLootItems.splice(lootContextIndex, 1);
      hideLootContextMenu();
      renderLootSlots(panelState.currentBagCapacity);
      if (removed) {
        const equipmentFoot = document.getElementById('equipmentFoot');
        if (equipmentFoot) {
          const textEl = document.getElementById('equipmentFootText');
          if (textEl) textEl.textContent = `Discarded: ${removed.title}`;
        }
      }
    });
  }
}

export function renderLootSlots(slotCount) {
  const lootGrid = document.getElementById('lootGrid');
  const lootFoot = document.getElementById('lootFoot');
  if (!lootGrid || !lootFoot) return;
  hideItemTooltip();
  hideLootContextMenu();
  lootGrid.innerHTML = '';
  const count = Math.max(0, Math.floor(Number(slotCount) || 0));
  for (let i = 1; i <= count; i += 1) {
    const cell = document.createElement('div');
    const lootItem = panelState.bagLootItems[i - 1] || null;
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
        const current = panelState.bagLootItems[idx];
        if (!current) return;
        const unitPrice = resolveSellUnitPrice(current);
        const amount = Math.max(1, Number(current.count || 1));
        const totalGold = Math.max(0, Math.floor(unitPrice * amount));
        panelState.bagLootItems.splice(idx, 1);
        addCoinsToInventory(totalGold);
        renderLootSlots(panelState.currentBagCapacity);
        if (typeof onPanelLog === 'function') {
          onPanelLog(`Sold ${current.title} for ${totalGold} gold.`);
        }
      });
      cell.addEventListener('mousedown', async (ev) => {
        if (ev.button !== 0) return; // left click only
        const idx = i - 1;
        const current = panelState.bagLootItems[idx];
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
            panelState.bagLootItems.splice(idx, 1);
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
            panelState.bagLootItems.splice(idx, 1);
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
          const equippedBagCopy = panelState.currentBagItem ? { ...panelState.currentBagItem } : null;
          const equippedOk = await panelState.helpers.equipBagByArticleId(bagArticleId);
          if (!equippedOk) return;
          if (equippedBagCopy) {
            panelState.bagLootItems[idx] = equippedBagCopy;
          } else {
            panelState.bagLootItems.splice(idx, 1);
          }
          renderLootSlots(panelState.currentBagCapacity);
          return;
        }

        const slotKey = resolveEquipSlotForItem(current);
        if (!slotKey) return;
        const equipped = panelState.equippedSlots[slotKey];
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
          panelState.bagLootItems[idx] = equippedCopy;
        } else {
          panelState.bagLootItems.splice(idx, 1);
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

export function addLootItemToBag(itemData, opts = {}) {
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
    if (panelState.currentBagItem) total += itemUnitWeight(panelState.currentBagItem);
    for (const [slotKey, eq] of Object.entries(panelState.equippedSlots)) {
      if (excludeEquippedSlotKey && slotKey === excludeEquippedSlotKey) continue;
      if (!eq) continue;
      total += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
    }
    for (let i = 0; i < panelState.bagLootItems.length; i += 1) {
      if (excludeBagIndex != null && i === excludeBagIndex) continue;
      const it = panelState.bagLootItems[i];
      total += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
    }
    return total;
  };
  const incomingWeight = itemUnitWeight(incoming) * Math.max(1, Number(incoming.count || 1));
  if (totalCarriedWeight() + incomingWeight > panelState.currentPlayerCapacity) {
    setLastLootRejectReason('capacity');
    return false;
  }
  const sameItemIdentity = (a, b) => {
    if (!a || !b) return false;
    if (a.id != null && b.id != null) return Number(a.id) === Number(b.id);
    return String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase();
  };
  if (!disableAutoEquip) {
    const equippedHand = panelState.equippedSlots.hand;
    const equippedAmmo = panelState.equippedSlots.ammunition;
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
    const stackIdx = panelState.bagLootItems.findIndex((it) => (
      Boolean(it && it.isStackable)
      && (
        (incoming.id != null && it.id === incoming.id)
        || ((incoming.id == null || it.id == null) && it.title === incoming.title)
      )
    ));
    if (stackIdx >= 0) {
      panelState.bagLootItems[stackIdx].count = Math.max(1, Number(panelState.bagLootItems[stackIdx].count || 1)) + incoming.count;
      normalizeCoinStacks();
      renderLootSlots(panelState.currentBagCapacity);
      return true;
    }
  }
  const occupiedSlots = panelState.bagLootItems.length - (excludeBagIndex != null ? 1 : 0);
  if (occupiedSlots >= panelState.currentBagCapacity) {
    setLastLootRejectReason('slots');
    return false;
  }
  panelState.bagLootItems.push(incoming);
  normalizeCoinStacks();
  renderLootSlots(panelState.currentBagCapacity);
  return true;
}
