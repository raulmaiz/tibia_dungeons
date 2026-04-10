/**
 * Shared Phaser VFX helpers — combat feedback, spells, projectiles.
 * Keeps visual logic out of main.js while matching scene coordinates (world space).
 */

export const FX_DEPTH = 120;
export const FX_DEPTH_PROJECTILE = 125;

/**
 * @param {Phaser.Scene} scene
 * @param {number} durationMs
 * @param {number} intensity — Phaser shake magnitude (pixels scale)
 */
export function shakeCamera(scene, durationMs = 90, intensity = 0.0045) {
  const cam = scene.cameras.main;
  if (!cam || typeof cam.shake !== 'function') return;
  cam.shake(durationMs, intensity);
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} durationMs
 * @param {number} r
 * @param {number} g
 * @param {number} b
 */
export function flashCamera(scene, durationMs = 120, r = 255, g = 90, b = 90) {
  const cam = scene.cameras.main;
  if (!cam || typeof cam.flash !== 'function') return;
  cam.flash(durationMs, r, g, b, false);
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} color — 0xRRGGBB
 * @param {number} count
 */
export function radialSparkBurst(scene, x, y, color, count = 14) {
  for (let i = 0; i < count; i += 1) {
    const ang = (Math.PI * 2 * i) / count + Phaser.Math.FloatBetween(-0.15, 0.15);
    const dist = Phaser.Math.Between(10, 22);
    const r = Phaser.Math.Between(2, 5);
    const spark = scene.add.circle(x, y, r, color, 0.95);
    spark.setDepth(FX_DEPTH);
    const tx = x + Math.cos(ang) * dist;
    const ty = y + Math.sin(ang) * dist;
    scene.tweens.add({
      targets: spark,
      x: tx,
      y: ty,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: Phaser.Math.Between(220, 380),
      ease: 'Cubic.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
}

/**
 * Expanding ring for impacts and auras.
 */
export function shockwaveRing(scene, x, y, color, opts = {}) {
  const startR = opts.startR ?? 8;
  const endScale = opts.endScale ?? 2.4;
  const duration = opts.duration ?? 280;
  const ring = scene.add.circle(x, y, startR, color, 0.15);
  ring.setStrokeStyle(3, color, 0.95);
  ring.setDepth(FX_DEPTH);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scaleX: endScale,
    scaleY: endScale,
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/**
 * Floating combat number with optional crit styling.
 */
export function floatingCombatText(scene, x, y, text, opts = {}) {
  const {
    color = '#ff8b8b',
    fontSize = '17px',
    crit = false,
    depth = FX_DEPTH + 2,
  } = opts;
  const t = scene.add.text(x, y - 4, text, {
    color,
    fontSize: crit ? `${parseInt(fontSize, 10) + 4}px` : fontSize,
    fontStyle: 'bold',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  });
  t.setOrigin(0.5, 0.5);
  t.setDepth(depth);
  if (crit) {
    t.setColor('#fff1a6');
    t.setStroke('#7f1d1d', 5);
    t.setShadow(0, 0, '#fbbf24', 12, true, true);
  } else {
    t.setStroke('#1a0a0a', 4);
    t.setShadow(0, 2, '#000000', 6, true, false);
  }
  scene.tweens.add({
    targets: t,
    y: t.y - (crit ? 28 : 22),
    alpha: 0,
    scaleX: crit ? 1.12 : 1.05,
    scaleY: crit ? 1.12 : 1.05,
    duration: crit ? 520 : 400,
    ease: 'Cubic.easeOut',
    onComplete: () => t.destroy(),
  });
}

/**
 * Spell / ability tile burst (replaces simple rect + glyph).
 */
export function tileSpellBurst(scene, x, y, tileSize, color, opts = {}) {
  const duration = opts.duration != null ? opts.duration : 320;
  const glyphChar = opts.glyph != null ? opts.glyph : '✦';
  const glyphColor = opts.glyphColor != null ? opts.glyphColor : '#fff7ed';

  const outer = scene.add.circle(x, y, tileSize * 0.52, color, 0.14);
  outer.setDepth(FX_DEPTH);
  scene.tweens.add({
    targets: outer,
    alpha: 0,
    scaleX: 1.55,
    scaleY: 1.55,
    duration: duration + 80,
    ease: 'Sine.easeOut',
    onComplete: () => outer.destroy(),
  });

  const diamond = scene.add.rectangle(x, y, tileSize * 0.82, tileSize * 0.82, color, 0.38);
  diamond.setStrokeStyle(2, color, 1);
  diamond.setAngle(45);
  diamond.setDepth(FX_DEPTH + 1);
  scene.tweens.add({
    targets: diamond,
    alpha: 0,
    scaleX: 1.22,
    scaleY: 1.22,
    angle: diamond.angle + 12,
    duration,
    ease: 'Cubic.easeOut',
    onComplete: () => diamond.destroy(),
  });

  radialSparkBurst(scene, x, y, color, 10);

  const slash = scene.add.text(x, y, glyphChar, {
    color: glyphColor,
    fontSize: '18px',
    fontStyle: 'bold',
  });
  slash.setOrigin(0.5, 0.5);
  slash.setDepth(FX_DEPTH + 2);
  slash.setShadow(0, 0, glyphColor, 8, true, true);
  scene.tweens.add({
    targets: slash,
    alpha: 0,
    y: slash.y - 14,
    scaleX: 1.25,
    scaleY: 1.25,
    duration: duration + 40,
    ease: 'Sine.easeOut',
    onComplete: () => slash.destroy(),
  });
}

/**
 * Caster / target aura for spells.
 */
export function spellAuraBurst(scene, x, y, tileSize, color, glyph, scale = 1) {
  const baseR = Math.max(10, tileSize * 0.26 * scale);
  shockwaveRing(scene, x, y, color, { startR: baseR * 0.6, endScale: 2.1, duration: 260 });
  const ring2 = scene.add.circle(x, y, baseR, color, 0.22);
  ring2.setStrokeStyle(2, color, 0.9);
  ring2.setDepth(FX_DEPTH);
  scene.tweens.add({
    targets: ring2,
    alpha: 0,
    scaleX: 1.55,
    scaleY: 1.55,
    duration: 340,
    ease: 'Sine.easeOut',
    onComplete: () => ring2.destroy(),
  });
  radialSparkBurst(scene, x, y, color, 8);
  const g = scene.add.text(x, y, glyph, {
    color: '#f8fafc',
    fontSize: `${Math.floor(15 * scale)}px`,
    fontStyle: 'bold',
  });
  g.setOrigin(0.5, 0.5);
  g.setDepth(FX_DEPTH + 2);
  g.setShadow(0, 0, '#ffffff', 10, true, true);
  scene.tweens.add({
    targets: g,
    alpha: 0,
    y: g.y - 10,
    duration: 340,
    ease: 'Sine.easeOut',
    onComplete: () => g.destroy(),
  });
}

/**
 * Spell projectile from point to point with motion blur sparks.
 */
export function spellProjectileLine(scene, x0, y0, x1, y1, colorHex, glyph, onComplete) {
  const hex = typeof colorHex === 'number' ? `#${colorHex.toString(16).padStart(6, '0')}` : colorHex;
  const shot = scene.add.text(x0, y0 - 4, glyph, {
    color: hex,
    fontSize: '18px',
    fontStyle: 'bold',
  });
  shot.setOrigin(0.5, 0.5);
  shot.setDepth(FX_DEPTH_PROJECTILE);
  shot.setShadow(0, 0, hex, 14, true, true);
  const dur = 175;
  let tick = 0;
  scene.tweens.add({
    targets: shot,
    x: x1,
    y: y1 - 4,
    duration: dur,
    ease: 'Cubic.easeIn',
    onUpdate: () => {
      tick += 1;
      if (tick % 2 !== 0) return;
      const ember = scene.add.circle(shot.x, shot.y, Phaser.Math.Between(2, 4), colorHex, 0.75);
      ember.setDepth(FX_DEPTH_PROJECTILE - 1);
      scene.tweens.add({
        targets: ember,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 200,
        ease: 'Sine.easeOut',
        onComplete: () => ember.destroy(),
      });
    },
    onComplete: () => {
      shot.destroy();
      if (typeof onComplete === 'function') onComplete();
    },
  });
}

/**
 * Ranged weapon shot (arrow / bolt style).
 */
export function rangedProjectileLine(scene, x0, y0, x1, y1, visual, duration = 155) {
  const shot = scene.add.text(x0, y0 - 4, visual.glyph, {
    color: visual.color,
    fontSize: `${visual.size}px`,
    fontStyle: 'bold',
  });
  shot.setOrigin(0.5, 0.5);
  shot.setDepth(FX_DEPTH_PROJECTILE);
  shot.setShadow(0, 0, visual.color, 8, true, true);
  scene.tweens.add({
    targets: shot,
    x: x1,
    y: y1 - 4,
    duration,
    ease: 'Cubic.easeIn',
    onComplete: () => shot.destroy(),
  });
}

/**
 * Miss: dissolving shards + label.
 */
export function missEffect(scene, x, y, tileSize) {
  const puffs = [
    { dx: -9, dy: -5, r: 8 },
    { dx: 0, dy: -9, r: 9 },
    { dx: 9, dy: -4, r: 8 },
    { dx: -4, dy: 4, r: 7 },
    { dx: 5, dy: 5, r: 7 },
  ];
  for (const puff of puffs) {
    const cloud = scene.add.circle(x + puff.dx, y + puff.dy, puff.r, 0xb8c0cc, 0.45);
    cloud.setDepth(FX_DEPTH);
    scene.tweens.add({
      targets: cloud,
      y: cloud.y - 14,
      alpha: 0,
      scaleX: 1.35,
      scaleY: 1.35,
      duration: 300,
      ease: 'Sine.easeOut',
      onComplete: () => cloud.destroy(),
    });
  }
  const miss = scene.add.text(x, y - tileSize * 0.75, 'MISS', {
    color: '#e2e8f0',
    fontSize: '15px',
    fontStyle: 'bold',
    fontFamily: 'Segoe UI, system-ui, sans-serif',
  });
  miss.setOrigin(0.5, 0.5);
  miss.setDepth(FX_DEPTH + 1);
  miss.setStroke('#0f172a', 4);
  scene.tweens.add({
    targets: miss,
    y: miss.y - 18,
    alpha: 0,
    duration: 380,
    ease: 'Cubic.easeOut',
    onComplete: () => miss.destroy(),
  });
}

/**
 * Crit banner text.
 */
export function critBanner(scene, x, y, tileSize) {
  const crit = scene.add.text(x, y - tileSize * 0.92, 'CRIT!', {
    color: '#fff7ed',
    fontSize: '16px',
    fontStyle: 'bold',
    fontFamily: 'Segoe UI Black, Segoe UI, sans-serif',
  });
  crit.setOrigin(0.5, 0.5);
  crit.setDepth(FX_DEPTH + 3);
  crit.setStroke('#991b1b', 5);
  crit.setShadow(0, 0, '#fbbf24', 16, true, true);
  scene.tweens.add({
    targets: crit,
    y: crit.y - 26,
    alpha: 0,
    scaleX: 1.15,
    scaleY: 1.15,
    duration: 720,
    ease: 'Cubic.easeOut',
    onComplete: () => crit.destroy(),
  });
  shakeCamera(scene, 110, 0.014);
}
