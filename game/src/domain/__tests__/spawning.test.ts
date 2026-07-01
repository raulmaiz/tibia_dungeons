import { describe, expect, it } from 'vitest';
import { FALLBACK_TEMPLATES, type CreatureTemplate } from '../../data/floorSpawnConfig';
import { buildSpawnPlan, floorLabel, MAX_SPAWNS_PER_FLOOR, moveDurationFromSpeed } from '../spawning';

const emptyCatalog = new Map<number, CreatureTemplate>();

describe('buildSpawnPlan', () => {
  it('floor 1 spawns rats from the fallback templates', () => {
    const plan = buildSpawnPlan(1, emptyCatalog);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.template.title).toBe('Rat');
    expect(plan[0]!.count).toBe(10);
  });

  it('prefers catalog templates over fallbacks', () => {
    const catalog = new Map<number, CreatureTemplate>([
      [1116, { ...FALLBACK_TEMPLATES[1116]!, hitpoints: 999 }],
    ]);
    const plan = buildSpawnPlan(1, catalog);
    expect(plan[0]!.template.hitpoints).toBe(999);
  });

  it('caps total spawns at MAX_SPAWNS_PER_FLOOR proportionally', () => {
    // Floor 18: 25 Dragons + 25 Dragon Lords = 50 > cap
    const plan = buildSpawnPlan(18, emptyCatalog);
    const total = plan.reduce((acc, e) => acc + e.count, 0);
    expect(total).toBeLessThanOrEqual(MAX_SPAWNS_PER_FLOOR);
    expect(plan.every((e) => e.count >= 1)).toBe(true);
    expect(plan).toHaveLength(2); // both kinds survive the trim
  });

  it('cycles the 1-20 tables beyond floor 20', () => {
    const f21 = buildSpawnPlan(21, emptyCatalog);
    const f1 = buildSpawnPlan(1, emptyCatalog);
    expect(f21.map((e) => e.template.id)).toEqual(f1.map((e) => e.template.id));
    expect(floorLabel(21)).toBe(floorLabel(1));
  });

  it('skips creatures with no template anywhere', () => {
    // Floor 9 counts reference ids (1382, 25439…) with no fallback template.
    const plan = buildSpawnPlan(9, emptyCatalog);
    expect(plan).toHaveLength(0);
  });
});

describe('moveDurationFromSpeed', () => {
  it('maps Tibia speed to per-tile ms within clamps', () => {
    expect(moveDurationFromSpeed(100)).toBe(190);
    expect(moveDurationFromSpeed(30)).toBe(320); // clamp slow
    expect(moveDurationFromSpeed(500)).toBe(110); // clamp fast
    expect(moveDurationFromSpeed(67)).toBeGreaterThan(moveDurationFromSpeed(119));
  });
});
