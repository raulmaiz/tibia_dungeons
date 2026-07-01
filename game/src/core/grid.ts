// Grid ↔ 3D-world conversion. THE ONLY place where tile coordinates become
// world-space coordinates (successor of the 2D world/Projection.js seam).
// Logical world: tile grid. Render world: XZ plane, Y up. Tile centers.

import { TILE_WORLD_SIZE } from './config';

export interface TileCoord {
  gx: number;
  gy: number;
}

export interface WorldXZ {
  x: number;
  z: number;
}

/** Center of tile (gx, gy) in world space (XZ plane). */
export function tileToWorld(gx: number, gy: number): WorldXZ {
  return {
    x: gx * TILE_WORLD_SIZE + TILE_WORLD_SIZE / 2,
    z: gy * TILE_WORLD_SIZE + TILE_WORLD_SIZE / 2,
  };
}

/** Tile containing world point (x, z). */
export function worldToTile(x: number, z: number): TileCoord {
  return {
    gx: Math.floor(x / TILE_WORLD_SIZE),
    gy: Math.floor(z / TILE_WORLD_SIZE),
  };
}
