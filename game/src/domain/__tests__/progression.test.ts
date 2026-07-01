import { describe, expect, it } from 'vitest';
import {
  averageMagicWeaponHitPreview,
  parseDamageRangeString,
  progressionStatsForLevel,
} from '../progression';

describe('progressionStatsForLevel', () => {
  it('returns base stats at level 1 for every class', () => {
    for (const cls of ['knight', 'paladin', 'sorcerer', 'druid'] as const) {
      const s = progressionStatsForLevel(1, cls);
      expect(s.maxHp).toBe(150);
      expect(s.maxMana).toBe(10);
      expect(s.capacity).toBe(400);
      expect(s.magicLevel).toBe(0);
    }
  });

  it('applies class growth per level', () => {
    const knight = progressionStatsForLevel(10, 'knight');
    expect(knight).toEqual({ maxHp: 285, maxMana: 55, capacity: 625, magicLevel: 1 }); // ml: floor(9*0.12)

    const sorcerer = progressionStatsForLevel(10, 'sorcerer');
    expect(sorcerer).toEqual({ maxHp: 195, maxMana: 280, capacity: 490, magicLevel: 9 });
  });

  it('clamps level to a minimum of 1', () => {
    expect(progressionStatsForLevel(0)).toEqual(progressionStatsForLevel(1));
  });
});

describe('parseDamageRangeString', () => {
  it('parses "70-110", single numbers, and rejects garbage', () => {
    expect(parseDamageRangeString('70-110')).toEqual({ min: 70, max: 110 });
    expect(parseDamageRangeString('110-70')).toEqual({ min: 70, max: 110 });
    expect(parseDamageRangeString('106')).toEqual({ min: 106, max: 106 });
    expect(parseDamageRangeString('')).toBeNull();
    expect(parseDamageRangeString('abc')).toBeNull();
    expect(parseDamageRangeString(null)).toBeNull();
  });
});

describe('averageMagicWeaponHitPreview', () => {
  it('scales the range average by ML and level', () => {
    // avg=90, ml=0, level=1 → 90
    expect(averageMagicWeaponHitPreview('70-110', 0, 1)).toBe(90);
    // ml=10 → 90*1.45 = 130.5 → 130
    expect(averageMagicWeaponHitPreview('70-110', 10, 1)).toBe(130);
    expect(averageMagicWeaponHitPreview('garbage', 10, 1)).toBeNull();
  });
});
