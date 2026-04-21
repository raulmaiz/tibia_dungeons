# `entities/Item/` — *placeholder*

No files yet. Exists so future item-specific modules land here predictably.

## Today

Item logic lives in two places:

- **Catalog (stats, weight, attributes, equip rules)** → [`/game/data/item.json`](../../../data/item.json), [`/game/data/item_attribute.json`](../../../data/item_attribute.json), etc. (tibiawiki-sql exports).
- **Runtime equip/bag/use logic** → [`../../ui/inventoryPanel.js`](../../ui/inventoryPanel.js) — the 1.6k-line panel owns slot rules, loot-bag rendering, consumable callbacks, market shop.

## What lands here eventually

When the inventory panel is carved (refactor Phase 3) and the engine closure is broken (refactor Phase 4), item-specific logic migrates here:

- Slot-rule matching (`slotRules` + `armorAutoSlotByType` from the panel).
- Equip / unequip state machine.
- Weight + capacity calculation.
- Item-type helpers (`isConsumable`, `isLightSource`, `isEquipable`, …).
- Per-item special behaviours (magic rope, torch burn already in [`../../systems/lighting/LightItems.js`](../../systems/lighting/LightItems.js)).

## For now

If you need to touch item behaviour, it's almost certainly in [`../../ui/inventoryPanel.js`](../../ui/inventoryPanel.js). Search by slot key (`'hand'`, `'armor'`, `'light'`, …) or by `slotRules`.
