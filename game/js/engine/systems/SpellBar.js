// Spell hotbar + consumable hotbar — Phase 4 extraction.
//
// Two strips at the bottom of the screen:
//
//   spellBarSlots     — 10 hotkey slots (keys 1..9, 0). Each slot renders
//                       whichever spell sits at that index of
//                       learnedSpellOrder. Cooldown overlay + countdown
//                       text driven by spellCooldownUntil.
//   consumableBarSlots — 3 slots for Food (F), Mana (G), Health (H).
//                       Uses window.debugInventory.findConsumable().
//
// Pending-slot state lives here and the engine's update tick drains it
// via consumePendingSpellSlot() / consumePendingConsumable(). This
// replaces the previous pattern where the engine closure held
// `_pendingSpellSlot` / `_pendingConsumable` lets and window shims
// wrote to them.
//
// Engine surface:
//   setupSpellBar(deps)          — once at create time
//   renderSpellBar()             — call when learnedSpellOrder/Ids change
//   renderConsumableBar()        — call when inventory changes
//   invalidateSpellBarCache()    — learned-spell reorder path
//   consumePendingSpellSlot()    — returns 1..10 (or 0) + clears the flag
//   consumePendingConsumable()   — returns 'food'/'mana'/'health' or ''
//
// deps: {
//   getCatalog:             () => spellsCatalog,
//   learnedSpellIds:        Set<number>,
//   learnedSpellOrder:      number[],
//   spellCooldownUntil:     Map<number,number>,
//   spellCdDurations:       Map<number,number>,
// }

import { imageUrl } from '../../dataService.js';
import { bindSpellBarTooltip } from './SpellTooltip.js';

/** @typedef {import('../../types.js').Spell} Spell */

/**
 * @typedef {object} SpellBarDeps
 * @property {() => Spell[]} getCatalog               — the engine's spellsCatalog
 * @property {Set<number>} learnedSpellIds            — article_ids the player owns
 * @property {number[]} learnedSpellOrder             — first 10 = hotkey slots
 * @property {Map<number,number>} spellCooldownUntil  — spellId → epoch-ms when cd ends
 * @property {Map<number,number>} spellCdDurations    — spellId → cooldown length in seconds
 */

/** @type {SpellBarDeps | null} */
let deps = null;
let _lastSpellBarKey = '';
let _lastConsumableKey = '';
let _pendingSpellSlot = 0;
let _pendingConsumable = '';

/** @param {SpellBarDeps} _deps */
export function setupSpellBar(_deps) {
  deps = _deps;
  // Expose triggers globally — some legacy call sites in auth/login flows
  // poke these to simulate a hotkey press. Match the pre-extraction API.
  window._triggerSpellSlot = (slot) => { _pendingSpellSlot = slot; };
  window._triggerConsumable = (type) => { _pendingConsumable = type; };
  // 250ms tick to refresh the "N seconds left" text on every active
  // cooldown overlay. Rebuilding the DOM slot would be wasteful; this
  // only touches each .spell-cd-text node's textContent.
  setInterval(() => {
    const now2 = Date.now();
    for (const [spellId, cdUntil] of deps.spellCooldownUntil.entries()) {
      const rem = cdUntil - now2;
      const textEl = document.querySelector(`.spell-cd-text[data-cd-text-for="${spellId}"]`);
      if (!textEl) continue;
      textEl.textContent = rem > 200 ? String(Math.ceil(rem / 1000)) : '';
    }
  }, 250);
}

export function invalidateSpellBarCache() {
  _lastSpellBarKey = '';
}

export function consumePendingSpellSlot() {
  const slot = _pendingSpellSlot;
  _pendingSpellSlot = 0;
  return slot;
}

export function consumePendingConsumable() {
  const t = _pendingConsumable;
  _pendingConsumable = '';
  return t;
}

export function renderSpellBar() {
  if (!deps) return;
  const slotsEl = document.getElementById('spellBarSlots');
  if (!slotsEl) return;
  const { learnedSpellOrder, learnedSpellIds } = deps;
  // Skip rebuild if slot assignments haven't changed — prevents per-frame flicker
  const barKey = learnedSpellOrder.slice(0, 10).join(',') + '|' + [...learnedSpellIds].sort((a, b) => a - b).join(',');
  if (barKey === _lastSpellBarKey) return;
  _lastSpellBarKey = barKey;
  slotsEl.innerHTML = '';
  const now = Date.now();
  const catalog = deps.getCatalog() || [];
  const spellById = new Map();
  for (const s of catalog) spellById.set(Number(s.article_id), s);

  const makeImgWrap = (spell, spellId) => {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'spell-slot-img-wrap';
    if (spell && spell.image) {
      const img = document.createElement('img');
      img.className = 'spell-slot-img';
      img.src = spell.image;
      img.alt = spell.title;
      imgWrap.appendChild(img);
    }
    const cdOverlay = document.createElement('div');
    cdOverlay.className = 'spell-cd-overlay';
    if (spellId != null) cdOverlay.dataset.cdFor = String(spellId);
    const cdText = document.createElement('div');
    cdText.className = 'spell-cd-text';
    if (spellId != null) cdText.dataset.cdTextFor = String(spellId);
    imgWrap.appendChild(cdOverlay);
    imgWrap.appendChild(cdText);
    // Restore active cooldown if any
    if (spellId != null) {
      const cdUntil = Number(deps.spellCooldownUntil.get(spellId) || 0);
      const totalMs = (deps.spellCdDurations.get(spellId) || 0) * 1000;
      if (now < cdUntil && totalMs > 0) {
        const remMs = cdUntil - now;
        const durSec = (remMs / 1000).toFixed(2);
        cdOverlay.style.setProperty('--cd-dur', `${durSec}s`);
        cdOverlay.classList.add('cd-active');
        cdText.textContent = String(Math.ceil(remMs / 1000));
      }
    }
    return imgWrap;
  };

  // Hotkey slots 1-9 + 0 (index 9 = slot 10 = key "0")
  for (let i = 0; i < 10; i += 1) {
    const spellId = i < learnedSpellOrder.length && learnedSpellOrder[i] != null ? Number(learnedSpellOrder[i]) : null;
    const spell = spellId != null ? spellById.get(spellId) : null;
    const slot = document.createElement('div');
    slot.className = `spell-slot ${spell ? 'active' : 'empty'}`;
    if (spellId != null) slot.dataset.spellId = String(spellId);
    const keyBadge = document.createElement('span');
    keyBadge.className = 'spell-slot-key';
    keyBadge.textContent = i < 9 ? String(i + 1) : '0';
    slot.appendChild(keyBadge);
    slot.appendChild(makeImgWrap(spell, spellId));
    const nameEl = document.createElement('span');
    nameEl.className = 'spell-slot-name';
    nameEl.textContent = spell ? spell.title : '';
    slot.appendChild(nameEl);
    if (spell) bindSpellBarTooltip(slot, spell, null);
    const slotNum = i < 9 ? i + 1 : 10;
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      _pendingSpellSlot = slotNum;
    });
    slotsEl.appendChild(slot);
  }
}

export function renderConsumableBar() {
  const container = document.getElementById('consumableBarSlots');
  if (!container) return;
  const inv = window.debugInventory;
  const types = [
    { type: 'food',   key: 'F', cssClass: 'food-slot' },
    { type: 'mana',   key: 'G', cssClass: 'mana-slot' },
    { type: 'health', key: 'H', cssClass: 'health-slot' },
  ];
  const barKey = types.map(t => {
    const f = inv ? inv.findConsumable(t.type) : null;
    return f ? `${f.item.id}:${f.item.count}` : '-';
  }).join('|');
  if (barKey === _lastConsumableKey) return;
  _lastConsumableKey = barKey;
  container.innerHTML = '';
  for (const t of types) {
    const found = inv ? inv.findConsumable(t.type) : null;
    const item = found ? found.item : null;
    const slot = document.createElement('div');
    slot.className = `spell-slot consumable-slot ${t.cssClass} ${item ? 'active' : 'empty'}`;
    const keyBadge = document.createElement('span');
    keyBadge.className = 'spell-slot-key';
    keyBadge.textContent = t.key;
    slot.appendChild(keyBadge);
    const imgWrap = document.createElement('div');
    imgWrap.className = 'spell-slot-img-wrap';
    if (item && item.image) {
      const img = document.createElement('img');
      img.className = 'spell-slot-img';
      img.src = imageUrl(item.image);
      img.alt = item.title;
      imgWrap.appendChild(img);
    }
    if (item && item.count > 1) {
      const countEl = document.createElement('span');
      countEl.className = 'spell-slot-count';
      countEl.textContent = String(item.count);
      imgWrap.appendChild(countEl);
    }
    slot.appendChild(imgWrap);
    const nameEl = document.createElement('span');
    nameEl.className = 'spell-slot-name';
    nameEl.textContent = item ? item.title : t.type.charAt(0).toUpperCase() + t.type.slice(1);
    slot.appendChild(nameEl);
    slot.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      _pendingConsumable = t.type;
    });
    container.appendChild(slot);
  }
}
