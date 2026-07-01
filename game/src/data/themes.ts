// Floor visual themes — distilled 3D palettes from the legacy 2D
// floorThemes.js tables (ADR-002: the 1.4k-line 2D decor tables are not
// ported; themes here are material/light parameters only).

export interface FloorTheme {
  name: string;
  background: number;
  fog: number;
  /** Base floor tint + per-variant multipliers for subtle variety. */
  floor: number;
  floorVariantTints: [number, number, number];
  wall: number;
  wallVariantTints: [number, number, number];
  stairsEmissive: number;
  hemiSky: number;
  hemiGround: number;
  keyLight: number;
}

const THEMES: { fromFloor: number; theme: FloorTheme }[] = [
  {
    fromFloor: 1,
    theme: {
      name: 'Sewers',
      background: 0x0b1210,
      fog: 0x0b1210,
      floor: 0x3d4a41,
      floorVariantTints: [0xffffff, 0xdfe8df, 0xc9d6c9],
      wall: 0x28322c,
      wallVariantTints: [0xffffff, 0xe8efe8, 0xd2ddd2],
      stairsEmissive: 0x8a5a00,
      hemiSky: 0x7f9e8a,
      hemiGround: 0x22332a,
      keyLight: 0xd8ffe6,
    },
  },
  {
    fromFloor: 4,
    theme: {
      name: 'Catacombs',
      background: 0x0d0b14,
      fog: 0x0d0b14,
      floor: 0x4a4441,
      floorVariantTints: [0xffffff, 0xe8e0dc, 0xd6ccc6],
      wall: 0x322c27,
      wallVariantTints: [0xffffff, 0xefe8e0, 0xddd2c6],
      stairsEmissive: 0x8a5a00,
      hemiSky: 0x9e8a7f,
      hemiGround: 0x332a22,
      keyLight: 0xffe6c0,
    },
  },
  {
    fromFloor: 7,
    theme: {
      name: 'Caves',
      background: 0x120d0b,
      fog: 0x120d0b,
      floor: 0x4a3d35,
      floorVariantTints: [0xffffff, 0xe8ddd4, 0xd6c6ba],
      wall: 0x33261f,
      wallVariantTints: [0xffffff, 0xefe0d4, 0xddc9b8],
      stairsEmissive: 0x8a5a00,
      hemiSky: 0x9e8a70,
      hemiGround: 0x33251c,
      keyLight: 0xffd9a0,
    },
  },
  {
    fromFloor: 10,
    theme: {
      name: 'Inferno',
      background: 0x140808,
      fog: 0x140808,
      floor: 0x4a3030,
      floorVariantTints: [0xffffff, 0xe8d0d0, 0xd6b8b8],
      wall: 0x351d1d,
      wallVariantTints: [0xffffff, 0xefd4d4, 0xddb8b8],
      stairsEmissive: 0xaa3300,
      hemiSky: 0x9e7070,
      hemiGround: 0x331c1c,
      keyLight: 0xffb080,
    },
  },
];

export function themeForFloor(floorLevel: number): FloorTheme {
  let picked = THEMES[0]!.theme;
  for (const { fromFloor, theme } of THEMES) {
    if (floorLevel >= fromFloor) picked = theme;
  }
  return picked;
}
