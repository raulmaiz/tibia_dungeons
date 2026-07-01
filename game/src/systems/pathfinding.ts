// A* over the logical tile grid (ADR-001). 8 neighbors, √2 diagonal cost,
// no corner cutting between two solid tiles. Pure — no render imports.

import { isWalkable, type TileMap } from '../domain/dungeon/tilemap';

export interface PathNode {
  gx: number;
  gy: number;
}

const DIAG_COST = Math.SQRT2;

interface OpenNode {
  gx: number;
  gy: number;
  g: number;
  f: number;
  parent: OpenNode | null;
}

function heuristic(ax: number, ay: number, bx: number, by: number): number {
  // Octile distance — admissible for 8-connected grids.
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (DIAG_COST - 1) * Math.min(dx, dy);
}

/**
 * Shortest path from `start` to `goal` (both inclusive; the returned path
 * excludes `start`). Returns null when unreachable. Bounded by the map size,
 * so worst case is O(w*h log(w*h)).
 */
export function findPath(tm: TileMap, start: PathNode, goal: PathNode): PathNode[] | null {
  if (!isWalkable(tm, goal.gx, goal.gy)) return null;
  if (start.gx === goal.gx && start.gy === goal.gy) return [];

  const key = (gx: number, gy: number) => gy * tm.w + gx;
  const open: OpenNode[] = [
    { gx: start.gx, gy: start.gy, g: 0, f: heuristic(start.gx, start.gy, goal.gx, goal.gy), parent: null },
  ];
  const bestG = new Map<number, number>([[key(start.gx, start.gy), 0]]);

  while (open.length > 0) {
    // Binary heap would be faster; maps are ≤ 60×40 so a sorted pop is fine.
    let bestIdx = 0;
    for (let i = 1; i < open.length; i += 1) {
      if (open[i]!.f < open[bestIdx]!.f) bestIdx = i;
    }
    const node = open.splice(bestIdx, 1)[0]!;

    if (node.gx === goal.gx && node.gy === goal.gy) {
      const path: PathNode[] = [];
      let cur: OpenNode | null = node;
      while (cur && cur.parent) {
        path.push({ gx: cur.gx, gy: cur.gy });
        cur = cur.parent;
      }
      return path.reverse();
    }

    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = node.gx + dx;
        const ny = node.gy + dy;
        if (!isWalkable(tm, nx, ny)) continue;
        // No corner cutting: a diagonal requires both orthogonal neighbors free.
        if (dx !== 0 && dy !== 0) {
          if (!isWalkable(tm, node.gx + dx, node.gy) || !isWalkable(tm, node.gx, node.gy + dy)) {
            continue;
          }
        }
        const stepCost = dx !== 0 && dy !== 0 ? DIAG_COST : 1;
        const g = node.g + stepCost;
        const k = key(nx, ny);
        const known = bestG.get(k);
        if (known !== undefined && known <= g) continue;
        bestG.set(k, g);
        open.push({ gx: nx, gy: ny, g, f: g + heuristic(nx, ny, goal.gx, goal.gy), parent: node });
      }
    }
  }
  return null;
}
