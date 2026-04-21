# `config/` — magic numbers

Single source of truth for every tunable value. If you find a hardcoded number anywhere else in the codebase that's relevant (tile size, color, timing, threshold, item id sentinel), it's a regression — move it here.

## Files

- [`game.config.js`](game.config.js) — gameplay constants: tile/dungeon dimensions, coin economy, creature spawn ranges, player base stats, action throttling clamps, hunger cap, starter inventory ids.
- [`visual.config.js`](visual.config.js) — visual constants: HUD pixel reservations, sprite fill ratio, light source radii / durations / burn thresholds, scene background color, light-item id sentinels.

## Naming convention

`SCREAMING_SNAKE_CASE` for every export. The convention is enforced by everyone reading these files first when they need a constant — if a `SOME_VALUE` doesn't appear here, it's not a config constant (it's run-state).

## What does NOT belong here

- Per-creature/spell/item data → [`../data/`](../data/) (e.g. `spellFxOverrides.js`, `creatureDamageModifiers.js`).
- Run-time mutable state (player HP, current floor, …) → engine closure or [`../runtime/playerSession.js`](../runtime/playerSession.js).
- DOM ids / selectors → either inline in the consumer or in a future `ui/selectors.js`.
