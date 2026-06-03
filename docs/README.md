# Docs

Documentation for Claude Code (and humans) working on Tibia Dungeons.

The entry point is always [`/CLAUDE.md`](../CLAUDE.md). Start there. The files below are referenced from it.

## Onboarding

- [`architecture.md`](architecture.md) — layer map, plug-in seams for the upcoming visual work, what each module owns and why.
- [`dev-log.md`](dev-log.md) — technical decisions + notable changes over time (the *why* behind the code; read this for context).
- [`glossary.md`](glossary.md) — Tibia jargon and project-specific terms.
- [`gameplay-notes.md`](gameplay-notes.md) — empirical observations from playtests (combat formulas, balance quirks, bot signals).

## Systems

- [`spell-vfx.md`](spell-vfx.md) — the spell visual-effects system (particles, beams, cohesive area blasts, bloom) for player + monster abilities.
- [`perf-playbook.md`](perf-playbook.md) — how to diagnose + fix frame-rate problems, the `window.debugPerf` console, and the known render costs.

## How-to recipes

Concrete, step-by-step guides for the recurring tasks. Read these instead of grepping.

- [`how-to-add-creature.md`](how-to-add-creature.md) — adding a new monster: catalog, sprite, spawn config, drops, tuning.
- [`how-to-add-spell.md`](how-to-add-spell.md) — catalog entry + FX recipe + price + vocation pool.
- [`how-to-add-floor.md`](how-to-add-floor.md) — creature pool + count + theme + visuals.
- [`how-to-debug.md`](how-to-debug.md) — common errors, console tools, repro recipes.

## What's NOT in here

- Gameplay rules from a player's perspective → see the in-game tutorial / itch.io page.
- API contracts for the Vercel functions → read `api/` directly; they're small and self-documenting.
- Asset pipeline (sprite generation, store covers) → `scripts/` has standalone helpers (`scripts/gen-covers.js`, `scripts/record-gameplay.js`).
