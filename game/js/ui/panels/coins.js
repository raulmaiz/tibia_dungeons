// Coin management for the loot bag. Owns the three-tier gold/platinum/crystal
// denomination logic: incoming gold is merged into the existing gold stack,
// then normalized upward into platinum and crystal coins whenever the ratios
// permit. Emits `coins-changed` (DOM event) + `EVENTS.COINS_CHANGED` (bus)
// so market-shop UIs and any future HUD piece can react without polling.
//
// State read/written on `panelState`:
//   • bagLootItems        — mutated in place when coin stacks are added/rebalanced
//   • coinTemplateById    — Map<articleId, template> populated on first flow
//   • currentBagCapacity  — read when refreshing loot slots after a spend
//
// Cross-module call: `panelState.helpers.renderLootSlots` (wired by the
// orchestrator in inventoryPanel.js).

import { getItemByArticleId } from '../../dataService.js';
import {
  GOLD_COIN_ID,
  PLATINUM_COIN_ID,
  CRYSTAL_COIN_ID,
  GOLD_PER_PLATINUM,
  PLATINUM_PER_CRYSTAL,
} from '../../config/game.config.js';
import { bus, EVENTS } from '../../core/EventBus.js';
import { panelState } from './state.js';

export async function ensureCoinTemplatesLoaded() {
  const ids = [GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID];
  await Promise.all(ids.map(async (id) => {
    try {
      const item = await getItemByArticleId(id);
      if (item) {
        panelState.coinTemplateById.set(id, {
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

export function normalizeCoinStacks() {
  const getCount = (id) => {
    const stack = panelState.bagLootItems.find((it) => Number(it.id) === id);
    return stack ? Math.max(1, Number(stack.count || 1)) : 0;
  };
  let gold = getCount(GOLD_COIN_ID);
  let platinum = getCount(PLATINUM_COIN_ID);
  let crystal = getCount(CRYSTAL_COIN_ID);
  platinum += Math.floor(gold / GOLD_PER_PLATINUM);
  gold %= GOLD_PER_PLATINUM;
  crystal += Math.floor(platinum / PLATINUM_PER_CRYSTAL);
  platinum %= PLATINUM_PER_CRYSTAL;
  panelState.bagLootItems = panelState.bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
  const putCoin = (id, count) => {
    if (count <= 0) return;
    const tpl = panelState.coinTemplateById.get(id);
    if (!tpl) return;
    panelState.bagLootItems.unshift({
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

export function addCoinsToInventory(goldAmount) {
  const amount = Math.max(0, Math.floor(Number(goldAmount) || 0));
  if (amount <= 0) return;
  const goldTpl = panelState.coinTemplateById.get(GOLD_COIN_ID);
  if (!goldTpl) return;
  const incoming = {
    ...goldTpl,
    count: amount,
  };
  const stackIdx = panelState.bagLootItems.findIndex((it) => Number(it.id) === GOLD_COIN_ID);
  if (stackIdx >= 0) {
    panelState.bagLootItems[stackIdx].count = Math.max(1, Number(panelState.bagLootItems[stackIdx].count || 1)) + amount;
  } else if (panelState.bagLootItems.length < panelState.currentBagCapacity) {
    panelState.bagLootItems.push(incoming);
  } else {
    // If there is no slot, try to force conversion by replacing lower-value coin stacks if present.
    panelState.bagLootItems.push(incoming);
  }
  normalizeCoinStacks();
}

export function getTotalGoldInInventory() {
  let gold = 0;
  let platinum = 0;
  let crystal = 0;
  for (const it of panelState.bagLootItems) {
    const id = Number(it && it.id);
    const count = Math.max(1, Number((it && it.count) || 1));
    if (id === GOLD_COIN_ID) gold += count;
    if (id === PLATINUM_COIN_ID) platinum += count;
    if (id === CRYSTAL_COIN_ID) crystal += count;
  }
  return gold + (platinum * GOLD_PER_PLATINUM) + (crystal * GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
}

export function setCoinsFromTotalGold(totalGold) {
  let value = Math.max(0, Math.floor(Number(totalGold) || 0));
  const crystal = Math.floor(value / (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL));
  value %= (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
  const platinum = Math.floor(value / GOLD_PER_PLATINUM);
  const gold = value % GOLD_PER_PLATINUM;
  panelState.bagLootItems = panelState.bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
  const putCoin = (id, count) => {
    if (count <= 0) return;
    const tpl = panelState.coinTemplateById.get(id);
    if (!tpl) return;
    panelState.bagLootItems.unshift({
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

export function spendGoldFromInventory(goldAmount) {
  const cost = Math.max(0, Math.floor(Number(goldAmount) || 0));
  if (cost <= 0) return true;
  const total = getTotalGoldInInventory();
  if (total < cost) return false;
  setCoinsFromTotalGold(total - cost);
  panelState.helpers.renderLootSlots(panelState.currentBagCapacity);
  return true;
}
