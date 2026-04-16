/**
 * Rich, element-specific creature-spell VFX.
 *
 * For any non-physical / non-melee creature ability, this module builds a
 * projectile animation tailored to the element (fire, ice, energy, death,
 * earth, poison, holy, lifedrain, manadrain, bleed, control) plus a matching
 * impact burst. While the projectile is in flight, transient lights are
 * pushed into the FloorAtmosphere so the dungeon along the trajectory
 * briefly reveals itself — no matter how dark it is.
 */

const FX_PROJECTILE = 125;
const FX_TRAIL      = 123;
const FX_IMPACT     = 126;

// ── Element aliasing ──────────────────────────────────────────────
// Maps the (lowercased, trimmed) raw `element` field or ability name
// token to an internal archetype key.
const ELEMENT_ALIASES = {
  fire: 'fire', burning: 'fire', 'fire field': 'fire',
  ice: 'ice', freezing: 'ice', 'ice?': 'ice',
  energy: 'energy', electrified: 'energy', 'energy field': 'energy',
  death: 'death', cursed: 'death', hexed: 'death', agony: 'death',
  'life drain': 'lifedrain', lifedrain: 'lifedrain', 'lifed rain': 'lifedrain',
  earth: 'earth',
  poison: 'poison', poisoned: 'poison', drown: 'poison', drowning: 'poison',
  'poison field': 'poison',
  holy: 'holy',
  'mana drain': 'manadrain', manadran: 'manadrain',
  bleed: 'bleed', bleeding: 'bleed',
  paralyze: 'control', rooted: 'control', slowed: 'control',
  feared: 'control', drunk: 'control',
};

const ARCHETYPE_STYLES = {
  fire:      { outer: 0xff4a12, mid: 0xff9a38, inner: 0xffe8a0, light: 0xff7028, projectile: 'flame',   impact: 'explosion' },
  ice:       { outer: 0x5a9edc, mid: 0xa6d4f8, inner: 0xeaf8ff, light: 0x8ac8ff, projectile: 'shard',   impact: 'frost'     },
  energy:    { outer: 0x60a8ff, mid: 0xb0e0ff, inner: 0xffffff, light: 0x90d0ff, projectile: 'bolt',    impact: 'discharge' },
  death:     { outer: 0x2a0830, mid: 0x6028a0, inner: 0xc080f0, light: 0x8028c0, projectile: 'wisp',    impact: 'skullBurst'},
  earth:     { outer: 0x4a7820, mid: 0x90c040, inner: 0xc8e880, light: 0x80c040, projectile: 'thorn',   impact: 'roots'     },
  poison:    { outer: 0x2a8018, mid: 0x60c030, inner: 0xc0e870, light: 0x60c020, projectile: 'bubble',  impact: 'toxic'     },
  holy:      { outer: 0xffb020, mid: 0xffe870, inner: 0xffffe8, light: 0xffd040, projectile: 'beam',    impact: 'radiance'  },
  lifedrain: { outer: 0x600010, mid: 0xc01830, inner: 0xff5860, light: 0xc01828, projectile: 'tendril', impact: 'bloodSplash'},
  manadrain: { outer: 0x103068, mid: 0x4080e0, inner: 0x98d0ff, light: 0x4080e0, projectile: 'orb',     impact: 'manaPulse' },
  bleed:     { outer: 0x800010, mid: 0xd02030, inner: 0xff4848, light: 0xc82020, projectile: 'blade',   impact: 'bloodSplash'},
  control:   { outer: 0x504028, mid: 0xa08a58, inner: 0xe0d090, light: 0xb0a060, projectile: 'chain',   impact: 'snare'     },
  default:   { outer: 0x808090, mid: 0xc0c0d0, inner: 0xffffff, light: 0xc0c0d0, projectile: 'orb',     impact: 'burst'     },
};

function resolveArchetype(ability) {
  const rawEl = String((ability && ability.element) || '').trim().toLowerCase();
  const name  = String((ability && ability.name)    || '').trim().toLowerCase();
  if (ELEMENT_ALIASES[rawEl]) return ELEMENT_ALIASES[rawEl];
  // Scan token by token against aliases.
  for (const tok of Object.keys(ELEMENT_ALIASES)) {
    if (rawEl.includes(tok) || name.includes(tok)) return ELEMENT_ALIASES[tok];
  }
  // Name-only heuristics.
  if (/(fire|flame|blast|inferno|combust|pyro)/.test(name)) return 'fire';
  if (/(ice|frost|cold|freeze|glaci)/.test(name))           return 'ice';
  if (/(thunder|lightning|bolt|shock|zap|vis)/.test(name))  return 'energy';
  if (/(death|curse|hex|shadow|void|dark)/.test(name))      return 'death';
  if (/(earth|stone|rock|boulder)/.test(name))              return 'earth';
  if (/(poison|toxic|venom)/.test(name))                    return 'poison';
  if (/(holy|divine|light beam|radiant)/.test(name))        return 'holy';
  if (/(drain)/.test(name) && /(life|soul)/.test(name))     return 'lifedrain';
  if (/(drain)/.test(name) && /(mana)/.test(name))          return 'manadrain';
  if (/(bleed|hemorrhage|sever)/.test(name))                return 'bleed';
  if (/(paralys|root|snare|trap|fear|stun|slow|drunk)/.test(name)) return 'control';
  return 'default';
}

// ── Tiny helpers ──────────────────────────────────────────────────
function spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, opts) {
  if (!atmosphere || typeof atmosphere.addTransientLight !== 'function') return;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const step = opts.step || 34;
  const steps = Math.max(4, Math.min(18, Math.floor(dist / step)));
  const lightRadius = opts.lightRadius || 1.7;
  const lightDuration = opts.lightDuration || 360;
  const peak = opts.peakAlpha || 0.95;
  for (let i = 0; i < steps; i += 1) {
    const t = (i + 0.5) / steps;
    const lx = x0 + dx * t;
    const ly = y0 + dy * t;
    const delay = Math.floor(duration * t * 0.85);
    scene.time.delayedCall(delay, () => {
      atmosphere.addTransientLight(lx, ly, lightRadius, lightDuration, { peakAlpha: peak });
    });
  }
  // Big flash at impact point.
  scene.time.delayedCall(Math.floor(duration * 0.92), () => {
    atmosphere.addTransientLight(x1, y1, opts.impactLightRadius || 3.4, 540, { peakAlpha: 1 });
  });
}

function flickerTween(scene, target, duration) {
  return scene.tweens.add({
    targets: target,
    scaleX: { from: 0.9, to: 1.2 },
    scaleY: { from: 0.9, to: 1.2 },
    alpha:  { from: 1.0, to: 0.7 },
    duration: 80, yoyo: true, repeat: Math.max(1, Math.floor(duration / 160)),
  });
}

function spawnEmber(scene, x, y, color, life, size, alpha = 0.9) {
  const e = scene.add.circle(x, y, size, color, alpha);
  e.setDepth(FX_TRAIL);
  scene.tweens.add({
    targets: e,
    x: x + (Math.random() - 0.5) * 14,
    y: y + (Math.random() - 0.5) * 14,
    alpha: 0,
    scaleX: 0.2, scaleY: 0.2,
    duration: life,
    ease: 'Sine.easeOut',
    onComplete: () => e.destroy(),
  });
  return e;
}

function linearAngle(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

// ── Projectiles ───────────────────────────────────────────────────
function flameProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 2.0, lightDuration: 380 });
  // Core fireball — two stacked circles for layered glow.
  const outer = scene.add.circle(x0, y0, 10, style.outer, 0.85);
  const mid   = scene.add.circle(x0, y0, 7, style.mid, 0.92);
  const inner = scene.add.circle(x0, y0, 3.6, style.inner, 1);
  outer.setDepth(FX_PROJECTILE); mid.setDepth(FX_PROJECTILE); inner.setDepth(FX_PROJECTILE + 1);
  const tween = scene.tweens.add({
    targets: [outer, mid, inner], x: x1, y: y1, duration, ease: 'Sine.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.55) {
        const jitter = 3;
        spawnEmber(scene,
          outer.x + (Math.random() - 0.5) * jitter,
          outer.y + (Math.random() - 0.5) * jitter,
          Math.random() < 0.5 ? style.mid : style.outer,
          360 + Math.random() * 280, 2 + Math.random() * 1.8);
      }
    },
    onComplete: () => { outer.destroy(); mid.destroy(); inner.destroy(); onImpact(); },
  });
  flickerTween(scene, outer, duration);
  return tween;
}

function shardProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.8, lightDuration: 320 });
  const ang = linearAngle(x0, y0, x1, y1);
  const shard = scene.add.graphics();
  shard.fillStyle(style.outer, 0.9);
  shard.fillTriangle(-12, -3, 12, 0, -12, 3);
  shard.fillStyle(style.inner, 0.8);
  shard.fillTriangle(-9, -1.5, 9, 0, -9, 1.5);
  shard.lineStyle(0.8, style.inner, 0.8);
  shard.beginPath(); shard.moveTo(-11, 0); shard.lineTo(11, 0); shard.strokePath();
  shard.setPosition(x0, y0);
  shard.setRotation(ang);
  shard.setDepth(FX_PROJECTILE);
  scene.tweens.add({
    targets: shard, x: x1, y: y1, duration, ease: 'Quad.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.5) {
        const f = scene.add.rectangle(
          shard.x + (Math.random() - 0.5) * 6,
          shard.y + (Math.random() - 0.5) * 6,
          1 + Math.random() * 1.4, 3 + Math.random() * 2,
          style.mid, 0.85);
        f.setRotation(ang + (Math.random() - 0.5) * 0.8);
        f.setDepth(FX_TRAIL);
        scene.tweens.add({
          targets: f, alpha: 0, scaleX: 0.3, scaleY: 0.3,
          duration: 300 + Math.random() * 300, ease: 'Sine.easeOut',
          onComplete: () => f.destroy(),
        });
      }
    },
    onComplete: () => { shard.destroy(); onImpact(); },
  });
}

function boltProjectile(scene, atmosphere, x0, y0, x1, y1, style, _duration, onImpact) {
  // Lightning bolts are instant. Draw jagged path + brief flash + lots of light.
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, 120, { lightRadius: 2.5, lightDuration: 280, step: 24, impactLightRadius: 4 });
  const g = scene.add.graphics();
  g.setDepth(FX_PROJECTILE);
  const segs = 8;
  const dx = (x1 - x0) / segs;
  const dy = (y1 - y0) / segs;
  // Outer glow pass
  g.lineStyle(7, style.outer, 0.5);
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i < segs; i += 1) {
    g.lineTo(x0 + dx * i + (Math.random() - 0.5) * 18, y0 + dy * i + (Math.random() - 0.5) * 18);
  }
  g.lineTo(x1, y1);
  g.strokePath();
  // Mid pass
  g.lineStyle(3.5, style.mid, 0.85);
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i < segs; i += 1) {
    g.lineTo(x0 + dx * i + (Math.random() - 0.5) * 14, y0 + dy * i + (Math.random() - 0.5) * 14);
  }
  g.lineTo(x1, y1);
  g.strokePath();
  // Inner white core
  g.lineStyle(1.4, style.inner, 1);
  g.beginPath();
  g.moveTo(x0, y0);
  for (let i = 1; i < segs; i += 1) {
    g.lineTo(x0 + dx * i + (Math.random() - 0.5) * 10, y0 + dy * i + (Math.random() - 0.5) * 10);
  }
  g.lineTo(x1, y1);
  g.strokePath();
  // Branch sparks
  for (let i = 0; i < 6; i += 1) {
    const t = 0.2 + Math.random() * 0.6;
    const bx = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 12;
    const by = y0 + (y1 - y0) * t + (Math.random() - 0.5) * 12;
    spawnEmber(scene, bx, by, style.inner, 220 + Math.random() * 160, 1.6 + Math.random());
  }
  scene.tweens.add({
    targets: g, alpha: 0, duration: 220, ease: 'Quad.easeIn',
    onComplete: () => { g.destroy(); onImpact(); },
  });
}

function wispProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.8, lightDuration: 460 });
  // Ghostly wisp — pulsating purple with flicker trail.
  const body = scene.add.circle(x0, y0, 9, style.outer, 0.78);
  const glow = scene.add.circle(x0, y0, 14, style.mid, 0.28);
  const spark = scene.add.circle(x0, y0, 2.6, style.inner, 1);
  body.setDepth(FX_PROJECTILE); glow.setDepth(FX_PROJECTILE - 1); spark.setDepth(FX_PROJECTILE + 1);
  scene.tweens.add({
    targets: glow, scaleX: { from: 0.9, to: 1.5 }, scaleY: { from: 0.9, to: 1.5 }, alpha: { from: 0.3, to: 0.12 },
    duration: 280, yoyo: true, repeat: Math.floor(duration / 560) + 1,
  });
  scene.tweens.add({
    targets: [body, glow, spark], x: x1, y: y1, duration, ease: 'Sine.inOut',
    onUpdate: () => {
      if (Math.random() < 0.45) {
        const tr = scene.add.circle(body.x + (Math.random() - 0.5) * 8, body.y + (Math.random() - 0.5) * 8,
          1.4 + Math.random() * 1.8, style.mid, 0.75);
        tr.setDepth(FX_TRAIL);
        scene.tweens.add({
          targets: tr, y: tr.y - 8 - Math.random() * 6, alpha: 0, scaleX: 0.3, scaleY: 0.3,
          duration: 420 + Math.random() * 260, ease: 'Sine.easeOut',
          onComplete: () => tr.destroy(),
        });
      }
    },
    onComplete: () => { body.destroy(); glow.destroy(); spark.destroy(); onImpact(); },
  });
}

function thornProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.5, lightDuration: 320 });
  const ang = linearAngle(x0, y0, x1, y1);
  const g = scene.add.graphics();
  // Cluster of 4 spikes in a star shape
  g.fillStyle(style.outer, 0.9);
  g.fillTriangle(0, -9, 3, 0, -3, 0);
  g.fillTriangle(0, 9, 3, 0, -3, 0);
  g.fillTriangle(-9, 0, 0, 3, 0, -3);
  g.fillTriangle(9, 0, 0, 3, 0, -3);
  g.fillStyle(style.inner, 0.9);
  g.fillCircle(0, 0, 2.4);
  g.setPosition(x0, y0);
  g.setRotation(ang);
  g.setDepth(FX_PROJECTILE);
  scene.tweens.add({
    targets: g, x: x1, y: y1, rotation: ang + Math.PI * 2, duration, ease: 'Quad.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.35) {
        spawnEmber(scene, g.x + (Math.random() - 0.5) * 8, g.y + (Math.random() - 0.5) * 8,
          style.mid, 320 + Math.random() * 200, 1.4 + Math.random() * 1.3);
      }
    },
    onComplete: () => { g.destroy(); onImpact(); },
  });
}

function bubbleProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.7, lightDuration: 360 });
  const outer = scene.add.circle(x0, y0, 11, style.outer, 0.7);
  const mid   = scene.add.circle(x0, y0, 7, style.mid, 0.85);
  const gloss = scene.add.circle(x0 - 2, y0 - 3, 2.6, style.inner, 0.9);
  outer.setDepth(FX_PROJECTILE); mid.setDepth(FX_PROJECTILE); gloss.setDepth(FX_PROJECTILE + 1);
  scene.tweens.add({
    targets: outer, scaleX: { from: 0.88, to: 1.15 }, scaleY: { from: 1.12, to: 0.9 },
    duration: 240, yoyo: true, repeat: Math.floor(duration / 480) + 1, ease: 'Sine.inOut',
  });
  scene.tweens.add({
    targets: [outer, mid, gloss], x: x1, y: y1, duration, ease: 'Sine.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.4) {
        const drop = scene.add.circle(outer.x + (Math.random() - 0.5) * 8, outer.y,
          1.2 + Math.random(), style.mid, 0.85);
        drop.setDepth(FX_TRAIL);
        scene.tweens.add({
          targets: drop, y: drop.y + 14 + Math.random() * 10, alpha: 0,
          duration: 360 + Math.random() * 220, ease: 'Quad.easeIn',
          onComplete: () => drop.destroy(),
        });
      }
    },
    onComplete: () => { outer.destroy(); mid.destroy(); gloss.destroy(); onImpact(); },
  });
}

function beamProjectile(scene, atmosphere, x0, y0, x1, y1, style, _duration, onImpact) {
  // Instant radiant beam.
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, 180, { lightRadius: 2.8, lightDuration: 380, step: 24, impactLightRadius: 4.5 });
  const g = scene.add.graphics();
  g.setDepth(FX_PROJECTILE);
  // 3-stroke beam for glow
  g.lineStyle(8, style.outer, 0.45);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokePath();
  g.lineStyle(4, style.mid, 0.85);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokePath();
  g.lineStyle(1.5, style.inner, 1);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.strokePath();
  // Starburst sparks at both ends
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const r = 10 + Math.random() * 12;
    spawnEmber(scene, x1 + Math.cos(a) * r, y1 + Math.sin(a) * r, style.inner, 280 + Math.random() * 240, 1.6);
  }
  scene.tweens.add({
    targets: g, alpha: 0, duration: 280, ease: 'Quad.easeIn',
    onComplete: () => { g.destroy(); onImpact(); },
  });
}

function tendrilProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.8, lightDuration: 420 });
  // Draw a whip-like curving line from the creature to the projectile head.
  const head  = scene.add.circle(x0, y0, 7, style.outer, 0.92);
  const glow  = scene.add.circle(x0, y0, 12, style.mid, 0.30);
  const spark = scene.add.circle(x0, y0, 3, style.inner, 1);
  head.setDepth(FX_PROJECTILE); glow.setDepth(FX_PROJECTILE - 1); spark.setDepth(FX_PROJECTILE + 1);
  const whip = scene.add.graphics();
  whip.setDepth(FX_TRAIL);
  let tickIdx = 0;
  scene.tweens.add({
    targets: [head, glow, spark], x: x1, y: y1, duration, ease: 'Sine.easeIn',
    onUpdate: () => {
      tickIdx += 1;
      if (tickIdx % 2 !== 0) return;
      whip.clear();
      const dx = head.x - x0;
      const dy = head.y - y0;
      const len = Math.hypot(dx, dy);
      if (len < 1) return;
      const nx = -dy / len;
      const ny = dx / len;
      const amp = 7;
      whip.lineStyle(3.5, style.outer, 0.55);
      whip.beginPath();
      const segs = 6;
      whip.moveTo(x0, y0);
      for (let i = 1; i <= segs; i += 1) {
        const t = i / segs;
        const wob = Math.sin(t * Math.PI + tickIdx * 0.4) * amp * (1 - t);
        whip.lineTo(x0 + dx * t + nx * wob, y0 + dy * t + ny * wob);
      }
      whip.strokePath();
      whip.lineStyle(1.5, style.inner, 0.85);
      whip.beginPath();
      whip.moveTo(x0, y0);
      for (let i = 1; i <= segs; i += 1) {
        const t = i / segs;
        const wob = Math.sin(t * Math.PI + tickIdx * 0.4) * amp * (1 - t);
        whip.lineTo(x0 + dx * t + nx * wob, y0 + dy * t + ny * wob);
      }
      whip.strokePath();
    },
    onComplete: () => { head.destroy(); glow.destroy(); spark.destroy(); whip.destroy(); onImpact(); },
  });
}

function orbProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.6, lightDuration: 340 });
  const outer = scene.add.circle(x0, y0, 9, style.outer, 0.8);
  const inner = scene.add.circle(x0, y0, 4.5, style.inner, 1);
  outer.setDepth(FX_PROJECTILE); inner.setDepth(FX_PROJECTILE + 1);
  scene.tweens.add({
    targets: [outer, inner], x: x1, y: y1, duration, ease: 'Sine.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.5) {
        spawnEmber(scene, outer.x + (Math.random() - 0.5) * 6, outer.y + (Math.random() - 0.5) * 6,
          style.mid, 300 + Math.random() * 200, 1.5 + Math.random());
      }
    },
    onComplete: () => { outer.destroy(); inner.destroy(); onImpact(); },
  });
}

function bladeProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.5, lightDuration: 300 });
  const ang = linearAngle(x0, y0, x1, y1);
  const g = scene.add.graphics();
  g.fillStyle(style.outer, 0.9);
  g.fillTriangle(-13, -4, 14, 0, -13, 4);
  g.fillStyle(style.inner, 0.95);
  g.fillTriangle(-9, -2, 11, 0, -9, 2);
  g.setPosition(x0, y0);
  g.setRotation(ang);
  g.setDepth(FX_PROJECTILE);
  scene.tweens.add({
    targets: g, x: x1, y: y1, rotation: ang + Math.PI * 4, duration, ease: 'Quad.easeIn',
    onUpdate: () => {
      if (Math.random() < 0.55) {
        spawnEmber(scene, g.x + (Math.random() - 0.5) * 8, g.y + (Math.random() - 0.5) * 8,
          style.mid, 280 + Math.random() * 220, 1.2 + Math.random() * 1.4);
      }
    },
    onComplete: () => { g.destroy(); onImpact(); },
  });
}

function chainProjectile(scene, atmosphere, x0, y0, x1, y1, style, duration, onImpact) {
  spawnTrailLights(scene, atmosphere, x0, y0, x1, y1, duration, { lightRadius: 1.4, lightDuration: 300 });
  const g = scene.add.graphics();
  g.setPosition(x0, y0);
  g.setDepth(FX_PROJECTILE);
  const ang = linearAngle(x0, y0, x1, y1);
  // Small chain of 3 links stacked around the head
  for (let i = 0; i < 3; i += 1) {
    g.fillStyle(style.outer, 0.88);
    g.fillEllipse(-i * 5, 0, 5.5, 3.6);
    g.fillStyle(style.inner, 0.75);
    g.fillEllipse(-i * 5 - 0.6, -0.6, 3, 2);
  }
  g.setRotation(ang);
  scene.tweens.add({
    targets: g, x: x1, y: y1, duration, ease: 'Sine.easeIn',
    onComplete: () => { g.destroy(); onImpact(); },
  });
}

// ── Impacts ────────────────────────────────────────────────────────
function fireExplosion(scene, x, y, style) {
  const ring = scene.add.circle(x, y, 4, style.mid, 0.85);
  ring.setDepth(FX_IMPACT);
  scene.tweens.add({
    targets: ring, scaleX: 9, scaleY: 9, alpha: 0,
    duration: 520, ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
  });
  const flash = scene.add.circle(x, y, 12, style.inner, 0.95);
  flash.setDepth(FX_IMPACT + 1);
  scene.tweens.add({
    targets: flash, scaleX: 4, scaleY: 4, alpha: 0,
    duration: 320, ease: 'Cubic.easeOut', onComplete: () => flash.destroy(),
  });
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
    const d = 20 + Math.random() * 28;
    const col = Math.random() < 0.5 ? style.mid : style.outer;
    const spark = scene.add.circle(x, y, 1.8 + Math.random() * 2.4, col, 0.95);
    spark.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: spark, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0,
      scaleX: 0.2, scaleY: 0.2, duration: 450 + Math.random() * 260,
      ease: 'Quad.easeOut', onComplete: () => spark.destroy(),
    });
  }
}

function frostImpact(scene, x, y, style) {
  // Ring + 6 shards radiating out + snowflake glyph
  const ring = scene.add.circle(x, y, 5, style.mid, 0.85);
  ring.setDepth(FX_IMPACT);
  scene.tweens.add({
    targets: ring, scaleX: 8, scaleY: 8, alpha: 0, duration: 500,
    ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
  });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const shard = scene.add.graphics();
    shard.fillStyle(style.inner, 0.92);
    shard.fillTriangle(-8, -2, 10, 0, -8, 2);
    shard.setPosition(x, y);
    shard.setRotation(a);
    shard.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: shard,
      x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, alpha: 0,
      duration: 440, ease: 'Cubic.easeOut', onComplete: () => shard.destroy(),
    });
  }
  const flake = scene.add.text(x, y, '❄', { fontSize: '26px', color: `#${style.inner.toString(16).padStart(6, '0')}` });
  flake.setOrigin(0.5, 0.5);
  flake.setDepth(FX_IMPACT + 1);
  flake.setShadow(0, 0, `#${style.light.toString(16).padStart(6, '0')}`, 14, true, true);
  scene.tweens.add({
    targets: flake, scaleX: 1.8, scaleY: 1.8, alpha: 0,
    duration: 520, ease: 'Sine.easeOut', onComplete: () => flake.destroy(),
  });
}

function energyDischarge(scene, x, y, style) {
  const flash = scene.add.circle(x, y, 18, style.inner, 0.95);
  flash.setDepth(FX_IMPACT + 1);
  scene.tweens.add({
    targets: flash, scaleX: 3.5, scaleY: 3.5, alpha: 0,
    duration: 220, ease: 'Cubic.easeOut', onComplete: () => flash.destroy(),
  });
  // Jagged discharge prongs
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const g = scene.add.graphics();
    g.setDepth(FX_IMPACT);
    g.lineStyle(2.4, style.mid, 0.95);
    g.beginPath();
    g.moveTo(x, y);
    const len = 22 + Math.random() * 10;
    const tx = x + Math.cos(a) * len;
    const ty = y + Math.sin(a) * len;
    const mx = (x + tx) / 2 + (Math.random() - 0.5) * 10;
    const my = (y + ty) / 2 + (Math.random() - 0.5) * 10;
    g.lineTo(mx, my);
    g.lineTo(tx, ty);
    g.strokePath();
    scene.tweens.add({
      targets: g, alpha: 0, duration: 260, ease: 'Quad.easeIn',
      onComplete: () => g.destroy(),
    });
  }
  // Rings
  for (let i = 0; i < 2; i += 1) {
    const ring = scene.add.circle(x, y, 6, style.outer, 0);
    ring.setDepth(FX_IMPACT);
    ring.setStrokeStyle(2, style.outer, 0.9);
    scene.tweens.add({
      targets: ring, scaleX: 6, scaleY: 6, alpha: 0,
      duration: 480, delay: i * 80, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
}

function deathSkullBurst(scene, x, y, style) {
  const skull = scene.add.text(x, y, '☠', { fontSize: '34px', color: `#${style.inner.toString(16).padStart(6, '0')}`, fontStyle: 'bold' });
  skull.setOrigin(0.5, 0.5);
  skull.setDepth(FX_IMPACT + 1);
  skull.setShadow(0, 0, `#${style.light.toString(16).padStart(6, '0')}`, 16, true, true);
  scene.tweens.add({
    targets: skull, scaleX: 1.6, scaleY: 1.6, alpha: 0,
    duration: 560, ease: 'Quad.easeOut', onComplete: () => skull.destroy(),
  });
  // Dark tendrils radiating
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 22;
    const t = scene.add.circle(x, y, 2 + Math.random() * 1.8, style.outer, 0.85);
    t.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: t, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      alpha: 0, scaleX: 0.3, scaleY: 0.3, duration: 480 + Math.random() * 220,
      ease: 'Sine.easeOut', onComplete: () => t.destroy(),
    });
  }
  const ring = scene.add.circle(x, y, 8, style.mid, 0);
  ring.setDepth(FX_IMPACT);
  ring.setStrokeStyle(2, style.mid, 0.8);
  scene.tweens.add({
    targets: ring, scaleX: 6, scaleY: 6, alpha: 0,
    duration: 620, ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
  });
}

function earthRoots(scene, x, y, style) {
  // 5 roots bursting out of the ground
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const g = scene.add.graphics();
    g.setDepth(FX_IMPACT);
    g.lineStyle(3, style.outer, 0.9);
    g.beginPath();
    g.moveTo(x, y);
    const segs = 4;
    let cx = x; let cy = y;
    for (let s = 1; s <= segs; s += 1) {
      cx += Math.cos(a + (Math.random() - 0.5) * 0.4) * 7;
      cy += Math.sin(a + (Math.random() - 0.5) * 0.4) * 7;
      g.lineTo(cx, cy);
    }
    g.strokePath();
    g.lineStyle(1.5, style.inner, 0.85);
    g.strokePath();
    scene.tweens.add({
      targets: g, alpha: 0, duration: 720, delay: i * 30,
      ease: 'Quad.easeIn', onComplete: () => g.destroy(),
    });
  }
  // Earthy dust puff
  const puff = scene.add.circle(x, y, 6, style.mid, 0.7);
  puff.setDepth(FX_IMPACT - 1);
  scene.tweens.add({
    targets: puff, scaleX: 5, scaleY: 5, alpha: 0, duration: 520,
    ease: 'Quad.easeOut', onComplete: () => puff.destroy(),
  });
}

function poisonCloud(scene, x, y, style) {
  // 6 overlapping puffs drifting up
  for (let i = 0; i < 6; i += 1) {
    const ox = (Math.random() - 0.5) * 14;
    const oy = (Math.random() - 0.5) * 10;
    const puff = scene.add.circle(x + ox, y + oy, 4 + Math.random() * 3, style.mid, 0.82);
    puff.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: puff, y: puff.y - 12 - Math.random() * 8,
      scaleX: 2 + Math.random(), scaleY: 2 + Math.random(),
      alpha: 0, duration: 700 + Math.random() * 300,
      ease: 'Sine.easeOut', onComplete: () => puff.destroy(),
    });
  }
  for (let i = 0; i < 10; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const d = 8 + Math.random() * 16;
    const b = scene.add.circle(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 1 + Math.random(), style.inner, 0.9);
    b.setDepth(FX_IMPACT + 1);
    scene.tweens.add({
      targets: b, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d,
      alpha: 0, duration: 460 + Math.random() * 240,
      ease: 'Sine.easeOut', onComplete: () => b.destroy(),
    });
  }
}

function holyRadiance(scene, x, y, style) {
  const flash = scene.add.circle(x, y, 14, style.inner, 0.95);
  flash.setDepth(FX_IMPACT + 1);
  scene.tweens.add({
    targets: flash, scaleX: 5, scaleY: 5, alpha: 0,
    duration: 420, ease: 'Cubic.easeOut', onComplete: () => flash.destroy(),
  });
  // 8 golden rays
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const g = scene.add.graphics();
    g.setDepth(FX_IMPACT);
    g.lineStyle(3, style.mid, 0.9);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * 28, y + Math.sin(a) * 28);
    g.strokePath();
    g.lineStyle(1.2, style.inner, 1);
    g.strokePath();
    scene.tweens.add({
      targets: g, alpha: 0, duration: 520, ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }
  // Cross glyph
  const plus = scene.add.text(x, y, '✦', {
    fontSize: '32px',
    color: `#${style.inner.toString(16).padStart(6, '0')}`,
    fontStyle: 'bold',
  });
  plus.setOrigin(0.5, 0.5);
  plus.setDepth(FX_IMPACT + 1);
  plus.setShadow(0, 0, `#${style.mid.toString(16).padStart(6, '0')}`, 18, true, true);
  scene.tweens.add({
    targets: plus, scaleX: 1.5, scaleY: 1.5, alpha: 0,
    duration: 520, ease: 'Quad.easeOut', onComplete: () => plus.destroy(),
  });
}

function bloodSplash(scene, x, y, style) {
  for (let i = 0; i < 16; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 22;
    const drop = scene.add.circle(x, y, 1.8 + Math.random() * 2.4, style.outer, 0.92);
    drop.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: drop, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d + 4,
      alpha: 0, duration: 380 + Math.random() * 240,
      ease: 'Quad.easeIn', onComplete: () => drop.destroy(),
    });
  }
  const pool = scene.add.ellipse(x, y + 4, 12, 5, style.outer, 0.7);
  pool.setDepth(FX_IMPACT - 1);
  scene.tweens.add({
    targets: pool, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 900,
    ease: 'Quad.easeOut', onComplete: () => pool.destroy(),
  });
}

function manaPulse(scene, x, y, style) {
  for (let i = 0; i < 3; i += 1) {
    const ring = scene.add.circle(x, y, 6, style.mid, 0);
    ring.setDepth(FX_IMPACT);
    ring.setStrokeStyle(2, style.mid, 0.85);
    scene.tweens.add({
      targets: ring, scaleX: 5, scaleY: 5, alpha: 0,
      duration: 480 + i * 80, delay: i * 80, ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
  const core = scene.add.circle(x, y, 9, style.inner, 0.95);
  core.setDepth(FX_IMPACT + 1);
  scene.tweens.add({
    targets: core, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 480,
    ease: 'Cubic.easeOut', onComplete: () => core.destroy(),
  });
}

function snareImpact(scene, x, y, style) {
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const g = scene.add.graphics();
    g.setDepth(FX_IMPACT);
    g.fillStyle(style.outer, 0.9);
    for (let k = 0; k < 3; k += 1) {
      g.fillEllipse(Math.cos(a) * (8 + k * 5), Math.sin(a) * (8 + k * 5), 4.5, 2.8);
    }
    g.setPosition(x, y);
    scene.tweens.add({
      targets: g, alpha: 0, duration: 720, ease: 'Quad.easeOut',
      onComplete: () => g.destroy(),
    });
  }
}

function genericBurst(scene, x, y, style) {
  const ring = scene.add.circle(x, y, 6, style.mid, 0.9);
  ring.setDepth(FX_IMPACT);
  scene.tweens.add({
    targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 480,
    ease: 'Quad.easeOut', onComplete: () => ring.destroy(),
  });
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const spark = scene.add.circle(x, y, 2, style.inner, 0.9);
    spark.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: spark, x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20,
      alpha: 0, duration: 420, ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
  }
}

// ── Public API ────────────────────────────────────────────────────
export function castCreatureSpellVfx(scene, atmosphere, fromX, fromY, toX, toY, ability, onArrive) {
  const key = resolveArchetype(ability);
  const style = ARCHETYPE_STYLES[key] || ARCHETYPE_STYLES.default;
  const dist = Math.hypot(toX - fromX, toY - fromY);
  const duration = Math.max(180, Math.min(640, dist * 1.5));

  const fireImpact = () => {
    // Big terminal flash
    if (atmosphere && atmosphere.addTransientLight) {
      atmosphere.addTransientLight(toX, toY, 3.2, 520, { peakAlpha: 1 });
    }
    switch (style.impact) {
      case 'explosion':   fireExplosion(scene, toX, toY, style); break;
      case 'frost':       frostImpact(scene, toX, toY, style); break;
      case 'discharge':   energyDischarge(scene, toX, toY, style); break;
      case 'skullBurst':  deathSkullBurst(scene, toX, toY, style); break;
      case 'roots':       earthRoots(scene, toX, toY, style); break;
      case 'toxic':       poisonCloud(scene, toX, toY, style); break;
      case 'radiance':    holyRadiance(scene, toX, toY, style); break;
      case 'bloodSplash': bloodSplash(scene, toX, toY, style); break;
      case 'manaPulse':   manaPulse(scene, toX, toY, style); break;
      case 'snare':       snareImpact(scene, toX, toY, style); break;
      default:            genericBurst(scene, toX, toY, style);
    }
    if (typeof onArrive === 'function') onArrive();
  };

  switch (style.projectile) {
    case 'flame':   flameProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'shard':   shardProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'bolt':    boltProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'wisp':    wispProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'thorn':   thornProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'bubble':  bubbleProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'beam':    beamProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'tendril': tendrilProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'orb':     orbProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'blade':   bladeProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    case 'chain':   chainProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact); break;
    default:        orbProjectile(scene, atmosphere, fromX, fromY, toX, toY, style, duration, fireImpact);
  }
}

export function isElementalAbility(ability) {
  const el = String((ability && ability.element) || '').trim().toLowerCase();
  const name = String((ability && ability.name) || '').trim().toLowerCase();
  if (name === 'melee') return false;
  if (el === 'physical') return false;
  return true;
}

/**
 * Fire explosion centred at (x, y) scaled to `sizeTiles` — meant for abilities
 * like Fireball / Great Fireball / Huge Fireball where the visual should be an
 * area detonation on the target tile, not a projectile from the caster.
 * Adds a matching transient light to the darkness system so the blast reveals
 * the surroundings for a moment.
 */
export function castFireballExplosion(scene, atmosphere, x, y, sizeTiles = 2, opts = {}) {
  const style = ARCHETYPE_STYLES.fire;
  const radiusPx = Math.max(16, Number(sizeTiles) * 32 * 0.9);
  const scale = radiusPx / 48; // tune the base fireExplosion (which uses ~45 px) to requested radius.

  // Transient light pulse (diameter in tiles ≈ sizeTiles * 1.8).
  if (atmosphere && typeof atmosphere.addTransientLight === 'function') {
    atmosphere.addTransientLight(x, y, Math.max(2, sizeTiles * 1.8), 620, { peakAlpha: 1 });
  }

  // Outer shockwave ring.
  const ring = scene.add.circle(x, y, 6, style.mid, 0.85);
  ring.setDepth(FX_IMPACT);
  scene.tweens.add({
    targets: ring,
    scaleX: scale * 10, scaleY: scale * 10, alpha: 0,
    duration: 560, ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });

  // Inner white-hot flash.
  const flash = scene.add.circle(x, y, 12, style.inner, 0.95);
  flash.setDepth(FX_IMPACT + 1);
  scene.tweens.add({
    targets: flash,
    scaleX: scale * 4.2, scaleY: scale * 4.2, alpha: 0,
    duration: 360, ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });

  // Secondary orange dome that hangs a bit longer.
  const dome = scene.add.circle(x, y, radiusPx * 0.75, style.outer, 0.55);
  dome.setDepth(FX_IMPACT);
  scene.tweens.add({
    targets: dome,
    scaleX: 1.4, scaleY: 1.4, alpha: 0,
    duration: 640, ease: 'Sine.easeOut',
    onComplete: () => dome.destroy(),
  });

  // Ember spray — count scales with size so a Huge Fireball feels fuller.
  const embers = Math.max(16, Math.floor(22 * scale));
  for (let i = 0; i < embers; i += 1) {
    const a = (i / embers) * Math.PI * 2 + Math.random() * 0.25;
    const d = radiusPx * (0.45 + Math.random() * 0.9);
    const col = Math.random() < 0.5 ? style.mid : style.outer;
    const spark = scene.add.circle(x, y, 1.8 + Math.random() * 2.6, col, 0.95);
    spark.setDepth(FX_IMPACT);
    scene.tweens.add({
      targets: spark,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d,
      alpha: 0,
      scaleX: 0.2, scaleY: 0.2,
      duration: 500 + Math.random() * 320,
      ease: 'Quad.easeOut',
      onComplete: () => spark.destroy(),
    });
  }

  // Rising smoke puff on top.
  const smoke = scene.add.circle(x, y, radiusPx * 0.5, 0x1a1a1a, 0.35);
  smoke.setDepth(FX_IMPACT - 1);
  scene.tweens.add({
    targets: smoke,
    y: y - 18,
    scaleX: 1.5, scaleY: 1.5,
    alpha: 0,
    duration: 780, ease: 'Sine.easeOut',
    onComplete: () => smoke.destroy(),
  });

  if (typeof opts.onArrive === 'function') opts.onArrive();
}

/**
 * Heuristic for fireball-family abilities so the caller can short-circuit
 * the projectile VFX and use castFireballExplosion instead.
 */
export function isFireballAbility(ability) {
  const name = String((ability && ability.name) || '').trim().toLowerCase();
  return /\bfireball\b/.test(name);
}
