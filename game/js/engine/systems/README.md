# `engine/systems/` — Phase 4 extractions from the `startGame()` closure

The engine's `startGame()` was originally a ~7 700-line closure holding scene creation, combat, AI, save/load, UI panels and every supporting helper. Phase 4 peels cohesive slices off into this folder. **Current state:** `game.engine.js` is at ~5 500 lines after 14 modules landed. The hot-path (combat / AI / spell casting) is still in the engine because it's designed to mutate the closure; extracting it cleanly requires the Player / Creature / RunState classes that are the next phase.

## Rules for living in this folder

- **No circular imports.** These modules cannot import from `game.engine.js`.
- **Mutable engine state crosses the boundary via a `deps` object.** Use getters for `let` bindings (`() => playerLevel`) and pass shared containers by reference for mutation in place (Sets, Arrays, Maps).
- **Module-local state is fine for per-module caches and flags** (`_lastSpellBarKey`, `_pendingSpellSlot`, etc.). Expose a `consumeXxx()` / `invalidateXxx()` function when the engine needs to drain or reset them.
- **Setup shape:** each module exports `setupXxx(deps)` that stores deps and wires listeners, plus public functions that assume setup has run.

## Files

| File | Lines | Scope |
|---|---|---|
| [`SaveLoad.js`](SaveLoad.js) | 167 | `captureSaveSnapshot(ctx)` builds the JSON for `/api/saves`. `restoreWeaponSkills(map, snap)` + `restoreLearnedSpells(ids, order, snap)` rehydrate containers in place during the engine's resume flow. |
| [`Minimap.js`](Minimap.js) | 117 | Module-level canvas state. `initMinimap()` once at create. `drawMinimapBase({ map, dungeonW, … })` on floor change; `drawMinimapDynamic({ creatures, gridX, gridY })` on the 200ms tick. `willReadFrequently: true` so `getImageData` doesn't stall. |
| [`CombatLog.js`](CombatLog.js) | 45 | Exports `addCombatLog(msg, color)` + `LOG_COLORS`. Engine calls these directly (no deps bag); they resolve via module binding at every call site. |
| [`SpellTooltip.js`](SpellTooltip.js) | 186 | `bindSpellTooltip` / `bindSpellBarTooltip` / `hideSpellTooltip` / `setupSpellTooltipDismissers` + utility exports `esc`, `ttRow`, `hasRealHover` that ItemsShop/Market reuse. |
| [`FloatingEffects.js`](FloatingEffects.js) | 218 | Scene-bound splashes: `showEatEffect`, `showDrinkEffect`, `showFullFoodEffect`, `showLevelUpText`, `showSkillLevelUpText`. Each takes the scene + a small ctx (`{ player, tileSize, basePlayerScaleX, basePlayerScaleY, isActive }`). |
| [`Market.js`](Market.js) | 576 | Full `#marketOverlay` UI — tree / grid / detail / buy splash / banner / open+close / coins-changed refresh. Imports `bindItemShopTooltip` from ItemsShop. |
| [`ItemsShop.js`](ItemsShop.js) | 316 | Sidebar item search panel. Owns `itemsShopQuery` + cache key. Exports `bindItemShopTooltip` for Market.js to reuse so market cards use the same tooltip. |
| [`SpellShop.js`](SpellShop.js) | 212 | Sidebar spell-learning panel. Mutates `learnedSpellIds` / `learnedSpellOrder` on buy. `invalidateSpellShopCache()` called by learned-spells drag-reorder. |
| [`Dungeon.js`](Dungeon.js) | 89 | Pure `generateLevelMap()` — rooms + corridors, returns `{ map, stairs }`. |
| [`LearnedSpells.js`](LearnedSpells.js) | 215 | Hotbar-order panel. Drag & drop + up/down arrow reorder. Calls `onOrderChanged` (engine invalidates spell-bar cache) + `onSpellBarRefresh` / `onConsumableBarRefresh` / `onPanelsResync`. |
| [`SpellBar.js`](SpellBar.js) | 204 | Two bottom strips: spell hotbar (1-9, 0) + consumable bar (F/G/H). Owns `_pendingSpellSlot` / `_pendingConsumable`; engine's update tick drains them via `consumePendingSpellSlot()` / `consumePendingConsumable()`. Runs the 250ms spell-cooldown text ticker. |
| [`DeathSummary.js`](DeathSummary.js) | 386 | "You Died" overlay + Hall of Fame fetch. Engine provides `onPlayAgain` callback for `game.destroy()` teardown. |
| [`GroundLoot.js`](GroundLoot.js) | 158 | Tile-keyed `Map<tileKey, pile>`. `dropItemOnGround`, `pickupGroundLootAtPlayer`, `clearGroundLoot` (for descendLevel). Handles lazy texture loading with 📦 emoji placeholder. |

## Still inside `startGame()` — the unextracted core

Everything that remains mutates > 5 closure bindings per call. Trying to extract without the entity classes below would produce a module with a 20-getter deps object — uglier than leaving it in the engine.

- **Combat hot path** — `performPlayerAttack`, damage calc, crits, ammo, projectile visuals
- **Creature AI** — `creatureTurn`, `tryMove*`, pathfinding
- **Spell casting** — `castLearnedSpell` + pattern helpers (nova/cone/beam)
- **Creature spawn** — `pickGroupForLevel`, `spawnCreaturesForLevel`
- **Status effects** — burn/poison/electrified DoT + fire/poison fields
- **HUD refresh** — `updateHud`, `renderTopStatsPanel`
- **Scene + input** — Phaser scene lifecycle, keyboard handling, `update()` loop

## Planned next (Phase 4 endgame)

- `../../entities/Player/Player.js` — owns `hp`, `maxHp`, `mana`, `maxMana`, `level`, `xp`, `magicLevel`, `fistLevel`, `shieldingLevel`, `weaponSkills` Map, `hungerSecondsLeft`, `runKills`. Methods: `takeDamage(n)`, `heal(n)`, `gainXp(n)`, `save()`, `restore(snap)`.
- `../../entities/Creature/Creature.js` — runtime instance: `gx`, `gy`, `hp`, `sprite`, `alive`, abilities, element mods.
- `../RunState.js` — floor, creatures[], allies[], groundLoot bridge, lifecycle wrapper.

Once those exist, Combat / CreatureAI / SpellCasting / CreatureSpawn / StatusEffects extract cleanly against those objects instead of closure lets.
