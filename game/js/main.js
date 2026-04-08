import { getCreatureTypeProgressionGroups, getItemByArticleId, getCreatureDropTable } from './dataService.js';

let game;
let selectedSex = 'male';
let playerConfig = null;
let typeProgressionGroups = [];
let creatureDropTable = new Map();

const MAP_W = 20;
const MAP_H = 15;
const UI_BOTTOM_SPACE = 88;
const UI_OVERLAP_ROWS = 1.5;
const CREATURE_POOL_PER_LEVEL = 12;
const MIN_CREATURES_PER_LEVEL = 3;
const MAX_CREATURES_PER_LEVEL = 10;
const START_TILE = { gx: 1, gy: 1 };
const START_BAG_ARTICLE_ID = 1589;

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
  const startBtn = document.getElementById('startBtn');
  const playerNameInput = document.getElementById('playerName');
  playerNameInput.focus();

  function setChoice(sex) {
    selectedSex = sex;
    choiceMale.classList.toggle('active', sex === 'male');
    choiceFemale.classList.toggle('active', sex === 'female');
  }

  choiceMale.addEventListener('click', () => setChoice('male'));
  choiceFemale.addEventListener('click', () => setChoice('female'));
  let currentBagCapacity = 0;
  let currentBagItem = null;
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

  function formatItemTooltip(item) {
    if (!item) return '';
    const raw = item.raw && typeof item.raw === 'object' ? item.raw : {};
    const attrs = Array.isArray(item.attributes) ? item.attributes : [];
    const lines = [];
    lines.push(`Name: ${item.title || raw.title || 'Unknown'}`);
    if (item.id != null) lines.push(`Article ID: ${item.id}`);
    if (item.item_class || raw.item_class) lines.push(`Class: ${item.item_class || raw.item_class}`);
    if (item.item_type || raw.item_type) lines.push(`Type: ${item.item_type || raw.item_type}`);
    if (Number(item.attack_value || 0) > 0) lines.push(`Attack: ${item.attack_value}`);
    if (Number(item.shielding_value || 0) > 0) lines.push(`Shielding: ${item.shielding_value}`);
    if (Number(item.armor_value || 0) > 0) lines.push(`Armor: ${item.armor_value}`);
    if (raw.weight != null) lines.push(`Weight: ${raw.weight}`);
    if (raw.value_buy != null) lines.push(`Buy: ${raw.value_buy}`);
    if (raw.value_sell != null) lines.push(`Sell: ${raw.value_sell}`);
    if (raw.is_stackable != null) lines.push(`Stackable: ${Number(raw.is_stackable) === 1 ? 'yes' : 'no'}`);
    if (raw.is_pickupable != null) lines.push(`Pickupable: ${Number(raw.is_pickupable) === 1 ? 'yes' : 'no'}`);
    if (item.count && item.count > 1) lines.push(`Amount: ${item.count}`);
    lines.push('');
    lines.push('Attributes (item_attribute.json):');
    if (attrs.length === 0) {
      lines.push('- none');
    } else {
      for (const a of attrs) lines.push(`- ${a.name}: ${a.value}`);
    }
    lines.push('');
    lines.push(`Item JSON: ${JSON.stringify(raw)}`);
    lines.push(`Attributes JSON: ${JSON.stringify(attrs)}`);
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
      itemTooltip.style.display = 'none';
      itemTooltip.textContent = '';
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
    slotLabel.textContent = item.title || 'Equipped';
    const slotRoot = document.getElementById(`slot${rule.id}`);
    bindTooltip(slotRoot, item);
    equipmentFoot.textContent = equipmentFootText || `Equipped ${rule.footName}: ${item.title}`;
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
    const nextShielding = Number(item.shielding_value || 0);
    if (!Number.isFinite(nextShielding) || nextShielding <= 0) return false;
    const equippedShielding = Number((equippedSlots.shield && equippedSlots.shield.shielding_value) || 0);
    if (nextShielding <= equippedShielding) return false;
    return setEquippedSlotVisual(
      'shield',
      item,
      `Auto-equipped ${item.title} (shield ${nextShielding}) > current (${equippedShielding}).`
    );
  }

  function tryAutoEquipWeaponUpgrade(item) {
    if ((item.item_class || '').toLowerCase() !== 'weapons') return false;
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
      } else {
        cell.textContent = String(i);
      }
      cell.style.position = 'relative';
      lootGrid.appendChild(cell);
    }
    lootFoot.textContent = `Capacity: ${bagLootItems.length}/${count} slots`;
  }

  function addLootItemToBag(itemData) {
    const incoming = {
      id: itemData && itemData.id != null ? Number(itemData.id) : null,
      title: itemData && itemData.title ? itemData.title : 'Loot',
      image: itemData && itemData.image ? itemData.image : null,
      item_type: itemData && itemData.item_type ? itemData.item_type : null,
      item_class: itemData && itemData.item_class ? itemData.item_class : null,
      armor_value: Number((itemData && itemData.armor_value) || 0),
      shielding_value: Number((itemData && itemData.shielding_value) || 0),
      attack_value: Number((itemData && itemData.attack_value) || 0),
      attributes: Array.isArray(itemData && itemData.attributes) ? itemData.attributes : [],
      raw: (itemData && itemData.raw && typeof itemData.raw === 'object') ? itemData.raw : {},
      isStackable: Boolean(itemData && itemData.isStackable),
      count: Math.max(1, Number((itemData && itemData.count) || 1)),
    };
    tryAutoEquipArmorUpgrade(incoming);
    tryAutoEquipShieldUpgrade(incoming);
    tryAutoEquipWeaponUpgrade(incoming);
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
        renderLootSlots(currentBagCapacity);
        return true;
      }
    }
    if (bagLootItems.length >= currentBagCapacity) return false;
    bagLootItems.push(incoming);
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
        armor_value: Number((item && item.armor_value) || 0),
        shielding_value: Number((item && item.shielding_value) || 0),
        attack_value: Number((item && item.attack_value) || 0),
        attributes: Array.isArray(item && item.attributes) ? item.attributes : [],
        raw: (item && item.raw && typeof item.raw === 'object') ? item.raw : {},
        isStackable: Boolean(item && item.isStackable),
        count: Math.max(1, Number((item && item.count) || 1)),
      });
    },
    state() {
      return {
        bag: currentBagItem,
        equipped: { ...equippedSlots },
        capacity: currentBagCapacity,
        used: bagLootItems.length,
        items: [...bagLootItems],
      };
    },
  };

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    const playerName = (playerNameInput.value || '').trim() || 'Adventurer';
    playerConfig = { name: playerName, sex: selectedSex };
    await Promise.all([
      loadProgressionDatabase(),
      equipBagByArticleId(START_BAG_ARTICLE_ID),
      (async () => { creatureDropTable = await getCreatureDropTable(); })(),
    ]);
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
        const combatLog = this.add.text(14, uiBaseY + 32, '', {
          color: '#ffffff',
          fontSize: '12px',
          wordWrap: { width: this.scale.width - 28 },
        });
        combatLog.setScrollFactor(0);
        const combatLogLines = [];
        const addCombatLog = (msg) => {
          combatLogLines.push(msg);
          if (combatLogLines.length > 3) combatLogLines.shift();
          combatLog.setText(combatLogLines.join('\n'));
        };
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
        let gridX = START_TILE.gx;
        let gridY = START_TILE.gy;
        let moving = false;
        let playerMoveDurationMs = 190;
        let playerActionDelayMs = 320;
        let nextPlayerActionAt = 0;
        let playerHp = 100;
        const playerMaxHp = 100;
        let playerMana = 60;
        const playerMaxMana = 60;
        const playerDamage = 12;
        let playerLevel = 1;
        let playerXp = 0;
        let gameOver = false;
        let playerDead = false;
        let currentLevel = 1;
        let currentLevelGroup = null;
        const recentGroupIndices = [];
        const runStartBias = Phaser.Math.Between(0, 8);
        const runSpreadBias = Phaser.Math.Between(0, 4);
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

        const creatures = [];

        const isWallTile = (gx, gy) => {
          if (!isWalkableTile(gx, gy)) return true;
          return currentMap[gy][gx] === '#';
        };
        const isWalkable = (gx, gy) => !isWallTile(gx, gy);
        const isAdjacent = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
        const aliveCreatures = () => creatures.filter((c) => c.alive);
        const creatureAt = (gx, gy) => aliveCreatures().find((c) => c.gx === gx && c.gy === gy) || null;
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
          const manaRatio = playerMana / playerMaxMana;
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
          // Objetivo de dificultad creciente, pero con rango amplio y ruido.
          const n = typeProgressionGroups.length;
          // Curva inicial mucho mas suave para niveles tempranos.
          const earlyFactor = level <= 8 ? 0.45 : 1.7;
          const baseTarget = Math.floor((level - 1) * earlyFactor);
          const startBias = level <= 8 ? Math.min(1, runStartBias) : runStartBias;
          const target = Math.min(n - 1, baseTarget + startBias);
          const radius = Math.max(level <= 8 ? 2 : 5 + runSpreadBias, Math.floor(n * (level <= 8 ? 0.08 : 0.2)));
          const minIdx = Math.max(0, target - radius);
          const maxCap = level <= 8
            ? Math.min(n - 1, 6 + level)
            : n - 1;
          const maxIdx = Math.min(maxCap, target + radius);

          // Candidatos del rango con exclusion de repetidos recientes.
          const recentSet = new Set(recentGroupIndices);
          let candidates = [];
          for (let i = minIdx; i <= maxIdx; i += 1) {
            if (!recentSet.has(i)) candidates.push(i);
          }
          if (candidates.length === 0) {
            for (let i = minIdx; i <= maxIdx; i += 1) candidates.push(i);
          }

          // Eleccion aleatoria ponderada por cercania al target.
          const weighted = candidates.map((idx) => {
            const dist = Math.abs(idx - target);
            return { idx, w: 1 / (1 + dist) };
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
          if (recentGroupIndices.length > 4) recentGroupIndices.shift();
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
            `Floor ${level}: ${first.type_primary} (base exp ${first.experience}).`
          );
        };
        const descendLevel = (toNext = true) => {
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
        const updateHud = () => {
          const group = currentLevelGroup;
          const typeName = group ? group.type_primary : 'Creature';
          nameLabel.setText(`${configPlayer.name} | Player Lv ${playerLevel}`);
          levelHud.setText(`Floor ${currentLevel} | ${typeName} ${aliveCreatures().length}/${creaturesTargetCount}`);
          combatHud.setText(`HP ${playerHp}/${playerMaxHp} MP ${playerMana}/${playerMaxMana}`);
          const xpNeeded = xpToNextLevel(playerLevel);
          const progress = xpNeeded > 0 ? playerXp / xpNeeded : 0;
          const totalWidth = this.scale.width - 18;
          levelProgressFill.width = Math.max(2, totalWidth * progress);
          levelProgressText.setText(`XP ${playerXp} / ${xpNeeded}`);
        };
        const pickCreatureDamage = () => {
          const max = Math.max(1, Number(this._activeAttackerMaxDamage || 1));
          return Phaser.Math.Between(1, max);
        };
        const didAttackMiss = () => Math.random() < 0.1;
        const didAttackCrit = () => Math.random() < 0.1;
        const applyCriticalDamage = (baseDamage) => Math.max(1, Math.round(baseDamage * 2.5)); // +150%
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

        this.events.on('update', () => {
          updateAllHealthBars();
          if (moving || gameOver) return;
          const now = this.time.now;
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
          }

          if (dx === 0 && dy === 0) return;
          if (ctrlPressed && (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown)) {
            return;
          }

          const targetGX = gridX + dx;
          const targetGY = gridY + dy;
          if (!isWalkable(targetGX, targetGY)) {
            return;
          }

          const targetCreature = creatureAt(targetGX, targetGY);
          if (targetCreature) {
            if (didAttackMiss()) {
              showMissSmoke(targetCreature.sprite.x, targetCreature.sprite.y);
              addCombatLog(`You miss your hit against ${targetCreature.title}.`);
            } else {
              const isCrit = didAttackCrit();
              const damage = isCrit ? applyCriticalDamage(playerDamage) : playerDamage;
              targetCreature.hp = Math.max(0, targetCreature.hp - damage);
              showCreatureHitEffect(targetCreature, damage);
              if (isCrit) {
                showCritText(targetCreature.sprite.x, targetCreature.sprite.y);
              }
              if (targetCreature.hp <= 0) {
                targetCreature.alive = false;
                targetCreature.sprite.setVisible(false);
                updateCreatureBar(targetCreature);
                grantPlayerXp(targetCreature.experience);
                addCombatLog(
                  isCrit
                    ? `CRITICAL hit on ${targetCreature.title} for ${damage}, and it dies.`
                    : `You hit ${targetCreature.title} and it dies.`
                );
                const rolledDrops = rollCreatureDrops(targetCreature.id);
                if (rolledDrops.length > 0) {
                  addCombatLog(`${targetCreature.title} dropped: ${rolledDrops.map((d) => d.itemTitle).join(', ')}.`);
                } else {
                  addCombatLog(`${targetCreature.title} dropped nothing.`);
                }
                if (rolledDrops.length > 0 && window.debugInventory && typeof window.debugInventory.addLoot === 'function') {
                  for (const d of rolledDrops) {
                    const stored = window.debugInventory.addLoot({
                      id: d.itemId,
                      title: d.itemTitle,
                      image: d.itemImage || null,
                      item_type: d.itemType || null,
                      item_class: d.itemClass || null,
                      armor_value: Number(d.armorValue || 0),
                      shielding_value: Number(d.shieldingValue || 0),
                      attack_value: Number(d.attackValue || 0),
                      attributes: Array.isArray(d.attributes) ? d.attributes : [],
                      raw: (d.raw && typeof d.raw === 'object') ? d.raw : {},
                      isStackable: Boolean(d.isStackable),
                      count: 1,
                    });
                    if (stored) {
                      addCombatLog(`Stored in bag: ${d.itemTitle}.`);
                    } else {
                      addCombatLog(`Bag full, lost: ${d.itemTitle}.`);
                    }
                  }
                }
              } else {
                addCombatLog(
                  isCrit
                    ? `CRITICAL hit on ${targetCreature.title} for ${damage} (${targetCreature.hp} HP).`
                    : `You hit ${targetCreature.title} for ${damage} (${targetCreature.hp} HP).`
                );
              }
            }
            updateCreatureBar(targetCreature);
            updateHud();
            if (aliveCreatures().length === 0) {
              stairRect.setVisible(true);
              stairText.setVisible(true);
              addCombatLog(`You defeated all creatures on floor ${currentLevel}. Go down the stairs.`);
              nextPlayerActionAt = now + playerActionDelayMs;
              return;
            }
            nextPlayerActionAt = now + playerActionDelayMs;
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
