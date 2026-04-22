// Learned-spells panel — Phase 4 extraction.
//
// The "Learned" sidebar panel. Each row shows one spell the player owns,
// with a slot-number badge (1..9,0) if it's in the hotbar, plus drag and
// up/down reorder controls. Reordering mutates the shared
// `learnedSpellOrder` array in place.
//
// Engine surface:
//   setupLearnedSpells(deps) — once on create
//   renderLearnedSpells()    — called when learned-set changes
//
// deps: {
//   getCatalog:             () => spellsCatalog,
//   learnedSpellIds:        Set<number>,
//   learnedSpellOrder:      number[]  (mutated in place on reorder),
//   onOrderChanged:         () => void  (engine clears spell-bar cache),
//   onPanelsResync:         () => void  (engine calls syncXxxPanelPosition × 3),
//   onSpellBarRefresh:      () => void,
//   onConsumableBarRefresh: () => void,
// }

import { bindSpellTooltip, hideSpellTooltip } from './SpellTooltip.js';
import { invalidateSpellShopCache } from './SpellShop.js';
import { isBlockedSpellTitle } from '../../entities/Spell/filters.js';

let deps = null;

export function setupLearnedSpells(_deps) {
  deps = _deps;
}

export function renderLearnedSpells() {
  if (!deps) return;
  const learnedGrid = document.getElementById('learnedSpellsGrid');
  const learnedFoot = document.getElementById('learnedSpellsFoot');
  if (!learnedGrid || !learnedFoot) return;
  learnedGrid.innerHTML = '';

  const learnedSpellIds = deps.learnedSpellIds;
  const learnedSpellOrder = deps.learnedSpellOrder;
  const catalog = deps.getCatalog() || [];

  // Build position map: spellId → index in learnedSpellOrder. First
  // 10 positions map to hotkey slots; any beyond are unslotted but
  // still user-reorderable via the up/down arrows.
  const posBySpellId = new Map();
  for (let i = 0; i < learnedSpellOrder.length; i += 1) {
    const id = learnedSpellOrder[i];
    if (id != null) posBySpellId.set(Number(id), i);
  }

  const learned = catalog
    .filter((s) => learnedSpellIds.has(Number(s.article_id)))
    .filter((s) => !isBlockedSpellTitle(s.title))
    .sort((a, b) => {
      const aPos = posBySpellId.has(Number(a.article_id)) ? posBySpellId.get(Number(a.article_id)) : Number.MAX_SAFE_INTEGER;
      const bPos = posBySpellId.has(Number(b.article_id)) ? posBySpellId.get(Number(b.article_id)) : Number.MAX_SAFE_INTEGER;
      if (aPos !== bPos) return aPos - bPos;
      return String(a.title || '').localeCompare(String(b.title || ''));
    });

  if (learned.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'learned-spell-row';
    empty.style.justifyContent = 'center';
    empty.style.color = '#475569';
    empty.textContent = 'No spells learned yet.';
    learnedGrid.appendChild(empty);
    learnedFoot.textContent = 'Total: 0';
    deps.onPanelsResync();
    deps.onSpellBarRefresh();
    deps.onConsumableBarRefresh();
    return;
  }

  // Drag state
  let draggedSpellId = null;

  const slotBadgeLabel = (slotIdx) => {
    if (slotIdx < 0 || slotIdx > 9) return null;
    return slotIdx < 9 ? String(slotIdx + 1) : '0';
  };

  // Swap two spells' positions in the master order array. This single
  // swap handles every case — both in hotkey slots, both unslotted, or
  // one of each (the hotkey "label" automatically follows positions).
  const applyDrop = (fromId, toId) => {
    if (fromId === toId) return;
    const fromIdx = learnedSpellOrder.findIndex((s) => Number(s) === Number(fromId));
    const toIdx   = learnedSpellOrder.findIndex((s) => Number(s) === Number(toId));
    if (fromIdx < 0 || toIdx < 0) return;
    [learnedSpellOrder[fromIdx], learnedSpellOrder[toIdx]] = [learnedSpellOrder[toIdx], learnedSpellOrder[fromIdx]];
    deps.onOrderChanged();
    invalidateSpellShopCache();
    renderLearnedSpells();
  };

  for (let i = 0; i < learned.length; i += 1) {
    const spell = learned[i];
    const spellId = Number(spell.article_id);
    const pos = posBySpellId.has(spellId) ? posBySpellId.get(spellId) : -1;
    const slotIdx = pos >= 0 && pos < 10 ? pos : -1;
    const badgeLabel = slotBadgeLabel(slotIdx);
    const prevId = i > 0 ? Number(learned[i - 1].article_id) : null;
    const nextId = i < learned.length - 1 ? Number(learned[i + 1].article_id) : null;

    const row = document.createElement('div');
    row.className = 'learned-spell-row';
    row.draggable = true;
    row.dataset.spellId = String(spellId);

    const handle = document.createElement('span');
    handle.className = 'ls-handle';
    handle.textContent = '⠿';
    row.appendChild(handle);

    const badge = document.createElement('span');
    badge.className = `ls-badge ${badgeLabel ? 'has-slot' : 'no-slot'}`;
    badge.textContent = badgeLabel || '–';
    row.appendChild(badge);

    const iconWrap = document.createElement('div');
    iconWrap.className = 'ls-icon';
    if (spell.image) {
      const img = document.createElement('img');
      img.src = spell.image;
      img.alt = spell.title;
      iconWrap.appendChild(img);
    }
    row.appendChild(iconWrap);

    const info = document.createElement('div');
    info.className = 'ls-info';
    const titleEl = document.createElement('div');
    titleEl.className = 'ls-title';
    titleEl.textContent = spell.title || '';
    const metaEl = document.createElement('div');
    metaEl.className = 'ls-meta';
    metaEl.textContent = `Lv ${Math.max(0, Number(spell.level || 0))}  ·  Mana ${Math.max(0, Number(spell.mana || 0))}`;
    info.appendChild(titleEl);
    info.appendChild(metaEl);
    row.appendChild(info);

    // Reorder arrows (touch / tablet / mobile — hidden via CSS on desktop)
    const arrows = document.createElement('div');
    arrows.className = 'ls-reorder-arrows';
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'ls-arrow-btn ls-arrow-up';
    upBtn.setAttribute('aria-label', 'Move spell up');
    upBtn.textContent = '▲';
    upBtn.disabled = prevId == null;
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'ls-arrow-btn ls-arrow-down';
    downBtn.setAttribute('aria-label', 'Move spell down');
    downBtn.textContent = '▼';
    downBtn.disabled = nextId == null;
    const stopDragOnArrow = (ev) => { ev.stopPropagation(); };
    upBtn.addEventListener('pointerdown', stopDragOnArrow);
    downBtn.addEventListener('pointerdown', stopDragOnArrow);
    upBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideSpellTooltip();
      if (prevId != null) applyDrop(spellId, prevId);
    });
    downBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideSpellTooltip();
      if (nextId != null) applyDrop(spellId, nextId);
    });
    row.addEventListener('click', (ev) => {
      if (ev.target.closest('.ls-reorder-arrows')) return;
      ev.stopPropagation();
    });
    arrows.appendChild(upBtn);
    arrows.appendChild(downBtn);
    row.appendChild(arrows);

    bindSpellTooltip(row, spell);

    row.addEventListener('dragstart', (ev) => {
      draggedSpellId = spellId;
      row.classList.add('ls-dragging');
      ev.dataTransfer.effectAllowed = 'move';
      ev.dataTransfer.setData('text/plain', String(spellId));
    });
    row.addEventListener('dragend', () => {
      draggedSpellId = null;
      row.classList.remove('ls-dragging');
      learnedGrid.querySelectorAll('.ls-drag-over').forEach((el) => el.classList.remove('ls-drag-over'));
    });
    row.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'move';
      if (draggedSpellId !== spellId) row.classList.add('ls-drag-over');
    });
    row.addEventListener('dragleave', () => row.classList.remove('ls-drag-over'));
    row.addEventListener('drop', (ev) => {
      ev.preventDefault();
      row.classList.remove('ls-drag-over');
      const fromId = Number(ev.dataTransfer.getData('text/plain'));
      if (fromId && fromId !== spellId) applyDrop(fromId, spellId);
    });

    learnedGrid.appendChild(row);
  }

  learnedFoot.textContent = `Total: ${learned.length}`;
  deps.onPanelsResync();
  deps.onSpellBarRefresh();
  deps.onConsumableBarRefresh();
}
