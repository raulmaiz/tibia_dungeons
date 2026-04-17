const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

let itemArmorValueByIdPromise = null;
async function getItemArmorValueById() {
  if (itemArmorValueByIdPromise) return itemArmorValueByIdPromise;
  itemArmorValueByIdPromise = (async () => {
    const rows = await getJSON('./data/item_attribute.json');
    const out = new Map();
    for (const row of rows || []) {
      if ((row.name || '').toLowerCase() !== 'armor') continue;
      const itemId = Number(row.item_id);
      const value = Number(row.value);
      if (!Number.isFinite(itemId) || !Number.isFinite(value)) continue;
      out.set(itemId, value);
    }
    return out;
  })();
  return itemArmorValueByIdPromise;
}

let itemShieldingValueByIdPromise = null;
async function getItemShieldingValueById() {
  if (itemShieldingValueByIdPromise) return itemShieldingValueByIdPromise;
  itemShieldingValueByIdPromise = (async () => {
    const rows = await getJSON('./data/item_attribute.json');
    const out = new Map();
    for (const row of rows || []) {
      if ((row.name || '').toLowerCase() !== 'shielding') continue;
      const itemId = Number(row.item_id);
      const value = Number(row.value);
      if (!Number.isFinite(itemId) || !Number.isFinite(value)) continue;
      out.set(itemId, value);
    }
    return out;
  })();
  return itemShieldingValueByIdPromise;
}

let itemAttackValueByIdPromise = null;
async function getItemAttackValueById() {
  if (itemAttackValueByIdPromise) return itemAttackValueByIdPromise;
  itemAttackValueByIdPromise = (async () => {
    const rows = await getJSON('./data/item_attribute.json');
    const out = new Map();
    for (const row of rows || []) {
      if ((row.name || '').toLowerCase() !== 'attack') continue;
      const itemId = Number(row.item_id);
      const value = Number(row.value);
      if (!Number.isFinite(itemId) || !Number.isFinite(value)) continue;
      out.set(itemId, value);
    }
    return out;
  })();
  return itemAttackValueByIdPromise;
}

let itemRangeValueByIdPromise = null;
async function getItemRangeValueById() {
  if (itemRangeValueByIdPromise) return itemRangeValueByIdPromise;
  itemRangeValueByIdPromise = (async () => {
    const rows = await getJSON('./data/item_attribute.json');
    const out = new Map();
    for (const row of rows || []) {
      if ((row.name || '').toLowerCase() !== 'range') continue;
      const itemId = Number(row.item_id);
      const raw = row.value == null ? '' : String(row.value).trim();
      const value = Number(raw);
      if (!Number.isFinite(itemId) || !Number.isFinite(value)) continue;
      out.set(itemId, value);
    }
    return out;
  })();
  return itemRangeValueByIdPromise;
}

let itemAttributesByIdPromise = null;
async function getItemAttributesById() {
  if (itemAttributesByIdPromise) return itemAttributesByIdPromise;
  itemAttributesByIdPromise = (async () => {
    const rows = await getJSON('./data/item_attribute.json');
    const out = new Map();
    for (const row of rows || []) {
      const itemId = Number(row.item_id);
      if (!Number.isFinite(itemId)) continue;
      if (!out.has(itemId)) out.set(itemId, []);
      out.get(itemId).push({
        name: row.name || null,
        value: row.value == null ? null : String(row.value),
      });
    }
    return out;
  })();
  return itemAttributesByIdPromise;
}

let spellPriceConfigPromise = null;
async function getSpellPriceConfig() {
  if (spellPriceConfigPromise) return spellPriceConfigPromise;
  spellPriceConfigPromise = getJSON('./data/spell_price.json');
  return spellPriceConfigPromise;
}

let spellByArticleIdPromise = null;
async function getSpellByArticleId() {
  if (spellByArticleIdPromise) return spellByArticleIdPromise;
  spellByArticleIdPromise = (async () => {
    const rows = await getJSON('./data/spell.json');
    const out = new Map();
    for (const row of rows || []) {
      const id = Number(row.article_id);
      if (!Number.isFinite(id)) continue;
      out.set(id, row);
    }
    return out;
  })();
  return spellByArticleIdPromise;
}

function roundToStep(value, step) {
  const n = Number(value);
  const s = Math.max(1, Number(step) || 1);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / s) * s;
}

function estimateSpellPrice(spellRow, cfg) {
  const rules = (cfg && cfg.fallback_pricing_rules) || {};
  const minPrice = Math.max(0, Number(rules.minimum_price || 100));
  const roundingStep = Math.max(1, Number((rules.rounding || '').replace(/\D/g, '')) || 50);
  const premiumBonusRules = rules.premium_bonus || {};
  const runeBonusRules = rules.rune_bonus || {};
  const supportBonusRules = rules.support_bonus || {};
  const level = Math.max(0, Number((spellRow && spellRow.level) || 0));
  const mana = Math.max(0, Number((spellRow && spellRow.mana) || 0));
  const soul = Math.max(0, Number((spellRow && spellRow.soul) || 0));
  const isPremium = Number((spellRow && spellRow.is_premium) || 0) === 1;
  const isRune = String((spellRow && spellRow.spell_type) || '').toLowerCase() === 'rune';
  const isSupport = String((spellRow && spellRow.group_spell) || '').toLowerCase() === 'support';
  const premiumBonus = isPremium
    ? Number(premiumBonusRules.if_is_premium_1 || 0)
    : Number(premiumBonusRules.if_is_premium_0 || 0);
  const runeBonus = isRune
    ? Number(runeBonusRules.if_spell_type_is_Rune || 0)
    : Number(runeBonusRules.otherwise || 0);
  const supportBonus = isSupport
    ? Number(supportBonusRules.if_group_spell_is_Support || 0)
    : Number(supportBonusRules.otherwise || 0);
  const raw = (level * 40) + (mana * 8) + (soul * 120) + premiumBonus + runeBonus + supportBonus;
  return Math.max(minPrice, roundToStep(raw, roundingStep));
}

export async function getManifest() {
  return getJSON('./data/manifest.json');
}

export async function getSpellPriceByArticleId(articleId) {
  const wantedId = Number(articleId);
  if (!Number.isFinite(wantedId)) return null;
  const [cfg, spellMap] = await Promise.all([
    getSpellPriceConfig(),
    getSpellByArticleId(),
  ]);
  const spell = spellMap.get(wantedId);
  if (!spell) return null;
  const overrides = (cfg && cfg.internet_overrides) || {};
  const override = overrides[String(wantedId)];
  if (override && Number.isFinite(Number(override.price))) {
    return {
      article_id: wantedId,
      title: spell.title || spell.name || `Spell ${wantedId}`,
      price: Math.max(0, Math.floor(Number(override.price))),
      source: override.source || 'internet',
    };
  }
  const estimated = estimateSpellPrice(spell, cfg);
  return {
    article_id: wantedId,
    title: spell.title || spell.name || `Spell ${wantedId}`,
    price: Math.max(0, Math.floor(estimated)),
    source: 'estimated',
  };
}

export async function getSpellsCatalogWithPrices() {
  const [spells, cfg] = await Promise.all([
    getJSON('./data/spell.json'),
    getSpellPriceConfig(),
  ]);
  const overrides = (cfg && cfg.internet_overrides) || {};
  const out = [];
  for (const s of spells || []) {
    const id = Number(s.article_id);
    if (!Number.isFinite(id)) continue;
    const override = overrides[String(id)];
    const overridePrice = override ? Number(override.price) : NaN;
    const useOverride = Number.isFinite(overridePrice);
    const price = useOverride
      ? Math.max(0, Math.floor(overridePrice))
      : Math.max(0, Math.floor(estimateSpellPrice(s, cfg)));
    out.push({
      article_id: id,
      title: s.title || s.name || `Spell ${id}`,
      words: s.words || '',
      level: Math.max(0, Number(s.level || 0)),
      mana: Math.max(0, Number(s.mana || 0)),
      soul: Math.max(0, Number(s.soul || 0)),
      spell_type: s.spell_type || null,
      group_spell: s.group_spell || null,
      is_premium: Number(s.is_premium || 0) === 1,
      status: s.status || null,
      price,
      price_source: useOverride ? (override.source || 'internet') : 'estimated',
      image: s.image || null,
      raw: { ...s },
    });
  }
  out.sort((a, b) => {
    if (a.level !== b.level) return a.level - b.level;
    if (a.price !== b.price) return a.price - b.price;
    return String(a.title).localeCompare(String(b.title));
  });
  return out;
}

let itemShopCatalogPromise = null;
export async function getItemShopCatalog() {
  if (itemShopCatalogPromise) return itemShopCatalogPromise;
  itemShopCatalogPromise = (async () => {
    const [items, manifest, attrsByItemId, armorByItemId, shieldingByItemId, attackByItemId, rangeByItemId] = await Promise.all([
      getJSON('./data/item.json'),
      getManifest(),
      getItemAttributesById(),
      getItemArmorValueById(),
      getItemShieldingValueById(),
      getItemAttackValueById(),
      getItemRangeValueById(),
    ]);
    const manifestImageByTitle = new Map();
    for (const m of manifest.items || []) {
      const key = (m.title || '').trim().toLowerCase();
      if (!key || !m.image) continue;
      manifestImageByTitle.set(key, m.image);
    }
    const out = [];
    for (const item of items || []) {
      const id = Number(item.article_id);
      if (!Number.isFinite(id)) continue;
      const buy = Number(item.value_buy);
      if (!Number.isFinite(buy) || buy <= 0) continue;
      if (String(item.status || '').toLowerCase() !== 'active') continue;
      const itemTypeNorm = String(item.item_type || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (/^exercise\s*weapons?$/.test(itemTypeNorm)) continue;
      const title = (item.title || item.name || `Item ${id}`).trim();
      if (!title) continue;
      let resolvedRange = Number(rangeByItemId.get(id) || 1);
      if (!Number.isFinite(resolvedRange) || resolvedRange <= 0) {
        const secondary = String(item.type_secondary || '').toLowerCase();
        const isDistance = String(item.item_type || '').toLowerCase() === 'distance weapons';
        resolvedRange = isDistance ? (secondary === 'throwing weapons' ? 4 : 5) : 1;
      }
      out.push({
        id,
        title,
        description: String(item.description || '').trim(),
        price: Math.max(1, Math.floor(buy)),
        image: manifestImageByTitle.get(title.toLowerCase()) || null,
        item_type: item.item_type || null,
        item_class: item.item_class || null,
        type_secondary: item.type_secondary || null,
        armor_value: Number(armorByItemId.get(id) || 0),
        shielding_value: Number(shieldingByItemId.get(id) || 0),
        attack_value: Number(attackByItemId.get(id) || 0),
        range_value: resolvedRange,
        throwable: String(item.type_secondary || '').toLowerCase() === 'throwing weapons',
        attributes: attrsByItemId.get(id) || [],
        raw: { ...item },
      });
    }
    out.sort((a, b) => {
      const ta = String(a.title || '');
      const tb = String(b.title || '');
      return ta.localeCompare(tb);
    });
    return out;
  })();
  return itemShopCatalogPromise;
}

export async function getItemByArticleId(articleId) {
  const [items, manifest, armorByItemId, shieldingByItemId, attackByItemId, rangeByItemId, attrsByItemId] = await Promise.all([
    getJSON('./data/item.json'),
    getManifest(),
    getItemArmorValueById(),
    getItemShieldingValueById(),
    getItemAttackValueById(),
    getItemRangeValueById(),
    getItemAttributesById(),
  ]);
  const wantedId = Number(articleId);
  const item = (items || []).find((it) => Number(it.article_id) === wantedId);
  if (!item) return null;
  const itemId = Number(item.article_id);
  const titleKey = (item.title || '').trim().toLowerCase();
  const manifestItem = (manifest.items || []).find((it) => (
    ((it.title || '').trim().toLowerCase() === titleKey) && it.image
  ));
  let resolvedRange = Number(rangeByItemId.get(itemId) || 1);
  if (!Number.isFinite(resolvedRange) || resolvedRange <= 0) {
    const secondary = String(item.type_secondary || '').toLowerCase();
    const isDistance = String(item.item_type || '').toLowerCase() === 'distance weapons';
    resolvedRange = isDistance ? (secondary === 'throwing weapons' ? 4 : 5) : 1;
  }
  return {
    id: itemId,
    title: item.title || item.name || `Item ${item.article_id}`,
    item_class: item.item_class || null,
    item_type: item.item_type || null,
    type_secondary: item.type_secondary || null,
    armor_value: Number(armorByItemId.get(itemId) || 0),
    shielding_value: Number(shieldingByItemId.get(itemId) || 0),
    attack_value: Number(attackByItemId.get(itemId) || 0),
    range_value: resolvedRange,
    throwable: String(item.type_secondary || '').toLowerCase() === 'throwing weapons',
    weight: Number(item.weight || 0),
    image: manifestItem ? manifestItem.image : null,
    attributes: attrsByItemId.get(itemId) || [],
    raw: { ...item },
  };
}

export async function getLootDropPool(limit = 1200) {
  const items = await getJSON('./data/item.json');
  const pool = [];
  for (const item of items || []) {
    if ((item.status || '').toLowerCase() !== 'active') continue;
    if (!item.is_pickupable) continue;
    const type = (item.item_type || '').toLowerCase();
    if (!type || type === 'containers') continue;
    const title = (item.title || item.name || '').trim();
    if (!title) continue;
    pool.push({
      id: item.article_id,
      title,
      item_type: item.item_type || null,
      weight: Number(item.weight || 0),
    });
    if (pool.length >= limit) break;
  }
  return pool;
}

export async function getCreatureDropTable() {
  const [dropRows, items, manifest, armorByItemId, shieldingByItemId, attackByItemId, rangeByItemId, attrsByItemId] = await Promise.all([
    getJSON('./data/creature_drop.json'),
    getJSON('./data/item.json'),
    getManifest(),
    getItemArmorValueById(),
    getItemShieldingValueById(),
    getItemAttackValueById(),
    getItemRangeValueById(),
    getItemAttributesById(),
  ]);
  const itemById = new Map();
  for (const item of items || []) {
    itemById.set(Number(item.article_id), item);
  }
  const manifestImageByTitle = new Map();
  for (const m of manifest.items || []) {
    const key = (m.title || '').trim().toLowerCase();
    if (!key || !m.image) continue;
    manifestImageByTitle.set(key, m.image);
  }

  const dropsByCreatureId = new Map();
  for (const row of dropRows || []) {
    const creatureId = Number(row.creature_id);
    const itemId = Number(row.item_id);
    const chance = Number(row.chance);
    if (!Number.isFinite(creatureId) || !Number.isFinite(itemId)) continue;
    if (itemId === 1666) continue;
    if (!Number.isFinite(chance) || chance <= 0) continue;
    const item = itemById.get(itemId);
    if (!item) continue;
    if ((item.status || '').toLowerCase() !== 'active') continue;
    const itemType = (item.item_type || '').toLowerCase();
    if (itemType === 'quest items') continue;
    if (itemType === 'rubish' || itemType === 'rubbish') continue;
    if (itemType === 'creature products') continue;
    if (itemType === 'light sources') continue;
    const title = (item.title || item.name || '').trim();
    if (!title) continue;
    const dropMin = Number(row.min);
    const dropMax = Number(row.max);
    const drop = {
      itemId,
      itemTitle: title,
      chance,
      dropMin: Number.isFinite(dropMin) ? dropMin : 1,
      dropMax: Number.isFinite(dropMax) ? dropMax : 1,
      itemImage: manifestImageByTitle.get(title.toLowerCase()) || null,
      isStackable: Number(item.is_stackable || 0) === 1,
      itemClass: item.item_class || null,
      itemType: item.item_type || null,
      itemSecondary: item.type_secondary || null,
      armorValue: Number(armorByItemId.get(itemId) || 0),
      shieldingValue: Number(shieldingByItemId.get(itemId) || 0),
      attackValue: Number(attackByItemId.get(itemId) || 0),
      rangeValue: Number(rangeByItemId.get(itemId) || 1),
      throwable: String(item.type_secondary || '').toLowerCase() === 'throwing weapons',
      attributes: attrsByItemId.get(itemId) || [],
      raw: { ...item },
    };
    if (!dropsByCreatureId.has(creatureId)) dropsByCreatureId.set(creatureId, []);
    if (!Number.isFinite(drop.rangeValue) || drop.rangeValue <= 0) {
      const secondary = String(item.type_secondary || '').toLowerCase();
      const isDistance = String(item.item_type || '').toLowerCase() === 'distance weapons';
      drop.rangeValue = isDistance ? (secondary === 'throwing weapons' ? 4 : 5) : 1;
    }
    dropsByCreatureId.get(creatureId).push(drop);
  }

  return dropsByCreatureId;
}

export async function getCreatureCombatByTitle(title) {
  const [creatures, maxDamageRows] = await Promise.all([
    getJSON('./data/creature.json'),
    getJSON('./data/creature_max_damage.json'),
  ]);

  const wanted = (title || '').trim().toLowerCase();
  const creature = creatures.find((c) => (c.title || '').toLowerCase() === wanted);
  if (!creature) return null;

  const damage = maxDamageRows.find((d) => d.creature_id === creature.article_id);
  return {
    id: creature.article_id,
    title: creature.title,
    hitpoints: Number(creature.hitpoints || 1),
    maxDamage: Number((damage && (damage.total || damage.physical)) || 1),
  };
}

export async function getCreatureProgressionByExperience(levelCount = 8, creaturesPerLevel = 3) {
  const [manifest, creatures, maxDamageRows] = await Promise.all([
    getManifest(),
    getJSON('./data/creature.json'),
    getJSON('./data/creature_max_damage.json'),
  ]);

  const manifestByTitle = new Map();
  for (const m of manifest.creatures || []) {
    const key = (m.title || '').trim().toLowerCase();
    if (!key || !m.image) continue;
    manifestByTitle.set(key, m);
  }

  const damageByCreatureId = new Map();
  for (const row of maxDamageRows || []) {
    damageByCreatureId.set(row.creature_id, row);
  }

  const candidates = [];
  for (const c of creatures || []) {
    const key = (c.title || '').trim().toLowerCase();
    const manifestCreature = manifestByTitle.get(key);
    if (!manifestCreature) continue;
    if (!manifestCreature.image || !manifestCreature.image.startsWith('creature/')) continue;
    if ((c.status || '').toLowerCase() !== 'active') continue;
    const exp = Number(c.experience || 0);
    if (!Number.isFinite(exp) || exp <= 0) continue;
    const hp = Math.max(1, Number(c.hitpoints || 1));
    const damage = damageByCreatureId.get(c.article_id);
    const maxDamage = Math.max(1, Number((damage && (damage.total || damage.physical)) || 1));
    candidates.push({
      id: c.article_id,
      title: c.title,
      experience: exp,
      hitpoints: hp,
      maxDamage,
      image: manifestCreature.image,
    });
  }

  const byTitle = new Map();
  for (const c of candidates) {
    const key = c.title.toLowerCase();
    if (!byTitle.has(key) || byTitle.get(key).experience < c.experience) {
      byTitle.set(key, c);
    }
  }
  const sorted = Array.from(byTitle.values()).sort((a, b) => a.experience - b.experience);
  if (sorted.length === 0) return [];

  const tiers = [];
  for (let level = 1; level <= levelCount; level += 1) {
    const center = Math.floor(((level - 1) / Math.max(1, levelCount - 1)) * (sorted.length - 1));
    const start = Math.max(0, Math.min(sorted.length - creaturesPerLevel, center - Math.floor(creaturesPerLevel / 2)));
    tiers.push({
      level,
      creatures: sorted.slice(start, start + creaturesPerLevel),
    });
  }
  return tiers;
}

export async function getCreatureTypeProgressionGroups() {
  const [manifest, creatures, maxDamageRows] = await Promise.all([
    getManifest(),
    getJSON('./data/creature.json'),
    getJSON('./data/creature_max_damage.json'),
  ]);

  const manifestByTitle = new Map();
  for (const m of manifest.creatures || []) {
    const key = (m.title || '').trim().toLowerCase();
    if (!key || !m.image || !m.image.startsWith('creature/')) continue;
    manifestByTitle.set(key, m);
  }

  const damageByCreatureId = new Map();
  for (const row of maxDamageRows || []) {
    damageByCreatureId.set(row.creature_id, row);
  }

  const byType = new Map();
  for (const c of creatures || []) {
    const key = (c.title || '').trim().toLowerCase();
    const m = manifestByTitle.get(key);
    if (!m) continue;
    if ((c.status || '').toLowerCase() !== 'active') continue;
    const exp = Number(c.experience || 0);
    const hp = Math.max(1, Number(c.hitpoints || 1));
    if (!Number.isFinite(hp) || hp <= 0) continue;
    const typePrimary = (c.type_primary || '').trim();
    if (!typePrimary) continue;

    const damage = damageByCreatureId.get(c.article_id);
    const rawSpeed = Number(c.speed || 0);
    const normalizedSpeed = rawSpeed === 0 ? 80 : Math.max(1, rawSpeed);
    const runsAt = c.runs_at == null ? 0 : Math.max(0, Number(c.runs_at || 0));
    const item = {
      id: c.article_id,
      title: c.title,
      experience: exp,
      hitpoints: hp,
      maxDamage: Math.max(1, Number((damage && (damage.total || damage.physical)) || 1)),
      speed: normalizedSpeed,
      runs_at: runsAt,
      image: m.image,
      type_primary: typePrimary,
      creature_class: String(c.creature_class || '').trim(),
      ranged: c.ranged === true,
      range: Math.max(1, Number(c.range || 1)),
      convince_cost: Math.max(0, Number(c.convince_cost || 0)),
      summon_cost: Math.max(0, Number(c.summon_cost || 0)),
    };

    if (!byType.has(typePrimary)) byType.set(typePrimary, []);
    byType.get(typePrimary).push(item);
  }

  const groups = [];
  for (const [typePrimary, entries] of byType.entries()) {
    const dedupByTitle = new Map();
    for (const e of entries) {
      const key = e.title.toLowerCase();
      if (!dedupByTitle.has(key) || dedupByTitle.get(key).experience < e.experience) {
        dedupByTitle.set(key, e);
      }
    }
    const creaturesOfType = Array.from(dedupByTitle.values()).sort((a, b) => a.experience - b.experience);
    if (creaturesOfType.length === 0) continue;
    const avgHp = creaturesOfType.reduce((acc, it) => acc + it.hitpoints, 0) / creaturesOfType.length;
    const avgDmg = creaturesOfType.reduce((acc, it) => acc + it.maxDamage, 0) / creaturesOfType.length;
    const avgExp = creaturesOfType.reduce((acc, it) => acc + it.experience, 0) / creaturesOfType.length;
    groups.push({
      type_primary: typePrimary,
      average_hitpoints: avgHp,
      average_max_damage: avgDmg,
      average_experience: avgExp,
      creatures: creaturesOfType,
    });
  }

  groups.sort((a, b) => a.average_max_damage - b.average_max_damage);
  return groups;
}

let creatureAbilitiesByIdPromise = null;
export async function getCreatureAbilitiesById() {
  if (creatureAbilitiesByIdPromise) return creatureAbilitiesByIdPromise;
  creatureAbilitiesByIdPromise = (async () => {
    const rows = await getJSON('./data/creature_ability.json');
    const out = new Map();
    for (const row of rows || []) {
      const creatureId = Number(row.creature_id);
      if (!Number.isFinite(creatureId)) continue;
      if (!out.has(creatureId)) out.set(creatureId, []);
      out.get(creatureId).push({
        name: row.name || 'Ability',
        effect: row.effect == null ? '' : String(row.effect),
        element: row.element || null,
      });
    }
    return out;
  })();
  return creatureAbilitiesByIdPromise;
}

let creatureDamageModifiersByIdPromise = null;
/** Per creature article_id: elemental resist/vuln % (Tibia-style, 100 = neutral). */
export async function getCreatureDamageModifiersById() {
  if (creatureDamageModifiersByIdPromise) return creatureDamageModifiersByIdPromise;
  creatureDamageModifiersByIdPromise = (async () => {
    const creatures = await getJSON('./data/creature.json');
    const out = new Map();
    for (const c of creatures || []) {
      const id = Number(c.article_id);
      if (!Number.isFinite(id)) continue;
      const row = {
        physical: Number(c.modifier_physical),
        earth: Number(c.modifier_earth),
        fire: Number(c.modifier_fire),
        ice: Number(c.modifier_ice),
        energy: Number(c.modifier_energy),
        death: Number(c.modifier_death),
        holy: Number(c.modifier_holy),
        drown: Number(c.modifier_drown),
        lifedrain: Number(c.modifier_lifedrain),
        healing: Number(c.modifier_healing),
      };
      for (const k of Object.keys(row)) {
        if (!Number.isFinite(row[k])) row[k] = 100;
      }
      out.set(id, row);
    }
    return out;
  })();
  return creatureDamageModifiersByIdPromise;
}

export function imageUrl(relPath) {
  if (!relPath) return null;
  return `./data/images/${relPath}`;
}

export async function searchAll(q) {
  const m = await getManifest();
  const qq = q.trim().toLowerCase();
  if (!qq) return { creatures: m.creatures.slice(0, 50), items: m.items.slice(0, 50) };
  const match = (t) => t && t.toLowerCase().includes(qq);
  const creatures = m.creatures.filter(c => match(c.title) || match(c.name)).slice(0, 100);
  const items = m.items.filter(i => match(i.title)).slice(0, 100);
  return { creatures, items };
}
