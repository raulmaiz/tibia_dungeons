# How to add a spell

Spells live in two places: the static catalog (stats + price + cooldown) and the per-spell VFX recipe (shape + timing of the visual effect).

## 1. Verify (or add) the catalog entry

Spells come from [`game/data/spell.json`](../game/data/spell.json) (joined at boot with [`game/data/spell_price.json`](../game/data/spell_price.json) for shop prices). Each entry minimally:

```json
{
  "article_id": 1234,
  "title": "Fire Wave",
  "vocation": "sorcerer,druid",
  "magic_level": 8,
  "mana": 25,
  "cooldown": 4,
  "premium": false,
  "image": "spell/Fire Wave.gif"
}
```

If the spell already exists in the tibiawiki dump (most do), skip ahead. Otherwise append a new entry with a fresh `article_id` and put a sprite at `game/data/images/spell/<Title>.gif`.

## 2. Add the FX recipe

Open [`game/js/entities/Spell/fxOverrides.js`](../game/js/entities/Spell/fxOverrides.js). Each entry is keyed by `spell.title.toLowerCase()` and describes the *shape* (beam, cone, nova, …) and *timing* (per-tile delay, total duration). Pick the right `kind` from existing entries:

| `kind` | Shape | Notes |
|---|---|---|
| `beam` | Line of tiles in facing direction | `depth` = how many tiles forward |
| `cone` | Triangular wedge in facing direction | `depth` = forward reach (width auto-derived) |
| `nova` | Filled circle around caster | `radius` in tiles |
| `ring` | Hollow ring around caster | `radius` in tiles |
| `plus` | Cross-shaped (rune-style) | `reach` |
| `front_box` | Rectangle in front of caster | `width` × `depth` |
| `front_sweep` | Arc in front of caster | typical `duration` ~320 |
| `projectile` | Single missile to target | `depth` = max travel |

Example:

```js
'my new spell': {
  kind: 'cone',
  depth: 3,
  fx: { duration: 260, delayStep: 30, order: 'beam' }
},
```

`fx.order: 'beam'` makes the per-tile flashes propagate outward instead of all at once. `glyph: '✦'` adds an ASCII overlay glyph. `color: 0x9d7dd9` overrides the default tint.

If you don't add an override, the runtime falls back to inferred patterns from [`game/js/entities/Creature/abilityPatterns.js`](../game/js/entities/Creature/abilityPatterns.js), which usually picks something reasonable but not always pretty.

## 3. (Optional) Set the shop price

Open [`game/data/spell_price.json`](../game/data/spell_price.json) and add `"<article_id>": <gold>`. Without an entry, the spell is unlearnable in-game.

## 4. (Optional) Add to a vocation's auto-pool

The Spells Shop only shows spells matching the player's `vocation` field. If you want a knight-only spell, set `"vocation": "knight"` in the catalog entry.

## 5. (Optional) Conjure-ammo spells

Spells that summon arrows/bolts (e.g. *Conjure Arrow*) need an entry in `CONJURE_AMMO_MAP` near the top of [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js):

```js
[<spellArticleId>, { itemId: <ammoItemId>, title: 'Arrow', count: 10 }],
```

The `loadEngineData()` boot step pre-fetches the ammo template so it can be added to the bag without a server round-trip.

## 6. Verify

```bash
node scripts/build.js
```

In the browser, buy the spell at the Spells Shop and hotkey it. Cast and confirm the FX shape matches the recipe.

## Where the spell-cast actually happens

`castLearnedSpell(slotNumber, now)` inside `startGame()` in [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js). Search for `bus.emit(EVENTS.SPELL_CAST` to find the emission point.
