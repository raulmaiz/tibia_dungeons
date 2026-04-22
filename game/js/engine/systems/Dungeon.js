// Dungeon generator — Phase 4 extraction from game.engine.js.
//
// Pure: given the target width/height + the fixed start tile, returns a
// { map, stairs } tuple. The engine decides when to regenerate (at
// descendLevel + on startup).
//
// map format: Array<string> of length H; each string is W chars of
//             '#' (wall) or '.' (floor).
// stairs:     { gx, gy } — where the staircase-down lands on this floor.

import { MAP_W, MAP_H, START_TILE } from '../../config/game.config.js';

export function generateLevelMap() {
  // Classic dungeon style: rooms connected by corridors.
  const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '#'));
  const rooms = [];
  const roomCount = Phaser.Math.Between(4, 6);
  const carveRoom = (rx, ry, rw, rh) => {
    for (let y = ry; y < ry + rh; y += 1) {
      for (let x = rx; x < rx + rw; x += 1) {
        if (x <= 0 || y <= 0 || x >= MAP_W - 1 || y >= MAP_H - 1) continue;
        map[y][x] = '.';
      }
    }
  };
  const roomOverlaps = (a, b) => !(
    a.x + a.w + 1 < b.x
    || b.x + b.w + 1 < a.x
    || a.y + a.h + 1 < b.y
    || b.y + b.h + 1 < a.y
  );
  for (let i = 0; i < roomCount; i += 1) {
    const rw = Phaser.Math.Between(4, 7);
    const rh = Phaser.Math.Between(3, 5);
    const rx = Phaser.Math.Between(1, Math.max(1, MAP_W - rw - 2));
    const ry = Phaser.Math.Between(1, Math.max(1, MAP_H - rh - 2));
    const next = { x: rx, y: ry, w: rw, h: rh };
    if (rooms.some((r) => roomOverlaps(r, next))) continue;
    carveRoom(rx, ry, rw, rh);
    rooms.push(next);
  }
  if (rooms.length === 0) {
    const fallback = { x: 2, y: 2, w: Math.max(4, MAP_W - 4), h: Math.max(3, MAP_H - 4) };
    carveRoom(fallback.x, fallback.y, fallback.w, fallback.h);
    rooms.push(fallback);
  }
  const centerOf = (r) => ({
    gx: Math.floor(r.x + r.w / 2),
    gy: Math.floor(r.y + r.h / 2),
  });
  const carveHCorridor = (x1, x2, y) => {
    const from = Math.min(x1, x2);
    const to = Math.max(x1, x2);
    for (let x = from; x <= to; x += 1) {
      if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) map[y][x] = '.';
    }
  };
  const carveVCorridor = (y1, y2, x) => {
    const from = Math.min(y1, y2);
    const to = Math.max(y1, y2);
    for (let y = from; y <= to; y += 1) {
      if (x > 0 && x < MAP_W - 1 && y > 0 && y < MAP_H - 1) map[y][x] = '.';
    }
  };
  for (let i = 1; i < rooms.length; i += 1) {
    const a = centerOf(rooms[i - 1]);
    const b = centerOf(rooms[i]);
    if (Math.random() < 0.5) {
      carveHCorridor(a.gx, b.gx, a.gy);
      carveVCorridor(a.gy, b.gy, b.gx);
    } else {
      carveVCorridor(a.gy, b.gy, a.gx);
      carveHCorridor(a.gx, b.gx, b.gy);
    }
  }
  const startNear = centerOf(rooms[0]);
  carveHCorridor(START_TILE.gx, startNear.gx, START_TILE.gy);
  carveVCorridor(START_TILE.gy, startNear.gy, startNear.gx);
  map[START_TILE.gy][START_TILE.gx] = '.';

  const stairsRoom = rooms[rooms.length - 1];
  const stairsCenter = centerOf(stairsRoom);
  const stairs = {
    gx: Phaser.Math.Clamp(stairsCenter.gx, 1, MAP_W - 2),
    gy: Phaser.Math.Clamp(stairsCenter.gy, 1, MAP_H - 2),
  };
  map[stairs.gy][stairs.gx] = '.';
  return { map: map.map((r) => r.join('')), stairs };
}
