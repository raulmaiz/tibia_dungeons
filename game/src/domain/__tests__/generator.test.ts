import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/rng';
import { computeDungeonSize, generateLevelMap } from '../dungeon/generator';
import { isWalkable, tileMapFromGenerated } from '../dungeon/tilemap';

const START = { gx: 1, gy: 1 };

describe('computeDungeonSize', () => {
  it('scales with creature count and respects minimums', () => {
    const small = computeDungeonSize(1);
    expect(small.w).toBeGreaterThanOrEqual(20);
    expect(small.h).toBeGreaterThanOrEqual(14);
    const big = computeDungeonSize(40);
    expect(big.w * big.h).toBeGreaterThan(small.w * small.h);
  });
});

describe('generateLevelMap', () => {
  // Try several seeds — properties must hold for any dungeon.
  const seeds = [1, 42, 1337, 9999, 123456];

  it.each(seeds)('seed %i: map is well-formed with sealed borders', (seed) => {
    const { w, h } = computeDungeonSize(15);
    const level = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(seed) });
    expect(level.map).toHaveLength(h);
    for (const row of level.map) expect(row).toHaveLength(w);
    // Borders sealed
    expect([...level.map[0]!].every((c) => c === '#')).toBe(true);
    expect([...level.map[h - 1]!].every((c) => c === '#')).toBe(true);
    for (const row of level.map) {
      expect(row[0]).toBe('#');
      expect(row[w - 1]).toBe('#');
    }
    expect(level.rooms.length).toBeGreaterThanOrEqual(1);
  });

  it.each(seeds)('seed %i: stairs are reachable from the start tile (BFS)', (seed) => {
    const { w, h } = computeDungeonSize(15);
    const level = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(seed) });
    const tm = tileMapFromGenerated(level, START);

    expect(isWalkable(tm, START.gx, START.gy)).toBe(true);
    expect(isWalkable(tm, level.stairs.gx, level.stairs.gy)).toBe(true);

    // BFS from start
    const seen = new Set<string>([`${START.gx},${START.gy}`]);
    const queue = [START];
    let reached = false;
    while (queue.length > 0) {
      const { gx, gy } = queue.shift()!;
      if (gx === level.stairs.gx && gy === level.stairs.gy) {
        reached = true;
        break;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = gx + dx;
        const ny = gy + dy;
        const key = `${nx},${ny}`;
        if (!seen.has(key) && isWalkable(tm, nx, ny)) {
          seen.add(key);
          queue.push({ gx: nx, gy: ny });
        }
      }
    }
    expect(reached).toBe(true);
  });

  it.each(seeds)('seed %i: every room is at least 5x5 tiles', (seed) => {
    const { w, h } = computeDungeonSize(15);
    const level = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(seed) });
    for (const room of level.rooms) {
      expect(room.w).toBeGreaterThanOrEqual(5);
      expect(room.h).toBeGreaterThanOrEqual(5);
    }
  });

  it('is reproducible for the same seed', () => {
    const { w, h } = computeDungeonSize(15);
    const a = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(7) });
    const b = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(7) });
    expect(a.map).toEqual(b.map);
    expect(a.stairs).toEqual(b.stairs);
  });
});
