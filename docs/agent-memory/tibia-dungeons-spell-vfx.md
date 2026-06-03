---
name: tibia-dungeons-spell-vfx
description: The Tibia Dungeons spell visual-effects system — where it is and how to tune it
metadata: 
  node_type: memory
  type: project
  originSessionId: 6efe8896-2810-41e0-b355-e288ac6b98a4
---

Spell "magic" VFX (added 2026-06-03) — a 2D-Phaser port of the abandoned 3D look, **no Three.js**. Built on Phaser's own particle emitter + ADD blend + built-in Bloom postFX.

- **All of it lives in `game/js/rendering/SpellParticles.js`**, re-exported through `rendering/Renderer.js` (the canonical VFX import seam — never import SpellParticles or vfx.js directly).
- Player spells hook in via `engine/systems/SpellVisuals.js`; monster abilities via `engine/systems/CreatureAbilities.js` (`showCreatureAbilityEffect`).
- Routing: **element → colour** (`spellElementKey` / `abilityElementKey` from `element` field + name keywords), **shape → effect** (single burst / beam / cohesive area blast, from tile footprint + `inferCreatureAbilityPattern`).
- Area spells (waves/novas/fireballs) render as ONE cohesive blast (flash + ground field + anti-grid jittered particle cloud), **no flat per-tile diamonds**.
- Bloom is applied to a dedicated **VFX Layer**, not the camera → only magic glows, dungeon stays crisp (reproduces the 3D `UnrealBloomPass` luminance threshold).
- Monsters cast far more than the player → `MONSTER_FX = { density: 0.55, shake: false }`.

**Tuning gotcha:** additive + bloom blows out to white fast. Keep bloom modest (`addBloom` strength ~1.0, NOT 2.0) and field-decal alpha low (~0.22). The big dials, in order: bloom strength → particle scale/alpha → density (per-kind boost; cone ×2.8, nova ×1.25) → lifespan.

Full reference: `docs/spell-vfx.md`. Performance budget: [[tibia-dungeons-perf]]. Project overview: [[tibia-dungeons-project]].
