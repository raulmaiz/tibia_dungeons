// Procedural dungeon generator — TS port of game/js/dungeon/generator.js.
// Algorithm untouched (rooms + MST + L-corridors, ADR-002); the only API
// change is that Phaser's `between`/`clamp` injections are gone and the
// RNG is a plain injectable function for reproducible dungeons.

import { clamp, defaultRng, type Rng } from '../../core/rng';

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedLevel {
  /** One string per row: '#' wall, '.' floor. */
  map: string[];
  stairs: { gx: number; gy: number };
  rooms: Room[];
}

/**
 * Calcula las dimensiones del mapa para un floor dado su número de criaturas.
 * Objetivo: ~10 casillas de suelo por criatura, cobertura ~42%.
 */
export function computeDungeonSize(totalCreatures: number): { w: number; h: number } {
  const n = Math.max(10, totalCreatures);
  const totalTiles = Math.ceil((n * 10) / 0.42);
  const aspect = 1.65;
  const h = Math.max(14, Math.ceil(Math.sqrt(totalTiles / aspect)));
  const w = Math.max(20, Math.ceil(h * aspect));
  return { w, h };
}

export interface GenerateLevelOptions {
  totalCreatures?: number;
  MAP_W: number;
  MAP_H: number;
  START_TILE: { gx: number; gy: number };
  random?: Rng;
}

/**
 * Genera un mapa de dungeon con salas y pasillos.
 *
 * - Tamaño basado en totalCreatures (o en MAP_W/MAP_H si se pasan directamente)
 * - Tres tipos de sala: pequeña, mediana y gran sala
 * - Pasillos L-shaped o rectos
 * - Árbol de expansión mínima + conexiones extra (bucles)
 * - Escaleras en la sala más lejana del inicio
 */
export function generateLevelMap({
  totalCreatures = 15,
  MAP_W,
  MAP_H,
  START_TILE,
  random = defaultRng,
}: GenerateLevelOptions): GeneratedLevel {
  const W = MAP_W;
  const H = MAP_H;

  // Helper: entero aleatorio [lo, hi] usando la función random pasada
  const rnd = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));

  const map: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => '#'));
  const rooms: Room[] = [];

  // Número de salas proporcional a las criaturas
  const roomTarget = Math.max(6, Math.ceil(totalCreatures / 3));
  const maxAttempts = roomTarget * 22;

  const carveRect = (rx: number, ry: number, rw: number, rh: number) => {
    for (let y = ry; y < ry + rh; y += 1) {
      for (let x = rx; x < rx + rw; x += 1) {
        if (x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1) continue;
        map[y]![x] = '.';
      }
    }
  };

  const overlaps = (a: Room, b: Room) =>
    !(a.x + a.w + 1 < b.x || b.x + b.w + 1 < a.x || a.y + a.h + 1 < b.y || b.y + b.h + 1 < a.y);

  for (let attempt = 0; attempt < maxAttempts && rooms.length < roomTarget; attempt += 1) {
    const roll = random();
    let rw: number;
    let rh: number;
    if (roll < 0.18) {
      // Gran sala
      rw = rnd(11, Math.min(17, Math.floor(W * 0.32)));
      rh = rnd(7, Math.min(11, Math.floor(H * 0.32)));
    } else if (roll < 0.55) {
      // Sala mediana
      rw = rnd(7, Math.min(12, Math.floor(W * 0.25)));
      rh = rnd(5, Math.min(8, Math.floor(H * 0.25)));
    } else {
      // Sala pequeña
      rw = rnd(4, Math.min(7, Math.floor(W * 0.18)));
      rh = rnd(3, Math.min(5, Math.floor(H * 0.18)));
    }
    rw = Math.max(4, rw);
    rh = Math.max(3, rh);
    const rx = rnd(1, Math.max(2, W - rw - 2));
    const ry = rnd(1, Math.max(2, H - rh - 2));
    const next: Room = { x: rx, y: ry, w: rw, h: rh };
    if (rooms.some((r) => overlaps(r, next))) continue;
    carveRect(rx, ry, rw, rh);
    rooms.push(next);
  }

  if (rooms.length === 0) {
    const fallback: Room = { x: 2, y: 2, w: Math.max(6, W - 4), h: Math.max(5, H - 4) };
    carveRect(fallback.x, fallback.y, fallback.w, fallback.h);
    rooms.push(fallback);
  }

  const centerOf = (r: Room) => ({
    gx: Math.floor(r.x + r.w / 2),
    gy: Math.floor(r.y + r.h / 2),
  });

  // Pasillo horizontal de 1 tile de alto
  const carveH = (x1: number, x2: number, y: number) => {
    const from = Math.min(x1, x2);
    const to = Math.max(x1, x2);
    for (let x = from; x <= to; x += 1) {
      if (x > 0 && x < W - 1 && y > 0 && y < H - 1) map[y]![x] = '.';
    }
  };

  // Pasillo vertical de 1 tile de ancho
  const carveV = (y1: number, y2: number, x: number) => {
    const from = Math.min(y1, y2);
    const to = Math.max(y1, y2);
    for (let y = from; y <= to; y += 1) {
      if (y > 0 && y < H - 1 && x > 0 && x < W - 1) map[y]![x] = '.';
    }
  };

  // Conecta dos centros con un pasillo en L
  const connect = (a: { gx: number; gy: number }, b: { gx: number; gy: number }) => {
    if (random() < 0.5) {
      carveH(a.gx, b.gx, a.gy);
      carveV(a.gy, b.gy, b.gx);
    } else {
      carveV(a.gy, b.gy, a.gx);
      carveH(a.gx, b.gx, b.gy);
    }
    // Punto de quiebre central aleatorio para más variedad de rutas
    if (random() < 0.35) {
      const midX = clamp(Math.floor((a.gx + b.gx) / 2) + rnd(-2, 2), 1, W - 2);
      const midY = clamp(Math.floor((a.gy + b.gy) / 2) + rnd(-2, 2), 1, H - 2);
      carveH(a.gx, midX, a.gy);
      carveV(a.gy, midY, midX);
      carveH(midX, b.gx, midY);
      carveV(midY, b.gy, b.gx);
    }
  };

  // --- Árbol de expansión mínima (garantiza conectividad) ---
  const centers = rooms.map(centerOf);
  const connected = new Set<number>([0]);
  while (connected.size < rooms.length) {
    let bestFrom = -1;
    let bestTo = -1;
    let bestDist = Infinity;
    connected.forEach((from) => {
      for (let to = 0; to < rooms.length; to += 1) {
        if (connected.has(to)) continue;
        const dx = Math.abs(centers[from]!.gx - centers[to]!.gx);
        const dy = Math.abs(centers[from]!.gy - centers[to]!.gy);
        const dist = dx + dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = from;
          bestTo = to;
        }
      }
    });
    if (bestFrom === -1) break;
    connect(centers[bestFrom]!, centers[bestTo]!);
    connected.add(bestTo);
  }

  // --- Conexiones extra (bucles) para más variedad de rutas ---
  const extraLinks = Math.max(3, Math.ceil(rooms.length / 2.2));
  for (let i = 0; i < extraLinks; i += 1) {
    const a = Math.floor(random() * rooms.length);
    const b = Math.floor(random() * rooms.length);
    if (a !== b) connect(centers[a]!, centers[b]!);
  }

  // Conectar la casilla de inicio a la sala más cercana
  const startNear = centerOf(rooms[0]!);
  connect({ gx: START_TILE.gx, gy: START_TILE.gy }, { gx: startNear.gx, gy: startNear.gy });
  map[START_TILE.gy]![START_TILE.gx] = '.';

  // Escaleras en la sala más lejana del inicio (maximiza distancia a explorar)
  let stairsRoom = rooms[0]!;
  let bestDist = -1;
  for (const room of rooms) {
    const c = centerOf(room);
    const d = Math.abs(c.gx - START_TILE.gx) + Math.abs(c.gy - START_TILE.gy);
    if (d > bestDist) {
      bestDist = d;
      stairsRoom = room;
    }
  }
  const sc = centerOf(stairsRoom);
  const stairs = {
    gx: clamp(sc.gx, 1, W - 2),
    gy: clamp(sc.gy, 1, H - 2),
  };
  map[stairs.gy]![stairs.gx] = '.';

  return { map: map.map((r) => r.join('')), stairs, rooms };
}
