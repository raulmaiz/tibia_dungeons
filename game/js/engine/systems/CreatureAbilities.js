// Creature ability resolution: tile-pattern dispatch, range / LoS / heal /
// summon / offensive dispatch, and the big tryUseCreatureAbility
// orchestrator that each creature's AI calls once per turn-tick.
//
// Extracted from game.engine.js Phase 4 (Combat prep). Owns the
// attackersPressureInTurn counter internally (creatureTurn resets /
// increments it via setter/reset helpers returned from the setup).

import { addCombatLog, LOG_COLORS } from './CombatLog.js';
import {
  radialSparkBurst,
  spellProjectileLine,
  spellAuraBurst,
} from '../../rendering/Renderer.js';
import { castCreatureSpellVfx, castFireballExplosion, isElementalAbility, isFireballAbility } from '../creatureSpellVfx.js';
import { inferCreatureAbilityPattern } from '../../entities/Creature/abilityPatterns.js';
import { abilityStyle, fireballSizeTilesForEffect } from './SpellVisuals.js';
import { parseAbilityDamage, parseAbilityHeal, parseSummonMax } from './SpellStats.js';
import {
  lineToPlayerFromCreature as _lineToPlayerFromCreature,
  creatureConeTowardPlayer as _creatureConeTowardPlayer,
  tilesNovaAroundCreature,
  tilesNovaAtPoint,
  plusTilesAt,
  ringTilesAt,
} from './SpellPatterns.js';
import { didAttackCrit, didAttackMiss, applyCriticalDamage } from './CombatMath.js';
import { getEquippedShield } from './Weapons.js';

/** @typedef {import('../../types.js').Creature} Creature */

/**
 * Build creature ability helpers. Returns the engine-facing orchestration
 * plus helpers (resolveCreatureAbilityTiles / playerInAbilityTiles /
 * applyMultiAttackerPressure / reset+increment of attacker pressure).
 *
 * @param {Record<string, any>} deps
 */
export function setupCreatureAbilities(deps) {
  const {
    scene, player, playerState, tileSize,
    floorAtmosphere,
    isWalkableTile, isWallTile,
    hasRangedLineOfSight,
    getCurrentLevel,
    findCreatureTemplateByTitle,
    findWalkableAdjacentTile,
    spawnSummonFromTemplate,
    showCreatureHealEffect,
    showCreatureSummonEffect,
    showMissSmoke,
    showPlayerHitEffect,
    showPlayerLifeDrainEffect,
    showPlayerManaDrainEffect,
    updatePlayerBar,
    updateHud,
    updateCreatureBar,
    clampIncomingCreatureDamage,
    applyShieldingReduction,
    applyMultiAttackerPressureBase,
    gainShieldingSkillUse,
    triggerPoisonApply,
    triggerElectrifiedApply,
    placeFireFieldAroundPlayer,
    placePoisonFieldAroundPlayer,
  } = deps;

  // ── Mutable turn-scoped state ─────────────────────────────────────
  // Number of distinct attackers that landed a hit this turn. Used by
  // CombatMath's multi-attacker pressure curve.
  let attackersPressureInTurn = 0;
  const resetAttackersPressure = () => { attackersPressureInTurn = 0; };
  const incrementAttackersPressure = () => { attackersPressureInTurn += 1; };
  const getAttackersPressureInTurn = () => attackersPressureInTurn;
  const applyMultiAttackerPressure = (baseDamage) =>
    applyMultiAttackerPressureBase(baseDamage, attackersPressureInTurn);

  // ── Pattern helpers ────────────────────────────────────────────────
  const lineToPlayerFromCreature = (creature, maxLen) =>
    _lineToPlayerFromCreature(creature, playerState.gridX, playerState.gridY, maxLen, isWalkableTile, isWallTile);
  const creatureConeTowardPlayer = (creature, depth) =>
    _creatureConeTowardPlayer(creature, playerState.gridX, playerState.gridY, depth);

  function resolveCreatureAbilityTiles(creature, pattern) {
    if (!pattern || pattern.kind === 'none') return [];
    switch (pattern.kind) {
      case 'player_cell': {
        if (!hasRangedLineOfSight(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) return [];
        return [{ gx: playerState.gridX, gy: playerState.gridY }];
      }
      case 'line_to_player':
        return lineToPlayerFromCreature(creature, pattern.maxLen ?? 8);
      case 'cone_to_player':
        return creatureConeTowardPlayer(creature, pattern.depth ?? 3);
      case 'nova_creature':
        return tilesNovaAroundCreature(creature, pattern.radius ?? 1, true);
      case 'nova_at_player':
        return tilesNovaAtPoint(playerState.gridX, playerState.gridY, pattern.radius ?? 1);
      case 'plus_on_player':
        return plusTilesAt(playerState.gridX, playerState.gridY);
      case 'ring_at_player':
        return ringTilesAt(playerState.gridX, playerState.gridY, pattern.radius ?? 2);
      default:
        if (!hasRangedLineOfSight(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) return [];
        return [{ gx: playerState.gridX, gy: playerState.gridY }];
    }
  }

  const playerInAbilityTiles = (tiles) =>
    (tiles || []).some((t) => t.gx === playerState.gridX && t.gy === playerState.gridY);

  // ── Effect dispatcher ─────────────────────────────────────────────
  function showCreatureAbilityEffect(creature, ability, affectedTiles = null) {
    const style = abilityStyle(ability);
    void affectedTiles;
    const dist = Math.max(Math.abs(creature.gx - playerState.gridX), Math.abs(creature.gy - playerState.gridY));
    const ranged = dist > 1 && !String((ability && ability.name) || '').toLowerCase().includes('melee');
    if (isFireballAbility(ability)) {
      const sizeTiles = fireballSizeTilesForEffect(ability);
      castFireballExplosion(scene, floorAtmosphere, player.x, player.y, sizeTiles);
      return;
    }
    if (ranged && isElementalAbility(ability)) {
      castCreatureSpellVfx(
        scene, floorAtmosphere,
        creature.sprite.x, creature.sprite.y,
        player.x, player.y,
        ability,
      );
      return;
    }
    if (ranged) {
      spellProjectileLine(
        scene,
        creature.sprite.x, creature.sprite.y,
        player.x, player.y,
        style.color, style.glyph,
        () => {
          spellAuraBurst(scene, player.x, player.y, tileSize, style.color, style.glyph, 0.85);
        }
      );
    } else {
      radialSparkBurst(scene, player.x, player.y, style.color, 14);
      spellAuraBurst(scene, player.x, player.y, tileSize, style.color, style.glyph, 0.95);
    }
  }

  // ── Classification ────────────────────────────────────────────────
  function abilityType(ability) {
    const n = String((ability && ability.name) || '').toLowerCase();
    const el = String((ability && ability.element) || '').toLowerCase();
    if (n === 'none' || n.includes('probably other') || n.includes('and more')) return 'utility';
    if (el === 'summon') return 'summon';
    if (el.includes('healing') || n.includes('self-heal') || n.includes('self healing') || (n.includes('self') && n.includes('heal'))) {
      return 'heal';
    }
    if (inferCreatureAbilityPattern(ability).kind === 'none') return 'utility';
    // Narrative "Summons 3 Vampires" / "rarely Summons" strings that
    // don't carry the summon element are still too ambiguous to resolve.
    if (n.includes('summon')) return 'utility';
    if (n.includes('invisib')) return 'utility';
    if (n.includes('melee')) return 'melee';
    return 'offensive';
  }

  // ── The big orchestrator ──────────────────────────────────────────
  function tryUseCreatureAbility(creature) {
    const abilities = Array.isArray(creature && creature.abilities) ? creature.abilities : [];
    if (abilities.length === 0) return false;
    const dist = Math.max(Math.abs(creature.gx - playerState.gridX), Math.abs(creature.gy - playerState.gridY));
    // Each ability advertises its own reach via its pattern. That takes
    // precedence over the creature-level `ranged` flag, so melee bosses
    // (dragons, demons…) still fire their Fire Wave / Fireball / etc.
    const abilityCastRange = (ab, pattern) => {
      const creatureRange = Math.max(1, Number((creature && creature.range) || 1));
      switch (pattern && pattern.kind) {
        case 'line_to_player': return Math.max(creatureRange, Number(pattern.maxLen || 5));
        case 'cone_to_player': return Math.max(creatureRange, Number(pattern.depth || 3) + 2);
        case 'nova_at_player':
        case 'plus_on_player':
        case 'ring_at_player':
        case 'player_cell':    return Math.max(creatureRange, 6);
        case 'nova_creature':  return Math.max(creatureRange, (Number(pattern.radius || 1) + 1));
        default: return creature.ranged ? creatureRange : 1;
      }
    };
    const options = abilities.filter((ab) => {
      const t = abilityType(ab);
      if (t === 'utility') return false;
      if (t === 'heal') return creature.hp < creature.maxHp && Math.random() < 0.5;
      if (t === 'summon') {
        if (creature.isSummon) return false;
        const summonTitle = String(ab.name || '').trim();
        if (!summonTitle) return false;
        if (!findCreatureTemplateByTitle(summonTitle)) return false;
        const maxCount = parseSummonMax(ab);
        const active = Array.isArray(creature.summons)
          ? creature.summons.filter((s) => s && s.alive).length : 0;
        if (active >= maxCount) return false;
        return Math.random() < 0.4;
      }
      if (t === 'melee') return dist <= 1;
      let pattern;
      try { pattern = inferCreatureAbilityPattern(ab); } catch { return false; }
      const range = abilityCastRange(ab, pattern);
      if (dist > range) return false;
      if (!hasRangedLineOfSight(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) return false;
      try {
        const tiles = resolveCreatureAbilityTiles(creature, pattern);
        return playerInAbilityTiles(tiles);
      } catch {
        return false;
      }
    });
    if (options.length === 0) return false;
    const ability = options[Math.floor(Math.random() * options.length)];
    const t = abilityType(ability);
    const pattern = inferCreatureAbilityPattern(ability);
    const abilityTiles = resolveCreatureAbilityTiles(creature, pattern);
    if (t === 'heal') {
      const missing = Math.max(0, Number(creature.maxHp || 0) - Number(creature.hp || 0));
      const rolled = parseAbilityHeal(ability, creature);
      const heal = Math.max(1, Math.min(missing, rolled));
      creature.hp = Math.min(creature.maxHp, creature.hp + heal);
      showCreatureHealEffect(creature, heal);
      updateCreatureBar(creature);
      addCombatLog(`${creature.title} uses ${ability.name} (+${heal} HP).`, LOG_COLORS.SPELL);
      return true;
    }
    if (t === 'summon') {
      const tmpl = findCreatureTemplateByTitle(ability.name);
      if (!tmpl) return false;
      const spot = findWalkableAdjacentTile(creature.gx, creature.gy);
      if (!spot) return false;
      const summoned = spawnSummonFromTemplate(tmpl, spot.gx, spot.gy, creature);
      if (!summoned) return false;
      if (!Array.isArray(creature.summons)) creature.summons = [];
      creature.summons.push(summoned);
      showCreatureSummonEffect(creature, summoned);
      addCombatLog(`${creature.title} summons ${summoned.title}.`, LOG_COLORS.SPELL);
      return true;
    }
    if (!playerInAbilityTiles(abilityTiles)) {
      return false;
    }
    // Hard gate: offensive ranged abilities need clear line of sight.
    if (!hasRangedLineOfSight(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) {
      return false;
    }
    showCreatureAbilityEffect(creature, ability, abilityTiles);
    if (didAttackMiss()) {
      showMissSmoke(player.x, player.y);
      addCombatLog(`${creature.title} uses ${ability.name}, but misses.`);
      return true;
    }
    const base = parseAbilityDamage(ability, creature.maxDamage);
    const floorMultiplier = Phaser.Math.Clamp(1 + ((getCurrentLevel() - 1) * 0.12), 1, 3.5);
    const crit = didAttackCrit();
    const scaledBase = Math.max(1, Math.floor(base * floorMultiplier));
    const rawDamage = crit ? applyCriticalDamage(scaledBase) : scaledBase;
    const pressuredDamage = applyMultiAttackerPressure(rawDamage);
    const dmg = clampIncomingCreatureDamage(pressuredDamage, creature.maxDamage);
    const elNorm = String((ability && ability.element) || '').toLowerCase().replace(/\s+/g, '');
    const isManaDrain = elNorm === 'manadrain';
    const isLifeDrain = elNorm === 'lifedrain';
    const isFireField = elNorm === 'firefield';
    const isPoisonField = elNorm === 'poisonfield';
    const isPoisoned = elNorm === 'poisoned';
    // Fire field: drop a 3×3 field centred on the player's tile.
    if (isFireField) {
      placeFireFieldAroundPlayer();
      addCombatLog(
        `${creature.title} casts ${ability.name} - a fire field surrounds you!`,
        LOG_COLORS.SPELL,
      );
      return true;
    }
    if (isPoisonField) {
      placePoisonFieldAroundPlayer();
      addCombatLog(
        `${creature.title} casts ${ability.name} - a poison cloud surrounds you!`,
        LOG_COLORS.SPELL,
      );
      return true;
    }
    if (isPoisoned) {
      if (!playerState.godMode) triggerPoisonApply(creature.title);
      return true;
    }
    if (elNorm === 'electrified') {
      if (!playerState.godMode) triggerElectrifiedApply(creature.title);
      return true;
    }
    // Mana drain: siphons MP instead of HP. Shielding doesn't apply.
    if (isManaDrain) {
      const maxMp = Math.max(0, Number(playerState.maxMana || 0));
      const available = Math.max(0, Math.min(maxMp, Number(playerState.mana || 0)));
      const mpDrain = playerState.godMode ? 0 : Math.min(available, Math.max(1, dmg));
      if (!playerState.godMode) playerState.mana = Math.max(0, playerState.mana - mpDrain);
      attackersPressureInTurn += 1;
      showPlayerManaDrainEffect(mpDrain, creature.sprite);
      addCombatLog(
        `${creature.title} drains ${mpDrain} mana with ${ability.name}.`,
        LOG_COLORS.SPELL,
      );
      updatePlayerBar();
      updateHud();
      return true;
    }
    const reduced = playerState.godMode ? 0 : applyShieldingReduction(dmg);
    if (!playerState.godMode) playerState.hp = Math.max(0, playerState.hp - reduced);
    attackersPressureInTurn += 1;
    if (reduced < dmg && getEquippedShield()) gainShieldingSkillUse(1);
    if (isLifeDrain) {
      showPlayerLifeDrainEffect(reduced, creature.sprite);
      const heal = Math.max(0, Math.floor(reduced * 0.5));
      if (heal > 0 && creature.hp < creature.maxHp) {
        const applied = Math.min(heal, creature.maxHp - creature.hp);
        creature.hp += applied;
        updateCreatureBar(creature);
        showCreatureHealEffect(creature, applied);
      }
      addCombatLog(
        `${creature.title} drains ${reduced} HP with ${ability.name}.`,
        LOG_COLORS.SPELL,
      );
      return true;
    }
    showPlayerHitEffect(reduced);
    addCombatLog(
      crit
        ? `${creature.title} CRITICAL ${ability.name} for ${dmg}.`
        : `${creature.title} uses ${ability.name} for ${dmg}.`
    );
    return true;
  }

  return {
    tryUseCreatureAbility,
    resolveCreatureAbilityTiles,
    playerInAbilityTiles,
    showCreatureAbilityEffect,
    abilityType,
    applyMultiAttackerPressure,
    resetAttackersPressure,
    incrementAttackersPressure,
    getAttackersPressureInTurn,
    lineToPlayerFromCreature,
    creatureConeTowardPlayer,
  };
}
