import { describe, expect, it } from 'vitest';
import {
  applyCriticalDamage,
  applyMultiAttackerPressure,
  applyShieldingReduction,
  clampIncomingCreatureDamage,
  didAttackCrit,
  didAttackMiss,
  maxIncomingHitByFloor,
  pickCreatureDamage,
} from '../combat/math';

const rngOf = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

describe('pickCreatureDamage', () => {
  it('rolls within [1, max] and applies the floor multiplier', () => {
    // rng()=0.999… → roll = max. Floor 1 → multiplier 1.
    expect(pickCreatureDamage(20, 1, rngOf(0.9999))).toBe(20);
    // Floor 6 → multiplier 1 + 5*0.12 = 1.6
    expect(pickCreatureDamage(20, 6, rngOf(0.9999))).toBe(32);
  });

  it('caps the floor multiplier at ×3.5', () => {
    // Floor 100 would be 1 + 99*0.12 = 12.88 → capped at 3.5
    expect(pickCreatureDamage(10, 100, rngOf(0.9999))).toBe(35);
  });

  it('never returns less than 1', () => {
    expect(pickCreatureDamage(0, 1, rngOf(0))).toBe(1);
  });
});

describe('maxIncomingHitByFloor / clampIncomingCreatureDamage', () => {
  it('grows with floor and caps at 55% of max HP', () => {
    expect(maxIncomingHitByFloor(1, 100)).toBe(34);
    expect(maxIncomingHitByFloor(50, 100)).toBe(55); // 0.34+49*0.02=1.32 → cap 0.55
  });

  it('clamps a spike to the lower of creature and floor caps', () => {
    // byCreature = max(12, 10*2.2=22) = 22; byFloor(1, 300) = 102 → cap 22
    expect(clampIncomingCreatureDamage(999, 10, 1, 300)).toBe(22);
  });
});

describe('didAttackMiss', () => {
  it('misses 50% with throwing weapons', () => {
    expect(didAttackMiss('Throwing Weapons', rngOf(0.49))).toBe(true);
    expect(didAttackMiss('Throwing Weapons', rngOf(0.51))).toBe(false);
  });

  it('misses 10% with anything else', () => {
    expect(didAttackMiss(null, rngOf(0.09))).toBe(true);
    expect(didAttackMiss(null, rngOf(0.11))).toBe(false);
    expect(didAttackMiss('swords', rngOf(0.11))).toBe(false);
  });
});

describe('crit', () => {
  it('crits 10% of the time at ×2.5', () => {
    expect(didAttackCrit(rngOf(0.09))).toBe(true);
    expect(didAttackCrit(rngOf(0.11))).toBe(false);
    expect(applyCriticalDamage(10)).toBe(25);
    expect(applyCriticalDamage(1)).toBe(3); // round(2.5)
  });
});

describe('applyShieldingReduction', () => {
  it('returns the raw damage with no equipment', () => {
    expect(applyShieldingReduction(50, 10)).toBe(50);
    expect(applyShieldingReduction(50, 90)).toBe(50); // skill alone does nothing
  });

  it('reduces damage with defense, never below 1', () => {
    const reduced = applyShieldingReduction(50, 10, {
      totalDefenseValue: 20,
      accessoryPhysicalResistPct: 0,
    });
    // percent = 0.08 + 20*0.009 = 0.26 → floor(50*0.74)=37; flat = floor(20*0.18)=3 → 34
    expect(reduced).toBe(34);
    expect(
      applyShieldingReduction(2, 10, { totalDefenseValue: 500, accessoryPhysicalResistPct: 0 }),
    ).toBe(1);
  });

  it('applies accessory physical resist capped at 50%', () => {
    const base = applyShieldingReduction(100, 10, {
      totalDefenseValue: 10,
      accessoryPhysicalResistPct: 0,
    });
    const resisted = applyShieldingReduction(100, 10, {
      totalDefenseValue: 10,
      accessoryPhysicalResistPct: 80, // cap 50
    });
    expect(resisted).toBe(Math.max(1, Math.floor(base * 0.5)));
  });
});

describe('applyMultiAttackerPressure', () => {
  it('adds +15% per extra attacker, capped at ×2.1', () => {
    expect(applyMultiAttackerPressure(100, 0)).toBe(100);
    expect(applyMultiAttackerPressure(100, 2)).toBe(130);
    expect(applyMultiAttackerPressure(100, 50)).toBe(210); // cap
  });
});
