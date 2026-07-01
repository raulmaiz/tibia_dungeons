// Loot rolls + pity tracker — TS port of game/js/mechanics/loot.js.
// Formulas byte-identical to the 2D version.

import { defaultRng, type Rng } from '../core/rng';

export interface DropLine {
  itemId: number;
  chance: number;
  dropMin: number;
  dropMax: number;
  [extra: string]: unknown;
}

export type DropTable = Map<number, DropLine[]>;

export interface WonDrop extends DropLine {
  lootCount: number;
}

function rollCount(drop: DropLine, rng: Rng): number {
  let lo = Math.max(0, Math.floor(Number(drop.dropMin)));
  let hi = Math.max(0, Math.floor(Number(drop.dropMax)));
  if (!Number.isFinite(lo)) lo = 1;
  if (!Number.isFinite(hi)) hi = lo;
  if (hi < lo) [lo, hi] = [hi, lo];
  const span = hi - lo + 1;
  return lo + (span > 0 ? Math.floor(rng() * span) : 0);
}

/** Cada línea de la drop table tira por su `chance` (%); cantidad en [dropMin, dropMax]. */
export function rollCreatureDropsFromTable(
  creatureDropTable: DropTable,
  creatureId: number,
  rng: Rng = defaultRng,
): WonDrop[] {
  const drops = creatureDropTable.get(Number(creatureId)) ?? [];
  if (drops.length === 0) return [];
  const won: WonDrop[] = [];
  for (const drop of drops) {
    const p = Math.min(100, Math.max(0, Number(drop.chance)));
    if (!Number.isFinite(p) || p <= 0) continue;
    if (rng() * 100 >= p) continue;
    const count = rollCount(drop, rng);
    if (count <= 0) continue;
    won.push({ ...drop, lootCount: count });
  }
  return won;
}

/**
 * Sistema de pity por partida: cada kill sin obtener un item acumula "misses"
 * para ese par (creatureId, itemId). La chance efectiva se dobla cada
 * PITY_DOUBLINGS_EVERY misses, independientemente de la rareza base — tras
 * ~2.5*log2(100/p) kills sin verlo, el drop es garantizado. Al dropear, el
 * contador se resetea. El estado vive lo que dura la partida.
 */
export class LootPityTracker {
  /** clave `${creatureId}:${itemId}` → misses consecutivos */
  private misses = new Map<string, number>();

  private key(creatureId: number, itemId: number): string {
    return `${creatureId}:${itemId}`;
  }

  /** Chance efectiva dado el número de misses acumulados (0–100). */
  private effectiveChance(baseChance: number, misses: number): number {
    if (misses === 0) return baseChance;
    const PITY_DOUBLINGS_EVERY = 2.5; // cada N misses la chance se dobla
    return Math.min(100, baseChance * Math.pow(2, misses / PITY_DOUBLINGS_EVERY));
  }

  /** Tira el loot para una criatura aplicando el sistema de pity. */
  roll(creatureDropTable: DropTable, creatureId: number, rng: Rng = defaultRng): WonDrop[] {
    const drops = creatureDropTable.get(Number(creatureId)) ?? [];
    if (drops.length === 0) return [];
    const won: WonDrop[] = [];
    for (const drop of drops) {
      const p = Math.min(100, Math.max(0, Number(drop.chance)));
      if (!Number.isFinite(p) || p <= 0) continue;

      const key = this.key(creatureId, drop.itemId);
      const misses = this.misses.get(key) ?? 0;
      const effectiveP = this.effectiveChance(p, misses);

      if (rng() * 100 >= effectiveP) {
        this.misses.set(key, misses + 1);
        continue;
      }

      const count = rollCount(drop, rng);
      if (count <= 0) {
        // La tirada pasó pero la cantidad fue 0: el jugador no recibió nada,
        // así que el pity sigue acumulando.
        this.misses.set(key, misses + 1);
        continue;
      }

      this.misses.delete(key);
      won.push({ ...drop, lootCount: count });
    }
    return won;
  }

  /** Resetea todos los contadores (útil para tests o nuevas partidas). */
  reset(): void {
    this.misses.clear();
  }
}
