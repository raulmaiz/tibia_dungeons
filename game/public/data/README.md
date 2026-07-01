# `game/data/` — static data + assets

Two kinds of content live here:

- **JSON catalogs** — exported from [tibiawiki-sql](https://github.com/Galarzaa90/tibia-wiki). Loaded at runtime by [`game/js/dataService.js`](../js/dataService.js).
- **Images** — sprites, backgrounds, store covers. Resolved by `imageUrl()`.

## JSON catalogs

| File | Joined with | Used by |
|---|---|---|
| `creature.json` | `creature_ability.json`, `creature_drop.json`, `creature_max_damage.json`, `creature_sound.json` | [`game/js/runtime/core/engine/game.engine.js`](../js/runtime/core/engine/game.engine.js) (spawn, AI, drops) |
| `item.json` | `item_attribute.json`, `item_sound.json`, `item_key.json`, `item_proficiency_perk.json`, `item_store_offer.json` | [`game/js/ui/inventoryPanel.js`](../js/ui/inventoryPanel.js) (shop catalog, equipment slots) |
| `spell.json` | `spell_price.json` | [`game/js/ui/inventoryPanel.js`](../js/ui/inventoryPanel.js) (spells shop) + engine (cast resolution) |
| `npc.json` | `npc_destination.json`, `npc_job.json`, `npc_offer_buy.json`, `npc_offer_sell.json`, `npc_race.json` | Currently unused — reserved for future NPC interactions |
| `outfit.json`, `outfit_image.json`, `outfit_quest.json` | — | Currently unused — reserved for future outfit selection |
| `imbuement.json`, `imbuement_material.json` | — | Currently unused |
| `quest.json`, `quest_danger.json`, `quest_reward.json` | — | Currently unused |
| `house.json`, `book.json`, `charm.json`, `mount.json`, `achievement.json` | — | Currently unused |
| `world.json`, `rashid_position.json`, `game_update.json`, `database_info.json` | — | Reference / metadata only |
| `index.json` | — | Bundle manifest (file list for the manifest at `manifest.json`) |
| `manifest.json` | — | Maps file paths to CDN-cached image URLs. Used by `imageUrl()`. |
| `map.json` | — | Reserved for future Tibia map import |

## Project-specific files

These are **not** from tibiawiki — they're our own:

- **`images/game/`** — UI background art, store covers (`preview.jpg`, `sword.jpg`, `cover-square-800x800.jpg`, etc.).
- **`images/creature/`, `images/item/`, `images/spell/`, `images/outfit/`, `images/outfit_frames/`** — sprites referenced by the catalogs above.

## Adding data

- A new creature → see [`/docs/how-to-add-creature.md`](../../docs/how-to-add-creature.md). Usually involves appending to `creature.json` + adding a sprite.
- A new spell → see [`/docs/how-to-add-spell.md`](../../docs/how-to-add-spell.md). `spell.json` + sprite + price.
- A new floor → see [`/docs/how-to-add-floor.md`](../../docs/how-to-add-floor.md). Mostly JS config under `game/js/data/`, not here.

## Don't put logic here

This folder is JSON + images only. Anything with code → [`game/js/data/`](../js/data/) (which is misnamed but historical — it holds the project's runtime data tables, not the JSONs). The two `data/` folders coexist intentionally: this one is the asset dump; the JS one is the tuning module.
