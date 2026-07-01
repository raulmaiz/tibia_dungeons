// Core gameplay constants — ported byte-identical from the 2D version
// (game/js/config/game.config.js). Numbers here change game balance;
// touch with care.

// ── World / grid ──────────────────────────────────────────────────────────
// 1 logical tile = 1 world unit on the XZ plane. The logical world is still
// a tile grid (ADR-001); 3D is presentation only.
export const TILE_WORLD_SIZE = 1;
export const START_TILE = { gx: 1, gy: 1 } as const;
export const MAX_DUNGEON_W = 60;
export const MAX_DUNGEON_H = 40;

// ── Creature spawn / progression ──────────────────────────────────────────
export const CREATURE_POOL_PER_LEVEL = 12;
export const MIN_CREATURES_PER_LEVEL = 10;
export const MAX_CREATURES_PER_LEVEL = 15;

// ── Player base stats ─────────────────────────────────────────────────────
export const PLAYER_BASE_DAMAGE = 12;
export const PLAYER_INITIAL_FIST_LEVEL = 10;
export const PLAYER_INITIAL_SHIELDING_LEVEL = 10;

// ── Action throttling ─────────────────────────────────────────────────────
// Move duration scales down with player level (faster at higher levels) and
// is clamped between MIN and MAX. Same idea for the bump-attack cooldown.
export const PLAYER_MOVE_DURATION_BASE_MS = 190;
export const PLAYER_MOVE_DURATION_MIN_MS = 130;
export const PLAYER_MOVE_DURATION_MAX_MS = 190;
export const PLAYER_ACTION_DELAY_BASE_MS = 320;
export const PLAYER_ACTION_DELAY_MIN_MS = 220;
export const PLAYER_ACTION_DELAY_MAX_MS = 320;

// ── Diablo-4-style camera (docs/migration-3d.md spec) ─────────────────────
export const CAMERA = {
  fovDeg: 45,
  /** Fixed pitch from the vertical, in degrees. Never changed by input. */
  pitchFromVerticalDeg: 57,
  minDistance: 8,
  maxDistance: 26,
  initialDistance: 14,
  /** Exponential follow smoothing factor (1 - exp(-k*dt)). */
  followLerpK: 6,
  /** Radians of yaw per pixel of right-button drag. */
  yawPerPixel: 0.005,
  /** Distance units per wheel notch (smoothed). */
  zoomStep: 1.6,
  zoomLerpK: 8,
} as const;
