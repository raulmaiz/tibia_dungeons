// Pure spawn planning: which creatures (and how many) populate a floor.
// Catalog access is injected (Map of templates) so tests need no fetch.

import {
  FALLBACK_TEMPLATES,
  FLOOR_CREATURE_COUNTS,
  FLOOR_DISPLAY_LABEL,
  type CreatureTemplate,
} from '../data/floorSpawnConfig';

/**
 * Perf cap for simultaneous skinned rigs until instanced creature models
 * land (T-052b/T-060). Counts above the cap are trimmed proportionally.
 */
export const MAX_SPAWNS_PER_FLOOR = 30;

export interface SpawnPlanEntry {
  template: CreatureTemplate;
  count: number;
}

export function floorLabel(floorLevel: number): string {
  const capped = ((floorLevel - 1) % 20) + 1;
  return FLOOR_DISPLAY_LABEL[capped] ?? `Floor ${floorLevel}`;
}

/**
 * Spawn plan for a floor. Floors 1-20 use the hand-tuned exact counts;
 * floors 21+ cycle the 1-20 tables (progression rework for 21+ is a
 * separate backlog item — legacy used pooled random groups there).
 */
export function buildSpawnPlan(
  floorLevel: number,
  catalog: ReadonlyMap<number, CreatureTemplate>,
): SpawnPlanEntry[] {
  const cappedLevel = ((floorLevel - 1) % 20) + 1;
  const counts = FLOOR_CREATURE_COUNTS[cappedLevel] ?? FLOOR_CREATURE_COUNTS[1]!;

  const entries: SpawnPlanEntry[] = [];
  for (const [idStr, count] of Object.entries(counts)) {
    const id = Number(idStr);
    const template = catalog.get(id) ?? FALLBACK_TEMPLATES[id];
    if (!template || count <= 0) continue;
    entries.push({ template, count });
  }

  // Proportional trim to the perf cap (keep at least 1 of each kind).
  const total = entries.reduce((acc, e) => acc + e.count, 0);
  if (total > MAX_SPAWNS_PER_FLOOR) {
    const scale = MAX_SPAWNS_PER_FLOOR / total;
    for (const e of entries) e.count = Math.max(1, Math.floor(e.count * scale));
  }
  return entries;
}

/** Tibia speed value → per-tile move duration (ms). speed 100 ≈ 190ms. */
export function moveDurationFromSpeed(speed: number): number {
  const s = Math.max(30, Number(speed) || 70);
  return Math.round(Math.min(320, Math.max(110, 19000 / s)));
}
