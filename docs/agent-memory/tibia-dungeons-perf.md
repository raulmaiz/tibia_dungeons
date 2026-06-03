---
name: tibia-dungeons-perf
description: Tibia Dungeons render-perf findings + the window.debugPerf console tooling
metadata: 
  node_type: memory
  type: project
  originSessionId: 6efe8896-2810-41e0-b355-e288ac6b98a4
---

Dense-floor lag in tibia_dungeons (Phaser 3) is RENDER-bound, not AI. Findings from the 2026-06-03 session:

- **Biggest cost: wall decoration Graphics.** `rebuildWallAccents`/`rebuildDecorations` in [floorAtmosphere.js](~/projects/tibia_dungeons/game/js/engine/floorAtmosphere.js) draw thousands of fillRects across the whole map into a Phaser `Graphics`, which re-tessellates its full command list EVERY frame. Floor 12 ran at ~9 fps. Fix: `bakeStaticDecor()` renders the static Graphics into a cached RenderTexture once per floor and hides the live Graphics. **General rule for this codebase: never leave a large static `Graphics` live — bake it to a texture.**
- Darkness overlay (`darknessRT`) is map-sized; now only refills the camera's visible world-rect per frame.
- Off-screen creatures (sprite + hp bar + name tag) are culled in `updateAllHealthBars`.
- Creature AI is cheap (~2ms/turn even with 50). Blocked abilities used to re-evaluate every 90ms tick because `nextAbilityAt` only advanced on success — now backs off (ABILITY_RETRY_MS). Per-creature BFS replaced by one shared flow field per turn (`CreatureMovement.js`).
- Spell VFX ([[tibia-dungeons-spell-vfx]]): particles are GPU-batched + cheap; the **bloom is the per-frame cost**. Monster casts run at reduced density (`MONSTER_FX.density = 0.55`, no shake) because they're frequent.

**`window.debugPerf`** (not admin-gated, harmless — only affects the local client): `stats()` → {fps, objects, tweens, alive, onScreen, summons}; `profile()` → avg/max creature-turn ms; toggles `cull/nametags/healthbars/env/darkness/particles/decor/bloom(false)`. Toggle a system off and watch `stats().fps` to isolate a cost — this is how the decor culprit was found.

**Full method + the gotchas list is now in the repo: `docs/perf-playbook.md`** (keep it updated). Deploy via [[tibia-dungeons-vercel-deploy]].
