# `entities/Spell/`

Everything about spells that isn't catalog data or inside the engine closure.

## Files

- [`filters.js`](filters.js) — `isBlockedSpellTitle(title)`. Returns `true` for spell titles that should never be cast (e.g. utility-only spells that don't belong in combat hotbar).
- [`fxOverrides.js`](fxOverrides.js) — `SPELL_FX_OVERRIDES` map. 75 per-spell VFX recipes keyed by `spell.title.toLowerCase()`. Each entry describes the shape (beam / cone / nova / …) and timing of the on-screen effect.

## Also about spells (but not here)

| Concern | Lives in | Why |
|---|---|---|
| Catalog (ML / mana / cooldown / vocation) | [`/game/data/spell.json`](../../../data/spell.json) | tibiawiki-sql export |
| Shop price per spell | [`/game/data/spell_price.json`](../../../data/spell_price.json) | tibiawiki-sql export |
| Fallback pattern inference | [`../Creature/abilityPatterns.js`](../Creature/abilityPatterns.js) | shared with creature-abilities |
| Cast resolution | engine `startGame()` closure (`castLearnedSpell`) | will extract with the closure break (refactor Phase 4) |
| Spell-cast event emission | engine `castLearnedSpell` → `bus.emit(EVENTS.SPELL_CAST, …)` | EventBus seam |
| Conjure-ammo mapping | `CONJURE_AMMO_MAP` at the top of engine's `startGame()` | engine-local until we have a full `Spell` module |

## Adding a new spell

See [`/docs/how-to-add-spell.md`](../../../../docs/how-to-add-spell.md). If you're just wiring a new entry you'll touch [`fxOverrides.js`](fxOverrides.js) here, plus the catalog JSON.

If the spell should be blocked from the combat hotbar (utility-only), add its lowercased title to [`filters.js`](filters.js).
