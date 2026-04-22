// Floating-text visual effects - scene-bound splash effects that play when
// the player eats/drinks/levels up. Each function creates short-lived
// Phaser objects (text, circles) with tweens; nothing is returned - the
// tweens destroy their targets on completion.
//
// Extracted from game.engine.js Phase 4. These are pure presentation:
// the engine decides WHEN to trigger; this module decides HOW the effect
// looks. All functions take the scene + a small ctx of player sprite refs
// they need for positioning.
//
// ctx shape (same for eat/drink/fullFood):
//   { player, tileSize, basePlayerScaleX, basePlayerScaleY, isActive }
// `isActive()` → false when the player died/the game ended between the
// effect's start and its tween completion. Used to skip the base-scale
// restore so the death animation's final pose is preserved.
//
// Level-up effects only need the scene.

import {
  radialSparkBurst,
  shockwaveRing,
} from '../../rendering/Renderer.js';

/**
 * @typedef {object} FloatingFxCtx
 * @property {any} player                          - Phaser player sprite
 * @property {number} tileSize
 * @property {number} basePlayerScaleX
 * @property {number} basePlayerScaleY
 * @property {() => boolean} [isActive]            - false after player death mid-tween
 */

/**
 * @param {any} scene
 * @param {FloatingFxCtx} ctx
 * @param {string} label
 */
export function showEatEffect(scene, ctx, label) {
  const { player, tileSize, basePlayerScaleX, basePlayerScaleY, isActive } = ctx;
  shockwaveRing(scene, player.x, player.y, 0x4ade80, { startR: 8, endScale: 2.1, duration: 280 });
  radialSparkBurst(scene, player.x, player.y - 2, 0x86efac, 16);
  player.setTint(0x86efac);
  scene.tweens.add({
    targets: player,
    scaleX: basePlayerScaleX * 1.08,
    scaleY: basePlayerScaleY * 1.08,
    yoyo: true,
    duration: 120,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!isActive || isActive()) player.setScale(basePlayerScaleX, basePlayerScaleY);
      player.clearTint();
    },
  });
  for (let i = 0; i < 7; i += 1) {
    const spark = scene.add.circle(
      player.x + Phaser.Math.Between(-10, 10),
      player.y - tileSize * 0.55 + Phaser.Math.Between(-8, 8),
      Phaser.Math.Between(2, 5),
      0xa7f3d0,
      0.92
    );
    spark.setDepth(120);
    scene.tweens.add({
      targets: spark,
      y: spark.y - Phaser.Math.Between(16, 28),
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
  const txt = scene.add.text(player.x, player.y - tileSize * 0.95, `EAT ${label || ''}`.trim(), {
    color: '#bbf7d0',
    fontSize: '14px',
    fontStyle: 'bold',
  });
  txt.setOrigin(0.5, 0.5);
  txt.setDepth(121);
  txt.setStroke('#14532d', 3);
  scene.tweens.add({
    targets: txt,
    y: txt.y - 18,
    alpha: 0,
    duration: 560,
    ease: 'Sine.easeOut',
    onComplete: () => txt.destroy(),
  });
}

/**
 * @param {any} scene
 * @param {FloatingFxCtx} ctx
 * @param {string} label
 * @param {string} [color]
 */
export function showDrinkEffect(scene, ctx, label, color = '#7dd3fc') {
  const { player, tileSize } = ctx;
  shockwaveRing(scene, player.x, player.y, 0x38bdf8, { startR: 6, endScale: 2.4, duration: 300 });
  radialSparkBurst(scene, player.x, player.y, 0x7dd3fc, 12);
  player.setTintFill(0x60a5fa);
  scene.tweens.add({
    targets: player,
    alpha: 0.85,
    yoyo: true,
    duration: 100,
    repeat: 1,
    ease: 'Sine.easeOut',
    onComplete: () => {
      player.setAlpha(1);
      player.clearTint();
    },
  });
  const txt = scene.add.text(player.x, player.y - tileSize * 0.95, label, {
    color,
    fontSize: '14px',
    fontStyle: 'bold',
  });
  txt.setOrigin(0.5, 0.5);
  txt.setDepth(121);
  txt.setStroke('#0c4a6e', 3);
  scene.tweens.add({
    targets: txt,
    y: txt.y - 18,
    alpha: 0,
    duration: 580,
    ease: 'Sine.easeOut',
    onComplete: () => txt.destroy(),
  });
}

/**
 * @param {any} scene
 * @param {FloatingFxCtx} ctx
 */
export function showFullFoodEffect(scene, ctx) {
  const { player, tileSize, basePlayerScaleX, basePlayerScaleY, isActive } = ctx;
  player.setTint(0xfbbf24);
  scene.tweens.add({
    targets: player,
    scaleX: basePlayerScaleX * 1.1,
    scaleY: basePlayerScaleY * 1.1,
    yoyo: true,
    repeat: 1,
    duration: 90,
    ease: 'Sine.easeOut',
    onComplete: () => {
      if (!isActive || isActive()) player.setScale(basePlayerScaleX, basePlayerScaleY);
      player.clearTint();
    },
  });
  const full = scene.add.text(player.x, player.y - tileSize * 0.95, 'FULL', {
    color: '#fde047',
    fontSize: '16px',
    fontStyle: 'bold',
  });
  full.setOrigin(0.5, 0.5);
  full.setDepth(121);
  full.setStroke('#713f12', 4);
  full.setShadow(0, 0, '#fbbf24', 12, true, true);
  scene.tweens.add({
    targets: full,
    y: full.y - 22,
    alpha: 0,
    duration: 680,
    ease: 'Cubic.easeOut',
    onComplete: () => full.destroy(),
  });
}

/** @param {any} scene */
export function showLevelUpText(scene) {
  const cx = scene.scale.width / 2;
  const cy = scene.scale.height / 2;
  const glow = scene.add.circle(cx, cy, 80, 0xfbbf24, 0.12);
  glow.setScrollFactor(0);
  glow.setDepth(600);
  scene.tweens.add({
    targets: glow,
    alpha: 0,
    scaleX: 2.2,
    scaleY: 2.2,
    duration: 700,
    ease: 'Sine.easeOut',
    onComplete: () => glow.destroy(),
  });
  const txt = scene.add.text(cx, cy, 'LEVEL UP!', {
    color: '#fffbeb',
    fontSize: '58px',
    fontStyle: 'bold',
    fontFamily: 'Segoe UI Black, Segoe UI, system-ui, sans-serif',
  });
  txt.setOrigin(0.5, 0.5);
  txt.setStroke('#78350f', 10);
  txt.setShadow(0, 0, '#fbbf24', 28, true, true);
  txt.setScrollFactor(0);
  txt.setDepth(601);
  scene.tweens.add({
    targets: txt,
    y: txt.y - 36,
    alpha: 0,
    scaleX: 1.12,
    scaleY: 1.12,
    duration: 1000,
    ease: 'Cubic.easeOut',
    onComplete: () => txt.destroy(),
  });
}

/**
 * @param {any} scene
 * @param {string} label
 * @param {number} level
 */
export function showSkillLevelUpText(scene, label, level) {
  const txt = scene.add.text(scene.scale.width / 2, 88, `${label} +1 (Lv ${level})`, {
    color: '#bbf7d0',
    fontSize: '22px',
    fontStyle: 'bold',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  });
  txt.setOrigin(0.5, 0.5);
  txt.setScrollFactor(0);
  txt.setDepth(620);
  txt.setStroke('#052e16', 5);
  txt.setShadow(0, 0, '#34d399', 14, true, true);
  const glow = scene.add.circle(scene.scale.width / 2, 88, 40, 0x34d399, 0.18);
  glow.setScrollFactor(0);
  glow.setDepth(619);
  scene.tweens.add({
    targets: glow,
    alpha: 0,
    scaleX: 2.1,
    scaleY: 2.1,
    duration: 520,
    ease: 'Sine.easeOut',
    onComplete: () => glow.destroy(),
  });
  radialSparkBurst(scene, scene.scale.width / 2, 88, 0x34d399, 12);
  scene.tweens.add({
    targets: txt,
    y: txt.y - 16,
    alpha: 0,
    duration: 760,
    ease: 'Cubic.easeOut',
    onComplete: () => txt.destroy(),
  });
}
