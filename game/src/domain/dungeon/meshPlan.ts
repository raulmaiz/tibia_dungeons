// MeshPlan — pure adapter from the logical TileMap to a render-consumable
// instance list (ADR-002 layer 2). Derived on floor entry, never serialized.
// The renderer builds one InstancedMesh per (piece, variant) bucket.

import type { TileMap } from './tilemap';
import { inBounds } from './tilemap';

export type PieceKind = 'floor' | 'stairs' | 'wall';

export interface MeshInstance {
  piece: PieceKind;
  gx: number;
  gy: number;
  /** Radians. Walls face their nearest walkable neighbor; floors use it for variety. */
  rotationY: number;
  /** Deterministic per-tile variant index [0, VARIANTS) for visual variety. */
  variant: number;
}

export interface MeshPlan {
  instances: MeshInstance[];
}

export const PIECE_VARIANTS = 3;

/** Deterministic tile hash — variety without RNG so replays/saves look identical. */
function tileHash(gx: number, gy: number): number {
  let h = (gx * 73856093) ^ (gy * 19349663);
  h = (h ^ (h >> 13)) >>> 0;
  return h;
}

const ORTHO: ReadonlyArray<readonly [number, number, number]> = [
  // [dx, dy, rotationY facing that neighbor]
  [0, 1, 0],
  [1, 0, Math.PI / 2],
  [0, -1, Math.PI],
  [-1, 0, -Math.PI / 2],
];

function isWalkableTile(tm: TileMap, gx: number, gy: number): boolean {
  return inBounds(tm, gx, gy) && tm.tiles[gy]![gx] !== 'wall';
}

/**
 * Derives the instance plan:
 * - every walkable tile → one `floor` (stairs tile → `stairs` instead)
 * - every wall tile with ≥1 walkable neighbor (8-neighborhood) → one `wall`,
 *   rotated toward its first orthogonal walkable neighbor (corner walls that
 *   only touch diagonally keep rotation 0 — they read fine from any side)
 * Void walls (no walkable contact) produce nothing: the darkness is free.
 */
export function buildMeshPlan(tm: TileMap): MeshPlan {
  const instances: MeshInstance[] = [];
  for (let gy = 0; gy < tm.h; gy += 1) {
    for (let gx = 0; gx < tm.w; gx += 1) {
      const t = tm.tiles[gy]![gx]!;
      const hash = tileHash(gx, gy);
      const variant = hash % PIECE_VARIANTS;
      if (t !== 'wall') {
        instances.push({
          piece: t === 'stairs' ? 'stairs' : 'floor',
          gx,
          gy,
          rotationY: 0,
          variant,
        });
        continue;
      }
      // Wall: face the first orthogonal walkable neighbor.
      let rotationY: number | null = null;
      for (const [dx, dy, rot] of ORTHO) {
        if (isWalkableTile(tm, gx + dx, gy + dy)) {
          rotationY = rot;
          break;
        }
      }
      if (rotationY === null) {
        // Check diagonals for corner pieces.
        let touchesDiagonal = false;
        for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
          if (isWalkableTile(tm, gx + dx, gy + dy)) {
            touchesDiagonal = true;
            break;
          }
        }
        if (!touchesDiagonal) continue; // void wall — skip
        rotationY = 0;
      }
      instances.push({ piece: 'wall', gx, gy, rotationY, variant });
    }
  }
  return { instances };
}
