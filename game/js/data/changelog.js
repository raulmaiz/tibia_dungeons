/**
 * Changelog — human-readable release notes shown on the loading screen.
 * Add a new entry at the TOP for each release.
 * Keep entries short (1 line), max ~80 chars.
 */
export const CHANGELOG = [
  {
    version: '0.3.0',
    date: '2026-04-17',
    entries: [
      'Fix: character selection screen adapted to mobile (scrollable)',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-04-17',
    entries: [
      'Mobile & tablet: responsive layout, scaled sidebar',
      'Virtual touch joystick for movement on mobile/tablet',
      'Consumable hotkeys: [F] Food, [G] Mana Potion, [H] Health Potion',
      'Hotkey bar: click/tap to cast spells and use consumables',
      'Touch-friendly loot bag: tooltip with Equip/Use and Sell buttons',
      'Zoom slider in Game Settings to resize the game',
      'Combat indicator (⚔) in debuff panel on aggro',
      'CAP indicator with white→red color progression by capacity',
      'CAP and item weight shown in the Market',
      'Market: visible error messages (gold, capacity, bag full)',
      'Market: smart x10/x100 buy — purchases what you can carry',
      'Spell: Convince Creature — convince creatures to fight for you',
      'Spell: Summon Creature — summon the best creature you can afford',
      'Spell: Heal Friend — heals your ally with the lowest HP',
      'Spell: Mass Healing — heals player and all allies',
      'Party spells: Heal/Train/Enchant/Protect/Enlighten affect allies',
      'Spell: Challenge — taunts nearby creatures to target you',
      'Sorcerer: +25% magic damage on attack spells',
      'Allies: green tint, green HP bar, persist across floors',
      'Monsters can attack your allies when adjacent',
      'Summons die when their summoner is killed',
      'Distance Weapons: auto-fire while moving',
      'Floors 21+: random 1-100 creatures per floor',
      'Fix: Find Fiend hidden from Spell Shop',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-04-15',
    entries: [
      'Automatic versioning system on push and deploy',
      'Loading screen: dynamic animation with changelog history',
      'Fix: creatures no longer attack outside range when fleeing',
      'Refactor: ranged field in creature.json is now boolean (true/false)',
    ],
  },
  {
    version: '0.0.0',
    date: '2026-04-15',
    entries: [
      'New equipment slot: light source (torches, lamps, etc.)',
      'Complete redesign of Equipment and Loot Bag panels',
      'Equipment slot: glowing effect when equipping items',
      'Hunger indicator with red/green pulse animation',
      'Item tooltip now appears to the left of the item',
      'Compact tooltip: abbreviated item type, gold-colored price',
      'Items Shop panel: auto-close when clicking outside',
      'Items Shop Buy button with same green style as spells',
      'Slot 0 added to spell bar (key 0 / Numpad 0)',
      'Learned Spells panel redesigned with drag & drop reordering',
      'Top Stats shows all attributes without row limit',
      'Cast animation and cooldown overlay on spell bar',
      'Unified tooltip for spells, items shop and loot bag',
      'Creature names corrected across all 20 dungeon floors',
      'HUD fix: weapon skill and shielding based on actual equipment',
      'Spell Shop panel redesign',
    ],
  },
];
