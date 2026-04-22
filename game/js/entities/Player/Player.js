// Player runtime state. Phase 4 endgame — breaks the `startGame()` closure's
// ~25 mutable `let` bindings into a single object so downstream systems
// (Combat, AI, SpellCasting, SaveLoad/restore) can read/write player fields
// without receiving a 20-getter `deps` bag.
//
// The factory returns a plain object (no class ceremony). Every field is
// mutable — write `player.hp -= dmg` directly from the systems.
//
// Naming: fields drop the `player*` prefix that the closure lets carried
// (`playerHp` → `hp`, `playerLevel` → `level`). The engine still reads
// `player.hp` etc. so call sites self-document.

/** @typedef {import('../../types.js').Item} Item */

/**
 * Progression / stats / position / DoT container. Held in the engine
 * closure as `const player = createPlayer(...)`.
 *
 * @typedef {object} Player
 *   — Identity
 * @property {string} classKey         — 'knight' | 'paladin' | 'sorcerer' | 'druid'
 *   — Progression
 * @property {number} level
 * @property {number} xp
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} mana
 * @property {number} maxMana
 * @property {number} magicLevel
 * @property {number} fistLevel
 * @property {number} fistUses
 * @property {number} shieldingLevel
 * @property {number} shieldingUses
 * @property {Map<string,number>} weaponSkillLevelByType
 * @property {Map<string,number>} weaponSkillUsesByType
 * @property {Set<number>} learnedSpellIds
 * @property {number[]} learnedSpellOrder
 * @property {Map<number,number>} spellCooldownUntil  — epoch-ms when cd ends
 * @property {Map<number,number>} spellCdDurations    — seconds
 *   — Position + movement
 * @property {number} gridX
 * @property {number} gridY
 * @property {number} facingFrame     — 0=S, 1=E, 2=N, 3=W
 * @property {boolean} moving
 * @property {number} moveDurationMs
 * @property {number} actionDelayMs
 * @property {number} nextActionAt
 * @property {number} nextMagicWeaponShotAt
 *   — Run flags
 * @property {boolean} dead
 * @property {boolean} godMode
 * @property {number} runKills
 *   — Hunger
 * @property {number} hungerSecondsLeft
 * @property {boolean} isHungry
 *   — DoT status effects (each: { startedAt, nextTickAt, tickIndex } | null)
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} burnState
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} poisonState
 * @property {{ startedAt: number, nextTickAt: number, tickIndex: number } | null} electrifiedState
 */

/**
 * @param {{ classKey?: string }} configPlayer
 * @param {{ maxHp: number, maxMana: number, magicLevel?: number }} lvl1Stats
 * @param {{ fistLevel: number, shieldingLevel: number, moveDurationBase: number, actionDelayBase: number }} bases
 * @returns {Player}
 */
export function createPlayer(configPlayer, lvl1Stats, bases) {
  const classKey = String((configPlayer && configPlayer.classKey) || 'knight').toLowerCase();
  return {
    classKey,

    // Progression
    level: 1,
    xp: 0,
    hp: lvl1Stats.maxHp,
    maxHp: lvl1Stats.maxHp,
    mana: lvl1Stats.maxMana,
    maxMana: lvl1Stats.maxMana,
    magicLevel: Math.max(0, Number(lvl1Stats.magicLevel || 0)),
    fistLevel: bases.fistLevel,
    fistUses: 0,
    shieldingLevel: bases.shieldingLevel,
    shieldingUses: 0,
    weaponSkillLevelByType: new Map(),
    weaponSkillUsesByType: new Map(),
    learnedSpellIds: new Set(),
    learnedSpellOrder: [],
    spellCooldownUntil: new Map(),
    spellCdDurations: new Map(),

    // Position + movement
    gridX: 0,
    gridY: 0,
    facingFrame: 0,
    moving: false,
    moveDurationMs: bases.moveDurationBase,
    actionDelayMs: bases.actionDelayBase,
    nextActionAt: 0,
    nextMagicWeaponShotAt: 0,

    // Run flags
    dead: false,
    godMode: false,
    runKills: 0,

    // Hunger
    hungerSecondsLeft: 0,
    isHungry: true,

    // DoT
    burnState: null,
    poisonState: null,
    electrifiedState: null,
  };
}
