// Core gameplay constants. Extracted as part of Phase 1 of the architectural
// refactor — values are byte-identical to the literals previously inlined in
// game.engine.js. Touch with care: numbers here change game balance.

// ── Map / dungeon dimensions ──────────────────────────────────────────────
export const TILE_SIZE = 40;        // pixels per tile (orthogonal projection)
export const MAP_W = 20;            // initial floor width in tiles
export const MAP_H = 15;            // initial floor height in tiles
// Largest possible floor — the tile grid is allocated at this size and the
// camera is then clamped to the actual dimensions of each level.
export const MAX_DUNGEON_W = 60;
export const MAX_DUNGEON_H = 40;

// ── Player starting state ─────────────────────────────────────────────────
export const START_TILE = { gx: 1, gy: 1 };
export const START_BAG_ARTICLE_ID = 1589;

// ── Coin economy ──────────────────────────────────────────────────────────
export const GOLD_COIN_ID = 2119;
export const PLATINUM_COIN_ID = 2828;
export const CRYSTAL_COIN_ID = 2948;
export const GOLD_PER_PLATINUM = 100;
export const PLATINUM_PER_CRYSTAL = 100;

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
export const PLAYER_MOVE_DURATION_MIN_MS  = 130;
export const PLAYER_MOVE_DURATION_MAX_MS  = 190;
export const PLAYER_ACTION_DELAY_BASE_MS  = 320;
export const PLAYER_ACTION_DELAY_MIN_MS   = 220;
export const PLAYER_ACTION_DELAY_MAX_MS   = 320;

// ── Hunger ────────────────────────────────────────────────────────────────
export const MAX_FOOD_SECONDS = 900;
