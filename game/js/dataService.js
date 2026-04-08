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
