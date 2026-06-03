# Dev log

Technical decisions + notable changes, newest first. Player-facing notes live in
[`game/js/data/changelog.js`](../game/js/data/changelog.js); this is the *why* for
future-me. Keep entries short; link code/docs.

Versions are in [`game/js/data/version.js`](../game/js/data/version.js); each
release also bumps `CACHE` in [`game/sw.js`](../game/sw.js).

---

## 2026-06-03 — back to 2D, perf overhaul, spell VFX

### Direction: abandoned the 3D experiment
A ~240-commit experiment to make a "3D-like" version (`game/js/engine3d/`, Three.js)
was abandoned. `main` was reset to the last pure-2D commit (`0582a689`, the parent
of the 3D scaffold `292ceac2`) and force-pushed. The original 2D Phaser game is the
product going forward. The 3D commits are still reachable by SHA in git history
(tip `f7013c63`) if we ever want to mine them — that's how the spell-VFX look was
recovered. The user keeps a full local backup too.

### Performance overhaul (v1.3.1 → v1.3.4)
Players reported lag that worsened on deeper floors. It was **not** accumulation
(reproduced via god-mode teleport) — it was per-floor render cost. See the full
method + fixes in [`perf-playbook.md`](perf-playbook.md). Shipped:
- **Flow-field pathfinding** — one shared BFS from the player per turn instead of
  one BFS per creature. `CreatureMovement.js`. (v1.3.2)
- **Particle-leak fix** — erratic-mode ambient particles recursed forever via
  `onComplete`; tracked + killed on floor rebuild. `floorAtmosphere.js`. (v1.3.1)
- **Ability back-off** — creatures stopped re-evaluating blocked abilities every
  90 ms tick; memoised template/pattern lookups. (v1.3.3)
- **Bake static decor to a texture** — THE big one. Wall-accent/decoration
  `Graphics` were re-tessellated every frame (floor 12 → 9 fps). `bakeStaticDecor()`.
- **Viewport-only darkness fill** + **off-screen creature culling**. (v1.3.3)
- Added `window.debugPerf` (stats/profile + per-system toggles) — the tool that
  found the decor culprit. Kept in prod; harmless.

### Per-floor state persistence (carried in, deployed v1.3.2)
Saves now snapshot every visited floor (map + creatures + ground loot) so resume
restores the exact dungeon. Raised the save snapshot caps in `api/saves` **and**
`scripts/dev-server.js` (the dev server was left at the old 200KB/depth-8 and threw
"Snapshot too deep" locally — prod was fine). Also fixed: the **descent pit** only
appeared on a direct killing blow, so resuming a cleared floor (or clearing the
last enemy with a spell/DoT) left it hidden — now revealed on restore + synced in
the 1 s timer. (v1.3.4)

### Spell VFX — the "modern magic" look (v1.3.5 → v1.3.6)
Ported the abandoned 3D engine's spell visuals to 2D with no new deps (Phaser
particles + ADD blend + built-in Bloom postFX). Full system in
[`spell-vfx.md`](spell-vfx.md). Element-coloured additive bursts, glowing beams,
and **cohesive area blasts** (flash + ground field + anti-grid jittered cloud,
no per-tile diamonds) for waves/novas. Selective bloom on a dedicated VFX layer so
only magic glows. (v1.3.5) Then applied the same to **monster abilities** routed by
`element` + shape, at reduced density + no shake. (v1.3.6)

Tuning lesson: additive + bloom blows out to white fast — the 3D `UnrealBloomPass`
was subtle (strength ~0.35) because it had a luminance **threshold**; our
layer-bloom reproduces the threshold by construction (only the VFX layer blooms).

---

## Conventions reaffirmed / added this session
- VFX always imports from `rendering/Renderer.js` (now also re-exports the
  SpellParticles fns). Never import `vfx.js` or `SpellParticles.js` directly.
- **Never leave a large static `Graphics` live** — bake to a `RenderTexture`.
- Deploy reality: two Vercel projects exist; the live domain
  `www.tibia-dungeons.com` is the **`tibia_dungeons-main`** project. `git push`
  needs a manually-supplied PAT (no `gh`/credential helper). See `CLAUDE.md`.
