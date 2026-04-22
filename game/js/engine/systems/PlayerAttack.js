// Player-initiated attack orchestrator. Given a target creature + hand
// weapon, resolves ammo / mana / miss-crit / elemental math and applies
// damage + XP + loot drops. Pure glue — all pure math lives in the
// CombatMath / Weapons / ElementalMods / HitVisuals modules; this one
// wires them together against engine state (playerState, creatures,
// floor atmosphere, combat log).
//
// Extracted from game.engine.js Phase 4 (Combat prep).

import { addCombatLog, LOG_COLORS } from './CombatLog.js';
import { bus, EVENTS } from '../../core/EventBus.js';
import { dropItemOnGround } from './GroundLoot.js';
import { lastLootRejectReason } from '../../state/playerSession.js';
import {
  isMagicRangedWeapon,
  isDistanceWeapon,
  isThrowableWeapon,
  requiresAmmoForWeapon,
  hasAmmoForWeapon,
  isAmmoCompatibleWithWeapon,
  getEquippedAmmo,
  magicWeaponManaCost,
  magicWeaponDamageTypeRaw,
  magicWeaponDamageTypeSuffix,
} from './Weapons.js';
import {
  didAttackCrit,
  didAttackMiss,
  applyCriticalDamage,
} from './CombatMath.js';
import {
  normalizeDamageTypeToModifierKey,
  applyIncomingElementalDamage,
} from './ElementalMods.js';

/** @typedef {import('../../types.js').Creature} Creature */
/** @typedef {import('../../types.js').Item} Item */

/**
 * @typedef {object} PlayerAttackDeps
 * @property {any} scene                                   - Phaser this
 * @property {any} playerState                             - createPlayer() object
 * @property {number} tileSize
 * @property {(gx: number) => number} centerX
 * @property {(gy: number) => number} centerY
 * @property {any} floorAtmosphere
 * @property {() => number} getCurrentLevel
 * @property {() => Creature[]} aliveCreatures
 * @property {Function | undefined} inventorySetEquippedSlotVisual
 * @property {() => void} updatePlayerBar
 * @property {(creature: Creature) => void} updateCreatureBar
 * @property {() => void} updateHud
 * @property {(handOverride?: Item | null) => number} currentPlayerDamage
 * @property {(weapon: Item) => boolean} spendOneAmmo
 * @property {(weapon: Item, uses: number) => void} gainWeaponSkillUse
 * @property {(uses: number) => void} gainFistSkillUse
 * @property {(xp: number) => void} grantPlayerXp
 * @property {(creature: Creature) => number} effectiveXpFromCreature
 * @property {(creature: Creature) => void} playCreatureDeathEffect
 * @property {(parent: Creature) => void} killSummonsOf
 * @property {(creatureId: number | string) => Array<{ itemId: number, itemTitle: string, itemImage?: string | null, itemType?: string | null, itemClass?: string | null, itemSecondary?: string | null, armorValue?: number, shieldingValue?: number, attackValue?: number, rangeValue?: number, throwable?: boolean, attributes?: any[], raw?: any, isStackable?: boolean, lootCount?: number }>} rollCreatureDrops
 * @property {() => number} fallbackGoldFromLevel
 * @property {(weapon: Item | null) => boolean} canStrafeCastMagicWeapon
 * @property {(creature: Creature, dmg: number) => void} showCreatureHitEffect
 * @property {(x: number, y: number) => void} showCritText
 * @property {(x: number, y: number, impactType: string) => void} showAmmoImpactEffect
 * @property {(x: number, y: number) => void} showMissSmoke
 * @property {(weapon: Item, target: Creature) => void} showRangedProjectileEffect
 */

/**
 * Build the performPlayerAttack callback, capturing all engine deps once.
 *
 * Call the returned function from engine action paths:
 *   performPlayerAttack(targetCreature, handWeapon, usedRangedShot, now)
 *
 * The `usedRangedShot` parameter is currently unused inside (kept in the
 * signature for call-site compatibility).
 *
 * @param {PlayerAttackDeps} deps
 */
export function setupPlayerAttack(deps) {
  const {
    scene,
    playerState,
    tileSize,
    centerX,
    centerY,
    floorAtmosphere,
    getCurrentLevel,
    aliveCreatures,
    inventorySetEquippedSlotVisual,
    updatePlayerBar,
    updateCreatureBar,
    updateHud,
    currentPlayerDamage,
    spendOneAmmo,
    gainWeaponSkillUse,
    gainFistSkillUse,
    grantPlayerXp,
    effectiveXpFromCreature,
    playCreatureDeathEffect,
    killSummonsOf,
    rollCreatureDrops,
    fallbackGoldFromLevel,
    canStrafeCastMagicWeapon,
    showCreatureHitEffect,
    showCritText,
    showAmmoImpactEffect,
    showMissSmoke,
    showRangedProjectileEffect,
  } = deps;

  return function performPlayerAttack(targetCreature, handWeapon, _usedRangedShot, now) {
    if (!targetCreature) return false;
    let activeWeapon = handWeapon;
    if (activeWeapon && requiresAmmoForWeapon(activeWeapon) && !hasAmmoForWeapon(activeWeapon)) {
      const equippedAmmo = getEquippedAmmo();
      if (equippedAmmo && !isAmmoCompatibleWithWeapon(activeWeapon, equippedAmmo)) {
        addCombatLog(`Wrong ammo for ${activeWeapon.title}. Attacking with base melee.`);
      } else {
        addCombatLog(`Out of ammo for ${activeWeapon.title}. Attacking with base melee.`);
      }
      activeWeapon = null;
    }
    if (activeWeapon && requiresAmmoForWeapon(activeWeapon)) {
      const consumed = spendOneAmmo(activeWeapon);
      if (!consumed) {
        const equippedAmmo = getEquippedAmmo();
        if (equippedAmmo && !isAmmoCompatibleWithWeapon(activeWeapon, equippedAmmo)) {
          addCombatLog(`Wrong ammo for ${activeWeapon.title}. Attacking with base melee.`);
        } else {
          addCombatLog(`Out of ammo for ${activeWeapon.title}. Attacking with base melee.`);
        }
        activeWeapon = null;
      }
    }
    if (activeWeapon && isMagicRangedWeapon(activeWeapon)) {
      const manaCost = magicWeaponManaCost(activeWeapon);
      if (manaCost > 0) {
        if (playerState.mana < manaCost) {
          addCombatLog(`Not enough mana for ${activeWeapon.title}. Attacking with base melee.`);
          activeWeapon = null;
        } else {
          playerState.mana = Math.max(0, playerState.mana - manaCost);
          updatePlayerBar();
        }
      }
    }
    if (activeWeapon && isDistanceWeapon(activeWeapon)) {
      showRangedProjectileEffect(activeWeapon, targetCreature);
      gainWeaponSkillUse(activeWeapon, 1);
    } else if (activeWeapon && String(activeWeapon.item_class || '').toLowerCase() === 'weapons') {
      gainWeaponSkillUse(activeWeapon, 1);
    } else if (!activeWeapon) {
      gainFistSkillUse(1);
    }
    if (didAttackMiss(activeWeapon)) {
      showMissSmoke(targetCreature.sprite.x, targetCreature.sprite.y);
      addCombatLog(`You miss your hit against ${targetCreature.title}.`);
    } else {
      const isCrit = didAttackCrit();
      const baseDamage = currentPlayerDamage(activeWeapon);
      const damage = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
      let elemKey = 'physical';
      if (activeWeapon && isMagicRangedWeapon(activeWeapon)) {
        elemKey = normalizeDamageTypeToModifierKey(magicWeaponDamageTypeRaw(activeWeapon)) || 'energy';
      }
      const dealtBase = applyIncomingElementalDamage(damage, targetCreature, elemKey);
      const dealt = playerState.godMode ? Math.max(1, Number(targetCreature.hp || 1)) : dealtBase;
      targetCreature.hp = Math.max(0, targetCreature.hp - dealt);
      showCreatureHitEffect(targetCreature, dealt);
      if (isCrit) {
        showCritText(targetCreature.sprite.x, targetCreature.sprite.y);
      }
      // Burst Arrow: AoE fire splash + temporary light
      const _firedAmmo = getEquippedAmmo();
      const _firedAmmoTitle = String((_firedAmmo && _firedAmmo.title) || '').toLowerCase();
      if (_firedAmmoTitle === 'burst arrow' && targetCreature.sprite) {
        const tx = centerX(targetCreature.gx);
        const ty = centerY(targetCreature.gy);
        const splashDmg = Math.max(1, Math.floor(dealt * 0.4));
        const splashTargets = aliveCreatures().filter(c =>
          c !== targetCreature
          && Math.abs(c.gx - targetCreature.gx) <= 1
          && Math.abs(c.gy - targetCreature.gy) <= 1
        );
        for (const st of splashTargets) {
          const fireDmg = applyIncomingElementalDamage(splashDmg, st, 'fire');
          st.hp = Math.max(0, st.hp - fireDmg);
          showCreatureHitEffect(st, fireDmg);
          addCombatLog(`Burst Arrow explosion hits ${st.title} for ${fireDmg} (fire).`, LOG_COLORS.HIT);
          if (st.hp <= 0) {
            st.alive = false;
            playCreatureDeathEffect(st);
            updateCreatureBar(st);
            grantPlayerXp(effectiveXpFromCreature(st));
            playerState.runKills += 1;
            addCombatLog(`${st.title} dies from the explosion.`);
            killSummonsOf(st);
          }
        }
        showAmmoImpactEffect(tx, ty, 'explosion');
        const fireGlow = scene.add.circle(tx, ty, tileSize * 0.8, 0xf97316, 0.35);
        fireGlow.setDepth(4);
        scene.tweens.add({
          targets: fireGlow,
          scaleX: 2.2, scaleY: 2.2, alpha: 0,
          duration: 600, ease: 'Quad.easeOut',
          onComplete: () => fireGlow.destroy(),
        });
        const lightId = `burst_${Date.now()}_${Math.random()}`;
        floorAtmosphere.addAreaLight(lightId, tx, ty, 2.5, 3000);
      }
      const dtHit = magicWeaponDamageTypeSuffix(activeWeapon);
      addCombatLog(
        isCrit
          ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit}.`
          : `You hit ${targetCreature.title} for ${dealt}${dtHit}.`,
        isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
      );
      if (targetCreature.hp <= 0) {
        targetCreature.alive = false;
        playCreatureDeathEffect(targetCreature);
        updateCreatureBar(targetCreature);
        grantPlayerXp(effectiveXpFromCreature(targetCreature));
        playerState.runKills += 1;
        addCombatLog(
          isCrit
            ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit}, and it dies.`
            : `You hit ${targetCreature.title} for ${dealt}${dtHit} and it dies.`,
          isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
        );
        const rolledDrops = rollCreatureDrops(targetCreature.id);
        if (rolledDrops.length > 0) {
          addCombatLog(`${targetCreature.title} dropped: ${rolledDrops.map((d) => d.itemTitle).join(', ')}.`);
          bus.emit(EVENTS.LOOT_DROPPED, {
            sourceId: targetCreature.id,
            sourceTitle: targetCreature.title,
            drops: rolledDrops.map((d) => ({ itemId: d.itemId, itemTitle: d.itemTitle })),
          });
        } else {
          const fallbackGold = fallbackGoldFromLevel();
          if (window.debugInventory && typeof window.debugInventory.addGold === 'function') {
            window.debugInventory.addGold(fallbackGold);
          }
          addCombatLog(`${targetCreature.title} dropped no items. You receive ${fallbackGold} gold.`);
        }
        if (rolledDrops.length > 0 && window.debugInventory && typeof window.debugInventory.addLoot === 'function') {
          for (const d of rolledDrops) {
            const lootCount = Math.max(1, Math.floor(Number(d.lootCount) || 1));
            const stored = window.debugInventory.addLoot({
              id: d.itemId,
              title: d.itemTitle,
              image: d.itemImage || null,
              item_type: d.itemType || null,
              item_class: d.itemClass || null,
              type_secondary: d.itemSecondary || null,
              armor_value: Number(d.armorValue || 0),
              shielding_value: Number(d.shieldingValue || 0),
              attack_value: Number(d.attackValue || 0),
              range_value: Number(d.rangeValue || 1),
              throwable: Boolean(d.throwable),
              attributes: Array.isArray(d.attributes) ? d.attributes : [],
              raw: (d.raw && typeof d.raw === 'object') ? d.raw : {},
              isStackable: Boolean(d.isStackable),
              count: lootCount,
            });
            if (stored) {
              addCombatLog(`Stored in bag: ${d.itemTitle}.`);
            } else {
              const droppedItem = {
                id: d.itemId,
                title: d.itemTitle,
                image: d.itemImage || null,
                item_type: d.itemType || null,
                item_class: d.itemClass || null,
                type_secondary: d.itemSecondary || null,
                armor_value: Number(d.armorValue || 0),
                shielding_value: Number(d.shieldingValue || 0),
                attack_value: Number(d.attackValue || 0),
                range_value: Number(d.rangeValue || 1),
                throwable: Boolean(d.throwable),
                attributes: Array.isArray(d.attributes) ? d.attributes : [],
                raw: (d.raw && typeof d.raw === 'object') ? d.raw : {},
                isStackable: Boolean(d.isStackable),
                count: lootCount,
              };
              dropItemOnGround(targetCreature.gx, targetCreature.gy, droppedItem);
              if (lastLootRejectReason === 'capacity') {
                addCombatLog(`Not enough capacity, dropped on ground: ${d.itemTitle}.`);
              } else {
                addCombatLog(`Bag slots full, dropped on ground: ${d.itemTitle}.`);
              }
            }
          }
        }
        killSummonsOf(targetCreature);
      } else {
        addCombatLog(
          isCrit
            ? `CRITICAL hit on ${targetCreature.title} for ${dealt}${dtHit} (${targetCreature.hp} HP).`
            : `You hit ${targetCreature.title} for ${dealt}${dtHit} (${targetCreature.hp} HP).`,
          isCrit ? LOG_COLORS.CRIT : LOG_COLORS.HIT
        );
      }
    }
    if (activeWeapon && isDistanceWeapon(activeWeapon) && isThrowableWeapon(activeWeapon) && Math.random() < 0.1) {
      const currentCount = Math.max(1, Number(activeWeapon.count || 1));
      if (currentCount > 1) {
        if (typeof inventorySetEquippedSlotVisual === 'function') {
          inventorySetEquippedSlotVisual('hand', { ...activeWeapon, count: currentCount - 1 }, `${activeWeapon.title} consumed on throw (${currentCount - 1} left).`);
        }
      } else if (window.debugInventory && typeof window.debugInventory.unequipHand === 'function') {
        window.debugInventory.unequipHand();
      }
      addCombatLog(`${activeWeapon.title} was consumed after the throw.`);
    }
    updateCreatureBar(targetCreature);
    updateHud();
    if (aliveCreatures().length === 0) {
      floorAtmosphere.showPit(true);
      addCombatLog(`You defeated all creatures on floor ${getCurrentLevel()}. Drop into the pit.`);
      if (canStrafeCastMagicWeapon(activeWeapon)) {
        playerState.nextMagicWeaponShotAt = now + playerState.actionDelayMs;
      } else {
        playerState.nextActionAt = now + playerState.actionDelayMs;
      }
      return true;
    }
    if (canStrafeCastMagicWeapon(activeWeapon)) {
      playerState.nextMagicWeaponShotAt = now + playerState.actionDelayMs;
    } else {
      playerState.nextActionAt = now + playerState.actionDelayMs;
    }
    return true;
  };
}
