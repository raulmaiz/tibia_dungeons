// Logical tile map consumed by pathfinding, AI, spawning and the render
// adapter (ADR-002 layer 1). The MeshPlan derivation (layer 2) is T-020.

import type { GeneratedLevel } from './generator';

export type TileType = 'floor' | 'wall' | 'stairs';

export interface TileMap {
  w: number;
  h: number;
  /** tiles[gy][gx] */
  tiles: TileType[][];
  spawn: { gx: number; gy: number };
  stairs: { gx: number; gy: number };
}

export function tileMapFromGenerated(level: GeneratedLevel, spawn: { gx: number; gy: number }): TileMap {
  const h = level.map.length;
  const w = h > 0 ? level.map[0]!.length : 0;
  const tiles: TileType[][] = [];
  for (let gy = 0; gy < h; gy += 1) {
    const row: TileType[] = [];
    const src = level.map[gy]!;
    for (let gx = 0; gx < w; gx += 1) {
      row.push(src[gx] === '.' ? 'floor' : 'wall');
    }
    tiles.push(row);
  }
  tiles[level.stairs.gy]![level.stairs.gx] = 'stairs';
  return { w, h, tiles, spawn, stairs: level.stairs };
}

export function inBounds(tm: TileMap, gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < tm.w && gy < tm.h;
}

export function isWalkable(tm: TileMap, gx: number, gy: number): boolean {
  if (!inBounds(tm, gx, gy)) return false;
  return tm.tiles[gy]![gx] !== 'wall';
}
