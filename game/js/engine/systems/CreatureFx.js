// Creature-centred visual effects: death (sprite collapse + dark ring +
// smoke), summon (purple rune + portal + pop-in), heal (green ring +
// sparkles + "+" glyph). Pure presentation — they mutate the sprite's
// display state but not gameplay HP / alive flags.
//
// Extracted from game.engine.js Phase 4 (Combat prep).

import { floatingCombatText } from '../../rendering/Renderer.js';
import { applyCreatureSize } from '../../rendering/SpriteFactory.js';
import { bus, EVENTS } from '../../core/EventBus.js';

/** @typedef {import('../../types.js').Creature} Creature */

/**
 * @typedef {object} CreatureFxCtx
 * @property {any} scene
 * @property {number} tileSize
 */

/**
 * Emits ENTITY_DIED then plays the sprite-collapse animation. Safe to
 * call with a creature whose sprite has already been destroyed (the
 * bus event still fires, the sprite step is skipped).
 *
 * @param {CreatureFxCtx} ctx
 * @param {Creature | null} creature
 */
export function playCreatureDeathEffect(ctx, creature) {
  const { scene, tileSize } = ctx;
  if (creature) {
    bus.emit(EVENTS.ENTITY_DIED, {
      id: creature.id,
      title: creature.title,
      gx: creature.gx,
      gy: creature.gy,
      sprite: creature.sprite || null,
    });
  }
  if (!creature || !creature.sprite || !creature.sprite.scene) {
    if (creature && creature.sprite) creature.sprite.setVisible(false);
    return;
  }
  const sprite = creature.sprite;
  const cx = sprite.x;
  const cy = sprite.y;
  // Dark ground ring — reads as "something hit the floor".
  const ring = scene.add.graphics();
  ring.setDepth(5);
  ring.lineStyle(2, 0x0f172a, 0.75);
  ring.strokeEllipse(cx, cy + tileSize * 0.22, tileSize * 0.55, tileSize * 0.22);
  scene.tweens.add({
    targets: ring,
    scaleX: 1.7, scaleY: 0.9,
    alpha: 0,
    duration: 440, ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
  // Rising dark smoke puffs so the disappearance has weight.
  for (let i = 0; i < 5; i += 1) {
    const ox = (Math.random() - 0.5) * tileSize * 0.5;
    const oy = (Math.random() - 0.5) * 4;
    const smoke = scene.add.circle(cx + ox, cy + oy, 2 + Math.random() * 2, 0x475569, 0.75);
    smoke.setDepth(16);
    scene.tweens.add({
      targets: smoke,
      y: smoke.y - 14 - Math.random() * 10,
      alpha: 0,
      scaleX: 1.8, scaleY: 1.8,
      duration: 520 + Math.random() * 160, ease: 'Sine.easeOut',
      onComplete: () => smoke.destroy(),
    });
  }
  // The sprite collapses: red tint + tilt + shrink + fade.
  sprite.setTint(0x991b1b);
  const tiltDir = Math.random() < 0.5 ? -1 : 1;
  scene.tweens.killTweensOf(sprite);
  scene.tweens.add({
    targets: sprite,
    angle: tiltDir * 22,
    scaleX: sprite.scaleX * 0.6,
    scaleY: sprite.scaleY * 0.6,
    alpha: 0,
    duration: 420, ease: 'Cubic.easeIn',
    onComplete: () => {
      if (!sprite || !sprite.scene) return;
      sprite.setVisible(false);
      sprite.clearTint();
      sprite.setAngle(0);
      sprite.setAlpha(1);
    },
  });
}

/**
 * Purple rune on the summoner + portal at the target + arc of sparks +
 * pop-in scale bounce on the summoned creature.
 *
 * @param {CreatureFxCtx} ctx
 * @param {Creature | null} caster
 * @param {Creature | null} summoned
 */
export function showCreatureSummonEffect(ctx, caster, summoned) {
  const { scene } = ctx;
  if (!caster || !summoned) return;
  const sx = caster.sprite.x;
  const sy = caster.sprite.y;
  const tx = summoned.sprite.x;
  const ty = summoned.sprite.y;
  // Purple rune circle expanding on the summoner.
  const rune = scene.add.circle(sx, sy, 8, 0x7c3aed, 0);
  rune.setStrokeStyle(2, 0xa855f7, 0.9);
  rune.setDepth(27);
  scene.tweens.add({
    targets: rune, scaleX: 2.8, scaleY: 2.8, alpha: 0,
    duration: 520, ease: 'Quad.easeOut',
    onComplete: () => rune.destroy(),
  });
  // Dark vortex at the summon target tile.
  const portal = scene.add.circle(tx, ty, 14, 0x3b0764, 0.7);
  portal.setDepth(14);
  scene.tweens.add({
    targets: portal, scaleX: 2.2, scaleY: 0.6, alpha: 0,
    duration: 560, ease: 'Sine.easeOut',
    onComplete: () => portal.destroy(),
  });
  // Arc of purple sparks from caster to target.
  const arcSteps = 8;
  for (let i = 0; i < arcSteps; i += 1) {
    const t = i / arcSteps;
    const px = sx + (tx - sx) * t + (Math.random() - 0.5) * 6;
    const py = sy + (ty - sy) * t - Math.sin(t * Math.PI) * 16;
    scene.time.delayedCall(Math.floor(t * 220), () => {
      const dot = scene.add.circle(px, py, 2.4, 0xc084fc, 0.95);
      dot.setDepth(28);
      scene.tweens.add({
        targets: dot, alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 320, ease: 'Sine.easeOut',
        onComplete: () => dot.destroy(),
      });
    });
  }
  // Pop-in bounce on the summoned sprite.
  summoned.sprite.setAlpha(0);
  summoned.sprite.setScale((summoned.sprite.scaleX || 1) * 0.4, (summoned.sprite.scaleY || 1) * 0.4);
  scene.tweens.add({
    targets: summoned.sprite,
    alpha: 1,
    scaleX: summoned.sprite.scaleX * (1 / 0.4),
    scaleY: summoned.sprite.scaleY * (1 / 0.4),
    duration: 260, ease: 'Back.easeOut',
    onComplete: () => applyCreatureSize(summoned.sprite),
  });
}

/**
 * Green ring + glow + rising sparkles + "+" glyph + bounce on the
 * healed creature. Float "+N" above.
 *
 * @param {CreatureFxCtx} ctx
 * @param {Creature | null} creature
 * @param {number} healAmount
 */
export function showCreatureHealEffect(ctx, creature, healAmount) {
  const { scene, tileSize } = ctx;
  if (!creature || !creature.sprite || !creature.sprite.scene) return;
  const x = creature.sprite.x;
  const y = creature.sprite.y;
  // Expanding green ring.
  const ring = scene.add.circle(x, y, 6, 0x22c55e, 0);
  ring.setStrokeStyle(2, 0x4ade80, 0.9);
  ring.setDepth(27);
  scene.tweens.add({
    targets: ring,
    scaleX: 3.5, scaleY: 3.5, alpha: 0,
    duration: 560, ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
  // Soft green glow under the creature.
  const glow = scene.add.circle(x, y, 14, 0x34d399, 0.45);
  glow.setDepth(26);
  scene.tweens.add({
    targets: glow,
    scaleX: 1.8, scaleY: 1.8, alpha: 0,
    duration: 520, ease: 'Sine.easeOut',
    onComplete: () => glow.destroy(),
  });
  // Rising sparkles.
  for (let i = 0; i < 8; i += 1) {
    const ox = (Math.random() - 0.5) * tileSize * 0.7;
    const oy = tileSize * 0.2 + (Math.random() - 0.5) * 4;
    const spark = scene.add.circle(x + ox, y + oy, 1.8 + Math.random() * 1.6, 0x86efac, 0.95);
    spark.setDepth(28);
    scene.tweens.add({
      targets: spark,
      y: spark.y - 16 - Math.random() * 12,
      alpha: 0, scaleX: 0.35, scaleY: 0.35,
      duration: 700 + Math.random() * 260, ease: 'Sine.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
  // Floating "+" cross glyph.
  const plus = scene.add.text(x, y - tileSize * 0.35, '✚', {
    fontSize: '22px',
    color: '#bbf7d0',
    fontStyle: 'bold',
  });
  plus.setOrigin(0.5, 0.5);
  plus.setDepth(29);
  plus.setShadow(0, 0, '#22c55e', 10, true, true);
  scene.tweens.add({
    targets: plus,
    y: plus.y - tileSize * 0.4,
    scaleX: 1.4, scaleY: 1.4, alpha: 0,
    duration: 620, ease: 'Sine.easeOut',
    onComplete: () => plus.destroy(),
  });
  // Brief green sprite tint + gentle bounce so the target is unambiguous.
  creature.sprite.setTint(0x4ade80);
  scene.tweens.add({
    targets: creature.sprite,
    scaleX: creature.sprite.scaleX * 1.08,
    scaleY: creature.sprite.scaleY * 1.08,
    yoyo: true,
    duration: 140,
    ease: 'Sine.easeOut',
    onComplete: () => {
      creature.sprite.clearTint();
      applyCreatureSize(creature.sprite);
    },
  });
  floatingCombatText(scene, x, y - tileSize * 0.65, `+${healAmount}`, {
    color: '#34d399',
    fontSize: '18px',
  });
}
