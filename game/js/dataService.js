const cache = new Map();

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path);
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const data = await res.json();
  cache.set(path, data);
  return data;
}

export async function getManifest() {
  return getJSON('./data/manifest.json');
}

export async function getItemByArticleId(articleId) {
  const [items, manifest] = await Promise.all([
    getJSON('./data/item.json'),
    getManifest(),
  ]);
  const wantedId = Number(articleId);
  const item = (items || []).find((it) => Number(it.article_id) === wantedId);
  if (!item) return null;
  const titleKey = (item.title || '').trim().toLowerCase();
  const manifestItem = (manifest.items || []).find((it) => (
    ((it.title || '').trim().toLowerCase() === titleKey) && it.image
  ));
  return {
    id: item.article_id,
    title: item.title || item.name || `Item ${item.article_id}`,
    item_type: item.item_type || null,
    weight: Number(item.weight || 0),
    image: manifestItem ? manifestItem.image : null,
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
  const [dropRows, items, manifest] = await Promise.all([
    getJSON('./data/creature_drop.json'),
    getJSON('./data/item.json'),
    getManifest(),
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
    if (!Number.isFinite(chance) || chance <= 0) continue;
    const item = itemById.get(itemId);
    if (!item) continue;
    if ((item.status || '').toLowerCase() !== 'active') continue;
    const title = (item.title || item.name || '').trim();
    if (!title) continue;
    const drop = {
      itemId,
      itemTitle: title,
      chance,
      itemImage: manifestImageByTitle.get(title.toLowerCase()) || null,
      isStackable: Number(item.is_stackable || 0) === 1,
    };
    if (!dropsByCreatureId.has(creatureId)) dropsByCreatureId.set(creatureId, []);
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
    if (!Number.isFinite(exp) || exp <= 0) continue;
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
      hitpoints: Math.max(1, Number(c.hitpoints || 1)),
      maxDamage: Math.max(1, Number((damage && (damage.total || damage.physical)) || 1)),
      speed: normalizedSpeed,
      runs_at: runsAt,
      image: m.image,
      type_primary: typePrimary,
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
    const avgExp = creaturesOfType.reduce((acc, it) => acc + it.experience, 0) / creaturesOfType.length;
    groups.push({
      type_primary: typePrimary,
      average_experience: avgExp,
      creatures: creaturesOfType,
    });
  }

  groups.sort((a, b) => a.average_experience - b.average_experience);
  return groups;
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
