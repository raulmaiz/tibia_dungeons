// Inventory-panel shared state. Single mutable container that every panel
// sub-module (characterSelect / itemTooltip / equipment / lootBag / …) reads
// and writes. The orchestrator in inventoryPanel.js wires cross-module
// function references into the `helpers` block at setup time.
//
// Why a shared object instead of per-binding `let` exports with setters
// (the playerSession.js pattern)? The panel has ~10 pieces of state and
// ~10 cross-module helpers. One object reference keeps imports tidy and
// makes "everything the panel shares" visible in one place. playerSession
// uses the let-binding pattern because it has only a handful of values
// and zero cross-module function calls.

export const panelState = {
  // ── run-time mutable state ───────────────────────────────────────────
  selectedSex: 'male',
  selectedClass: 'knight',
  playerConfig: null,
  _starting: false,
  currentSaveId: null,

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

  // ── injected refs (wired by inventoryPanel.js at setup) ──────────────
  // These are cross-module calls the orchestrator passes in instead of
  // each sub-module importing from every other sub-module (which would
  // create a circular-import soup).
  helpers: {
    /** Engine entry — called after bootGame finishes loading + equipping. */
    startGame: null,

    /** Equipment resolution (used by tooltip + lootBag). */
    resolveEquipSlotForItem: null,
    resolveSellUnitPrice: null,
    canEquipItemInSlot: null,

    /** Slot visual mutation (used by accessoryTimers + lootBag + equipFlow). */
    setEquippedSlotVisual: null,
    clearEquippedSlotVisual: null,

    /** Loot bag rendering (used by equipment + accessoryTimers + coins). */
    renderLootSlots: null,

    /** Auto-equip checks (used by lootBag on incoming loot). */
    tryAutoEquipArmorUpgrade: null,
    tryAutoEquipShieldUpgrade: null,
    tryAutoEquipWeaponUpgrade: null,
    tryAutoEquipAccessory: null,

    /** Tooltip binding (used by lootBag + equipment). */
    bindTooltip: null,
    showTouchLootTooltip: null,
    hideItemTooltip: null,

    /** Loot context menu (used by lootBag). */
    showLootContextMenu: null,
    hideLootContextMenu: null,

    /** Item manipulation (used by equipFlow + bootFlow). */
    addLootItemToBag: null,
    equipItemInSlot: null,
    equipBagByArticleId: null,

    /** Coin management (used by equipFlow + bootFlow + lootBag). */
    addCoinsToInventory: null,
    getTotalGoldInInventory: null,
    setCoinsFromTotalGold: null,
    spendGoldFromInventory: null,
    normalizeCoinStacks: null,
    ensureCoinTemplatesLoaded: null,

    /** Hunger UI (used by engine via window.setHungryUi). */
    setHungryUi: null,

    /** Accessory expiration timers (ring / amulet) — used by equipment. */
    startAccessoryTimer: null,
    stopAccessoryTimer: null,
  },
};
