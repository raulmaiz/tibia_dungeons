# `systems/` — reusable behaviour modules

Stateful subsystems that aren't tied to a single entity. Each subfolder owns its private state and exports a clear interface.

## Subfolders

- [`lighting/`](lighting/) — equipped-light state, burn schedule, slot-icon resolution, atmosphere bridge.

## Pattern

Each system follows the same shape:

```
systems/<name>/
  README.md             ← what the system owns + how to use it
  <Name>.js             ← the main module (PascalCase)
  <helper>.js           ← optional supporting modules
```

The system module typically:

1. Holds private state at module scope (with `let` + private `_currentX` naming).
2. Exports pure helpers (no side effects) and stateful operations (mutate the private state).
3. If it needs to bridge into Phaser, exposes an `attach<Sink>(fn)` setter that the engine wires once during scene `create()`.

## What does NOT belong here

- One-shot helpers used by a single caller → put them next to the caller.
- Pure data tables (no logic) → [`../data/`](../data/).
- Anything that's really UI → [`../ui/`](../ui/).

## Future systems to land here

When the visual work ships, expect:

- `systems/particles/` — particle pools listening to EventBus events.
- `systems/postfx/` — bloom, vignette, color-grading pipelines.
- `systems/daynight/` — global tint schedule across floors.
- `systems/audio/` — ambient + combat-driven sound effects.

Each should follow the lighting/ shape.
