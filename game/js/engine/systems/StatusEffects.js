// Player status effects: fire fields, poison fields, burn / poison /
// electrified DoTs, "step on hazard" handlers, and the shared
// applyFireDamage → death path. Owns its own fireFields / poisonFields
// tile Maps so the engine never touches them directly.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

import { floatingCombatText } from '../../rendering/Renderer.js';
import {
  createFireFieldSprite,
  createPoisonFieldSprite,
  deathTextureName,
} from '../../rendering/SpriteFactory.js';
import { addCombatLog, LOG_COLORS } from './CombatLog.js';
import { showDeathSummary } from './DeathSummary.js';
import {
  showPlayerPoisonedEffect,
  showPlayerElectrifiedEffect,
} from './PlayerFx.js';

// ── Tuning constants (formerly inline in startGame() closure) ─────────
export const FIRE_FIELD_DURATION_MS   = 5 * 60 * 1000;
export const FIRE_FIELD_STEP_DAMAGE   = 10;
export const BURN_TICK_INTERVAL_MS    = 10 * 1000;
export const BURN_TICK_DAMAGES        = [10, 8, 6, 4, 2, 1];
export const POISON_FIELD_DURATION_MS = 5 * 60 * 1000;
export const POISON_FIELD_STEP_DAMAGE = 5;
export const POISON_TICK_INTERVAL_MS  = 10 * 1000;
export const POISON_TICK_DAMAGES      = [6, 5, 4, 3, 2, 1];
export const ELECTRIFIED_TICK_INTERVAL_MS = 10 * 1000;
export const ELECTRIFIED_TICK_DAMAGES = [8, 6, 5, 4, 3, 2];

/**
 * @typedef {object} StatusEffectsDeps
 * @property {any} scene
 * @property {any} player
 * @property {any} playerState
 * @property {number} tileSize
 * @property {(gx: number) => number} centerX
 * @property {(gy: number) => number} centerY
 * @property {any} floorAtmosphere
 * @property {any} configPlayer
 * @property {any} deathCaption
 * @property {(gx: number, gy: number) => boolean} isWalkableTile
 * @property {() => number} getCurrentLevel
 * @property {() => void} setGameOver
 * @property {() => void} updatePlayerBar
 * @property {() => void} updateHud
 * @property {(active: boolean) => void} setCombatIndicator
 * @property {(active: boolean) => void} setBurnIndicator
 * @property {(active: boolean) => void} setPoisonIndicator
 * @property {(active: boolean) => void} setElectrifiedIndicator
 */

/**
 * Build the engine-facing status-effects API. Returns every public
 * function as a property on one object so the engine can destructure
 * only what it needs at the call site.
 *
 * @param {StatusEffectsDeps} deps
 */
export function setupStatusEffects(deps) {
  const {
    scene, player, playerState, tileSize, centerX, centerY,
    floorAtmosphere, configPlayer, deathCaption, isWalkableTile,
    getCurrentLevel, setGameOver, updatePlayerBar, updateHud,
    setBurnIndicator, setPoisonIndicator, setElectrifiedIndicator,
  } = deps;

  const fireFields = new Map();
  const poisonFields = new Map();
  const fieldKey = (gx, gy) => `${gx},${gy}`;

  const fxCtx = () => ({ scene, player, playerState, tileSize });

  function destroyFireFieldVisual(ff) {
    if (!ff) return;
    if (ff.sprite) ff.sprite.destroy();
    if (ff.spriteTween && ff.spriteTween.remove) ff.spriteTween.remove();
    if (floorAtmosphere && typeof floorAtmosphere.removeAreaLight === 'function') {
      floorAtmosphere.removeAreaLight(ff.lightId);
    }
  }
  function destroyPoisonFieldVisual(pf) {
    if (!pf) return;
    if (pf.sprite) pf.sprite.destroy();
    if (pf.spriteTween && pf.spriteTween.remove) pf.spriteTween.remove();
    if (floorAtmosphere && typeof floorAtmosphere.removeAreaLight === 'function') {
      floorAtmosphere.removeAreaLight(pf.lightId);
    }
  }

  function addFireFieldTile(gx, gy) {
    if (!isWalkableTile(gx, gy)) return;
    const key = fieldKey(gx, gy);
    const existing = fireFields.get(key);
    if (existing) {
      existing.expiresAt = scene.time.now + FIRE_FIELD_DURATION_MS;
      return;
    }
    const cx = centerX(gx);
    const cy = centerY(gy);
    const sprite = createFireFieldSprite(scene, gx, gy);
    const spriteTween = scene.tweens.add({
      targets: sprite,
      scaleX: { from: sprite.scaleX * 0.95, to: sprite.scaleX * 1.08 },
      scaleY: { from: sprite.scaleY * 1.05, to: sprite.scaleY * 0.94 },
      alpha:  { from: 0.95, to: 0.8 },
      yoyo: true, repeat: -1,
      duration: 320 + Math.random() * 220,
      ease: 'Sine.inOut',
    });
    const lightId = `firefield-${key}-${scene.time.now}`;
    floorAtmosphere.addAreaLight(lightId, cx, cy, 1.8, FIRE_FIELD_DURATION_MS);
    fireFields.set(key, {
      gx, gy,
      expiresAt: scene.time.now + FIRE_FIELD_DURATION_MS,
      sprite, spriteTween, lightId,
    });
  }

  function addPoisonFieldTile(gx, gy) {
    if (!isWalkableTile(gx, gy)) return;
    const key = fieldKey(gx, gy);
    const existing = poisonFields.get(key);
    if (existing) {
      existing.expiresAt = scene.time.now + POISON_FIELD_DURATION_MS;
      return;
    }
    const cx = centerX(gx);
    const cy = centerY(gy);
    const sprite = createPoisonFieldSprite(scene, gx, gy);
    const spriteTween = scene.tweens.add({
      targets: sprite,
      scaleX: { from: sprite.scaleX * 0.96, to: sprite.scaleX * 1.06 },
      scaleY: { from: sprite.scaleY * 1.04, to: sprite.scaleY * 0.96 },
      alpha:  { from: 0.9, to: 0.7 },
      yoyo: true, repeat: -1,
      duration: 520 + Math.random() * 260,
      ease: 'Sine.inOut',
    });
    const lightId = `poisonfield-${key}-${scene.time.now}`;
    floorAtmosphere.addAreaLight(lightId, cx, cy, 1.1, POISON_FIELD_DURATION_MS);
    poisonFields.set(key, {
      gx, gy,
      expiresAt: scene.time.now + POISON_FIELD_DURATION_MS,
      sprite, spriteTween, lightId,
    });
  }

  function cleanupExpiredFireFields(nowMs) {
    if (fireFields.size === 0) return;
    for (const [key, ff] of fireFields) {
      if (nowMs >= ff.expiresAt) {
        destroyFireFieldVisual(ff);
        fireFields.delete(key);
      }
    }
  }

  function cleanupExpiredPoisonFields(nowMs) {
    if (poisonFields.size === 0) return;
    for (const [key, pf] of poisonFields) {
      if (nowMs >= pf.expiresAt) {
        destroyPoisonFieldVisual(pf);
        poisonFields.delete(key);
      }
    }
  }

  // Called on every floor transition: tile-bound hazards belong to the
  // old map and must be removed. Per-player DoT carry over.
  function clearAllFireFields() {
    for (const ff of fireFields.values()) destroyFireFieldVisual(ff);
    fireFields.clear();
    for (const pf of poisonFields.values()) destroyPoisonFieldVisual(pf);
    poisonFields.clear();
    if (floorAtmosphere && typeof floorAtmosphere.clearAreaLights === 'function') {
      floorAtmosphere.clearAreaLights();
    }
  }

  function playerOnFireField() {
    return fireFields.has(fieldKey(playerState.gridX, playerState.gridY));
  }
  function playerOnPoisonField() {
    return poisonFields.has(fieldKey(playerState.gridX, playerState.gridY));
  }

  // Generic HP-loss handler shared across burn / poison / shock /
  // creature abilities. Triggers the death flow if HP reaches 0.
  function applyFireDamage(dmg, killedByTitle) {
    if (playerState.godMode || playerState.dead) return;
    playerState.hp = Math.max(0, playerState.hp - dmg);
    if (playerState.hp <= 0 && !playerState.dead) {
      setGameOver();
      playerState.dead = true;
      if (window.tdGame && typeof window.tdGame.deleteCurrentSave === 'function') {
        window.tdGame.deleteCurrentSave();
      }
      scene.tweens.killTweensOf(player);
      const deathKey = deathTextureName(configPlayer.sex === 'female' ? 'female' : 'male');
      player.setTexture(deathKey);
      player.setAngle(0);
      player.setFlipX(false); player.setFlipY(false);
      player.setScale(1, 1);
      player.setDisplaySize(tileSize, tileSize);
      deathCaption.setPosition(player.x, player.y + tileSize * 0.72);
      deathCaption.setVisible(true);
      addCombatLog('You are dead.');
      scene.time.delayedCall(3000, () => {
        showDeathSummary({
          name: configPlayer.name,
          classKey: configPlayer.classKey,
          sex: configPlayer.sex || 'male',
          floor: getCurrentLevel(),
          kills: playerState.runKills,
          level: playerState.level,
          gold: window.debugInventory ? window.debugInventory.getGold() : 0,
          killedBy: killedByTitle || 'Fire',
        });
      });
    }
  }

  function triggerFireStep() {
    if (playerState.dead) return;
    const dmg = playerState.godMode ? 0 : FIRE_FIELD_STEP_DAMAGE;
    applyFireDamage(dmg, 'Fire Field');
    playerState.burnState = {
      startedAt: scene.time.now,
      nextTickAt: scene.time.now + BURN_TICK_INTERVAL_MS,
      tickIndex: 0,
    };
    setBurnIndicator(true);
    floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${dmg} 🔥`, {
      color: '#ef4444', fontSize: '16px',
    });
    addCombatLog(`You step on fire! -${dmg} HP and burning.`, LOG_COLORS.SPELL);
    updatePlayerBar();
    updateHud();
  }

  function triggerPoisonStep(casterTitle = 'Poison Field') {
    if (playerState.dead) return;
    const dmg = playerState.godMode ? 0 : POISON_FIELD_STEP_DAMAGE;
    applyFireDamage(dmg, casterTitle);
    floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${dmg} ☠`, {
      color: '#4ade80', fontSize: '16px',
    });
    if (!playerState.godMode) triggerPoisonApply(casterTitle);
    updatePlayerBar();
    updateHud();
  }

  function placeFireFieldAroundPlayer() {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        addFireFieldTile(playerState.gridX + dx, playerState.gridY + dy);
      }
    }
    triggerFireStep();
  }

  function placePoisonFieldAroundPlayer() {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        addPoisonFieldTile(playerState.gridX + dx, playerState.gridY + dy);
      }
    }
    triggerPoisonStep();
  }

  function tickBurn(nowMs) {
    if (!playerState.burnState || playerState.dead) return;
    if (nowMs < playerState.burnState.nextTickAt) return;
    if (playerState.burnState.tickIndex >= BURN_TICK_DAMAGES.length) {
      playerState.burnState = null;
      setBurnIndicator(false);
      return;
    }
    const dmg = BURN_TICK_DAMAGES[playerState.burnState.tickIndex];
    applyFireDamage(dmg, 'Burn');
    floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${dmg} 🔥`, {
      color: '#ef4444', fontSize: '14px',
    });
    playerState.burnState.tickIndex += 1;
    playerState.burnState.nextTickAt = nowMs + BURN_TICK_INTERVAL_MS;
    updatePlayerBar();
    updateHud();
  }

  // Poison mirrors burn: periodic ticks with diminishing damage. A new
  // poisoned hit restarts the schedule from the top.
  function triggerPoisonApply(casterTitle) {
    if (playerState.dead) return;
    const alreadyPoisoned = Boolean(playerState.poisonState);
    playerState.poisonState = {
      startedAt: scene.time.now,
      nextTickAt: scene.time.now + POISON_TICK_INTERVAL_MS,
      tickIndex: 0,
    };
    setPoisonIndicator(true);
    showPlayerPoisonedEffect(fxCtx());
    addCombatLog(
      alreadyPoisoned
        ? `${casterTitle || 'Enemy'} refreshes the poison on you.`
        : `${casterTitle || 'Enemy'} poisons you.`,
      LOG_COLORS.SPELL,
    );
  }

  function tickPoison(nowMs) {
    if (!playerState.poisonState || playerState.dead) return;
    if (nowMs < playerState.poisonState.nextTickAt) return;
    if (playerState.poisonState.tickIndex >= POISON_TICK_DAMAGES.length) {
      playerState.poisonState = null;
      setPoisonIndicator(false);
      return;
    }
    const dmg = POISON_TICK_DAMAGES[playerState.poisonState.tickIndex];
    applyFireDamage(dmg, 'Poison');
    floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${dmg} ☠`, {
      color: '#4ade80', fontSize: '14px',
    });
    playerState.poisonState.tickIndex += 1;
    playerState.poisonState.nextTickAt = nowMs + POISON_TICK_INTERVAL_MS;
    updatePlayerBar();
    updateHud();
  }

  function triggerElectrifiedApply(casterTitle) {
    if (playerState.dead) return;
    const already = Boolean(playerState.electrifiedState);
    playerState.electrifiedState = {
      startedAt: scene.time.now,
      nextTickAt: scene.time.now + ELECTRIFIED_TICK_INTERVAL_MS,
      tickIndex: 0,
    };
    setElectrifiedIndicator(true);
    showPlayerElectrifiedEffect(fxCtx());
    addCombatLog(
      already
        ? `${casterTitle || 'Enemy'} refreshes the shock on you.`
        : `${casterTitle || 'Enemy'} electrifies you.`,
      LOG_COLORS.SPELL,
    );
  }

  function tickElectrified(nowMs) {
    if (!playerState.electrifiedState || playerState.dead) return;
    if (nowMs < playerState.electrifiedState.nextTickAt) return;
    if (playerState.electrifiedState.tickIndex >= ELECTRIFIED_TICK_DAMAGES.length) {
      playerState.electrifiedState = null;
      setElectrifiedIndicator(false);
      return;
    }
    const dmg = ELECTRIFIED_TICK_DAMAGES[playerState.electrifiedState.tickIndex];
    applyFireDamage(dmg, 'Shock');
    floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${dmg} ⚡`, {
      color: '#c084fc', fontSize: '14px',
    });
    playerState.electrifiedState.tickIndex += 1;
    playerState.electrifiedState.nextTickAt = nowMs + ELECTRIFIED_TICK_INTERVAL_MS;
    updatePlayerBar();
    updateHud();
  }

  return {
    addFireFieldTile,
    addPoisonFieldTile,
    cleanupExpiredFireFields,
    cleanupExpiredPoisonFields,
    clearAllFireFields,
    placeFireFieldAroundPlayer,
    placePoisonFieldAroundPlayer,
    playerOnFireField,
    playerOnPoisonField,
    applyFireDamage,
    triggerFireStep,
    triggerPoisonStep,
    triggerPoisonApply,
    triggerElectrifiedApply,
    tickBurn,
    tickPoison,
    tickElectrified,
  };
}
