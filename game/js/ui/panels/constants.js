// Pure-data constants used by the inventory panel. No logic, no DOM.
// Kept separate so sub-modules can import them without pulling the whole
// state object.

import {
  GOLD_COIN_ID,
  PLATINUM_COIN_ID,
  CRYSTAL_COIN_ID,
} from '../../config/game.config.js';

/**
 * Slot-matching rules. Keyed by slot name (armor, shield, …).
 * Each entry describes:
 *   - id           DOM suffix - element is `#slot<Id>Img` / `#slot<Id>Label`
 *   - iconDefault  4-char placeholder text shown when slot is empty
 *   - requireType  item_type the slot accepts (matched case-insensitive)
 *   - requireTypeAlt / requireSecondaryType - alternatives for items whose
 *                   primary type differs from the strict match
 *   - requireClass the item_class required (used for weapons to avoid
 *                   accepting "Shields" into the hand slot)
 *   - footName     human-readable name shown in the equipment panel footer
 */
export const SLOT_RULES = {
  armor:      { id: 'Armor',  iconDefault: 'BODY', requireType: 'Armors',   footName: 'armor'   },
  shield:     { id: 'Shield', iconDefault: 'SHLD', requireType: 'Shields',  footName: 'shield'  },
  legs:       { id: 'Legs',   iconDefault: 'LEGS', requireType: 'Legs',     footName: 'legs'    },
  boots:      { id: 'Boots',  iconDefault: 'FEET', requireType: 'Boots',    footName: 'boots'   },
  ring:       { id: 'Ring',   iconDefault: 'RING', requireType: 'Rings',    footName: 'ring'    },
  ammunition: { id: 'Ammo',   iconDefault: 'AMMO', requireType: 'Ammunition', footName: 'ammunition' },
  helmet:     { id: 'Helmet', iconDefault: 'HEAD', requireType: 'Helmets',  footName: 'helmet'  },
  amulet:     { id: 'Amulet', iconDefault: 'NECK', requireType: 'Amulets and Necklaces', footName: 'amulet' },
  hand:       { id: 'Hand',   iconDefault: 'HAND', requireClass: 'Weapons', footName: 'weapon'  },
  light:      { id: 'Light',  iconDefault: 'LIT',  requireSecondaryType: 'Illumination', requireTypeAlt: 'Light Sources', footName: 'light source' },
};

/** item_type (lowercased) → slot name for auto-equip-on-pickup. */
export const ARMOR_AUTO_SLOT_BY_TYPE = {
  armors: 'armor',
  helmets: 'helmet',
  boots: 'boots',
  legs: 'legs',
  'amulets and necklaces': 'amulet',
};

/** Seed data for panelState.coinTemplateById. Produced on demand by
 *  coins.ensureCoinTemplatesLoaded() so the templates exist before the
 *  first coin stack has to be built. */
export const COIN_TEMPLATE_SEEDS = [
  [GOLD_COIN_ID,     { id: GOLD_COIN_ID,     title: 'Gold Coin',     isStackable: true, raw: { article_id: GOLD_COIN_ID,     value_sell: 1,     value_buy: 1,     weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
  [PLATINUM_COIN_ID, { id: PLATINUM_COIN_ID, title: 'Platinum Coin', isStackable: true, raw: { article_id: PLATINUM_COIN_ID, value_sell: 100,   value_buy: 100,   weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
  [CRYSTAL_COIN_ID,  { id: CRYSTAL_COIN_ID,  title: 'Crystal Coin',  isStackable: true, raw: { article_id: CRYSTAL_COIN_ID,  value_sell: 10000, value_buy: 10000, weight: 0.1 }, item_type: 'Valuables', item_class: 'Currency' }],
];
