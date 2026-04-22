// Scene-bound visual effects for combat: projectile glyphs, ammo impacts,
// crit banner, miss smoke, player-hit flash, creature-hit flash.
//
// Pure presentation — the engine decides WHEN to trigger, this module
// decides HOW the effect looks. Every function takes the scene + a small
// ctx (player sprite refs, tileSize, callbacks) so nothing captures the
// engine closure.
//
// Extracted from game.engine.js Phase 4 (Combat prep). No deps bag, no
// setup call — import and call per effect.

import {
  radialSparkBurst,
  shockwaveRing,
  spellProjectileLine,
  spellAuraBurst,
  rangedProjectileLine,
  floatingCombatText,
  critBanner,
  missEffect,
} from '../../rendering/Renderer.js';
import { isMagicRangedWeapon } from './Weapons.js';

/** @typedef {import('../../types.js').Item} Item */
/** @typedef {import('../../types.js').Creature} Creature */

/**
 * @typedef {object} PlayerHitFxCtx
 * @property {any} player                          - Phaser player sprite
 * @property {number} tileSize
 * @property {number} basePlayerScaleX
 * @property {number} basePlayerScaleY
 * @property {() => boolean} [isActive]            - false once dead/over
 * @property {() => void} [onBarUpdate]            - engine's updatePlayerBar
 */

/**
 * @typedef {object} CreatureHitFxCtx
 * @property {number} tileSize
 * @property {(gx: number) => number} centerX
 * @property {(gy: number) => number} centerY
 * @property {(sprite: any) => void} applyCreatureSize
 * @property {(c: Creature) => void} [onBarUpdate]
 */

/**
 * @typedef {object} RangedProjectileCtx
 * @property {any} player                          - Phaser player sprite
 * @property {number} tileSize
 * @property {{ addAreaLight: (id: string, x: number, y: number, r: number, d: number) => void }} floorAtmosphere
 */

// Per-ammo projectile/impact visuals. Keyed by lowercase title.
export const AMMO_VISUALS = {
  'simple arrow':      { glyph: '➵', color: '#a8a29e', size: 14, impact: null },
  'arrow':             { glyph: '➵', color: '#f59e0b', size: 14, impact: null },
  'poison arrow':      { glyph: '➵', color: '#4ade80', size: 14, impact: 'poison' },
  'burst arrow':       { glyph: '➵', color: '#f97316', size: 16, impact: 'explosion' },
  'sniper arrow':      { glyph: '➵', color: '#38bdf8', size: 15, impact: 'ice' },
  'diamond arrow':     { glyph: '◇', color: '#e0f2fe', size: 16, impact: 'diamond' },
  'crystalline arrow': { glyph: '◇', color: '#a78bfa', size: 15, impact: 'crystal' },
  'onyx arrow':        { glyph: '➵', color: '#1e1b4b', size: 15, impact: 'dark' },
  'earth arrow':       { glyph: '➵', color: '#84cc16', size: 14, impact: 'earth' },
  'flaming arrow':     { glyph: '➵', color: '#ef4444', size: 15, impact: 'fire' },
  'shiver arrow':      { glyph: '➵', color: '#7dd3fc', size: 15, impact: 'ice' },
  'flash arrow':       { glyph: '➵', color: '#facc15', size: 15, impact: 'energy' },
  'envenomed arrow':   { glyph: '➵', color: '#22c55e', size: 14, impact: 'poison' },
  'tarsal arrow':      { glyph: '➵', color: '#d97706', size: 14, impact: 'earth' },
  'power arrow':       { glyph: '➵', color: '#dc2626', size: 15, impact: 'fire' },
  'bolt':              { glyph: '✦', color: '#d4d4d8', size: 14, impact: null },
  'power bolt':        { glyph: '✦', color: '#ef4444', size: 15, impact: 'fire' },
  'piercing bolt':     { glyph: '✦', color: '#60a5fa', size: 15, impact: 'ice' },
  'infernal bolt':     { glyph: '✦', color: '#dc2626', size: 16, impact: 'explosion' },
  'spectral bolt':     { glyph: '✦', color: '#c084fc', size: 16, impact: 'energy' },
  'vortex bolt':       { glyph: '✦', color: '#818cf8', size: 15, impact: 'energy' },
  'prismatic bolt':    { glyph: '✦', color: '#f0abfc', size: 15, impact: 'crystal' },
  'drill bolt':        { glyph: '✦', color: '#a3a3a3', size: 14, impact: 'earth' },
};

/**
 * Pick the projectile visual for a ranged attack. Falls back through
 * title keywords (ethereal spear, star, knife) → equipped ammo →
 * weapon type (crossbow / bow / throwing) → generic dot.
 *
 * @param {Item | null} weapon
 * @param {Item | null} ammo    - engine passes getEquippedAmmo() result
 * @returns {{ glyph: string, color: string, size: number, impact?: string | null }}
 */
export function projectileVisualForWeapon(weapon, ammo) {
  const title = String((weapon && weapon.title) || '').toLowerCase();
  const itemType = String((weapon && weapon.item_type) || '').toLowerCase();
  const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
  if (itemType === 'wands') return { glyph: '✦', color: '#a78bfa', size: 18 };
  if (itemType === 'rods') return { glyph: '✧', color: '#60a5fa', size: 18 };
  if (title.includes('ethereal spear')) return { glyph: '➤', color: '#7dd3fc', size: 18 };
  if (title.includes('star')) return { glyph: '✶', color: '#fde047', size: 16 };
  if (title.includes('knife')) return { glyph: '†', color: '#e5e7eb', size: 16 };
  if (title.includes('spear')) return { glyph: '➤', color: '#f8fafc', size: 16 };
  if (title.includes('snowball')) return { glyph: '●', color: '#f8fafc', size: 14 };
  if (title.includes('stone')) return { glyph: '●', color: '#cbd5e1', size: 14 };
  if (ammo) {
    const ammoVisual = AMMO_VISUALS[String(ammo.title || '').toLowerCase()];
    if (ammoVisual) return ammoVisual;
  }
  if (secondary.includes('crossbow')) return { glyph: '✦', color: '#f59e0b', size: 14 };
  if (secondary.includes('bow')) return { glyph: '➵', color: '#f59e0b', size: 14 };
  if (secondary.includes('throwing')) return { glyph: '◆', color: '#e2e8f0', size: 14 };
  return { glyph: '•', color: '#f8fafc', size: 14 };
}

/**
 * Ammo-specific impact VFX at the target tile. Branches on impactType
 * ('explosion' | 'fire' | 'poison' | 'ice' | 'energy' | 'earth' |
 *  'diamond' | 'crystal' | 'dark'). No-op for falsy impactType.
 *
 * @param {any} scene
 * @param {number} tx
 * @param {number} ty
 * @param {string | null | undefined} impactType
 */
export function showAmmoImpactEffect(scene, tx, ty, impactType) {
  if (!impactType) return;
  if (impactType === 'explosion') {
    const ring = scene.add.circle(tx, ty, 4, 0xf97316, 0.8);
    ring.setDepth(20);
    scene.tweens.add({ targets: ring, scaleX: 3, scaleY: 3, alpha: 0, duration: 350, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    radialSparkBurst(scene, tx, ty, 0xef4444, 14);
    radialSparkBurst(scene, tx, ty, 0xfbbf24, 8);
  } else if (impactType === 'fire') {
    radialSparkBurst(scene, tx, ty, 0xef4444, 10);
    const flame = scene.add.circle(tx, ty - 4, 3, 0xf97316, 0.7);
    flame.setDepth(20);
    scene.tweens.add({ targets: flame, y: ty - 18, alpha: 0, scaleX: 2, scaleY: 2, duration: 400, ease: 'Sine.easeOut', onComplete: () => flame.destroy() });
  } else if (impactType === 'poison') {
    radialSparkBurst(scene, tx, ty, 0x4ade80, 10);
    for (let i = 0; i < 3; i++) {
      const drop = scene.add.circle(tx + (Math.random() - 0.5) * 16, ty + (Math.random() - 0.5) * 8, 2, 0x22c55e, 0.8);
      drop.setDepth(20);
      scene.tweens.add({ targets: drop, y: drop.y + 10, alpha: 0, duration: 500 + i * 100, onComplete: () => drop.destroy() });
    }
  } else if (impactType === 'ice') {
    radialSparkBurst(scene, tx, ty, 0x7dd3fc, 10);
    const frost = scene.add.circle(tx, ty, 5, 0xbae6fd, 0.6);
    frost.setDepth(20);
    scene.tweens.add({ targets: frost, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => frost.destroy() });
  } else if (impactType === 'energy') {
    radialSparkBurst(scene, tx, ty, 0xfacc15, 12);
    const bolt = scene.add.circle(tx, ty, 3, 0xfde68a, 0.9);
    bolt.setDepth(20);
    scene.tweens.add({ targets: bolt, scaleX: 3, scaleY: 0.5, alpha: 0, duration: 250, ease: 'Sine.easeOut', onComplete: () => bolt.destroy() });
  } else if (impactType === 'earth') {
    radialSparkBurst(scene, tx, ty, 0x84cc16, 8);
    for (let i = 0; i < 4; i++) {
      const rock = scene.add.circle(tx + (Math.random() - 0.5) * 14, ty + (Math.random() - 0.5) * 14, 2 + Math.random(), 0x65a30d, 0.7);
      rock.setDepth(20);
      scene.tweens.add({ targets: rock, y: rock.y + 8, alpha: 0, duration: 350 + i * 80, onComplete: () => rock.destroy() });
    }
  } else if (impactType === 'diamond' || impactType === 'crystal') {
    const color = impactType === 'diamond' ? 0xe0f2fe : 0xa78bfa;
    radialSparkBurst(scene, tx, ty, color, 12);
    const shard = scene.add.star(tx, ty, 4, 3, 8, color, 0.9);
    shard.setDepth(20);
    scene.tweens.add({ targets: shard, angle: 90, scaleX: 2, scaleY: 2, alpha: 0, duration: 400, ease: 'Quad.easeOut', onComplete: () => shard.destroy() });
  } else if (impactType === 'dark') {
    radialSparkBurst(scene, tx, ty, 0x6366f1, 10);
    const void_ = scene.add.circle(tx, ty, 6, 0x1e1b4b, 0.8);
    void_.setDepth(20);
    scene.tweens.add({ targets: void_, scaleX: 2, scaleY: 2, alpha: 0, duration: 500, ease: 'Cubic.easeOut', onComplete: () => void_.destroy() });
  }
}

/**
 * @param {any} scene
 * @param {number} x
 * @param {number} y
 * @param {number} tileSize
 */
export function showCritText(scene, x, y, tileSize) {
  critBanner(scene, x, y, tileSize);
}

/**
 * @param {any} scene
 * @param {number} x
 * @param {number} y
 * @param {number} tileSize
 */
export function showMissSmoke(scene, x, y, tileSize) {
  missEffect(scene, x, y, tileSize);
}

/**
 * Player-hit flash: spark burst + shockwave + red tint + scale yoyo +
 * floating -N damage label.
 *
 * @param {any} scene
 * @param {PlayerHitFxCtx} ctx
 * @param {number} dmg
 */
export function showPlayerHitEffect(scene, ctx, dmg) {
  const { player, tileSize, basePlayerScaleX, basePlayerScaleY, isActive, onBarUpdate } = ctx;
  if (isActive && !isActive()) return;
  radialSparkBurst(scene, player.x, player.y - 4, 0xff6b6b, 12);
  shockwaveRing(scene, player.x, player.y, 0xff5555, { startR: 10, endScale: 2, duration: 220 });
  player.setTint(0xff4d4d);
  scene.tweens.add({
    targets: player,
    scaleX: basePlayerScaleX * 1.1,
    scaleY: basePlayerScaleY * 1.1,
    yoyo: true,
    duration: 80,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!isActive || isActive()) {
        player.setScale(basePlayerScaleX, basePlayerScaleY);
      }
      player.clearTint();
      if (onBarUpdate) onBarUpdate();
    },
  });
  floatingCombatText(scene, player.x, player.y - tileSize * 0.65, `-${dmg}`, {
    color: '#ff9b9b',
    fontSize: '17px',
  });
}

/**
 * Creature-hit flash: spark burst + red tint + scale yoyo + floating -N
 * damage. Resets ally-tint after yoyo if the creature was convinced.
 *
 * @param {any} scene
 * @param {CreatureHitFxCtx} ctx
 * @param {Creature} creature
 * @param {number} dmg
 */
export function showCreatureHitEffect(scene, ctx, creature, dmg) {
  if (!creature || !creature.sprite || !creature.sprite.scene) return;
  const { tileSize, centerX, centerY, applyCreatureSize, onBarUpdate } = ctx;
  radialSparkBurst(scene, creature.sprite.x, creature.sprite.y - 4, 0xff6b6b, 10);
  creature.sprite.setTint(0xff4d4d);
  scene.tweens.add({
    targets: creature.sprite,
    scaleX: creature.sprite.scaleX * 1.1,
    scaleY: creature.sprite.scaleY * 1.1,
    yoyo: true,
    duration: 80,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!creature.sprite || !creature.sprite.scene) return;
      creature.sprite.clearTint();
      if (creature.isConvinced) creature.sprite.setTint(0x88ffaa);
      applyCreatureSize(creature.sprite);
      creature.sprite.x = centerX(creature.gx);
      creature.sprite.y = centerY(creature.gy);
      if (onBarUpdate) onBarUpdate(creature);
    },
  });
  floatingCombatText(scene, creature.sprite.x, creature.sprite.y - tileSize * 0.65, `-${dmg}`, {
    color: '#ff9b9b',
    fontSize: '17px',
  });
}

/**
 * Ranged projectile flight + impact. Magic wand/rod uses spellProjectile
 * + aura burst; physical ranged uses rangedProjectileLine + a brief area
 * light + ammo-specific impact effect.
 *
 * @param {any} scene
 * @param {RangedProjectileCtx} ctx
 * @param {Item | null} weapon
 * @param {Creature} target
 * @param {Item | null} ammo
 */
export function showRangedProjectileEffect(scene, ctx, weapon, target, ammo) {
  if (!weapon || !target || !target.sprite) return;
  const { player, tileSize, floorAtmosphere } = ctx;
  const visual = projectileVisualForWeapon(weapon, ammo);
  if (isMagicRangedWeapon(weapon)) {
    const colorHex = Number(String(visual.color || '#a78bfa').replace('#', '0x'));
    spellProjectileLine(scene, player.x, player.y, target.sprite.x, target.sprite.y, colorHex, visual.glyph, () => {
      spellAuraBurst(scene, target.sprite.x, target.sprite.y, tileSize, colorHex, visual.glyph, 0.9);
    });
    return;
  }
  rangedProjectileLine(scene, player.x, player.y, target.sprite.x, target.sprite.y, visual, 150);
  scene.time.delayedCall(150, () => {
    if (!target.sprite || !target.sprite.scene) return;
    const ix = target.sprite.x;
    const iy = target.sprite.y;
    const lightId = `impact_${Date.now()}_${Math.random()}`;
    floorAtmosphere.addAreaLight(lightId, ix, iy, 1.5, 800);
    const colorHex = Number(String(visual.color || '#f59e0b').replace('#', '0x'));
    const flash = scene.add.circle(ix, iy, tileSize * 0.3, colorHex, 0.4);
    flash.setDepth(4);
    scene.tweens.add({
      targets: flash, scaleX: 1.8, scaleY: 1.8, alpha: 0,
      duration: 350, ease: 'Quad.easeOut', onComplete: () => flash.destroy(),
    });
    if (visual.impact) showAmmoImpactEffect(scene, ix, iy, visual.impact);
  });
}
