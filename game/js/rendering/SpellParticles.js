// Phaser-native spell VFX — the 2D port of the abandoned 3D look
// (three-nebula bursts + meshline beams + UnrealBloom). No Three.js:
// Phaser's built-in particle emitter gives the radial colour-over-life
// bursts, ADD blend gives the additive "magic" glow, a stretched
// additive sprite gives the projectile beam, and the camera's built-in
// Bloom postFX gives the soft global halo.
//
// Public API (re-exported through Renderer.js, the canonical VFX seam):
//   initSpellFx(scene, { bloom })   — once on scene create
//   setSpellBloom(scene, on)        — toggle the soft global bloom
//   spellElementKey(spell)          — spell → preset key
//   spawnSpellBurst(scene, x, y, element, count?)
//   spawnSpellBeam(scene, x1, y1, x2, y2, element)

const SPARK_KEY = 'spell_spark';

// Per-element burst presets, ported from the 3D three-nebula table.
// colors: tint ramp over a particle's life (A → B). gravityY < 0 floats
// up (fire/holy/heal), > 0 falls (earth). Speeds/scales tuned for px.
const PRESETS = {
  fire:     { colors: [0xff5500, 0xfdba74], n: 24, life: [600, 1400], speed: [40, 150], scale: [0.50, 0.04], gravityY: -80 },
  ice:      { colors: [0x7dd3fc, 0xbfe9ff], n: 22, life: [700, 1600], speed: [35, 115], scale: [0.48, 0.05], gravityY: -10 },
  energy:   { colors: [0xa78bfa, 0xd7c8ff], n: 24, life: [550, 1200], speed: [55, 175], scale: [0.48, 0.04], gravityY: 0 },
  earth:    { colors: [0x4a7320, 0x9bd64a], n: 22, life: [650, 1350], speed: [30, 105], scale: [0.50, 0.06], gravityY: 130 },
  death:    { colors: [0x9aa3b2, 0x2a2030], n: 20, life: [900, 1800], speed: [18, 65],  scale: [0.55, 0.10], gravityY: -16 },
  holy:     { colors: [0xfde047, 0xfff4c2], n: 22, life: [700, 1500], speed: [35, 110], scale: [0.48, 0.05], gravityY: -55 },
  healing:  { colors: [0x86efac, 0xd9ffe6], n: 22, life: [750, 1600], speed: [25, 90],  scale: [0.48, 0.05], gravityY: -80 },
  physical: { colors: [0xffffff, 0xfbbf24], n: 20, life: [500, 1050], speed: [45, 130], scale: [0.44, 0.05], gravityY: -18 },
};

/** Spell → preset key, mirrors spellFxProfile's element detection. */
export function spellElementKey(spell) {
  const element = String((spell && spell.raw && spell.raw.element) || '').toLowerCase();
  const title = String((spell && spell.title) || '').toLowerCase();
  if (element.includes('fire')   || title.includes('flame') || title.includes('fire'))  return 'fire';
  if (element.includes('ice')    || title.includes('ice')   || title.includes('frigo')) return 'ice';
  if (element.includes('energy') || title.includes('energy')|| title.includes('vis'))   return 'energy';
  if (element.includes('earth')  || title.includes('terra'))                            return 'earth';
  if (element.includes('holy')   || title.includes('divine')|| title.includes('san'))   return 'holy';
  if (element.includes('death')  || title.includes('mort'))                             return 'death';
  if (title.includes('heal')     || title.includes('exura'))                            return 'healing';
  return 'energy';
}

// Reverse map for the AoE path, which only has the spellFxProfile colour.
const ELEMENT_BY_PROFILE_COLOR = {
  0xfb7185: 'fire', 0x93c5fd: 'ice', 0xa78bfa: 'energy', 0x86efac: 'earth',
  0xfde68a: 'holy', 0xc4b5fd: 'death', 0x60a5fa: 'healing', 0x7dd3fc: 'energy',
};
export function elementKeyFromColor(color) {
  return ELEMENT_BY_PROFILE_COLOR[Number(color)] || 'energy';
}

function resolvePreset(element) {
  return PRESETS[String(element || '').toLowerCase()] || PRESETS.physical;
}

// Soft radial-gradient white dot — tinted additively per element. Built
// once per texture manager; reused by every burst and beam.
function ensureSparkTexture(scene) {
  if (scene.textures.exists(SPARK_KEY)) return;
  const size = 32;
  const canvasTex = scene.textures.createCanvas(SPARK_KEY, size, size);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  canvasTex.refresh();
}

function getFxState(scene) {
  if (!scene.__spellFx) scene.__spellFx = { emitters: new Map(), bloom: null, layer: null };
  return scene.__spellFx;
}

// All spell VFX live on a dedicated Layer so the bloom can be applied to the
// LAYER, not the whole camera. The 3D UnrealBloomPass used a high luminance
// threshold (0.92) so only the bright additive spells glowed, never the dark
// dungeon. A bloom-on-layer reproduces that selectivity: the layer is empty
// except where spells are, so only the magic blooms — the floor stays crisp.
function ensureLayer(scene) {
  const fx = getFxState(scene);
  if (!fx.layer) fx.layer = scene.add.layer().setDepth(60);
  return fx.layer;
}

// One reusable, idle emitter per element (created lazily). explode() fires
// a one-shot batch; Phaser pools the particles so casts stay cheap.
function getEmitter(scene, element) {
  ensureSparkTexture(scene);
  const fx = getFxState(scene);
  if (fx.emitters.has(element)) return fx.emitters.get(element);
  const p = resolvePreset(element);
  const emitter = scene.add.particles(0, 0, SPARK_KEY, {
    lifespan: { min: p.life[0], max: p.life[1] },
    speed: { min: p.speed[0], max: p.speed[1] },
    angle: { min: 0, max: 360 },
    scale: { start: p.scale[0] * 1.32, end: p.scale[1] },
    alpha: { start: 0.7, end: 0 },
    gravityY: p.gravityY || 0,
    color: p.colors,
    colorEase: 'quad.out',
    blendMode: 'ADD',
    emitting: false,
  });
  ensureLayer(scene).add(emitter); // depth handled by the layer
  fx.emitters.set(element, emitter);
  return emitter;
}

/**
 * Toggle the spell bloom (WebGL only). Applied to the VFX layer when the
 * runtime supports layer postFX (selective glow, like the 3D threshold);
 * falls back to a milder camera bloom otherwise.
 */
export function setSpellBloom(scene, on) {
  const fx = getFxState(scene);
  const layer = ensureLayer(scene);
  const cam = scene.cameras && scene.cameras.main;
  const onLayer = layer && layer.postFX;
  const target = onLayer ? layer : (cam && cam.postFX ? cam : null);
  if (!target || !target.postFX) return false; // canvas renderer / no postFX
  if (on) {
    if (!fx.bloom) {
      // addBloom(color, offsetX, offsetY, blurStrength, strength, steps).
      // On the layer we can push hard (only magic glows); on the camera we
      // stay subtle so the whole scene isn't washed out.
      fx.bloom = onLayer
        ? target.postFX.addBloom(0xffffff, 1, 1, 1.3, 1.0, 6)
        : target.postFX.addBloom(0xffffff, 1, 1, 1, 0.45, 4);
    }
    fx.bloom.active = true;
  } else if (fx.bloom) {
    fx.bloom.active = false;
  }
  return Boolean(on);
}

/** Call once on scene create. Builds the spark texture + (optional) bloom. */
export function initSpellFx(scene, opts = {}) {
  ensureSparkTexture(scene);
  ensureLayer(scene);
  if (opts.bloom !== false) setSpellBloom(scene, true);
}

/** One-shot radial particle burst at a world point. */
export function spawnSpellBurst(scene, x, y, element = 'physical', count) {
  if (!scene) return;
  const p = resolvePreset(element);
  const emitter = getEmitter(scene, element);
  emitter.explode(Math.max(1, Math.round(count || p.n)), x, y);
}

/** Glowing additive beam from caster to target (meshline replacement). */
export function spawnSpellBeam(scene, x1, y1, x2, y2, element = 'physical') {
  if (!scene) return;
  ensureSparkTexture(scene);
  const p = resolvePreset(element);
  const color = p.colors[0];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  // Two stacked stretched sparks: a wide soft halo + a thin bright core.
  const vfxLayer = ensureLayer(scene);
  const addBeam = (thickness, alpha) => {
    const s = scene.add.image(x1, y1, SPARK_KEY).setOrigin(0, 0.5);
    s.setRotation(ang);
    s.setDisplaySize(len, thickness);
    s.setTint(color);
    s.setBlendMode(Phaser.BlendModes.ADD);
    s.setAlpha(alpha);
    vfxLayer.add(s); // on the VFX layer so it blooms with the bursts
    scene.tweens.add({ targets: s, alpha: 0, duration: 220, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
  };
  addBeam(18, 0.45); // soft outer glow
  addBeam(6, 0.95);  // bright core
}

/**
 * Cohesive area effect (the 3D "modern AoE" look) for a set of affected
 * world points. Three layers, NO flat per-tile diamonds:
 *   1. a soft ground decal (energy field) over the whole footprint
 *   2. an expanding shockwave ring from the centroid
 *   3. a particle cloud spread across the footprint with the 3D anti-grid
 *      tricks — off-centre jitter + staggered "wave" timing + scale variance
 * so it reads as one area of magic, not a grid of tiles.
 *
 * @param {any} scene
 * @param {Array<{x:number,y:number}>} worldPts  affected tile centres (px)
 * @param {string} element
 * @param {number} tileSize
 */
export function spawnSpellArea(scene, worldPts, element = 'physical', tileSize = 48, opts = {}) {
  if (!scene || !worldPts || worldPts.length === 0) return;
  ensureSparkTexture(scene);
  const p = resolvePreset(element);
  const layer = ensureLayer(scene);
  const isBeam = Boolean(opts.beam);
  const ordered = Boolean(opts.ordered);
  const stepMs = Number(opts.stepMs) || 22;
  // Density boost per shape: novas get the +25% "tralla"; cones (waves) cover
  // far fewer tiles so they need a bigger multiplier to read as rich.
  const boost = opts.kind === 'cone' ? 2.8 : opts.kind === 'nova' ? 1.25 : 1.3;

  // Centroid + footprint radius.
  let cx = 0; let cy = 0;
  for (const pt of worldPts) { cx += pt.x; cy += pt.y; }
  cx /= worldPts.length; cy /= worldPts.length;
  let maxR = tileSize * 0.6;
  for (const pt of worldPts) maxR = Math.max(maxR, Math.hypot(pt.x - cx, pt.y - cy) + tileSize * 0.6);

  if (isBeam && worldPts.length >= 2) {
    // Straight-line spell (energy/death beam): a glowing beam along the line
    // instead of a circular field. worldPts are sorted caster→far.
    const a = worldPts[0];
    const b = worldPts[worldPts.length - 1];
    spawnSpellBeam(scene, a.x, a.y, b.x, b.y, element);
  } else {
    // Area spell (cone / nova): a subtle camera kick for impact, a bright
    // central flash, and a soft ground field that flares then lingers.

    // Impact kick — intensity scales with the area size, capped + brief so
    // rapid casting never turns into a nauseating constant shake.
    const cam = scene.cameras && scene.cameras.main;
    if (cam && cam.shake) cam.shake(150, Math.min(0.006, maxR * 0.000022));

    // Central flash — the bright "pop" at cast.
    const flash = scene.add.image(cx, cy, SPARK_KEY).setOrigin(0.5);
    flash.setDisplaySize(maxR * 0.65, maxR * 0.65);
    flash.setTint(p.colors[0]);
    flash.setBlendMode(Phaser.BlendModes.ADD);
    flash.setAlpha(0.6);
    layer.add(flash);
    scene.tweens.add({
      targets: flash, alpha: 0, scaleX: flash.scaleX * 2.2, scaleY: flash.scaleY * 2.2,
      duration: 300, ease: 'Quad.easeOut', onComplete: () => flash.destroy(),
    });

    // Ground field — a soft tinted glow that flares then lingers. Kept dim
    // (additive + bloom blow out fast) and tinted to the element, not white.
    const decal = scene.add.image(cx, cy, SPARK_KEY).setOrigin(0.5);
    decal.setDisplaySize(maxR * 1.7, maxR * 1.7);
    decal.setTint(p.colors[0]);
    decal.setBlendMode(Phaser.BlendModes.ADD);
    decal.setAlpha(0);
    layer.add(decal);
    scene.tweens.add({
      targets: decal, alpha: 0.22, duration: 160, ease: 'Quad.easeOut',
      onComplete: () => scene.tweens.add({
        targets: decal, alpha: 0, duration: 700, ease: 'Quad.easeIn', onComplete: () => decal.destroy(),
      }),
    });
  }

  // Anti-grid particle cloud across the footprint. Ordered (wave/beam) spells
  // ripple outward by distance; pure bursts stagger randomly. Several jittered
  // sub-bursts per tile (plus a lingering late wave) keep the cloud dense and
  // alive instead of a single sparse puff.
  worldPts.forEach((pt, i) => {
    const baseDelay = ordered ? Math.min(i * stepMs, 420) : Math.floor(Math.random() * 160);
    const emitAt = (extraDelay, count) => {
      const jx = (Math.random() - 0.5) * tileSize * 0.8;
      const jy = (Math.random() - 0.5) * tileSize * 0.8;
      const fire = () => spawnSpellBurst(scene, pt.x + jx, pt.y + jy, element, count);
      const d = baseDelay + extraDelay;
      if (d <= 0) fire();
      else scene.time.delayedCall(d, fire);
    };
    emitAt(0, Math.round((14 + Math.floor(Math.random() * 7)) * boost));   // main burst
    emitAt(70, Math.round((10 + Math.floor(Math.random() * 6)) * boost));  // immediate fill
    emitAt(280, Math.round((7 + Math.floor(Math.random() * 5)) * boost));  // lingering wave
  });
}
