// SpriteFactory. Phase 4 of the architectural refactor — the SINGLE place
// where Phaser sprites for game entities are constructed and configured.
// Centralising this is the seam where future visual upgrades plug in:
//
//   • normal-map pipelines (per-sprite material data)
//   • Lights2D pipelines (entities have to opt-in via setPipeline)
//   • per-entity post-FX (bloom, color grading, outline shaders)
//
// Today the functions only set position/origin/size/depth — i.e. parity
// with the inline calls that used to live in the engine. New behaviours
// land here without the engine needing to learn about them.

import { TILE_SIZE } from '../config/game.config.js';
import { CREATURE_FILL_TARGET } from '../config/visual.config.js';
import { worldToScreen, worldX, worldY } from '../world/Projection.js';

// ── Texture-key helpers (canonical names, used by preload + factory) ──────
export function frameTextureName(sex, frame) {
  return `player_${sex}_${frame}`;
}
export function deathTextureName(sex) {
  return `player_death_${sex}`;
}
export function creatureKey(template) {
  return `creature_${template.id}`;
}

// Square fill (all creatures use the same sizing — bbox-relative scaling
// shifted the draw anchor in GIF/Phaser pipelines).
export function applyCreatureSize(sprite) {
  if (!sprite) return;
  const fillPx = TILE_SIZE * CREATURE_FILL_TARGET;
  sprite.setDisplaySize(fillPx, fillPx);
}

// ── Entity sprites ────────────────────────────────────────────────────────

export function createPlayerSprite(scene, sex, gx, gy) {
  const { x, y } = worldToScreen(gx, gy);
  const sprite = scene.add.sprite(x, y, frameTextureName(sex, 0));
  sprite.setOrigin(0.5, 0.5);
  sprite.setDisplaySize(TILE_SIZE * 0.9, TILE_SIZE * 0.9);
  sprite.setDepth(25);
  return sprite;
}

export function createCreatureSprite(scene, textureKey, gx, gy) {
  const { x, y } = worldToScreen(gx, gy);
  const sprite = scene.add.sprite(x, y, textureKey);
  sprite.setOrigin(0.5, 0.5);
  applyCreatureSize(sprite);
  sprite.setDepth(15);
  return sprite;
}

// ── Tile-bound sprites ────────────────────────────────────────────────────

export function createGroundTile(scene, x, y, fillColor = 0x080e18) {
  const rect = scene.add.rectangle(
    worldX(x),
    worldY(y),
    TILE_SIZE - 1,
    TILE_SIZE - 1,
    fillColor,
  );
  rect.setDepth(0);
  return rect;
}

export function createFireFieldSprite(scene, gx, gy) {
  const { x, y } = worldToScreen(gx, gy);
  const sprite = scene.add.image(x, y, 'fx_fire_field');
  sprite.setOrigin(0.5, 0.5);
  sprite.setDisplaySize(TILE_SIZE * 0.95, TILE_SIZE * 0.95);
  sprite.setDepth(6);
  return sprite;
}

export function createPoisonFieldSprite(scene, gx, gy) {
  const { x, y } = worldToScreen(gx, gy);
  const sprite = scene.add.image(x, y, 'fx_poison_field');
  sprite.setOrigin(0.5, 0.5);
  sprite.setDisplaySize(TILE_SIZE * 0.95, TILE_SIZE * 0.95);
  sprite.setDepth(6);
  return sprite;
}
