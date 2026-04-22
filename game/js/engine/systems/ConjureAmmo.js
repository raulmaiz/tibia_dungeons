// Conjure ammo spells (Arrow / Bolt creation). Owns the spell ID → ammo
// item mapping and a fetched-item cache for ammo IDs not present in the
// player-facing shop catalog.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

import { getEquippedAmmo } from './Weapons.js';

/** @typedef {import('../../types.js').Item} Item */
/** @typedef {import('../../types.js').Spell} Spell */

/**
 * Spell article_id → { itemId, title, count } for every conjure-ammo
 * spell. Used to match the cast spell to the ammo it produces without
 * relying on shop-catalog prices (many ammo types have value_buy=0 and
 * are absent from the shop catalog).
 */
const CONJURE_AMMO_MAP = new Map([
  [68921, { itemId: 68886, title: 'Simple Arrow',  count: 30 }],
  [1805,  { itemId: 1657,  title: 'Arrow',         count: 10 }],
  [1905,  { itemId: 2009,  title: 'Poison Arrow',  count: 7 }],
  [1912,  { itemId: 1673,  title: 'Bolt',          count: 5 }],
  [1940,  { itemId: 2015,  title: 'Burst Arrow',   count: 8 }],
  [1964,  { itemId: 2726,  title: 'Power Bolt',    count: 10 }],
  [16502, { itemId: 16501, title: 'Sniper Arrow',  count: 5 }],
  [16503, { itemId: 16498, title: 'Piercing Bolt', count: 5 }],
  [80912, { itemId: 80872, title: 'Diamond Arrow', count: 100 }],
  [80914, { itemId: 80873, title: 'Spectral Bolt', count: 100 }],
]);

/** Preloaded ammo Items keyed by id, for ammo missing from the shop catalog. */
const _conjureAmmoCache = new Map();

/**
 * Pre-fetch ammo items not present in the shop catalog (value_buy=0)
 * via getItemByArticleId. Call once after the shop catalog loads.
 *
 * @param {Item[] | null} itemsShopCatalog
 * @param {(articleId: number) => Promise<Item | null>} getItemByArticleId
 */
export async function primeConjureAmmoCache(itemsShopCatalog, getItemByArticleId) {
  for (const [, mapping] of CONJURE_AMMO_MAP) {
    const inShop = (itemsShopCatalog || []).some((it) => Number(it.id) === mapping.itemId);
    if (inShop) continue;
    try {
      const full = await getItemByArticleId(mapping.itemId);
      if (full) {
        full.isStackable = true;
        _conjureAmmoCache.set(mapping.itemId, full);
      }
    } catch { /* best effort */ }
  }
}

/**
 * Resolve a cast spell to an ammo payload: preferred path is the static
 * mapping; fallback parses the effect text like "Creates 5 Arrows.".
 *
 * @param {Spell | null} spell
 * @returns {{ itemId?: number, title?: string, count: number } | null}
 */
export function conjureArrowPayloadFromSpell(spell) {
  const id = Number(spell && spell.article_id);
  const mapping = CONJURE_AMMO_MAP.get(id);
  if (mapping) return { itemId: mapping.itemId, count: mapping.count };
  const effectRaw = String((spell && spell.raw && spell.raw.effect) || '').trim();
  if (!effectRaw) return null;
  const m = effectRaw.match(/(?:creates?|create)\s+(\d+)\s+(.+?)\.?\s*$/i);
  if (!m) return null;
  const count = Math.max(1, Number(m[1] || 1));
  const name = String(m[2] || '').trim();
  if (!/arrow|bolt/i.test(name)) return null;
  return {
    count,
    title: name
      .replace(/\barrows\b/ig, 'Arrow')
      .replace(/\bbolts\b/ig, 'Bolt')
      .replace(/\s+/g, ' ')
      .trim(),
  };
}

/**
 * Resolve a conjure payload to a concrete ammo Item, searching shop
 * catalog first (by id, then title), then the pre-fetched cache.
 *
 * @param {{ itemId?: number, title?: string }} payload
 * @param {Item[] | null} itemsShopCatalog
 */
export function resolveConjuredArrowItem(payload, itemsShopCatalog) {
  if (payload.itemId) {
    const byId = (itemsShopCatalog || []).find((it) => Number(it.id) === payload.itemId);
    if (byId) return byId;
    if (_conjureAmmoCache.has(payload.itemId)) return _conjureAmmoCache.get(payload.itemId);
  }
  const wanted = String(payload.title || '').trim().toLowerCase();
  if (!wanted) return null;
  const ammoItems = (itemsShopCatalog || []).filter((it) =>
    it && String(it.item_type || '').toLowerCase() === 'ammunition'
  );
  const exact = ammoItems.find((it) => String(it.title || '').trim().toLowerCase() === wanted);
  if (exact) return exact;
  const singular = wanted.replace(/\barrows\b/g, 'arrow').replace(/\bbolts\b/g, 'bolt').trim();
  return ammoItems.find((it) => String(it.title || '').trim().toLowerCase() === singular) || null;
}

/**
 * Place conjured ammo into the player's loadout. Preference order:
 *   1. Same ammo type equipped → stack onto ammo slot.
 *   2. Different ammo equipped → stash in loot bag.
 *   3. Ammo slot empty → equip directly.
 *
 * Returns 'ammo' | 'bag' | null depending on where it ended up.
 *
 * @param {Item | null} ammoItem
 * @param {number} amount
 * @param {{ inventorySetEquippedSlotVisual: Function | undefined }} deps
 */
export function placeConjuredArrow(ammoItem, amount, deps) {
  const { inventorySetEquippedSlotVisual } = deps;
  if (!ammoItem) return null;
  const qty = Math.max(1, Number(amount || 1));
  const equippedAmmo = getEquippedAmmo();
  const sameAmmoEquipped = Boolean(
    equippedAmmo && Number(equippedAmmo.id) === Number(ammoItem.id)
  );
  if (sameAmmoEquipped) {
    if (typeof inventorySetEquippedSlotVisual !== 'function') return null;
    const nextAmmo = {
      ...equippedAmmo,
      count: Math.max(1, Number(equippedAmmo.count || 1)) + qty,
    };
    return inventorySetEquippedSlotVisual('ammunition', nextAmmo, `${ammoItem.title} +${qty} (ammo slot).`)
      ? 'ammo'
      : null;
  }

  if (equippedAmmo) {
    const inv = window.debugInventory;
    const storedInBag = inv && typeof inv.addLoot === 'function'
      ? inv.addLoot({ ...ammoItem, isStackable: true, count: qty })
      : false;
    return storedInBag ? 'bag' : null;
  }

  if (typeof inventorySetEquippedSlotVisual !== 'function') return null;
  const equipped = inventorySetEquippedSlotVisual(
    'ammunition',
    { ...ammoItem, isStackable: true, count: qty },
    `Conjured ${qty} ${ammoItem.title}${qty > 1 ? 's' : ''} to ammo slot.`
  );
  return equipped ? 'ammo' : null;
}
