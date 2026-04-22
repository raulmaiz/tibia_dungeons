// Inventory-panel shared state. Single mutable container that every panel
// sub-module (characterSelect / itemTooltip / equipment / lootBag / …) reads
// and writes. The orchestrator in inventoryPanel.js wires cross-module
// function references into the `helpers` block at setup time.
//
// Why a shared object instead of per-binding `let` exports with setters
// (the playerSession.js pattern)? The panel has ~10 pieces of state and
// a handful of helpers that'd otherwise be circular imports. One object
// reference keeps imports tidy and makes "everything shared across panel
// sub-modules" visible in one place.
//
// Only entries that would cause a circular import go in `helpers`. If two
// modules can resolve each other with a direct import, they should —
// helpers is the escape hatch, not the default.

export const panelState = {
  // ── run-time mutable state ───────────────────────────────────────────
  selectedSex: 'male',
  selectedClass: 'knight',
  playerConfig: null,

  currentBagCapacity: 0,
  currentBagItem: null,
  currentPlayerCapacity: 400, // set correctly on setup from progression table

  /** Keyed by slot: armor, shield, legs, boots, ring, ammunition, helmet, amulet, hand, light, bag. */
  equippedSlots: {
    armor: null, shield: null, legs: null, boots: null, ring: null,
    ammunition: null, helmet: null, amulet: null, hand: null,
  },

  /** Array of items in the loot bag (incl. coin stacks). Mutated in place. */
  bagLootItems: [],

  /** Lookup for coin templates by article_id. Populated on first coin-related flow. */
  coinTemplateById: new Map(),

  // ── helpers wired by the orchestrator ────────────────────────────────
  // Declared as null here so every cross-module path is visible in one
  // place. The orchestrator populates them in setupInventoryPanel().
  helpers: {
    // equipment.js → lootBag.js (swap-to-bag on two-handed weapon equip)
    addLootItemToBag: null,
    // lootBag.js → equipFlow.js (left-click on a container in the bag)
    equipBagByArticleId: null,

    // Equipment resolution exposed so itemTooltip can render the right
    // action buttons without importing from equipment.js directly.
    resolveEquipSlotForItem: null,
    resolveSellUnitPrice: null,
    canEquipItemInSlot: null,

    // Slot visual mutation (accessoryTimers + tooltip action buttons).
    setEquippedSlotVisual: null,
    clearEquippedSlotVisual: null,

    // Loot bag rendering - consumed by tooltip action buttons + any
    // flow that changes bag contents without going through this panel.
    renderLootSlots: null,

    // Auto-equip checks - used by anything that stages loot before
    // dropping it into the bag.
    tryAutoEquipArmorUpgrade: null,
    tryAutoEquipShieldUpgrade: null,
    tryAutoEquipWeaponUpgrade: null,
    tryAutoEquipAccessory: null,

    // Coin management - anything outside the panel that mints / spends
    // gold goes through these.
    ensureCoinTemplatesLoaded: null,
    normalizeCoinStacks: null,
    addCoinsToInventory: null,
    getTotalGoldInInventory: null,
    setCoinsFromTotalGold: null,
    spendGoldFromInventory: null,
  },
};
