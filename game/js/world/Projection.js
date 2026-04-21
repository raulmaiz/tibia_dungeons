// Projection layer. Phase 3 of the architectural refactor — the SINGLE
// source of truth for converting between dungeon-grid coords and Phaser
// canvas pixels. Today the projection is orthogonal and trivial; when we
// migrate to isometric perspective the implementation here changes and
// every caller transparently follows along.
//
// Public API:
//   worldToScreen(gx, gy) → { x, y }   tile (gx,gy) → pixel center
//   screenToWorld(px, py) → { gx, gy } pixel → containing tile (floor)
//   worldX(gx)            → number     x of tile center  (orthogonal-only)
//   worldY(gy)            → number     y of tile center  (orthogonal-only)
//
// worldX/worldY are convenience helpers that exploit the orthogonal
// property "x depends only on gx, y depends only on gy". ISO projection
// breaks that property — both axes mix — so when ISO lands these two
// helpers are deleted and callers must migrate to worldToScreen().
// Treat them as a tech-debt marker for the ISO migration.

import { TILE_SIZE } from '../config/game.config.js';

export function worldToScreen(gx, gy) {
  return {
    x: gx * TILE_SIZE + TILE_SIZE / 2,
    y: gy * TILE_SIZE + TILE_SIZE / 2,
  };
}

export function screenToWorld(px, py) {
  return {
    gx: Math.floor(px / TILE_SIZE),
    gy: Math.floor(py / TILE_SIZE),
  };
}

export function worldX(gx) { return gx * TILE_SIZE + TILE_SIZE / 2; }
export function worldY(gy) { return gy * TILE_SIZE + TILE_SIZE / 2; }
