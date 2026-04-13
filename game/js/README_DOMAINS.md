# Domain Ownership Guide (Phase 1)

This project keeps `main.js` as runtime orchestrator while moving stable logic into domain modules.

## Domains

- `ui/*`: panel/menu positioning and DOM interaction glue.
- `dungeon/*`: map/floor generation and spawn-path helpers.
- `mechanics/*`: progression, combat math, loot rolls/economy helpers.
- `spells/*`: spell filters/catalog helpers and casting support utilities.
- `creatures/*`: ability pattern inference and creature-specific rules.
- `data/*`: runtime configuration extracted from hardcoded tuning blocks.

## Merge-Conflict Rules

- Avoid editing `main.js` for pure utility changes; prefer domain files.
- Keep data-driven tuning in `js/data/*` (example: `floorSpawnConfig.js`).
- UI-only movement/layout changes go to `js/ui/*`.
- Gameplay math changes go to `js/mechanics/*`.

## Smoke Regression Checklist

1. Start game and create character.
2. Move across multiple floors (stairs up/down logic).
3. Verify loot drops and stack counts.
4. Cast/buy/learn spells and verify cooldown/mana.
5. Confirm creature ability patterns still hit expected tiles.
6. Verify panel layout sync after window resize/toggle.
