// Spell-shop sidebar panel - Phase 4 extraction from game.engine.js.
//
// The sidebar panel that lists every spell the player's class can learn
// at their current level, plus the "Buy Spell" flow. Symmetric with
// ItemsShop.js (search panel for physical items). Both panels share the
// same tooltip infrastructure (SpellTooltip.js) and the same pattern of
// reading gold through the inventory bridge (window.debugInventory).
//
// Module-level state:
//   _lastSpellShopKey - "[level]|[gold]|[roomCleared]|[learnedIds]" cache
//                       key. Skip the full DOM rebuild when nothing
//                       observably changed.
//
// Engine surface:
//   setupSpellShop(deps)  - wires coins-changed. Once on create.
//   renderSpellShop()     - public so updateHud() can refresh on level-up
//                           or after a manual spell learn.
//
// deps: {
//   playerClassKey,
//   getCatalog:             () => spellsCatalog,
//   getPlayerLevel:         () => playerLevel,
//   learnedSpellIds:        Set<number>  (mutable - we .add to it on buy),
//   learnedSpellOrder:      number[]     (mutable - we .push to it on buy),
//   getAliveCreaturesCount: () => number,
//   onHudRefresh:           () => void,
//   onLearnedSpellsRefresh: () => void,
// }

import { addCombatLog } from './CombatLog.js';
import { bindSpellTooltip } from './SpellTooltip.js';
import { isBlockedSpellTitle } from '../../entities/Spell/filters.js';

/** @typedef {import('../../types.js').Spell} Spell */

/**
 * @typedef {object} SpellShopDeps
 * @property {string} playerClassKey
 * @property {() => Spell[]} getCatalog
 * @property {() => number} getPlayerLevel
 * @property {Set<number>} learnedSpellIds            - mutated on buy
 * @property {number[]} learnedSpellOrder             - mutated on buy
 * @property {() => number} getAliveCreaturesCount
 * @property {() => void} onHudRefresh
 * @property {() => void} onLearnedSpellsRefresh
 */

// Light-family spells are universally available regardless of class - they're
// a core utility for the darkness / light system.
const UNIVERSAL_SPELL_IDS = new Set([797, 805, 1952]);

/** @type {SpellShopDeps | null} */
let deps = null;
let _lastSpellShopKey = '';

// Clear the cache key so the next renderSpellShop() rebuilds the DOM
// unconditionally. The learned-spells drag-reorder in the engine calls
// this after swapping positions - reordering doesn't change the sorted
// learned-ids, so without the invalidation the shop would short-circuit.
export function invalidateSpellShopCache() {
  _lastSpellShopKey = '';
}

export function renderSpellShop() {
  if (!deps) return;
  const spellsGrid = document.getElementById('spellsGrid');
  const spellsFoot = document.getElementById('spellsFoot');
  if (!spellsGrid || !spellsFoot) return;
  const currentGold = window.debugInventory && typeof window.debugInventory.getGold === 'function'
    ? Math.max(0, Number(window.debugInventory.getGold() || 0))
    : 0;
  const roomCleared = deps.getAliveCreaturesCount() === 0;
  const playerLevel = deps.getPlayerLevel();
  const learnedSpellIds = deps.learnedSpellIds;
  const learnedSpellOrder = deps.learnedSpellOrder;
  // Skip rebuild if nothing affecting the shop display has changed.
  const shopKey = `${playerLevel}|${currentGold}|${roomCleared ? 1 : 0}|${[...learnedSpellIds].sort((a, b) => a - b).join(',')}`;
  if (shopKey === _lastSpellShopKey) return;
  _lastSpellShopKey = shopKey;
  spellsGrid.innerHTML = '';
  const catalog = deps.getCatalog() || [];
  const available = catalog.filter((s) => {
    if (String(s.status || '').toLowerCase() !== 'active') return false;
    if (Math.max(0, Number(s.level || 0)) === 0) return false;
    if (String(s.spell_type || '').toLowerCase() === 'rune') return false;
    if (Math.max(0, Number(s.level || 0)) > playerLevel) return false;
    if (learnedSpellIds.has(Number(s.article_id))) return false;
    const classAllowed = UNIVERSAL_SPELL_IDS.has(Number(s.article_id))
      || Number((s.raw && s.raw[deps.playerClassKey]) || 0) === 1;
    if (!classAllowed) return false;
    const title = String(s.title || '').trim().toLowerCase();
    if (isBlockedSpellTitle(title)) return false;
    return true;
  });
  const frag = document.createDocumentFragment();
  for (const spell of available) {
    const row = document.createElement('div');
    row.className = 'spell-row';
    const lvl = Math.max(0, Number(spell.level || 0));
    const price = Math.max(0, Number(spell.price || 0));
    const isLearned = learnedSpellIds.has(Number(spell.article_id));
    const canLevel = playerLevel >= lvl;
    const canGold = currentGold >= price;
    const head = document.createElement('div');
    head.className = 'head';
    const left = document.createElement('span');
    left.textContent = spell.title || `Spell ${spell.article_id}`;
    const right = document.createElement('span');
    right.className = 'price';
    right.textContent = `${price} gp`;
    head.appendChild(left);
    head.appendChild(right);
    // Desktop: hover shows the tooltip. Mobile/tablet: use the
    // "Info" button below (touchShow: false disables tap-on-row).
    const showSpellTooltipAt = bindSpellTooltip(row, spell, { touchShow: false });
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Lv ${lvl}  ·  Mana ${Math.max(0, Number(spell.mana || 0))}`;
    const btn = document.createElement('button');
    btn.type = 'button';
    if (isLearned) {
      btn.textContent = '✓ Learned';
      btn.disabled = true;
    } else if (!canLevel) {
      btn.textContent = `Lv ${lvl} required`;
      btn.disabled = true;
    } else if (!canGold) {
      btn.textContent = `${price} gp required`;
      btn.disabled = true;
    } else if (!roomCleared) {
      btn.textContent = 'Clear room first';
      btn.disabled = true;
    } else {
      btn.textContent = 'Buy Spell';
      btn.className = 'btn-buy';
      btn.disabled = false;
      const buySpell = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.disabled) return;
        if (deps.getAliveCreaturesCount() > 0) {
          addCombatLog('Clear all creatures on this floor before buying spells.');
          return;
        }
        const spent = window.debugInventory && typeof window.debugInventory.spendGold === 'function'
          ? window.debugInventory.spendGold(price)
          : false;
        if (!spent) {
          addCombatLog(`Not enough gold to buy ${spell.title}.`);
          return;
        }
        btn.disabled = true;
        const boughtId = Number(spell.article_id);
        learnedSpellIds.add(boughtId);
        learnedSpellOrder.push(boughtId);
        if (learnedSpellOrder.length > 10) {
          addCombatLog(`Learned ${spell.title} - use ▲/▼ in Learned Spells to bring it into a hotkey slot.`);
        }
        addCombatLog(`Bought spell: ${spell.title} for ${price} gp.`);
        // The inventory redraws itself inside spendGoldFromInventory.
        deps.onHudRefresh();
        renderSpellShop();
        deps.onLearnedSpellsRefresh();
      };
      btn.addEventListener('mousedown', (ev) => {
        if (ev.button !== 0) return;
        buySpell(ev);
      });
      // Touch: only trigger the buy if the finger didn't move - this
      // way, dragging from the button scrolls the panel instead of
      // forcing a purchase.
      let btStartX = 0;
      let btStartY = 0;
      let btMoved = false;
      btn.addEventListener('touchstart', (ev) => {
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        btStartX = t.clientX;
        btStartY = t.clientY;
        btMoved = false;
      }, { passive: true });
      btn.addEventListener('touchmove', (ev) => {
        if (btMoved) return;
        const t = ev.touches && ev.touches[0];
        if (!t) return;
        if (Math.abs(t.clientX - btStartX) > 10 || Math.abs(t.clientY - btStartY) > 10) {
          btMoved = true;
        }
      }, { passive: true });
      btn.addEventListener('touchend', (ev) => {
        if (btMoved) return;
        buySpell(ev);
      }, { passive: false });
    }
    row.appendChild(head);
    row.appendChild(meta);
    // Mobile/tablet: an explicit "Info" button opens the tooltip
    // (tap-on-row is disabled above). Hidden on desktop via CSS,
    // where hovering the row already shows the tooltip.
    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'spell-row-info-btn';
    infoBtn.textContent = 'Info';
    infoBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const rect = infoBtn.getBoundingClientRect();
      showSpellTooltipAt({ clientX: rect.left, clientY: rect.top });
    });
    const actions = document.createElement('div');
    actions.className = 'spell-row-actions';
    actions.appendChild(btn);
    actions.appendChild(infoBtn);
    row.appendChild(actions);
    frag.appendChild(row);
  }
  spellsGrid.appendChild(frag);
  spellsFoot.textContent = roomCleared
    ? `Gold: ${currentGold} | Learned: ${learnedSpellIds.size}`
    : `Clear room to buy | Gold: ${currentGold} | Learned: ${learnedSpellIds.size}`;
  deps.onLearnedSpellsRefresh();
}

/** @param {SpellShopDeps} _deps */
export function setupSpellShop(_deps) {
  deps = _deps;
  window.addEventListener('coins-changed', renderSpellShop);
}
