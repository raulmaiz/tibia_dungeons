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
 * Unified combat-feedback typography. Every floating number in the game —
 * damage, heal, drain, DoT ticks — should go through this helper so they
 * all share weight, outline, shadow, and the subtle overshoot-on-spawn that
 * makes the HUD feel alive.
 */
const COMBAT_FONT_BLACK = 'Segoe UI Black, Segoe UI, system-ui, sans-serif';

export function floatingCombatText(scene, x, y, text, opts = {}) {
  const {
    color = '#f87171',
    fontSize = '18px',
    crit = false,
    depth = FX_DEPTH + 2,
  } = opts;
  const basePx = parseInt(fontSize, 10);
  const t = scene.add.text(x, y - 4, text, {
    color: crit ? '#fde047' : color,
    fontSize: `${crit ? basePx + 10 : basePx}px`,
    fontFamily: COMBAT_FONT_BLACK,
  });
  t.setOrigin(0.5, 1);
  t.setDepth(depth);
  t.setStroke(crit ? '#7f1d1d' : '#0a0a0a', crit ? 6 : 4);
  t.setShadow(0, 2, 'rgba(0,0,0,0.85)', 6, false, true);
  if (crit) t.setShadow(0, 0, '#fbbf24', 20, true, true);
  t.setScale(0.55);
  t.setAlpha(0);
  // Two-stage: pop-in with overshoot, hold briefly, then drift upward + fade.
  scene.tweens.chain({
    targets: t,
    tweens: [
      { scale: 1, alpha: 1, duration: crit ? 200 : 150, ease: 'Back.easeOut' },
      { y: t.y - (crit ? 34 : 26), alpha: 0, duration: crit ? 560 : 440, ease: 'Cubic.easeIn' },
    ],
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
 * Miss indicator. Single clean "MISS" label with a quick horizontal slash
 * behind it — no particle cloud, no camera effect. Reads as "glancing blow".
 */
export function missEffect(scene, x, y, tileSize) {
  const baseY = y - tileSize * 0.75;
  const slash = scene.add.rectangle(x, baseY + 2, 46, 2, 0xcbd5e1, 0.9);
  slash.setDepth(FX_DEPTH);
  slash.setScale(0.1, 1);
  scene.tweens.chain({
    targets: slash,
    tweens: [
      { scaleX: 1, duration: 120, ease: 'Cubic.easeOut' },
      { alpha: 0, duration: 220, ease: 'Sine.easeOut' },
    ],
    onComplete: () => slash.destroy(),
  });
  const miss = scene.add.text(x, baseY, 'MISS', {
    color: '#e2e8f0',
    fontSize: '14px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  miss.setOrigin(0.5, 1);
  miss.setStroke('#0f172a', 4);
  miss.setShadow(0, 2, 'rgba(0,0,0,0.8)', 5, false, true);
  miss.setDepth(FX_DEPTH + 1);
  miss.setScale(0.5);
  miss.setAlpha(0);
  scene.tweens.chain({
    targets: miss,
    tweens: [
      { scale: 1, alpha: 1, duration: 140, ease: 'Back.easeOut' },
      { alpha: 0, y: miss.y - 18, duration: 340, ease: 'Cubic.easeIn' },
    ],
    onComplete: () => miss.destroy(),
  });
}

/**
 * Crit banner — big "CRITICAL" over the target with a radial gold ring,
 * starburst sparks and a scale pop. No camera shake (reserved for more
 * meaningful events to stay readable).
 */
export function critBanner(scene, x, y, tileSize) {
  const anchorY = y - tileSize * 0.5;
  // Expanding gold ring.
  const ring = scene.add.circle(x, anchorY, 12, 0xfbbf24, 0);
  ring.setStrokeStyle(2, 0xfde047, 1);
  ring.setDepth(FX_DEPTH);
  scene.tweens.add({
    targets: ring,
    scaleX: 4.5, scaleY: 4.5, alpha: 0,
    duration: 460, ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
  // Inner golden flash.
  const flash = scene.add.circle(x, anchorY, 14, 0xfde68a, 0.9);
  flash.setDepth(FX_DEPTH);
  scene.tweens.add({
    targets: flash,
    scaleX: 2.4, scaleY: 2.4, alpha: 0,
    duration: 260, ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });
  radialSparkBurst(scene, x, anchorY, 0xfde047, 12);
  // CRITICAL text.
  const crit = scene.add.text(x, y - tileSize * 0.95, 'CRITICAL', {
    color: '#fef3c7',
    fontSize: '19px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  crit.setOrigin(0.5, 0.5);
  crit.setStroke('#78350f', 6);
  crit.setShadow(0, 0, '#fbbf24', 20, true, true);
  crit.setDepth(FX_DEPTH + 3);
  crit.setScale(0.35);
  crit.setAlpha(0);
  scene.tweens.chain({
    targets: crit,
    tweens: [
      { scale: 1.2, alpha: 1, duration: 180, ease: 'Back.easeOut' },
      { scale: 1, duration: 100, ease: 'Sine.easeInOut' },
      { y: crit.y - 16, alpha: 0, duration: 520, ease: 'Cubic.easeIn' },
    ],
    onComplete: () => crit.destroy(),
  });
}

/**
 * Full-screen level-up banner: horizontal gold streak, "LEVEL" label,
 * oversized number, "UP!" kicker, and radial sparks. Screen-space, centred.
 */
export function levelUpBanner(scene, level) {
  const cam = scene.cameras.main;
  const cx = cam.width / 2;
  const cy = cam.height / 2;
  // Thin horizontal streak that expands outwards.
  const streakH = 3;
  const streak = scene.add.rectangle(cx, cy, 40, streakH, 0xfde047, 0.9);
  streak.setScrollFactor(0);
  streak.setDepth(598);
  streak.setAlpha(0);
  scene.tweens.chain({
    targets: streak,
    tweens: [
      { alpha: 0.85, scaleX: Math.max(8, cam.width / 40 * 0.72), duration: 300, ease: 'Cubic.easeOut' },
      { alpha: 0, duration: 520, ease: 'Sine.easeIn' },
    ],
    onComplete: () => streak.destroy(),
  });
  // Soft rect halo behind the number for contrast against any background.
  const halo = scene.add.rectangle(cx, cy, 280, 110, 0x78350f, 0.0);
  halo.setScrollFactor(0);
  halo.setDepth(599);
  scene.tweens.chain({
    targets: halo,
    tweens: [
      { fillAlpha: 0.35, duration: 180, ease: 'Sine.easeOut' },
      { fillAlpha: 0, duration: 820, ease: 'Sine.easeIn' },
    ],
    onComplete: () => halo.destroy(),
  });
  // "LEVEL" small label
  const label = scene.add.text(cx, cy - 38, 'LEVEL', {
    color: '#fef3c7',
    fontSize: '20px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  label.setOrigin(0.5, 0.5);
  label.setStroke('#78350f', 4);
  label.setShadow(0, 0, '#fbbf24', 10, true, true);
  label.setScrollFactor(0);
  label.setDepth(601);
  label.setAlpha(0);
  // Big number
  const num = scene.add.text(cx, cy + 6, String(level), {
    color: '#fffbeb',
    fontSize: '80px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  num.setOrigin(0.5, 0.5);
  num.setStroke('#78350f', 10);
  num.setShadow(0, 0, '#fbbf24', 30, true, true);
  num.setScrollFactor(0);
  num.setDepth(601);
  num.setScale(0.3);
  num.setAlpha(0);
  // "UP!" kicker
  const up = scene.add.text(cx, cy + 58, 'UP!', {
    color: '#fef3c7',
    fontSize: '22px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  up.setOrigin(0.5, 0.5);
  up.setStroke('#78350f', 4);
  up.setShadow(0, 0, '#fbbf24', 10, true, true);
  up.setScrollFactor(0);
  up.setDepth(601);
  up.setAlpha(0);
  radialSparkBurst(scene, cx, cy, 0xfde047, 18);
  // Labels fade in together, number pops with overshoot, everything drifts + fades out.
  scene.tweens.add({
    targets: [label, up],
    alpha: 1,
    duration: 200, delay: 60,
    ease: 'Sine.easeOut',
  });
  scene.tweens.chain({
    targets: num,
    tweens: [
      { scale: 1.08, alpha: 1, duration: 220, ease: 'Back.easeOut' },
      { scale: 1, duration: 110, ease: 'Sine.easeInOut' },
      { y: num.y - 22, alpha: 0, duration: 720, delay: 260, ease: 'Cubic.easeIn' },
    ],
    onComplete: () => num.destroy(),
  });
  scene.tweens.add({
    targets: [label, up],
    alpha: 0, y: '-=16',
    duration: 620, delay: 540,
    ease: 'Cubic.easeIn',
    onComplete: () => { label.destroy(); up.destroy(); },
  });
}

/**
 * Compact banner for a skill level-up. Appears at the top of the viewport
 * as a pill with icon + label + "Lv N". Colour keyed to the stat family.
 */
export function skillUpBanner(scene, label, level, color = 0x34d399) {
  const cam = scene.cameras.main;
  const cx = cam.width / 2;
  const cy = Math.max(70, cam.height * 0.12);
  const pillH = 36;
  const pillW = Math.min(360, Math.max(220, label.length * 10 + 80));
  const pill = scene.add.rectangle(cx, cy, pillW, pillH, color, 0.22);
  pill.setStrokeStyle(1, color, 0.9);
  pill.setScrollFactor(0);
  pill.setDepth(619);
  pill.setScale(0.5, 1);
  pill.setAlpha(0);
  const t = scene.add.text(cx, cy, `${label}   Lv ${level}`, {
    color: '#ecfdf5',
    fontSize: '15px',
    fontFamily: COMBAT_FONT_BLACK,
  });
  t.setOrigin(0.5, 0.5);
  t.setStroke('#052e16', 4);
  const hex = color.toString(16).padStart(6, '0');
  t.setShadow(0, 0, `#${hex}`, 10, true, true);
  t.setScrollFactor(0);
  t.setDepth(620);
  t.setAlpha(0);
  radialSparkBurst(scene, cx, cy, color, 10);
  scene.tweens.add({
    targets: pill,
    alpha: 1, scaleX: 1,
    duration: 220, ease: 'Back.easeOut',
  });
  scene.tweens.add({
    targets: t,
    alpha: 1,
    duration: 220, ease: 'Sine.easeOut',
  });
  scene.tweens.add({
    targets: [pill, t],
    alpha: 0, y: '-=10',
    duration: 520, delay: 620, ease: 'Cubic.easeIn',
    onComplete: () => { pill.destroy(); t.destroy(); },
  });
}
