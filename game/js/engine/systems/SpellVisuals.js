// Scene-bound visual effects for spells: per-tile glyph burst, caster /
// target aura burst, projectile line. Pure presentation — given a spell
// + scene refs, lights up the canvas. No closure state.
//
// Extracted from game.engine.js Phase 4 (Combat prep). Sibling of
// HitVisuals.js; both use the Renderer.js primitives.

import {
  tileSpellBurst,
  spellAuraBurst,
  spellProjectileLine,
} from '../../rendering/Renderer.js';

/** @typedef {import('../../types.js').Spell} Spell */
/** @typedef {import('../../types.js').Creature} Creature */

/**
 * @typedef {object} SpellTileFxCtx
 * @property {number} tileSize
 * @property {(gx: number) => number} centerX
 * @property {(gy: number) => number} centerY
 * @property {{ gridX: number, gridY: number }} caster   - for beam-order sorting
 * @property {(gx: number, gy: number) => boolean} isWalkable
 */

/**
 * @typedef {object} SpellProjectileCtx
 * @property {any} player              - Phaser player sprite (source)
 * @property {number} tileSize
 */

/**
 * Pick a color + glyph pair for a spell based on its element / title.
 * Falls back to a generic cyan twinkle.
 *
 * @param {Spell | null} spell
 * @returns {{ color: number, glyph: string }}
 */
export function spellFxProfile(spell) {
  const element = String((spell && spell.raw && spell.raw.element) || '').toLowerCase();
  const title = String((spell && spell.title) || '').toLowerCase();
  if (element.includes('fire')   || title.includes('flame')  || title.includes('fire'))   return { color: 0xfb7185, glyph: '✹' };
  if (element.includes('ice')    || title.includes('ice')    || title.includes('frigo'))  return { color: 0x93c5fd, glyph: '❄' };
  if (element.includes('energy') || title.includes('energy') || title.includes('vis'))    return { color: 0xa78bfa, glyph: '✧' };
  if (element.includes('earth')  || title.includes('terra'))                              return { color: 0x86efac, glyph: '✶' };
  if (element.includes('holy')   || title.includes('divine') || title.includes('san'))    return { color: 0xfde68a, glyph: '✦' };
  if (element.includes('death')  || title.includes('mort'))                               return { color: 0xc4b5fd, glyph: '✢' };
  if (                             title.includes('heal')   || title.includes('exura'))  return { color: 0x60a5fa, glyph: '✚' };
  return { color: 0x7dd3fc, glyph: '✧' };
}

/**
 * Light up a set of tiles with the spell's color/glyph. Honours an
 * optional staggered delay (beam-style cascades) and a 'beam' order that
 * sorts by Manhattan distance from the caster.
 *
 * @param {any} scene
 * @param {SpellTileFxCtx} ctx
 * @param {Array<{ gx: number, gy: number }> | null} tiles
 * @param {number} [color]
 * @param {{ duration?: number, delayStep?: number, order?: 'beam' | null, glyph?: string, glyphColor?: string }} [opts]
 */
export function showSpellTileEffect(scene, ctx, tiles, color = 0xf59e0b, opts = {}) {
  const { tileSize, centerX, centerY, caster, isWalkable } = ctx;
  const duration = opts.duration != null ? opts.duration : 300;
  const delayStep = opts.delayStep != null ? opts.delayStep : 0;
  const order = opts.order || null;
  const glyphChar = opts.glyph != null ? opts.glyph : '✦';
  const glyphColor = opts.glyphColor != null ? opts.glyphColor : '#fde68a';
  let list = (tiles || []).filter((t) => isWalkable(t.gx, t.gy));
  if (order === 'beam') {
    list = list.slice().sort((a, b) => (
      (Math.abs(a.gx - caster.gridX) + Math.abs(a.gy - caster.gridY))
      - (Math.abs(b.gx - caster.gridX) + Math.abs(b.gy - caster.gridY))
    ));
  }
  list.forEach((t, i) => {
    const delay = i * delayStep;
    const spawnFx = () => {
      tileSpellBurst(scene, centerX(t.gx), centerY(t.gy), tileSize, color, {
        duration,
        glyph: glyphChar,
        glyphColor,
      });
    };
    if (delay > 0) scene.time.delayedCall(delay, spawnFx);
    else spawnFx();
  });
}

/**
 * Aura burst at a world point using the spell's color/glyph.
 *
 * @param {any} scene
 * @param {number} tileSize
 * @param {number} x
 * @param {number} y
 * @param {Spell | null} spell
 * @param {number} [scale]
 */
export function showSpellAuraEffect(scene, tileSize, x, y, spell, scale = 1) {
  const fx = spellFxProfile(spell);
  spellAuraBurst(scene, x, y, tileSize, fx.color, fx.glyph, scale);
}

/**
 * Pick color + glyph for a creature ability (same palette as spellFxProfile
 * but reads `ability.name` + `ability.element`).
 *
 * @param {{ name?: string, element?: string } | null} ability
 */
export function abilityStyle(ability) {
  const n = String((ability && ability.name) || '').toLowerCase();
  const el = String((ability && ability.element) || '').toLowerCase();
  if (el.includes('fire')   || n.includes('fire'))                                      return { color: 0xfb7185, glyph: '✹' };
  if (el.includes('ice')    || n.includes('ice')    || n.includes('frost'))              return { color: 0x93c5fd, glyph: '❄' };
  if (el.includes('death')  || n.includes('death')  || n.includes('mort'))               return { color: 0xc4b5fd, glyph: '✢' };
  if (el.includes('energy') || n.includes('energy') || n.includes('vis'))                return { color: 0xa78bfa, glyph: '✧' };
  if (el.includes('earth')  || n.includes('earth')  || n.includes('poison'))             return { color: 0x86efac, glyph: '✶' };
  if (el.includes('holy')   || n.includes('holy'))                                       return { color: 0xfde68a, glyph: '✦' };
  if (el.includes('healing') || n.includes('heal'))                                      return { color: 0x60a5fa, glyph: '✚' };
  return { color: 0xe2e8f0, glyph: '✦' };
}

/**
 * Fireball-family abilities detonate an area explosion on the target
 * tile; size scales with the ability's effect-text max damage. Returns
 * the size in tiles (1.5–4.5). Default 2.2 for unknown ("?") effect.
 *
 * @param {{ effect?: string } | null} ability
 */
export function fireballSizeTilesForEffect(ability) {
  const raw = String((ability && ability.effect) || '');
  const nums = raw.match(/\d+/g) || [];
  let maxDmg = 0;
  for (const n of nums) maxDmg = Math.max(maxDmg, Number(n) || 0);
  if (maxDmg <= 0) return 2.2;
  return Phaser.Math.Clamp(1.5 + maxDmg / 250, 1.5, 4.5);
}

/**
 * Projectile line from caster to target + aura burst on impact.
 *
 * @param {any} scene
 * @param {SpellProjectileCtx} ctx
 * @param {Spell | null} spell
 * @param {Creature | null} target
 */
export function showSpellProjectileEffect(scene, ctx, spell, target) {
  if (!spell || !target || !target.sprite) return;
  const { player, tileSize } = ctx;
  const fx = spellFxProfile(spell);
  spellProjectileLine(scene, player.x, player.y, target.sprite.x, target.sprite.y, fx.color, fx.glyph, () => {
    showSpellAuraEffect(scene, tileSize, target.sprite.x, target.sprite.y, spell, 0.9);
  });
}
