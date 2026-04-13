/** Cada línea de creature_drop.json tira por su `chance` (%); cantidad en [dropMin, dropMax]. */
export function rollCreatureDropsFromTable(creatureDropTable, creatureId, rng = Math.random) {
  const drops = creatureDropTable.get(Number(creatureId)) || [];
  if (drops.length === 0) return [];
  const won = [];
  for (const drop of drops) {
    const p = Math.min(100, Math.max(0, Number(drop.chance)));
    if (!Number.isFinite(p) || p <= 0) continue;
    if (rng() * 100 >= p) continue;
    let lo = Math.max(0, Math.floor(Number(drop.dropMin)));
    let hi = Math.max(0, Math.floor(Number(drop.dropMax)));
    if (!Number.isFinite(lo)) lo = 1;
    if (!Number.isFinite(hi)) hi = lo;
    if (hi < lo) [lo, hi] = [hi, lo];
    const span = hi - lo + 1;
    const count = lo + (span > 0 ? Math.floor(rng() * span) : 0);
    if (count <= 0) continue;
    won.push({ ...drop, lootCount: count });
  }
  return won;
}
