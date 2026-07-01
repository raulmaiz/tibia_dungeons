import { describe, expect, it } from 'vitest';
import { LootPityTracker, rollCreatureDropsFromTable, type DropTable } from '../loot';

const table = (lines: Partial<{ itemId: number; chance: number; dropMin: number; dropMax: number }>[]): DropTable =>
  new Map([[1, lines.map((l, i) => ({ itemId: l.itemId ?? i + 100, chance: l.chance ?? 100, dropMin: l.dropMin ?? 1, dropMax: l.dropMax ?? 1 }))]]);

const rngOf = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe('rollCreatureDropsFromTable', () => {
  it('wins a drop when the roll beats the chance and rolls the count', () => {
    const t = table([{ itemId: 7, chance: 50, dropMin: 2, dropMax: 4 }]);
    // roll 0.49*100=49 < 50 → win; count roll 0.99 → span 3 → 2+2=4
    const won = rollCreatureDropsFromTable(t, 1, rngOf(0.49, 0.99));
    expect(won).toHaveLength(1);
    expect(won[0]!.itemId).toBe(7);
    expect(won[0]!.lootCount).toBe(4);
  });

  it('loses when the roll is above the chance, and for unknown creatures', () => {
    const t = table([{ chance: 50 }]);
    expect(rollCreatureDropsFromTable(t, 1, rngOf(0.5))).toHaveLength(0);
    expect(rollCreatureDropsFromTable(t, 999, rngOf(0))).toHaveLength(0);
  });

  it('skips zero-chance lines without consuming rng', () => {
    const t = table([{ chance: 0 }, { chance: 100, itemId: 5 }]);
    const won = rollCreatureDropsFromTable(t, 1, rngOf(0.99, 0));
    expect(won.map((w) => w.itemId)).toEqual([5]);
  });
});

describe('LootPityTracker', () => {
  it('doubles the effective chance every 2.5 misses', () => {
    const pity = new LootPityTracker();
    const t = table([{ itemId: 9, chance: 10 }]);
    // Miss 5 times (rng 0.99 → 99 ≥ effective chance while < 100)
    for (let i = 0; i < 5; i += 1) {
      expect(pity.roll(t, 1, rngOf(0.99, 0))).toHaveLength(0);
    }
    // After 5 misses: effective = 10 * 2^(5/2.5) = 40 → roll 0.35*100=35 < 40 wins
    const won = pity.roll(t, 1, rngOf(0.35, 0));
    expect(won).toHaveLength(1);
  });

  it('resets the counter after a win', () => {
    const pity = new LootPityTracker();
    const t = table([{ itemId: 9, chance: 10 }]);
    for (let i = 0; i < 10; i += 1) pity.roll(t, 1, rngOf(0.999, 0));
    expect(pity.roll(t, 1, rngOf(0.05, 0))).toHaveLength(1); // win resets
    // Right after the win, effective chance is back to base 10%
    expect(pity.roll(t, 1, rngOf(0.15, 0))).toHaveLength(0);
  });

  it('keeps accumulating pity when the quantity rolls to 0', () => {
    const pity = new LootPityTracker();
    const t = table([{ itemId: 9, chance: 100, dropMin: 0, dropMax: 0 }]);
    expect(pity.roll(t, 1, rngOf(0, 0))).toHaveLength(0); // chance passes, count 0
    expect(pity.roll(t, 1, rngOf(0, 0))).toHaveLength(0);
  });

  it('guarantees rare drops within ~2.5*log2(100/p) kills', () => {
    const pity = new LootPityTracker();
    const t = table([{ itemId: 9, chance: 0.1 }]);
    let kills = 0;
    let won = 0;
    // Worst-case rng (always 0.9999… just below a certain win)
    while (won === 0 && kills < 60) {
      kills += 1;
      won = pity.roll(t, 1, rngOf(0.9999, 0.5)).length;
    }
    // 2.5*log2(1000) ≈ 25 doublings-kills; must certainly be under 30
    expect(kills).toBeLessThanOrEqual(30);
  });
});
