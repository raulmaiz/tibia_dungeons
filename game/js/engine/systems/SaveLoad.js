// Save/Load — first Phase 4 extraction from game.engine.js.
//
// Only the **snapshot capture** side lives here for now. It is pure: given
// the current run state (a ctx object built from the engine closure), it
// returns a serializable `snapshot` shaped for the /api/saves endpoint.
//
// The resume/apply side still lives inside startGame() because it needs to
// mutate ~20 closure `let` bindings and call Phaser scene methods. It will
// move here in a later slice once those bindings become object fields.

/**
 * Capture everything needed to resume a run on another device.
 * Map tiles are regenerated per floor, so they are intentionally NOT included.
 *
 * @param {object} ctx - read-only snapshot of the engine closure
 * @param {object} ctx.configPlayer      — { name, sex } fed to startGame()
 * @param {string} ctx.playerClassKey    — 'knight' | 'paladin' | 'sorcerer' | 'druid'
 * @param {number} ctx.playerLevel
 * @param {number} ctx.playerXp
 * @param {number} ctx.playerHp
 * @param {number} ctx.playerMana
 * @param {number} ctx.playerMaxHp
 * @param {number} ctx.playerMaxMana
 * @param {number} ctx.playerMagicLevel
 * @param {number} ctx.playerFistLevel
 * @param {number} ctx.playerShieldingLevel
 * @param {Map<string,number>} ctx.weaponSkillLevelByType
 * @param {number} ctx.currentLevel       — active floor (1-indexed)
 * @param {number} ctx.gridX
 * @param {number} ctx.gridY
 * @param {number} ctx.hungerSecondsLeft
 * @param {number} ctx.runKills
 * @param {Set<number>} ctx.learnedSpellIds
 * @param {number[]}    ctx.learnedSpellOrder  — authoritative; first 10 = hotkeys
 * @param {object|null} ctx.burnState
 * @param {object|null} ctx.poisonState
 * @param {object|null} ctx.electrifiedState
 */
export function captureSaveSnapshot(ctx) {
  // Pull inventory state through the debugInventory bridge — the
  // underlying equippedSlots / bagLootItems live in the panel closure
  // and aren't directly reachable from the engine.
  let invState = null;
  try {
    invState = (window.debugInventory && typeof window.debugInventory.state === 'function')
      ? window.debugInventory.state() : null;
  } catch { invState = null; }
  const goldAmount = window.debugInventory && typeof window.debugInventory.getGold === 'function'
    ? Math.max(0, Number(window.debugInventory.getGold() || 0)) : 0;
  const weaponSkills = {};
  if (ctx.weaponSkillLevelByType && typeof ctx.weaponSkillLevelByType.entries === 'function') {
    for (const [k, v] of ctx.weaponSkillLevelByType.entries()) weaponSkills[k] = Number(v) || 0;
  }
  return {
    version: 1,
    // Character identity
    name:             String((ctx.configPlayer && ctx.configPlayer.name) || ''),
    classKey:         String(ctx.playerClassKey || 'knight'),
    sex:              (ctx.configPlayer && ctx.configPlayer.sex === 'female') ? 'female' : 'male',
    // Progression
    playerLevel:      Number(ctx.playerLevel) || 1,
    playerXp:         Number(ctx.playerXp) || 0,
    playerHp:         Number(ctx.playerHp) || 0,
    playerMana:       Number(ctx.playerMana) || 0,
    playerMaxHp:      Number(ctx.playerMaxHp) || 0,
    playerMaxMana:    Number(ctx.playerMaxMana) || 0,
    playerMagicLevel: Number(ctx.playerMagicLevel) || 0,
    playerFistLevel:  Number(ctx.playerFistLevel) || 0,
    playerShieldingLevel: Number(ctx.playerShieldingLevel) || 0,
    weaponSkillLevels: weaponSkills,
    // Run state
    currentLevel:     Number(ctx.currentLevel) || 1,
    gridX:            Number(ctx.gridX) || 0,
    gridY:            Number(ctx.gridY) || 0,
    hungerSecondsLeft: Number(ctx.hungerSecondsLeft) || 0,
    runKills:         Number(ctx.runKills) || 0,
    gold:             goldAmount,
    // Inventory snapshot (via bridge so this survives scope isolation).
    bagArticleId:     (invState && invState.bag && invState.bag.article_id) || null,
    bagSlots:         (invState && invState.bagSlots) || 0,
    equippedSlots:    invState && invState.equipped
      ? Object.fromEntries(Object.entries(invState.equipped).map(([k, v]) => [k, v || null]))
      : {},
    bagLootItems:     (invState && Array.isArray(invState.items))
      ? invState.items.map((i) => ({ ...i })) : [],
    // Spells — learnedSpellOrder is the new authoritative order
    // (first 10 are hotkeys, rest are unslotted). The legacy
    // learnedSpellSlots field is preserved for old clients/saves.
    learnedSpellIds:   Array.from(ctx.learnedSpellIds || []),
    learnedSpellOrder: Array.from(ctx.learnedSpellOrder || []),
    learnedSpellSlots: (() => {
      const slots = Array.from({ length: 10 }, () => null);
      const order = ctx.learnedSpellOrder || [];
      for (let i = 0; i < 10 && i < order.length; i += 1) {
        slots[i] = order[i];
      }
      return slots;
    })(),
    // DoT statuses (if any)
    burnState:        ctx.burnState ? { ...ctx.burnState } : null,
    poisonState:      ctx.poisonState ? { ...ctx.poisonState } : null,
    electrifiedState: ctx.electrifiedState ? { ...ctx.electrifiedState } : null,
  };
}

/**
 * Rehydrate the per-weapon-type skill level Map from a snapshot. Mutates
 * `map` in place so the engine's `weaponSkillLevelByType` reference stays
 * valid everywhere it's already captured. Each level is clamped to >= 10
 * (the baseline every weapon type starts at).
 *
 * @param {Map<string,number>} map   — engine's `weaponSkillLevelByType`
 * @param {object} snap              — save snapshot returned by captureSaveSnapshot
 */
export function restoreWeaponSkills(map, snap) {
  if (!map || typeof map.clear !== 'function') return;
  map.clear();
  for (const [k, v] of Object.entries((snap && snap.weaponSkillLevels) || {})) {
    map.set(k, Math.max(10, Number(v) || 10));
  }
}

/**
 * Rehydrate learned-spell state from a snapshot. Prefers the new
 * `learnedSpellOrder` field but falls back to the legacy
 * `learnedSpellSlots` (pre-unified-order saves). Also backfills any IDs
 * present in `learnedSpellIds` but missing from the order — guarantees the
 * hotbar never loses a spell the player legitimately learned.
 *
 * Mutates both containers in place.
 *
 * @param {Set<number>} idsSet    — engine's `learnedSpellIds`
 * @param {number[]}    orderArr  — engine's `learnedSpellOrder`
 * @param {object}      snap
 */
export function restoreLearnedSpells(idsSet, orderArr, snap) {
  if (idsSet && typeof idsSet.clear === 'function') {
    idsSet.clear();
    for (const id of (snap && snap.learnedSpellIds) || []) {
      const n = Number(id);
      if (Number.isFinite(n) && n > 0) idsSet.add(n);
    }
  }
  if (!Array.isArray(orderArr)) return;
  orderArr.length = 0;
  if (snap && Array.isArray(snap.learnedSpellOrder) && snap.learnedSpellOrder.length > 0) {
    for (const v of snap.learnedSpellOrder) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) orderArr.push(n);
    }
  } else if (snap && Array.isArray(snap.learnedSpellSlots)) {
    for (const v of snap.learnedSpellSlots) {
      if (v == null) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) orderArr.push(n);
    }
  }
  // Backfill any learned IDs that aren't already in the order (older saves
  // may have learned spells without any slot assignment).
  if (idsSet) {
    for (const id of idsSet) {
      if (!orderArr.some((v) => Number(v) === Number(id))) {
        orderArr.push(Number(id));
      }
    }
  }
}
