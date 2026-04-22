// Items-shop sidebar panel — Phase 4 extraction from game.engine.js.
//
// The always-open search panel in the left sidebar (matches items by
// title substring, minimum 3 chars, capped at 10 results). Shares the
// #itemTooltip DOM node with SpellTooltip and the market cards; only
// one tooltip is visible at a time.
//
// Module-level state because there is one items-shop per page:
//   itemsShopQuery      — last search string, survives re-renders
//   _lastItemsShopKey   — cache key for "nothing changed, skip render"
//
// Engine surface:
//   setupItemsShop(deps)    — wires search input + coins-changed +
//                             outside-click. Once on create.
//   renderItemsShop(query?) — public so updateHud() can refresh after
//                             level-ups / gold changes that weren't
//                             coins-changed events.
//   bindItemShopTooltip(el, item) — exported so Market.js can hover
//                             market cards without re-implementing the
//                             tooltip plumbing.
//
// deps: {
//   getCatalog:             () => itemsShopCatalog,
//   playerClassKey,
//   getAliveCreaturesCount: () => number,
//   onHudRefresh:           () => void,
// }

import { imageUrl } from '../../dataService.js';
import { averageMagicWeaponHitPreview } from '../../mechanics/progression.js';
import { addCombatLog } from './CombatLog.js';
import { esc, ttRow, hasRealHover, hideSpellTooltip } from './SpellTooltip.js';

/** @typedef {import('../../types.js').Item} Item */

/**
 * @typedef {object} ItemsShopDeps
 * @property {() => Item[]} getCatalog
 * @property {string} playerClassKey
 * @property {() => number} getAliveCreaturesCount
 * @property {() => void} onHudRefresh
 */

let itemsShopQuery = '';
let _lastItemsShopKey = '';
/** @type {ItemsShopDeps | null} */
let deps = null;

function formatItemShopTooltip(item) {
  if (!item) return '';
  const attrs = Array.isArray(item.attributes) ? item.attributes : [];
  const shopType = String(item.item_type || '').toLowerCase();
  let h = `<div class="tt-header"><div class="tt-title">${esc(item.title || `Item ${item.id}`)}</div></div>`;
  h += `<div class="tt-body">`;
  h += `<div class="tt-section">Shop</div>`;
  h += ttRow('Price', `${Math.max(0, Number(item.price || 0))} gp`);
  h += `<div class="tt-sep"></div>`;
  h += `<div class="tt-section">Type</div>`;
  h += ttRow('Class', item.item_class || '—');
  h += ttRow('Type', item.item_type || '—');
  if (item.type_secondary) h += ttRow('Secondary', item.type_secondary);
  if (shopType === 'wands' || shopType === 'rods') {
    const g = (n) => {
      const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === n);
      return row ? String(row.value || '').trim() : '';
    };
    const r = g('range'); const dt = g('damage_type'); const dr = g('damage_range'); const mc = g('mana_cost');
    h += `<div class="tt-sep"></div><div class="tt-section">Wand / Rod</div>`;
    if (r) h += ttRow('Range', r);
    if (dt) h += ttRow('Dmg type', dt);
    if (dr) h += ttRow('Dmg range', dr);
    if (mc) h += ttRow('Mana/shot', mc);
    const hud = (typeof window !== 'undefined' && window.__gameHud) ? window.__gameHud : { ml: 0, pl: 1 };
    const prev = averageMagicWeaponHitPreview(dr, Number(hud.ml) || 0, Number(hud.pl) || 1);
    if (prev != null) h += ttRow(`Est. hit ML${hud.ml}`, `~${prev}`);
  }
  const hiddenAttrNames = new Set([
    'range',
    'damage_type',
    'damage_range',
    'mana_cost',
    'is_walkable',
    'upgrade_classification',
    'upgrade_clasification',
  ]);
  const attrLabelMap = new Map([
    ['level', 'required level'],
  ]);
  const displayAttrs = attrs
    .filter((a) => {
      if (!a || !String(a.name || '').trim()) return false;
      const attrName = String(a.name || '').trim().toLowerCase();
      return !hiddenAttrNames.has(attrName);
    })
    .slice(0, 8);
  if (displayAttrs.length > 0) {
    h += `<div class="tt-sep"></div><div class="tt-section">Attributes</div>`;
    for (const a of displayAttrs) {
      const attrName = String(a.name || '').trim();
      const attrKey = attrName.toLowerCase();
      const attrLabel = attrLabelMap.get(attrKey) || attrName;
      h += ttRow(attrLabel, String(a.value || '—').trim());
    }
  }
  const desc = String(item.description || '').trim();
  if (desc) {
    h += `<div class="tt-sep"></div><div class="tt-effect">${esc(desc)}</div>`;
  }
  h += `</div>`;
  return h;
}

export function bindItemShopTooltip(el, item) {
  const tt = document.getElementById('itemTooltip');
  if (!el || !tt) return;
  const place = (ev) => {
    const padX = 36; const padY = 52;
    const x = Math.min(window.innerWidth - 270, ev.clientX + padX);
    const y = Math.min(window.innerHeight - 300, ev.clientY + padY);
    tt.style.left = `${Math.max(6, x)}px`;
    tt.style.top = `${Math.max(6, y)}px`;
  };
  const showAt = (ev) => {
    tt.innerHTML = formatItemShopTooltip(item);
    tt.style.display = 'block';
    tt.style.maxWidth = '260px';
    place(ev);
  };
  if (hasRealHover()) {
    el.addEventListener('mouseenter', showAt);
    el.addEventListener('mousemove', place);
    el.addEventListener('mouseleave', hideSpellTooltip);
  }
  // Unified tap-to-show via pointer events (see bindSpellTooltip).
  let _pitX = 0;
  let _pitY = 0;
  let _pitMoved = false;
  let _pitActive = false;
  el.addEventListener('pointerdown', (ev) => {
    _pitX = ev.clientX;
    _pitY = ev.clientY;
    _pitMoved = false;
    _pitActive = true;
  });
  el.addEventListener('pointermove', (ev) => {
    if (!_pitActive || _pitMoved) return;
    if (Math.abs(ev.clientX - _pitX) > 10 || Math.abs(ev.clientY - _pitY) > 10) {
      _pitMoved = true;
    }
  });
  el.addEventListener('pointerup', (ev) => {
    if (!_pitActive) return;
    _pitActive = false;
    if (_pitMoved) return;
    if (ev.pointerType === 'mouse') return;
    if (ev.target.closest && ev.target.closest('button')) return;
    showAt(ev);
  });
  el.addEventListener('pointercancel', () => { _pitActive = false; });
}

export function renderItemsShop(queryRaw = itemsShopQuery) {
  itemsShopQuery = String(queryRaw || '').trim();
  const gridEl = document.getElementById('itemsShopGrid');
  const footEl = document.getElementById('itemsShopFoot');
  if (!gridEl || !footEl) return;
  const currentGold = window.debugInventory && typeof window.debugInventory.getGold === 'function'
    ? Math.max(0, Number(window.debugInventory.getGold() || 0))
    : 0;
  const roomCleared = deps.getAliveCreaturesCount() === 0;
  const itemsKey = `${itemsShopQuery}|${currentGold}|${roomCleared ? 1 : 0}`;
  if (itemsKey === _lastItemsShopKey) return;
  _lastItemsShopKey = itemsKey;
  gridEl.innerHTML = '';
  if (itemsShopQuery.length < 3) {
    footEl.textContent = `Type at least 3 chars | Gold: ${currentGold}`;
    return;
  }
  const q = itemsShopQuery.toLowerCase();
  const catalog = deps.getCatalog() || [];
  const matches = catalog
    .filter((it) => {
      if (!String(it.title || '').toLowerCase().includes(q)) return false;
      const itemType = String(it.item_type || '').toLowerCase();
      const itemTypeNorm = itemType.replace(/\s+/g, ' ').trim();
      if (/^exercise\s*weapons?$/.test(itemTypeNorm)) return false;
      if (itemTypeNorm === 'rods') return deps.playerClassKey === 'druid';
      if (itemTypeNorm === 'wands') return deps.playerClassKey === 'sorcerer';
      return true;
    })
    .slice(0, 10);
  if (matches.length === 0) {
    footEl.textContent = `No items found for "${itemsShopQuery}"`;
    return;
  }
  const frag = document.createDocumentFragment();
  for (const item of matches) {
    const row = document.createElement('div');
    row.className = 'item-shop-row';
    bindItemShopTooltip(row, item);
    const head = document.createElement('div');
    head.className = 'item-shop-head';
    if (item.image) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'item-shop-img-wrap';
      const img = document.createElement('img');
      img.src = imageUrl(item.image);
      img.alt = item.title || 'Item';
      imgWrap.appendChild(img);
    }
    const nameEl = document.createElement('span');
    nameEl.className = 'item-shop-name';
    nameEl.textContent = item.title || `Item ${item.id}`;
    const priceEl = document.createElement('span');
    priceEl.className = 'item-shop-price';
    priceEl.textContent = `${Math.max(0, Number(item.price || 0))} gp`;
    head.appendChild(nameEl);
    head.appendChild(priceEl);
    const price = Math.max(0, Number(item.price || 0));
    const isStackable = Number((item.raw && item.raw.is_stackable) || 0) === 1;
    const buyWrap = document.createElement('div');
    buyWrap.className = 'buy-wrap';
    buyWrap.style.gridTemplateColumns = isStackable ? '1fr 1fr' : '1fr';
    const makeBuyButton = (qty) => {
      const totalPrice = price * qty;
      const btn = document.createElement('button');
      btn.type = 'button';
      if (!roomCleared) {
        btn.textContent = 'Clear room first';
        btn.disabled = true;
        return btn;
      }
      const canGold = currentGold >= totalPrice;
      if (!canGold) {
        btn.textContent = `Need ${totalPrice} gp`;
        btn.disabled = true;
        return btn;
      }
      btn.textContent = qty === 1 ? 'Buy x1' : 'Buy x100';
      btn.className = 'btn-buy';
      btn.disabled = false;
      btn.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.disabled) return;
        if (deps.getAliveCreaturesCount() > 0) {
          addCombatLog('Clear all creatures on this floor before buying items.');
          return;
        }
        const spent = window.debugInventory && typeof window.debugInventory.spendGold === 'function'
          ? window.debugInventory.spendGold(totalPrice)
          : false;
        if (!spent) {
          addCombatLog(`Not enough gold to buy ${item.title} x${qty}.`);
          renderItemsShop(itemsShopQuery);
          return;
        }
        const stored = window.debugInventory && typeof window.debugInventory.addLoot === 'function'
          ? window.debugInventory.addLoot({
            id: item.id,
            title: item.title,
            image: item.image,
            item_type: item.item_type,
            item_class: item.item_class,
            type_secondary: item.type_secondary,
            armor_value: item.armor_value,
            shielding_value: item.shielding_value,
            attack_value: item.attack_value,
            range_value: item.range_value,
            throwable: item.throwable,
            attributes: item.attributes,
            raw: item.raw,
            isStackable,
            count: qty,
          })
          : false;
        if (!stored) {
          if (window.debugInventory && typeof window.debugInventory.addGold === 'function') {
            window.debugInventory.addGold(totalPrice);
          }
          addCombatLog(`Cannot carry ${item.title}.`);
          renderItemsShop(itemsShopQuery);
          return;
        }
        addCombatLog(`Bought item: ${item.title} x${qty} for ${totalPrice} gp.`);
        deps.onHudRefresh();
        renderItemsShop(itemsShopQuery);
      });
      return btn;
    };
    buyWrap.appendChild(makeBuyButton(1));
    if (isStackable) buyWrap.appendChild(makeBuyButton(100));
    row.appendChild(head);
    row.appendChild(buyWrap);
    frag.appendChild(row);
  }
  gridEl.appendChild(frag);
  footEl.textContent = roomCleared
    ? `Results: ${matches.length} | Gold: ${currentGold}`
    : `Clear room to buy | Results: ${matches.length} | Gold: ${currentGold}`;
}

/** @param {ItemsShopDeps} _deps */
export function setupItemsShop(_deps) {
  deps = _deps;
  const searchInputEl = /** @type {HTMLInputElement | null} */ (document.getElementById('itemsShopSearchInput'));
  const accordionEl = /** @type {HTMLDetailsElement | null} */ (document.getElementById('itemsShopAccordion'));
  const panelEl = document.getElementById('itemsShopPanel');

  window.addEventListener('coins-changed', () => renderItemsShop(itemsShopQuery));
  if (searchInputEl) {
    searchInputEl.addEventListener('input', () => {
      renderItemsShop(searchInputEl.value || '');
    });
  }
  // Close items shop and return focus to game when clicking outside the panel.
  document.addEventListener('mousedown', (e) => {
    if (!accordionEl || !accordionEl.open) return;
    if (panelEl && panelEl.contains(/** @type {Node} */ (e.target))) return;
    accordionEl.open = false;
    if (searchInputEl) {
      searchInputEl.value = '';
      searchInputEl.blur();
      renderItemsShop('');
    }
  });
}
