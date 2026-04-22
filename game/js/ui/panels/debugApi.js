// Developer debug API. Exposes `window.debugInventory` so we can poke at
// inventory state from the browser console — equip by article_id, dump the
// current state, add/spend gold, find/consume items.
//
// Not used by game logic. Kept out of the orchestrator so the hot path
// reads cleanly and so removing the debug surface is one grep away.

import { panelState } from './state.js';
import {
  addCoinsToInventory,
  getTotalGoldInInventory,
  spendGoldFromInventory,
} from './coins.js';
import {
  addLootItemToBag,
  renderLootSlots,
} from './lootBag.js';
import {
  clearEquippedSlotVisual,
} from './equipment.js';
import {
  equipBagByArticleId,
  equipItemInSlot,
} from './equipFlow.js';
import {
  getFoodTimeSeconds,
} from './itemTooltip.js';
import {
  onConsumeFood,
  onUseLiquid,
} from '../../state/playerSession.js';

export function installDebugInventoryApi() {
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
      if (panelState.currentBagItem) carriedWeight += itemUnitWeight(panelState.currentBagItem);
      for (const eq of Object.values(panelState.equippedSlots)) {
        if (!eq) continue;
        carriedWeight += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
      }
      for (const it of panelState.bagLootItems) {
        carriedWeight += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
      }
      return {
        bag: panelState.currentBagItem,
        equipped: { ...panelState.equippedSlots },
        bagSlots: panelState.currentBagCapacity,
        capacity: panelState.currentPlayerCapacity,
        carriedWeight,
        used: panelState.bagLootItems.length,
        items: [...panelState.bagLootItems],
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
      for (let i = 0; i < panelState.bagLootItems.length; i++) {
        const it = panelState.bagLootItems[i];
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
        panelState.bagLootItems.splice(idx, 1);
      }
      renderLootSlots(panelState.currentBagCapacity);
      return true;
    },
  };
}
