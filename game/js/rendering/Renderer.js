// Renderer — thin facade over vfx.js. Phase 4 of the architectural refactor:
// gives the engine a single import path for camera shakes, flashes, sparks
// and spell visuals. When future post-FX / lighting / particle systems
// land, they wrap or replace these here without the engine changing.
//
// At the moment this is a pass-through. The contract (function names,
// signatures) is stable; callers should always import from Renderer.js,
// not from vfx.js directly.

export {
  shakeCamera,
  flashCamera,
  radialSparkBurst,
  shockwaveRing,
  floatingCombatText,
  tileSpellBurst,
  spellAuraBurst,
  spellProjectileLine,
  rangedProjectileLine,
  missEffect,
  critBanner,
} from '../vfx.js';

// Phaser-native particle / bloom spell VFX (the 2D port of the 3D look).
export {
  initSpellFx,
  setSpellBloom,
  spellElementKey,
  abilityElementKey,
  elementKeyFromColor,
  spawnSpellBurst,
  spawnSpellBeam,
  spawnSpellArea,
} from './SpellParticles.js';
