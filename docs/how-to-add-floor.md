# How to add a floor

A "floor" is one dungeon level. It has: a number, a creature pool, a creature count, a label/theme, and a visual palette + decoration set.

## 1. Pick the floor number

Floors are 1-indexed and unbounded — the game keeps generating procedurally as long as you keep descending. Existing handcrafted floors run 1–20 (search [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js) for the highest entry). To add floor 21 you literally just add the entries below; the engine doesn't need to know it exists.

## 2. Define the creature pool

Edit [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js):

```js
// Pool — choose ONE of these three patterns:
export const FORCED_CREATURE_TEMPLATES_BY_LEVEL = {
  // …
  21: [
    { id: 99001, title: 'Beast A', /* full template */ },
    { id: 99002, title: 'Beast B', /* full template */ },
  ],
};

// Counts — REQUIRED. Tells the engine how many to spawn.
export const FLOOR_CREATURE_COUNTS = {
  // …
  21: { 99001: 8, 99002: 4 },   // 8 beasts A + 4 beasts B = 12 enemies on floor 21
};

// Display label — what the combat log says on entry.
export const FLOOR_DISPLAY_LABEL = {
  // …
  21: 'Cursed Catacombs',
};
```

If you only want to lock a creature id without overriding stats, use `FORCED_CREATURE_ID_BY_LEVEL` / `FORCED_CREATURE_IDS_BY_LEVEL` (no full template needed). See [`docs/how-to-add-creature.md`](how-to-add-creature.md) for details on adding new creatures.

## 3. Add a visual theme

Edit [`game/js/data/floorThemes.js`](../game/js/data/floorThemes.js). Each theme drives [`game/js/engine/floorAtmosphere.js`](../game/js/engine/floorAtmosphere.js): tile palette, wall accents, decorations, particles, vignette, pit (stairs) styling.

```js
export const FLOOR_THEMES = {
  // …
  21: {
    name: 'Cursed Catacombs',
    palette: {
      floorBase: 0x2a1a2e, floorAlt: 0x331a36, floorDamp: 0x1f1024,
      wall: 0x4a2a55, wallEdge: 0x6a3a78, wallShadow: 0x150818, outer: 0x080308,
      ambientTint: 0x1a081f, ambientTintAlpha: 0.12, vignetteAlpha: 0.65,
    },
    noise: { dampProb: 0.03 },
    decor: { density: 0.04, weights: { skull: 3, bone: 2 } },
    cornerWeb: { probability: 0.15, color: 0xc0a0d0, alpha: 0.4 },
    particles: { color: 0x9966cc, count: 40, alpha: 0.5 },
    pit: {
      rings: [/* … darker rings give a deeper-looking pit */],
      rimHighlight: { color: 0x6a3a78, alpha: 0.55 },
      rubbleColor: 0x2a1430,
      rubbleCount: 6,
      innerGlow: { color: 0x40104a, alpha: 0.4 },
    },
    wallArt: { basePattern: 'bricks', motifDensity: 0.12, motifWeights: { wallCrack: 2, glyph: 1 } },
  },
};
```

The `DEFAULT_THEME` at the top of the file is the fallback for any floor without an entry. Copying and modifying an existing nearby theme is the fastest path. Decoration `weights` and motif keys must match what `floorAtmosphere.js` knows how to draw — see the `drawDecoration` / `drawWallMotif` switches there for the supported names.

## 4. (Optional) Floor-specific tuning

- **Map size:** auto-derived from creature count by `computeDungeonSize()` in [`game/js/dungeon/generator.js`](../game/js/dungeon/generator.js). More creatures → bigger floor.
- **Spawn whitelist for early levels:** `EARLY_LEVELS = 12` at the top of `floorSpawnConfig.js` controls how aggressively the spawn picker biases toward the forced lists.

## 5. Verify

```bash
node scripts/build.js
```

Play to the new floor (god mode in the engine — search `godModeEnabled` — can speed this up). Confirm:
- The combat log says `Floor 21: <Cursed Catacombs> (base dmg ?).`
- The expected creatures spawn in the expected counts (`#sbCreatures` strip says e.g. `Beasts 8/8`).
- The visual theme renders correctly (palette, vignette, decorations).
- Stairs unlock only after every creature is dead.
