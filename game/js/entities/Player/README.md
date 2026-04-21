# `entities/Player/` — *placeholder*

No files yet. Exists so the future `Player` module lands here predictably.

## Today

All player state and behaviour lives inside the engine `startGame()` closure in [`../../engine/game.engine.js`](../../engine/game.engine.js) — the biggest single-function thing in the codebase. Closure variables include:

- Position: `gridX`, `gridY`, `playerFacingFrame`
- Vitals: `playerHp`, `playerMaxHp`, `playerMana`, `playerMaxMana`, `hungerSecondsLeft`
- Progression: `playerLevel`, `playerXp`, `playerMagicLevel`, `playerFistLevel`, `playerShieldingLevel`
- Learned spells: `learnedSpellIds`, `learnedSpellOrder`, `spellCooldownUntil`, `spellCdDurations`
- Timing: `nextPlayerActionAt`, `playerMoveDurationMs`, `playerActionDelayMs`, `nextMagicWeaponShotAt`
- Flags: `gameOver`, `playerDead`, `godModeEnabled`, `moving`, `isHungry`
- Per-run: `runKills`, `runStartBias`, `runSpreadBias`, `runVariantBias`

Vocation (`knight` / `paladin` / `sorcerer` / `druid`) and sex come in via `configPlayer`.

## What lands here eventually

Refactor Phase 4 will break the closure and land a proper `Player.js` here that owns the above state with:

- Constructor taking `{ sex, classKey }` + starting inventory
- `step(dir)` for movement
- `takeDamage(amount, source)` / `heal(amount)` / `gainXp(amount)`
- `learnSpell(articleId)` / `canCast(articleId)` / `consumeMana(amount)`
- `save()` / `restore(snapshot)` for persistence

Plus a `Player.types.js` with JSDoc typedefs for the shapes that cross module boundaries.

## For now

Search the engine for the variable name. The engine README ([`../../engine/README.md`](../../engine/README.md)) has a cheat sheet of "where to look for X" that covers most common player-related concerns.
