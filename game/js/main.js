import {
  getCreatureTypeProgressionGroups,
  getItemByArticleId,
  getCreatureDropTable,
  getSpellsCatalogWithPrices,
} from './dataService.js';

let game;
let selectedSex = 'male';
let selectedClass = 'knight';
let playerConfig = null;
let typeProgressionGroups = [];
let creatureDropTable = new Map();
let onConsumeFood = null;
let onUseLiquid = null;
let onPlayerLevelStatsUpdate = null;
let onPanelLog = null;
let lastLootRejectReason = '';
let spellsCatalog = [];

const BASE_PLAYER_HP = 150;
const BASE_PLAYER_MANA = 10;
const BASE_PLAYER_CAPACITY = 400;
const CLASS_GROWTH = {
  knight: { hp: 15, mana: 5, capacity: 25 },
  paladin: { hp: 10, mana: 15, capacity: 20 },
  sorcerer: { hp: 5, mana: 30, capacity: 10 },
  druid: { hp: 5, mana: 30, capacity: 10 },
};
const MAX_FOOD_SECONDS = 900;

function progressionStatsForLevel(level, playerClass = selectedClass) {
  const lv = Math.max(1, Number(level || 1));
  const growth = CLASS_GROWTH[playerClass] || CLASS_GROWTH.knight;
  return {
    maxHp: BASE_PLAYER_HP + (lv - 1) * growth.hp,
    maxMana: BASE_PLAYER_MANA + (lv - 1) * growth.mana,
    capacity: BASE_PLAYER_CAPACITY + (lv - 1) * growth.capacity,
  };
}

const MAP_W = 20;
const MAP_H = 15;
const UI_BOTTOM_SPACE = 88;
const UI_OVERLAP_ROWS = 1.5;
const CREATURE_POOL_PER_LEVEL = 12;
const MIN_CREATURES_PER_LEVEL = 6;
const MAX_CREATURES_PER_LEVEL = 12;
const START_TILE = { gx: 1, gy: 1 };
const START_BAG_ARTICLE_ID = 1589;
const GOLD_COIN_ID = 2119;
const PLATINUM_COIN_ID = 2828;
const CRYSTAL_COIN_ID = 2948;
const GOLD_PER_PLATINUM = 100;
const PLATINUM_PER_CRYSTAL = 100;

function frameTextureName(sex, frame) {
  return `player_${sex}_${frame}`;
}

function deathTextureName(sex) {
  return `player_death_${sex}`;
}

function creatureKey(template) {
  return `creature_${template.id}`;
}

function creaturePlural(name, count) {
  return `${name}${count === 1 ? '' : 's'}`;
}

function pickRandomCreatures(pool, count) {
  if (!pool || pool.length === 0) return [];
  const copy = [...pool];
  Phaser.Utils.Array.Shuffle(copy);
  if (copy.length >= count) return copy.slice(0, count);
  const out = [...copy];
  while (out.length < count) out.push(copy[out.length % copy.length]);
  return out;
}

function pickRandomTileFrom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function rollCreatureDrops(creatureId) {
  const drops = creatureDropTable.get(Number(creatureId)) || [];
  if (drops.length === 0) return [];
  const won = [];
  for (const drop of drops) {
    const p = Math.max(0, Math.min(100, Number(drop.chance || 0)));
    if (Math.random() * 100 < p) won.push(drop);
  }
  return won;
}

function setupSelectorUI() {
  const choiceMale = document.getElementById('choiceMale');
  const choiceFemale = document.getElementById('choiceFemale');
  const classKnight = document.getElementById('classKnight');
  const classPaladin = document.getElementById('classPaladin');
  const classSorcerer = document.getElementById('classSorcerer');
  const classDruid = document.getElementById('classDruid');
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  const hungryIndicator = document.getElementById('hungryIndicator');
  const hungryLabel = document.getElementById('hungryLabel');
  const lootContextMenu = document.getElementById('lootContextMenu');
  const discardLootBtn = document.getElementById('discardLootBtn');
  playerNameInput.focus();

  function setChoice(sex) {
    selectedSex = sex;
    choiceMale.classList.toggle('active', sex === 'male');
    choiceFemale.classList.toggle('active', sex === 'female');
  }

  choiceMale.addEventListener('click', () => setChoice('male'));
  choiceFemale.addEventListener('click', () => setChoice('female'));
  function setClassChoice(classKey) {
    selectedClass = classKey;
    if (classKnight) classKnight.classList.toggle('active', classKey === 'knight');
    if (classPaladin) classPaladin.classList.toggle('active', classKey === 'paladin');
    if (classSorcerer) classSorcerer.classList.toggle('active', classKey === 'sorcerer');
    if (classDruid) classDruid.classList.toggle('active', classKey === 'druid');
  }
  if (classKnight) classKnight.addEventListener('click', () => setClassChoice('knight'));
  if (classPaladin) classPaladin.addEventListener('click', () => setClassChoice('paladin'));
  if (classSorcerer) classSorcerer.addEventListener('click', () => setClassChoice('sorcerer'));
  if (classDruid) classDruid.addEventListener('click', () => setClassChoice('druid'));
  let currentBagCapacity = 0;
  let currentBagItem = null;
  let currentPlayerCapacity = progressionStatsForLevel(1).capacity;
  lastLootRejectReason = '';
  const equippedSlots = {
    armor: null,
    shield: null,
    legs: null,
    boots: null,
    ring: null,
    ammunition: null,
    helmet: null,
    amulet: null,
    hand: null,
  };
  let bagLootItems = [];
  const coinTemplateById = new Map([
    [GOLD_COIN_ID, { id: GOLD_COIN_ID, title: 'Gold Coin', isStackable: true, raw: { article_id: GOLD_COIN_ID, value_sell: 1, value_buy: 1, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [PLATINUM_COIN_ID, { id: PLATINUM_COIN_ID, title: 'Platinum Coin', isStackable: true, raw: { article_id: PLATINUM_COIN_ID, value_sell: 100, value_buy: 100, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
    [CRYSTAL_COIN_ID, { id: CRYSTAL_COIN_ID, title: 'Crystal Coin', isStackable: true, raw: { article_id: CRYSTAL_COIN_ID, value_sell: 10000, value_buy: 10000, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
  ]);
  const slotRules = {
    armor: { id: 'Armor', iconDefault: 'BODY', requireType: 'Armors', footName: 'armor' },
    shield: { id: 'Shield', iconDefault: 'SHLD', requireType: 'Shields', footName: 'shield' },
    legs: { id: 'Legs', iconDefault: 'LEGS', requireType: 'Legs', footName: 'legs' },
    boots: { id: 'Boots', iconDefault: 'FEET', requireType: 'Boots', footName: 'boots' },
    ring: { id: 'Ring', iconDefault: 'RING', requireType: 'Rings', footName: 'ring' },
    ammunition: { id: 'Ammo', iconDefault: 'AMMO', requireType: 'Ammunition', footName: 'ammunition' },
    helmet: { id: 'Helmet', iconDefault: 'HEAD', requireType: 'Helmets', footName: 'helmet' },
    amulet: { id: 'Amulet', iconDefault: 'NECK', requireType: 'Amulets and Necklaces', footName: 'amulet' },
    hand: { id: 'Hand', iconDefault: 'HAND', requireClass: 'Weapons', footName: 'weapon' },
  };
  const armorAutoSlotByType = {
    armors: 'armor',
    helmets: 'helmet',
    boots: 'boots',
    legs: 'legs',
    'amulets and necklaces': 'amulet',
  };
  const itemTooltip = document.getElementById('itemTooltip');
  let lootContextIndex = -1;
  const hideItemTooltip = () => {
    if (!itemTooltip) return;
    itemTooltip.style.display = 'none';
    itemTooltip.textContent = '';
  };

  function setHungryUi(isHungry, secondsLeft = 0) {
    if (!hungryIndicator || !hungryLabel) return;
    if (isHungry) {
      hungryIndicator.classList.remove('sated');
      hungryLabel.textContent = 'Hungry';
      hungryIndicator.title = 'You are hungry.';
    } else {
      hungryIndicator.classList.add('sated');
      hungryLabel.textContent = '';
      hungryIndicator.title = 'Food regeneration active.';
    }
  }
  window.setHungryUi = setHungryUi;
  setHungryUi(true, 0);
  window.addEventListener('blur', hideItemTooltip);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideItemTooltip();
  });
  document.addEventListener('keydown', hideItemTooltip);
  document.addEventListener('click', hideItemTooltip);
  const hideLootContextMenu = () => {
    if (!lootContextMenu) return;
    lootContextMenu.style.display = 'none';
    lootContextIndex = -1;
  };
  const showLootContextMenu = (x, y, index) => {
    if (!lootContextMenu) return;
    lootContextIndex = index;
    lootContextMenu.style.display = 'block';
    lootContextMenu.style.left = `${Math.min(window.innerWidth - 140, Math.max(0, x))}px`;
    lootContextMenu.style.top = `${Math.min(window.innerHeight - 70, Math.max(0, y))}px`;
  };
  document.addEventListener('click', hideLootContextMenu);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideLootContextMenu();
  });
  window.addEventListener('blur', hideLootContextMenu);
  if (discardLootBtn) {
    discardLootBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (lootContextIndex < 0 || lootContextIndex >= bagLootItems.length) {
        hideLootContextMenu();
        return;
      }
      const removed = bagLootItems[lootContextIndex];
      bagLootItems.splice(lootContextIndex, 1);
      hideLootContextMenu();
      renderLootSlots(currentBagCapacity);
      if (removed) {
        const equipmentFoot = document.getElementById('equipmentFoot');
        if (equipmentFoot) equipmentFoot.textContent = `Discarded: ${removed.title}`;
      }
    });
  }
  async function ensureCoinTemplatesLoaded() {
    const ids = [GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID];
    await Promise.all(ids.map(async (id) => {
      try {
        const item = await getItemByArticleId(id);
        if (item) {
          coinTemplateById.set(id, {
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

  function getFoodTimeSeconds(item) {
    const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
    const foodAttr = attrs.find((a) => (a && (a.name || '').toLowerCase() === 'food_time'));
    if (!foodAttr) return 0;
    const n = Number(foodAttr.value);
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }

  function formatItemTooltip(item) {
    if (!item) return '';
    const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
    const attrs = Array.isArray(item.attributes) ? item.attributes : [];
    const attrMap = new Map();
    for (const a of attrs) {
      const key = String((a && a.name) || '').toLowerCase().trim();
      if (!key || key === 'is_walkable') continue;
      if (!attrMap.has(key)) attrMap.set(key, []);
      attrMap.get(key).push(a.value);
    }
    const attrValue = (key) => {
      const values = attrMap.get(String(key).toLowerCase());
      return values && values.length > 0 ? String(values[0]) : null;
    };
    const isTwoHanded = String(attrValue('hands') || '').toLowerCase() === 'two';
    const lines = [];
    lines.push(`${item.title || raw.title || 'Unknown Item'}`);
    lines.push(`────────────────────`);
    const cls = item.item_class || raw.item_class;
    const type = item.item_type || raw.item_type;
    if (cls || type) lines.push(`${cls || 'Item'}${type ? ` • ${type}` : ''}`);
    if (item.count && item.count > 1) lines.push(`Amount: x${item.count}`);
    lines.push('');
    const combatBits = [];
    if (Number(item.attack_value || 0) > 0) combatBits.push(`ATK ${item.attack_value}`);
    if (Number(item.shielding_value || 0) > 0) combatBits.push(`SHD ${item.shielding_value}`);
    if (Number(item.armor_value || 0) > 0) combatBits.push(`ARM ${item.armor_value}`);
    if (Number(item.range_value || 0) > 1) combatBits.push(`RNG ${item.range_value}`);
    if (isTwoHanded) combatBits.push('Two-handed');
    if (combatBits.length > 0) {
      lines.push('Combat');
      lines.push(`- ${combatBits.join(' | ')}`);
      lines.push('');
    }
    lines.push('Economy');
    if (raw.weight != null) lines.push(`- Weight: ${raw.weight}`);
    const sellRaw = Number(raw.value_sell || 0);
    const buyRaw = Number(raw.value_buy || 0);
    const effectiveSell = sellRaw > 0 ? sellRaw : Math.max(0, buyRaw);
    if (effectiveSell > 0) lines.push(`- Sell: ${effectiveSell} gp`);
    const keyAttrs = ['speed', 'healthgain', 'managain', 'duration', 'charges', 'capacity'];
    for (const k of keyAttrs) {
      const v = attrValue(k);
      if (v != null) lines.push(`- ${k}: ${v}`);
    }
    if (item.id != null) {
      lines.push('');
      lines.push(`ID: ${item.id}`);
    }
    return lines.join('\n');
  }

  function bindTooltip(el, item) {
    if (!el || !itemTooltip || !item) return;
    const text = formatItemTooltip(item);
    if (!text) return;
    const show = (ev) => {
      itemTooltip.textContent = text;
      itemTooltip.style.display = 'block';
      itemTooltip.style.left = `${Math.min(window.innerWidth - 440, (ev.clientX || 0) + 14)}px`;
      itemTooltip.style.top = `${Math.min(window.innerHeight - 240, (ev.clientY || 0) + 14)}px`;
    };
    const move = (ev) => {
      itemTooltip.style.left = `${Math.min(window.innerWidth - 440, (ev.clientX || 0) + 14)}px`;
      itemTooltip.style.top = `${Math.min(window.innerHeight - 240, (ev.clientY || 0) + 14)}px`;
    };
    const hide = () => {
      hideItemTooltip();
    };
    el.addEventListener('mouseenter', show);
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', hide);
  }

  function setEquippedSlotVisual(slotKey, item, equipmentFootText = null) {
    const rule = slotRules[slotKey];
    if (!rule) return false;
    const slotImg = document.getElementById(`slot${rule.id}Img`);
    const slotIcon = document.getElementById(`slot${rule.id}Icon`);
    const slotLabel = document.getElementById(`slot${rule.id}Label`);
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
    equippedSlots[slotKey] = item;
    if (item.image) {
      slotImg.src = `./data/images/${item.image}`;
      slotImg.style.display = 'block';
      slotIcon.textContent = '';
    } else {
      slotImg.style.display = 'none';
      slotIcon.textContent = rule.iconDefault;
    }
    const qty = Math.max(1, Number(item.count || 1));
    slotLabel.textContent = qty > 1 ? `${item.title} x${qty}` : (item.title || 'Equipped');
    const slotRoot = document.getElementById(`slot${rule.id}`);
    bindTooltip(slotRoot, item);
    equipmentFoot.textContent = equipmentFootText || `Equipped ${rule.footName}: ${item.title}`;
    return true;
  }
  // Backward-compatible alias for accidental casing typos in runtime/cached code paths.
  const setEquippedslotVisual = setEquippedSlotVisual;

  function canEquipItemInSlot(slotKey, item) {
    const rule = slotRules[slotKey];
    if (!rule || !item) return false;
    const matchesType = !rule.requireType || (item.item_type || '').toLowerCase() === rule.requireType.toLowerCase();
    const matchesClass = !rule.requireClass || (item.item_class || '').toLowerCase() === rule.requireClass.toLowerCase();
    if (slotKey === 'hand' && String(item.item_type || '').toLowerCase() === 'ammunition') return false;
    return matchesType && matchesClass;
  }

  function resolveEquipSlotForItem(item) {
    if (!item) return null;
    const preferredOrder = ['hand', 'ammunition', 'armor', 'shield', 'legs', 'boots', 'ring', 'helmet', 'amulet'];
    for (const key of preferredOrder) {
      if (canEquipItemInSlot(key, item)) return key;
    }
    return null;
  }

  function clearEquippedSlotVisual(slotKey, footText = null) {
    const rule = slotRules[slotKey];
    if (!rule) return false;
    const slotRoot = document.getElementById(`slot${rule.id}`);
    const slotImg = document.getElementById(`slot${rule.id}Img`);
    const slotIcon = document.getElementById(`slot${rule.id}Icon`);
    const slotLabel = document.getElementById(`slot${rule.id}Label`);
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!slotRoot || !slotImg || !slotIcon || !slotLabel || !equipmentFoot) return false;
    equippedSlots[slotKey] = null;
    slotImg.style.display = 'none';
    slotIcon.textContent = rule.iconDefault;
    slotLabel.textContent = 'Empty';
    slotRoot.title = '';
    if (footText) equipmentFoot.textContent = footText;
    return true;
  }

  function tryAutoEquipArmorUpgrade(item) {
    const slotKey = armorAutoSlotByType[(item.item_type || '').toLowerCase()];
    if (!slotKey) return false;
    const nextArmor = Number(item.armor_value || 0);
    if (!Number.isFinite(nextArmor) || nextArmor <= 0) return false;
    const equippedArmor = Number((equippedSlots[slotKey] && equippedSlots[slotKey].armor_value) || 0);
    if (nextArmor <= equippedArmor) return false;
    return setEquippedSlotVisual(
      slotKey,
      item,
      `Auto-equipped ${item.title} (${nextArmor}) > current (${equippedArmor}).`
    );
  }

  function tryAutoEquipShieldUpgrade(item) {
    if ((item.item_type || '').toLowerCase() !== 'shields') return false;
    const readDefenseAttr = (it) => {
      const attrs = Array.isArray(it && it.attributes) ? it.attributes : [];
      const row = attrs.find((a) => (
        a
        && String(a.name || '').toLowerCase() === 'defense'
      ));
      const n = Number(row && row.value);
      return Number.isFinite(n) ? n : 0;
    };
    const hand = equippedSlots.hand;
    const handAttrs = Array.isArray(hand && hand.attributes) ? hand.attributes : [];
    const isTwoHandedEquipped = handAttrs.some((a) => (
      a
      && String(a.name || '').toLowerCase() === 'hands'
      && String(a.value || '').toLowerCase() === 'two'
    ));
    // Requirement: only auto-equip shield when NOT using a two-handed weapon.
    if (isTwoHandedEquipped) return false;
    const nextDefense = readDefenseAttr(item);
    if (!Number.isFinite(nextDefense) || nextDefense <= 0) return false;
    const equippedDefense = readDefenseAttr(equippedSlots.shield);
    // Requirement: only if incoming shield has higher defense than current shield.
    if (nextDefense <= equippedDefense) return false;
    return setEquippedSlotVisual(
      'shield',
      item,
      `Auto-equipped ${item.title} (def ${nextDefense}) > current (${equippedDefense}).`
    );
  }

  function tryAutoEquipWeaponUpgrade(item) {
    if (String(item.item_type || '').toLowerCase() === 'ammunition') return false;
    if ((item.item_class || '').toLowerCase() !== 'weapons') return false;
    if (equippedSlots.hand) return false;
    const nextAttack = Number(item.attack_value || 0);
    if (!Number.isFinite(nextAttack) || nextAttack <= 0) return false;
    const equippedAttack = Number((equippedSlots.hand && equippedSlots.hand.attack_value) || 0);
    if (nextAttack <= equippedAttack) return false;
    return setEquippedSlotVisual(
      'hand',
      item,
      `Auto-equipped ${item.title} (attack ${nextAttack}) > current (${equippedAttack}).`
    );
  }

  function renderLootSlots(slotCount) {
    const lootGrid = document.getElementById('lootGrid');
    const lootFoot = document.getElementById('lootFoot');
    if (!lootGrid || !lootFoot) return;
    hideItemTooltip();
    hideLootContextMenu();
    lootGrid.innerHTML = '';
    const count = Math.max(0, Math.floor(Number(slotCount) || 0));
    for (let i = 1; i <= count; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'loot-slot';
      const lootItem = bagLootItems[i - 1] || null;
      if (lootItem) {
        cell.title = lootItem.title || 'Loot';
        if (lootItem.image) {
          const img = document.createElement('img');
          img.src = `./data/images/${lootItem.image}`;
          img.alt = lootItem.title || 'Loot item';
          cell.appendChild(img);
        } else {
          cell.textContent = '●';
        }
        if ((lootItem.count || 1) > 1) {
          const countTag = document.createElement('div');
          countTag.textContent = `x${lootItem.count}`;
          countTag.style.position = 'absolute';
          countTag.style.right = '3px';
          countTag.style.bottom = '2px';
          countTag.style.fontSize = '10px';
          countTag.style.color = '#e2e8f0';
          countTag.style.textShadow = '0 1px 1px rgba(0,0,0,0.8)';
          cell.appendChild(countTag);
        }
        bindTooltip(cell, lootItem);
        cell.style.cursor = 'pointer';
        cell.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const idx = i - 1;
          const current = bagLootItems[idx];
          if (!current) return;
          const sell = Number((current.raw && current.raw.value_sell) || 0);
          const buy = Number((current.raw && current.raw.value_buy) || 0);
          const unitPrice = sell > 0 ? sell : buy;
          const amount = Math.max(1, Number(current.count || 1));
          const totalGold = Math.max(0, Math.floor(unitPrice * amount));
          bagLootItems.splice(idx, 1);
          addCoinsToInventory(totalGold);
          renderLootSlots(currentBagCapacity);
          if (typeof onPanelLog === 'function') {
            onPanelLog(`Sold ${current.title} for ${totalGold} gold.`);
          }
        });
        cell.addEventListener('mousedown', (ev) => {
          if (ev.button !== 0) return; // left click only
          const idx = i - 1;
          const current = bagLootItems[idx];
          if (!current) return;

          if ((current.item_type || '').toLowerCase() === 'food') {
            const foodSeconds = getFoodTimeSeconds(current);
            if (foodSeconds <= 0) return;
            if (typeof onConsumeFood !== 'function') return;
            const consumed = onConsumeFood(foodSeconds, current.title || 'Food');
            if (!consumed) return;
            if (current.count > 1) {
              current.count -= 1;
            } else {
              bagLootItems.splice(idx, 1);
            }
            renderLootSlots(currentBagCapacity);
            return;
          }
          if ((current.item_type || '').toLowerCase() === 'liquids') {
            if (typeof onUseLiquid !== 'function') return;
            const used = onUseLiquid(current);
            if (!used) return;
            if (current.count > 1) {
              current.count -= 1;
            } else {
              bagLootItems.splice(idx, 1);
            }
            renderLootSlots(currentBagCapacity);
            return;
          }

          const slotKey = resolveEquipSlotForItem(current);
          if (!slotKey) return;
          const equipped = equippedSlots[slotKey];
          const equippedCopy = equipped ? { ...equipped } : null;
          const equipOk = setEquippedSlotVisual(slotKey, { ...current }, `Equipped ${slotKey}: ${current.title}`);
          if (!equipOk) return;
          if (equippedCopy) {
            bagLootItems[idx] = equippedCopy;
          } else {
            bagLootItems.splice(idx, 1);
          }
          renderLootSlots(currentBagCapacity);
        });
      } else {
        cell.textContent = String(i);
      }
      cell.style.position = 'relative';
      lootGrid.appendChild(cell);
    }
    lootFoot.textContent = '';
  }

  function applyCapacityForLevel(level) {
    const stats = progressionStatsForLevel(level, selectedClass);
    currentPlayerCapacity = stats.capacity;
    renderLootSlots(currentBagCapacity);
  }
  applyCapacityForLevel(1);
  onPlayerLevelStatsUpdate = (level) => applyCapacityForLevel(level);

  function normalizeCoinStacks() {
    const getCount = (id) => {
      const stack = bagLootItems.find((it) => Number(it.id) === id);
      return stack ? Math.max(1, Number(stack.count || 1)) : 0;
    };
    let gold = getCount(GOLD_COIN_ID);
    let platinum = getCount(PLATINUM_COIN_ID);
    let crystal = getCount(CRYSTAL_COIN_ID);
    platinum += Math.floor(gold / GOLD_PER_PLATINUM);
    gold %= GOLD_PER_PLATINUM;
    crystal += Math.floor(platinum / PLATINUM_PER_CRYSTAL);
    platinum %= PLATINUM_PER_CRYSTAL;
    bagLootItems = bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
    const putCoin = (id, count) => {
      if (count <= 0) return;
      const tpl = coinTemplateById.get(id);
      if (!tpl) return;
      bagLootItems.unshift({
        ...tpl,
        count,
      });
    };
    putCoin(CRYSTAL_COIN_ID, crystal);
    putCoin(PLATINUM_COIN_ID, platinum);
    putCoin(GOLD_COIN_ID, gold);
    window.dispatchEvent(new CustomEvent('coins-changed'));
  }

  function addCoinsToInventory(goldAmount) {
    const amount = Math.max(0, Math.floor(Number(goldAmount) || 0));
    if (amount <= 0) return;
    const goldTpl = coinTemplateById.get(GOLD_COIN_ID);
    if (!goldTpl) return;
    const incoming = {
      ...goldTpl,
      count: amount,
    };
    const stackIdx = bagLootItems.findIndex((it) => Number(it.id) === GOLD_COIN_ID);
    if (stackIdx >= 0) {
      bagLootItems[stackIdx].count = Math.max(1, Number(bagLootItems[stackIdx].count || 1)) + amount;
    } else if (bagLootItems.length < currentBagCapacity) {
      bagLootItems.push(incoming);
    } else {
      // If there is no slot, try to force conversion by replacing lower-value coin stacks if present.
      bagLootItems.push(incoming);
    }
    normalizeCoinStacks();
  }

  function getTotalGoldInInventory() {
    let gold = 0;
    let platinum = 0;
    let crystal = 0;
    for (const it of bagLootItems) {
      const id = Number(it && it.id);
      const count = Math.max(1, Number((it && it.count) || 1));
      if (id === GOLD_COIN_ID) gold += count;
      if (id === PLATINUM_COIN_ID) platinum += count;
      if (id === CRYSTAL_COIN_ID) crystal += count;
    }
    return gold + (platinum * GOLD_PER_PLATINUM) + (crystal * GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
  }

  function setCoinsFromTotalGold(totalGold) {
    let value = Math.max(0, Math.floor(Number(totalGold) || 0));
    const crystal = Math.floor(value / (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL));
    value %= (GOLD_PER_PLATINUM * PLATINUM_PER_CRYSTAL);
    const platinum = Math.floor(value / GOLD_PER_PLATINUM);
    const gold = value % GOLD_PER_PLATINUM;
    bagLootItems = bagLootItems.filter((it) => ![GOLD_COIN_ID, PLATINUM_COIN_ID, CRYSTAL_COIN_ID].includes(Number(it.id)));
    const putCoin = (id, count) => {
      if (count <= 0) return;
      const tpl = coinTemplateById.get(id);
      if (!tpl) return;
      bagLootItems.unshift({
        ...tpl,
        count,
      });
    };
    putCoin(CRYSTAL_COIN_ID, crystal);
    putCoin(PLATINUM_COIN_ID, platinum);
    putCoin(GOLD_COIN_ID, gold);
    window.dispatchEvent(new CustomEvent('coins-changed'));
  }

  function spendGoldFromInventory(goldAmount) {
    const cost = Math.max(0, Math.floor(Number(goldAmount) || 0));
    if (cost <= 0) return true;
    const total = getTotalGoldInInventory();
    if (total < cost) return false;
    setCoinsFromTotalGold(total - cost);
    renderLootSlots(currentBagCapacity);
    return true;
  }

  function addLootItemToBag(itemData, opts = {}) {
    lastLootRejectReason = '';
    const disableAutoEquip = Boolean(opts && opts.disableAutoEquip);
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
      if (currentBagItem) total += itemUnitWeight(currentBagItem);
      for (const eq of Object.values(equippedSlots)) {
        if (!eq) continue;
        total += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
      }
      for (const it of bagLootItems) {
        total += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
      }
      return total;
    };
    const incomingWeight = itemUnitWeight(incoming) * Math.max(1, Number(incoming.count || 1));
    if (totalCarriedWeight() + incomingWeight > currentPlayerCapacity) {
      lastLootRejectReason = 'capacity';
      return false;
    }
    const sameItemIdentity = (a, b) => {
      if (!a || !b) return false;
      if (a.id != null && b.id != null) return Number(a.id) === Number(b.id);
      return String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase();
    };
    if (!disableAutoEquip) {
      const equippedHand = equippedSlots.hand;
      const equippedAmmo = equippedSlots.ammunition;
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
      );
      // If it was equipped, it should not occupy inventory space.
      if (equippedNow) return true;
    }
    if (incoming.isStackable) {
      const stackIdx = bagLootItems.findIndex((it) => (
        Boolean(it && it.isStackable)
        && (
          (incoming.id != null && it.id === incoming.id)
          || ((incoming.id == null || it.id == null) && it.title === incoming.title)
        )
      ));
      if (stackIdx >= 0) {
        bagLootItems[stackIdx].count = Math.max(1, Number(bagLootItems[stackIdx].count || 1)) + incoming.count;
        normalizeCoinStacks();
        renderLootSlots(currentBagCapacity);
        return true;
      }
    }
    if (bagLootItems.length >= currentBagCapacity) {
      lastLootRejectReason = 'slots';
      return false;
    }
    bagLootItems.push(incoming);
    normalizeCoinStacks();
    renderLootSlots(currentBagCapacity);
    return true;
  }

  async function equipBagByArticleId(articleId) {
    const bagImg = document.getElementById('slotBagImg');
    const bagIcon = document.getElementById('slotBagIcon');
    const bagLabel = document.getElementById('slotBagLabel');
    const bagRoot = document.getElementById('slotBag');
    const equipmentFoot = document.getElementById('equipmentFoot');
    if (!bagImg || !bagIcon || !bagLabel || !equipmentFoot || !bagRoot) return;
    try {
      const bag = await getItemByArticleId(articleId);
      if (!bag) {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
        bagLabel.textContent = 'Empty';
        equipmentFoot.textContent = 'No item equipped';
        currentBagCapacity = 0;
        currentBagItem = null;
        bagLootItems = [];
        renderLootSlots(0);
        return;
      }
      if ((bag.item_type || '').toLowerCase() !== 'containers') {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
        bagLabel.textContent = 'Invalid';
        equipmentFoot.textContent = 'BAG slot only supports Containers';
        currentBagCapacity = 0;
        currentBagItem = null;
        bagLootItems = [];
        renderLootSlots(0);
        return;
      }
      if (bag.image) {
        bagImg.src = `./data/images/${bag.image}`;
        bagImg.style.display = 'block';
        bagIcon.textContent = '';
      } else {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
      }
      const nextCapacity = Math.max(0, Math.floor(Number(bag.weight) || 0));
      const droppedCount = Math.max(0, bagLootItems.length - nextCapacity);
      if (droppedCount > 0) bagLootItems = bagLootItems.slice(0, nextCapacity);
      currentBagCapacity = nextCapacity;
      currentBagItem = bag;
      bagLabel.textContent = bag.title;
      bindTooltip(bagRoot, bag);
      equipmentFoot.textContent = droppedCount > 0
        ? `Equipped: ${bag.title} | Dropped: ${droppedCount}`
        : `Equipped: ${bag.title}`;
      renderLootSlots(currentBagCapacity);
    } catch (_err) {
      bagImg.style.display = 'none';
      bagIcon.textContent = 'BAG';
      bagLabel.textContent = 'Empty';
      equipmentFoot.textContent = 'No item equipped';
      currentBagCapacity = 0;
      currentBagItem = null;
      bagLootItems = [];
      renderLootSlots(0);
    }
  }

  async function equipItemInSlot(slotKey, articleId) {
    const rule = slotRules[slotKey];
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
        equippedSlots[slotKey] = null;
        return false;
      }
      const matchesType = !rule.requireType || (item.item_type || '').toLowerCase() === rule.requireType.toLowerCase();
      const matchesClass = !rule.requireClass || (item.item_class || '').toLowerCase() === rule.requireClass.toLowerCase();
      if (slotKey === 'hand' && String(item.item_type || '').toLowerCase() === 'ammunition') {
        equipmentFoot.textContent = `Cannot equip ${item.title} in HAND slot (use AMMO slot).`;
        return false;
      }
      if (!matchesType || !matchesClass) {
        const req = rule.requireType || `item_class ${rule.requireClass}`;
        equipmentFoot.textContent = `Cannot equip ${item.title} in ${slotKey.toUpperCase()} slot (requires ${req}).`;
        return false;
      }
      return setEquippedSlotVisual(slotKey, item, `Equipped ${rule.footName}: ${item.title}`);
    } catch (_err) {
      return false;
    }
  }

  // Debug helpers for runtime bag swaps while loot mechanics evolve.
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
      if (currentBagItem) carriedWeight += itemUnitWeight(currentBagItem);
      for (const eq of Object.values(equippedSlots)) {
        if (!eq) continue;
        carriedWeight += itemUnitWeight(eq) * Math.max(1, Number(eq.count || 1));
      }
      for (const it of bagLootItems) {
        carriedWeight += itemUnitWeight(it) * Math.max(1, Number(it.count || 1));
      }
      return {
        bag: currentBagItem,
        equipped: { ...equippedSlots },
        bagSlots: currentBagCapacity,
        capacity: currentPlayerCapacity,
        carriedWeight,
        used: bagLootItems.length,
        items: [...bagLootItems],
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
      renderLootSlots(currentBagCapacity);
    },
  };

  // Left click equipped slot to unequip into loot bag when there is space/capacity.
  for (const slotKey of Object.keys(slotRules)) {
    const rule = slotRules[slotKey];
    const slotRoot = document.getElementById(`slot${rule.id}`);
    if (!slotRoot) continue;
    slotRoot.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      const equipped = equippedSlots[slotKey];
      if (!equipped) return;
      const stored = addLootItemToBag({ ...equipped }, { disableAutoEquip: true });
      if (!stored) return;
      clearEquippedSlotVisual(slotKey);
      if (typeof onPanelLog === 'function') onPanelLog(`Unequipped ${equipped.title} to loot bag.`);
      renderLootSlots(currentBagCapacity);
    });
  }

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const playerName = (playerNameInput.value || '').trim() || 'Adventurer';
    currentPlayerCapacity = progressionStatsForLevel(1, selectedClass).capacity;
    playerConfig = { name: playerName, sex: selectedSex, classKey: selectedClass };
    await Promise.all([
      loadProgressionDatabase(),
      equipBagByArticleId(START_BAG_ARTICLE_ID),
      (async () => { creatureDropTable = await getCreatureDropTable(); })(),
      ensureCoinTemplatesLoaded(),
      (async () => { spellsCatalog = await getSpellsCatalogWithPrices(); })(),
    ]);
    // Testing seed: start each run with 200 gp.
    addCoinsToInventory(200);
    document.getElementById('startOverlay').style.display = 'none';
    startGame(playerConfig);
  });

  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!startBtn.disabled) startBtn.click();
    }
  });
}

function isWalkableTile(gx, gy) {
  return gx >= 0 && gx < MAP_W && gy >= 0 && gy < MAP_H;
}

function startGame(configPlayer) {
  if (game) return;

  const tileSize = 40;
  const mapWidth = MAP_W * tileSize;
  const mapHeight = MAP_H * tileSize;
  const width = Math.min(window.innerWidth, mapWidth);
  const desiredHeight = mapHeight + UI_BOTTOM_SPACE;
  const height = Math.min(window.innerHeight, desiredHeight);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser',
    backgroundColor: '#0a1220',
    width,
    height,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: {
      preload() {
        for (let i = 0; i < 4; i += 1) {
          this.load.image(frameTextureName('male', i), `./data/images/outfit_frames/male_${i}.png`);
          this.load.image(frameTextureName('female', i), `./data/images/outfit_frames/female_${i}.png`);
        }
        this.load.image(deathTextureName('male'), './data/images/other/you_are_death_male.jpg');
        this.load.image(deathTextureName('female'), './data/images/other/you_are_death_female.jpg');
        const unique = new Map();
        for (const tier of typeProgressionGroups) {
          for (const c of tier.creatures) {
            if (!unique.has(c.id)) unique.set(c.id, c);
          }
        }
        for (const c of unique.values()) {
          this.load.image(creatureKey(c), `./data/images/${c.image}`);
        }
      },
      create() {
        const mapTiles = [];
        for (let y = 0; y < MAP_H; y += 1) {
          mapTiles[y] = [];
          for (let x = 0; x < MAP_W; x += 1) {
            const rect = this.add.rectangle(
              x * tileSize + tileSize / 2,
              y * tileSize + tileSize / 2,
              tileSize - 1,
              tileSize - 1,
              0x1a2534
            );
            mapTiles[y][x] = rect;
          }
        }

        const player = this.add.sprite(tileSize * 1.5, tileSize * 1.5, frameTextureName(configPlayer.sex, 0));
        // Centrado visual y tamano menor a 1 tile para evitar solapes entre casillas vecinas.
        player.setOrigin(0.5, 0.5);
        player.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
        const deathCaption = this.add.text(player.x, player.y + tileSize * 0.72, 'You are dead.', {
          color: '#ffffff',
          fontSize: '12px',
          fontStyle: 'bold',
        });
        deathCaption.setOrigin(0.5, 0.5);
        deathCaption.setVisible(false);
        const basePlayerScaleX = player.scaleX;
        const basePlayerScaleY = player.scaleY;
        const makeHealthBar = (color = 0x22c55e) => {
          const bg = this.add.rectangle(0, 0, tileSize * 0.9, 5, 0x111111, 0.95);
          const fill = this.add.rectangle(0, 0, tileSize * 0.86, 3, color, 1);
          bg.setStrokeStyle(1, 0x000000, 0.8);
          // Anclaje a la izquierda para evitar drift visual al reducir HP.
          bg.setOrigin(0.5, 0.5);
          fill.setOrigin(0, 0.5);
          return { bg, fill, width: tileSize * 0.86 };
        };
        const makeNameLabel = (text, color = '#e5e7eb') => {
          const label = this.add.text(0, 0, text, {
            color,
            fontSize: '11px',
            fontStyle: 'bold',
          });
          label.setOrigin(0.5, 0.5);
          return label;
        };
        const nameColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return '#22c55e'; // verde
          if (ratio > 0.33) return '#facc15'; // amarillo
          return '#ef4444'; // rojo
        };
        const barColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return 0x22c55e; // verde
          if (ratio > 0.33) return 0xfacc15; // amarillo
          return 0xef4444; // rojo
        };
        const placeHealthBar = (bar, x, y) => {
          bar.bg.setPosition(x, y);
          bar.fill.setPosition(x - bar.width / 2, y);
        };
        const setHealthBarRatio = (bar, ratio) => {
          const clamped = Phaser.Math.Clamp(ratio, 0, 1);
          bar.fill.width = Math.max(0, bar.width * clamped);
        };
        const playerBar = makeHealthBar(0x22c55e);
        const playerManaBar = makeHealthBar(0x3b82f6);
        const playerNameTag = makeNameLabel(configPlayer.name, '#e5e7eb');

        const nameLabel = this.add.text(12, 10, `${configPlayer.name} | Player Lv 1`, {
          color: '#e5e7eb',
          fontSize: '16px',
        });
        nameLabel.setScrollFactor(0);

        const combatHud = this.add.text(this.scale.width - 12, 10, '', {
          color: '#fca5a5',
          fontSize: '13px',
        });
        combatHud.setOrigin(1, 0);
        combatHud.setScrollFactor(0);
        const levelHud = this.add.text(this.scale.width / 2, 10, '', {
          color: '#93c5fd',
          fontSize: '13px',
        });
        levelHud.setOrigin(0.5, 0);
        levelHud.setScrollFactor(0);

        const uiBaseY = mapHeight - (tileSize * UI_OVERLAP_ROWS);
        const logPanel = this.add.rectangle(
          this.scale.width / 2,
          uiBaseY + 52,
          this.scale.width - 16,
          58,
          0x0b1220,
          0.78
        );
        logPanel.setStrokeStyle(1, 0x2b3444, 0.8);
        logPanel.setScrollFactor(0);
        const levelProgressBg = this.add.rectangle(
          this.scale.width / 2,
          uiBaseY + 21,
          this.scale.width - 16,
          10,
          0x0f172a,
          0.95
        );
        levelProgressBg.setStrokeStyle(1, 0x334155, 1);
        levelProgressBg.setScrollFactor(0);
        const levelProgressFill = this.add.rectangle(
          8,
          uiBaseY + 21,
          this.scale.width - 18,
          8,
          0xeab308,
          1
        );
        levelProgressFill.setOrigin(0, 0.5);
        levelProgressFill.setScrollFactor(0);
        const levelProgressText = this.add.text(this.scale.width / 2, uiBaseY + 21, '', {
          color: '#f8fafc',
          fontSize: '11px',
          fontStyle: 'bold',
        });
        levelProgressText.setOrigin(0.5, 0.5);
        levelProgressText.setStroke('#0b1220', 2);
        levelProgressText.setScrollFactor(0);
        const LOG_COLORS = {
          DEFAULT: '#ffffff',
          HIT: '#e2e8f0',
          CRIT: '#facc15',
          SPELL: '#7dd3fc',
        };
        const combatLogRows = [0, 1, 2].map((idx) => {
          const row = this.add.text(14, uiBaseY + 32 + idx * 14, '', {
            color: LOG_COLORS.DEFAULT,
            fontSize: '12px',
            wordWrap: { width: this.scale.width - 28 },
          });
          row.setScrollFactor(0);
          return row;
        });
        const combatLogLines = [];
        const addCombatLog = (msg, color = LOG_COLORS.DEFAULT) => {
          combatLogLines.push({ msg, color });
          if (combatLogLines.length > 3) combatLogLines.shift();
          for (let i = 0; i < combatLogRows.length; i += 1) {
            const line = combatLogLines[i];
            combatLogRows[i].setText(line ? String(line.msg) : '');
            combatLogRows[i].setColor(line ? line.color : LOG_COLORS.DEFAULT);
          }
        };
        onPanelLog = addCombatLog;
        addCombatLog('Combat ready.');

        const stairRect = this.add.rectangle(
          0,
          0,
          tileSize - 6,
          tileSize - 6,
          0x7c5c16
        );
        stairRect.setStrokeStyle(2, 0xfacc15, 1);
        const stairText = this.add.text(0, 0, '>', {
          color: '#fde68a',
          fontSize: '18px',
          fontStyle: 'bold',
        });
        stairText.setOrigin(0.5, 0.5);
        stairRect.setVisible(false);
        stairText.setVisible(false);

        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.startFollow(player, true, 0.15, 0.15);

        const cursors = this.input.keyboard.createCursorKeys();
        const keys = this.input.keyboard.addKeys('W,A,S,D');
        const ctrlKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
        const spellHotkeys = this.input.keyboard.addKeys({
          one: Phaser.Input.Keyboard.KeyCodes.ONE,
          two: Phaser.Input.Keyboard.KeyCodes.TWO,
          three: Phaser.Input.Keyboard.KeyCodes.THREE,
          four: Phaser.Input.Keyboard.KeyCodes.FOUR,
          five: Phaser.Input.Keyboard.KeyCodes.FIVE,
          six: Phaser.Input.Keyboard.KeyCodes.SIX,
          seven: Phaser.Input.Keyboard.KeyCodes.SEVEN,
          eight: Phaser.Input.Keyboard.KeyCodes.EIGHT,
          nine: Phaser.Input.Keyboard.KeyCodes.NINE,
          num1: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
          num2: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
          num3: Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
          num4: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
          num5: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
          num6: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
          num7: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN,
          num8: Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
          num9: Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE,
        });
        const playerClassKey = String(configPlayer.classKey || 'knight').toLowerCase();
        const lvl1Stats = progressionStatsForLevel(1, playerClassKey);
        let gridX = START_TILE.gx;
        let gridY = START_TILE.gy;
        let playerFacingFrame = 0; // 0 S, 1 E, 2 N, 3 W
        let moving = false;
        let playerMoveDurationMs = 190;
        let playerActionDelayMs = 320;
        let nextPlayerActionAt = 0;
        let playerHp = lvl1Stats.maxHp;
        let playerMaxHp = lvl1Stats.maxHp;
        let playerMana = lvl1Stats.maxMana;
        let playerMaxMana = lvl1Stats.maxMana;
        let hungerSecondsLeft = 0;
        let isHungry = true;
        const playerBaseDamage = 12;
        let playerLevel = 1;
        let playerXp = 0;
        const learnedSpellIds = new Set();
        const learnedSpellSlots = Array.from({ length: 9 }, () => null);
        const spellCooldownUntil = new Map();
        let gameOver = false;
        let playerDead = false;
        let currentLevel = 1;
        let currentLevelGroup = null;
        const recentGroupIndices = [];
        const runStartBias = Phaser.Math.Between(0, 8);
        const runSpreadBias = Phaser.Math.Between(0, 4);
        const runVariantBias = Phaser.Math.Between(0, 1000000);
        let earlyShufflePool = [];
        let earlyShuffleCursor = 0;
        let currentMap = [];
        let currentFloors = [];
        let currentStairsTile = { gx: MAP_W - 2, gy: MAP_H - 2 };
        let creaturesTargetCount = 0;
        const centerX = (gx) => gx * tileSize + tileSize / 2;
        const centerY = (gy) => gy * tileSize + tileSize / 2;
        const xpToNextLevel = (level) => 50 + (level - 1) * 40;
        const updatePlayerTimingsByLevel = () => {
          // Progresion gradual por nivel del personaje (arranque mas lento).
          playerMoveDurationMs = Phaser.Math.Clamp(190 - (playerLevel - 1) * 2, 130, 190);
          playerActionDelayMs = Phaser.Math.Clamp(320 - (playerLevel - 1) * 5, 220, 320);
        };
        const showLevelUpText = () => {
          const txt = this.add.text(this.scale.width / 2, this.scale.height / 2, 'LEVEL UP!', {
            color: '#facc15',
            fontSize: '56px',
            fontStyle: 'bold',
            fontFamily: 'Arial Black, Arial, sans-serif',
          });
          txt.setOrigin(0.5, 0.5);
          txt.setStroke('#111827', 8);
          txt.setScrollFactor(0);
          this.tweens.add({
            targets: txt,
            y: txt.y - 24,
            alpha: 0,
            scaleX: 1.15,
            scaleY: 1.15,
            duration: 900,
            ease: 'Sine.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const grantPlayerXp = (amount) => {
          playerXp += Math.max(0, Number(amount || 0));
          let leveled = false;
          while (playerXp >= xpToNextLevel(playerLevel)) {
            playerXp -= xpToNextLevel(playerLevel);
            playerLevel += 1;
            const nextStats = progressionStatsForLevel(playerLevel, playerClassKey);
            playerMaxHp = nextStats.maxHp;
            playerMaxMana = nextStats.maxMana;
            if (typeof onPlayerLevelStatsUpdate === 'function') onPlayerLevelStatsUpdate(playerLevel);
            leveled = true;
          }
          if (leveled) {
            playerHp = playerMaxHp;
            playerMana = playerMaxMana;
            updatePlayerTimingsByLevel();
            addCombatLog(`You reached level ${playerLevel}.`);
            showLevelUpText();
            updatePlayerBar();
          }
        };
        const effectiveXpFromCreature = (creature) => {
          const xp = Number((creature && creature.experience) || 0);
          if (Number.isFinite(xp) && xp > 0) return Math.floor(xp);
          // Fallback: monsters with 0 XP grant scaling XP based on player level.
          return Math.max(1, Math.floor((5 + (playerLevel * 3)) * 2));
        };
        const fallbackGoldFromLevel = () => {
          // Baseline gold reward when a monster drops no items.
          return Math.max(1, Math.floor(2 + (playerLevel * 2)));
        };

        const creatures = [];
        const groundLootByTile = new Map();

        const isWallTile = (gx, gy) => {
          if (!isWalkableTile(gx, gy)) return true;
          return currentMap[gy][gx] === '#';
        };
        const isWalkable = (gx, gy) => !isWallTile(gx, gy);
        const isAdjacent = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
        const aliveCreatures = () => creatures.filter((c) => c.alive);
        const creatureAt = (gx, gy) => aliveCreatures().find((c) => c.gx === gx && c.gy === gy) || null;
        const groundTileKey = (gx, gy) => `${gx},${gy}`;
        const groundLootTextureKey = (imagePath) => `ground_loot_${String(imagePath || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;
        const refreshGroundLootMarker = (entry) => {
          if (!entry) return;
          const count = entry.items.length;
          const firstItem = count > 0 ? entry.items[0] : null;
          const markerX = centerX(entry.gx);
          const markerY = centerY(entry.gy) + tileSize * 0.18;
          const ensureTextMarker = (txt = '📦') => {
            if (!entry.marker || entry.marker.type !== 'Text') {
              if (entry.marker) entry.marker.destroy();
              entry.marker = this.add.text(markerX, markerY, txt, {
                color: '#facc15',
                fontSize: '14px',
                fontStyle: 'bold',
              });
              entry.marker.setOrigin(0.5, 0.5);
            } else {
              entry.marker.setText(txt);
            }
          };
          const ensureImageMarker = (textureKey) => {
            const isImageMarker = entry.marker && entry.marker.type !== 'Text' && typeof entry.marker.setTexture === 'function';
            if (!isImageMarker) {
              if (entry.marker) entry.marker.destroy();
              entry.marker = this.add.image(markerX, markerY, textureKey);
              entry.marker.setOrigin(0.5, 0.5);
              entry.marker.setDisplaySize(tileSize * 0.42, tileSize * 0.42);
            } else {
              entry.marker.setTexture(textureKey);
              entry.marker.setDisplaySize(tileSize * 0.42, tileSize * 0.42);
            }
          };
          if (count <= 0) {
            if (entry.marker) entry.marker.destroy();
            if (entry.markerCount) entry.markerCount.destroy();
            groundLootByTile.delete(groundTileKey(entry.gx, entry.gy));
            return;
          }
          if (firstItem && firstItem.image) {
            const textureKey = groundLootTextureKey(firstItem.image);
            if (this.textures.exists(textureKey)) {
              ensureImageMarker(textureKey);
            } else {
              ensureTextMarker('📦');
              if (entry.loadingTextureKey !== textureKey) {
                entry.loadingTextureKey = textureKey;
                this.load.image(textureKey, `./data/images/${firstItem.image}`);
                this.load.once(`filecomplete-image-${textureKey}`, () => {
                  entry.loadingTextureKey = null;
                  refreshGroundLootMarker(entry);
                });
                if (!this.load.isLoading()) this.load.start();
              }
            }
          } else {
            ensureTextMarker('📦');
          }
          if (!entry.markerCount) {
            entry.markerCount = this.add.text(markerX + tileSize * 0.2, markerY + tileSize * 0.08, '', {
              color: '#f8fafc',
              fontSize: '10px',
              fontStyle: 'bold',
            });
            entry.markerCount.setOrigin(1, 1);
          }
          entry.markerCount.setPosition(markerX + tileSize * 0.2, markerY + tileSize * 0.08);
          entry.markerCount.setText(count > 1 ? String(count) : '');
        };
        const dropItemOnGround = (gx, gy, item) => {
          const key = groundTileKey(gx, gy);
          if (!groundLootByTile.has(key)) {
            groundLootByTile.set(key, { gx, gy, items: [], marker: null, markerCount: null, loadingTextureKey: null });
          }
          const entry = groundLootByTile.get(key);
          const incoming = { ...item };
          if (incoming.isStackable) {
            const stackIdx = entry.items.findIndex((it) => (
              Boolean(it && it.isStackable)
              && (
                (incoming.id != null && it.id != null && Number(incoming.id) === Number(it.id))
                || String(incoming.title || '').toLowerCase() === String(it.title || '').toLowerCase()
              )
            ));
            if (stackIdx >= 0) {
              entry.items[stackIdx].count = Math.max(1, Number(entry.items[stackIdx].count || 1)) + Math.max(1, Number(incoming.count || 1));
              refreshGroundLootMarker(entry);
              return;
            }
          }
          entry.items.push(incoming);
          refreshGroundLootMarker(entry);
        };
        const pickupGroundLootAtPlayer = () => {
          const key = groundTileKey(gridX, gridY);
          const entry = groundLootByTile.get(key);
          if (!entry || entry.items.length === 0) return;
          const kept = [];
          let picked = 0;
          for (const item of entry.items) {
            const stored = window.debugInventory && typeof window.debugInventory.addLoot === 'function'
              ? window.debugInventory.addLoot(item)
              : false;
            if (stored) {
              picked += 1;
              addCombatLog(`Picked from ground: ${item.title}.`);
            } else {
              kept.push(item);
            }
          }
          entry.items = kept;
          refreshGroundLootMarker(entry);
          if (picked > 0) updateHud();
        };
        const isOccupiedByActor = (gx, gy) => {
          if (gx === gridX && gy === gridY) return true;
          return Boolean(creatureAt(gx, gy));
        };
        const orientCreatureSprite = (creature, dx, dy) => {
          // Tabla cerrada N/S/O/E.
          creature.sprite.setAngle(0);
          creature.sprite.setFlipX(false);
          creature.sprite.setFlipY(false);

          if (dx < 0) {
            // OESTE
            creature.sprite.setAngle(90);
            return;
          }
          if (dx > 0) {
            // ESTE (calibrado)
            creature.sprite.setAngle(-90);
            creature.sprite.setFlipX(true);
            return;
          }
          if (dy < 0) {
            // NORTE
            creature.sprite.setFlipY(true);
            return;
          }
          // SUR
          return;
        };
        const inAggroRange = (creature) => Math.abs(gridX - creature.gx) <= 4 && Math.abs(gridY - creature.gy) <= 4;
        const hasAggro = (creature) => creature.aggroLocked || inAggroRange(creature);
        const actionDelayFromSpeed = (speed) => {
          const s = Math.max(1, Number(speed || 100));
          // mas speed -> menos delay entre acciones
          return Phaser.Math.Clamp(950 - s * 2, 120, 900);
        };
        const updatePlayerBar = () => {
          placeHealthBar(playerBar, player.x, player.y - tileSize * 0.62);
          placeHealthBar(playerManaBar, player.x, player.y - tileSize * 0.48);
          playerNameTag.setPosition(player.x, player.y - tileSize * 0.8);
          const ratio = playerHp / playerMaxHp;
          const manaRatio = playerMaxMana > 0 ? (playerMana / playerMaxMana) : 0;
          setHealthBarRatio(playerBar, ratio);
          setHealthBarRatio(playerManaBar, manaRatio);
          if (playerHp <= 0) {
            playerNameTag.setColor('#000000');
            playerBar.fill.setFillStyle(0x000000, 1);
            playerManaBar.fill.setFillStyle(0x000000, 1);
          } else {
            playerNameTag.setColor(nameColorByHpRatio(ratio));
            playerBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
            playerManaBar.fill.setFillStyle(0x3b82f6, 1);
          }
        };
        const setHungryState = (hungry, secondsLeft = 0) => {
          isHungry = hungry;
          if (typeof window.setHungryUi === 'function') window.setHungryUi(hungry, secondsLeft);
        };
        const showEatEffect = (label) => {
          if (playerDead || gameOver) return;
          player.setTint(0x86efac);
          this.tweens.add({
            targets: player,
            scaleX: basePlayerScaleX * 1.08,
            scaleY: basePlayerScaleY * 1.08,
            yoyo: true,
            duration: 120,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (!playerDead) player.setScale(basePlayerScaleX, basePlayerScaleY);
              player.clearTint();
            },
          });
          for (let i = 0; i < 4; i += 1) {
            const spark = this.add.circle(
              player.x + Phaser.Math.Between(-8, 8),
              player.y - tileSize * 0.55 + Phaser.Math.Between(-6, 6),
              Phaser.Math.Between(2, 4),
              0x86efac,
              0.9
            );
            this.tweens.add({
              targets: spark,
              y: spark.y - Phaser.Math.Between(14, 22),
              alpha: 0,
              duration: 380,
              ease: 'Sine.easeOut',
              onComplete: () => spark.destroy(),
            });
          }
          const txt = this.add.text(player.x, player.y - tileSize * 0.95, `EAT ${label || ''}`.trim(), {
            color: '#86efac',
            fontSize: '13px',
            fontStyle: 'bold',
          });
          txt.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: txt,
            y: txt.y - 16,
            alpha: 0,
            duration: 520,
            ease: 'Sine.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const showDrinkEffect = (label, color = '#7dd3fc') => {
          if (playerDead || gameOver) return;
          player.setTintFill(0x60a5fa);
          this.tweens.add({
            targets: player,
            alpha: 0.85,
            yoyo: true,
            duration: 100,
            repeat: 1,
            ease: 'Sine.easeOut',
            onComplete: () => {
              player.setAlpha(1);
              player.clearTint();
            },
          });
          const txt = this.add.text(player.x, player.y - tileSize * 0.95, label, {
            color,
            fontSize: '13px',
            fontStyle: 'bold',
          });
          txt.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: txt,
            y: txt.y - 16,
            alpha: 0,
            duration: 560,
            ease: 'Sine.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const showFullFoodEffect = () => {
          if (playerDead || gameOver) return;
          player.setTint(0xfbbf24);
          this.tweens.add({
            targets: player,
            scaleX: basePlayerScaleX * 1.1,
            scaleY: basePlayerScaleY * 1.1,
            yoyo: true,
            repeat: 1,
            duration: 90,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (!playerDead) player.setScale(basePlayerScaleX, basePlayerScaleY);
              player.clearTint();
            },
          });
          const full = this.add.text(player.x, player.y - tileSize * 0.95, 'FULL', {
            color: '#fbbf24',
            fontSize: '15px',
            fontStyle: 'bold',
          });
          full.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: full,
            y: full.y - 18,
            alpha: 0,
            duration: 620,
            ease: 'Sine.easeOut',
            onComplete: () => full.destroy(),
          });
        };
        setHungryState(true, 0);
        if (typeof onPlayerLevelStatsUpdate === 'function') onPlayerLevelStatsUpdate(playerLevel);
        onConsumeFood = (foodSeconds, itemTitle) => {
          if (!Number.isFinite(foodSeconds) || foodSeconds <= 0 || playerDead || gameOver) return false;
          const nextSatiety = hungerSecondsLeft + Math.floor(foodSeconds);
          if (hungerSecondsLeft >= MAX_FOOD_SECONDS || nextSatiety > MAX_FOOD_SECONDS) {
            addCombatLog('You are too full to eat more.');
            showFullFoodEffect();
            return false;
          }
          hungerSecondsLeft = nextSatiety;
          setHungryState(false, hungerSecondsLeft);
          addCombatLog(`You eat ${itemTitle}.`);
          showEatEffect(itemTitle);
          return true;
        };
        onUseLiquid = (item) => {
          if (!item || playerDead || gameOver) return false;
          const title = String(item.title || '').toLowerCase();
          let hpGain = 0;
          let mpGain = 0;
          // Canonical potion/fluid mapping (simplified).
          if (title.includes('ultimate health potion')) hpGain = 250;
          else if (title.includes('great health potion')) hpGain = 120;
          else if (title.includes('strong health potion')) hpGain = 70;
          else if (title.includes('health potion') || title.includes('lifefluid')) hpGain = 45;
          else if (title.includes('ultimate mana potion')) mpGain = 180;
          else if (title.includes('great mana potion')) mpGain = 90;
          else if (title.includes('strong mana potion')) mpGain = 55;
          else if (title.includes('mana potion') || title.includes('manafluid')) mpGain = 35;
          else if (title.includes('great spirit potion')) {
            hpGain = 85;
            mpGain = 45;
          }
          if (hpGain <= 0 && mpGain <= 0) {
            addCombatLog(`${item.title}: no usable liquid effect.`);
            return false;
          }
          const prevHp = playerHp;
          const prevMp = playerMana;
          playerHp = Math.min(playerMaxHp, playerHp + hpGain);
          playerMana = Math.min(playerMaxMana, playerMana + mpGain);
          const healed = playerHp - prevHp;
          const restored = playerMana - prevMp;
          if (healed > 0 && restored > 0) {
            addCombatLog(`You drink ${item.title}: +${healed} HP, +${restored} MP.`);
            showDrinkEffect(`+${healed}HP +${restored}MP`, '#7dd3fc');
          } else if (healed > 0) {
            addCombatLog(`You drink ${item.title}: +${healed} HP.`);
            showDrinkEffect(`+${healed}HP`, '#86efac');
          } else if (restored > 0) {
            addCombatLog(`You drink ${item.title}: +${restored} MP.`);
            showDrinkEffect(`+${restored}MP`, '#93c5fd');
          } else {
            addCombatLog(`You drink ${item.title}, but no stats were restored.`);
          }
          updatePlayerBar();
          updateHud();
          return true;
        };
        const updateCreatureBar = (creature) => {
          if (!creature.hpBar) return;
          placeHealthBar(creature.hpBar, creature.sprite.x, creature.sprite.y - tileSize * 0.62);
          if (creature.nameTag) {
            creature.nameTag.setPosition(creature.sprite.x, creature.sprite.y - tileSize * 0.8);
          }
          const ratio = creature.hp / creature.maxHp;
          setHealthBarRatio(creature.hpBar, ratio);
          if (creature.nameTag) creature.nameTag.setColor(nameColorByHpRatio(ratio));
          creature.hpBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
          creature.hpBar.bg.setVisible(creature.alive);
          creature.hpBar.fill.setVisible(creature.alive);
          if (creature.nameTag) creature.nameTag.setVisible(creature.alive);
        };
        const updateAllHealthBars = () => {
          updatePlayerBar();
          for (const c of creatures) updateCreatureBar(c);
        };
        const pickGroupForLevel = (level) => {
          if (!typeProgressionGroups.length) return null;
          const n = typeProgressionGroups.length;
          const recentSet = new Set(recentGroupIndices);

          // Early-game rework:
          // - Build a per-run shuffled pool from easier groups.
          // - Iterate without immediate repeats, giving real variation between runs.
          const earlyLevels = 10;
          if (level <= earlyLevels) {
            // Inicio mucho mas facil:
            // una fraccion muy pequena de grupos de menor experiencia,
            // abriendo lentamente con el nivel.
            const phase = (level - 1) / Math.max(1, earlyLevels - 1); // 0..1
            const easyPct = 0.06 + phase * 0.18; // lvl1~6% -> lvl10~24%
            const easyMax = Math.max(2, Math.min(n - 1, Math.floor(n * easyPct)));
            // Excluir criaturas con muchos HP al principio.
            // Usamos percentil de average_hitpoints para filtrar grupos tanque.
            const hpValues = typeProgressionGroups
              .map((g) => Number(g.average_hitpoints || 0))
              .filter((v) => Number.isFinite(v) && v > 0)
              .sort((a, b) => a - b);
            const hpPct = 0.10 + phase * 0.30; // lvl1~10% -> lvl10~40%
            const hpCap = hpValues.length > 0
              ? hpValues[Math.min(hpValues.length - 1, Math.floor((hpValues.length - 1) * hpPct))]
              : Number.POSITIVE_INFINITY;
            if (earlyShufflePool.length === 0) {
              earlyShufflePool = Array.from({ length: easyMax + 1 }, (_, i) => i)
                .filter((idx) => Number(typeProgressionGroups[idx].average_hitpoints || 0) <= hpCap);
              if (earlyShufflePool.length === 0) {
                earlyShufflePool = Array.from({ length: easyMax + 1 }, (_, i) => i);
              }
              // Rework de variedad entre runs: mezclar por bloques + sesgo por run.
              const blockA = earlyShufflePool.filter((_, i) => i % 2 === 0);
              const blockB = earlyShufflePool.filter((_, i) => i % 2 === 1);
              Phaser.Utils.Array.Shuffle(blockA);
              Phaser.Utils.Array.Shuffle(blockB);
              earlyShufflePool = (runVariantBias % 2 === 0) ? [...blockA, ...blockB] : [...blockB, ...blockA];
              const offset = (runStartBias + (runVariantBias % Math.max(1, earlyShufflePool.length))) % earlyShufflePool.length;
              earlyShufflePool = earlyShufflePool.slice(offset).concat(earlyShufflePool.slice(0, offset));
              earlyShuffleCursor = 0;
            } else {
              // Si el rango facil crece por nivel, anadimos nuevos grupos y rebarajamos suave.
              const missing = [];
              const inPool = new Set(earlyShufflePool);
              for (let i = 0; i <= easyMax; i += 1) {
                if (!inPool.has(i)) missing.push(i);
              }
              const filteredMissing = missing.filter(
                (idx) => Number(typeProgressionGroups[idx].average_hitpoints || 0) <= hpCap
              );
              if (filteredMissing.length > 0) {
                Phaser.Utils.Array.Shuffle(filteredMissing);
                for (const m of filteredMissing) {
                  const pos = (runVariantBias + m + earlyShufflePool.length) % (earlyShufflePool.length + 1);
                  earlyShufflePool.splice(pos, 0, m);
                }
              }
            }
            let chosen = null;
            const maxTries = earlyShufflePool.length;
            for (let t = 0; t < maxTries; t += 1) {
              const idx = earlyShufflePool[(earlyShuffleCursor + t) % earlyShufflePool.length];
              if (!recentSet.has(idx)) {
                chosen = idx;
                earlyShuffleCursor = (earlyShuffleCursor + t + 1) % earlyShufflePool.length;
                break;
              }
            }
            if (chosen == null) {
              chosen = earlyShufflePool[earlyShuffleCursor % earlyShufflePool.length];
              earlyShuffleCursor = (earlyShuffleCursor + 1) % earlyShufflePool.length;
            }
            recentGroupIndices.push(chosen);
            if (recentGroupIndices.length > 5) recentGroupIndices.shift();
            return typeProgressionGroups[chosen];
          }

          // Mid/late game: weighted randomness around progression target with broader spread.
          const target = Math.min(n - 1, Math.floor((level - earlyLevels) * 1.45) + runStartBias);
          const radius = Math.max(7 + runSpreadBias, Math.floor(n * 0.28));
          const minIdx = Math.max(0, target - radius);
          const maxIdx = Math.min(n - 1, target + radius);
          let candidates = [];
          for (let i = minIdx; i <= maxIdx; i += 1) {
            if (!recentSet.has(i)) candidates.push(i);
          }
          if (candidates.length === 0) {
            for (let i = minIdx; i <= maxIdx; i += 1) candidates.push(i);
          }
          const weighted = candidates.map((idx) => {
            const dist = Math.abs(idx - target);
            const randomBoost = 0.65 + Math.random() * 0.7;
            return { idx, w: (1 / (1 + dist)) * randomBoost };
          });
          const totalW = weighted.reduce((acc, x) => acc + x.w, 0);
          let r = Math.random() * totalW;
          let chosen = weighted[weighted.length - 1].idx;
          for (const item of weighted) {
            r -= item.w;
            if (r <= 0) {
              chosen = item.idx;
              break;
            }
          }
          recentGroupIndices.push(chosen);
          if (recentGroupIndices.length > 5) recentGroupIndices.shift();
          return typeProgressionGroups[chosen];
        };
        const hasStairsAtPlayer = () => gridX === currentStairsTile.gx && gridY === currentStairsTile.gy;
        const generateLevelMap = () => {
          const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '.'));
          for (let y = 0; y < MAP_H; y += 1) {
            for (let x = 0; x < MAP_W; x += 1) {
              const isBorder = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1;
              if (isBorder) {
                map[y][x] = '#';
              } else if (Math.random() < 0.22) {
                map[y][x] = '#';
              }
            }
          }
          // carve guaranteed path START -> stairs
          const stairs = {
            gx: Phaser.Math.Between(2, MAP_W - 3),
            gy: Phaser.Math.Between(2, MAP_H - 3),
          };
          let x = START_TILE.gx;
          let y = START_TILE.gy;
          map[y][x] = '.';
          while (x !== stairs.gx || y !== stairs.gy) {
            if (x < stairs.gx) x += 1;
            else if (x > stairs.gx) x -= 1;
            else if (y < stairs.gy) y += 1;
            else if (y > stairs.gy) y -= 1;
            map[y][x] = '.';
          }
          map[START_TILE.gy][START_TILE.gx] = '.';
          map[stairs.gy][stairs.gx] = '.';
          return { map: map.map((r) => r.join('')), stairs };
        };
        const refreshMapVisuals = () => {
          for (let y = 0; y < MAP_H; y += 1) {
            for (let x = 0; x < MAP_W; x += 1) {
              const isWall = currentMap[y][x] === '#';
              mapTiles[y][x].setFillStyle(isWall ? 0x2f3a4a : 0x1a2534, 1);
            }
          }
        };
        const spawnCreaturesForLevel = (level) => {
          for (const c of creatures) {
            c.sprite.destroy();
            if (c.hpBar) {
              c.hpBar.bg.destroy();
              c.hpBar.fill.destroy();
            }
            if (c.nameTag) c.nameTag.destroy();
          }
          creatures.length = 0;

          const group = currentLevelGroup;
          const levelPool = (group && group.creatures && group.creatures.length > 0)
            ? group.creatures.filter((c) => c.type_primary === group.type_primary)
            : [{ id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }];
          creaturesTargetCount = Phaser.Math.Between(MIN_CREATURES_PER_LEVEL, MAX_CREATURES_PER_LEVEL);
          const templates = pickRandomCreatures(levelPool, creaturesTargetCount);
          const floorsForSpawn = currentFloors.filter(
            (t) =>
              !(t.gx === START_TILE.gx && t.gy === START_TILE.gy)
              && !(t.gx === currentStairsTile.gx && t.gy === currentStairsTile.gy)
          );

          for (let i = 0; i < creaturesTargetCount; i += 1) {
            const spawn = floorsForSpawn.length > 0 ? floorsForSpawn.splice(Phaser.Math.Between(0, floorsForSpawn.length - 1), 1)[0] : null;
            const template = templates[i % templates.length];
            if (!spawn || !isWalkableTile(spawn.gx, spawn.gy)) continue;

            const sprite = this.add.sprite(centerX(spawn.gx), centerY(spawn.gy), creatureKey(template));
            sprite.setOrigin(0.5, 0.5);
            sprite.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
            creatures.push({
              id: Number(template.id),
              sprite,
              gx: spawn.gx,
              gy: spawn.gy,
              hp: Math.max(1, Number(template.hitpoints || 1)),
              maxHp: Math.max(1, Number(template.hitpoints || 1)),
              maxDamage: Math.max(1, Number(template.maxDamage || 1)),
              runsAt: Math.max(0, Number(template.runs_at || 0)),
              title: template.title,
              experience: Number(template.experience || 0),
              speed: Math.max(1, Number(template.speed || 100)),
              alive: true,
              nextWanderAt: 0,
              nextActionAt: 0,
              aggroLocked: false,
              hpBar: makeHealthBar(0xef4444),
              nameTag: makeNameLabel(template.title, '#f3f4f6'),
            });
            updateCreatureBar(creatures[creatures.length - 1]);
          }
          const first = templates[0] || levelPool[0];
          addCombatLog(
            `Floor ${level}: ${first.type_primary} (base dmg ${first.maxDamage}).`
          );
        };
        const descendLevel = (toNext = true) => {
          for (const entry of groundLootByTile.values()) {
            if (entry.marker) entry.marker.destroy();
            if (entry.markerCount) entry.markerCount.destroy();
          }
          groundLootByTile.clear();
          if (toNext) currentLevel += 1;
          currentLevelGroup = pickGroupForLevel(currentLevel);
          const generated = generateLevelMap();
          currentMap = generated.map;
          currentStairsTile = generated.stairs;
          // Solo usamos casillas conectadas al inicio para evitar monstruos bloqueados.
          const reachable = [];
          const visited = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => false));
          const q = [{ gx: START_TILE.gx, gy: START_TILE.gy }];
          visited[START_TILE.gy][START_TILE.gx] = true;
          while (q.length > 0) {
            const cur = q.shift();
            if (currentMap[cur.gy][cur.gx] === '.') reachable.push(cur);
            const dirs = [
              { dx: 1, dy: 0 },
              { dx: -1, dy: 0 },
              { dx: 0, dy: 1 },
              { dx: 0, dy: -1 },
            ];
            for (const d of dirs) {
              const nx = cur.gx + d.dx;
              const ny = cur.gy + d.dy;
              if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
              if (visited[ny][nx]) continue;
              if (currentMap[ny][nx] !== '.') continue;
              visited[ny][nx] = true;
              q.push({ gx: nx, gy: ny });
            }
          }
          currentFloors = reachable;
          refreshMapVisuals();
          stairRect.setPosition(centerX(currentStairsTile.gx), centerY(currentStairsTile.gy));
          stairText.setPosition(centerX(currentStairsTile.gx), centerY(currentStairsTile.gy));
          stairRect.setVisible(false);
          stairText.setVisible(false);
          spawnCreaturesForLevel(currentLevel);
          gridX = START_TILE.gx;
          gridY = START_TILE.gy;
          player.x = centerX(gridX);
          player.y = centerY(gridY);
          updatePlayerBar();
        };
        const spellTooltipEl = document.getElementById('itemTooltip');
        const equipmentPanelEl = document.querySelector('.equipment-panel');
        const equipmentAccordionEl = document.getElementById('equipmentAccordion');
        const lootPanelEl = document.querySelector('.loot-panel');
        const spellsPanelEl = document.querySelector('.spells-panel');
        const spellsAccordionEl = document.getElementById('spellsAccordion');
        const learnedSpellsPanelEl = document.getElementById('learnedSpellsPanel');
        const hideSpellTooltip = () => {
          if (!spellTooltipEl) return;
          spellTooltipEl.style.display = 'none';
          spellTooltipEl.textContent = '';
        };
        const formatSpellTooltip = (spell) => {
          if (!spell) return '';
          const raw = spell.raw && typeof spell.raw === 'object' ? spell.raw : {};
          const lines = [];
          lines.push(`${spell.title || raw.title || 'Unknown Spell'}`);
          lines.push(`────────────────────`);
          if (spell.words) lines.push(`Words: ${spell.words}`);
          lines.push(`Type: ${spell.spell_type || 'Unknown'}  |  Group: ${spell.group_spell || 'Unknown'}`);
          lines.push(``);
          lines.push(`Requirements`);
          lines.push(`- Level: ${Math.max(0, Number(spell.level || 0))}`);
          lines.push(``);
          lines.push(`Cast Cost`);
          lines.push(`- Mana: ${Math.max(0, Number(spell.mana || 0))}`);
          lines.push(``);
          lines.push(`Shop`);
          lines.push(`- Price: ${Math.max(0, Number(spell.price || 0))} gp`);
          if (raw.effect) {
            lines.push(``);
            lines.push(`Effect`);
            lines.push(`${raw.effect}`);
          }
          return lines.join('\n');
        };
        const bindSpellTooltip = (el, spell) => {
          if (!el || !spellTooltipEl) return;
          const place = (ev) => {
            const pad = 12;
            const x = Math.min(window.innerWidth - 440, ev.clientX + pad);
            const y = Math.min(window.innerHeight - 240, ev.clientY + pad);
            spellTooltipEl.style.left = `${Math.max(6, x)}px`;
            spellTooltipEl.style.top = `${Math.max(6, y)}px`;
          };
          el.addEventListener('mouseenter', (ev) => {
            spellTooltipEl.textContent = formatSpellTooltip(spell);
            spellTooltipEl.style.display = 'block';
            spellTooltipEl.style.overflow = 'hidden';
            spellTooltipEl.style.maxHeight = 'none';
            place(ev);
          });
          el.addEventListener('mousemove', place);
          el.addEventListener('mouseleave', hideSpellTooltip);
        };
        window.addEventListener('blur', hideSpellTooltip);
        document.addEventListener('visibilitychange', () => {
          if (document.hidden) hideSpellTooltip();
        });
        document.addEventListener('keydown', hideSpellTooltip);
        document.addEventListener('click', hideSpellTooltip);
        const syncLootPanelPosition = () => {
          if (!equipmentPanelEl || !lootPanelEl) return;
          const rect = equipmentPanelEl.getBoundingClientRect();
          const nextTop = Math.round(rect.bottom + 6);
          lootPanelEl.style.top = `${nextTop}px`;
        };
        if (equipmentAccordionEl) {
          equipmentAccordionEl.addEventListener('toggle', syncLootPanelPosition);
        }
        window.addEventListener('resize', syncLootPanelPosition);
        const syncLearnedPanelPosition = () => {
          if (!spellsPanelEl || !learnedSpellsPanelEl) return;
          const rect = spellsPanelEl.getBoundingClientRect();
          const nextTop = Math.round(rect.bottom + 6);
          learnedSpellsPanelEl.style.top = `${nextTop}px`;
        };
        if (spellsAccordionEl) {
          spellsAccordionEl.addEventListener('toggle', syncLearnedPanelPosition);
        }
        window.addEventListener('resize', syncLearnedPanelPosition);
        const renderLearnedSpells = () => {
          const learnedGrid = document.getElementById('learnedSpellsGrid');
          const learnedFoot = document.getElementById('learnedSpellsFoot');
          if (!learnedGrid || !learnedFoot) return;
          learnedGrid.innerHTML = '';
          const learned = (spellsCatalog || [])
            .filter((s) => learnedSpellIds.has(Number(s.article_id)))
            .sort((a, b) => {
              if (a.level !== b.level) return a.level - b.level;
              return String(a.title || '').localeCompare(String(b.title || ''));
            });
          if (learned.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'learned-spell-row';
            empty.textContent = 'No spells learned yet.';
            learnedGrid.appendChild(empty);
          } else {
            for (const spell of learned) {
              const row = document.createElement('div');
              row.className = 'learned-spell-row';
              const slotIdx = learnedSpellSlots.findIndex((id) => Number(id) === Number(spell.article_id));
              const slotPrefix = slotIdx >= 0 ? `[${slotIdx + 1}] ` : '';
              row.textContent = `${slotPrefix}${spell.title} (Lv ${Math.max(0, Number(spell.level || 0))})`;
              bindSpellTooltip(row, spell);
              learnedGrid.appendChild(row);
            }
          }
          learnedFoot.textContent = `Total: ${learned.length}`;
          syncLootPanelPosition();
          syncLearnedPanelPosition();
        };
        const renderSpellShop = () => {
          const spellsGrid = document.getElementById('spellsGrid');
          const spellsFoot = document.getElementById('spellsFoot');
          if (!spellsGrid || !spellsFoot) return;
          const currentGold = window.debugInventory && typeof window.debugInventory.getGold === 'function'
            ? Math.max(0, Number(window.debugInventory.getGold() || 0))
            : 0;
          spellsGrid.innerHTML = '';
          const available = (spellsCatalog || []).filter((s) => {
            if (String(s.status || '').toLowerCase() !== 'active') return false;
            if (Math.max(0, Number(s.level || 0)) === 0) return false;
            if (String(s.spell_type || '').toLowerCase() === 'rune') return false;
            if (Math.max(0, Number(s.level || 0)) > playerLevel) return false;
            if (learnedSpellIds.has(Number(s.article_id))) return false;
            const classAllowed = Number((s.raw && s.raw[playerClassKey]) || 0) === 1;
            if (!classAllowed) return false;
            const title = String(s.title || '').trim().toLowerCase();
            if (title === 'find person') return false;
            const words = String(s.words || '').trim().toLowerCase();
            const effect = String((s.raw && s.raw.effect) || '').trim().toLowerCase();
            const isLightSpell = (
              title.includes('light')
              || effect.includes('illumination')
              || words === 'utevo lux'
              || words === 'utevo gran lux'
              || words === 'utevo vis lux'
            );
            if (isLightSpell) return false;
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
            right.textContent = `${price} gp`;
            head.appendChild(left);
            head.appendChild(right);
            bindSpellTooltip(row, spell);
            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = `Lv ${lvl} | Mana ${Math.max(0, Number(spell.mana || 0))}`;
            const btn = document.createElement('button');
            btn.type = 'button';
            if (isLearned) {
              btn.textContent = 'Learned';
              btn.disabled = true;
            } else if (!canLevel) {
              btn.textContent = `Need Lv ${lvl}`;
              btn.disabled = true;
            } else if (!canGold) {
              btn.textContent = `Need ${price} gp`;
              btn.disabled = true;
            } else {
              btn.textContent = 'Buy spell';
              btn.disabled = false;
              const buySpell = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (btn.disabled) return;
                const spent = window.debugInventory && typeof window.debugInventory.spendGold === 'function'
                  ? window.debugInventory.spendGold(price)
                  : false;
                if (!spent) {
                  addCombatLog(`Not enough gold to buy ${spell.title}.`);
                  return;
                }
                btn.disabled = true;
                learnedSpellIds.add(Number(spell.article_id));
                const freeIdx = learnedSpellSlots.findIndex((id) => id == null);
                if (freeIdx >= 0) {
                  learnedSpellSlots[freeIdx] = Number(spell.article_id);
                } else {
                  addCombatLog(`No free hotkey slot (1-9) for ${spell.title}.`);
                }
                addCombatLog(`Bought spell: ${spell.title} for ${price} gp.`);
                renderLootSlots(currentBagCapacity);
                updateHud();
                renderSpellShop();
                renderLearnedSpells();
              };
              btn.addEventListener('mousedown', (ev) => {
                if (ev.button !== 0) return;
                buySpell(ev);
              });
              btn.addEventListener('touchstart', buySpell, { passive: false });
            }
            row.appendChild(head);
            row.appendChild(meta);
            row.appendChild(btn);
            frag.appendChild(row);
          }
          spellsGrid.appendChild(frag);
          spellsFoot.textContent = `Gold: ${currentGold} | Learned: ${learnedSpellIds.size}`;
          renderLearnedSpells();
        };
        window.addEventListener('coins-changed', renderSpellShop);
        const updateHud = () => {
          const group = currentLevelGroup;
          const typeName = group ? group.type_primary : 'Creature';
          const invState = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          const capTotal = invState ? Number(invState.capacity || 0) : progressionStatsForLevel(playerLevel, playerClassKey).capacity;
          const capCurrent = invState ? Number(invState.carriedWeight || 0) : 0;
          const capCurrentText = Number.isFinite(capCurrent) ? capCurrent.toFixed(1) : '0.0';
          const capTotalText = Number.isFinite(capTotal) ? capTotal.toFixed(0) : '0';
          nameLabel.setText(`${configPlayer.name} (${playerClassKey}) | Player Lv ${playerLevel}`);
          levelHud.setText(`Floor ${currentLevel} | ${typeName} ${aliveCreatures().length}/${creaturesTargetCount}`);
          combatHud.setText(`HP ${playerHp}/${playerMaxHp} MP ${playerMana}/${playerMaxMana} CAP ${capCurrentText}/${capTotalText}`);
          const xpNeeded = xpToNextLevel(playerLevel);
          const progress = xpNeeded > 0 ? playerXp / xpNeeded : 0;
          const totalWidth = this.scale.width - 18;
          levelProgressFill.width = Math.max(2, totalWidth * progress);
          levelProgressText.setText(`XP ${playerXp} / ${xpNeeded}`);
          renderSpellShop();
        };
        const pickCreatureDamage = () => {
          const max = Math.max(1, Number(this._activeAttackerMaxDamage || 1));
          return Phaser.Math.Between(1, max);
        };
        const getEquippedHandWeapon = () => {
          const state = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          return state && state.equipped ? state.equipped.hand : null;
        };
        const currentPlayerDamage = () => {
          const hand = getEquippedHandWeapon();
          const weaponAttack = Math.max(0, Number((hand && hand.attack_value) || 0));
          return Math.max(1, playerBaseDamage + weaponAttack);
        };
        const isThrowableWeapon = (item) => {
          if (!item) return false;
          if (item.throwable) return true;
          return String(item.type_secondary || '').toLowerCase() === 'throwing weapons';
        };
        const isDistanceWeapon = (item) => (
          item
          && String(item.item_class || '').toLowerCase() === 'weapons'
          && String(item.item_type || '').toLowerCase() === 'distance weapons'
        );
        const rangeFromAttributes = (item) => {
          const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
          const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'range');
          if (!row) return null;
          const n = Number(row.value);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        };
        const effectiveWeaponRange = (item) => {
          if (!item) return 1;
          const fromAttrs = rangeFromAttributes(item);
          if (fromAttrs != null) return fromAttrs;
          const raw = Number(item.range_value || 1);
          if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
          if (isDistanceWeapon(item)) {
            return isThrowableWeapon(item) ? 4 : 5;
          }
          return 1;
        };
        const findRangedTargetInDirection = (dx, dy, rangeTiles) => {
          const maxRange = Math.max(1, Math.floor(Number(rangeTiles) || 1));
          for (let step = 1; step <= maxRange; step += 1) {
            const tx = gridX + dx * step;
            const ty = gridY + dy * step;
            if (!isWalkableTile(tx, ty)) break;
            if (isWallTile(tx, ty)) break;
            const c = creatureAt(tx, ty);
            if (c) return c;
          }
          return null;
        };
        const hasRangedLineOfSight = (fromX, fromY, toX, toY) => {
          const dx = toX - fromX;
          const dy = toY - fromY;
          const steps = Math.max(Math.abs(dx), Math.abs(dy));
          if (steps <= 1) return true;
          for (let i = 1; i < steps; i += 1) {
            const t = i / steps;
            const sx = Math.round(fromX + dx * t);
            const sy = Math.round(fromY + dy * t);
            if (sx === toX && sy === toY) break;
            if (isWallTile(sx, sy)) return false;
          }
          return true;
        };
        const findNearestRangedTarget = (rangeTiles) => {
          const maxRange = Math.max(1, Math.floor(Number(rangeTiles) || 1));
          const candidates = aliveCreatures()
            .filter((c) => {
              const dist = Math.max(Math.abs(c.gx - gridX), Math.abs(c.gy - gridY));
              if (dist <= 0 || dist > maxRange) return false;
              return hasRangedLineOfSight(gridX, gridY, c.gx, c.gy);
            })
            .sort((a, b) => {
              const da = Math.max(Math.abs(a.gx - gridX), Math.abs(a.gy - gridY));
              const db = Math.max(Math.abs(b.gx - gridX), Math.abs(b.gy - gridY));
              return da - db;
            });
          return candidates[0] || null;
        };
        const inferSpellRange = (spell) => {
          const effect = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
          if (effect.includes('adjacent')) return 1;
          if (effect.includes('around the caster') || effect.includes('area')) return 2;
          return 4;
        };
        const inferHealingAmount = (spell) => {
          const title = String((spell && spell.title) || '').toLowerCase();
          if (title.includes('ultimate')) return 75 + playerLevel * 4;
          if (title.includes('intense')) return 45 + playerLevel * 3;
          if (title.includes('light')) return 20 + playerLevel * 2;
          return 30 + playerLevel * 2;
        };
        const inferAttackDamage = (spell) => {
          const manaCost = Math.max(0, Number((spell && spell.mana) || 0));
          return Math.max(8, Math.floor(6 + playerLevel * 1.5 + manaCost * 0.35));
        };
        const showSpellTileEffect = (tiles, color = 0xf59e0b) => {
          for (const t of tiles || []) {
            if (!isWalkableTile(t.gx, t.gy)) continue;
            const fx = this.add.rectangle(centerX(t.gx), centerY(t.gy), tileSize * 0.95, tileSize * 0.95, color, 0.42);
            fx.setStrokeStyle(2, color, 0.85);
            const slash = this.add.text(centerX(t.gx), centerY(t.gy), '✦', {
              color: '#fde68a',
              fontSize: '16px',
              fontStyle: 'bold',
            });
            slash.setOrigin(0.5, 0.5);
            this.tweens.add({
              targets: fx,
              alpha: 0,
              scaleX: 1.18,
              scaleY: 1.18,
              duration: 300,
              ease: 'Sine.easeOut',
              onComplete: () => fx.destroy(),
            });
            this.tweens.add({
              targets: slash,
              alpha: 0,
              y: slash.y - 10,
              duration: 320,
              ease: 'Sine.easeOut',
              onComplete: () => slash.destroy(),
            });
          }
        };
        const frontSweepTiles = () => {
          // 3 impacted tiles in the row directly in front of player.
          if (playerFacingFrame === 0) {
            return [{ gx: gridX - 1, gy: gridY + 1 }, { gx: gridX, gy: gridY + 1 }, { gx: gridX + 1, gy: gridY + 1 }];
          }
          if (playerFacingFrame === 2) {
            return [{ gx: gridX - 1, gy: gridY - 1 }, { gx: gridX, gy: gridY - 1 }, { gx: gridX + 1, gy: gridY - 1 }];
          }
          if (playerFacingFrame === 1) {
            return [{ gx: gridX + 1, gy: gridY - 1 }, { gx: gridX + 1, gy: gridY }, { gx: gridX + 1, gy: gridY + 1 }];
          }
          return [{ gx: gridX - 1, gy: gridY - 1 }, { gx: gridX - 1, gy: gridY }, { gx: gridX - 1, gy: gridY + 1 }];
        };
        const castLearnedSpell = (slotNumber, now) => {
          const articleId = learnedSpellSlots[slotNumber - 1];
          if (!articleId) return false;
          const spell = (spellsCatalog || []).find((s) => Number(s.article_id) === Number(articleId));
          if (!spell) return false;
          const manaCost = Math.max(0, Number(spell.mana || 0));
          if (playerMana < manaCost) {
            addCombatLog(`Not enough mana for ${spell.title}.`);
            return true;
          }
          const cdSec = Math.max(0, Number((spell.raw && spell.raw.cooldown) || 0));
          const cdUntil = Number(spellCooldownUntil.get(articleId) || 0);
          if (now < cdUntil) {
            addCombatLog(`${spell.title} is on cooldown.`);
            return true;
          }
          playerMana = Math.max(0, playerMana - manaCost);
          spellCooldownUntil.set(articleId, now + (cdSec * 1000));
          const group = String(spell.group_spell || '').toLowerCase();
          const title = String(spell.title || '').toLowerCase();
          if (group === 'healing' || title.includes('healing') || title.includes('exura')) {
            const heal = inferHealingAmount(spell);
            const prev = playerHp;
            playerHp = Math.min(playerMaxHp, playerHp + heal);
            const gained = Math.max(0, playerHp - prev);
            addCombatLog(`Cast [${slotNumber}] ${spell.title}: +${gained} HP.`, LOG_COLORS.SPELL);
            showDrinkEffect(`+${gained} HP`, 0x60a5fa);
          } else if (group === 'attack') {
            if (title.includes('lesser front sweep')) {
              const tiles = frontSweepTiles().filter((t) => isWalkableTile(t.gx, t.gy));
              showSpellTileEffect(tiles, 0xfbbf24);
              const impacted = [];
              for (const t of tiles) {
                const target = creatureAt(t.gx, t.gy);
                if (!target) continue;
                const crit = didAttackCrit();
                const base = inferAttackDamage(spell);
                const dmg = crit ? applyCriticalDamage(base) : base;
                target.hp = Math.max(0, target.hp - dmg);
                showCreatureHitEffect(target, dmg);
                if (crit) showCritText(target.sprite.x, target.sprite.y);
                impacted.push({ target, dmg });
                if (target.hp <= 0) {
                  target.alive = false;
                  target.sprite.setVisible(false);
                  updateCreatureBar(target);
                  grantPlayerXp(effectiveXpFromCreature(target));
                }
              }
              if (impacted.length === 0) {
                addCombatLog(`Cast [${slotNumber}] ${spell.title}, but it hits nothing.`, LOG_COLORS.SPELL);
              } else {
                const detail = impacted
                  .map((x) => `${x.target.title}(${x.dmg})`)
                  .join(', ');
                addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${detail}.`, LOG_COLORS.SPELL);
              }
              updatePlayerBar();
              updateHud();
              return true;
            }
            const target = findNearestRangedTarget(inferSpellRange(spell));
            if (!target) {
              addCombatLog(`Cast [${slotNumber}] ${spell.title}, but no target in range.`, LOG_COLORS.SPELL);
            } else if (didAttackMiss()) {
              if (title.includes('ethereal spear')) {
                showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
              }
              showMissSmoke(target.sprite.x, target.sprite.y);
              addCombatLog(`Your ${spell.title} misses ${target.title}.`, LOG_COLORS.SPELL);
            } else {
              if (title.includes('ethereal spear')) {
                showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
              }
              const crit = didAttackCrit();
              const base = inferAttackDamage(spell);
              const dmg = crit ? applyCriticalDamage(base) : base;
              target.hp = Math.max(0, target.hp - dmg);
              showCreatureHitEffect(target, dmg);
              if (crit) showCritText(target.sprite.x, target.sprite.y);
              addCombatLog(`${spell.title} hits ${target.title} for ${dmg}.`, LOG_COLORS.SPELL);
              if (target.hp <= 0) {
                target.alive = false;
                target.sprite.setVisible(false);
                updateCreatureBar(target);
                grantPlayerXp(effectiveXpFromCreature(target));
                addCombatLog(`${target.title} dies from ${spell.title}.`);
              }
            }
          } else {
            const effect = String((spell.raw && spell.raw.effect) || '').toLowerCase();
            if (effect.includes('speed')) {
              playerMoveDurationMs = Math.max(90, playerMoveDurationMs - 20);
              playerActionDelayMs = Math.max(150, playerActionDelayMs - 30);
              this.time.delayedCall(10000, () => updatePlayerTimingsByLevel());
              addCombatLog(`Cast [${slotNumber}] ${spell.title}: speed boosted.`, LOG_COLORS.SPELL);
            } else {
              addCombatLog(`Cast [${slotNumber}] ${spell.title}.`, LOG_COLORS.SPELL);
            }
          }
          updatePlayerBar();
          updateHud();
          return true;
        };
        const performPlayerAttack = (targetCreature, handWeapon, usedRangedShot, now) => {
          if (!targetCreature) return false;
          if (handWeapon && isDistanceWeapon(handWeapon)) {
            showRangedProjectileEffect(handWeapon, targetCreature);
          }
          if (didAttackMiss()) {
            showMissSmoke(targetCreature.sprite.x, targetCreature.sprite.y);
            addCombatLog(`You miss your hit against ${targetCreature.title}.`);
          } else {
            const isCrit = didAttackCrit();
            const baseDamage = currentPlayerDamage();
            const damage = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
            targetCreature.hp = Math.max(0, targetCreature.hp - damage);
            showCreatureHitEffect(targetCreature, damage);
            if (isCrit) {
              showCritText(targetCreature.sprite.x, targetCreature.sprite.y);
            }
            addCombatLog(
              isCrit
                ? `CRITICAL hit on ${targetCreature.title} for ${damage}.`
                : `You hit ${targetCreature.title} for ${damage}.`,
              isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
            );
            if (targetCreature.hp <= 0) {
              targetCreature.alive = false;
              targetCreature.sprite.setVisible(false);
              updateCreatureBar(targetCreature);
              grantPlayerXp(effectiveXpFromCreature(targetCreature));
              addCombatLog(
                isCrit
                  ? `CRITICAL hit on ${targetCreature.title} for ${damage}, and it dies.`
                  : `You hit ${targetCreature.title} and it dies.`,
                isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
              );
              const rolledDrops = rollCreatureDrops(targetCreature.id);
              if (rolledDrops.length > 0) {
                addCombatLog(`${targetCreature.title} dropped: ${rolledDrops.map((d) => d.itemTitle).join(', ')}.`);
              } else {
                const fallbackGold = fallbackGoldFromLevel();
                if (window.debugInventory && typeof window.debugInventory.addGold === 'function') {
                  window.debugInventory.addGold(fallbackGold);
                }
                addCombatLog(`${targetCreature.title} dropped no items. You receive ${fallbackGold} gold.`);
              }
              if (rolledDrops.length > 0 && window.debugInventory && typeof window.debugInventory.addLoot === 'function') {
                for (const d of rolledDrops) {
                  const stored = window.debugInventory.addLoot({
                    id: d.itemId,
                    title: d.itemTitle,
                    image: d.itemImage || null,
                    item_type: d.itemType || null,
                    item_class: d.itemClass || null,
                    type_secondary: d.itemSecondary || null,
                    armor_value: Number(d.armorValue || 0),
                    shielding_value: Number(d.shieldingValue || 0),
                    attack_value: Number(d.attackValue || 0),
                    range_value: Number(d.rangeValue || 1),
                    throwable: Boolean(d.throwable),
                    attributes: Array.isArray(d.attributes) ? d.attributes : [],
                    raw: (d.raw && typeof d.raw === 'object') ? d.raw : {},
                    isStackable: Boolean(d.isStackable),
                    count: 1,
                  });
                  if (stored) {
                    addCombatLog(`Stored in bag: ${d.itemTitle}.`);
                  } else {
                      const droppedItem = {
                        id: d.itemId,
                        title: d.itemTitle,
                        image: d.itemImage || null,
                        item_type: d.itemType || null,
                        item_class: d.itemClass || null,
                        type_secondary: d.itemSecondary || null,
                        armor_value: Number(d.armorValue || 0),
                        shielding_value: Number(d.shieldingValue || 0),
                        attack_value: Number(d.attackValue || 0),
                        range_value: Number(d.rangeValue || 1),
                        throwable: Boolean(d.throwable),
                        attributes: Array.isArray(d.attributes) ? d.attributes : [],
                        raw: (d.raw && typeof d.raw === 'object') ? d.raw : {},
                        isStackable: Boolean(d.isStackable),
                        count: 1,
                      };
                      dropItemOnGround(targetCreature.gx, targetCreature.gy, droppedItem);
                      if (lastLootRejectReason === 'capacity') {
                        addCombatLog(`Not enough capacity, dropped on ground: ${d.itemTitle}.`);
                      } else {
                        addCombatLog(`Bag slots full, dropped on ground: ${d.itemTitle}.`);
                      }
                  }
                }
              }
            } else {
              addCombatLog(
                isCrit
                  ? `CRITICAL hit on ${targetCreature.title} for ${damage} (${targetCreature.hp} HP).`
                  : `You hit ${targetCreature.title} for ${damage} (${targetCreature.hp} HP).`,
                isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
              );
            }
          }
          if (handWeapon && isDistanceWeapon(handWeapon) && isThrowableWeapon(handWeapon) && Math.random() < 0.1) {
            const currentCount = Math.max(1, Number(handWeapon.count || 1));
            if (currentCount > 1) {
              setEquippedSlotVisual('hand', { ...handWeapon, count: currentCount - 1 }, `${handWeapon.title} consumed on throw (${currentCount - 1} left).`);
            } else if (window.debugInventory && typeof window.debugInventory.unequipHand === 'function') {
              window.debugInventory.unequipHand();
            }
            addCombatLog(`${handWeapon.title} was consumed after the throw.`);
          }
          updateCreatureBar(targetCreature);
          updateHud();
          if (aliveCreatures().length === 0) {
            stairRect.setVisible(true);
            stairText.setVisible(true);
            addCombatLog(`You defeated all creatures on floor ${currentLevel}. Go down the stairs.`);
            nextPlayerActionAt = now + playerActionDelayMs;
            return true;
          }
          nextPlayerActionAt = now + playerActionDelayMs;
          return true;
        };
        const didAttackMiss = () => Math.random() < 0.1;
        const didAttackCrit = () => Math.random() < 0.1;
        const applyCriticalDamage = (baseDamage) => Math.max(1, Math.round(baseDamage * 2.5)); // +150%
        const projectileVisualForWeapon = (weapon) => {
          const title = String((weapon && weapon.title) || '').toLowerCase();
          const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
          if (title.includes('ethereal spear')) return { glyph: '➤', color: '#7dd3fc', size: 18 };
          if (title.includes('star')) return { glyph: '✶', color: '#fde047', size: 16 };
          if (title.includes('knife')) return { glyph: '†', color: '#e5e7eb', size: 16 };
          if (title.includes('spear')) return { glyph: '➤', color: '#f8fafc', size: 16 };
          if (title.includes('snowball')) return { glyph: '●', color: '#f8fafc', size: 14 };
          if (title.includes('stone')) return { glyph: '●', color: '#cbd5e1', size: 14 };
          if (secondary.includes('crossbow')) return { glyph: '✦', color: '#f59e0b', size: 14 };
          if (secondary.includes('bow')) return { glyph: '➵', color: '#f59e0b', size: 14 };
          if (secondary.includes('throwing')) return { glyph: '◆', color: '#e2e8f0', size: 14 };
          return { glyph: '•', color: '#f8fafc', size: 14 };
        };
        const showRangedProjectileEffect = (weapon, target) => {
          if (!weapon || !target || !target.sprite) return;
          const visual = projectileVisualForWeapon(weapon);
          const shot = this.add.text(player.x, player.y - 4, visual.glyph, {
            color: visual.color,
            fontSize: `${visual.size}px`,
            fontStyle: 'bold',
          });
          shot.setOrigin(0.5, 0.5);
          shot.setDepth(50);
          this.tweens.add({
            targets: shot,
            x: target.sprite.x,
            y: target.sprite.y - 4,
            duration: 150,
            ease: 'Linear',
            onComplete: () => shot.destroy(),
          });
        };
        const showCritText = (x, y) => {
          const crit = this.add.text(x, y - tileSize * 0.9, 'CRIT!', {
            color: '#ff0000',
            fontSize: '14px',
            fontStyle: 'bold',
          });
          crit.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: crit,
            y: crit.y - 22,
            alpha: 0,
            duration: 900,
            ease: 'Sine.easeOut',
            onComplete: () => crit.destroy(),
          });
        };
        const showMissSmoke = (x, y) => {
          const puffs = [
            { dx: -7, dy: -4, r: 7 },
            { dx: 0, dy: -7, r: 8 },
            { dx: 7, dy: -3, r: 7 },
            { dx: -3, dy: 3, r: 6 },
            { dx: 4, dy: 4, r: 6 },
          ];
          for (const puff of puffs) {
            const cloud = this.add.circle(x + puff.dx, y + puff.dy, puff.r, 0x9ca3af, 0.55);
            this.tweens.add({
              targets: cloud,
              y: cloud.y - 10,
              alpha: 0,
              scaleX: 1.25,
              scaleY: 1.25,
              duration: 260,
              ease: 'Sine.easeOut',
              onComplete: () => cloud.destroy(),
            });
          }
          const miss = this.add.text(x, y - tileSize * 0.75, 'MISS', {
            color: '#e5e7eb',
            fontSize: '14px',
            fontStyle: 'bold',
          });
          miss.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: miss,
            y: miss.y - 14,
            alpha: 0,
            duration: 320,
            ease: 'Sine.easeOut',
            onComplete: () => miss.destroy(),
          });
        };
        const showPlayerHitEffect = (dmg) => {
          if (playerDead) return;
          player.setTint(0xff4d4d);
          this.tweens.add({
            targets: player,
            scaleX: basePlayerScaleX * 1.1,
            scaleY: basePlayerScaleY * 1.1,
            yoyo: true,
            duration: 80,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (!playerDead) {
                player.setScale(basePlayerScaleX, basePlayerScaleY);
              }
              player.clearTint();
              updatePlayerBar();
            },
          });
          const pop = this.add.text(player.x, player.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff7b7b',
            fontSize: '16px',
            fontStyle: 'bold',
          });
          pop.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: pop,
            y: pop.y - 18,
            alpha: 0,
            duration: 350,
            ease: 'Sine.easeOut',
            onComplete: () => pop.destroy(),
          });
        };
        const showCreatureHitEffect = (creature, dmg) => {
          creature.sprite.setTint(0xff4d4d);
          this.tweens.add({
            targets: creature.sprite,
            scaleX: creature.sprite.scaleX * 1.1,
            scaleY: creature.sprite.scaleY * 1.1,
            yoyo: true,
            duration: 80,
            ease: 'Sine.easeOut',
            onComplete: () => {
              creature.sprite.clearTint();
              creature.sprite.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
              updateCreatureBar(creature);
            },
          });
          const pop = this.add.text(creature.sprite.x, creature.sprite.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff7b7b',
            fontSize: '16px',
            fontStyle: 'bold',
          });
          pop.setOrigin(0.5, 0.5);
          this.tweens.add({
            targets: pop,
            y: pop.y - 16,
            alpha: 0,
            duration: 320,
            ease: 'Sine.easeOut',
            onComplete: () => pop.destroy(),
          });
        };
        const tileKey = (x, y) => `${x},${y}`;
        const findNextStepToPlayer = (fromX, fromY) => {
          const targetKey = tileKey(gridX, gridY);
          const startKey = tileKey(fromX, fromY);
          if (startKey === targetKey) return null;

          const queue = [{ x: fromX, y: fromY }];
          const visited = new Set([startKey]);
          const prev = new Map();
          const directions = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
          ];

          while (queue.length > 0) {
            const cur = queue.shift();
            for (const d of directions) {
              const nx = cur.x + d.x;
              const ny = cur.y + d.y;
              const key = tileKey(nx, ny);
              if (visited.has(key)) continue;
              if (!isWalkable(nx, ny)) continue;
              if (key !== targetKey && isOccupiedByActor(nx, ny)) continue;

              visited.add(key);
              prev.set(key, cur);
              if (key === targetKey) {
                let step = { x: nx, y: ny };
                let stepPrev = prev.get(key);
                while (stepPrev && tileKey(stepPrev.x, stepPrev.y) !== startKey) {
                  step = stepPrev;
                  stepPrev = prev.get(tileKey(stepPrev.x, stepPrev.y));
                }
                return step;
              }
              queue.push({ x: nx, y: ny });
            }
          }
          return null;
        };
        const tryMoveCreature = (creature) => {
          const next = findNextStepToPlayer(creature.gx, creature.gy);
          if (!next) return false;
          if (next.x === gridX && next.y === gridY) return false;
          orientCreatureSprite(creature, next.x - creature.gx, next.y - creature.gy);
          creature.gx = next.x;
          creature.gy = next.y;
          creature.sprite.x = centerX(creature.gx);
          creature.sprite.y = centerY(creature.gy);
          updateCreatureBar(creature);
          return true;
        };
        const tryWanderCreature = (creature, now) => {
          if (now < creature.nextWanderAt) return false;
          creature.nextWanderAt = now + Phaser.Math.Between(900, 1600);

          // Fuera de agro: solo movimiento cardinal de 1 casilla (N/E/O/S).
          const cardinalDirections = [
            { dx: 0, dy: -1 }, // norte
            { dx: 1, dy: 0 },  // este
            { dx: -1, dy: 0 }, // oeste
            { dx: 0, dy: 1 },  // sur
          ];
          const firstIndex = Phaser.Math.Between(0, cardinalDirections.length - 1);
          for (let i = 0; i < cardinalDirections.length; i += 1) {
            const d = cardinalDirections[(firstIndex + i) % cardinalDirections.length];
            const nx = creature.gx + d.dx;
            const ny = creature.gy + d.dy;
            if (!isWalkable(nx, ny)) continue;
            if (isOccupiedByActor(nx, ny)) continue;
            orientCreatureSprite(creature, d.dx, d.dy);
            creature.gx = nx;
            creature.gy = ny;
            creature.sprite.x = centerX(creature.gx);
            creature.sprite.y = centerY(creature.gy);
            updateCreatureBar(creature);
            return true;
          }
          return false;
        };
        const shouldFlee = (creature) => creature.runsAt > 0 && creature.hp <= creature.runsAt;
        const tryFleeCreature = (creature) => {
          const options = [
            { dx: 1, dy: 0 },
            { dx: -1, dy: 0 },
            { dx: 0, dy: 1 },
            { dx: 0, dy: -1 },
          ];
          let best = null;
          let bestDist = Math.abs(creature.gx - gridX) + Math.abs(creature.gy - gridY);
          for (const d of options) {
            const nx = creature.gx + d.dx;
            const ny = creature.gy + d.dy;
            if (!isWalkable(nx, ny)) continue;
            if (isOccupiedByActor(nx, ny)) continue;
            const dist = Math.abs(nx - gridX) + Math.abs(ny - gridY);
            if (dist > bestDist) {
              bestDist = dist;
              best = { nx, ny, d };
            }
          }
          if (!best) return false;
          orientCreatureSprite(creature, best.d.dx, best.d.dy);
          creature.gx = best.nx;
          creature.gy = best.ny;
          creature.sprite.x = centerX(creature.gx);
          creature.sprite.y = centerY(creature.gy);
          updateCreatureBar(creature);
          return true;
        };
        const creatureTurn = () => {
          if (gameOver) return;
          const now = this.time.now;
          for (const creature of aliveCreatures()) {
            if (now < creature.nextActionAt) continue;
            if (!hasAggro(creature)) {
              const wandered = tryWanderCreature(creature, now);
              if (wandered) {
                creature.nextActionAt = now + actionDelayFromSpeed(creature.speed);
              } else {
                creature.nextActionAt = now + 120;
              }
              continue;
            }
            creature.aggroLocked = true;
            let acted = false;
            if (shouldFlee(creature)) {
              acted = tryFleeCreature(creature) || acted;
              creature.nextActionAt = now + (acted ? actionDelayFromSpeed(creature.speed) : 120);
              continue;
            }
            if (!isAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              acted = tryMoveCreature(creature) || acted;
            }
            if (isAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              orientCreatureSprite(creature, gridX - creature.gx, gridY - creature.gy);
              if (didAttackMiss()) {
                showMissSmoke(player.x, player.y);
                addCombatLog(`${creature.title} misses the hit.`);
                acted = true;
              } else {
                this._activeAttackerMaxDamage = creature.maxDamage;
                const baseDamage = pickCreatureDamage();
                const isCrit = didAttackCrit();
                const dmg = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
                playerHp = Math.max(0, playerHp - dmg);
                showPlayerHitEffect(dmg);
                if (isCrit) {
                  showCritText(player.x, player.y);
                  addCombatLog(`${creature.title} lands a CRITICAL hit for ${dmg}.`);
                } else {
                  addCombatLog(`${creature.title} hits you for ${dmg}.`);
                }
                acted = true;
              }
              if (playerHp <= 0) {
                gameOver = true;
                playerDead = true;
                this.tweens.killTweensOf(player);
                const deathKey = deathTextureName(configPlayer.sex === 'female' ? 'female' : 'male');
                player.setTexture(deathKey);
                player.setAngle(0);
                player.setFlipX(false);
                player.setFlipY(false);
                player.setScale(1, 1);
                player.setDisplaySize(tileSize, tileSize);
                deathCaption.setPosition(player.x, player.y + tileSize * 0.72);
                deathCaption.setVisible(true);
                addCombatLog('You are dead. Reload to restart.');
                break;
              }
            }
            creature.nextActionAt = now + (acted ? actionDelayFromSpeed(creature.speed) : 120);
          }
          updatePlayerBar();
          updateHud();
        };

        descendLevel(false); // initialize first level with random dungeon composition
        updatePlayerBar();
        updateHud();
        this.time.addEvent({
          delay: 90,
          loop: true,
          callback: creatureTurn,
        });
        this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            if (playerDead || gameOver) return;
            if (hungerSecondsLeft <= 0) {
              if (!isHungry) setHungryState(true, 0);
              return;
            }
            hungerSecondsLeft = Math.max(0, hungerSecondsLeft - 1);
            if (playerHp < playerMaxHp) playerHp += 1;
            if (playerMana < playerMaxMana) playerMana += 1;
            updatePlayerBar();
            updateHud();
            setHungryState(false, hungerSecondsLeft);
            if (hungerSecondsLeft <= 0) setHungryState(true, 0);
          },
        });

        this.events.on('update', () => {
          updateAllHealthBars();
          if (moving || gameOver) return;
          const now = this.time.now;
          if (now < nextPlayerActionAt) return;
          const spellSlotToCast = (
            Phaser.Input.Keyboard.JustDown(spellHotkeys.one) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num1) ? 1
              : Phaser.Input.Keyboard.JustDown(spellHotkeys.two) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num2) ? 2
                : Phaser.Input.Keyboard.JustDown(spellHotkeys.three) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num3) ? 3
                  : Phaser.Input.Keyboard.JustDown(spellHotkeys.four) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num4) ? 4
                    : Phaser.Input.Keyboard.JustDown(spellHotkeys.five) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num5) ? 5
                      : Phaser.Input.Keyboard.JustDown(spellHotkeys.six) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num6) ? 6
                        : Phaser.Input.Keyboard.JustDown(spellHotkeys.seven) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num7) ? 7
                          : Phaser.Input.Keyboard.JustDown(spellHotkeys.eight) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num8) ? 8
                            : Phaser.Input.Keyboard.JustDown(spellHotkeys.nine) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num9) ? 9
                              : 0
          );
          if (spellSlotToCast > 0) {
            const casted = castLearnedSpell(spellSlotToCast, now);
            if (casted) {
              nextPlayerActionAt = now + Math.max(140, Math.floor(playerActionDelayMs * 0.55));
              return;
            }
          }

          let dx = 0;
          let dy = 0;
          let frame = null;
          const ctrlPressed = ctrlKey.isDown;

          if (cursors.left.isDown || keys.A.isDown) {
            dx = -1;
            frame = 3; // oeste
          } else if (cursors.right.isDown || keys.D.isDown) {
            dx = 1;
            frame = 1; // este
          } else if (cursors.up.isDown || keys.W.isDown) {
            dy = -1;
            frame = 2; // norte
          } else if (cursors.down.isDown || keys.S.isDown) {
            dy = 1;
            frame = 0; // sur
          }

          if (frame !== null) {
            player.setTexture(frameTextureName(configPlayer.sex, frame));
            playerFacingFrame = frame;
          }

          const handWeapon = getEquippedHandWeapon();
          const handIsDistance = isDistanceWeapon(handWeapon);
          if (dx === 0 && dy === 0) {
            if (handIsDistance && handWeapon) {
              const autoTarget = findNearestRangedTarget(effectiveWeaponRange(handWeapon));
              if (autoTarget) {
                performPlayerAttack(autoTarget, handWeapon, true, now);
              }
            }
            return;
          }
          if (ctrlPressed && (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown)) {
            return;
          }

          const targetGX = gridX + dx;
          const targetGY = gridY + dy;
          if (!isWalkable(targetGX, targetGY)) {
            return;
          }

          let targetCreature = creatureAt(targetGX, targetGY);
          if (!targetCreature && handIsDistance) {
            targetCreature = findRangedTargetInDirection(dx, dy, effectiveWeaponRange(handWeapon));
          }
          const usedRangedShot = Boolean(
            targetCreature
            && handIsDistance
            && (targetCreature.gx !== targetGX || targetCreature.gy !== targetGY)
          );
          if (targetCreature) {
            performPlayerAttack(targetCreature, handWeapon, usedRangedShot, now);
            return;
          }

          moving = true;
          gridX = targetGX;
          gridY = targetGY;
          this.tweens.add({
            targets: player,
            x: centerX(gridX),
            y: centerY(gridY),
            duration: playerMoveDurationMs,
            ease: 'Linear',
            onComplete: () => {
              // Asegura alineacion exacta al centro de la casilla.
              player.x = centerX(gridX);
              player.y = centerY(gridY);
              player.setOrigin(0.5, 0.5);
              pickupGroundLootAtPlayer();
              moving = false;
              if (hasStairsAtPlayer() && aliveCreatures().length === 0) {
                descendLevel();
              }
              updateHud();
            },
          });
          nextPlayerActionAt = now + Math.max(playerActionDelayMs, playerMoveDurationMs);
        });
      },
    },
  });
}

setupSelectorUI();

async function loadProgressionDatabase() {
  if (typeProgressionGroups.length > 0) return;
  typeProgressionGroups = await getCreatureTypeProgressionGroups();
  if (typeProgressionGroups.length === 0) {
    typeProgressionGroups = [{
      type_primary: 'Glires',
      average_experience: 5,
      creatures: [{ id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }],
    }];
  }
}
