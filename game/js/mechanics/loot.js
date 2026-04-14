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

/**
 * Sistema de pity por partida: cada kill sin obtener un item acumula "misses" para ese par
 * (creatureId, itemId). La chance efectiva crece exponencialmente según:
 *
 *   effectiveChance = 100 * (1 - (1 - p/100) ^ exp(misses / expected))
 *
 * donde expected = 100/p (kills esperados entre drops con probabilidad base).
 * - misses=0           → chance original exacta
 * - misses=expected    → ~(1-(1-p)^e), boost significativo
 * - misses=4*expected  → prácticamente 100%
 *
 * Al dropear un item su contador se resetea. El estado persiste toda la partida
 * y se destruye naturalmente al recargar en "Play Again".
 */
export class LootPityTracker {
  constructor() {
    /** @type {Map<string, number>} clave `${creatureId}:${itemId}` → misses consecutivos */
    this._misses = new Map();
  }

  _key(creatureId, itemId) {
    return `${creatureId}:${itemId}`;
  }

  /**
   * Calcula la chance efectiva dado el número de misses acumulados.
   *
   * La chance se dobla cada PITY_DOUBLINGS_EVERY kills sin obtener el item,
   * independientemente de su rareza base. Así los items raros escalan al mismo
   * ritmo que los comunes: tras ~5*log2(100/p) kills sin verlo, es garantizado.
   *
   * Ejemplos con PITY_DOUBLINGS_EVERY=5:
   *   Vampire Teeth (8.1%)      → garantizado en ~18 kills
   *   Vampire Shield (0.10%)    → garantizado en ~50 kills
   *   Stone Skin Amulet (0.07%) → garantizado en ~54 kills
   *
   * @param {number} baseChance  0–100
   * @param {number} misses      kills consecutivos sin haber recibido el item
   * @returns {number} 0–100
   */
  _effectiveChance(baseChance, misses) {
    if (misses === 0) return baseChance;
    const PITY_DOUBLINGS_EVERY = 2.5; // cada N misses la chance se dobla
    return Math.min(100, baseChance * Math.pow(2, misses / PITY_DOUBLINGS_EVERY));
  }

  /**
   * Tira el loot para una criatura aplicando el sistema de pity.
   * @param {Map<number, object[]>} creatureDropTable
   * @param {number} creatureId
   * @param {function(): number} rng
   * @returns {object[]}
   */
  roll(creatureDropTable, creatureId, rng = Math.random) {
    const drops = creatureDropTable.get(Number(creatureId)) || [];
    if (drops.length === 0) return [];
    const won = [];
    for (const drop of drops) {
      const p = Math.min(100, Math.max(0, Number(drop.chance)));
      if (!Number.isFinite(p) || p <= 0) continue;

      const key = this._key(creatureId, drop.itemId);
      const misses = this._misses.get(key) || 0;
      const effectiveP = this._effectiveChance(p, misses);

      if (rng() * 100 >= effectiveP) {
        this._misses.set(key, misses + 1);
        continue;
      }

      let lo = Math.max(0, Math.floor(Number(drop.dropMin)));
      let hi = Math.max(0, Math.floor(Number(drop.dropMax)));
      if (!Number.isFinite(lo)) lo = 1;
      if (!Number.isFinite(hi)) hi = lo;
      if (hi < lo) [lo, hi] = [hi, lo];
      const span = hi - lo + 1;
      const count = lo + (span > 0 ? Math.floor(rng() * span) : 0);

      if (count <= 0) {
        // La tirada pasó pero la cantidad fue 0: el jugador no recibió nada,
        // así que el pity sigue acumulando.
        this._misses.set(key, misses + 1);
        continue;
      }

      this._misses.delete(key);
      won.push({ ...drop, lootCount: count });
    }
    return won;
  }

  /** Resetea todos los contadores (útil para tests o nuevas partidas). */
  reset() {
    this._misses.clear();
  }
}
