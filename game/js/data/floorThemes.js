/**
 * Per-floor visual themes. Each theme drives the FloorAtmosphere layer:
 * tile palette + jitter, wall accents, decorations, ambient particles,
 * vignette/tint overlays and the pit (level exit) styling.
 *
 * Gameplay is unchanged — themes only affect rendering above the tile grid.
 */

const DEFAULT_THEME = {
  name: 'Default',
  palette: {
    floorBase: 0x121a2e,
    floorAlt:  0x182238,
    floorDamp: 0x151c2e,
    wall:      0x2a3d58,
    wallEdge:  0x3d5477,
    wallShadow:0x0d1422,
    outer:     0x080e18,
    ambientTint: 0x0a1020,
    ambientTintAlpha: 0.05,
    vignetteAlpha: 0.45,
  },
  noise: { dampProb: 0 },
  decor: { density: 0, weights: {} },
  cornerWeb: { probability: 0, color: 0xffffff, alpha: 0 },
  particles: null,
  pit: {
    rings: [
      { r: 0.46, color: 0x080a10, alpha: 0.95 },
      { r: 0.36, color: 0x04060a, alpha: 1.0 },
      { r: 0.26, color: 0x020305, alpha: 1.0 },
      { r: 0.16, color: 0x000000, alpha: 1.0 },
    ],
    rimHighlight: { color: 0x3d5477, alpha: 0.55 },
    rubbleColor: 0x1a2232,
    rubbleCount: 6,
    innerGlow: { color: 0x1a2540, alpha: 0.4 },
  },
  wallArt: { basePattern: 'bricks', motifDensity: 0.10, motifWeights: { wallCrack: 2 } },
};

export const FLOOR_THEMES = {
  /** Floor 1 — Rats. Damp cellars, mossy slate, droppings, puddles, cobwebs. */
  1: {
    name: 'Rats',
    palette: {
      floorBase: 0x1a1712, floorAlt: 0x211d17, floorDamp: 0x182020,
      wall: 0x3a332b, wallEdge: 0x554c40, wallShadow: 0x110e0a, outer: 0x050403,
      ambientTint: 0x0f1a0c, ambientTintAlpha: 0.09, vignetteAlpha: 0.62,
    },
    noise: { dampProb: 0.09 },
    decor: {
      density: 0.42,
      weights: { droppings: 3, puddle: 2, crack: 2, moss: 2, bones: 1, grain: 1, brickPatch: 2 },
    },
    cornerWeb: { probability: 0.22, color: 0xc4baa0, alpha: 0.38 },
    particles: { mode: 'drift', count: 28, color: 0x8a7a55,
      alpha: { min: 0.12, max: 0.42 }, size: { min: 1, max: 2.2 }, speed: { min: 8, max: 18 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0f0c08, alpha: 0.95 }, { r: 0.40, color: 0x0a0806, alpha: 1 },
        { r: 0.32, color: 0x060403, alpha: 1 }, { r: 0.24, color: 0x030201, alpha: 1 },
        { r: 0.14, color: 0x000000, alpha: 1 },
      ],
      rimHighlight: { color: 0x5a4e3c, alpha: 0.60 },
      rubbleColor: 0x2a231a, rubbleCount: 8,
      innerGlow: { color: 0x231806, alpha: 0.45 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.15,
      motifWeights: { wallCrack: 3, mossStreak: 2, webWall: 2, skull: 1, niche: 1 },
    },
  },

  /** Floor 2 — Wolves. Snowy pine-cavern, frost, fur tufts, icy pools. */
  2: {
    name: 'Wolves',
    palette: {
      floorBase: 0x1d2328, floorAlt: 0x232a30, floorDamp: 0x2a3840,
      wall: 0x2f3a42, wallEdge: 0x546270, wallShadow: 0x0c1014, outer: 0x060809,
      ambientTint: 0x142028, ambientTintAlpha: 0.10, vignetteAlpha: 0.55,
    },
    noise: { dampProb: 0.12 },
    decor: {
      density: 0.46,
      weights: { snow: 4, pine: 2, fur: 2, bones: 1, icePatch: 2, crack: 1, pawprint: 2 },
    },
    cornerWeb: { probability: 0.04, color: 0xe8eef4, alpha: 0.40 },
    particles: { mode: 'fall', count: 34, color: 0xe8f0f8,
      alpha: { min: 0.25, max: 0.75 }, size: { min: 1, max: 2 }, speed: { min: 15, max: 35 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0b1015, alpha: 0.95 }, { r: 0.40, color: 0x070a0e, alpha: 1 },
        { r: 0.30, color: 0x040608, alpha: 1 }, { r: 0.18, color: 0x010203, alpha: 1 },
        { r: 0.10, color: 0x000000, alpha: 1 },
      ],
      rimHighlight: { color: 0x8aa2b5, alpha: 0.65 },
      rubbleColor: 0x1f2830, rubbleCount: 7,
      innerGlow: { color: 0x2b3a48, alpha: 0.30 },
    },
    wallArt: {
      basePattern: 'frost',
      motifDensity: 0.18,
      motifWeights: { iceCrystal: 3, wallCrack: 2, mossStreak: 1, skull: 1 },
    },
  },

  /** Floor 3 — Rotworms. Fleshy decay, bile, gore, maggots, stagnant pools. */
  3: {
    name: 'Rotworms',
    palette: {
      floorBase: 0x22180f, floorAlt: 0x2a1d12, floorDamp: 0x2f1810,
      wall: 0x3a2a1a, wallEdge: 0x5a4326, wallShadow: 0x0f0805, outer: 0x070402,
      ambientTint: 0x1f0a04, ambientTintAlpha: 0.14, vignetteAlpha: 0.66,
    },
    noise: { dampProb: 0.18 },
    decor: {
      density: 0.55,
      weights: { gore: 3, maggot: 2, bile: 2, wormTrail: 3, puddle: 2, bones: 1, crack: 1 },
    },
    cornerWeb: { probability: 0.10, color: 0x6b3a32, alpha: 0.35 },
    particles: { mode: 'erratic', count: 18, color: 0x1a0806,
      alpha: { min: 0.30, max: 0.70 }, size: { min: 1.2, max: 2 }, speed: { min: 30, max: 55 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x2a0a05, alpha: 0.88 }, { r: 0.40, color: 0x180604, alpha: 1 },
        { r: 0.30, color: 0x0d0302, alpha: 1 }, { r: 0.18, color: 0x040101, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a3020, alpha: 0.55 },
      rubbleColor: 0x331410, rubbleCount: 10,
      innerGlow: { color: 0x5a1008, alpha: 0.55 },
    },
    wallArt: {
      basePattern: 'flesh',
      motifDensity: 0.20,
      motifWeights: { wallVeinRed: 3, bloodSplatter: 2, wallCrack: 1 },
    },
  },

  /** Floor 4 — Trolls. Primitive mud lair, crushed bones, rotten grain, clubs. */
  4: {
    name: 'Trolls',
    palette: {
      floorBase: 0x1f1a12, floorAlt: 0x251f15, floorDamp: 0x1b1a10,
      wall: 0x38301f, wallEdge: 0x544a30, wallShadow: 0x0d0905, outer: 0x060403,
      ambientTint: 0x141208, ambientTintAlpha: 0.10, vignetteAlpha: 0.60,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.45,
      weights: { mud: 3, bigBone: 2, bones: 2, crushedRock: 2, grain: 1, crack: 1, brickPatch: 2, pawprint: 1 },
    },
    cornerWeb: { probability: 0.15, color: 0xb5a98a, alpha: 0.35 },
    particles: { mode: 'drift', count: 22, color: 0x7a6a48,
      alpha: { min: 0.15, max: 0.40 }, size: { min: 1, max: 2 }, speed: { min: 10, max: 20 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0d0906, alpha: 0.95 }, { r: 0.40, color: 0x080604, alpha: 1 },
        { r: 0.30, color: 0x040302, alpha: 1 }, { r: 0.18, color: 0x010100, alpha: 1 },
      ],
      rimHighlight: { color: 0x5a4a2e, alpha: 0.55 },
      rubbleColor: 0x2a2215, rubbleCount: 9,
      innerGlow: { color: 0x1d1204, alpha: 0.40 },
    },
    wallArt: {
      basePattern: 'rough',
      motifDensity: 0.16,
      motifWeights: { wallCrack: 2, skull: 2, bloodSplatter: 1, mossStreak: 2 },
    },
  },

  /** Floor 5 — Undead. Crypt of ghouls/skeletons, bone piles, ashen mist, skulls. */
  5: {
    name: 'Undead',
    palette: {
      floorBase: 0x15161a, floorAlt: 0x1b1c22, floorDamp: 0x1a1e22,
      wall: 0x2f2f36, wallEdge: 0x4a4a54, wallShadow: 0x08080a, outer: 0x030304,
      ambientTint: 0x180f24, ambientTintAlpha: 0.14, vignetteAlpha: 0.68,
    },
    noise: { dampProb: 0.08 },
    decor: {
      density: 0.52,
      weights: { skull: 3, bones: 3, bigBone: 2, coffinLid: 2, crack: 2, ashPile: 2, moss: 1 },
    },
    cornerWeb: { probability: 0.30, color: 0xcac4b0, alpha: 0.40 },
    particles: { mode: 'rise', count: 22, color: 0x9a8aa8,
      alpha: { min: 0.18, max: 0.50 }, size: { min: 1.5, max: 3 }, speed: { min: 4, max: 12 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0a0612, alpha: 0.95 }, { r: 0.40, color: 0x06040c, alpha: 1 },
        { r: 0.30, color: 0x030208, alpha: 1 }, { r: 0.18, color: 0x010003, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a5a80, alpha: 0.65 },
      rubbleColor: 0x2a2432, rubbleCount: 10,
      innerGlow: { color: 0x3a2458, alpha: 0.55 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.24,
      motifWeights: { niche: 3, torch: 2, runeGlow: 1, chain: 2, skull: 3 },
    },
  },

  /** Floor 6 — Humans (Hunter/Valkyrie). Bandit camp: firepits, leather, blades. */
  6: {
    name: 'Humans',
    palette: {
      floorBase: 0x1e1a14, floorAlt: 0x262017, floorDamp: 0x1a1a14,
      wall: 0x3b3226, wallEdge: 0x5c4f38, wallShadow: 0x100c07, outer: 0x060503,
      ambientTint: 0x1e1405, ambientTintAlpha: 0.10, vignetteAlpha: 0.55,
    },
    noise: { dampProb: 0.06 },
    decor: {
      density: 0.48,
      weights: { firepit: 2, bladeShard: 2, leather: 2, bones: 1, brickPatch: 2, crack: 2, torn: 1 },
    },
    cornerWeb: { probability: 0.05, color: 0xb5a98a, alpha: 0.25 },
    particles: { mode: 'rise', count: 20, color: 0xd89a42,
      alpha: { min: 0.30, max: 0.75 }, size: { min: 1, max: 2 }, speed: { min: 12, max: 28 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0e0804, alpha: 0.95 }, { r: 0.40, color: 0x080502, alpha: 1 },
        { r: 0.30, color: 0x040201, alpha: 1 }, { r: 0.18, color: 0x020100, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a4e2a, alpha: 0.60 },
      rubbleColor: 0x2a1e10, rubbleCount: 8,
      innerGlow: { color: 0x6e2a08, alpha: 0.50 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.20,
      motifWeights: { torch: 3, banner: 2, wallCrack: 1 },
    },
  },

  /** Floor 7 — Dwarves. Mine shaft: ore veins, rails, soot, crushed rock. */
  7: {
    name: 'Dwarves',
    palette: {
      floorBase: 0x1a1612, floorAlt: 0x211c17, floorDamp: 0x1a1814,
      wall: 0x332a24, wallEdge: 0x4e4238, wallShadow: 0x0c0906, outer: 0x050403,
      ambientTint: 0x140a03, ambientTintAlpha: 0.09, vignetteAlpha: 0.58,
    },
    noise: { dampProb: 0.04 },
    decor: {
      density: 0.45,
      weights: { ore: 3, rail: 2, soot: 2, crushedRock: 3, brickPatch: 2, crack: 2, bones: 1 },
    },
    cornerWeb: { probability: 0.10, color: 0xa89a80, alpha: 0.25 },
    particles: { mode: 'drift', count: 26, color: 0x4a3a28,
      alpha: { min: 0.18, max: 0.45 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 22 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0f0a06, alpha: 0.95 }, { r: 0.40, color: 0x0a0704, alpha: 1 },
        { r: 0.30, color: 0x050302, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a5e3a, alpha: 0.60 },
      rubbleColor: 0x3a2d20, rubbleCount: 10,
      innerGlow: { color: 0xa85a10, alpha: 0.55 },
    },
    wallArt: {
      basePattern: 'rough',
      motifDensity: 0.22,
      motifWeights: { oreVein: 3, wallCrack: 2, scorchMark: 1 },
    },
  },

  /** Floor 8 — Minotaurs. Labyrinth halls: blood stains, skulls, torchlight. */
  8: {
    name: 'Minotaurs',
    palette: {
      floorBase: 0x1a120e, floorAlt: 0x211710, floorDamp: 0x1d1510,
      wall: 0x3d2d22, wallEdge: 0x5e4638, wallShadow: 0x0e0805, outer: 0x060302,
      ambientTint: 0x220a06, ambientTintAlpha: 0.14, vignetteAlpha: 0.64,
    },
    noise: { dampProb: 0.08 },
    decor: {
      density: 0.50,
      weights: { blood: 3, skull: 2, bones: 2, crack: 2, brickPatch: 2, torchMark: 2, moss: 1 },
    },
    cornerWeb: { probability: 0.18, color: 0x9a8870, alpha: 0.35 },
    particles: { mode: 'rise', count: 20, color: 0xe08a38,
      alpha: { min: 0.25, max: 0.70 }, size: { min: 1, max: 2 }, speed: { min: 8, max: 22 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x1e0604, alpha: 0.95 }, { r: 0.40, color: 0x120402, alpha: 1 },
        { r: 0.30, color: 0x080201, alpha: 1 }, { r: 0.18, color: 0x030100, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a3418, alpha: 0.62 },
      rubbleColor: 0x2e1812, rubbleCount: 9,
      innerGlow: { color: 0x8a1a08, alpha: 0.60 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.24,
      motifWeights: { torch: 3, skull: 2, bloodSplatter: 2, chain: 1, wallCrack: 1 },
    },
  },

  /** Floor 9 — Goblins. Junkyard lair: scrap, graffiti, crushed debris. */
  9: {
    name: 'Goblins',
    palette: {
      floorBase: 0x1a1814, floorAlt: 0x20201a, floorDamp: 0x1a1f18,
      wall: 0x3a3a2a, wallEdge: 0x585a40, wallShadow: 0x0d0e08, outer: 0x050603,
      ambientTint: 0x14180a, ambientTintAlpha: 0.10, vignetteAlpha: 0.58,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.55,
      weights: { scrap: 3, graffiti: 2, droppings: 2, crushedRock: 2, brickPatch: 2, bones: 1, crack: 1 },
    },
    cornerWeb: { probability: 0.14, color: 0xb0a078, alpha: 0.30 },
    particles: { mode: 'drift', count: 22, color: 0x8a8250,
      alpha: { min: 0.15, max: 0.40 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 22 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0d0a05, alpha: 0.95 }, { r: 0.40, color: 0x080603, alpha: 1 },
        { r: 0.30, color: 0x040302, alpha: 1 }, { r: 0.18, color: 0x010100, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a6a3c, alpha: 0.55 },
      rubbleColor: 0x28281a, rubbleCount: 8,
      innerGlow: { color: 0x3a4410, alpha: 0.45 },
    },
    wallArt: {
      basePattern: 'rough',
      motifDensity: 0.22,
      motifWeights: { scrapPatch: 3, graffitiWall: 3, wallCrack: 1, spike: 1 },
    },
  },

  /** Floor 10 — Orcs. Bloodied war-camp: skulls, banners, weapon shards. */
  10: {
    name: 'Orcs',
    palette: {
      floorBase: 0x1a0f0b, floorAlt: 0x20130d, floorDamp: 0x1c110d,
      wall: 0x3a2620, wallEdge: 0x5a3a2e, wallShadow: 0x0d0604, outer: 0x060302,
      ambientTint: 0x280805, ambientTintAlpha: 0.16, vignetteAlpha: 0.68,
    },
    noise: { dampProb: 0.08 },
    decor: {
      density: 0.52,
      weights: { blood: 3, skull: 3, bones: 2, tornBanner: 2, weaponShards: 2, crack: 1 },
    },
    cornerWeb: { probability: 0.08, color: 0x9a7a66, alpha: 0.30 },
    particles: { mode: 'rise', count: 22, color: 0xc8502a,
      alpha: { min: 0.20, max: 0.55 }, size: { min: 1, max: 2 }, speed: { min: 10, max: 20 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x200604, alpha: 0.95 }, { r: 0.40, color: 0x150302, alpha: 1 },
        { r: 0.30, color: 0x080101, alpha: 1 }, { r: 0.18, color: 0x030000, alpha: 1 },
      ],
      rimHighlight: { color: 0x8a2a18, alpha: 0.65 },
      rubbleColor: 0x2e1008, rubbleCount: 10,
      innerGlow: { color: 0x8a0808, alpha: 0.60 },
    },
    wallArt: {
      basePattern: 'rough',
      motifDensity: 0.24,
      motifWeights: { spike: 3, banner: 2, skull: 3, bloodSplatter: 2 },
    },
  },

  /** Floor 11 — Minotaurs II. Deeper labyrinth: more blood, runes, ritual marks. */
  11: {
    name: 'Minotaurs II',
    palette: {
      floorBase: 0x180d08, floorAlt: 0x1f120c, floorDamp: 0x1c0e09,
      wall: 0x3a271d, wallEdge: 0x5a3c2c, wallShadow: 0x0c0604, outer: 0x050201,
      ambientTint: 0x280604, ambientTintAlpha: 0.18, vignetteAlpha: 0.70,
    },
    noise: { dampProb: 0.09 },
    decor: {
      density: 0.55,
      weights: { blood: 3, bigBone: 2, skull: 2, rune: 2, crack: 2, brickPatch: 1, torchMark: 2 },
    },
    cornerWeb: { probability: 0.22, color: 0x9a8870, alpha: 0.38 },
    particles: { mode: 'rise', count: 22, color: 0xe84a18,
      alpha: { min: 0.25, max: 0.70 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 24 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x260604, alpha: 0.95 }, { r: 0.40, color: 0x180302, alpha: 1 },
        { r: 0.30, color: 0x0a0201, alpha: 1 }, { r: 0.18, color: 0x040000, alpha: 1 },
      ],
      rimHighlight: { color: 0x9a3414, alpha: 0.70 },
      rubbleColor: 0x321208, rubbleCount: 10,
      innerGlow: { color: 0xa41a08, alpha: 0.65 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.26,
      motifWeights: { runeGlow: 3, skull: 2, chain: 2, bloodSplatter: 2, torch: 2 },
    },
  },

  /** Floor 12 — Dwarves II (Forge). Molten mine: lava cracks, anvils, embers. */
  12: {
    name: 'Dwarven Forge',
    palette: {
      floorBase: 0x18120b, floorAlt: 0x1e160d, floorDamp: 0x261308,
      wall: 0x36281d, wallEdge: 0x5a422c, wallShadow: 0x0a0604, outer: 0x050302,
      ambientTint: 0x3a1a04, ambientTintAlpha: 0.14, vignetteAlpha: 0.58,
    },
    noise: { dampProb: 0.14 },
    decor: {
      density: 0.52,
      weights: { lavaCrack: 3, ember: 3, ore: 2, anvil: 1, soot: 2, crushedRock: 2, crack: 1 },
    },
    cornerWeb: { probability: 0.03, color: 0x9a8870, alpha: 0.20 },
    particles: { mode: 'rise', count: 32, color: 0xff7a18,
      alpha: { min: 0.35, max: 0.85 }, size: { min: 1, max: 2.3 }, speed: { min: 18, max: 40 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x3a0a00, alpha: 0.95 }, { r: 0.40, color: 0x5a1a02, alpha: 1 },
        { r: 0.30, color: 0x8a2a02, alpha: 1 }, { r: 0.18, color: 0xc05008, alpha: 1 },
        { r: 0.10, color: 0xffb040, alpha: 1 },
      ],
      rimHighlight: { color: 0xffa040, alpha: 0.80 },
      rubbleColor: 0x3a1a0c, rubbleCount: 9,
      innerGlow: { color: 0xffd090, alpha: 0.80 },
    },
    wallArt: {
      basePattern: 'metal',
      motifDensity: 0.22,
      motifWeights: { wallVeinLava: 3, oreVein: 2, scorchMark: 1 },
    },
  },

  /** Floor 13 — Lizards. Sandstone temple: hieroglyphs, shed scales, sand drifts. */
  13: {
    name: 'Lizards',
    palette: {
      floorBase: 0x2a220f, floorAlt: 0x332a14, floorDamp: 0x2e2a10,
      wall: 0x5a4826, wallEdge: 0x8a7236, wallShadow: 0x1e1608, outer: 0x0a0804,
      ambientTint: 0x3a2a0c, ambientTintAlpha: 0.10, vignetteAlpha: 0.50,
    },
    noise: { dampProb: 0.06 },
    decor: {
      density: 0.45,
      weights: { sand: 3, hieroglyph: 2, scaleShed: 3, crack: 2, bones: 1, brickPatch: 2 },
    },
    cornerWeb: { probability: 0.04, color: 0xc8b888, alpha: 0.20 },
    particles: { mode: 'drift', count: 24, color: 0xd8b858,
      alpha: { min: 0.18, max: 0.42 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 20 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x120c05, alpha: 0.95 }, { r: 0.40, color: 0x0a0703, alpha: 1 },
        { r: 0.30, color: 0x060402, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0xb8984a, alpha: 0.70 },
      rubbleColor: 0x4a3a1a, rubbleCount: 9,
      innerGlow: { color: 0x6a4a0a, alpha: 0.50 },
    },
    wallArt: {
      basePattern: 'sandstone',
      motifDensity: 0.22,
      motifWeights: { hieroglyphWall: 4, wallCrack: 2, runeGlow: 1 },
    },
  },

  /** Floor 14 — Vampires. Gothic crypt: blood pools, rose petals, candle wax. */
  14: {
    name: 'Vampires',
    palette: {
      floorBase: 0x110810, floorAlt: 0x170b14, floorDamp: 0x1a0a16,
      wall: 0x30202e, wallEdge: 0x503a50, wallShadow: 0x0a040a, outer: 0x050205,
      ambientTint: 0x1e0814, ambientTintAlpha: 0.18, vignetteAlpha: 0.72,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.50,
      weights: { bloodPool: 3, petals: 2, candleWax: 2, skull: 2, crack: 1, brickPatch: 2, rune: 1 },
    },
    cornerWeb: { probability: 0.40, color: 0xd0c8d8, alpha: 0.45 },
    particles: { mode: 'drift', count: 26, color: 0x7a3848,
      alpha: { min: 0.20, max: 0.50 }, size: { min: 1.2, max: 2.4 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x2a0612, alpha: 0.95 }, { r: 0.40, color: 0x18030a, alpha: 1 },
        { r: 0.30, color: 0x0a0205, alpha: 1 }, { r: 0.18, color: 0x040102, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a3a58, alpha: 0.70 },
      rubbleColor: 0x2c1220, rubbleCount: 10,
      innerGlow: { color: 0xa00820, alpha: 0.65 },
    },
    wallArt: {
      basePattern: 'gothic',
      motifDensity: 0.22,
      motifWeights: { torch: 2, banner: 2, gargoyle: 2, chain: 1, runeGlow: 1 },
    },
  },

  /** Floor 15 — Giant Spiders. Webbed tunnels: egg sacs, chitin, cocoons. */
  15: {
    name: 'Giant Spiders',
    palette: {
      floorBase: 0x12100e, floorAlt: 0x17140f, floorDamp: 0x141810,
      wall: 0x2a2622, wallEdge: 0x46403a, wallShadow: 0x080605, outer: 0x040302,
      ambientTint: 0x0a180a, ambientTintAlpha: 0.14, vignetteAlpha: 0.70,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.58,
      weights: { webPatch: 3, eggSac: 2, chitin: 2, bones: 2, crack: 1, droppings: 1, puddle: 1 },
    },
    cornerWeb: { probability: 0.70, color: 0xe0dcc8, alpha: 0.48 },
    particles: { mode: 'drift', count: 26, color: 0xd8d0a0,
      alpha: { min: 0.15, max: 0.38 }, size: { min: 1, max: 1.8 }, speed: { min: 4, max: 12 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0d0a06, alpha: 0.95 }, { r: 0.40, color: 0x080604, alpha: 1 },
        { r: 0.30, color: 0x040302, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a5a38, alpha: 0.62 },
      rubbleColor: 0x2a2218, rubbleCount: 8,
      innerGlow: { color: 0x2c3a0a, alpha: 0.50 },
    },
    wallArt: {
      basePattern: 'webbed',
      motifDensity: 0.32,
      motifWeights: { webWall: 4, eggSacWall: 3 },
    },
  },

  /** Floor 16 — Wyrms. Volcanic fissures: magma veins, scorched obsidian. */
  16: {
    name: 'Wyrms',
    palette: {
      floorBase: 0x131010, floorAlt: 0x191313, floorDamp: 0x1f1208,
      wall: 0x2e2422, wallEdge: 0x503c34, wallShadow: 0x080504, outer: 0x040302,
      ambientTint: 0x3a0a06, ambientTintAlpha: 0.16, vignetteAlpha: 0.62,
    },
    noise: { dampProb: 0.14 },
    decor: {
      density: 0.52,
      weights: { lavaCrack: 4, ember: 3, scorch: 2, crushedRock: 2, crack: 1, obsidianShard: 2 },
    },
    cornerWeb: { probability: 0.02, color: 0x7a6a5a, alpha: 0.18 },
    particles: { mode: 'rise', count: 34, color: 0xff7030,
      alpha: { min: 0.40, max: 0.90 }, size: { min: 1, max: 2.2 }, speed: { min: 18, max: 42 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x3a0800, alpha: 0.95 }, { r: 0.40, color: 0x5e1a02, alpha: 1 },
        { r: 0.30, color: 0x9a2e02, alpha: 1 }, { r: 0.18, color: 0xdc5a08, alpha: 1 },
        { r: 0.10, color: 0xffc050, alpha: 1 },
      ],
      rimHighlight: { color: 0xff8030, alpha: 0.85 },
      rubbleColor: 0x3a1a08, rubbleCount: 10,
      innerGlow: { color: 0xffe0a0, alpha: 0.80 },
    },
    wallArt: {
      basePattern: 'obsidian',
      motifDensity: 0.24,
      motifWeights: { wallVeinLava: 4, scorchMark: 2 },
    },
  },

  /** Floor 17 — Outlaws (Hero/Vampire). Ruined keep: torn banners, bloodied steel. */
  17: {
    name: 'Outlaws',
    palette: {
      floorBase: 0x150f0f, floorAlt: 0x1b1412, floorDamp: 0x18100f,
      wall: 0x362a28, wallEdge: 0x564440, wallShadow: 0x0a0605, outer: 0x050302,
      ambientTint: 0x18080a, ambientTintAlpha: 0.16, vignetteAlpha: 0.68,
    },
    noise: { dampProb: 0.08 },
    decor: {
      density: 0.50,
      weights: { tornBanner: 3, blood: 2, bloodPool: 1, skull: 2, weaponShards: 2, crushedRock: 2, crack: 1, brickPatch: 2 },
    },
    cornerWeb: { probability: 0.25, color: 0xb8a898, alpha: 0.40 },
    particles: { mode: 'drift', count: 24, color: 0x7a5850,
      alpha: { min: 0.15, max: 0.40 }, size: { min: 1, max: 2.2 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x180606, alpha: 0.95 }, { r: 0.40, color: 0x0e0303, alpha: 1 },
        { r: 0.30, color: 0x060202, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a4a3c, alpha: 0.65 },
      rubbleColor: 0x2a1815, rubbleCount: 10,
      innerGlow: { color: 0x6a1008, alpha: 0.55 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.22,
      motifWeights: { banner: 3, bloodSplatter: 2, wallCrack: 2, torch: 1 },
    },
  },

  /** Floor 18 — Dragons. Obsidian hoard: gold piles, scorched scales, treasure. */
  18: {
    name: 'Dragons',
    palette: {
      floorBase: 0x121010, floorAlt: 0x181414, floorDamp: 0x1c1608,
      wall: 0x2c2220, wallEdge: 0x4c3e38, wallShadow: 0x070403, outer: 0x030202,
      ambientTint: 0x2a1806, ambientTintAlpha: 0.14, vignetteAlpha: 0.60,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.50,
      weights: { goldPile: 3, dragonScale: 2, scorch: 2, bones: 2, ember: 2, crack: 1, brickPatch: 2 },
    },
    cornerWeb: { probability: 0.04, color: 0x9a7a5a, alpha: 0.20 },
    particles: { mode: 'rise', count: 28, color: 0xffb848,
      alpha: { min: 0.28, max: 0.75 }, size: { min: 1, max: 2.2 }, speed: { min: 12, max: 30 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x2a0e02, alpha: 0.95 }, { r: 0.40, color: 0x4a1e04, alpha: 1 },
        { r: 0.30, color: 0x7a3008, alpha: 1 }, { r: 0.18, color: 0xc06018, alpha: 1 },
        { r: 0.10, color: 0xffe0a0, alpha: 1 },
      ],
      rimHighlight: { color: 0xffb060, alpha: 0.80 },
      rubbleColor: 0x3a2410, rubbleCount: 11,
      innerGlow: { color: 0xffe8a0, alpha: 0.70 },
    },
    wallArt: {
      basePattern: 'obsidian',
      motifDensity: 0.22,
      motifWeights: { goldInlay: 3, scorchMark: 2 },
    },
  },

  /** Floor 19 — Behemoths. Giant's hall: colossal bones, broken pillars, moss. */
  19: {
    name: 'Behemoths',
    palette: {
      floorBase: 0x141416, floorAlt: 0x1a1a1c, floorDamp: 0x181c1a,
      wall: 0x302e30, wallEdge: 0x504e50, wallShadow: 0x090809, outer: 0x040404,
      ambientTint: 0x0a1214, ambientTintAlpha: 0.12, vignetteAlpha: 0.62,
    },
    noise: { dampProb: 0.10 },
    decor: {
      density: 0.48,
      weights: { bigBone: 4, brokenPillar: 2, crushedRock: 2, moss: 2, crack: 2, skull: 1, bones: 1 },
    },
    cornerWeb: { probability: 0.12, color: 0xbab0a0, alpha: 0.30 },
    particles: { mode: 'drift', count: 24, color: 0x6a7a80,
      alpha: { min: 0.15, max: 0.42 }, size: { min: 1.2, max: 2.4 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0a0c10, alpha: 0.95 }, { r: 0.40, color: 0x05070a, alpha: 1 },
        { r: 0.30, color: 0x020305, alpha: 1 }, { r: 0.18, color: 0x010102, alpha: 1 },
      ],
      rimHighlight: { color: 0x8090a0, alpha: 0.65 },
      rubbleColor: 0x2a2e30, rubbleCount: 11,
      innerGlow: { color: 0x3a4a5a, alpha: 0.45 },
    },
    wallArt: {
      basePattern: 'bricks',
      motifDensity: 0.18,
      motifWeights: { wallCrack: 1, mossStreak: 2, skull: 1, chain: 1, niche: 1 },
    },
  },

  /** Floor 20 — Demons. Hellscape: lava pools, brimstone, ash fall, pentagrams. */
  20: {
    name: 'Demons',
    palette: {
      floorBase: 0x140808, floorAlt: 0x1b0a0a, floorDamp: 0x200a04,
      wall: 0x381818, wallEdge: 0x5e2a2a, wallShadow: 0x0a0303, outer: 0x050100,
      ambientTint: 0x4a0805, ambientTintAlpha: 0.20, vignetteAlpha: 0.72,
    },
    noise: { dampProb: 0.16 },
    decor: {
      density: 0.55,
      weights: { lava: 3, scorch: 3, brimstone: 2, pentagram: 1, bones: 1, crack: 2, ember: 2 },
    },
    cornerWeb: { probability: 0.05, color: 0x3a1e14, alpha: 0.28 },
    particles: { mode: 'fall', count: 40, color: 0x6a2a18,
      alpha: { min: 0.30, max: 0.80 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 26 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x5a0a00, alpha: 0.95 }, { r: 0.40, color: 0x8a1a02, alpha: 1 },
        { r: 0.30, color: 0xc43008, alpha: 1 }, { r: 0.20, color: 0xff6018, alpha: 1 },
        { r: 0.10, color: 0xffe0a0, alpha: 1 },
      ],
      rimHighlight: { color: 0xff5020, alpha: 0.90 },
      rubbleColor: 0x3a0a04, rubbleCount: 12,
      innerGlow: { color: 0xfff0b0, alpha: 0.90 },
    },
    wallArt: {
      basePattern: 'obsidian',
      motifDensity: 0.28,
      motifWeights: { pentagramWall: 3, wallVeinLava: 2, chain: 1, scorchMark: 2, skull: 2 },
    },
  },
};

/**
 * Archetypes used to generate themes for floor 21+. Each one is a coherent
 * bundle of palette + decoration set + particle mode + pit style. The
 * random generator picks one per floor and jitters its parameters so
 * subsequent floors of the same archetype still feel distinct.
 */
const ARCHETYPES = [
  { // Abyssal Crypt — cold damp stone, skulls, webs
    name: 'Abyssal Crypt',
    palette: {
      floorBase: 0x131518, floorAlt: 0x181b1f, floorDamp: 0x161d22,
      wall: 0x2b2f36, wallEdge: 0x495058, wallShadow: 0x080a0c, outer: 0x040506,
      ambientTint: 0x0a1420, ambientTintAlpha: 0.12, vignetteAlpha: 0.65,
    },
    noise: { dampProb: 0.08 },
    decor: { density: 0.48, weights: { skull: 3, bones: 2, coffinLid: 2, crack: 2, brickPatch: 2, ashPile: 1, moss: 1 } },
    cornerWeb: { probability: 0.32, color: 0xc8c0ac, alpha: 0.40 },
    particles: { mode: 'rise', count: 22, color: 0x8898a8, alpha: { min: 0.18, max: 0.50 }, size: { min: 1.4, max: 2.6 }, speed: { min: 4, max: 12 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x080a10, alpha: 0.95 }, { r: 0.40, color: 0x05070c, alpha: 1 },
        { r: 0.30, color: 0x020305, alpha: 1 }, { r: 0.18, color: 0x010102, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a7a8a, alpha: 0.62 },
      rubbleColor: 0x2a2e34, rubbleCount: 10,
      innerGlow: { color: 0x2a3a58, alpha: 0.45 },
    },
    wallArt: { basePattern: 'bricks', motifDensity: 0.20, motifWeights: { niche: 2, skull: 2, chain: 2, wallCrack: 2, mossStreak: 1 } },
  },
  { // Frozen Warren — icy tunnels
    name: 'Frozen Warren',
    palette: {
      floorBase: 0x1c2228, floorAlt: 0x242a30, floorDamp: 0x2a3a44,
      wall: 0x343d45, wallEdge: 0x5a6a78, wallShadow: 0x0a0d10, outer: 0x050708,
      ambientTint: 0x0e1c24, ambientTintAlpha: 0.11, vignetteAlpha: 0.55,
    },
    noise: { dampProb: 0.14 },
    decor: { density: 0.48, weights: { snow: 4, icePatch: 3, fur: 2, pine: 1, bones: 1, crack: 1, pawprint: 2 } },
    cornerWeb: { probability: 0.06, color: 0xe8eef4, alpha: 0.35 },
    particles: { mode: 'fall', count: 36, color: 0xe8f0f8, alpha: { min: 0.25, max: 0.75 }, size: { min: 1, max: 2 }, speed: { min: 16, max: 38 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0b1218, alpha: 0.95 }, { r: 0.40, color: 0x060a0e, alpha: 1 },
        { r: 0.30, color: 0x030507, alpha: 1 }, { r: 0.18, color: 0x010203, alpha: 1 },
      ],
      rimHighlight: { color: 0x9ab2c6, alpha: 0.68 },
      rubbleColor: 0x202a32, rubbleCount: 8,
      innerGlow: { color: 0x2c4058, alpha: 0.32 },
    },
    wallArt: { basePattern: 'frost', motifDensity: 0.20, motifWeights: { iceCrystal: 3, wallCrack: 2, skull: 1 } },
  },
  { // Fungal Hollow — green spore cavern
    name: 'Fungal Hollow',
    palette: {
      floorBase: 0x141a12, floorAlt: 0x192018, floorDamp: 0x1a2a1a,
      wall: 0x2a342a, wallEdge: 0x4e5c46, wallShadow: 0x070a06, outer: 0x030503,
      ambientTint: 0x0c2010, ambientTintAlpha: 0.13, vignetteAlpha: 0.64,
    },
    noise: { dampProb: 0.18 },
    decor: { density: 0.55, weights: { moss: 4, puddle: 2, eggSac: 2, crack: 1, bones: 1, droppings: 1, webPatch: 1 } },
    cornerWeb: { probability: 0.18, color: 0xc8d8a0, alpha: 0.38 },
    particles: { mode: 'rise', count: 28, color: 0x9ac870, alpha: { min: 0.22, max: 0.55 }, size: { min: 1, max: 2.2 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0a1208, alpha: 0.95 }, { r: 0.40, color: 0x060a05, alpha: 1 },
        { r: 0.30, color: 0x030603, alpha: 1 }, { r: 0.18, color: 0x010201, alpha: 1 },
      ],
      rimHighlight: { color: 0x6a8a40, alpha: 0.65 },
      rubbleColor: 0x24321c, rubbleCount: 10,
      innerGlow: { color: 0x3a7820, alpha: 0.58 },
    },
    wallArt: { basePattern: 'fungal', motifDensity: 0.24, motifWeights: { mossStreak: 4, webWall: 2, eggSacWall: 2, wallCrack: 1 } },
  },
  { // Sulfurous Pit — volcanic fissures
    name: 'Sulfurous Pit',
    palette: {
      floorBase: 0x161110, floorAlt: 0x1c1514, floorDamp: 0x241308,
      wall: 0x342420, wallEdge: 0x583e32, wallShadow: 0x080403, outer: 0x040202,
      ambientTint: 0x3e0c06, ambientTintAlpha: 0.16, vignetteAlpha: 0.64,
    },
    noise: { dampProb: 0.14 },
    decor: { density: 0.54, weights: { lavaCrack: 4, ember: 3, brimstone: 2, scorch: 2, obsidianShard: 2, crushedRock: 1, crack: 1 } },
    cornerWeb: { probability: 0.02, color: 0x7a6a5a, alpha: 0.18 },
    particles: { mode: 'rise', count: 34, color: 0xff7830, alpha: { min: 0.40, max: 0.90 }, size: { min: 1, max: 2.3 }, speed: { min: 18, max: 42 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x3c0a00, alpha: 0.95 }, { r: 0.40, color: 0x621c02, alpha: 1 },
        { r: 0.30, color: 0x9a2e04, alpha: 1 }, { r: 0.18, color: 0xdc5e0c, alpha: 1 },
        { r: 0.10, color: 0xffc858, alpha: 1 },
      ],
      rimHighlight: { color: 0xff8838, alpha: 0.85 },
      rubbleColor: 0x3a1a0a, rubbleCount: 10,
      innerGlow: { color: 0xffe4a8, alpha: 0.80 },
    },
    wallArt: { basePattern: 'obsidian', motifDensity: 0.26, motifWeights: { wallVeinLava: 4, scorchMark: 2, wallCrack: 1 } },
  },
  { // Cursed Sanctum — purple arcane ritual
    name: 'Cursed Sanctum',
    palette: {
      floorBase: 0x13101a, floorAlt: 0x181422, floorDamp: 0x181224,
      wall: 0x2a243a, wallEdge: 0x46405e, wallShadow: 0x07060c, outer: 0x030205,
      ambientTint: 0x180828, ambientTintAlpha: 0.16, vignetteAlpha: 0.70,
    },
    noise: { dampProb: 0.08 },
    decor: { density: 0.48, weights: { rune: 3, candleWax: 2, pentagram: 1, skull: 2, crack: 1, brickPatch: 2, ashPile: 1 } },
    cornerWeb: { probability: 0.22, color: 0xc8bcd8, alpha: 0.38 },
    particles: { mode: 'drift', count: 26, color: 0x8a68c8, alpha: { min: 0.18, max: 0.55 }, size: { min: 1.2, max: 2.4 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x180628, alpha: 0.95 }, { r: 0.40, color: 0x0d0318, alpha: 1 },
        { r: 0.30, color: 0x05020c, alpha: 1 }, { r: 0.18, color: 0x020105, alpha: 1 },
      ],
      rimHighlight: { color: 0x7a5ac8, alpha: 0.70 },
      rubbleColor: 0x221838, rubbleCount: 10,
      innerGlow: { color: 0xa040e8, alpha: 0.70 },
    },
    wallArt: { basePattern: 'gothic', motifDensity: 0.26, motifWeights: { runeGlow: 3, pentagramWall: 2, torch: 2, niche: 2, chain: 1, skull: 2 } },
  },
  { // Bone Yard — dry ossuary
    name: 'Bone Yard',
    palette: {
      floorBase: 0x1a1812, floorAlt: 0x221e16, floorDamp: 0x1c1c16,
      wall: 0x342c22, wallEdge: 0x56493a, wallShadow: 0x09070505, outer: 0x050402,
      ambientTint: 0x140e06, ambientTintAlpha: 0.10, vignetteAlpha: 0.60,
    },
    noise: { dampProb: 0.06 },
    decor: { density: 0.55, weights: { skull: 3, bones: 3, bigBone: 2, coffinLid: 1, ashPile: 2, crack: 1, webPatch: 1 } },
    cornerWeb: { probability: 0.28, color: 0xd8ccb0, alpha: 0.40 },
    particles: { mode: 'drift', count: 24, color: 0xa89a78, alpha: { min: 0.15, max: 0.42 }, size: { min: 1, max: 2.2 }, speed: { min: 6, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0d0a06, alpha: 0.95 }, { r: 0.40, color: 0x080604, alpha: 1 },
        { r: 0.30, color: 0x040302, alpha: 1 }, { r: 0.18, color: 0x010100, alpha: 1 },
      ],
      rimHighlight: { color: 0x8a7a5a, alpha: 0.62 },
      rubbleColor: 0x302a1e, rubbleCount: 12,
      innerGlow: { color: 0x3a2a12, alpha: 0.45 },
    },
    wallArt: { basePattern: 'bricks', motifDensity: 0.26, motifWeights: { skull: 4, niche: 3, chain: 2, wallCrack: 2, webWall: 1 } },
  },
  { // Magma Forge — molten industry
    name: 'Magma Forge',
    palette: {
      floorBase: 0x1a130b, floorAlt: 0x20170d, floorDamp: 0x2a1608,
      wall: 0x3a2d20, wallEdge: 0x5e4830, wallShadow: 0x0a0604, outer: 0x050302,
      ambientTint: 0x3e1e05, ambientTintAlpha: 0.14, vignetteAlpha: 0.58,
    },
    noise: { dampProb: 0.14 },
    decor: { density: 0.52, weights: { lavaCrack: 3, ember: 3, ore: 2, anvil: 1, soot: 2, crushedRock: 2, rail: 1 } },
    cornerWeb: { probability: 0.03, color: 0x9a8870, alpha: 0.20 },
    particles: { mode: 'rise', count: 32, color: 0xff8a22, alpha: { min: 0.35, max: 0.85 }, size: { min: 1, max: 2.3 }, speed: { min: 18, max: 40 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x3a0c00, alpha: 0.95 }, { r: 0.40, color: 0x5e1c02, alpha: 1 },
        { r: 0.30, color: 0x8c2e04, alpha: 1 }, { r: 0.18, color: 0xc45810, alpha: 1 },
        { r: 0.10, color: 0xffb858, alpha: 1 },
      ],
      rimHighlight: { color: 0xffa448, alpha: 0.82 },
      rubbleColor: 0x3a1e10, rubbleCount: 9,
      innerGlow: { color: 0xffd898, alpha: 0.82 },
    },
    wallArt: { basePattern: 'metal', motifDensity: 0.24, motifWeights: { wallVeinLava: 3, oreVein: 2, scorchMark: 2 } },
  },
  { // Vampire Reliquary — gothic blood
    name: 'Vampire Reliquary',
    palette: {
      floorBase: 0x120912, floorAlt: 0x180b16, floorDamp: 0x1a0b18,
      wall: 0x312030, wallEdge: 0x523a52, wallShadow: 0x0a040a, outer: 0x050205,
      ambientTint: 0x200816, ambientTintAlpha: 0.18, vignetteAlpha: 0.72,
    },
    noise: { dampProb: 0.10 },
    decor: { density: 0.50, weights: { bloodPool: 3, petals: 2, candleWax: 2, skull: 2, crack: 1, brickPatch: 1, rune: 1 } },
    cornerWeb: { probability: 0.38, color: 0xd0c8d8, alpha: 0.42 },
    particles: { mode: 'drift', count: 26, color: 0x8a3848, alpha: { min: 0.20, max: 0.55 }, size: { min: 1.2, max: 2.4 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x2c0612, alpha: 0.95 }, { r: 0.40, color: 0x18030a, alpha: 1 },
        { r: 0.30, color: 0x0a0205, alpha: 1 }, { r: 0.18, color: 0x040102, alpha: 1 },
      ],
      rimHighlight: { color: 0x8a3a5a, alpha: 0.72 },
      rubbleColor: 0x2e1222, rubbleCount: 10,
      innerGlow: { color: 0xa81028, alpha: 0.68 },
    },
    wallArt: { basePattern: 'gothic', motifDensity: 0.24, motifWeights: { torch: 2, banner: 2, gargoyle: 2, chain: 1, runeGlow: 1, bloodSplatter: 1 } },
  },
  { // Spider Colony — silk tunnels
    name: 'Spider Colony',
    palette: {
      floorBase: 0x12100e, floorAlt: 0x17150f, floorDamp: 0x151a12,
      wall: 0x2b2722, wallEdge: 0x47413b, wallShadow: 0x080605, outer: 0x040302,
      ambientTint: 0x0c1a0a, ambientTintAlpha: 0.12, vignetteAlpha: 0.68,
    },
    noise: { dampProb: 0.10 },
    decor: { density: 0.60, weights: { webPatch: 3, eggSac: 2, chitin: 2, bones: 2, droppings: 1, crack: 1, puddle: 1 } },
    cornerWeb: { probability: 0.72, color: 0xe4dcc8, alpha: 0.48 },
    particles: { mode: 'drift', count: 26, color: 0xd8d0a0, alpha: { min: 0.15, max: 0.38 }, size: { min: 1, max: 1.8 }, speed: { min: 4, max: 12 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0c0a06, alpha: 0.95 }, { r: 0.40, color: 0x070504, alpha: 1 },
        { r: 0.30, color: 0x040302, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0x70603a, alpha: 0.62 },
      rubbleColor: 0x2a2218, rubbleCount: 9,
      innerGlow: { color: 0x384812, alpha: 0.50 },
    },
    wallArt: { basePattern: 'webbed', motifDensity: 0.34, motifWeights: { webWall: 4, eggSacWall: 3 } },
  },
  { // Orcish Warpath — bloody camp
    name: 'Orcish Warpath',
    palette: {
      floorBase: 0x180e0a, floorAlt: 0x1f120c, floorDamp: 0x1a0f0a,
      wall: 0x3a2620, wallEdge: 0x5c3a2e, wallShadow: 0x0c0504, outer: 0x060302,
      ambientTint: 0x2a0806, ambientTintAlpha: 0.16, vignetteAlpha: 0.68,
    },
    noise: { dampProb: 0.08 },
    decor: { density: 0.52, weights: { blood: 3, skull: 2, tornBanner: 2, weaponShards: 2, bones: 1, firepit: 1, bloodPool: 1 } },
    cornerWeb: { probability: 0.08, color: 0x9a7a66, alpha: 0.28 },
    particles: { mode: 'rise', count: 24, color: 0xc85030, alpha: { min: 0.22, max: 0.58 }, size: { min: 1, max: 2 }, speed: { min: 10, max: 22 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x220604, alpha: 0.95 }, { r: 0.40, color: 0x140302, alpha: 1 },
        { r: 0.30, color: 0x080101, alpha: 1 }, { r: 0.18, color: 0x030000, alpha: 1 },
      ],
      rimHighlight: { color: 0x92321a, alpha: 0.70 },
      rubbleColor: 0x2e1008, rubbleCount: 10,
      innerGlow: { color: 0x8e0a0a, alpha: 0.62 },
    },
    wallArt: { basePattern: 'rough', motifDensity: 0.26, motifWeights: { spike: 3, banner: 2, skull: 3, bloodSplatter: 2 } },
  },
  { // Dragon Hoard — gold among scorch
    name: 'Dragon Hoard',
    palette: {
      floorBase: 0x141010, floorAlt: 0x1a1414, floorDamp: 0x1e1608,
      wall: 0x2e2220, wallEdge: 0x503e38, wallShadow: 0x070403, outer: 0x030202,
      ambientTint: 0x2e1a06, ambientTintAlpha: 0.14, vignetteAlpha: 0.60,
    },
    noise: { dampProb: 0.10 },
    decor: { density: 0.50, weights: { goldPile: 3, dragonScale: 2, scorch: 2, bones: 2, ember: 2, crack: 1, brickPatch: 1 } },
    cornerWeb: { probability: 0.04, color: 0x9a7a5a, alpha: 0.20 },
    particles: { mode: 'rise', count: 28, color: 0xffc058, alpha: { min: 0.28, max: 0.75 }, size: { min: 1, max: 2.2 }, speed: { min: 12, max: 30 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x2a1002, alpha: 0.95 }, { r: 0.40, color: 0x4a2004, alpha: 1 },
        { r: 0.30, color: 0x7a3208, alpha: 1 }, { r: 0.18, color: 0xc06818, alpha: 1 },
        { r: 0.10, color: 0xffe8a0, alpha: 1 },
      ],
      rimHighlight: { color: 0xffc060, alpha: 0.82 },
      rubbleColor: 0x3a2410, rubbleCount: 11,
      innerGlow: { color: 0xffeab0, alpha: 0.72 },
    },
    wallArt: { basePattern: 'obsidian', motifDensity: 0.22, motifWeights: { goldInlay: 3, scorchMark: 2, wallCrack: 1 } },
  },
  { // Behemoth Ruin — giant-scale hall
    name: 'Behemoth Ruin',
    palette: {
      floorBase: 0x141418, floorAlt: 0x1a1a1e, floorDamp: 0x181c1a,
      wall: 0x302e32, wallEdge: 0x504e54, wallShadow: 0x09080a, outer: 0x040405,
      ambientTint: 0x0a1416, ambientTintAlpha: 0.12, vignetteAlpha: 0.62,
    },
    noise: { dampProb: 0.10 },
    decor: { density: 0.48, weights: { bigBone: 3, brokenPillar: 2, crushedRock: 2, moss: 2, crack: 1, skull: 1, bones: 1 } },
    cornerWeb: { probability: 0.14, color: 0xbab0a0, alpha: 0.30 },
    particles: { mode: 'drift', count: 24, color: 0x6a7a82, alpha: { min: 0.15, max: 0.42 }, size: { min: 1.2, max: 2.4 }, speed: { min: 5, max: 14 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x0a0c10, alpha: 0.95 }, { r: 0.40, color: 0x05070a, alpha: 1 },
        { r: 0.30, color: 0x020305, alpha: 1 }, { r: 0.18, color: 0x010102, alpha: 1 },
      ],
      rimHighlight: { color: 0x88a0b0, alpha: 0.65 },
      rubbleColor: 0x2a2e32, rubbleCount: 12,
      innerGlow: { color: 0x3a4c5c, alpha: 0.48 },
    },
    wallArt: { basePattern: 'bricks', motifDensity: 0.16, motifWeights: { wallCrack: 2, mossStreak: 2, skull: 1, chain: 1, niche: 1 } },
  },
  { // Rotting Marsh — fleshy bog
    name: 'Rotting Marsh',
    palette: {
      floorBase: 0x1f1a10, floorAlt: 0x241d12, floorDamp: 0x202008,
      wall: 0x34291c, wallEdge: 0x56452c, wallShadow: 0x0c0805, outer: 0x050302,
      ambientTint: 0x1e1802, ambientTintAlpha: 0.14, vignetteAlpha: 0.66,
    },
    noise: { dampProb: 0.20 },
    decor: { density: 0.55, weights: { mud: 3, puddle: 2, gore: 2, maggot: 1, wormTrail: 2, bile: 2, moss: 1, bones: 1 } },
    cornerWeb: { probability: 0.10, color: 0x8a7a5a, alpha: 0.28 },
    particles: { mode: 'erratic', count: 18, color: 0x1a0806, alpha: { min: 0.30, max: 0.70 }, size: { min: 1.2, max: 2 }, speed: { min: 28, max: 54 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x140a02, alpha: 0.95 }, { r: 0.40, color: 0x0a0502, alpha: 1 },
        { r: 0.30, color: 0x050302, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0x5a4820, alpha: 0.60 },
      rubbleColor: 0x2a1e10, rubbleCount: 10,
      innerGlow: { color: 0x4a3a08, alpha: 0.50 },
    },
    wallArt: { basePattern: 'flesh', motifDensity: 0.22, motifWeights: { wallVeinRed: 3, bloodSplatter: 2, mossStreak: 1 } },
  },
  { // Sandstone Temple — lizard ruins
    name: 'Sandstone Temple',
    palette: {
      floorBase: 0x2a2210, floorAlt: 0x332a15, floorDamp: 0x302a12,
      wall: 0x5c4a28, wallEdge: 0x8c7438, wallShadow: 0x1e1608, outer: 0x0a0804,
      ambientTint: 0x3a2a0c, ambientTintAlpha: 0.10, vignetteAlpha: 0.50,
    },
    noise: { dampProb: 0.06 },
    decor: { density: 0.46, weights: { sand: 3, hieroglyph: 2, scaleShed: 3, crack: 2, bones: 1, brickPatch: 2 } },
    cornerWeb: { probability: 0.04, color: 0xc8b888, alpha: 0.20 },
    particles: { mode: 'drift', count: 24, color: 0xd8b858, alpha: { min: 0.18, max: 0.42 }, size: { min: 1, max: 2.2 }, speed: { min: 10, max: 20 } },
    pit: {
      rings: [
        { r: 0.48, color: 0x120c05, alpha: 0.95 }, { r: 0.40, color: 0x0a0703, alpha: 1 },
        { r: 0.30, color: 0x060402, alpha: 1 }, { r: 0.18, color: 0x020101, alpha: 1 },
      ],
      rimHighlight: { color: 0xbc9c4e, alpha: 0.72 },
      rubbleColor: 0x4a3a1a, rubbleCount: 9,
      innerGlow: { color: 0x6e4e0a, alpha: 0.50 },
    },
    wallArt: { basePattern: 'sandstone', motifDensity: 0.22, motifWeights: { hieroglyphWall: 4, wallCrack: 2, runeGlow: 1 } },
  },
];

function prngFrom(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterChannel(v, delta) {
  return Math.max(0, Math.min(255, v + delta));
}

function jitterColor(rng, hex, amount) {
  const r = jitterChannel((hex >> 16) & 0xff, Math.floor((rng() - 0.5) * amount * 2));
  const g = jitterChannel((hex >> 8) & 0xff, Math.floor((rng() - 0.5) * amount * 2));
  const b = jitterChannel(hex & 0xff, Math.floor((rng() - 0.5) * amount * 2));
  return (r << 16) | (g << 8) | b;
}

function clampRange(v, min, max) { return Math.max(min, Math.min(max, v)); }

function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepClone);
  const out = {};
  for (const k of Object.keys(obj)) out[k] = deepClone(obj[k]);
  return out;
}

/**
 * Deterministically generate a theme for an arbitrary-depth floor.
 * Same (level, runSeed) pair always produces the same theme so re-entering
 * a tile / reloading doesn't reshuffle visuals mid-run. Between runs the
 * runSeed changes, so the dungeon looks different every playthrough.
 */
export function generateRandomTheme(level, runSeed) {
  const rng = prngFrom((Number(level) * 7919 + (Number(runSeed) || 0) * 2654435761) >>> 0);
  const arch = ARCHETYPES[Math.floor(rng() * ARCHETYPES.length)];
  const theme = deepClone(arch);

  // Jitter palette colors a touch for variety between floors of the same archetype.
  for (const key of ['floorBase', 'floorAlt', 'floorDamp', 'wall', 'wallEdge', 'wallShadow', 'outer', 'ambientTint']) {
    if (theme.palette[key] != null) theme.palette[key] = jitterColor(rng, theme.palette[key], 10);
  }
  theme.palette.ambientTintAlpha = clampRange(theme.palette.ambientTintAlpha + (rng() - 0.5) * 0.06, 0.04, 0.22);
  theme.palette.vignetteAlpha = clampRange(theme.palette.vignetteAlpha + (rng() - 0.5) * 0.08, 0.42, 0.78);

  // Decor density drift + small per-kind weight shuffle.
  theme.decor.density = clampRange(theme.decor.density + (rng() - 0.5) * 0.12, 0.32, 0.64);
  for (const k of Object.keys(theme.decor.weights)) {
    theme.decor.weights[k] = Math.max(1, Math.round(theme.decor.weights[k] * (0.7 + rng() * 0.8)));
  }

  // Particle count drift (keeps the same mode/colors for coherence).
  if (theme.particles) {
    theme.particles.count = clampRange(Math.round(theme.particles.count + (rng() - 0.5) * 12), 14, 44);
  }

  // Web probability drift.
  if (theme.cornerWeb) {
    theme.cornerWeb.probability = clampRange(theme.cornerWeb.probability + (rng() - 0.5) * 0.10, 0.02, 0.75);
  }

  // Wall-art motif density drift.
  if (theme.wallArt) {
    theme.wallArt.motifDensity = clampRange(theme.wallArt.motifDensity + (rng() - 0.5) * 0.08, 0.08, 0.35);
  }

  theme.name = `${arch.name} · depth ${level}`;
  return theme;
}

export function getFloorTheme(level, runSeed = 0) {
  const n = Number(level);
  if (FLOOR_THEMES[n]) return FLOOR_THEMES[n];
  return generateRandomTheme(n, runSeed);
}

export { ARCHETYPES, DEFAULT_THEME };
