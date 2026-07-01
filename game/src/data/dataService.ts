// Typed catalog loaders — lean TS port of the legacy dataService.js.
// Catalogs live in game/public/data (served at /data/*). Loaded once,
// cached in memory. Only what the 3D game needs is ported; the item /
// drop-table pipeline arrives with the loot system (T-041).

import type { CreatureTemplate } from './floorSpawnConfig';
import { FALLBACK_TEMPLATES } from './floorSpawnConfig';

interface RawCreatureRow {
  article_id: number;
  title: string | null;
  hitpoints: number | null;
  experience: number | null;
  speed: number | null;
  runs_at: number | null;
  type_primary: string | null;
  status?: string | null;
}

interface RawMaxDamageRow {
  creature_id: number;
  physical: number | null;
  total: number | null;
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`[dataService] ${path} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Merge a catalog row + max-damage row into a CreatureTemplate. Pure — unit tested. */
export function templateFromRows(
  row: RawCreatureRow,
  maxDamage: number | null | undefined,
): CreatureTemplate | null {
  const id = Number(row.article_id);
  const title = String(row.title ?? '').trim();
  if (!Number.isFinite(id) || !title) return null;
  const fallback = FALLBACK_TEMPLATES[id];
  const hitpoints = Number(row.hitpoints ?? 0) || fallback?.hitpoints || 0;
  if (hitpoints <= 0) return null;
  return {
    id,
    title,
    typePrimary: String(row.type_primary ?? '').trim() || 'Unknown',
    experience: Math.max(0, Number(row.experience ?? 0) || fallback?.experience || 0),
    hitpoints,
    maxDamage: Math.max(1, Number(maxDamage ?? 0) || fallback?.maxDamage || 1),
    speed: Math.max(30, Number(row.speed ?? 0) || fallback?.speed || 70),
    runsAt: Math.max(0, Number(row.runs_at ?? 0) || fallback?.runsAt || 0),
  };
}

let catalogPromise: Promise<Map<number, CreatureTemplate>> | null = null;

/** id → template for every usable creature in the catalog. */
export function loadCreatureCatalog(): Promise<Map<number, CreatureTemplate>> {
  catalogPromise ??= (async () => {
    const [creatures, damages] = await Promise.all([
      getJSON<RawCreatureRow[]>('/data/creature.json'),
      getJSON<RawMaxDamageRow[]>('/data/creature_max_damage.json'),
    ]);
    const damageById = new Map<number, number>();
    for (const d of damages) {
      const dmg = Number(d.total ?? d.physical ?? 0);
      if (Number.isFinite(dmg) && dmg > 0) damageById.set(Number(d.creature_id), dmg);
    }
    const map = new Map<number, CreatureTemplate>();
    for (const row of creatures) {
      const t = templateFromRows(row, damageById.get(Number(row.article_id)));
      if (t) map.set(t.id, t);
    }
    return map;
  })();
  return catalogPromise;
}
