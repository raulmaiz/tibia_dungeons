export function generateLevelMap({ MAP_W, MAP_H, START_TILE, between, clamp, random = Math.random }) {
  const map = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => '#'));
  const rooms = [];
  const roomTarget = between(8, 13);
  const maxAttempts = roomTarget * 12;
  const minRoomW = 3;
  const maxRoomW = 7;
  const minRoomH = 3;
  const maxRoomH = 6;
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

  for (let i = 0; i < maxAttempts && rooms.length < roomTarget; i += 1) {
    const rw = between(minRoomW, maxRoomW);
    const rh = between(minRoomH, maxRoomH);
    const rx = between(1, Math.max(1, MAP_W - rw - 2));
    const ry = between(1, Math.max(1, MAP_H - rh - 2));
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

  const centers = rooms.map(centerOf);
  const connected = new Set([0]);
  const links = [];

  while (connected.size < rooms.length) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDist = Infinity;
    connected.forEach((from) => {
      for (let to = 0; to < rooms.length; to += 1) {
        if (connected.has(to)) continue;
        const dx = Math.abs(centers[from].gx - centers[to].gx);
        const dy = Math.abs(centers[from].gy - centers[to].gy);
        const dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = from;
          bestTo = to;
        }
      }
    });
    if (bestFrom === -1 || bestTo === -1) break;
    links.push([bestFrom, bestTo]);
    connected.add(bestTo);
  }

  const extraLinks = Math.max(2, Math.floor(rooms.length / 3));
  for (let i = 0; i < extraLinks; i += 1) {
    const a = between(0, rooms.length - 1);
    const b = between(0, rooms.length - 1);
    if (a === b) continue;
    links.push([a, b]);
  }

  const carveLongCorridor = (a, b) => {
    const dx = Math.abs(a.gx - b.gx);
    const dy = Math.abs(a.gy - b.gy);
    const xMid = clamp(Math.floor((a.gx + b.gx) / 2) + between(-2, 2), 1, MAP_W - 2);
    const yMid = clamp(Math.floor((a.gy + b.gy) / 2) + between(-2, 2), 1, MAP_H - 2);

    if (dx > dy) {
      carveHCorridor(a.gx, xMid, a.gy);
      carveVCorridor(a.gy, b.gy, xMid);
      carveHCorridor(xMid, b.gx, b.gy);
    } else {
      carveVCorridor(a.gy, yMid, a.gx);
      carveHCorridor(a.gx, b.gx, yMid);
      carveVCorridor(yMid, b.gy, b.gx);
    }
  };

  for (let i = 0; i < links.length; i += 1) {
    const [ia, ib] = links[i];
    const a = centers[ia];
    const b = centers[ib];
    carveLongCorridor(a, b);
  }

  const startNear = centerOf(rooms[0]);
  carveLongCorridor(
    { gx: START_TILE.gx, gy: START_TILE.gy },
    { gx: startNear.gx, gy: startNear.gy },
  );
  map[START_TILE.gy][START_TILE.gx] = '.';

  let stairsRoom = rooms[0];
  let bestDistance = -1;
  const startPoint = { gx: START_TILE.gx, gy: START_TILE.gy };
  for (let i = 0; i < rooms.length; i += 1) {
    const c = centers[i];
    const d = Math.abs(c.gx - startPoint.gx) + Math.abs(c.gy - startPoint.gy);
    if (d > bestDistance) {
      bestDistance = d;
      stairsRoom = rooms[i];
    }
  }
  const stairsCenter = centerOf(stairsRoom);
  const stairs = {
    gx: clamp(stairsCenter.gx, 1, MAP_W - 2),
    gy: clamp(stairsCenter.gy, 1, MAP_H - 2),
  };
  map[stairs.gy][stairs.gx] = '.';
  return { map: map.map((r) => r.join('')), stairs };
}
