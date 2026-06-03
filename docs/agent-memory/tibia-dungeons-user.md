---
name: tibia-dungeons-user
description: How the Tibia Dungeons owner works with me and how to collaborate effectively
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6efe8896-2810-41e0-b355-e288ac6b98a4
---

On Tibia Dungeons ([[tibia-dungeons-project]]) the user (raulmaiz, communicates in **Spanish**) treats me as the **primary/sole developer** — "lo vamos a evolucionar tú y yo, básicamente tú." He asked me to own the codebase: organise it, create my own docs/memory, keep them updated.

**Why:** it's a long-term, mostly-Claude-driven project; continuity across sessions depends on me maintaining the docs + memory, not him.

**How to apply:**
- Keep `docs/` and these memories current as the project evolves (esp. `dev-log.md`, `spell-vfx.md`, `perf-playbook.md`). Document proactively without being asked.
- **Diagnose with evidence, don't guess.** He valued the lag hunt where I measured (`window.debugPerf`) and added instrumentation instead of speculating. When unsure of a visual/perf cause, build a quick toggle/profiler and have him test.
- **Iterate visually in small steps.** For look-and-feel he gives screenshots + "más/menos" feedback ("más tralla", "se pasó", "quita el círculo"). Make one measured change, ship to local, ask. Expect several rounds.
- **Deploy when he says "despliega"**: bump version + changelog + SW cache, build, commit, push (needs the PAT), `vercel --prod`. He trusts me with force-push/deploy on his say-so. Reply in Spanish. See [[tibia-dungeons-vercel-deploy]].
- Respond in Spanish.
