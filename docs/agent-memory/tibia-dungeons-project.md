---
name: tibia-dungeons-project
description: "What the Tibia Dungeons project is, its current state, and where its docs live"
metadata: 
  node_type: memory
  type: project
  originSessionId: 6efe8896-2810-41e0-b355-e288ac6b98a4
---

Tibia Dungeons (repo: `~/projects/tibia_dungeons`, live: **www.tibia-dungeons.com**, ~23 real players) is a published, single-page **2D Phaser 3** roguelite dungeon crawler. Vanilla JS, deployed to Vercel from `game/`. I (Claude) am effectively the sole/primary developer going forward — the user wants me to own the codebase, organise it, and document proactively. See [[tibia-dungeons-user]].

State as of 2026-06-03:
- A ~240-commit "3D-like" experiment (`engine3d/`, Three.js) was **abandoned**; `main` was reset to the last pure-2D commit (`0582a689`) and force-pushed. The 3D look for spells was later ported back to 2D natively. 3D commits are still reachable by SHA (tip `f7013c63`) if needed.
- Recent work: a performance overhaul (lag fixes, v1.3.1–1.3.4), per-floor save persistence, and a full spell-VFX system for player + monsters (v1.3.5–1.3.6).

**Read the in-repo docs first — they are the source of truth and I keep them updated:**
- `CLAUDE.md` — entry point (conventions, foot-guns, deploy reality, Tasks→docs).
- `docs/dev-log.md` — decisions + history (the *why*).
- `docs/spell-vfx.md` — the spell visual-effects system → [[tibia-dungeons-spell-vfx]].
- `docs/perf-playbook.md` — frame-rate diagnosis + `window.debugPerf` → [[tibia-dungeons-perf]].
- `docs/how-to-*.md` — add creature / spell / floor; debug.

Deploy + git/Vercel specifics: [[tibia-dungeons-vercel-deploy]].
