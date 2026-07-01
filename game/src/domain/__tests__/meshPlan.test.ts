import { describe, expect, it } from 'vitest';
import { seededRng } from '../../core/rng';
import { computeDungeonSize, generateLevelMap } from '../dungeon/generator';
import { buildMeshPlan, PIECE_VARIANTS } from '../dungeon/meshPlan';
import { tileMapFromGenerated, type TileMap } from '../dungeon/tilemap';

const START = { gx: 1, gy: 1 };

function makeTileMap(seed: number): TileMap {
  const { w, h } = computeDungeonSize(15);
  const level = generateLevelMap({ MAP_W: w, MAP_H: h, START_TILE: START, random: seededRng(seed) });
  return tileMapFromGenerated(level, START);
}

describe('buildMeshPlan (ADR-002 acceptance)', () => {
  const seeds = [1, 42, 1337];

  it.each(seeds)('seed %i: every walkable tile gets exactly one floor/stairs instance', (seed) => {
    const tm = makeTileMap(seed);
    const plan = buildMeshPlan(tm);
    const byTile = new Map<string, number>();
    for (const inst of plan.instances) {
      if (inst.piece === 'wall') continue;
      const key = `${inst.gx},${inst.gy}`;
      byTile.set(key, (byTile.get(key) ?? 0) + 1);
    }
    for (let gy = 0; gy < tm.h; gy += 1) {
      for (let gx = 0; gx < tm.w; gx += 1) {
        if (tm.tiles[gy]![gx] === 'wall') {
          expect(byTile.has(`${gx},${gy}`)).toBe(false);
        } else {
          expect(byTile.get(`${gx},${gy}`)).toBe(1);
        }
      }
    }
  });

  it.each(seeds)('seed %i: every wall bordering a walkable tile gets a wall instance', (seed) => {
    const tm = makeTileMap(seed);
    const plan = buildMeshPlan(tm);
    const wallSet = new Set(
      plan.instances.filter((i) => i.piece === 'wall').map((i) => `${i.gx},${i.gy}`),
    );
    for (let gy = 0; gy < tm.h; gy += 1) {
      for (let gx = 0; gx < tm.w; gx += 1) {
        if (tm.tiles[gy]![gx] !== 'wall') continue;
        let nearWalkable = false;
        for (let dy = -1; dy <= 1 && !nearWalkable; dy += 1) {
          for (let dx = -1; dx <= 1 && !nearWalkable; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const ny = gy + dy;
            const nx = gx + dx;
            if (ny >= 0 && ny < tm.h && nx >= 0 && nx < tm.w && tm.tiles[ny]![nx] !== 'wall') {
              nearWalkable = true;
            }
          }
        }
        expect(wallSet.has(`${gx},${gy}`)).toBe(nearWalkable);
      }
    }
  });

  it.each(seeds)('seed %i: exactly one stairs instance, at the tilemap stairs tile', (seed) => {
    const tm = makeTileMap(seed);
    const stairs = buildMeshPlan(tm).instances.filter((i) => i.piece === 'stairs');
    expect(stairs).toHaveLength(1);
    expect({ gx: stairs[0]!.gx, gy: stairs[0]!.gy }).toEqual(tm.stairs);
  });

  it('variants are deterministic and within range', () => {
    const tm = makeTileMap(7);
    const a = buildMeshPlan(tm);
    const b = buildMeshPlan(tm);
    expect(a).toEqual(b);
    for (const inst of a.instances) {
      expect(inst.variant).toBeGreaterThanOrEqual(0);
      expect(inst.variant).toBeLessThan(PIECE_VARIANTS);
    }
  });
});
