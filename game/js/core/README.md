# `core/` — cross-cutting infrastructure

Tiny, dependency-free modules used by everything. If something belongs here, it must:

1. Have no game-domain knowledge (no creatures, items, spells, vocations).
2. Be safe to import from any other module without circular dependency risk.
3. Be small (≤100 lines).

## Files

- [`EventBus.js`](EventBus.js) — pub/sub. Exports `bus` (singleton) + `EVENTS` (frozen catalog). Use for any cross-module gameplay signal: `coins:changed`, `entity:died`, `spell:cast`, `loot:dropped`, `floor:descended`. Future systems (particles, ambient audio, kill feed) plug in via `bus.on()` without coupling.

## Patterns

- **Always emit through `EVENTS.<NAME>`**, never raw strings — typo protection.
- **Listener errors are caught** and console-logged so a buggy subscriber can't break the engine.
- **`bus.on(event, fn)` returns a disposer.** Use it on scene teardown if you ever start tearing scenes down (we don't today — same scene survives across floors).
- **Exposed on `window.tdEvents`** for in-browser debugging.

## What does NOT belong here

- Anything game-specific. EventBus emits `entity:died` because *the bus* doesn't know what an entity is — it's just a string key. The catalog of valid keys lives at the bottom of `EventBus.js`, but the implementation stays domain-agnostic.
