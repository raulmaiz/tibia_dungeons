// Visual / layout constants. Extracted as part of Phase 1 of the architectural
// refactor — values are byte-identical to the literals previously inlined in
// game.engine.js. Future lighting / post-FX / isometric work plugs in here.

// ── Phaser scene background ───────────────────────────────────────────────
export const SCENE_BACKGROUND_COLOR = '#0a1220';

// ── Sprite sizing ─────────────────────────────────────────────────────────
// Creatures fit ~96% of their tile. Square scaling is intentional: scaling by
// the opaque bbox shifted the draw anchor in GIF/Phaser pipelines.
export const CREATURE_FILL_TARGET = 0.96;

// ── HUD layout (pixel reservations around the canvas) ─────────────────────
export const LEFT_SIDEBAR_W   = 0;
export const RIGHT_SIDEBAR_W  = 268;
// statsBar (~30px) + spellBar (~58px) + headroom
export const TOP_PANELS_H     = 88;
export const BOTTOM_BAR_H     = 72;
export const UI_BOTTOM_SPACE  = 88;
export const UI_OVERLAP_ROWS  = 1.5;

// ── Light sources ─────────────────────────────────────────────────────────
// Article ids used as sentinels for items with bespoke light behaviour.
export const LIGHT_ITEM_ID_TORCH      = 1396;
export const LIGHT_ITEM_ID_LIGHT_WAND = 1671;

// Radius (in tiles) emitted by an equipped light source.
export const LIGHT_RADIUS_TORCH      = 3; // utevo lux
export const LIGHT_RADIUS_LIGHT_WAND = 6; // utevo vis lux
export const LIGHT_RADIUS_DEFAULT    = 4; // any other Light Sources item

// Fallback when a light item has no `duration` attribute.
export const DEFAULT_LIGHT_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Torch icon swap thresholds (fraction of total burn duration):
//   [0%, 50%)   → Lit Torch.gif            (full flame)
//   [50%, 80%)  → Lit Torch (Medium).gif   (half-consumed)
//   [80%, 100%) → Lit Torch (Small).gif    (nearly out)
//   [100%, ∞)   → Torch (Small).gif        (extinguished)
export const TORCH_BURN_MEDIUM_THRESHOLD = 0.5;
export const TORCH_BURN_SMALL_THRESHOLD  = 0.8;
