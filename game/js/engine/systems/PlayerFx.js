// Visual effects centred on the player sprite — poisoned drip, shock
// arcs, cyan cure sparkles, life drain arc toward a caster, mana drain
// arc. Pure presentation; no state beyond what's passed in per call.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

import { radialSparkBurst, floatingCombatText } from '../../rendering/Renderer.js';

/**
 * @typedef {object} PlayerFxCtx
 * @property {any} scene             - Phaser this
 * @property {any} player            - Phaser player sprite
 * @property {any} playerState       - createPlayer() object (reads .dead)
 * @property {number} tileSize
 */

/**
 * Green poisoned-drip burst around the player.
 * @param {PlayerFxCtx} ctx
 */
export function showPlayerPoisonedEffect(ctx) {
  const { scene, player, playerState, tileSize } = ctx;
  if (playerState.dead) return;
  radialSparkBurst(scene, player.x, player.y - 4, 0x4ade80, 8);
  for (let i = 0; i < 6; i += 1) {
    const ox = (Math.random() - 0.5) * tileSize * 0.6;
    const oy = (Math.random() - 0.5) * 6;
    const drop = scene.add.circle(player.x + ox, player.y + oy, 2 + Math.random(), 0x16a34a, 0.95);
    drop.setDepth(28);
    scene.tweens.add({
      targets: drop,
      y: drop.y + 8 + Math.random() * 8,
      alpha: 0, scaleX: 0.3, scaleY: 0.3,
      duration: 520 + Math.random() * 200, ease: 'Sine.easeOut',
      onComplete: () => drop.destroy(),
    });
  }
}

/**
 * Blue arc lightning burst + short cyan tint pulse.
 * @param {PlayerFxCtx} ctx
 */
export function showPlayerElectrifiedEffect(ctx) {
  const { scene, player, playerState } = ctx;
  if (playerState.dead) return;
  radialSparkBurst(scene, player.x, player.y - 4, 0x60a5fa, 10);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.random() * 0.3;
    const g = scene.add.graphics();
    g.setDepth(28);
    g.lineStyle(2.2, 0xbfdbfe, 0.95);
    g.beginPath();
    g.moveTo(player.x, player.y);
    const mx = player.x + Math.cos(a) * 10 + (Math.random() - 0.5) * 6;
    const my = player.y + Math.sin(a) * 10 + (Math.random() - 0.5) * 6;
    const tx = player.x + Math.cos(a) * 22;
    const ty = player.y + Math.sin(a) * 22;
    g.lineTo(mx, my);
    g.lineTo(tx, ty);
    g.strokePath();
    scene.tweens.add({
      targets: g, alpha: 0, duration: 240, ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });
  }
  player.setTint(0x60a5fa);
  scene.tweens.add({
    targets: player, alpha: 0.8, yoyo: true, duration: 90,
    onComplete: () => { if (!playerState.dead) { player.clearTint(); player.setAlpha(1); } },
  });
}

/**
 * Cyan sparkles rising off the player — played when a status is cured.
 * @param {PlayerFxCtx} ctx
 */
export function showPlayerCureEffect(ctx) {
  const { scene, player, playerState, tileSize } = ctx;
  if (playerState.dead) return;
  for (let i = 0; i < 10; i += 1) {
    const ox = (Math.random() - 0.5) * tileSize * 0.8;
    const oy = (Math.random() - 0.5) * 6;
    const s = scene.add.circle(player.x + ox, player.y + oy, 1.8 + Math.random() * 1.4, 0x67e8f9, 0.95);
    s.setDepth(28);
    scene.tweens.add({
      targets: s,
      y: s.y - 22 - Math.random() * 10,
      alpha: 0, scaleX: 0.3, scaleY: 0.3,
      duration: 640 + Math.random() * 220, ease: 'Sine.easeOut',
      onComplete: () => s.destroy(),
    });
  }
}

/**
 * Red particles drifting from the player toward a caster sprite, plus
 * a floating "-N HP" over the player. Life-drain abilities call this.
 *
 * @param {PlayerFxCtx} ctx
 * @param {number} amount
 * @param {any | null} casterSprite
 */
export function showPlayerLifeDrainEffect(ctx, amount, casterSprite) {
  const { scene, player, playerState, tileSize } = ctx;
  if (playerState.dead) return;
  radialSparkBurst(scene, player.x, player.y - 4, 0xb91c1c, 10);
  const tx = casterSprite ? casterSprite.x : player.x;
  const ty = casterSprite ? casterSprite.y : player.y - 24;
  for (let i = 0; i < 8; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const ox = Math.cos(a) * 6;
    const oy = Math.sin(a) * 6;
    const p = scene.add.circle(player.x + ox, player.y + oy, 2.2, 0x7f1d1d, 0.95);
    p.setDepth(28);
    scene.tweens.add({
      targets: p, x: tx, y: ty,
      alpha: 0, scaleX: 0.3, scaleY: 0.3,
      duration: 460 + Math.random() * 180, delay: i * 28,
      ease: 'Sine.easeIn',
      onComplete: () => p.destroy(),
    });
  }
  floatingCombatText(scene, player.x, player.y - tileSize * 0.65, `-${amount} HP`, {
    color: '#ef4444', fontSize: '17px',
  });
}

/**
 * Same as life-drain but blue particles + "-N MP" floating text.
 *
 * @param {PlayerFxCtx} ctx
 * @param {number} amount
 * @param {any | null} casterSprite
 */
export function showPlayerManaDrainEffect(ctx, amount, casterSprite) {
  const { scene, player, playerState, tileSize } = ctx;
  if (playerState.dead) return;
  radialSparkBurst(scene, player.x, player.y - 4, 0x60a5fa, 10);
  const tx = casterSprite ? casterSprite.x : player.x;
  const ty = casterSprite ? casterSprite.y : player.y - 24;
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const ox = Math.cos(a) * 6;
    const oy = Math.sin(a) * 6;
    const p = scene.add.circle(player.x + ox, player.y + oy, 2.2, 0x93c5fd, 0.95);
    p.setDepth(28);
    scene.tweens.add({
      targets: p, x: tx, y: ty,
      alpha: 0, scaleX: 0.3, scaleY: 0.3,
      duration: 520 + Math.random() * 200, delay: i * 26,
      ease: 'Sine.easeIn',
      onComplete: () => p.destroy(),
    });
  }
  if (!playerState.dead) {
    player.setTint(0x60a5fa);
    scene.tweens.add({
      targets: player, alpha: 0.75, yoyo: true, duration: 120,
      onComplete: () => { if (!playerState.dead) { player.clearTint(); player.setAlpha(1); } },
    });
  }
  floatingCombatText(scene, player.x, player.y - tileSize * 0.5, `-${amount} MP`, {
    color: '#93c5fd', fontSize: '16px',
  });
}
