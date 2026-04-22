// Market shop — Phase 4 extraction from game.engine.js.
//
// Self-contained module that owns the #marketOverlay UI: category tree,
// item grid, item detail pane, buy splash, gold/capacity HUD, banner, and
// the open/close lifecycle. Module-level state because there is only one
// market instance per page.
//
// Engine surface:
//   setupMarket(scene, deps) — wires DOM listeners + `coins-changed`.
//                              Must be called once at scene create.
//   updateOpenMarketButton()  — called when creatures die/spawn so the
//                              Open Market button reflects the room state.
//   updateMarketBanner()      — called in the same spots so the "combat
//                              started — market closed" banner stays in
//                              sync when the market is open mid-combat.
//
// deps: {
//   getCatalog:             () => itemsShopCatalog,
//   playerClassKey:         'knight' | 'paladin' | 'sorcerer' | 'druid',
//   getAliveCreaturesCount: () => number (used to gate buys + button),
//   onHudRefresh:           () => void  (engine repaints HUD after buy),
// }
//
// The market reads gold + stores loot via the inventory panel's
// `window.debugInventory` bridge so the buy flow survives closure
// isolation. lastLootRejectReason is the live binding from playerSession
// — the inventory panel writes to it; we read it on capacity-reject.

import { imageUrl } from '../../dataService.js';
import { lastLootRejectReason } from '../../state/playerSession.js';
import { addCombatLog } from './CombatLog.js';
import { bindItemShopTooltip } from './ItemsShop.js';

// Whitelist for Light Sources — the catalog contains many state-derived
// entries (Lit / Burnt Down / stub variants) that shouldn't be purchasable
// separately. Only the "fresh" ids are sold.
const LIGHT_SOURCES_WHITELIST = new Set([1396, 1671, 3517, 3519]);

// Whole item_class categories hidden from the market tree.
const MARKET_HIDDEN_CLASSES = new Set([
  'fireworks',
  'flora and minerals',
  'household items',
  'imbuement scrolls',
  'misc',
  'other items',
  'plants, animal products, food and drink',
  'quest items',
  'runes',
  'wall coverings',
]);

// item_type subcategories hidden within a given class. Keyed as
// `${class}::${type}` so the same type name can be kept elsewhere.
const MARKET_HIDDEN_TYPES = new Set([
  'body equipment::extra slot',
  'body equipment::quivers',
  'body equipment::spellbooks',
  'body equipment::valuables',
  'tools and other equipment::creature products',
  'tools and other equipment::taming items',
  'tools and other equipment::valuables',
]);

// ── module state ───────────────────────────────────────────────────────
let marketEls = null;
let deps = null;
let marketOpen = false;
let marketBuySplashEl = null;
let _bannerTimeout = null;

const marketState = {
  selectedClass: null,
  selectedType: null,
  selectedItemId: null,
  sort: 'name',
};

// ── helpers ────────────────────────────────────────────────────────────
const normMarketKey = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Virtual re-classification: some items live under otherwise-hidden
// classes in the data (Household / Other Items) but we still want them
// in the market under a friendlier parent category.
function resolveMarketClass(it) {
  if (normMarketKey(it.item_type) === 'containers') return 'Tools and other Equipment';
  return it.item_class;
}

function getVisibleMarketCatalog() {
  const catalog = deps.getCatalog() || [];
  return catalog.filter((it) => {
    const t = normMarketKey(it.item_type);
    const c = normMarketKey(resolveMarketClass(it));
    // Items with no item_class end up in a synthetic "Misc" bucket —
    // hide them entirely instead of exposing that fallback group.
    if (!c) return false;
    if (/^exercise\s*weapons?$/.test(t)) return false;
    if (t === 'rods' && deps.playerClassKey !== 'druid') return false;
    if (t === 'wands' && deps.playerClassKey !== 'sorcerer') return false;
    if (t === 'light sources' && !LIGHT_SOURCES_WHITELIST.has(Number(it.id))) return false;
    if (MARKET_HIDDEN_CLASSES.has(c)) return false;
    if (MARKET_HIDDEN_TYPES.has(`${c}::${t}`)) return false;
    return true;
  });
}

function buildMarketTree() {
  const byClass = new Map();
  for (const it of getVisibleMarketCatalog()) {
    const cls = String(resolveMarketClass(it) || 'Misc').trim() || 'Misc';
    const typ = String(it.item_type || 'Other').trim() || 'Other';
    if (!byClass.has(cls)) byClass.set(cls, new Map());
    const types = byClass.get(cls);
    if (!types.has(typ)) types.set(typ, []);
    types.get(typ).push(it);
  }
  return byClass;
}

function sortMarketItems(items) {
  const out = [...items];
  if (marketState.sort === 'price-asc') {
    out.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (marketState.sort === 'price-desc') {
    out.sort((a, b) => Number(b.price) - Number(a.price));
  } else {
    out.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  }
  return out;
}

function getMarketGoldNow() {
  return window.debugInventory && typeof window.debugInventory.getGold === 'function'
    ? Math.max(0, Number(window.debugInventory.getGold() || 0)) : 0;
}

// ── rendering ──────────────────────────────────────────────────────────
function renderMarketTree() {
  if (!marketEls.tree) return;
  const tree = buildMarketTree();
  marketEls.tree.innerHTML = '';
  const frag = document.createDocumentFragment();
  const sortedClasses = [...tree.keys()].sort();
  for (const cls of sortedClasses) {
    const details = document.createElement('details');
    details.className = 'market-tree-class';
    details.open = cls === marketState.selectedClass;
    const summary = document.createElement('summary');
    const types = tree.get(cls);
    const total = [...types.values()].reduce((a, v) => a + v.length, 0);
    summary.innerHTML = `<span>${cls}</span><span class="count">${total}</span>`;
    details.appendChild(summary);
    const sortedTypes = [...types.keys()].sort();
    for (const typ of sortedTypes) {
      const row = document.createElement('div');
      row.className = 'market-tree-type';
      if (marketState.selectedClass === cls && marketState.selectedType === typ) {
        row.classList.add('active');
      }
      row.innerHTML = `<span>${typ}</span><span class="count">${types.get(typ).length}</span>`;
      row.addEventListener('click', () => {
        marketState.selectedClass = cls;
        marketState.selectedType = typ;
        marketState.selectedItemId = null;
        renderMarketTree();
        renderMarketGrid();
        renderMarketDetail();
      });
      details.appendChild(row);
    }
    frag.appendChild(details);
  }
  marketEls.tree.appendChild(frag);
}

function renderMarketCards(items) {
  if (!marketEls.grid) return;
  const currentGold = getMarketGoldNow();
  const frag = document.createDocumentFragment();
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'market-card';
    if (item.id === marketState.selectedItemId) card.classList.add('selected');
    const price = Math.max(0, Number(item.price || 0));
    if (currentGold < price) card.classList.add('cant-afford');
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img-wrap';
    if (item.image) {
      const img = document.createElement('img');
      img.src = imageUrl(item.image);
      img.alt = item.title || '';
      imgWrap.appendChild(img);
    }
    card.appendChild(imgWrap);
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = item.title || `Item ${item.id}`;
    card.appendChild(title);
    const priceEl = document.createElement('div');
    priceEl.className = 'card-price';
    priceEl.textContent = `${price} gp`;
    card.appendChild(priceEl);
    bindItemShopTooltip(card, item);
    card.addEventListener('click', () => {
      marketState.selectedItemId = item.id;
      renderMarketGrid();
      renderMarketDetail();
    });
    frag.appendChild(card);
  }
  marketEls.grid.innerHTML = '';
  marketEls.grid.appendChild(frag);
}

function renderMarketGrid() {
  if (!marketEls.grid || !marketEls.breadcrumb) return;
  if (!marketState.selectedClass || !marketState.selectedType) {
    marketEls.breadcrumb.innerHTML = '<strong>Select a category</strong>';
    marketEls.grid.innerHTML = '';
    return;
  }
  const tree = buildMarketTree();
  const list = (tree.get(marketState.selectedClass) || new Map()).get(marketState.selectedType) || [];
  marketEls.breadcrumb.innerHTML = `${marketState.selectedClass} › <strong>${marketState.selectedType}</strong> <span style="color:#64748b">(${list.length})</span>`;
  renderMarketCards(sortMarketItems(list));
}

function renderMarketDetail() {
  if (!marketEls.detail) return;
  const detailEl = marketEls.detail;
  if (!marketState.selectedItemId) {
    detailEl.innerHTML = '<div class="detail-empty">Select an item to see details</div>';
    return;
  }
  const catalog = deps.getCatalog() || [];
  const item = catalog.find((it) => it.id === marketState.selectedItemId);
  if (!item) {
    detailEl.innerHTML = '<div class="detail-empty">Item not found</div>';
    return;
  }
  const price = Math.max(0, Number(item.price || 0));
  const isStackable = Number((item.raw && item.raw.is_stackable) || 0) === 1;
  const currentGold = getMarketGoldNow();
  const roomCleared = deps.getAliveCreaturesCount() === 0;
  detailEl.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'detail-head';
  const imgWrap = document.createElement('div');
  imgWrap.className = 'detail-img-wrap';
  if (item.image) {
    const img = document.createElement('img');
    img.src = imageUrl(item.image);
    img.alt = item.title || '';
    imgWrap.appendChild(img);
  }
  head.appendChild(imgWrap);
  const nameBlock = document.createElement('div');
  const nameEl = document.createElement('div');
  nameEl.className = 'detail-name';
  nameEl.textContent = item.title || `Item ${item.id}`;
  nameBlock.appendChild(nameEl);
  if (item.item_class || item.item_type) {
    const sub = document.createElement('div');
    sub.className = 'detail-subline';
    sub.textContent = `${item.item_class || ''}${item.item_class && item.item_type ? ' › ' : ''}${item.item_type || ''}`;
    nameBlock.appendChild(sub);
  }
  head.appendChild(nameBlock);
  detailEl.appendChild(head);
  const statsRows = [];
  if (Number(item.attack_value) > 0) statsRows.push(['Attack', item.attack_value]);
  if (Number(item.armor_value) > 0) statsRows.push(['Armor', item.armor_value]);
  if (Number(item.shielding_value) > 0) statsRows.push(['Defense', item.shielding_value]);
  if (Number(item.range_value) > 1) statsRows.push(['Range', item.range_value]);
  if (item.type_secondary) statsRows.push(['Subtype', item.type_secondary]);
  if (isStackable) statsRows.push(['Stackable', 'Yes']);
  if (statsRows.length > 0) {
    const stats = document.createElement('div');
    stats.className = 'detail-stats';
    for (const [k, v] of statsRows) {
      const keyEl = document.createElement('div');
      keyEl.className = 'stat-k';
      keyEl.textContent = k;
      const valEl = document.createElement('div');
      valEl.textContent = String(v);
      stats.appendChild(keyEl);
      stats.appendChild(valEl);
    }
    detailEl.appendChild(stats);
  }
  if (item.description) {
    const desc = document.createElement('div');
    desc.className = 'detail-desc';
    desc.textContent = item.description;
    detailEl.appendChild(desc);
  }
  const hiddenDetailAttrs = new Set(['is_walkable', 'upgrade_classification', 'upgrade_clasification']);
  const visibleAttrs = Array.isArray(item.attributes)
    ? item.attributes.filter(a => a && a.name && !hiddenDetailAttrs.has(String(a.name).trim().toLowerCase()))
    : [];
  // Show item weight
  const itemWeight = Number((item.raw && item.raw.weight) || 0);
  if (itemWeight > 0) {
    visibleAttrs.unshift({ name: 'Weight', value: `${itemWeight} oz` });
  }
  if (visibleAttrs.length > 0) {
    const attrs = document.createElement('div');
    attrs.className = 'detail-attrs';
    for (const a of visibleAttrs) {
      const row = document.createElement('div');
      row.className = 'attr';
      const k = document.createElement('span');
      k.textContent = a.name;
      const v = document.createElement('span');
      v.textContent = String(a.value);
      row.appendChild(k);
      row.appendChild(v);
      attrs.appendChild(row);
    }
    detailEl.appendChild(attrs);
  }
  const priceEl = document.createElement('div');
  priceEl.className = 'detail-price';
  priceEl.textContent = `${price} gp each`;
  detailEl.appendChild(priceEl);
  const row = document.createElement('div');
  row.className = 'detail-buy-row';
  const qtys = isStackable ? [1, 10, 100] : [1];
  for (const qty of qtys) {
    const btn = document.createElement('button');
    btn.type = 'button';
    const totalPrice = price * qty;
    const disabledReason = !roomCleared ? 'room'
      : (currentGold < totalPrice ? 'gold' : null);
    btn.textContent = `Buy x${qty}`;
    btn.disabled = disabledReason !== null;
    btn.title = disabledReason === 'room' ? 'Clear all creatures first'
      : (disabledReason === 'gold' ? `Need ${totalPrice} gp` : `${totalPrice} gp`);
    btn.addEventListener('click', () => { performMarketBuy(item, qty, btn); });
    row.appendChild(btn);
  }
  while (row.children.length < 3) {
    const ph = document.createElement('div');
    row.appendChild(ph);
  }
  detailEl.appendChild(row);
}

// ── buy flow ───────────────────────────────────────────────────────────
// Big centred splash shown on successful buy. Auto-removes after the
// animation. Replaces any previous splash so rapid purchases restart
// the animation cleanly.
function spawnMarketBuySplash(item, qty, totalPrice) {
  if (marketBuySplashEl) marketBuySplashEl.remove();
  const splash = document.createElement('div');
  splash.className = 'market-buy-splash';
  const label = document.createElement('div');
  label.className = 'splash-label';
  label.textContent = 'Purchased';
  splash.appendChild(label);
  const imgWrap = document.createElement('div');
  imgWrap.className = 'splash-img';
  if (item.image) {
    const img = document.createElement('img');
    img.src = imageUrl(item.image);
    img.alt = item.title || '';
    imgWrap.appendChild(img);
  }
  splash.appendChild(imgWrap);
  const title = document.createElement('div');
  title.className = 'splash-title';
  title.textContent = item.title || `Item ${item.id}`;
  splash.appendChild(title);
  const qtyEl = document.createElement('div');
  qtyEl.className = 'splash-qty';
  qtyEl.textContent = `× ${qty}  •  ${totalPrice} gp`;
  splash.appendChild(qtyEl);
  document.body.appendChild(splash);
  marketBuySplashEl = splash;
  setTimeout(() => {
    if (splash === marketBuySplashEl) marketBuySplashEl = null;
    splash.remove();
  }, 2450);
}

function flashMarketGold() {
  if (!marketEls.gold) return;
  marketEls.gold.classList.remove('spent');
  // Force reflow so the animation restarts if the user buys twice quickly.
  void marketEls.gold.offsetWidth;
  marketEls.gold.classList.add('spent');
  setTimeout(() => marketEls.gold && marketEls.gold.classList.remove('spent'), 540);
}

function performMarketBuy(item, qty/* , anchorEl */) {
  if (deps.getAliveCreaturesCount() > 0) {
    addCombatLog('Clear all creatures on this floor before buying items.');
    updateMarketBanner();
    return;
  }
  const price = Math.max(0, Number(item.price || 0));
  const isStackable = Number((item.raw && item.raw.is_stackable) || 0) === 1;
  const inv = window.debugInventory;
  if (!inv) return;
  const makeLootObj = (count) => ({
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
    count,
  });
  // Try bulk purchase first; if capacity fails, buy one-by-one
  const totalPrice = price * qty;
  const spent = inv.spendGold(totalPrice);
  if (!spent) {
    flashMarketBanner(`Not enough gold to buy ${item.title} x${qty} (need ${totalPrice} gp).`);
    renderMarketDetail();
    return;
  }
  let stored = inv.addLoot(makeLootObj(qty));
  if (stored) {
    addCombatLog(`Bought item: ${item.title} x${qty} for ${totalPrice} gp.`);
    spawnMarketBuySplash(item, qty, totalPrice);
  } else {
    // Bulk failed — refund and try buying one at a time
    const bulkReason = lastLootRejectReason;
    inv.addGold(totalPrice);
    let bought = 0;
    for (let i = 0; i < qty; i++) {
      if (!inv.spendGold(price)) break;
      if (!inv.addLoot(makeLootObj(1))) {
        inv.addGold(price);
        break;
      }
      bought++;
    }
    if (bought > 0) {
      const skipMsg = bought < qty
        ? (lastLootRejectReason === 'capacity' ? ` — not enough carrying capacity` : ` — loot bag is full`)
        : '';
      addCombatLog(`Bought item: ${item.title} x${bought} for ${price * bought} gp.${skipMsg}`);
      spawnMarketBuySplash(item, bought, price * bought);
      if (bought < qty) flashMarketBanner(`Bought ${bought}/${qty} — ${lastLootRejectReason === 'capacity' ? 'not enough carrying capacity' : 'loot bag is full'}.`);
    } else {
      const reason = (bulkReason || lastLootRejectReason) === 'capacity'
        ? 'Not enough carrying capacity'
        : 'Loot bag is full';
      flashMarketBanner(`${reason} — cannot buy ${item.title}.`);
      renderMarketDetail();
      return;
    }
  }
  flashMarketGold();
  deps.onHudRefresh();
  updateMarketGold();
  renderMarketGrid();
  renderMarketDetail();
}

function updateMarketGold() {
  if (marketEls.gold) {
    marketEls.gold.innerHTML = `<span class="gold-icon"></span>${getMarketGoldNow()} gp`;
  }
  if (marketEls.cap) {
    const inv = window.debugInventory && typeof window.debugInventory.state === 'function'
      ? window.debugInventory.state() : null;
    const capTotal = inv ? Number(inv.capacity || 0) : 0;
    const capCurrent = inv ? Number(inv.carriedWeight || 0) : 0;
    marketEls.cap.textContent = `CAP ${capCurrent.toFixed(1)}/${capTotal.toFixed(0)}`;
    const ratio = capTotal > 0 ? Math.min(capCurrent / capTotal, 1) : 0;
    const r = Math.round(226 + (248 - 226) * ratio);
    const g = Math.round(232 - (232 - 113) * ratio);
    const b = Math.round(240 - (240 - 113) * ratio);
    marketEls.cap.style.color = `rgb(${r},${g},${b})`;
  }
}

function flashMarketBanner(msg) {
  if (!marketEls.banner) return;
  if (_bannerTimeout) clearTimeout(_bannerTimeout);
  marketEls.banner.textContent = msg;
  marketEls.banner.dataset.show = 'true';
  _bannerTimeout = setTimeout(() => {
    marketEls.banner.textContent = 'Combat started — market closed';
    updateMarketBanner();
    _bannerTimeout = null;
  }, 2500);
}

export function updateMarketBanner() {
  if (!marketEls || !marketEls.banner) return;
  if (_bannerTimeout) return; // don't override a flash message
  const show = marketOpen && deps.getAliveCreaturesCount() > 0;
  marketEls.banner.dataset.show = show ? 'true' : 'false';
}

function openMarket() {
  if (deps.getAliveCreaturesCount() > 0) {
    addCombatLog('Clear all creatures on this floor before opening the market.');
    return;
  }
  marketOpen = true;
  if (marketEls.overlay) {
    marketEls.overlay.dataset.open = 'true';
    marketEls.overlay.setAttribute('aria-hidden', 'false');
  }
  renderMarketTree();
  renderMarketGrid();
  renderMarketDetail();
  updateMarketGold();
  updateMarketBanner();
}

function closeMarket() {
  marketOpen = false;
  if (marketEls.overlay) {
    marketEls.overlay.dataset.open = 'false';
    marketEls.overlay.setAttribute('aria-hidden', 'true');
  }
}

export function updateOpenMarketButton() {
  if (!marketEls || !marketEls.openBtn) return;
  const clear = deps.getAliveCreaturesCount() === 0;
  marketEls.openBtn.disabled = !clear;
  marketEls.openBtn.title = clear ? '' : 'Clear all creatures first';
}

// ── setup ──────────────────────────────────────────────────────────────
export function setupMarket(_deps) {
  deps = _deps;
  marketEls = {
    overlay: document.getElementById('marketOverlay'),
    tree: document.getElementById('marketTree'),
    grid: document.getElementById('marketGrid'),
    detail: document.getElementById('marketDetail'),
    sort: document.getElementById('marketSort'),
    breadcrumb: document.getElementById('marketBreadcrumb'),
    gold: document.getElementById('marketGold'),
    cap: document.getElementById('marketCap'),
    banner: document.getElementById('marketBanner'),
    openBtn: document.getElementById('openMarketBtn'),
    closeBtn: document.getElementById('marketCloseBtn'),
  };

  if (marketEls.openBtn) marketEls.openBtn.addEventListener('click', openMarket);
  if (marketEls.closeBtn) marketEls.closeBtn.addEventListener('click', closeMarket);
  if (marketEls.sort) {
    marketEls.sort.addEventListener('change', () => {
      marketState.sort = marketEls.sort.value;
      renderMarketGrid();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (marketOpen && e.key === 'Escape') closeMarket();
  });
  window.addEventListener('coins-changed', () => {
    if (!marketOpen) return;
    updateMarketGold();
    renderMarketGrid();
    renderMarketDetail();
  });

  updateOpenMarketButton();
}
