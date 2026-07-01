// Injectable RNG. All domain rolls take an Rng so tests are deterministic
// (ADR-001 "Determinismo y tests").

export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** Integer in [lo, hi], inclusive — replacement for Phaser.Math.Between. */
export function intBetween(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** mulberry32 — tiny seeded PRNG for tests and reproducible dungeons. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
