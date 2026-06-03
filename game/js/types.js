// Shared JSDoc typedefs. Imported for side-effect (none) or via
// /** @typedef {import('../../types.js').Item} Item */ in consumer files.
//
// Keep every field optional or permissive — the catalog JSONs and the
// runtime objects have drifted over time and there are live productions
// shapes in the wild (especially for saves). We prefer "accepts more"
// over "strict contract" so the typecheck flags real bugs (wrong field
// name, missing import) and doesn't drown in false positives on legacy
// JSON shapes.

/**
 * A catalog item (weapon / armor / consumable / container) as it leaves
 * dataService.js, plus runtime extras (count, isStackable) that the
 * inventory panel attaches when an instance is carried or equipped.
 *
 * @typedef {object} Item
 * @property {number | null} [id]
 * @property {number} [article_id]
 * @property {string} [title]
 * @property {string | null} [image]
 * @property {string | null} [item_type]
 * @property {string | null} [item_class]
 * @property {string | null} [type_secondary]
 * @property {number} [armor_value]
 * @property {number} [shielding_value]
 * @property {number} [attack_value]
 * @property {number} [range_value]
 * @property {number} [price]
 * @property {boolean} [throwable]
 * @property {boolean} [isStackable]
 * @property {number} [count]
 * @property {Array<{ name: string, value: string | number }>} [attributes]
 * @property {string} [description]
 * @property {number} [weight]
 * @property {Record<string, any>} [raw]
 * @property {number} [_burnElapsedMs]  - torches freeze burn progress on unequip
 */

/**
 * Creature catalog entry (static data from the creature JSONs).
 *
 * @typedef {object} CreatureTemplate
 * @property {number} id
 * @property {string} title
 * @property {string} [type_primary]
 * @property {number} [experience]
 * @property {number} [hitpoints]
 * @property {number} [maxDamage]
 * @property {number} [runs_at]
 * @property {number} [speed]
 * @property {boolean} [ranged]
 * @property {number} [range]
 * @property {number} [convince_cost]
 * @property {string} [image]
 */

/**
 * Runtime creature instance. Lives in the engine's `creatures[]` array.
 *
 * @typedef {object} Creature
 * @property {number} id
 * @property {any} sprite                        - Phaser sprite
 * @property {number} gx
 * @property {number} gy
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} maxDamage
 * @property {number} runsAt
 * @property {string} title
 * @property {number} experience
 * @property {number} speed
 * @property {boolean} ranged
 * @property {number} range
 * @property {boolean} alive
 * @property {number} nextWanderAt
 * @property {number} nextActionAt
 * @property {number} nextAbilityAt
 * @property {boolean} aggroLocked
 * @property {Array<any>} abilities
 * @property {Record<string, number>} [elementMods]
 * @property {{ bg: any, fill: any, width: number }} hpBar
 * @property {any} nameTag
 * @property {number} convinceCost
 * @property {boolean} isConvinced
 */

/**
 * Spell catalog entry.
 *
 * @typedef {object} Spell
 * @property {number} article_id
 * @property {string} title
 * @property {string} [words]
 * @property {string} [spell_type]
 * @property {string} [group_spell]
 * @property {string} [status]
 * @property {number} [level]
 * @property {number} [mana]
 * @property {number} [price]
 * @property {string} [image]
 * @property {Record<string, any>} [raw]
 */

/**
 * Save-game snapshot — the shape `captureSaveSnapshot` returns and
 * bootFlow / resume consume. Keyed to `version: 1`; fields may be null
 * on partial loads (old clients).
 *
 * @typedef {object} SaveSnapshot
 * @property {number} version
 * @property {string} name
 * @property {'knight' | 'paladin' | 'sorcerer' | 'druid' | string} classKey
 * @property {'male' | 'female'} sex
 * @property {number} playerLevel
 * @property {number} playerXp
 * @property {number} playerHp
 * @property {number} playerMana
 * @property {number} playerMaxHp
 * @property {number} playerMaxMana
 * @property {number} playerMagicLevel
 * @property {number} playerFistLevel
 * @property {number} playerShieldingLevel
 * @property {Record<string, number>} weaponSkillLevels
 * @property {number} currentLevel
 * @property {number} gridX
 * @property {number} gridY
 * @property {number} hungerSecondsLeft
 * @property {number} runKills
 * @property {number} gold
 * @property {number | null} bagArticleId
 * @property {number} bagSlots
 * @property {Record<string, Item | null>} equippedSlots
 * @property {Item[]} bagLootItems
 * @property {number[]} learnedSpellIds
 * @property {number[]} learnedSpellOrder
 * @property {(number | null)[]} learnedSpellSlots
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} burnState
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} poisonState
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} electrifiedState
 * @property {FloorStateSnapshot[]} [floors] - per-floor state for every visited floor
 */

/**
 * Serializable state of a single dungeon floor. Cached as the player moves
 * between floors and persisted in the save so a resume rebuilds the exact
 * floor (layout, remaining creatures, ground loot, player tile) instead of
 * regenerating it. Owned by game.engine.js.
 *
 * @typedef {object} FloorStateSnapshot
 * @property {number} level
 * @property {string[]} map               - rows of the dungeon ('#' wall, '.' floor)
 * @property {{ gx: number, gy: number }} stairs
 * @property {number} w
 * @property {number} h
 * @property {string} label
 * @property {string | null} groupType
 * @property {number} targetCount
 * @property {{ gx: number, gy: number }} playerTile
 * @property {object[]} creatures
 * @property {Array<{ gx: number, gy: number, items: Item[] }>} groundLoot
 */

/**
 * Pile of items sitting on a single dungeon tile. Owned by GroundLoot.js.
 *
 * @typedef {object} GroundLootEntry
 * @property {number} gx
 * @property {number} gy
 * @property {Item[]} items
 * @property {any} marker          - Phaser text or image
 * @property {any} markerCount     - Phaser text (count badge)
 * @property {string | null} loadingTextureKey
 */

// Export nothing — this file is consumed purely via JSDoc imports. Having
// at least one export keeps it a proper ES module so tsconfig's `include`
// treats it uniformly.
export {};
