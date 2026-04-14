import {
  getCreatureTypeProgressionGroups,
  getItemByArticleId,
  getItemShopCatalog,
  getCreatureDropTable,
  getSpellsCatalogWithPrices,
  getCreatureAbilitiesById,
  getCreatureDamageModifiersById,
} from '../../../dataService.js';
import {
  parseDamageRangeString,
  averageMagicWeaponHitPreview,
  progressionStatsForLevel,
} from '../../../mechanics/progression.js';
import { LootPityTracker } from '../../../mechanics/loot.js';
import { generateLevelMap as buildDungeonLevelMap, computeDungeonSize } from '../../../dungeon/generator.js';
import { wirePanelLayoutSync } from '../../../ui/panelLayout.js';
import { isBlockedSpellTitle } from '../../../spells/filters.js';
import { inferCreatureAbilityPattern } from '../../../creatures/abilityPatterns.js';
import {
  EARLY_LEVELS,
  FORCED_CREATURE_ID_BY_LEVEL,
  FORCED_CREATURE_IDS_BY_LEVEL,
  FORCED_CREATURE_TEMPLATE_BY_LEVEL,
  FORCED_CREATURE_TEMPLATES_BY_LEVEL,
  TROLL_ALLOWED_IDS,
  FLOOR_CREATURE_COUNTS,
} from '../../../data/floorSpawnConfig.js';
import {
  shakeCamera,
  flashCamera,
  radialSparkBurst,
  shockwaveRing,
  floatingCombatText,
  tileSpellBurst,
  spellAuraBurst,
  spellProjectileLine,
  rangedProjectileLine,
  missEffect,
  critBanner,
} from '../../../vfx.js';

let game;
let selectedSex = 'male';
let selectedClass = 'knight';
let playerConfig = null;
let typeProgressionGroups = [];
let creatureDropTable = new Map();
const lootPityTracker = new LootPityTracker();
let onConsumeFood = null;
let onUseLiquid = null;
let onUseTool = null;
let onPlayerLevelStatsUpdate = null;
let onPanelLog = null;
let lastLootRejectReason = '';
let spellsCatalog = [];
let itemsShopCatalog = [];
let creatureAbilitiesById = new Map();
let creatureDamageModifiersById = new Map();
let inventorySetEquippedSlotVisual = null;
let inventoryClearEquippedSlotVisual = null;
const CREATURE_DAMAGE_MULTIPLIER_BY_ID = new Map([
  [37051, 0.5],
]);

/** Per-spell VFX (shapes/timing modeled after tibia.fandom.com spell descriptions). Keys = spell.title.toLowerCase() */
const SPELL_FX_OVERRIDES = {
  // Beams (sequential tile flash along the line)
  'energy beam': { kind: 'beam', depth: 5, fx: { delayStep: 40, duration: 200, order: 'beam' } },
  'great energy beam': { kind: 'beam', depth: 8, fx: { delayStep: 36, duration: 210, order: 'beam' } },
  'great death beam': { kind: 'beam', depth: 8, color: 0x9d7dd9, fx: { delayStep: 34, duration: 220, order: 'beam', glyph: '✢' } },
  // Waves / cones in facing direction
  'practise fire wave': { kind: 'cone', depth: 2, fx: { duration: 220, delayStep: 25, order: 'beam' } },
  scorch: { kind: 'cone', depth: 2, fx: { duration: 230, delayStep: 28, order: 'beam' } },
  'chill out': { kind: 'cone', depth: 2, fx: { duration: 230, delayStep: 28, order: 'beam' } },
  'fire wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'ice wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'terra wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'energy wave': { kind: 'cone', depth: 3, fx: { duration: 280, delayStep: 32, order: 'beam' } },
  'great fire wave': { kind: 'cone', depth: 4, fx: { duration: 300, delayStep: 34, order: 'beam' } },
  'strong ice wave': { kind: 'cone', depth: 2, fx: { duration: 240, delayStep: 32, order: 'beam' } },
  // Knight cleaves
  'lesser front sweep': { kind: 'front_sweep', fx: { duration: 320, glyph: '✦' } },
  'front sweep': { kind: 'front_sweep', fx: { duration: 360, glyph: '✦' } },
  // Whirl hits around the caster
  berserk: { kind: 'nova', radius: 1, fx: { duration: 280, delayStep: 20, order: 'beam' } },
  groundshaker: { kind: 'nova', radius: 1, fx: { duration: 300, delayStep: 18, order: 'beam' } },
  'fierce berserk': { kind: 'nova', radius: 1, fx: { duration: 340, delayStep: 16, order: 'beam' } },
  // Large circular bursts (ultimate-style)
  thunderstorm: { kind: 'nova', radius: 2, fx: { duration: 320, delayStep: 12, order: 'beam' } },
  'stone shower': { kind: 'nova', radius: 2, fx: { duration: 340, delayStep: 14, order: 'beam' } },
  'divine caldera': { kind: 'nova', radius: 2, color: 0xfde68a, fx: { duration: 360, delayStep: 12, glyph: '✦', order: 'beam' } },
  'spiritual outburst': { kind: 'nova', radius: 2, fx: { duration: 380, delayStep: 10, order: 'beam' } },
  'rage of the skies': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  'hell\'s core': { kind: 'nova', radius: 3, fx: { duration: 420, delayStep: 10, order: 'beam' } },
  'wrath of nature': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  'eternal winter': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  // Ring bursts around caster (Ice/Terra Burst)
  'ice burst': { kind: 'ring', radius: 2, fx: { duration: 350, delayStep: 22, order: 'beam' } },
  'terra burst': { kind: 'ring', radius: 2, fx: { duration: 350, delayStep: 22, order: 'beam' } },
  // Cross-shaped explosion (rune-style)
  explosion: { kind: 'plus', reach: 2, fx: { duration: 300, delayStep: 35, order: 'beam' } },
  // Frontal boxes (monk / takedown style)
  'flurry of blows': { kind: 'front_box', width: 3, depth: 1, fx: { duration: 260, delayStep: 24, order: 'beam' } },
  'greater flurry of blows': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 300, delayStep: 22, order: 'beam' } },
  'sweeping takedown': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 320, delayStep: 20, order: 'beam' } },
  'balanced brawl': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 280, delayStep: 22, order: 'beam' } },
  // Single-target melee spells
  'double jab': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 220 } },
  'swift jab': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 220 } },
  'tiger clash': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 260 } },
  'greater tiger clash': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 280 } },
  'forceful uppercut': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 280 } },
  'mystic repulse': { kind: 'projectile', depth: 7 },
  'lesser mystic repulse': { kind: 'projectile', depth: 5 },
  'devastating knockout': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 300 } },
  // Strike/missile family (single square target / front square)
  'apprentice\'s strike': { kind: 'projectile', depth: 3 },
  buzz: { kind: 'projectile', depth: 3 },
  'mud attack': { kind: 'projectile', depth: 3 },
  'death strike': { kind: 'projectile', depth: 3 },
  'flame strike': { kind: 'projectile', depth: 3 },
  'energy strike': { kind: 'projectile', depth: 3 },
  'ice strike': { kind: 'projectile', depth: 3 },
  'terra strike': { kind: 'projectile', depth: 3 },
  'physical strike': { kind: 'projectile', depth: 3 },
  'strong flame strike': { kind: 'projectile', depth: 3 },
  'strong energy strike': { kind: 'projectile', depth: 3 },
  'strong ice strike': { kind: 'projectile', depth: 3 },
  'strong terra strike': { kind: 'projectile', depth: 3 },
  'ultimate flame strike': { kind: 'projectile', depth: 3 },
  'ultimate energy strike': { kind: 'projectile', depth: 3 },
  'ultimate ice strike': { kind: 'projectile', depth: 3 },
  'ultimate terra strike': { kind: 'projectile', depth: 3 },
  lightning: { kind: 'projectile', depth: 5 },
  'divine missile': { kind: 'projectile', depth: 4 },
  'ethereal spear': { kind: 'projectile', depth: 4 },
  'lesser ethereal spear': { kind: 'projectile', depth: 4 },
  'strong ethereal spear': { kind: 'projectile', depth: 5 },
  'whirlwind throw': { kind: 'projectile', depth: 4 },
  annihilation: { kind: 'front_box', width: 1, depth: 1, fx: { duration: 300 } },
};

const MAX_FOOD_SECONDS = 900;

const MAP_W = 20;
const MAP_H = 15;
// Dimensiones máximas posibles (50 criaturas → ~44x27). El grid de tiles se crea
// con este tamaño y la cámara se acota a las dimensiones reales de cada floor.
const MAX_DUNGEON_W = 60;
const MAX_DUNGEON_H = 40;
// Dimensiones del mapa actual (se actualizan en cada descendLevel).
let dungeonW = MAP_W;
let dungeonH = MAP_H;
const UI_BOTTOM_SPACE = 88;
const UI_OVERLAP_ROWS = 1.5;
const CREATURE_POOL_PER_LEVEL = 12;
const MIN_CREATURES_PER_LEVEL = 10;
const MAX_CREATURES_PER_LEVEL = 15;
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

/**
 * Todas las criaturas usan el mismo escalado cuadrado (como los Dwarf con fallback anterior).
 * Escalar por bbox opaco (fw×k, fh×k) desplazaba el dibujo respecto al ancla en GIF/Phaser.
 */
const CREATURE_FILL_TARGET = 0.96;

function applyCreatureNormalizedDisplaySize(sprite, scene, tileSize) {
  void scene;
  const fillPx = tileSize * CREATURE_FILL_TARGET;
  if (sprite) sprite.setDisplaySize(fillPx, fillPx);
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
  return lootPityTracker.roll(creatureDropTable, creatureId);
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
  let currentPlayerCapacity = progressionStatsForLevel(1, selectedClass).capacity;
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

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatItemTooltip(item) {
    if (!item) return '';
    const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
    const title = item.title || raw.title || 'Unknown Item';
    const cls = item.item_class || raw.item_class || 'Item';
    const type = item.item_type || raw.item_type || 'Unknown';
    const sellRaw = Number(raw.value_sell || 0);
    const buyRaw = Number(raw.value_buy || 0);
    const price = Math.max(0, sellRaw > 0 ? sellRaw : buyRaw);
    const weight = Number(raw.weight != null ? raw.weight : item.weight || 0);
    const safeTitle = escapeHtml(title);
    const safeCls = escapeHtml(cls);
    const safeType = escapeHtml(type);
    const safeWeight = Number.isFinite(weight) ? weight : 0;
    const isEquippable = Boolean(resolveEquipSlotForItem(item));
    const isSameItem = (a, b) => {
      if (!a || !b) return false;
      if (a.id != null && b.id != null) return Number(a.id) === Number(b.id);
      return String(a.title || '').trim().toLowerCase() === String(b.title || '').trim().toLowerCase();
    };
    const isCurrentlyEquipped = Object.values(equippedSlots || {}).some((eq) => isSameItem(eq, item));
    const primaryAction = isCurrentlyEquipped ? 'Unequip' : (isEquippable ? 'Equip' : 'Use');
    const attrs = Array.isArray(item.attributes) ? item.attributes : [];
    const attrNum = (name) => {
      const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === name);
      const n = Number(row && row.value);
      return Number.isFinite(n) ? n : null;
    };
    const attackStat = attrNum('attack');
    const defenseStat = attrNum('defense');
    const armorStat = attrNum('armor');
    const statLines = [];
    if (isEquippable) {
      if (attackStat != null) statLines.push(`<div><span class="tt-label">Attack:</span> ${attackStat}</div>`);
      if (defenseStat != null) statLines.push(`<div><span class="tt-label">Defense:</span> ${defenseStat}</div>`);
      if (armorStat != null) statLines.push(`<div><span class="tt-label">Armor:</span> ${armorStat}</div>`);
    }
    const typeLower = String(type || '').toLowerCase();
    if (typeLower === 'wands' || typeLower === 'rods') {
      const attrGet = (n) => {
        const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === String(n).toLowerCase());
        return row ? String(row.value || '').trim() : '';
      };
      const hud = (typeof window !== 'undefined' && window.__gameHud) ? window.__gameHud : { ml: 0, pl: 1 };
      const mlHud = Number(hud.ml) || 0;
      const plHud = Number(hud.pl) || 1;
      const rangeStr = attrGet('range');
      const dmgType = attrGet('damage_type');
      const dmgRange = attrGet('damage_range');
      const manaCost = attrGet('mana_cost');
      const levelReq = attrGet('level');
      const vocation = attrGet('vocation');
      const hands = attrGet('hands');
      const magicBonus = attrGet('magic');
      const previewAvg = averageMagicWeaponHitPreview(dmgRange, mlHud, plHud);
      statLines.push('<div class="tt-sep"></div>');
      statLines.push('<div><span class="tt-label">Magic weapon</span></div>');
      if (rangeStr) statLines.push(`<div><span class="tt-label">Range:</span> ${escapeHtml(rangeStr)} tiles</div>`);
      if (dmgType) statLines.push(`<div><span class="tt-label">Damage type:</span> ${escapeHtml(dmgType)}</div>`);
      if (dmgRange) statLines.push(`<div><span class="tt-label">Damage (data):</span> ${escapeHtml(dmgRange)}</div>`);
      if (previewAvg != null) {
        statLines.push(
          `<div><span class="tt-label">Est. hit (avg, ML ${mlHud}):</span> ~${previewAvg}</div>`
        );
      }
      if (manaCost) statLines.push(`<div><span class="tt-label">Mana / shot:</span> ${escapeHtml(manaCost)}</div>`);
      if (levelReq) statLines.push(`<div><span class="tt-label">Required level:</span> ${escapeHtml(levelReq)}</div>`);
      if (vocation) statLines.push(`<div><span class="tt-label">Vocation:</span> ${escapeHtml(vocation)}</div>`);
      if (hands) statLines.push(`<div><span class="tt-label">Hands:</span> ${escapeHtml(hands)}</div>`);
      if (magicBonus) statLines.push(`<div><span class="tt-label">Magic:</span> ${escapeHtml(magicBonus)}</div>`);
      const skipNames = new Set(['is_walkable', 'upgrade_classification', 'weapon_type', 'range', 'damage_type', 'damage_range', 'mana_cost', 'level', 'vocation', 'hands', 'magic']);
      const extra = attrs.filter((a) => a && a.name && !skipNames.has(String(a.name).toLowerCase()));
      const showExtra = extra.slice(0, 10);
      if (showExtra.length > 0) {
        statLines.push('<div class="tt-space"></div>');
        statLines.push('<div><span class="tt-label">Other</span></div>');
        for (const a of showExtra) {
          const vn = escapeHtml(String(a.name || ''));
          const vv = escapeHtml(String(a.value != null ? a.value : ''));
          statLines.push(`<div><span class="tt-label">${vn}:</span> ${vv}</div>`);
        }
      }
    }
    return [
      `<div class="tt-title">${safeTitle}</div>`,
      '<div class="tt-sep"></div>',
      `<div><span class="tt-label">Name:</span> ${safeTitle}</div>`,
      `<div><span class="tt-label">Type:</span> ${safeCls} • ${safeType}</div>`,
      `<div><span class="tt-label">Price:</span> ${price} gp</div>`,
      `<div><span class="tt-label">Weight:</span> ${safeWeight}</div>`,
      ...statLines,
      '<div class="tt-space"></div>',
      `<div class="tt-actions"><span class="tt-label">${primaryAction} / Sell</span></div>`,
      `<div>- Left click: ${primaryAction}</div>`,
      '<div>- Right click: Sell</div>',
    ].join('');
  }

  function bindTooltip(el, item) {
    if (!el || !itemTooltip || !item) return;
    const text = formatItemTooltip(item);
    if (!text) return;
    const placeNearElement = () => {
      const rect = el.getBoundingClientRect();
      const tipW = Math.max(220, itemTooltip.offsetWidth || 220);
      const tipH = Math.max(120, itemTooltip.offsetHeight || 120);
      let x = rect.right + 8;
      let y = rect.top + 2;
      if (x + tipW > window.innerWidth - 6) x = rect.left - tipW - 14;
      if (y + tipH > window.innerHeight - 6) y = rect.top - tipH - 10;
      itemTooltip.style.left = `${Math.max(6, Math.floor(x))}px`;
      itemTooltip.style.top = `${Math.max(6, Math.floor(y))}px`;
    };
    const show = (ev) => {
      itemTooltip.innerHTML = text;
      itemTooltip.style.display = 'block';
      placeNearElement();
    };
    const move = (ev) => {
      void ev;
      placeNearElement();
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
    if (slotKey === 'hand') {
      const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
      const isTwoHanded = attrs.some((a) => (
        a
        && String(a.name || '').toLowerCase() === 'hands'
        && String(a.value || '').toLowerCase() === 'two'
      ));
      if (isTwoHanded && equippedSlots.shield) {
        const shieldToBag = { ...equippedSlots.shield };
        const storedShield = addLootItemToBag(shieldToBag, { disableAutoEquip: true });
        if (!storedShield) {
          equipmentFoot.textContent = 'Cannot equip two-handed weapon: no space/capacity to move shield to loot.';
          return false;
        }
        clearEquippedSlotVisual('shield');
      }
    }
    if (slotKey === 'shield') {
      const hand = equippedSlots.hand;
      const handAttrs = Array.isArray(hand && hand.attributes) ? hand.attributes : [];
      const handIsTwoHanded = handAttrs.some((a) => (
        a
        && String(a.name || '').toLowerCase() === 'hands'
        && String(a.value || '').toLowerCase() === 'two'
      ));
      if (handIsTwoHanded && hand) {
        const handToBag = { ...hand };
        const storedHand = addLootItemToBag(handToBag, { disableAutoEquip: true });
        if (!storedHand) {
          equipmentFoot.textContent = 'Cannot equip shield: no space/capacity to move two-handed weapon to loot.';
          return false;
        }
        clearEquippedSlotVisual('hand');
      }
    }
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
  // Expose equip visual mutators to combat/runtime code outside setupSelectorUI scope.
  inventorySetEquippedSlotVisual = setEquippedSlotVisual;
  inventoryClearEquippedSlotVisual = clearEquippedSlotVisual;

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
    // Only auto-equip looted weapons when hand slot is empty.
    if (equippedSlots.hand) return false;
    const nextAttack = Number(item.attack_value || 0);
    if (!Number.isFinite(nextAttack) || nextAttack <= 0) return false;
    return setEquippedSlotVisual(
      'hand',
      item,
      `Auto-equipped ${item.title} (hand was empty).`
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
        cell.addEventListener('mousedown', async (ev) => {
          if (ev.button !== 0) return; // left click only
          const idx = i - 1;
          const current = bagLootItems[idx];
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

          const itemTypeLower = String((current && current.item_type) || '').toLowerCase();
          if (itemTypeLower === 'containers') {
            const bagArticleId = Number(
              (current && current.id)
              || (current && current.article_id)
              || (current && current.raw && current.raw.article_id)
            );
            if (!Number.isFinite(bagArticleId) || bagArticleId <= 0) return;
            const equippedBagCopy = currentBagItem ? { ...currentBagItem } : null;
            const equippedOk = await equipBagByArticleId(bagArticleId);
            if (!equippedOk) return;
            if (equippedBagCopy) {
              bagLootItems[idx] = equippedBagCopy;
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
    if (!bagImg || !bagIcon || !bagLabel || !equipmentFoot || !bagRoot) return false;
    try {
      let bag = await getItemByArticleId(articleId);
      if (!bag) {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
        bagLabel.textContent = 'Empty';
        equipmentFoot.textContent = 'No item equipped';
        currentBagCapacity = 0;
        currentBagItem = null;
        bagLootItems = [];
        renderLootSlots(0);
        return false;
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
        return false;
      }
      const typeSecondary = String((bag && bag.type_secondary) || '').toLowerCase();
      if (typeSecondary === 'backpacks') {
        const equippedImage = bag.image;
        const equippedTitle = bag.title;
        const equippedName = bag.name;
        const equippedActualName = bag.actual_name;
        const canonicalBag = await getItemByArticleId(1589);
        bag = {
          ...(canonicalBag || bag),
          article_id: Number((bag && bag.article_id) || articleId),
          title: equippedTitle || (canonicalBag && canonicalBag.title) || 'Bag',
          name: equippedName || (canonicalBag && canonicalBag.name) || 'Bag',
          actual_name: equippedActualName || (canonicalBag && canonicalBag.actual_name) || 'bag',
          item_type: 'Containers',
          image: equippedImage || ((canonicalBag && canonicalBag.image) || null),
          weight: 20,
        };
      }
      const normalizedArticleId = Number((bag && bag.article_id) || articleId);
      bag = {
        ...bag,
        id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
        article_id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
        raw: {
          ...((bag && bag.raw && typeof bag.raw === 'object') ? bag.raw : {}),
          article_id: Number.isFinite(normalizedArticleId) ? normalizedArticleId : null,
          weight: Number(bag && bag.weight),
        },
      };
      if (bag.image) {
        bagImg.src = `./data/images/${bag.image}`;
        bagImg.style.display = 'block';
        bagIcon.textContent = '';
      } else {
        bagImg.style.display = 'none';
        bagIcon.textContent = 'BAG';
      }
      const nextCapacity = Math.max(0, Math.floor(Number(bag.weight) || 0));
      if (bagLootItems.length > nextCapacity) {
        equipmentFoot.textContent = `Cannot equip ${bag.title}: requires ${nextCapacity} slots, carrying ${bagLootItems.length}.`;
        return false;
      }
      currentBagCapacity = nextCapacity;
      currentBagItem = bag;
      bagLabel.textContent = bag.title;
      bindTooltip(bagRoot, bag);
      equipmentFoot.textContent = `Equipped: ${bag.title}`;
      renderLootSlots(currentBagCapacity);
      return true;
    } catch (_err) {
      bagImg.style.display = 'none';
      bagIcon.textContent = 'BAG';
      bagLabel.textContent = 'Empty';
      equipmentFoot.textContent = 'No item equipped';
      currentBagCapacity = 0;
      currentBagItem = null;
      bagLootItems = [];
      renderLootSlots(0);
      return false;
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

  window._resetInventoryForNewRun = () => {
    bagLootItems = [];
    for (const slotKey of Object.keys(equippedSlots)) {
      equippedSlots[slotKey] = null;
      clearEquippedSlotVisual(slotKey);
    }
    currentBagCapacity = 0;
    currentBagItem = null;
    lastLootRejectReason = '';
    renderLootSlots(0);
    startBtn.disabled = false;
    _starting = false;
  };

  let _starting = false;
  startBtn.addEventListener('click', async () => {
    if (_starting) return;
    _starting = true;
    startBtn.disabled = true;
    const playerName = (playerNameInput.value || '').trim() || 'Adventurer';
    currentPlayerCapacity = progressionStatsForLevel(1, selectedClass).capacity;
    playerConfig = { name: playerName, sex: selectedSex, classKey: selectedClass };

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0, 'Loading creature data...');

    let jsonsDone = 0;
    const JSON_TASKS = 8;
    const jsonLabels = [
      'Loading creature data...', 'Preparing inventory...', 'Loading loot tables...',
      'Loading abilities...', 'Loading damage data...', 'Loading currencies...',
      'Loading spells...', 'Loading items...',
    ];
    const onJsonDone = () => {
      jsonsDone += 1;
      setLoadingProgress(
        Math.round((jsonsDone / JSON_TASKS) * 45),
        jsonLabels[jsonsDone] || 'Finalizing data...',
      );
    };

    await Promise.all([
      loadProgressionDatabase().then(onJsonDone),
      equipBagByArticleId(START_BAG_ARTICLE_ID).then(onJsonDone),
      (async () => { creatureDropTable = await getCreatureDropTable(); })().then(onJsonDone),
      (async () => { creatureAbilitiesById = await getCreatureAbilitiesById(); })().then(onJsonDone),
      (async () => { creatureDamageModifiersById = await getCreatureDamageModifiersById(); })().then(onJsonDone),
      ensureCoinTemplatesLoaded().then(onJsonDone),
      (async () => { spellsCatalog = await getSpellsCatalogWithPrices(); })().then(onJsonDone),
      (async () => { itemsShopCatalog = await getItemShopCatalog(); })().then(onJsonDone),
    ]);

    setLoadingProgress(45, 'Starting game engine...');
    addCoinsToInventory(0);
    document.getElementById('startOverlay').style.display = 'none';
    startGame(playerConfig);
    // _starting stays true — the game is now running, no more starts needed
  });

  // Un único listener de Enter para el input (el document listener era redundante y causaba doble disparo)
  playerNameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (!startBtn.disabled && !_starting) startBtn.click();
    }
  });
}

function isWalkableTile(gx, gy) {
  return gx >= 0 && gx < dungeonW && gy >= 0 && gy < dungeonH;
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
        // Registrar progress ANTES de encolar imágenes para que Phaser lo capture desde el inicio
        setLoadingProgress(45, 'Loading creatures...');
        this.load.on('progress', (value) => {
          setLoadingProgress(45 + Math.floor(value * 50), 'Loading creatures...');
        });

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
        setLoadingProgress(100, 'Ready!');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
          loadingOverlay.style.transition = 'opacity 0.4s ease';
          loadingOverlay.style.opacity = '0';
          setTimeout(() => { loadingOverlay.style.display = 'none'; loadingOverlay.style.opacity = '1'; }, 420);
        }

        const mapTiles = [];
        for (let y = 0; y < MAX_DUNGEON_H; y += 1) {
          mapTiles[y] = [];
          for (let x = 0; x < MAX_DUNGEON_W; x += 1) {
            const rect = this.add.rectangle(
              x * tileSize + tileSize / 2,
              y * tileSize + tileSize / 2,
              tileSize - 1,
              tileSize - 1,
              0x080e18
            );
            rect.setDepth(0);
            mapTiles[y][x] = rect;
          }
        }

        const player = this.add.sprite(tileSize * 1.5, tileSize * 1.5, frameTextureName(configPlayer.sex, 0));
        // Centrado visual y tamano menor a 1 tile para evitar solapes entre casillas vecinas.
        player.setOrigin(0.5, 0.5);
        player.setDisplaySize(tileSize * 0.9, tileSize * 0.9);
        player.setDepth(25);
        const deathCaption = this.add.text(player.x, player.y + tileSize * 0.72, 'You are dead.', {
          color: '#ffffff',
          fontSize: '12px',
          fontStyle: 'bold',
        });
        deathCaption.setOrigin(0.5, 0.5);
        deathCaption.setVisible(false);
        deathCaption.setDepth(30);
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
          const r = Number.isFinite(ratio) ? ratio : 0;
          const clamped = Phaser.Math.Clamp(r, 0, 1);
          bar.fill.width = Math.max(0, bar.width * clamped);
        };
        const playerBar = makeHealthBar(0x22c55e);
        const playerManaBar = makeHealthBar(0x3b82f6);
        const playerNameTag = makeNameLabel(configPlayer.name, '#e5e7eb');
        playerBar.bg.setDepth(26);
        playerBar.fill.setDepth(27);
        playerManaBar.bg.setDepth(28);
        playerManaBar.fill.setDepth(29);
        playerNameTag.setDepth(31);

        const nameLabel = this.add.text(12, 10, `${configPlayer.name} | Player Lv 1`, {
          color: '#e5e7eb',
          fontSize: '16px',
          fontStyle: 'bold',
        });
        nameLabel.setScrollFactor(0);
        nameLabel.setDepth(510);
        nameLabel.setStroke('#020617', 4);

        const combatHud = this.add.text(this.scale.width - 12, 10, '', {
          color: '#fca5a5',
          fontSize: '13px',
          fontStyle: 'bold',
        });
        combatHud.setOrigin(1, 0);
        combatHud.setScrollFactor(0);
        combatHud.setDepth(510);
        combatHud.setStroke('#1e1b4b', 3);
        const levelHud = this.add.text(this.scale.width / 2, 10, '', {
          color: '#93c5fd',
          fontSize: '13px',
          fontStyle: 'bold',
        });
        levelHud.setOrigin(0.5, 0);
        levelHud.setScrollFactor(0);
        levelHud.setDepth(510);
        levelHud.setStroke('#0c4a6e', 3);

        const uiBaseY = mapHeight - (tileSize * UI_OVERLAP_ROWS);
        const logPanel = this.add.rectangle(
          this.scale.width / 2,
          uiBaseY + 52,
          this.scale.width - 16,
          58,
          0x070d18,
          0.82
        );
        logPanel.setStrokeStyle(1, 0x38bdf8, 0.35);
        logPanel.setScrollFactor(0);
        logPanel.setDepth(500);
        const levelProgressBg = this.add.rectangle(
          this.scale.width / 2,
          uiBaseY + 21,
          this.scale.width - 16,
          11,
          0x0c1526,
          0.96
        );
        levelProgressBg.setStrokeStyle(1, 0x475569, 0.85);
        levelProgressBg.setScrollFactor(0);
        levelProgressBg.setDepth(500);
        const levelProgressFill = this.add.rectangle(
          8,
          uiBaseY + 21,
          this.scale.width - 18,
          8,
          0xfbbf24,
          1
        );
        levelProgressFill.setOrigin(0, 0.5);
        levelProgressFill.setScrollFactor(0);
        levelProgressFill.setDepth(501);
        levelProgressFill.setStrokeStyle(1, 0xfde68a, 0.5);
        const levelProgressText = this.add.text(this.scale.width / 2, uiBaseY + 21, '', {
          color: '#f8fafc',
          fontSize: '11px',
          fontStyle: 'bold',
        });
        levelProgressText.setOrigin(0.5, 0.5);
        levelProgressText.setStroke('#0b1220', 3);
        levelProgressText.setScrollFactor(0);
        levelProgressText.setDepth(502);
        const LOG_COLORS = {
          DEFAULT: '#e8f0ff',
          HIT: '#cbd5e1',
          CRIT: '#fde047',
          SPELL: '#7dd3fc',
        };
        const combatLogRows = [0, 1, 2].map((idx) => {
          const row = this.add.text(14, uiBaseY + 32 + idx * 14, '', {
            color: LOG_COLORS.DEFAULT,
            fontSize: '12px',
            fontStyle: 'bold',
            wordWrap: { width: this.scale.width - 28 },
          });
          row.setScrollFactor(0);
          row.setDepth(503);
          row.setStroke('#020617', 3);
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
          tileSize - 4,
          tileSize - 4,
          0x1e3a5f
        );
        stairRect.setStrokeStyle(2, 0x38bdf8, 0.95);
        stairRect.setDepth(4);
        const stairText = this.add.text(0, 0, '⇵', {
          color: '#7dd3fc',
          fontSize: '16px',
          fontStyle: 'bold',
        });
        stairText.setOrigin(0.5, 0.5);
        stairText.setDepth(5);
        stairText.setStroke('#0c4a6e', 4);
        const ropeHintRect = this.add.rectangle(
          0,
          0,
          tileSize - 10,
          tileSize - 10,
          0x166534,
          0.22
        );
        ropeHintRect.setStrokeStyle(1, 0x86efac, 0.95);
        ropeHintRect.setDepth(6);
        const ropeHintText = this.add.text(0, 0, 'R', {
          color: '#bbf7d0',
          fontSize: '12px',
          fontStyle: 'bold',
        });
        ropeHintText.setOrigin(0.5, 0.5);
        ropeHintText.setDepth(7);
        ropeHintText.setStroke('#14532d', 3);
        stairRect.setVisible(false);
        stairText.setVisible(false);
        ropeHintRect.setVisible(false);
        ropeHintText.setVisible(false);

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
        const isTypingInInput = () => {
          const el = document.activeElement;
          if (!el) return false;
          const tag = String(el.tagName || '').toLowerCase();
          if (tag === 'textarea') return true;
          if (tag === 'input') {
            const input = /** @type {HTMLInputElement} */ (el);
            const type = String(input.type || 'text').toLowerCase();
            return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
          }
          return Boolean(el.isContentEditable);
        };
        const syncGameKeyboardEnabled = () => {
          if (!this.input || !this.input.keyboard) return;
          const typing = isTypingInInput();
          this.input.keyboard.enabled = !typing;
          // Phaser can still capture movement keys even when typing.
          // Remove captures while an input has focus so WASD writes normally.
          if (typing) {
            this.input.keyboard.removeCapture([
              Phaser.Input.Keyboard.KeyCodes.W,
              Phaser.Input.Keyboard.KeyCodes.A,
              Phaser.Input.Keyboard.KeyCodes.S,
              Phaser.Input.Keyboard.KeyCodes.D,
              Phaser.Input.Keyboard.KeyCodes.UP,
              Phaser.Input.Keyboard.KeyCodes.DOWN,
              Phaser.Input.Keyboard.KeyCodes.LEFT,
              Phaser.Input.Keyboard.KeyCodes.RIGHT,
            ]);
          } else {
            this.input.keyboard.addCapture([
              Phaser.Input.Keyboard.KeyCodes.W,
              Phaser.Input.Keyboard.KeyCodes.A,
              Phaser.Input.Keyboard.KeyCodes.S,
              Phaser.Input.Keyboard.KeyCodes.D,
              Phaser.Input.Keyboard.KeyCodes.UP,
              Phaser.Input.Keyboard.KeyCodes.DOWN,
              Phaser.Input.Keyboard.KeyCodes.LEFT,
              Phaser.Input.Keyboard.KeyCodes.RIGHT,
            ]);
          }
        };
        document.addEventListener('focusin', syncGameKeyboardEnabled, true);
        document.addEventListener('focusout', () => {
          this.time.delayedCall(0, syncGameKeyboardEnabled);
        }, true);
        syncGameKeyboardEnabled();
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
        let playerMagicLevel = Math.max(0, Number(lvl1Stats.magicLevel || 0));
        const weaponSkillLevelByType = new Map();
        const weaponSkillUsesByType = new Map();
        let playerFistLevel = 10;
        let playerFistUses = 0;
        let playerShieldingLevel = 10;
        let playerShieldingUses = 0;
        let playerXp = 0;
        const learnedSpellIds = new Set();
        const learnedSpellSlots = Array.from({ length: 9 }, () => null);
        const spellCooldownUntil = new Map();
        let gameOver = false;
        let playerDead = false;
        let runKills = 0;
        let godModeEnabled = false;
        let currentLevel = 1;
        let currentLevelGroup = null;
        const recentGroupIndices = [];
        const runStartBias = Phaser.Math.Between(0, 8);
        const runSpreadBias = Phaser.Math.Between(0, 4);
        const runVariantBias = Phaser.Math.Between(0, 1000000);
        let earlyShufflePool = [];
        let earlyShuffleCursor = 0;
        const recentEarlyCreatureIds = [];
        let currentMap = [];
        let currentFloors = [];
        let currentStairsTile = { gx: MAP_W - 2, gy: MAP_H - 2 };
        let creaturesTargetCount = 0;
        const centerX = (gx) => gx * tileSize + tileSize / 2;
        const centerY = (gy) => gy * tileSize + tileSize / 2;
        const xpToNextLevel = (level) => 50 + (level - 1) * 40;
        const weaponUsesToNextLevel = (skillLevel) => {
          const dl = Math.max(10, Math.floor(Number(skillLevel) || 10));
          // Much faster skill progression requested by user.
          return Math.max(6, Math.floor(4 + dl * 0.75));
        };
        const showSkillLevelUpText = (label, level) => {
          const txt = this.add.text(this.scale.width / 2, 88, `${label} +1 (Lv ${level})`, {
            color: '#bbf7d0',
            fontSize: '22px',
            fontStyle: 'bold',
            fontFamily: 'Segoe UI, system-ui, sans-serif',
          });
          txt.setOrigin(0.5, 0.5);
          txt.setScrollFactor(0);
          txt.setDepth(620);
          txt.setStroke('#052e16', 5);
          txt.setShadow(0, 0, '#34d399', 14, true, true);
          const glow = this.add.circle(this.scale.width / 2, 88, 40, 0x34d399, 0.18);
          glow.setScrollFactor(0);
          glow.setDepth(619);
          this.tweens.add({
            targets: glow,
            alpha: 0,
            scaleX: 2.1,
            scaleY: 2.1,
            duration: 520,
            ease: 'Sine.easeOut',
            onComplete: () => glow.destroy(),
          });
          radialSparkBurst(this, this.scale.width / 2, 88, 0x34d399, 12);
          this.tweens.add({
            targets: txt,
            y: txt.y - 16,
            alpha: 0,
            duration: 760,
            ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const weaponSkillTypeKey = (item) => {
          if (!item) return null;
          if (String(item.item_class || '').toLowerCase() !== 'weapons') return null;
          const rawType = String(item.item_type || '').trim().toLowerCase();
          return rawType || 'weapons';
        };
        const weaponSkillLabel = (typeKey) => {
          const raw = String(typeKey || 'weapons')
            .replace(/\s+/g, ' ')
            .trim();
          return raw
            .split(' ')
            .map((p) => (p ? (p.charAt(0).toUpperCase() + p.slice(1)) : p))
            .join(' ');
        };
        const getWeaponSkillLevelByType = (typeKey) => {
          const key = String(typeKey || '').toLowerCase();
          if (!key) return 10;
          if (!weaponSkillLevelByType.has(key)) weaponSkillLevelByType.set(key, 10);
          return Math.max(10, Number(weaponSkillLevelByType.get(key) || 10));
        };
        const getWeaponSkillUsesByType = (typeKey) => {
          const key = String(typeKey || '').toLowerCase();
          if (!key) return 0;
          if (!weaponSkillUsesByType.has(key)) weaponSkillUsesByType.set(key, 0);
          return Math.max(0, Number(weaponSkillUsesByType.get(key) || 0));
        };
        const gainWeaponSkillUse = (item, amount = 1) => {
          const typeKey = weaponSkillTypeKey(item);
          if (!typeKey) return;
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          let level = getWeaponSkillLevelByType(typeKey);
          let uses = getWeaponSkillUsesByType(typeKey) + add;
          let leveled = false;
          while (uses >= weaponUsesToNextLevel(level)) {
            uses -= weaponUsesToNextLevel(level);
            level += 1;
            leveled = true;
          }
          weaponSkillUsesByType.set(typeKey, uses);
          weaponSkillLevelByType.set(typeKey, level);
          if (leveled) {
            addCombatLog(`${weaponSkillLabel(typeKey)} fighting advanced to ${level}.`);
            showSkillLevelUpText(`${weaponSkillLabel(typeKey)} Fighting`, level);
          }
        };
        const gainFistSkillUse = (amount = 1) => {
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          playerFistUses += add;
          let leveled = false;
          while (playerFistUses >= weaponUsesToNextLevel(playerFistLevel)) {
            playerFistUses -= weaponUsesToNextLevel(playerFistLevel);
            playerFistLevel += 1;
            leveled = true;
          }
          if (leveled) {
            addCombatLog(`Fist Fighting advanced to ${playerFistLevel}.`);
            showSkillLevelUpText('Fist Fighting', playerFistLevel);
          }
        };
        const gainShieldingSkillUse = (amount = 1) => {
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          playerShieldingUses += add;
          let leveled = false;
          while (playerShieldingUses >= weaponUsesToNextLevel(playerShieldingLevel)) {
            playerShieldingUses -= weaponUsesToNextLevel(playerShieldingLevel);
            playerShieldingLevel += 1;
            leveled = true;
          }
          if (leveled) {
            addCombatLog(`Shielding advanced to ${playerShieldingLevel}.`);
            showSkillLevelUpText('Shielding', playerShieldingLevel);
          }
        };
        const updatePlayerTimingsByLevel = () => {
          // Progresion gradual por nivel del personaje (arranque mas lento).
          playerMoveDurationMs = Phaser.Math.Clamp(190 - (playerLevel - 1) * 2, 130, 190);
          playerActionDelayMs = Phaser.Math.Clamp(320 - (playerLevel - 1) * 5, 220, 320);
        };
        const showLevelUpText = () => {
          flashCamera(this, 140, 255, 230, 140);
          shakeCamera(this, 160, 0.012);
          const cx = this.scale.width / 2;
          const cy = this.scale.height / 2;
          const glow = this.add.circle(cx, cy, 80, 0xfbbf24, 0.12);
          glow.setScrollFactor(0);
          glow.setDepth(600);
          this.tweens.add({
            targets: glow,
            alpha: 0,
            scaleX: 2.2,
            scaleY: 2.2,
            duration: 700,
            ease: 'Sine.easeOut',
            onComplete: () => glow.destroy(),
          });
          const txt = this.add.text(cx, cy, 'LEVEL UP!', {
            color: '#fffbeb',
            fontSize: '58px',
            fontStyle: 'bold',
            fontFamily: 'Segoe UI Black, Segoe UI, system-ui, sans-serif',
          });
          txt.setOrigin(0.5, 0.5);
          txt.setStroke('#78350f', 10);
          txt.setShadow(0, 0, '#fbbf24', 28, true, true);
          txt.setScrollFactor(0);
          txt.setDepth(601);
          this.tweens.add({
            targets: txt,
            y: txt.y - 36,
            alpha: 0,
            scaleX: 1.12,
            scaleY: 1.12,
            duration: 1000,
            ease: 'Cubic.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const grantPlayerXp = (amount) => {
          const raw = Number(amount);
          const add = Number.isFinite(raw) ? Math.max(0, raw) : 0;
          playerXp = (Number.isFinite(playerXp) ? playerXp : 0) + add;
          let leveled = false;
          while (playerXp >= xpToNextLevel(playerLevel)) {
            playerXp -= xpToNextLevel(playerLevel);
            playerLevel += 1;
            const nextStats = progressionStatsForLevel(playerLevel, playerClassKey);
            playerMaxHp = nextStats.maxHp;
            playerMaxMana = nextStats.maxMana;
            playerMagicLevel = Math.max(0, Number(nextStats.magicLevel || playerMagicLevel || 0));
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
          if (Number.isFinite(xp) && xp > 0) return Math.max(1, Math.floor(xp));
          // Fallback: monsters with 0 XP grant scaling XP based on player level.
          const lv = Number.isFinite(playerLevel) ? playerLevel : 1;
          return Math.max(1, Math.floor((5 + (lv * 3)) * 2));
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
        /** Casillas a distancia 1 en 8 direcciones (incluye diagonal) para melé criatura → jugador. */
        const isCreatureMeleeAdjacent = (ax, ay, bx, by) => (
          Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1
        );
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
          shockwaveRing(this, player.x, player.y, 0x4ade80, { startR: 8, endScale: 2.1, duration: 280 });
          radialSparkBurst(this, player.x, player.y - 2, 0x86efac, 16);
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
          for (let i = 0; i < 7; i += 1) {
            const spark = this.add.circle(
              player.x + Phaser.Math.Between(-10, 10),
              player.y - tileSize * 0.55 + Phaser.Math.Between(-8, 8),
              Phaser.Math.Between(2, 5),
              0xa7f3d0,
              0.92
            );
            spark.setDepth(120);
            this.tweens.add({
              targets: spark,
              y: spark.y - Phaser.Math.Between(16, 28),
              alpha: 0,
              duration: 420,
              ease: 'Cubic.easeOut',
              onComplete: () => spark.destroy(),
            });
          }
          const txt = this.add.text(player.x, player.y - tileSize * 0.95, `EAT ${label || ''}`.trim(), {
            color: '#bbf7d0',
            fontSize: '14px',
            fontStyle: 'bold',
          });
          txt.setOrigin(0.5, 0.5);
          txt.setDepth(121);
          txt.setStroke('#14532d', 3);
          this.tweens.add({
            targets: txt,
            y: txt.y - 18,
            alpha: 0,
            duration: 560,
            ease: 'Sine.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const showDrinkEffect = (label, color = '#7dd3fc') => {
          if (playerDead || gameOver) return;
          shockwaveRing(this, player.x, player.y, 0x38bdf8, { startR: 6, endScale: 2.4, duration: 300 });
          radialSparkBurst(this, player.x, player.y, 0x7dd3fc, 12);
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
            fontSize: '14px',
            fontStyle: 'bold',
          });
          txt.setOrigin(0.5, 0.5);
          txt.setDepth(121);
          txt.setStroke('#0c4a6e', 3);
          this.tweens.add({
            targets: txt,
            y: txt.y - 18,
            alpha: 0,
            duration: 580,
            ease: 'Sine.easeOut',
            onComplete: () => txt.destroy(),
          });
        };
        const showFullFoodEffect = () => {
          if (playerDead || gameOver) return;
          flashCamera(this, 80, 255, 200, 80);
          shakeCamera(this, 70, 0.008);
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
            color: '#fde047',
            fontSize: '16px',
            fontStyle: 'bold',
          });
          full.setOrigin(0.5, 0.5);
          full.setDepth(121);
          full.setStroke('#713f12', 4);
          full.setShadow(0, 0, '#fbbf24', 12, true, true);
          this.tweens.add({
            targets: full,
            y: full.y - 22,
            alpha: 0,
            duration: 680,
            ease: 'Cubic.easeOut',
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
        const tryClimbUpFloor = (sourceName = 'rope') => {
          if (!hasRopeUpAtPlayer()) {
            addCombatLog('Use it on the entry tile (where you appear on this floor).');
            return true;
          }
          if (currentLevel <= 1) {
            addCombatLog('You are already on floor 1.');
            return true;
          }
          currentLevel = Math.max(1, currentLevel - 1);
          descendLevel(false);
          addCombatLog(`You climbed to floor ${currentLevel} using ${sourceName}.`);
          updateHud();
          return true;
        };
        onUseTool = (item) => {
          if (!item || playerDead || gameOver) return false;
          if (Number(item.id) !== 2253) return false;
          return tryClimbUpFloor(item.title || 'item 2253');
        };
        const updateCreatureBar = (creature) => {
          if (!creature.hpBar) return;
          placeHealthBar(creature.hpBar, creature.sprite.x, creature.sprite.y - tileSize * 0.62);
          if (creature.nameTag) {
            creature.nameTag.setPosition(creature.sprite.x, creature.sprite.y - tileSize * 0.8);
          }
          const ratio = creature.maxHp > 0 ? creature.hp / creature.maxHp : 0;
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
          const forcedTypeByLevel = {
            4: 'trolls',
            5: 'skeletons',
            6: 'humans',
            7: 'dwarves',
            8: 'minotaurs',
            9: 'vampires',
            10: 'outlaws',
            11: 'goblins',
            12: 'dwarves',
            13: 'minotaurs',
            14: 'vampires',
            15: 'arachnids',
            16: 'dragons',
            17: 'orcs',
            18: 'cobra',
            19: 'giants',
            20: 'demons',
          };
          const forcedType = forcedTypeByLevel[Number(level)];
          if (forcedType) {
            const forcedIdx = typeProgressionGroups.findIndex(
              (g) => String((g && g.type_primary) || '').toLowerCase().includes(forcedType)
            );
            if (forcedIdx >= 0) {
              recentGroupIndices.push(forcedIdx);
              if (recentGroupIndices.length > 5) recentGroupIndices.shift();
              return typeProgressionGroups[forcedIdx];
            }
          }
          const n = typeProgressionGroups.length;
          const recentSet = new Set(recentGroupIndices);

          // Early-game rework:
          // - Build a per-run shuffled pool from easier groups.
          // - Iterate without immediate repeats, giving real variation between runs.
          const earlyLevels = 14;
          if (level <= earlyLevels) {
            // Inicio mucho mas facil:
            // una fraccion muy pequena de grupos de menor experiencia,
            // abriendo lentamente con el nivel.
            const phase = (level - 1) / Math.max(1, earlyLevels - 1); // 0..1
            const easyPct = 0.08 + phase * 0.24; // lvl1~8% -> lvl14~32%
            const easyMax = Math.max(2, Math.min(n - 1, Math.floor(n * easyPct)));
            // Excluir criaturas con muchos HP al principio.
            // Usamos percentil de average_hitpoints para filtrar grupos tanque.
            const hpValues = typeProgressionGroups
              .map((g) => Number(g.average_hitpoints || 0))
              .filter((v) => Number.isFinite(v) && v > 0)
              .sort((a, b) => a - b);
            const hpPct = 0.10 + phase * 0.24; // lvl1~10% -> lvl14~34%
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
        const hasRopeUpAtPlayer = () => gridX === START_TILE.gx && gridY === START_TILE.gy;
        const generateLevelMap = () => {
          // Classic dungeon style: rooms connected by corridors.
          const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '#'));
          const rooms = [];
          const roomCount = Phaser.Math.Between(4, 6);
          const carveRoom = (rx, ry, rw, rh) => {
            for (let y = ry; y < ry + rh; y += 1) {
              for (let x = rx; x < rx + rw; x += 1) {
                if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
                map[y][x] = '.';
              }
            }
          };
          const roomOverlaps = (a, b) => !(
            a.x + a.w + 1 < b.x
            || b.x + b.w + 1 < a.x
            || a.y + a.h + 1 < b.y
            || b.y + b.h + 1 < a.y
          );
          for (let i = 0; i < roomCount; i += 1) {
            const rw = Phaser.Math.Between(4, 7);
            const rh = Phaser.Math.Between(3, 5);
            const rx = Phaser.Math.Between(1, Math.max(1, MAP_W - rw - 2));
            const ry = Phaser.Math.Between(1, Math.max(1, MAP_H - rh - 2));
            const next = { x: rx, y: ry, w: rw, h: rh };
            if (rooms.some((r) => roomOverlaps(r, next))) continue;
            carveRoom(rx, ry, rw, rh);
            rooms.push(next);
          }
          if (rooms.length === 0) {
            const fallback = { x: 2, y: 2, w: Math.max(4, MAP_W - 4), h: Math.max(3, MAP_H - 4) };
            carveRoom(fallback.x, fallback.y, fallback.w, fallback.h);
            rooms.push(fallback);
          }
          const centerOf = (r) => ({
            gx: Math.floor(r.x + r.w / 2),
            gy: Math.floor(r.y + r.h / 2),
          });
          const carveHCorridor = (x1, x2, y) => {
            const from = Math.min(x1, x2);
            const to = Math.max(x1, x2);
            for (let x = from; x <= to; x += 1) {
              if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) map[y][x] = '.';
            }
          };
          const carveVCorridor = (y1, y2, x) => {
            const from = Math.min(y1, y2);
            const to = Math.max(y1, y2);
            for (let y = from; y <= to; y += 1) {
              if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) map[y][x] = '.';
            }
          };
          for (let i = 1; i < rooms.length; i += 1) {
            const a = centerOf(rooms[i - 1]);
            const b = centerOf(rooms[i]);
            if (Math.random() < 0.5) {
              carveHCorridor(a.gx, b.gx, a.gy);
              carveVCorridor(a.gy, b.gy, b.gx);
            } else {
              carveVCorridor(a.gy, b.gy, a.gx);
              carveHCorridor(a.gx, b.gx, b.gy);
            }
          }
          const startNear = centerOf(rooms[0]);
          carveHCorridor(START_TILE.gx, startNear.gx, START_TILE.gy);
          carveVCorridor(START_TILE.gy, startNear.gy, startNear.gx);
          map[START_TILE.gy][START_TILE.gx] = '.';

          const stairsRoom = rooms[rooms.length - 1];
          const stairsCenter = centerOf(stairsRoom);
          const stairs = {
            gx: Phaser.Math.Clamp(stairsCenter.gx, 1, MAP_W - 2),
            gy: Phaser.Math.Clamp(stairsCenter.gy, 1, MAP_H - 2),
          };
          map[stairs.gy][stairs.gx] = '.';
          return { map: map.map((r) => r.join('')), stairs };
        };
        const refreshMapVisuals = () => {
          const floorA = 0x121a2e;
          const floorB = 0x182238;
          const wall = 0x2a3d58;
          const outer = 0x080e18;
          for (let y = 0; y < MAX_DUNGEON_H; y += 1) {
            for (let x = 0; x < MAX_DUNGEON_W; x += 1) {
              if (y >= dungeonH || x >= dungeonW) {
                mapTiles[y][x].setFillStyle(outer, 1);
              } else {
                const isWall = currentMap[y][x] === '#';
                mapTiles[y][x].setFillStyle(isWall ? wall : (((x + y) & 1) === 0 ? floorA : floorB), 1);
              }
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

          // --- Sistema de counts exactos por floor fijo ---
          // Busca la plantilla de una criatura por ID en todas las fuentes conocidas.
          const findTemplateById = (id) => {
            for (const arr of Object.values(FORCED_CREATURE_TEMPLATES_BY_LEVEL)) {
              const t = arr.find((x) => Number(x.id) === id);
              if (t) return t;
            }
            const t2 = Object.values(FORCED_CREATURE_TEMPLATE_BY_LEVEL).find((x) => Number(x.id) === id);
            if (t2) return t2;
            for (const g of typeProgressionGroups) {
              const c = (g.creatures || []).find((x) => Number(x.id) === id);
              if (c) return c;
            }
            return null;
          };
          let exactTemplates = null;
          const countConfig = FLOOR_CREATURE_COUNTS[Number(level)];
          if (countConfig) {
            exactTemplates = [];
            for (const [idStr, cnt] of Object.entries(countConfig)) {
              const tmpl = findTemplateById(Number(idStr));
              if (tmpl) {
                for (let k = 0; k < cnt; k += 1) exactTemplates.push({ ...tmpl });
              }
            }
            Phaser.Utils.Array.Shuffle(exactTemplates);
            creaturesTargetCount = exactTemplates.length;
          }

          const group = currentLevelGroup;
          const basePool = (group && group.creatures && group.creatures.length > 0)
            ? group.creatures.filter((c) => c.type_primary === group.type_primary)
            : [{ id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }];
          const earlyLevels = EARLY_LEVELS;
          const forcedCreatureIdByLevel = FORCED_CREATURE_ID_BY_LEVEL;
          const forcedCreatureIdsByLevel = FORCED_CREATURE_IDS_BY_LEVEL;
          const forcedCreatureTemplateByLevel = FORCED_CREATURE_TEMPLATE_BY_LEVEL;
          const forcedCreatureTemplatesByLevel = FORCED_CREATURE_TEMPLATES_BY_LEVEL;
          let levelPool;
          let hasForcedPoolRestriction = false;
          const templateDeck = forcedCreatureTemplatesByLevel[Number(level)];
          if (Array.isArray(templateDeck) && templateDeck.length > 0) {
            levelPool = templateDeck.map((x) => ({ ...x }));
            hasForcedPoolRestriction = true;
          } else {
            levelPool = basePool.slice();
          }
          if (String((group && group.type_primary) || '').toLowerCase().includes('troll')) {
            const trollAllowedIds = new Set(TROLL_ALLOWED_IDS);
            levelPool = levelPool.filter((c) => trollAllowedIds.has(Number(c && c.id)));
            hasForcedPoolRestriction = true;
          }
          const forcedCreatureId = forcedCreatureIdByLevel[Number(level)];
          const forcedCreatureIds = forcedCreatureIdsByLevel[Number(level)];
          if (Array.isArray(forcedCreatureIds) && forcedCreatureIds.length > 0) {
            const allowed = new Set(forcedCreatureIds.map((id) => Number(id)));
            levelPool = levelPool.filter((c) => allowed.has(Number(c && c.id)));
            hasForcedPoolRestriction = true;
            if (levelPool.length === 0) {
              if (Array.isArray(forcedCreatureTemplatesByLevel[Number(level)])) {
                levelPool = forcedCreatureTemplatesByLevel[Number(level)].map((x) => ({ ...x }));
              } else if (forcedCreatureTemplateByLevel[Number(level)]) {
                levelPool = [{ ...forcedCreatureTemplateByLevel[Number(level)] }];
              }
            }
          }
          if (forcedCreatureId != null) {
            levelPool = levelPool.filter((c) => Number(c && c.id) === forcedCreatureId);
            hasForcedPoolRestriction = true;
            if (levelPool.length === 0 && forcedCreatureTemplateByLevel[Number(level)]) {
              levelPool = [{ ...forcedCreatureTemplateByLevel[Number(level)] }];
            }
          }
          // Single-type-primary guarantee per floor:
          // we only use creatures from the selected group's type_primary.
          if (level <= earlyLevels) {
            const phase = (level - 1) / Math.max(1, earlyLevels - 1); // 0..1
            const values = (arr, pick) => arr
              .map((x) => Number(pick(x)))
              .filter((v) => Number.isFinite(v) && v > 0)
              .sort((a, b) => a - b);
            const pct = (sorted, p, fallback) => {
              if (!sorted || sorted.length === 0) return fallback;
              const clamped = Phaser.Math.Clamp(Number(p) || 0, 0, 1);
              const pos = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * clamped));
              return sorted[pos];
            };
            const baseHpSorted = values(basePool, (c) => c.hitpoints);
            const baseDmgSorted = values(basePool, (c) => c.maxDamage);
            const baseExpSorted = values(basePool, (c) => c.experience);
            const hpBase = pct(baseHpSorted, 0.72, 30);
            const dmgBase = pct(baseDmgSorted, 0.72, 8);
            const expBase = pct(baseExpSorted, 0.72, 15);
            const hpCap = Math.max(20, Math.floor(hpBase * (1.04 + phase * 0.30) + 5));
            const dmgCap = Math.max(4, Math.floor(dmgBase * (1.04 + phase * 0.34) + 1));
            const expCap = Math.max(8, Math.floor(expBase * (1.04 + phase * 0.36) + 3));
            const difficultyFiltered = levelPool.filter((c) => {
              const hp = Number(c && c.hitpoints);
              const dmg = Number(c && c.maxDamage);
              const exp = Number(c && c.experience);
              if (!Number.isFinite(hp) || !Number.isFinite(dmg) || !Number.isFinite(exp)) return false;
              return hp <= hpCap && dmg <= dmgCap && exp <= expCap;
            });
            if (difficultyFiltered.length >= 8) {
              levelPool = difficultyFiltered;
            } else if (!hasForcedPoolRestriction) {
              levelPool = basePool.slice();
            }
            // Progression hard-gate by floor (very conservative for first floors).
            const strictHpCapByFloor = (floor) => {
              if (floor <= 1) return 42;
              if (floor === 2) return 55;
              if (floor === 3) return 72;
              if (floor === 4) return 92;
              if (floor === 5) return 118;
              return Math.floor(118 + (floor - 5) * 20);
            };
            const strictDmgCapByFloor = (floor) => {
              if (floor <= 1) return 10;
              if (floor === 2) return 13;
              if (floor === 3) return 17;
              if (floor === 4) return 22;
              if (floor === 5) return 28;
              return Math.floor(28 + (floor - 5) * 4);
            };
            const strictExpCapByFloor = (floor) => {
              if (floor <= 1) return 22;
              if (floor === 2) return 36;
              if (floor === 3) return 54;
              if (floor === 4) return 78;
              if (floor === 5) return 110;
              return Math.floor(110 + (floor - 5) * 28);
            };
            const hpStrict = strictHpCapByFloor(level);
            const dmgStrict = strictDmgCapByFloor(level);
            const expStrict = strictExpCapByFloor(level);
            const strictFiltered = levelPool.filter((c) => {
              const hp = Number(c && c.hitpoints);
              const dmg = Number(c && c.maxDamage);
              const exp = Number(c && c.experience);
              if (!Number.isFinite(hp) || !Number.isFinite(dmg) || !Number.isFinite(exp)) return false;
              return hp <= hpStrict && dmg <= dmgStrict && exp <= expStrict;
            });
            if (strictFiltered.length >= 8) {
              levelPool = strictFiltered;
            }
            const recentSet = new Set(recentEarlyCreatureIds);
            const filtered = levelPool.filter((c) => !recentSet.has(Number(c.id)));
            if (filtered.length >= 12) levelPool = filtered;
            Phaser.Utils.Array.Shuffle(levelPool);
          }
          if (!exactTemplates) {
            creaturesTargetCount = Number(level) === 1
              ? 10
              : Phaser.Math.Between(MIN_CREATURES_PER_LEVEL, MAX_CREATURES_PER_LEVEL);
          }
          const templates = exactTemplates || pickRandomCreatures(levelPool, creaturesTargetCount);
          if (!templates || templates.length === 0) {
            addCombatLog(`Floor ${level}: no valid creature templates found.`);
            creaturesTargetCount = 0;
            return;
          }
          if (level <= earlyLevels) {
            for (const t of templates) {
              const cid = Number(t && t.id);
              if (!Number.isFinite(cid)) continue;
              recentEarlyCreatureIds.push(cid);
            }
            if (recentEarlyCreatureIds.length > 40) {
              recentEarlyCreatureIds.splice(0, recentEarlyCreatureIds.length - 40);
            }
          }
          const floorsForSpawn = currentFloors.filter(
            (t) =>
              !(t.gx === START_TILE.gx && t.gy === START_TILE.gy)
              && !(t.gx === currentStairsTile.gx && t.gy === currentStairsTile.gy)
          );

          for (let i = 0; i < creaturesTargetCount; i += 1) {
            const spawn = floorsForSpawn.length > 0 ? floorsForSpawn.splice(Phaser.Math.Between(0, floorsForSpawn.length - 1), 1)[0] : null;
            const template = templates[i % templates.length];
            if (!spawn || !isWalkableTile(spawn.gx, spawn.gy)) continue;
            const requestedTextureKey = creatureKey(template);
            const fallbackTextureKey = creatureKey({ id: 1116 }); // Rat
            const requestedTexture = this.textures.get(requestedTextureKey);
            const requestedSource = requestedTexture && typeof requestedTexture.getSourceImage === 'function'
              ? requestedTexture.getSourceImage()
              : null;
            const fallbackTexture = this.textures.get(fallbackTextureKey);
            const fallbackSource = fallbackTexture && typeof fallbackTexture.getSourceImage === 'function'
              ? fallbackTexture.getSourceImage()
              : null;
            const safeTextureKey = requestedSource ? requestedTextureKey : (fallbackSource ? fallbackTextureKey : null);
            if (!safeTextureKey) {
              addCombatLog(`Floor ${level}: skipped ${template.title || 'creature'} (missing texture).`);
              continue;
            }
            if (safeTextureKey !== requestedTextureKey) {
              addCombatLog(`Floor ${level}: texture missing for ${template.title || 'creature'}, using fallback sprite.`);
            }
            const sprite = this.add.sprite(centerX(spawn.gx), centerY(spawn.gy), safeTextureKey);
            sprite.setOrigin(0.5, 0.5);
            applyCreatureNormalizedDisplaySize(sprite, this, tileSize);
            sprite.x = centerX(spawn.gx);
            sprite.y = centerY(spawn.gy);
            const creatureId = Number(template.id);
            const damageMul = Number(CREATURE_DAMAGE_MULTIPLIER_BY_ID.get(creatureId) || 1);
            const baseMaxDamage = Math.max(1, Number(template.maxDamage || 1));
            const adjustedMaxDamage = Math.max(1, Math.floor(baseMaxDamage * damageMul));
            sprite.setDepth(15);
            creatures.push({
              id: creatureId,
              sprite,
              gx: spawn.gx,
              gy: spawn.gy,
              hp: Math.max(1, Number(template.hitpoints || 1)),
              maxHp: Math.max(1, Number(template.hitpoints || 1)),
              maxDamage: adjustedMaxDamage,
              runsAt: Math.max(0, Number(template.runs_at || 0)),
              title: template.title,
              experience: Number(template.experience || 0),
              speed: Math.max(1, Number(template.speed || 100)),
              alive: true,
              nextWanderAt: 0,
              nextActionAt: 0,
              aggroLocked: false,
              abilities: (creatureAbilitiesById.get(creatureId) || []).slice(0, 16),
              elementMods: mergeCreatureElementModsForId(creatureId),
              hpBar: makeHealthBar(0xef4444),
              nameTag: makeNameLabel(template.title, '#f3f4f6'),
            });
            const spawned = creatures[creatures.length - 1];
            spawned.hpBar.bg.setDepth(16);
            spawned.hpBar.fill.setDepth(17);
            spawned.nameTag.setDepth(18);
            updateCreatureBar(spawned);
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
          // Calcular tamaño del mapa según las criaturas de este floor
          const floorCountCfg = FLOOR_CREATURE_COUNTS[Number(currentLevel)];
          const floorTotal = floorCountCfg
            ? Object.values(floorCountCfg).reduce((s, v) => s + v, 0)
            : MAX_CREATURES_PER_LEVEL;
          const { w: newW, h: newH } = computeDungeonSize(floorTotal);
          dungeonW = Math.min(newW, MAX_DUNGEON_W);
          dungeonH = Math.min(newH, MAX_DUNGEON_H);
          const generated = buildDungeonLevelMap({
            totalCreatures: floorTotal,
            MAP_W: dungeonW,
            MAP_H: dungeonH,
            START_TILE,
            between: Phaser.Math.Between,
            clamp: Phaser.Math.Clamp,
            random: Math.random,
          });
          currentMap = generated.map;
          currentStairsTile = generated.stairs;
          this.cameras.main.setBounds(0, 0, dungeonW * tileSize, dungeonH * tileSize);
          // Solo usamos casillas conectadas al inicio para evitar monstruos bloqueados.
          const reachable = [];
          const visited = Array.from({ length: dungeonH }, () => Array.from({ length: dungeonW }, () => false));
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
              if (nx < 0 || ny < 0 || nx >= dungeonW || ny >= dungeonH) continue;
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
          ropeHintRect.setPosition(centerX(START_TILE.gx), centerY(START_TILE.gy));
          ropeHintText.setPosition(centerX(START_TILE.gx), centerY(START_TILE.gy) - 11);
          stairRect.setVisible(false);
          stairText.setVisible(false);
          const canRopeUp = currentLevel > 1;
          ropeHintRect.setVisible(canRopeUp);
          ropeHintText.setVisible(canRopeUp);
          spawnCreaturesForLevel(currentLevel);
          gridX = START_TILE.gx;
          gridY = START_TILE.gy;
          player.x = centerX(gridX);
          player.y = centerY(gridY);
          updatePlayerBar();
        };
        const setGodMode = (enabled) => {
          godModeEnabled = Boolean(enabled);
          if (godModeEnabled) {
            gameOver = false;
            playerDead = false;
            playerHp = playerMaxHp;
            playerMana = playerMaxMana;
            addCombatLog('God Mode enabled.');
          } else {
            addCombatLog('God Mode disabled.');
          }
          updatePlayerBar();
          updateHud();
          return godModeEnabled;
        };
        window.debugGod = {
          enable() {
            return setGodMode(true);
          },
          disable() {
            return setGodMode(false);
          },
          toggle() {
            return setGodMode(!godModeEnabled);
          },
          isEnabled() {
            return Boolean(godModeEnabled);
          },
          goToFloor(level) {
            const target = Math.max(1, Math.floor(Number(level) || 1));
            currentLevel = target;
            descendLevel(false);
            addCombatLog(`Teleported to floor ${target}.`);
            updateHud();
            return target;
          },
          nextFloor() {
            return this.goToFloor(currentLevel + 1);
          },
          prevFloor() {
            return this.goToFloor(Math.max(1, currentLevel - 1));
          },
        };
        const spellTooltipEl = document.getElementById('itemTooltip');
        const equipmentPanelEl = document.querySelector('.equipment-panel');
        const equipmentAccordionEl = document.getElementById('equipmentAccordion');
        const lootPanelEl = document.querySelector('.loot-panel');
        const statsPanelEl = document.getElementById('statsPanel');
        const spellsPanelEl = document.querySelector('.spells-panel');
        const spellsAccordionEl = document.getElementById('spellsAccordion');
        const learnedSpellsPanelEl = document.getElementById('learnedSpellsPanel');
        const itemsShopPanelEl = document.getElementById('itemsShopPanel');
        const itemsShopAccordionEl = document.getElementById('itemsShopAccordion');
        const itemsShopSearchInputEl = document.getElementById('itemsShopSearchInput');
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
        const lootAccordionEl = document.getElementById('lootAccordion');
        const {
          syncLootPanelPosition,
          syncStatsPanelPosition,
          syncLearnedPanelPosition,
          syncItemsShopPanelPosition,
        } = wirePanelLayoutSync({
          equipmentPanelEl,
          equipmentAccordionEl,
          lootPanelEl,
          lootAccordionEl,
          statsPanelEl,
          spellsPanelEl,
          spellsAccordionEl,
          learnedSpellsPanelEl,
          itemsShopPanelEl,
          itemsShopAccordionEl,
        });
        const renderLearnedSpells = () => {
          const learnedGrid = document.getElementById('learnedSpellsGrid');
          const learnedFoot = document.getElementById('learnedSpellsFoot');
          if (!learnedGrid || !learnedFoot) return;
          learnedGrid.innerHTML = '';
          const slotBySpellId = new Map();
          for (let i = 0; i < learnedSpellSlots.length; i += 1) {
            const id = learnedSpellSlots[i];
            if (id != null) slotBySpellId.set(Number(id), i + 1);
          }
          const learned = (spellsCatalog || [])
            .filter((s) => learnedSpellIds.has(Number(s.article_id)))
            .filter((s) => !isBlockedSpellTitle(s.title))
            .sort((a, b) => {
              const aSlot = Number(slotBySpellId.get(Number(a.article_id)) || 999);
              const bSlot = Number(slotBySpellId.get(Number(b.article_id)) || 999);
              if (aSlot !== bSlot) return aSlot - bSlot;
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
              const slotIdx = Number(slotBySpellId.get(Number(spell.article_id)) || 0) - 1;
              const slotPrefix = slotIdx >= 0 ? `[${slotIdx + 1}] ` : '';
              row.textContent = `${slotPrefix}${spell.title} (Lv ${Math.max(0, Number(spell.level || 0))})`;
              bindSpellTooltip(row, spell);
              learnedGrid.appendChild(row);
            }
          }
          learnedFoot.textContent = `Total: ${learned.length}`;
          syncLootPanelPosition();
          syncLearnedPanelPosition();
          syncItemsShopPanelPosition();
        };
        const renderSpellShop = () => {
          const spellsGrid = document.getElementById('spellsGrid');
          const spellsFoot = document.getElementById('spellsFoot');
          if (!spellsGrid || !spellsFoot) return;
          const currentGold = window.debugInventory && typeof window.debugInventory.getGold === 'function'
            ? Math.max(0, Number(window.debugInventory.getGold() || 0))
            : 0;
          const roomCleared = aliveCreatures().length === 0;
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
            if (isBlockedSpellTitle(title)) return false;
            const words = String(s.words || '').trim().toLowerCase();
            const effect = String((s.raw && s.raw.effect) || '').trim().toLowerCase();
            const looksHealing = (
              title.includes('healing')
              || title.includes('exura')
              || effect.includes('restore hit points')
              || effect.includes('heals')
            );
            const isLightSpell = (
              (title.includes('light') && !looksHealing)
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
            } else if (!roomCleared) {
              btn.textContent = 'Clear room first';
              btn.disabled = true;
            } else {
              btn.textContent = 'Buy spell';
              btn.disabled = false;
              const buySpell = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (btn.disabled) return;
                if (aliveCreatures().length > 0) {
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
                learnedSpellIds.add(Number(spell.article_id));
                const freeIdx = learnedSpellSlots.findIndex((id) => id == null);
                if (freeIdx >= 0) {
                  learnedSpellSlots[freeIdx] = Number(spell.article_id);
                } else {
                  addCombatLog(`No free hotkey slot (1-9) for ${spell.title}.`);
                }
                addCombatLog(`Bought spell: ${spell.title} for ${price} gp.`);
                // El inventario ya se redibuja dentro de spendGoldFromInventory (debugInventory.spendGold).
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
          spellsFoot.textContent = roomCleared
            ? `Gold: ${currentGold} | Learned: ${learnedSpellIds.size}`
            : `Clear room to buy | Gold: ${currentGold} | Learned: ${learnedSpellIds.size}`;
          renderLearnedSpells();
        };
        const formatItemShopTooltip = (item) => {
          if (!item) return '';
          const lines = [];
          lines.push(`${item.title || `Item ${item.id}`}`);
          lines.push(`────────────────────`);
          lines.push(`Shop`);
          lines.push(`- Price: ${Math.max(0, Number(item.price || 0))} gp`);
          lines.push(``);
          lines.push(`Type`);
          lines.push(`- Class: ${item.item_class || 'Unknown'}`);
          lines.push(`- Type: ${item.item_type || 'Unknown'}`);
          if (item.type_secondary) lines.push(`- Secondary: ${item.type_secondary}`);
          const attrs = Array.isArray(item.attributes) ? item.attributes : [];
          const shopType = String(item.item_type || '').toLowerCase();
          if (shopType === 'wands' || shopType === 'rods') {
            const g = (n) => {
              const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === n);
              return row ? String(row.value || '').trim() : '';
            };
            lines.push(``);
            lines.push(`Wand / Rod`);
            const r = g('range');
            const dt = g('damage_type');
            const dr = g('damage_range');
            const mc = g('mana_cost');
            if (r) lines.push(`- Range: ${r}`);
            if (dt) lines.push(`- Damage type: ${dt}`);
            if (dr) lines.push(`- Damage (data): ${dr}`);
            if (mc) lines.push(`- Mana / shot: ${mc}`);
            const hud = (typeof window !== 'undefined' && window.__gameHud) ? window.__gameHud : { ml: 0, pl: 1 };
            const prev = averageMagicWeaponHitPreview(dr, Number(hud.ml) || 0, Number(hud.pl) || 1);
            if (prev != null) lines.push(`- Est. hit (avg, ML ${hud.ml}): ~${prev}`);
          }
          if (attrs.length > 0) {
            lines.push(``);
            lines.push(`Attributes`);
            for (const a of attrs.slice(0, 8)) {
              const n = String((a && a.name) || '').trim();
              const v = String((a && a.value) || '').trim();
              if (!n) continue;
              lines.push(`- ${n}: ${v || '-'}`);
            }
          }
          const desc = String(item.description || '').trim();
          if (desc) {
            lines.push(``);
            lines.push(`Description`);
            lines.push(desc);
          }
          return lines.join('\n');
        };
        const bindItemShopTooltip = (el, item) => {
          if (!el || !spellTooltipEl) return;
          const place = (ev) => {
            const padX = 36;
            const padY = 52;
            const x = Math.min(window.innerWidth - 440, ev.clientX + padX);
            const y = Math.min(window.innerHeight - 240, ev.clientY + padY);
            spellTooltipEl.style.left = `${Math.max(6, x)}px`;
            spellTooltipEl.style.top = `${Math.max(6, y)}px`;
          };
          el.addEventListener('mouseenter', (ev) => {
            spellTooltipEl.textContent = formatItemShopTooltip(item);
            spellTooltipEl.style.display = 'block';
            spellTooltipEl.style.overflow = 'auto';
            spellTooltipEl.style.maxHeight = '42vh';
            place(ev);
          });
          el.addEventListener('mousemove', place);
          el.addEventListener('mouseleave', hideSpellTooltip);
        };
        let itemsShopQuery = '';
        const renderItemsShop = (queryRaw = itemsShopQuery) => {
          itemsShopQuery = String(queryRaw || '').trim();
          const gridEl = document.getElementById('itemsShopGrid');
          const footEl = document.getElementById('itemsShopFoot');
          if (!gridEl || !footEl) return;
          const currentGold = window.debugInventory && typeof window.debugInventory.getGold === 'function'
            ? Math.max(0, Number(window.debugInventory.getGold() || 0))
            : 0;
          const roomCleared = aliveCreatures().length === 0;
          gridEl.innerHTML = '';
          if (itemsShopQuery.length < 3) {
            footEl.textContent = `Type at least 3 chars | Gold: ${currentGold}`;
            return;
          }
          const q = itemsShopQuery.toLowerCase();
          const matches = (itemsShopCatalog || [])
            .filter((it) => {
              if (!String(it.title || '').toLowerCase().includes(q)) return false;
              const itemType = String(it.item_type || '').toLowerCase();
              const itemTypeNorm = itemType.replace(/\s+/g, ' ').trim();
              if (/^exercise\s*weapons?$/.test(itemTypeNorm)) return false;
              if (itemTypeNorm === 'rods') return playerClassKey === 'druid';
              if (itemTypeNorm === 'wands') return playerClassKey === 'sorcerer';
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
              const img = document.createElement('img');
              img.src = `./data/images/${item.image}`;
              img.alt = item.title || 'Item';
              head.appendChild(img);
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
            buyWrap.style.display = 'grid';
            buyWrap.style.gridTemplateColumns = isStackable ? '1fr 1fr' : '1fr';
            buyWrap.style.gap = '4px';
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
              btn.disabled = false;
              btn.addEventListener('mousedown', (ev) => {
                if (ev.button !== 0) return;
                ev.preventDefault();
                ev.stopPropagation();
                if (btn.disabled) return;
                if (aliveCreatures().length > 0) {
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
                updateHud();
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
        };
        window.addEventListener('coins-changed', renderSpellShop);
        window.addEventListener('coins-changed', () => renderItemsShop(itemsShopQuery));
        if (itemsShopSearchInputEl) {
          itemsShopSearchInputEl.addEventListener('input', () => {
            renderItemsShop(itemsShopSearchInputEl.value || '');
          });
        }
        const renderTopStatsPanel = () => {
          const statsGridEl = document.getElementById('statsGrid');
          const statsFootEl = document.getElementById('statsFoot');
          if (!statsGridEl || !statsFootEl) return;
          const stats = [
            { key: 'Magic Level', level: Math.max(0, Number(playerMagicLevel || 0)) },
            { key: 'Fist Fighting', level: Math.max(10, Number(playerFistLevel || 10)) },
            { key: 'Shielding', level: Math.max(10, Number(playerShieldingLevel || 10)) },
          ];
          for (const [typeKey, level] of weaponSkillLevelByType.entries()) {
            stats.push({
              key: `${weaponSkillLabel(typeKey)} Fighting`,
              level: Math.max(10, Number(level || 10)),
            });
          }
          stats.sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return String(a.key).localeCompare(String(b.key));
          });
          const top = stats.slice(0, 5);
          statsGridEl.innerHTML = '';
          for (const s of top) {
            const row = document.createElement('div');
            row.className = 'stats-row';
            const left = document.createElement('span');
            left.textContent = s.key;
            const right = document.createElement('strong');
            right.textContent = String(s.level);
            row.appendChild(left);
            row.appendChild(right);
            statsGridEl.appendChild(row);
          }
          statsFootEl.textContent = `Showing top ${top.length} of ${stats.length} stats`;
          syncStatsPanelPosition();
        };
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
          const handEq = invState && invState.equipped ? invState.equipped.hand : null;
          const skillType = weaponSkillTypeKey(handEq);
          const skillLevel = getWeaponSkillLevelByType(skillType);
          const skillUses = getWeaponSkillUsesByType(skillType);
          const skillNeed = weaponUsesToNextLevel(skillLevel);
          const skillPct = skillNeed > 0 ? Math.floor((skillUses / skillNeed) * 100) : 0;
          const skillLabel = weaponSkillLabel(skillType || 'Unarmed');
          if (typeof window !== 'undefined') {
            window.__gameHud = { ml: playerMagicLevel, pl: playerLevel };
          }
          nameLabel.setText(`${configPlayer.name} (${playerClassKey}) | Player Lv ${playerLevel} | ML ${playerMagicLevel} | ${skillLabel} ${skillLevel}`);
          levelHud.setText(`Floor ${currentLevel} | ${typeName} ${aliveCreatures().length}/${creaturesTargetCount}`);
          combatHud.setText(`HP ${playerHp}/${playerMaxHp} MP ${playerMana}/${playerMaxMana} ML ${playerMagicLevel} ${skillLabel} ${skillLevel} (${skillPct}%) Fist ${playerFistLevel} Shield ${playerShieldingLevel} CAP ${capCurrentText}/${capTotalText}`);
          const xpNeeded = xpToNextLevel(playerLevel);
          const safeXp = Number.isFinite(playerXp) ? playerXp : 0;
          const progress = xpNeeded > 0 && Number.isFinite(safeXp) ? safeXp / xpNeeded : 0;
          const totalWidth = this.scale.width - 18;
          const safeProgress = Number.isFinite(progress) ? Phaser.Math.Clamp(progress, 0, 1) : 0;
          levelProgressFill.width = Math.max(2, totalWidth * safeProgress);
          levelProgressText.setText(`XP ${Math.floor(safeXp)} / ${xpNeeded}`);
          renderSpellShop();
          renderItemsShop(itemsShopQuery);
          renderTopStatsPanel();
        };
        const pickCreatureDamage = () => {
          const max = Math.max(1, Number(this._activeAttackerMaxDamage || 1));
          const floorMultiplier = Phaser.Math.Clamp(1 + ((currentLevel - 1) * 0.12), 1, 3.5);
          const rolled = Phaser.Math.Between(1, max);
          return Math.max(1, Math.floor(rolled * floorMultiplier));
        };
        const maxIncomingHitByFloor = () => {
          // Hard cap anti-spikes: grows with floor but avoids unfair one-shots.
          const floorFactor = Phaser.Math.Clamp(0.34 + ((currentLevel - 1) * 0.02), 0.34, 0.55);
          return Math.max(18, Math.floor(playerMaxHp * floorFactor));
        };
        const clampIncomingCreatureDamage = (damage, creatureMaxDamage = 1) => {
          const raw = Math.max(1, Math.floor(Number(damage) || 1));
          const byCreature = Math.max(12, Math.floor(Math.max(1, Number(creatureMaxDamage || 1)) * 2.2));
          const byFloor = maxIncomingHitByFloor();
          const hardCap = Math.min(byCreature, byFloor);
          return Phaser.Math.Clamp(raw, 1, hardCap);
        };
        const getEquippedHandWeapon = () => {
          const state = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          return state && state.equipped ? state.equipped.hand : null;
        };
        const getEquippedAmmo = () => {
          const state = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          return state && state.equipped ? state.equipped.ammunition : null;
        };
        const getEquippedShield = () => {
          const state = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          return state && state.equipped ? state.equipped.shield : null;
        };
        const applyShieldingReduction = (incomingDamage) => {
          const raw = Math.max(1, Math.floor(Number(incomingDamage) || 1));
          const readAttrValue = (it, attrName) => {
            const attrs = Array.isArray(it && it.attributes) ? it.attributes : [];
            const row = attrs.find((a) => (
              a
              && String(a.name || '').toLowerCase() === String(attrName || '').toLowerCase()
            ));
            const n = Number(row && row.value);
            return Number.isFinite(n) ? Math.max(0, n) : 0;
          };
          const state = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          const equipped = (state && state.equipped) ? state.equipped : {};
          const shield = getEquippedShield();
          const hand = getEquippedHandWeapon();
          const shieldDefense = (shield && String(shield.item_type || '').toLowerCase() === 'shields')
            ? readAttrValue(shield, 'defense')
            : 0;
          const handDefense = hand ? readAttrValue(hand, 'defense') : 0;
          const shieldValue = Math.max(0, Number((shield && shield.shielding_value) || 0)) + shieldDefense;
          const armorFromEquipment = Object.entries(equipped)
            .filter(([slot, eq]) => eq && slot !== 'hand' && slot !== 'shield' && slot !== 'ammunition' && slot !== 'bag')
            .reduce((acc, [, eq]) => {
              const baseArmor = Math.max(0, Number(eq && eq.armor_value) || 0);
              const armorAttr = readAttrValue(eq, 'armor');
              return acc + baseArmor + armorAttr;
            }, 0);
          const totalDefenseValue = shieldValue + handDefense + armorFromEquipment;
          if (totalDefenseValue <= 0) return raw;
          const skillValue = Math.max(10, Number(playerShieldingLevel || 10));
          // Mitigacion total: escudo + defensa de arma + armor de equipo.
          const percentReduction = Phaser.Math.Clamp(
            0.08 + (totalDefenseValue * 0.009) + ((skillValue - 10) * 0.004),
            0.08,
            0.72
          );
          const flatReduction = Math.floor((totalDefenseValue * 0.18) + ((skillValue - 10) * 0.08));
          const reducedByPercent = Math.floor(raw * (1 - percentReduction));
          const reduced = Math.max(1, reducedByPercent - flatReduction);
          return reduced;
        };
        const ammoAttackBonus = (weapon = null) => {
          const ammo = getEquippedAmmo();
          if (!ammo) return 0;
          if (weapon && !isAmmoCompatibleWithWeapon(weapon, ammo)) return 0;
          return Math.max(0, Number((ammo && ammo.attack_value) || 0));
        };
        const isMagicRangedWeapon = (item) => {
          if (!item) return false;
          const t = String(item.item_type || '').toLowerCase();
          return t === 'rods' || t === 'wands';
        };
        const magicWeaponDamageTypeSuffix = (weapon) => {
          if (!weapon || !isMagicRangedWeapon(weapon)) return '';
          const attrs = Array.isArray(weapon.attributes) ? weapon.attributes : [];
          const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_type');
          const v = row ? String(row.value || '').trim() : '';
          return v ? ` (${v})` : '';
        };
        const magicWeaponDamageTypeRaw = (weapon) => {
          if (!weapon || !isMagicRangedWeapon(weapon)) return '';
          const attrs = Array.isArray(weapon.attributes) ? weapon.attributes : [];
          const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_type');
          return row ? String(row.value || '').trim() : '';
        };
        const defaultElementMods = () => ({
          physical: 100,
          earth: 100,
          fire: 100,
          ice: 100,
          energy: 100,
          death: 100,
          holy: 100,
          drown: 100,
          lifedrain: 100,
          healing: 100,
        });
        const mergeCreatureElementModsForId = (creatureId) => {
          const row = creatureDamageModifiersById.get(Number(creatureId));
          const base = defaultElementMods();
          if (!row) return base;
          const out = { ...base };
          for (const k of Object.keys(base)) {
            if (row[k] != null && Number.isFinite(Number(row[k]))) out[k] = Number(row[k]);
          }
          return out;
        };
        /** Maps item/spell damage_type string to creature.elementMods key. */
        const normalizeDamageTypeToModifierKey = (raw) => {
          const s = String(raw || '').trim().toLowerCase();
          if (!s) return null;
          const direct = {
            physical: 'physical',
            phys: 'physical',
            earth: 'earth',
            terra: 'earth',
            fire: 'fire',
            ice: 'ice',
            frost: 'ice',
            energy: 'energy',
            elec: 'energy',
            electric: 'energy',
            death: 'death',
            holy: 'holy',
            drown: 'drown',
            lifedrain: 'lifedrain',
            life: 'lifedrain',
            healing: 'healing',
            poison: 'earth',
          };
          if (direct[s]) return direct[s];
          if (s.includes('earth') || s.includes('terra')) return 'earth';
          if (s.includes('fire') || s.includes('flame')) return 'fire';
          if (s.includes('ice') || s.includes('frost')) return 'ice';
          if (s.includes('energy') || s.includes('lightning')) return 'energy';
          if (s.includes('death')) return 'death';
          if (s.includes('holy')) return 'holy';
          if (s.includes('physical')) return 'physical';
          return null;
        };
        const inferSpellDamageElementKey = (spell) => {
          const t = String((spell && spell.title) || '').toLowerCase();
          const e = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
          const both = `${t} ${e}`;
          if (/(fire|flame|burn|great fireball|scorch)/.test(both)) return 'fire';
          if (/(ice|frost|freeze|avalanche)/.test(both)) return 'ice';
          if (/(earth|terra|stone|stalagmite|poison)/.test(both)) return 'earth';
          if (/(energy|lightning|thunder|electric|great energy)/.test(both)) return 'energy';
          if (/(death|soul|curse|decay|great death)/.test(both)) return 'death';
          if (/(holy|divine)/.test(both)) return 'holy';
          return 'energy';
        };
        const applyIncomingElementalDamage = (baseDamage, creature, elementKey) => {
          const raw = Math.max(0, Math.floor(Number(baseDamage) || 0));
          if (!creature || !elementKey) return raw;
          const mods = creature.elementMods;
          if (!mods) return raw;
          const pct = Number(mods[elementKey]);
          const m = Number.isFinite(pct) ? pct : 100;
          const mult = Math.min(3, Math.max(0, m / 100));
          return Math.max(0, Math.floor(raw * mult));
        };
        const magicWeaponDamage = (weapon) => {
          const ml = Math.max(0, Number(playerMagicLevel || 0));
          const lv = Math.max(1, Number(playerLevel || 1));
          const attrs = Array.isArray(weapon && weapon.attributes) ? weapon.attributes : [];
          const drRow = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_range');
          const dr = drRow ? parseDamageRangeString(drRow.value) : null;
          const typeKey = weaponSkillTypeKey(weapon);
          const skillLevel = getWeaponSkillLevelByType(typeKey);
          const skillBonus = Math.max(0, Math.floor((skillLevel - 10) * 0.25));
          if (dr) {
            const rolled = Phaser.Math.Between(dr.min, dr.max);
            const mlFactor = 1 + ml * 0.045;
            const lvFactor = 1 + (lv - 1) * 0.01;
            return Math.max(1, Math.floor(rolled * mlFactor * lvFactor + skillBonus));
          }
          const weaponAttack = Math.max(0, Number((weapon && weapon.attack_value) || 0));
          return Math.max(5, Math.floor(3 + lv * 0.55 + ml * 3.0 + weaponAttack * 0.65 + skillBonus));
        };
        const currentPlayerDamage = (handOverride = undefined) => {
          const hand = handOverride === undefined ? getEquippedHandWeapon() : handOverride;
          if (isMagicRangedWeapon(hand)) return magicWeaponDamage(hand);
          if (!hand) {
            // Keep unarmed damage clearly below weapon damage progression.
            const fistBonus = Math.max(0, Math.floor((playerFistLevel - 10) * 0.6));
            return Math.max(1, Math.floor(3 + playerLevel * 0.22 + fistBonus));
          }
          const weaponAttack = Math.max(0, Number((hand && hand.attack_value) || 0));
          const rangedAmmoBonus = requiresAmmoForWeapon(hand) ? ammoAttackBonus(hand) : 0;
          const typeKey = weaponSkillTypeKey(hand);
          const skillLevel = getWeaponSkillLevelByType(typeKey);
          const weaponSkillBonus = Math.max(0, Math.floor((skillLevel - 10) * 0.8));
          const weaponBaseBonus = 6;
          const scaledWeaponAttack = Math.floor(weaponAttack * 1.35);
          return Math.max(2, playerBaseDamage + weaponBaseBonus + scaledWeaponAttack + rangedAmmoBonus + weaponSkillBonus);
        };
        const isThrowableWeapon = (item) => {
          if (!item) return false;
          if (item.throwable) return true;
          return String(item.type_secondary || '').toLowerCase() === 'throwing weapons';
        };
        const isClassicDistanceWeapon = (item) => (
          item
          && String(item.item_class || '').toLowerCase() === 'weapons'
          && String(item.item_type || '').toLowerCase() === 'distance weapons'
        );
        const isDistanceWeapon = (item) => isClassicDistanceWeapon(item) || isMagicRangedWeapon(item);
        const ammoKindForWeapon = (weapon) => {
          const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
          if (secondary.includes('crossbow')) return 'bolt';
          if (secondary.includes('bow')) return 'arrow';
          return null;
        };
        const ammoKindForItem = (ammoItem) => {
          if (!ammoItem) return null;
          if (String(ammoItem.item_type || '').toLowerCase() !== 'ammunition') return null;
          const title = String(ammoItem.title || '').toLowerCase();
          if (title.includes('bolt')) return 'bolt';
          if (title.includes('arrow')) return 'arrow';
          return null;
        };
        const isAmmoCompatibleWithWeapon = (weapon, ammoItem) => {
          const needed = ammoKindForWeapon(weapon);
          if (!needed) return true;
          const has = ammoKindForItem(ammoItem);
          return has === needed;
        };
        const requiresAmmoForWeapon = (item) => Boolean(
          item
          && isClassicDistanceWeapon(item)
          && !isThrowableWeapon(item)
        );
        const hasAmmoForWeapon = (item) => {
          if (!requiresAmmoForWeapon(item)) return true;
          const ammo = getEquippedAmmo();
          if (!ammo) return false;
          const count = Math.max(0, Number(ammo.count || 0));
          if (count <= 0) return false;
          return isAmmoCompatibleWithWeapon(item, ammo);
        };
        const spendOneAmmo = (weapon) => {
          if (!requiresAmmoForWeapon(weapon)) return true;
          const ammo = getEquippedAmmo();
          if (!ammo) return false;
          if (!isAmmoCompatibleWithWeapon(weapon, ammo)) return false;
          const currentCount = Math.max(0, Number(ammo.count || 0));
          if (currentCount <= 0) return false;
          if (currentCount > 1) {
            const nextAmmo = { ...ammo, count: currentCount - 1 };
            if (typeof inventorySetEquippedSlotVisual !== 'function') return false;
            inventorySetEquippedSlotVisual('ammunition', nextAmmo, `${ammo.title}: ${currentCount - 1} left.`);
          } else {
            if (typeof inventoryClearEquippedSlotVisual !== 'function') return false;
            inventoryClearEquippedSlotVisual('ammunition', 'Out of ammunition.');
          }
          return true;
        };
        const rangeFromAttributes = (item) => {
          const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
          const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'range');
          if (!row) return null;
          const n = Number(row.value);
          return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
        };
        const effectiveWeaponRange = (item) => {
          if (!item) return 1;
          if (isMagicRangedWeapon(item)) {
            const fromAttrs = rangeFromAttributes(item);
            return fromAttrs != null ? fromAttrs : 5;
          }
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
          const ml = Math.max(0, Number(playerMagicLevel || 0));
          if (title.includes('ultimate')) return Math.max(20, Math.floor(36 + playerLevel * 1.2 + ml * 6.2));
          if (title.includes('intense')) return Math.max(14, Math.floor(24 + playerLevel * 1.0 + ml * 4.6));
          if (title.includes('light')) return Math.max(8, Math.floor(12 + playerLevel * 0.7 + ml * 3.0));
          return Math.max(10, Math.floor(16 + playerLevel * 0.9 + ml * 3.8));
        };
        const inferAttackDamage = (spell) => {
          const manaCost = Math.max(0, Number((spell && spell.mana) || 0));
          const ml = Math.max(0, Number(playerMagicLevel || 0));
          return Math.max(6, Math.floor(4 + playerLevel * 0.8 + ml * 3.4 + manaCost * 0.18));
        };
        const isSingleTargetAttackPattern = (pattern) => {
          if (!pattern || typeof pattern !== 'object') return true;
          if (pattern.kind === 'projectile') return true;
          if (pattern.kind === 'front_box') {
            const width = Math.max(1, Number(pattern.width || 1));
            const depth = Math.max(1, Number(pattern.depth || 1));
            return width === 1 && depth === 1;
          }
          return false;
        };
        const inferClassAdjustedSpellDamage = (spell, opts = {}) => {
          const baseSpellDamage = inferAttackDamage(spell);
          const spellTitle = String((spell && spell.title) || '').toLowerCase();
          if (playerClassKey === 'paladin' && spellTitle === 'lesser ethereal spear') {
            const equippedWeaponDamage = Math.max(1, Number(currentPlayerDamage()) || 1);
            const distanceFighting = Math.max(10, Number(getWeaponSkillLevelByType('distance weapons')) || 10);
            return Math.max(1, (equippedWeaponDamage + distanceFighting) * 10);
          }
          if (playerClassKey !== 'knight') return baseSpellDamage;
          const currentWeaponDamage = Math.max(1, Number(currentPlayerDamage()) || 1);
          const area = Boolean(opts.area);
          if (area) {
            // Knight AoE attack spells also include current weapon damage.
            return Math.max(1, baseSpellDamage + currentWeaponDamage);
          }
          // Knight single-target attack spells hit for double current weapon damage.
          return Math.max(1, currentWeaponDamage * 2);
        };
        const conjureArrowPayloadFromSpell = (spell) => {
          const effectRaw = String((spell && spell.raw && spell.raw.effect) || '').trim();
          if (!effectRaw) return null;
          // Ignore legacy descriptions like "used to create ...".
          if (/used\s+to\s+create/i.test(effectRaw)) return null;
          const m = effectRaw.match(/creates?\s+(\d+)\s+(.+?)\.\s*$/i);
          if (!m) return null;
          const count = Math.max(1, Number(m[1] || 1));
          const createdNameRaw = String(m[2] || '').trim();
          if (!/arrow/i.test(createdNameRaw)) return null;
          const normalized = createdNameRaw
            .replace(/\barrows\b/ig, 'Arrow')
            .replace(/\s+/g, ' ')
            .trim();
          return {
            count,
            title: normalized,
          };
        };
        const resolveConjuredArrowItem = (arrowTitle) => {
          const wanted = String(arrowTitle || '').trim().toLowerCase();
          if (!wanted) return null;
          const ammoItems = (itemsShopCatalog || []).filter((it) => (
            it
            && String(it.item_type || '').toLowerCase() === 'ammunition'
          ));
          // Exact title match first.
          const exact = ammoItems.find((it) => String(it.title || '').trim().toLowerCase() === wanted);
          if (exact) return exact;
          // Singular/plural fallback.
          const singularWanted = wanted.replace(/\barrows\b/g, 'arrow').trim();
          const singular = ammoItems.find((it) => String(it.title || '').trim().toLowerCase() === singularWanted);
          if (singular) return singular;
          return null;
        };
        const placeConjuredArrow = (ammoItem, amount) => {
          if (!ammoItem) return null;
          const qty = Math.max(1, Number(amount || 1));
          const equippedAmmo = getEquippedAmmo();
          const sameAmmoEquipped = Boolean(
            equippedAmmo
            && Number(equippedAmmo.id) === Number(ammoItem.id)
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

          // Keep current ammo equipped if it is a different type:
          // conjured arrows should go to loot (stacking there if possible).
          if (equippedAmmo) {
            const storedInBag = addLootItemToBag(
              { ...ammoItem, isStackable: true, count: qty },
              { disableAutoEquip: true }
            );
            return storedInBag ? 'bag' : null;
          }

          // Ammo slot empty: equip conjured ammo directly.
          if (typeof inventorySetEquippedSlotVisual !== 'function') return null;
          const equipped = inventorySetEquippedSlotVisual(
            'ammunition',
            { ...ammoItem, isStackable: true, count: qty },
            `Conjured ${qty} ${ammoItem.title}${qty > 1 ? 's' : ''} to ammo slot.`
          );
          return equipped ? 'ammo' : null;
        };
        const showSpellTileEffect = (tiles, color = 0xf59e0b, opts = {}) => {
          const duration = opts.duration != null ? opts.duration : 300;
          const delayStep = opts.delayStep != null ? opts.delayStep : 0;
          const order = opts.order || null;
          const glyphChar = opts.glyph != null ? opts.glyph : '✦';
          const glyphColor = opts.glyphColor != null ? opts.glyphColor : '#fde68a';
          let list = (tiles || []).filter((t) => isWalkableTile(t.gx, t.gy));
          if (order === 'beam') {
            list = list.slice().sort((a, b) => (
              (Math.abs(a.gx - gridX) + Math.abs(a.gy - gridY))
              - (Math.abs(b.gx - gridX) + Math.abs(b.gy - gridY))
            ));
          }
          list.forEach((t, i) => {
            const delay = i * delayStep;
            const spawnFx = () => {
              tileSpellBurst(this, centerX(t.gx), centerY(t.gy), tileSize, color, {
                duration,
                glyph: glyphChar,
                glyphColor,
              });
            };
            if (delay > 0) this.time.delayedCall(delay, spawnFx);
            else spawnFx();
          });
        };
        const spellFxProfile = (spell) => {
          const element = String((spell && spell.raw && spell.raw.element) || '').toLowerCase();
          const title = String((spell && spell.title) || '').toLowerCase();
          if (element.includes('fire') || title.includes('flame') || title.includes('fire')) return { color: 0xfb7185, glyph: '✹' };
          if (element.includes('ice') || title.includes('ice') || title.includes('frigo')) return { color: 0x93c5fd, glyph: '❄' };
          if (element.includes('energy') || title.includes('energy') || title.includes('vis')) return { color: 0xa78bfa, glyph: '✧' };
          if (element.includes('earth') || title.includes('terra')) return { color: 0x86efac, glyph: '✶' };
          if (element.includes('holy') || title.includes('divine') || title.includes('san')) return { color: 0xfde68a, glyph: '✦' };
          if (element.includes('death') || title.includes('mort')) return { color: 0xc4b5fd, glyph: '✢' };
          if (title.includes('heal') || title.includes('exura')) return { color: 0x60a5fa, glyph: '✚' };
          return { color: 0x7dd3fc, glyph: '✧' };
        };
        const showSpellAuraEffect = (x, y, spell, scale = 1) => {
          const fx = spellFxProfile(spell);
          spellAuraBurst(this, x, y, tileSize, fx.color, fx.glyph, scale);
        };
        const showSpellProjectileEffect = (spell, target) => {
          if (!spell || !target || !target.sprite) return;
          const fx = spellFxProfile(spell);
          spellProjectileLine(this, player.x, player.y, target.sprite.x, target.sprite.y, fx.color, fx.glyph, () => {
            showSpellAuraEffect(target.sprite.x, target.sprite.y, spell, 0.9);
          });
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
        const frontSingleTile = () => {
          if (playerFacingFrame === 0) return { gx: gridX, gy: gridY + 1 };
          if (playerFacingFrame === 2) return { gx: gridX, gy: gridY - 1 };
          if (playerFacingFrame === 1) return { gx: gridX + 1, gy: gridY };
          return { gx: gridX - 1, gy: gridY };
        };
        const frontConeTiles = (depth = 3) => {
          const tiles = [];
          for (let i = 1; i <= depth; i += 1) {
            const spread = Math.min(2, i - 1);
            for (let s = -spread; s <= spread; s += 1) {
              let gx = gridX;
              let gy = gridY;
              if (playerFacingFrame === 0) { gx += s; gy += i; } // south
              else if (playerFacingFrame === 2) { gx += s; gy -= i; } // north
              else if (playerFacingFrame === 1) { gx += i; gy += s; } // east
              else { gx -= i; gy += s; } // west
              tiles.push({ gx, gy });
            }
          }
          return tiles;
        };
        const frontBeamTiles = (len = 5) => {
          const tiles = [];
          for (let i = 1; i <= len; i += 1) {
            let gx = gridX;
            let gy = gridY;
            if (playerFacingFrame === 0) gy += i;
            else if (playerFacingFrame === 2) gy -= i;
            else if (playerFacingFrame === 1) gx += i;
            else gx -= i;
            tiles.push({ gx, gy });
          }
          return tiles;
        };
        const aroundCasterTiles = (radius = 1) => {
          const tiles = [];
          for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              tiles.push({ gx: gridX + dx, gy: gridY + dy });
            }
          }
          return tiles;
        };
        const ringAroundCasterTiles = (radius) => {
          const tiles = [];
          const r = Math.max(1, Math.floor(Number(radius) || 1));
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              tiles.push({ gx: gridX + dx, gy: gridY + dy });
            }
          }
          return tiles;
        };
        const frontPlusTiles = (reach = 2) => {
          let cx = gridX;
          let cy = gridY;
          const rk = Math.max(1, Math.floor(Number(reach) || 1));
          if (playerFacingFrame === 0) cy += rk;
          else if (playerFacingFrame === 2) cy -= rk;
          else if (playerFacingFrame === 1) cx += rk;
          else cx -= rk;
          return [
            { gx: cx, gy: cy },
            { gx: cx - 1, gy: cy },
            { gx: cx + 1, gy: cy },
            { gx: cx, gy: cy - 1 },
            { gx: cx, gy: cy + 1 },
          ];
        };
        const frontBoxTiles = (width, depth) => {
          const tiles = [];
          const w = Math.max(1, Math.floor(Number(width) || 3));
          const d = Math.max(1, Math.floor(Number(depth) || 1));
          const half = Math.floor(w / 2);
          for (let row = 1; row <= d; row += 1) {
            for (let c = -half; c <= half; c += 1) {
              let gx = gridX;
              let gy = gridY;
              if (playerFacingFrame === 0) { gx += c; gy += row; }
              else if (playerFacingFrame === 2) { gx += c; gy -= row; }
              else if (playerFacingFrame === 1) { gx += row; gy += c; }
              else { gx -= row; gy += c; }
              tiles.push({ gx, gy });
            }
          }
          return tiles;
        };
        const resolvePatternTiles = (pattern) => {
          if (!pattern || pattern.kind === 'projectile') return null;
          switch (pattern.kind) {
            case 'front_sweep':
              return frontSweepTiles();
            case 'beam':
              return frontBeamTiles(pattern.depth ?? 5);
            case 'cone':
              return frontConeTiles(pattern.depth ?? 3);
            case 'nova':
              return aroundCasterTiles(pattern.radius ?? 1);
            case 'ring':
              return ringAroundCasterTiles(pattern.radius ?? 2);
            case 'plus':
              return frontPlusTiles(pattern.reach ?? 2);
            case 'front_box':
              return frontBoxTiles(pattern.width ?? 3, pattern.depth ?? 2);
            default:
              return null;
          }
        };
        const spellAttackPattern = (spell) => {
          const title = String((spell && spell.title) || '').toLowerCase();
          const wikiOverride = SPELL_FX_OVERRIDES[title];
          if (wikiOverride) return { ...wikiOverride };
          const effect = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
          if (title.includes('front sweep')) return { kind: 'front_sweep', depth: 1 };
          if (title.includes('beam')) return { kind: 'beam', depth: title.includes('great') ? 8 : 5 };
          if (title.includes('wave') || effect.includes('directly in front')) {
            return { kind: 'cone', depth: title.includes('strong') || title.includes('great') ? 4 : 3 };
          }
          if (title.includes('berserk') || title.includes('groundshaker')) return { kind: 'nova', radius: 1 };
          if (
            title.includes('caldera')
            || title.includes('core')
            || title.includes('winter')
            || title.includes('wrath')
            || title.includes('skies')
            || title.includes('storm')
            || title.includes('shower')
            || (title.includes('burst') && !title.includes('ice burst') && !title.includes('terra burst'))
            || effect.includes('around the caster')
          ) return { kind: 'nova', radius: 2 };
          if (title.includes('ice burst') || title.includes('terra burst')) return { kind: 'ring', radius: 2 };
          return { kind: 'projectile', depth: inferSpellRange(spell) };
        };
        const castPatternAttackSpell = (spell, slotNumber) => {
          const pattern = spellAttackPattern(spell);
          if (!pattern || pattern.kind === 'projectile') return false;
          const tilesRaw = resolvePatternTiles(pattern);
          if (!tilesRaw || tilesRaw.length === 0) return false;
          const tiles = tilesRaw.filter((t) => isWalkableTile(t.gx, t.gy));
          if (tiles.length === 0) return false;
          const prof = spellFxProfile(spell);
          const color = pattern.color != null ? pattern.color : prof.color;
          const po = pattern.fx && typeof pattern.fx === 'object' ? pattern.fx : {};
          const fxOpts = {
            ...po,
            glyph: po.glyph != null ? po.glyph : prof.glyph,
          };
          showSpellTileEffect(tiles, color, fxOpts);
          const impacted = [];
          const spellElem = inferSpellDamageElementKey(spell);
          const isAreaPattern = !isSingleTargetAttackPattern(pattern);
          for (const t of tiles) {
            const target = creatureAt(t.gx, t.gy);
            if (!target) continue;
            const crit = didAttackCrit();
            const base = inferClassAdjustedSpellDamage(spell, { area: isAreaPattern });
            const dmgRaw = crit ? applyCriticalDamage(base) : base;
            const dmg = applyIncomingElementalDamage(dmgRaw, target, spellElem);
            target.hp = Math.max(0, target.hp - dmg);
            showCreatureHitEffect(target, dmg);
            if (crit) showCritText(target.sprite.x, target.sprite.y);
            impacted.push({ target, dmg });
            if (target.hp <= 0) {
              target.alive = false;
              target.sprite.setVisible(false);
              updateCreatureBar(target);
              grantPlayerXp(effectiveXpFromCreature(target));
              runKills += 1;
            }
          }
          if (impacted.length === 0) {
            addCombatLog(`Cast [${slotNumber}] ${spell.title}, but it hits nothing.`, LOG_COLORS.SPELL);
          } else {
            const detail = impacted.map((x) => `${x.target.title}(${x.dmg})`).join(', ');
            addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${detail}.`, LOG_COLORS.SPELL);
          }
          return true;
        };
        const castLearnedSpell = (slotNumber, now) => {
          const articleId = learnedSpellSlots[slotNumber - 1];
          if (!articleId) return false;
          const spell = (spellsCatalog || []).find((s) => Number(s.article_id) === Number(articleId));
          if (!spell) return false;
          if (isBlockedSpellTitle(spell.title)) return false;
          const title = String(spell.title || '').toLowerCase();
          const isMagicRopeSpell = title === 'magic rope';
          if (isMagicRopeSpell && !hasRopeUpAtPlayer()) {
            addCombatLog('Cast Magic Rope on the entry tile (where you appear on this floor).');
            return true;
          }
          if (isMagicRopeSpell && currentLevel <= 1) {
            addCombatLog('You are already on floor 1.');
            return true;
          }
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
          if (isMagicRopeSpell) {
            updatePlayerBar();
            return tryClimbUpFloor(spell.title || 'Magic Rope');
          }
          const conjuredArrow = conjureArrowPayloadFromSpell(spell);
          if (conjuredArrow) {
            const ammoItem = resolveConjuredArrowItem(conjuredArrow.title);
            if (!ammoItem) {
              addCombatLog(`Cast [${slotNumber}] ${spell.title}, but no matching arrow item was found.`, LOG_COLORS.SPELL);
            } else {
              const placedAt = placeConjuredArrow(ammoItem, conjuredArrow.count);
              if (placedAt === 'ammo') {
                addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${conjuredArrow.count} ${ammoItem.title}${conjuredArrow.count > 1 ? 's' : ''} equipped in ammo slot.`, LOG_COLORS.SPELL);
              } else if (placedAt === 'bag') {
                addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${conjuredArrow.count} ${ammoItem.title}${conjuredArrow.count > 1 ? 's' : ''} added to loot bag.`, LOG_COLORS.SPELL);
              } else {
                addCombatLog(`Cast [${slotNumber}] ${spell.title}, but ammo creation failed (bag full/capacity).`, LOG_COLORS.SPELL);
              }
            }
            updatePlayerBar();
            updateHud();
            return true;
          }
          if (group === 'healing' || title.includes('healing') || title.includes('exura')) {
            const heal = inferHealingAmount(spell);
            const prev = playerHp;
            playerHp = Math.min(playerMaxHp, playerHp + heal);
            const gained = Math.max(0, playerHp - prev);
            addCombatLog(`Cast [${slotNumber}] ${spell.title}: +${gained} HP.`, LOG_COLORS.SPELL);
            showSpellAuraEffect(player.x, player.y, spell, 1.1);
            showDrinkEffect(`+${gained} HP`, '#60a5fa');
          } else if (group === 'attack') {
            if (castPatternAttackSpell(spell, slotNumber)) {
              updatePlayerBar();
              updateHud();
              return true;
            }
            const target = findNearestRangedTarget(inferSpellRange(spell));
            if (!target) {
              const front = frontSingleTile();
              const frontTarget = isWalkableTile(front.gx, front.gy) ? creatureAt(front.gx, front.gy) : null;
              if (!frontTarget) {
                showSpellAuraEffect(player.x, player.y, spell, 0.8);
                addCombatLog(`Cast [${slotNumber}] ${spell.title}, but no target in range.`, LOG_COLORS.SPELL);
              } else {
                showSpellTileEffect([front], spellFxProfile(spell).color, { duration: 220 });
                const crit = didAttackCrit();
                const base = inferClassAdjustedSpellDamage(spell, { area: false });
                const dmgRaw = crit ? applyCriticalDamage(base) : base;
                const spellElem = inferSpellDamageElementKey(spell);
                const dmg = applyIncomingElementalDamage(dmgRaw, frontTarget, spellElem);
                frontTarget.hp = Math.max(0, frontTarget.hp - dmg);
                showCreatureHitEffect(frontTarget, dmg);
                if (crit) showCritText(frontTarget.sprite.x, frontTarget.sprite.y);
                addCombatLog(`${spell.title} hits ${frontTarget.title} for ${dmg}.`, LOG_COLORS.SPELL);
                if (frontTarget.hp <= 0) {
                  frontTarget.alive = false;
                  frontTarget.sprite.setVisible(false);
                  updateCreatureBar(frontTarget);
                  grantPlayerXp(effectiveXpFromCreature(frontTarget));
                  addCombatLog(`${frontTarget.title} dies from ${spell.title}.`);
                }
              }
            } else if (didAttackMiss()) {
              if (title.includes('ethereal spear')) {
                showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
              } else {
                showSpellProjectileEffect(spell, target);
              }
              showMissSmoke(target.sprite.x, target.sprite.y);
              addCombatLog(`Your ${spell.title} misses ${target.title}.`, LOG_COLORS.SPELL);
            } else {
              if (title.includes('ethereal spear')) {
                showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
                showSpellAuraEffect(target.sprite.x, target.sprite.y, spell, 0.9);
              } else {
                showSpellProjectileEffect(spell, target);
              }
              const crit = didAttackCrit();
              const base = inferClassAdjustedSpellDamage(spell, { area: false });
              const dmgRaw = crit ? applyCriticalDamage(base) : base;
              const spellElem = inferSpellDamageElementKey(spell);
              const dmg = applyIncomingElementalDamage(dmgRaw, target, spellElem);
              target.hp = Math.max(0, target.hp - dmg);
              showCreatureHitEffect(target, dmg);
              if (crit) showCritText(target.sprite.x, target.sprite.y);
              addCombatLog(`${spell.title} hits ${target.title} for ${dmg}.`, LOG_COLORS.SPELL);
              if (target.hp <= 0) {
                target.alive = false;
                target.sprite.setVisible(false);
                updateCreatureBar(target);
                grantPlayerXp(effectiveXpFromCreature(target));
                runKills += 1;
                addCombatLog(`${target.title} dies from ${spell.title}.`);
              }
            }
          } else {
            const effect = String((spell.raw && spell.raw.effect) || '').toLowerCase();
            showSpellAuraEffect(player.x, player.y, spell, 1.0);
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
          let activeWeapon = handWeapon;
          if (activeWeapon && requiresAmmoForWeapon(activeWeapon) && !hasAmmoForWeapon(activeWeapon)) {
            const equippedAmmo = getEquippedAmmo();
            if (equippedAmmo && !isAmmoCompatibleWithWeapon(activeWeapon, equippedAmmo)) {
              addCombatLog(`Wrong ammo for ${activeWeapon.title}. Attacking with base melee.`);
            } else {
              addCombatLog(`Out of ammo for ${activeWeapon.title}. Attacking with base melee.`);
            }
            activeWeapon = null;
          }
          if (activeWeapon && requiresAmmoForWeapon(activeWeapon)) {
            const consumed = spendOneAmmo(activeWeapon);
            if (!consumed) {
              const equippedAmmo = getEquippedAmmo();
              if (equippedAmmo && !isAmmoCompatibleWithWeapon(activeWeapon, equippedAmmo)) {
                addCombatLog(`Wrong ammo for ${activeWeapon.title}. Attacking with base melee.`);
              } else {
                addCombatLog(`Out of ammo for ${activeWeapon.title}. Attacking with base melee.`);
              }
              activeWeapon = null;
            }
          }
          if (activeWeapon && isDistanceWeapon(activeWeapon)) {
            showRangedProjectileEffect(activeWeapon, targetCreature);
            gainWeaponSkillUse(activeWeapon, 1);
          } else if (activeWeapon && String(activeWeapon.item_class || '').toLowerCase() === 'weapons') {
            gainWeaponSkillUse(activeWeapon, 1);
          } else if (!activeWeapon) {
            gainFistSkillUse(1);
          }
          if (didAttackMiss(activeWeapon)) {
            showMissSmoke(targetCreature.sprite.x, targetCreature.sprite.y);
            addCombatLog(`You miss your hit against ${targetCreature.title}.`);
          } else {
            const isCrit = didAttackCrit();
            const baseDamage = currentPlayerDamage(activeWeapon);
            const damage = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
            let elemKey = 'physical';
            if (activeWeapon && isMagicRangedWeapon(activeWeapon)) {
              elemKey = normalizeDamageTypeToModifierKey(magicWeaponDamageTypeRaw(activeWeapon)) || 'energy';
            }
            const dealt = applyIncomingElementalDamage(damage, targetCreature, elemKey);
            targetCreature.hp = Math.max(0, targetCreature.hp - dealt);
            showCreatureHitEffect(targetCreature, dealt);
            if (isCrit) {
              showCritText(targetCreature.sprite.x, targetCreature.sprite.y);
            }
            const dtHit = magicWeaponDamageTypeSuffix(activeWeapon);
            addCombatLog(
              isCrit
                ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit}.`
                : `You hit ${targetCreature.title} for ${dealt}${dtHit}.`,
              isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
            );
            if (targetCreature.hp <= 0) {
              targetCreature.alive = false;
              targetCreature.sprite.setVisible(false);
              updateCreatureBar(targetCreature);
              grantPlayerXp(effectiveXpFromCreature(targetCreature));
              runKills += 1;
              addCombatLog(
                isCrit
                  ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit}, and it dies.`
                  : `You hit ${targetCreature.title} for ${dealt}${dtHit} and it dies.`,
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
                  const lootCount = Math.max(1, Math.floor(Number(d.lootCount) || 1));
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
                    count: lootCount,
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
                        count: lootCount,
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
                  ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit} (${targetCreature.hp} HP).`
                  : `You hit ${targetCreature.title} for ${dealt}${dtHit} (${targetCreature.hp} HP).`,
                isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
              );
            }
          }
          if (activeWeapon && isDistanceWeapon(activeWeapon) && isThrowableWeapon(activeWeapon) && Math.random() < 0.1) {
            const currentCount = Math.max(1, Number(activeWeapon.count || 1));
            if (currentCount > 1) {
              if (typeof inventorySetEquippedSlotVisual === 'function') {
                inventorySetEquippedSlotVisual('hand', { ...activeWeapon, count: currentCount - 1 }, `${activeWeapon.title} consumed on throw (${currentCount - 1} left).`);
              }
            } else if (window.debugInventory && typeof window.debugInventory.unequipHand === 'function') {
              window.debugInventory.unequipHand();
            }
            addCombatLog(`${activeWeapon.title} was consumed after the throw.`);
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
        const didAttackMiss = (weapon = null) => {
          const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
          if (secondary === 'throwing weapons') return Math.random() < 0.5;
          return Math.random() < 0.1;
        };
        const didAttackCrit = () => Math.random() < 0.1;
        const applyCriticalDamage = (baseDamage) => Math.max(1, Math.round(baseDamage * 2.5)); // +150%
        const projectileVisualForWeapon = (weapon) => {
          const title = String((weapon && weapon.title) || '').toLowerCase();
          const itemType = String((weapon && weapon.item_type) || '').toLowerCase();
          const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
          if (itemType === 'wands') return { glyph: '✦', color: '#a78bfa', size: 18 };
          if (itemType === 'rods') return { glyph: '✧', color: '#60a5fa', size: 18 };
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
          if (isMagicRangedWeapon(weapon)) {
            const colorHex = Number(
              String(visual.color || '#a78bfa').replace('#', '0x')
            );
            spellProjectileLine(this, player.x, player.y, target.sprite.x, target.sprite.y, colorHex, visual.glyph, () => {
              spellAuraBurst(this, target.sprite.x, target.sprite.y, tileSize, colorHex, visual.glyph, 0.9);
            });
            return;
          }
          rangedProjectileLine(this, player.x, player.y, target.sprite.x, target.sprite.y, visual, 150);
        };
        const showCritText = (x, y) => {
          critBanner(this, x, y, tileSize);
        };
        const showMissSmoke = (x, y) => {
          missEffect(this, x, y, tileSize);
        };
        const showPlayerHitEffect = (dmg) => {
          if (playerDead) return;
          flashCamera(this, 55, 90, 18, 24);
          radialSparkBurst(this, player.x, player.y - 4, 0xff6b6b, 12);
          shockwaveRing(this, player.x, player.y, 0xff5555, { startR: 10, endScale: 2, duration: 220 });
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
          floatingCombatText(this, player.x, player.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff9b9b',
            fontSize: '17px',
          });
        };
        const showCreatureHitEffect = (creature, dmg) => {
          if (!creature || !creature.sprite || !creature.sprite.scene) return;
          radialSparkBurst(this, creature.sprite.x, creature.sprite.y - 4, 0xff6b6b, 10);
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
              applyCreatureNormalizedDisplaySize(creature.sprite, this, tileSize);
              creature.sprite.x = centerX(creature.gx);
              creature.sprite.y = centerY(creature.gy);
              updateCreatureBar(creature);
            },
          });
          floatingCombatText(this, creature.sprite.x, creature.sprite.y - tileSize * 0.65, `-${dmg}`, {
            color: '#ff9b9b',
            fontSize: '17px',
          });
        };
        const parseAbilityDamage = (ability, fallbackMax) => {
          const raw = String((ability && ability.effect) || '');
          const nums = raw.match(/\d+/g) || [];
          const baseMax = Math.max(1, Number(fallbackMax || 1));
          const safeCap = Math.max(8, Math.floor(baseMax * 1.6));
          if (nums.length === 0) return Phaser.Math.Between(1, safeCap);
          if (nums.length === 1) return Phaser.Math.Clamp(Math.max(1, Number(nums[0])), 1, safeCap);
          const a = Math.max(1, Number(nums[0]));
          const b = Math.max(1, Number(nums[1]));
          const lo = Phaser.Math.Clamp(Math.min(a, b), 1, safeCap);
          const hi = Phaser.Math.Clamp(Math.max(a, b), lo, safeCap);
          return Phaser.Math.Between(lo, hi);
        };
        const bresenhamLineTiles = (x0, y0, x1, y1) => {
          const pts = [];
          let x = x0;
          let y = y0;
          const dx = Math.abs(x1 - x0);
          const dy = Math.abs(y1 - y0);
          const sx = x0 < x1 ? 1 : -1;
          const sy = y0 < y1 ? 1 : -1;
          let err = dx - dy;
          let guard = 0;
          while (true) {
            guard += 1;
            if (guard > 256) {
              pts.push({ gx: x1, gy: y1 });
              break;
            }
            pts.push({ gx: x, gy: y });
            if (x === x1 && y === y1) break;
            const e2 = 2 * err;
            if (e2 > -dy) {
              err -= dy;
              x += sx;
            }
            if (e2 < dx) {
              err += dx;
              y += sy;
            }
          }
          return pts;
        };
        const lineToPlayerFromCreature = (creature, maxLen) => {
          const lim = Math.max(1, Math.floor(Number(maxLen) || 6));
          const line = bresenhamLineTiles(creature.gx, creature.gy, gridX, gridY);
          if (line.length <= 1) return [{ gx: gridX, gy: gridY }];
          const out = [];
          for (let i = 1; i < line.length && out.length < lim; i += 1) {
            const p = line[i];
            if (!isWalkableTile(p.gx, p.gy)) break;
            // Ranged attacks cannot cross walls.
            if (isWallTile(p.gx, p.gy)) break;
            out.push(p);
            if (p.gx === gridX && p.gy === gridY) break;
          }
          return out;
        };
        const creatureConeTowardPlayer = (creature, depth) => {
          const d = Math.max(1, Math.floor(Number(depth) || 3));
          const cx = creature.gx;
          const cy = creature.gy;
          const px = gridX - cx;
          const py = gridY - cy;
          if (px === 0 && py === 0) return [];
          let sx = 0;
          let sy = 0;
          const ax = Math.abs(px);
          const ay = Math.abs(py);
          if (ax >= ay) sx = Math.sign(px);
          else sy = Math.sign(py);
          const tiles = [];
          for (let i = 1; i <= d; i += 1) {
            const spread = Math.min(2, i - 1);
            for (let k = -spread; k <= spread; k += 1) {
              let gx = cx + sx * i;
              let gy = cy + sy * i;
              if (sx !== 0) gy += k;
              else gx += k;
              tiles.push({ gx, gy });
            }
          }
          return tiles;
        };
        const tilesNovaAroundCreature = (creature, radius, excludeCenter = true) => {
          const r = Math.max(0, Math.floor(Number(radius) || 1));
          const cx = creature.gx;
          const cy = creature.gy;
          const tiles = [];
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
              if (excludeCenter && dx === 0 && dy === 0) continue;
              tiles.push({ gx: cx + dx, gy: cy + dy });
            }
          }
          return tiles;
        };
        const tilesNovaAtPoint = (px, py, radius) => {
          const r = Math.max(0, Math.floor(Number(radius) || 1));
          const tiles = [];
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
              tiles.push({ gx: px + dx, gy: py + dy });
            }
          }
          return tiles;
        };
        const plusTilesAt = (px, py) => [
          { gx: px, gy: py },
          { gx: px - 1, gy: py },
          { gx: px + 1, gy: py },
          { gx: px, gy: py - 1 },
          { gx: px, gy: py + 1 },
        ];
        const ringTilesAt = (px, py, radius) => {
          const r = Math.max(1, Math.floor(Number(radius) || 2));
          const tiles = [];
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              tiles.push({ gx: px + dx, gy: py + dy });
            }
          }
          return tiles;
        };
        const resolveCreatureAbilityTiles = (creature, pattern) => {
          if (!pattern || pattern.kind === 'none') return [];
          switch (pattern.kind) {
            case 'player_cell': {
              if (!hasRangedLineOfSight(creature.gx, creature.gy, gridX, gridY)) return [];
              return [{ gx: gridX, gy: gridY }];
            }
            case 'line_to_player':
              return lineToPlayerFromCreature(creature, pattern.maxLen ?? 8);
            case 'cone_to_player':
              return creatureConeTowardPlayer(creature, pattern.depth ?? 3);
            case 'nova_creature':
              return tilesNovaAroundCreature(creature, pattern.radius ?? 1, true);
            case 'nova_at_player':
              return tilesNovaAtPoint(gridX, gridY, pattern.radius ?? 1);
            case 'plus_on_player':
              return plusTilesAt(gridX, gridY);
            case 'ring_at_player':
              return ringTilesAt(gridX, gridY, pattern.radius ?? 2);
            default:
              if (!hasRangedLineOfSight(creature.gx, creature.gy, gridX, gridY)) return [];
              return [{ gx: gridX, gy: gridY }];
          }
        };
        const playerInAbilityTiles = (tiles) => (tiles || []).some((t) => t.gx === gridX && t.gy === gridY);
        const abilityStyle = (ability) => {
          const n = String((ability && ability.name) || '').toLowerCase();
          const el = String((ability && ability.element) || '').toLowerCase();
          if (el.includes('fire') || n.includes('fire')) return { color: 0xfb7185, glyph: '✹' };
          if (el.includes('ice') || n.includes('ice') || n.includes('frost')) return { color: 0x93c5fd, glyph: '❄' };
          if (el.includes('death') || n.includes('death') || n.includes('mort')) return { color: 0xc4b5fd, glyph: '✢' };
          if (el.includes('energy') || n.includes('energy') || n.includes('vis')) return { color: 0xa78bfa, glyph: '✧' };
          if (el.includes('earth') || n.includes('earth') || n.includes('poison')) return { color: 0x86efac, glyph: '✶' };
          if (el.includes('holy') || n.includes('holy')) return { color: 0xfde68a, glyph: '✦' };
          if (el.includes('healing') || n.includes('heal')) return { color: 0x60a5fa, glyph: '✚' };
          return { color: 0xe2e8f0, glyph: '✦' };
        };
        const showCreatureAbilityEffect = (creature, ability, affectedTiles = null) => {
          const style = abilityStyle(ability);
          void affectedTiles;
          const dist = Math.max(Math.abs(creature.gx - gridX), Math.abs(creature.gy - gridY));
          const ranged = dist > 1 && !String((ability && ability.name) || '').toLowerCase().includes('melee');
          if (ranged) {
            spellProjectileLine(
              this,
              creature.sprite.x,
              creature.sprite.y,
              player.x,
              player.y,
              style.color,
              style.glyph,
              () => {
                spellAuraBurst(this, player.x, player.y, tileSize, style.color, style.glyph, 0.85);
              }
            );
          } else {
            radialSparkBurst(this, player.x, player.y, style.color, 14);
            spellAuraBurst(this, player.x, player.y, tileSize, style.color, style.glyph, 0.95);
          }
        };
        const abilityType = (ability) => {
          const n = String((ability && ability.name) || '').toLowerCase();
          const el = String((ability && ability.element) || '').toLowerCase();
          if (n === 'none' || n.includes('probably other') || n.includes('and more')) return 'utility';
          if (el.includes('healing') || n.includes('self-heal') || n.includes('self healing') || (n.includes('self') && n.includes('heal'))) {
            return 'heal';
          }
          if (inferCreatureAbilityPattern(ability).kind === 'none') return 'utility';
          if (el.includes('summon') || n.includes('summon')) return 'utility';
          if (n.includes('invisib')) return 'utility';
          if (n.includes('melee')) return 'melee';
          return 'offensive';
        };
        let attackersPressureInTurn = 0;
        const applyMultiAttackerPressure = (baseDamage) => {
          const raw = Math.max(1, Math.floor(Number(baseDamage) || 1));
          const bonusMultiplier = Phaser.Math.Clamp(
            1 + (Math.max(0, attackersPressureInTurn) * 0.15),
            1,
            2.1
          );
          return Math.max(1, Math.floor(raw * bonusMultiplier));
        };
        const tryUseCreatureAbility = (creature) => {
          const abilities = Array.isArray(creature && creature.abilities) ? creature.abilities : [];
          if (abilities.length === 0) return false;
          const dist = Math.max(Math.abs(creature.gx - gridX), Math.abs(creature.gy - gridY));
          const options = abilities.filter((ab) => {
            const t = abilityType(ab);
            if (t === 'utility') return false;
            if (t === 'heal') return creature.hp < creature.maxHp && Math.random() < 0.5;
            if (t === 'melee') return dist <= 1;
            if (dist > 4) return false;
            if (!hasRangedLineOfSight(creature.gx, creature.gy, gridX, gridY)) return false;
            try {
              const pattern = inferCreatureAbilityPattern(ab);
              const tiles = resolveCreatureAbilityTiles(creature, pattern);
              return playerInAbilityTiles(tiles);
            } catch {
              return false;
            }
          });
          if (options.length === 0) return false;
          const ability = options[Math.floor(Math.random() * options.length)];
          const t = abilityType(ability);
          const pattern = inferCreatureAbilityPattern(ability);
          const abilityTiles = resolveCreatureAbilityTiles(creature, pattern);
          if (t === 'heal') {
            const heal = Math.max(5, Math.floor(parseAbilityDamage(ability, creature.maxDamage) * 0.35));
            creature.hp = Math.min(creature.maxHp, creature.hp + heal);
            showCreatureAbilityEffect(creature, ability, abilityTiles);
            updateCreatureBar(creature);
            addCombatLog(`${creature.title} uses ${ability.name} (+${heal} HP).`);
            return true;
          }
          if (!playerInAbilityTiles(abilityTiles)) {
            return false;
          }
          // Hard gate: offensive ranged abilities need clear line of sight.
          if (!hasRangedLineOfSight(creature.gx, creature.gy, gridX, gridY)) {
            return false;
          }
          showCreatureAbilityEffect(creature, ability, abilityTiles);
          if (didAttackMiss()) {
            showMissSmoke(player.x, player.y);
            addCombatLog(`${creature.title} uses ${ability.name}, but misses.`);
            return true;
          }
          const base = parseAbilityDamage(ability, creature.maxDamage);
          const floorMultiplier = Phaser.Math.Clamp(1 + ((currentLevel - 1) * 0.12), 1, 3.5);
          const crit = didAttackCrit();
          const scaledBase = Math.max(1, Math.floor(base * floorMultiplier));
          const rawDamage = crit ? applyCriticalDamage(scaledBase) : scaledBase;
          const pressuredDamage = applyMultiAttackerPressure(rawDamage);
          const dmg = clampIncomingCreatureDamage(pressuredDamage, creature.maxDamage);
          const reduced = godModeEnabled ? 0 : applyShieldingReduction(dmg);
          if (!godModeEnabled) playerHp = Math.max(0, playerHp - reduced);
          attackersPressureInTurn += 1;
          if (reduced < dmg && getEquippedShield()) gainShieldingSkillUse(1);
          showPlayerHitEffect(reduced);
          addCombatLog(
            crit
              ? `${creature.title} CRITICAL ${ability.name} for ${dmg}.`
              : `${creature.title} uses ${ability.name} for ${dmg}.`
          );
          return true;
        };
        const tileKey = (x, y) => `${x},${y}`;
        const findNextStepToPlayer = (fromX, fromY) => {
          const startKey = tileKey(fromX, fromY);
          if (isCreatureMeleeAdjacent(fromX, fromY, gridX, gridY)) return null;

          const goalKeys = new Set();
          const neigh = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1],
          ];
          for (const [dx, dy] of neigh) {
            const px = gridX + dx;
            const py = gridY + dy;
            if (!isWalkable(px, py)) continue;
            const blocker = creatureAt(px, py);
            if (blocker && (px !== fromX || py !== fromY)) continue;
            goalKeys.add(tileKey(px, py));
          }
          if (goalKeys.size === 0) return null;

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
            const curKey = tileKey(cur.x, cur.y);
            if (goalKeys.has(curKey)) {
              if (curKey === startKey) return null;
              let step = { x: cur.x, y: cur.y };
              let stepPrev = prev.get(curKey);
              while (stepPrev && tileKey(stepPrev.x, stepPrev.y) !== startKey) {
                step = stepPrev;
                stepPrev = prev.get(tileKey(stepPrev.x, stepPrev.y));
              }
              return step;
            }
            for (const d of directions) {
              const nx = cur.x + d.x;
              const ny = cur.y + d.y;
              const key = tileKey(nx, ny);
              if (visited.has(key)) continue;
              if (!isWalkable(nx, ny)) continue;
              if (key !== startKey && isOccupiedByActor(nx, ny)) continue;

              visited.add(key);
              prev.set(key, cur);
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
          attackersPressureInTurn = 0;
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
            const distToPlayer = Math.max(Math.abs(creature.gx - gridX), Math.abs(creature.gy - gridY));
            if (distToPlayer <= 4 && Math.random() < 0.5) {
              acted = tryUseCreatureAbility(creature) || acted;
            }
            if (!isCreatureMeleeAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              acted = tryMoveCreature(creature) || acted;
            }
            if (!acted && isCreatureMeleeAdjacent(creature.gx, creature.gy, gridX, gridY)) {
              orientCreatureSprite(creature, gridX - creature.gx, gridY - creature.gy);
              if (didAttackMiss()) {
                showMissSmoke(player.x, player.y);
                addCombatLog(`${creature.title} misses the hit.`);
                acted = true;
              } else {
                this._activeAttackerMaxDamage = creature.maxDamage;
                const baseDamage = pickCreatureDamage();
                const isCrit = didAttackCrit();
                const rawDamage = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
                const pressuredDamage = applyMultiAttackerPressure(rawDamage);
                const dmg = clampIncomingCreatureDamage(pressuredDamage, creature.maxDamage);
                const reduced = godModeEnabled ? 0 : applyShieldingReduction(dmg);
                if (!godModeEnabled) playerHp = Math.max(0, playerHp - reduced);
                attackersPressureInTurn += 1;
                if (reduced < dmg && getEquippedShield()) gainShieldingSkillUse(1);
                showPlayerHitEffect(reduced);
                if (isCrit) {
                  showCritText(player.x, player.y);
                  addCombatLog(`${creature.title} lands a CRITICAL hit for ${reduced}.`);
                } else {
                  addCombatLog(`${creature.title} hits you for ${reduced}.`);
                }
                acted = true;
              }
              if (!godModeEnabled && playerHp <= 0) {
                gameOver = true;
                playerDead = true;
                const killedByTitle = creature.title || 'Unknown';
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
                addCombatLog('You are dead.');
                this.time.delayedCall(3000, () => {
                  showDeathSummary({
                    name: configPlayer.name,
                    classKey: configPlayer.classKey,
                    sex: configPlayer.sex || 'male',
                    floor: currentLevel,
                    kills: runKills,
                    playerLevel,
                    gold: window.debugInventory ? window.debugInventory.getGold() : 0,
                    killedBy: killedByTitle,
                  });
                });
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
          delay: 90,
          loop: true,
          callback: () => {
            if (moving || gameOver || playerDead) return;
            if (isTypingInInput()) return;
            const now = this.time.now;
            if (now < nextPlayerActionAt) return;
            const w = getEquippedHandWeapon();
            if (!w || !isMagicRangedWeapon(w)) return;
            const anyMoveKey = (
              (cursors.left && cursors.left.isDown)
              || (cursors.right && cursors.right.isDown)
              || (cursors.up && cursors.up.isDown)
              || (cursors.down && cursors.down.isDown)
              || keys.A.isDown
              || keys.D.isDown
              || keys.W.isDown
              || keys.S.isDown
            );
            if (anyMoveKey) return;
            const t = findNearestRangedTarget(effectiveWeaponRange(w));
            if (!t) return;
            performPlayerAttack(t, w, true, now);
          },
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
          if (isTypingInInput()) return;
          const now = this.time.now;
          const canMageCastWithMagicWeapon = () => {
            if (playerClassKey !== 'druid' && playerClassKey !== 'sorcerer') return false;
            const equippedHand = getEquippedHandWeapon();
            return Boolean(equippedHand && isMagicRangedWeapon(equippedHand));
          };
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
              if (!canMageCastWithMagicWeapon()) {
                nextPlayerActionAt = now + Math.max(140, Math.floor(playerActionDelayMs * 0.55));
              }
              return;
            }
          }
          if (now < nextPlayerActionAt) return;

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
          const handIsDistance = Boolean(
            handWeapon
            && isDistanceWeapon(handWeapon)
            && (!requiresAmmoForWeapon(handWeapon) || hasAmmoForWeapon(handWeapon))
          );
          if (dx === 0 && dy === 0) {
            // Wands/rods: auto-fire via dedicated timer (see wandRodAutoFireEvent) to avoid missed ticks.
            if (handIsDistance && handWeapon && !isMagicRangedWeapon(handWeapon)) {
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

function setLoadingProgress(pct, label) {
  const bar = document.getElementById('loadingBar');
  const lbl = document.getElementById('loadingLabel');
  const num = document.getElementById('loadingPct');
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  if (bar) bar.style.width = `${p}%`;
  if (num) num.textContent = `${p}%`;
  if (lbl && label) lbl.textContent = label;
}

const CLASS_META = {
  knight:   { label: 'Elite Knight',    icon: '⚔️' },
  paladin:  { label: 'Royal Paladin',   icon: '🏹' },
  sorcerer: { label: 'Master Sorcerer', icon: '🔥' },
  druid:    { label: 'Elder Druid',     icon: '🌿' },
};

function fmtGold(g) {
  if (g >= 1_000_000) return `${(g / 1_000_000).toFixed(1)}M gp`;
  if (g >= 1_000)     return `${(g / 1_000).toFixed(1)}k gp`;
  return `${g} gp`;
}

function fmtDate(ts) {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000)          return 'just now';
  if (diff < 3_600_000)       return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000)      return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000)  return `${Math.floor(diff / 86_400_000)}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

async function saveRun(run) {
  try {
    await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(run),
    });
  } catch { /* silent — local dev or offline */ }
}

function showHallOfFame() {
  const existing = document.getElementById('hofOverlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'hofOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 10001;
    background: radial-gradient(ellipse at 50% 20%, rgba(12,20,42,0.99) 0%, rgba(4,8,18,1) 100%);
    display: flex; flex-direction: column; align-items: center;
    font-family: "Segoe UI", system-ui, sans-serif; color: #e2e8f0;
    animation: hofFadeIn 0.35s ease; overflow: hidden;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes hofFadeIn { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
      #hofOverlay { --accent: #38bdf8; --accent2: #818cf8; }
      #hofOverlay .hof-header {
        width: 100%; max-width: 900px; padding: 28px 32px 0;
        display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
      }
      #hofOverlay .hof-title-wrap { display: flex; align-items: center; gap: 14px; }
      #hofOverlay .hof-trophy { font-size: 2.2rem; filter: drop-shadow(0 0 12px #fbbf2488); }
      #hofOverlay .hof-title {
        font-size: clamp(1.3rem, 3vw, 1.8rem); font-weight: 900;
        letter-spacing: 0.18em; text-transform: uppercase; color: var(--accent);
        text-shadow: 0 0 24px #38bdf855;
      }
      #hofOverlay .hof-subtitle { font-size: 0.72rem; color: #475569; letter-spacing: 0.2em; text-transform: uppercase; margin-top: 1px; }
      #hofOverlay .hof-close {
        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px; color: #94a3b8; font-size: 1rem; padding: 7px 14px;
        cursor: pointer; transition: background 0.15s, color 0.15s; letter-spacing: 0.06em;
      }
      #hofOverlay .hof-close:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }
      #hofOverlay .hof-divider {
        width: 100%; max-width: 900px; height: 1px;
        background: linear-gradient(90deg, transparent, rgba(56,189,248,0.2), transparent);
        margin: 18px 0 0; flex-shrink: 0;
      }
      #hofOverlay .hof-scroll {
        width: 100%; max-width: 900px; flex: 1; overflow-y: auto; padding: 0 32px 28px;
        scrollbar-width: thin; scrollbar-color: rgba(56,189,248,0.2) transparent;
      }
      #hofOverlay .hof-scroll::-webkit-scrollbar { width: 5px; }
      #hofOverlay .hof-scroll::-webkit-scrollbar-thumb { background: rgba(56,189,248,0.2); border-radius: 3px; }
      #hofOverlay table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      #hofOverlay thead th {
        font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase;
        color: #475569; padding: 0 10px 10px; text-align: left; white-space: nowrap;
        border-bottom: 1px solid rgba(255,255,255,0.07);
      }
      #hofOverlay thead th.col-num { text-align: center; width: 44px; }
      #hofOverlay thead th.col-num2 { text-align: right; }
      #hofOverlay tbody tr {
        border-bottom: 1px solid rgba(255,255,255,0.04);
        transition: background 0.12s;
      }
      #hofOverlay tbody tr:hover { background: rgba(56,189,248,0.04); }
      #hofOverlay tbody tr.hof-me { background: rgba(56,189,248,0.07); }
      #hofOverlay tbody tr.hof-me td { color: #bae6fd; }
      #hofOverlay tbody td {
        padding: 11px 10px; font-size: 0.88rem; color: #cbd5e1; white-space: nowrap;
      }
      #hofOverlay td.col-rank { text-align: center; font-weight: 900; font-size: 1rem; width: 44px; }
      #hofOverlay td.col-num2 { text-align: right; }
      #hofOverlay .col-name { font-weight: 700; color: #e2e8f0; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
      #hofOverlay .col-class { color: #94a3b8; }
      #hofOverlay .col-floor { font-weight: 800; font-size: 1rem; color: #e2e8f0; }
      #hofOverlay .col-gold { color: #fbbf24; font-weight: 600; }
      #hofOverlay .col-killedby { color: #f87171; font-size: 0.82rem; }
      #hofOverlay .col-date { color: #334155; font-size: 0.78rem; }
      #hofOverlay .rank-medal { font-size: 1.1rem; }
      #hofOverlay .hof-loading, #hofOverlay .hof-empty, #hofOverlay .hof-error {
        text-align: center; padding: 60px 20px; color: #475569;
        font-size: 0.95rem; letter-spacing: 0.08em;
      }
      #hofOverlay .hof-error { color: #ef4444; }
      #hofOverlay .hof-spinner {
        display: inline-block; width: 28px; height: 28px;
        border: 3px solid rgba(56,189,248,0.15); border-top-color: #38bdf8;
        border-radius: 50%; animation: hofSpin 0.7s linear infinite; margin-bottom: 14px;
      }
      @keyframes hofSpin { to { transform: rotate(360deg); } }
    </style>
    <div class="hof-header">
      <div class="hof-title-wrap">
        <span class="hof-trophy">🏆</span>
        <div>
          <div class="hof-title">Hall of Fame</div>
          <div class="hof-subtitle">Top 100 adventurers of all time</div>
        </div>
      </div>
      <button class="hof-close" id="hofCloseBtn">✕ Close</button>
    </div>
    <div class="hof-divider"></div>
    <div class="hof-scroll">
      <div class="hof-loading" id="hofContent">
        <div class="hof-spinner"></div><br>Loading leaderboard...
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('hofCloseBtn').addEventListener('click', () => overlay.remove());

  const MEDALS = ['🥇', '🥈', '🥉'];

  fetch('/api/runs')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(({ runs }) => {
      const content = document.getElementById('hofContent');
      if (!content) return;
      if (!runs || runs.length === 0) {
        content.outerHTML = '<div class="hof-empty">No runs recorded yet. Be the first!</div>';
        return;
      }
      const rows = runs.map((run, i) => {
        const rank = i + 1;
        const medal = MEDALS[i] ?? rank;
        const cls = CLASS_META[run.classKey] || { label: run.classKey, icon: '❓' };
        const sexIcon = run.sex === 'female' ? '♀' : '♂';
        return `
          <tr>
            <td class="col-rank">${rank <= 3 ? `<span class="rank-medal">${medal}</span>` : rank}</td>
            <td class="col-name">${sexIcon} ${escHtml(run.name)}</td>
            <td class="col-class">${cls.icon} ${cls.label}</td>
            <td class="col-floor col-num2">${run.floor}</td>
            <td class="col-num2">${run.kills}</td>
            <td class="col-num2">${run.playerLevel}</td>
            <td class="col-gold col-num2">${fmtGold(run.gold || 0)}</td>
            <td class="col-killedby">${escHtml(run.killedBy || '—')}</td>
            <td class="col-date col-num2">${fmtDate(run.ts || 0)}</td>
          </tr>`;
      }).join('');

      content.outerHTML = `
        <table>
          <thead>
            <tr>
              <th class="col-num">#</th>
              <th>Name</th>
              <th>Class</th>
              <th class="col-num2">Floor</th>
              <th class="col-num2">Kills</th>
              <th class="col-num2">Level</th>
              <th class="col-num2">Gold</th>
              <th>Killed by</th>
              <th class="col-num2">Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .catch(() => {
      const content = document.getElementById('hofContent');
      if (content) content.outerHTML = '<div class="hof-error">Could not load leaderboard.<br><small>Hall of Fame requires the deployed version.</small></div>';
    });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showDeathSummary({ name, classKey, sex, floor, kills, playerLevel, gold, killedBy }) {
  const existing = document.getElementById('deathSummaryOverlay');
  if (existing) existing.remove();

  // Save run to leaderboard silently
  saveRun({ name, classKey, sex, floor, kills, playerLevel, gold, killedBy });

  const cls = CLASS_META[String(classKey).toLowerCase()] || { label: classKey, icon: '' };

  const overlay = document.createElement('div');
  overlay.id = 'deathSummaryOverlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: radial-gradient(ellipse at center, rgba(10,15,30,0.97) 0%, rgba(5,8,18,0.99) 100%);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: "Segoe UI", system-ui, sans-serif; color: #e2e8f0;
    animation: fadeInOverlay 0.6s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes fadeInOverlay { from { opacity:0; transform:scale(0.97); } to { opacity:1; transform:scale(1); } }
      @keyframes pulseRed { 0%,100% { text-shadow:0 0 30px #ef4444,0 0 60px #ef444488; } 50% { text-shadow:0 0 50px #ef4444,0 0 100px #ef444455; } }
      #deathSummaryOverlay .death-title {
        font-size: clamp(2.5rem,6vw,4.5rem); font-weight:900; letter-spacing:0.15em;
        color:#ef4444; text-transform:uppercase;
        animation:pulseRed 2s ease-in-out infinite; margin-bottom:0.2em;
      }
      #deathSummaryOverlay .death-subtitle {
        font-size:clamp(0.85rem,2vw,1.05rem); color:#64748b; letter-spacing:0.18em;
        text-transform:uppercase; margin-bottom:2em;
      }
      #deathSummaryOverlay .stats-card {
        background:linear-gradient(165deg,rgba(22,36,58,0.9) 0%,rgba(8,14,26,0.95) 100%);
        border:1px solid rgba(56,189,248,0.18); border-radius:16px;
        padding:1.6em 2.8em; min-width:min(400px,90vw);
        box-shadow:0 20px 60px rgba(0,0,0,0.6); margin-bottom:2em;
      }
      #deathSummaryOverlay .stat-row {
        display:flex; justify-content:space-between; align-items:center;
        padding:0.5em 0; border-bottom:1px solid rgba(255,255,255,0.06);
        font-size:clamp(0.88rem,1.8vw,1rem);
      }
      #deathSummaryOverlay .stat-row:last-child { border-bottom:none; }
      #deathSummaryOverlay .stat-label { color:#64748b; }
      #deathSummaryOverlay .stat-value { color:#e2e8f0; font-weight:700; }
      #deathSummaryOverlay .btn-row { display:flex; gap:12px; }
      #deathSummaryOverlay .btn-hof {
        background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(99,102,241,0.3));
        color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); border-radius:10px;
        padding:0.85em 1.6em; font-size:clamp(0.88rem,1.8vw,1rem);
        font-weight:700; letter-spacing:0.06em; cursor:pointer;
        transition:transform 0.15s,box-shadow 0.15s,background 0.15s;
      }
      #deathSummaryOverlay .btn-hof:hover {
        background:linear-gradient(135deg,rgba(99,102,241,0.35),rgba(99,102,241,0.45));
        transform:translateY(-2px); box-shadow:0 6px 20px rgba(99,102,241,0.25);
      }
      #deathSummaryOverlay .btn-play {
        background:linear-gradient(135deg,#1e40af,#1d4ed8);
        color:#fff; border:none; border-radius:10px;
        padding:0.85em 2em; font-size:clamp(0.88rem,1.8vw,1rem);
        font-weight:700; letter-spacing:0.08em; cursor:pointer;
        box-shadow:0 6px 24px rgba(29,78,216,0.4);
        transition:transform 0.15s,box-shadow 0.15s,background 0.15s;
        text-transform:uppercase;
      }
      #deathSummaryOverlay .btn-play:hover {
        background:linear-gradient(135deg,#2563eb,#3b82f6);
        transform:translateY(-2px); box-shadow:0 10px 32px rgba(59,130,246,0.5);
      }
      #deathSummaryOverlay .btn-play:active,
      #deathSummaryOverlay .btn-hof:active { transform:translateY(0); }
    </style>
    <div class="death-title">You Died</div>
    <div class="death-subtitle">${cls.icon} ${escHtml(name)} &mdash; ${cls.label}</div>
    <div class="stats-card">
      <div class="stat-row"><span class="stat-label">Killed by</span><span class="stat-value" style="color:#f87171;">${escHtml(killedBy || 'Unknown')}</span></div>
      <div class="stat-row"><span class="stat-label">Floor reached</span><span class="stat-value">${floor}</span></div>
      <div class="stat-row"><span class="stat-label">Creatures killed</span><span class="stat-value">${kills}</span></div>
      <div class="stat-row"><span class="stat-label">Player level</span><span class="stat-value">${playerLevel}</span></div>
      <div class="stat-row"><span class="stat-label">Gold earned</span><span class="stat-value">${fmtGold(gold)}</span></div>
    </div>
    <div class="btn-row">
      <button class="btn-hof" id="hofBtn">🏆 Hall of Fame</button>
      <button class="btn-play" id="playAgainBtn">▶ Play Again</button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('hofBtn').addEventListener('click', () => showHallOfFame());

  document.getElementById('playAgainBtn').addEventListener('click', () => {
    overlay.remove();
    if (game) {
      game.destroy(false);  // false = no eliminar el canvas del DOM (evita errores de WebGL context nulo)
      game = null;
      const phaserDiv = document.getElementById('phaser');
      if (phaserDiv) phaserDiv.innerHTML = '';  // limpiar canvas manualmente
    }
    if (typeof window._resetInventoryForNewRun === 'function') {
      window._resetInventoryForNewRun();
    }
    const startOverlay = document.getElementById('startOverlay');
    if (startOverlay) startOverlay.style.display = '';
  });
}

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
