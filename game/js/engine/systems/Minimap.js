// Minimap - Phase 4 extraction from game.engine.js.
//
// Owns the #minimapCanvas 2D rendering (base layer + dynamic overlay).
// Module-level state because there is exactly one minimap per page; the
// alternative (a factory returning two closures) would read the same but
// save a line per call site. Not worth the indirection.
//
// Two public functions:
//
//   drawMinimapBase({ map, dungeonW, dungeonH, stairsTile, startTile })
//     Full repaint. Called on every descendLevel() - the dungeon layout,
//     stairs and start tile change per floor. Captures the finished base
//     into an ImageData snapshot so the per-frame overlay is fast.
//
//   drawMinimapDynamic({ creatures, gridX, gridY })
//     Overlay on top of the cached base: convinced allies (green) +
//     player (white). Called on a 200ms tick. Enemies stay hidden so the
//     minimap is a navigation aid, not a combat tracker.
//
// `initMinimap()` grabs the DOM refs. Must be called once before the
// draw functions - the engine does this at scene `create` time.

const PAD = 5;

let canvasEl = null;
let ctx2d = null;
let mmTile = 3;
let baseImageData = null;

export function initMinimap() {
  canvasEl = /** @type {HTMLCanvasElement|null} */ (document.getElementById('minimapCanvas'));
  // `willReadFrequently: true` tells the browser we plan to call getImageData
  // often (for the dynamic overlay) and picks a CPU-backed canvas so the
  // readback doesn't stall round-tripping from the GPU.
  ctx2d = canvasEl ? canvasEl.getContext('2d', { willReadFrequently: true }) : null;
  mmTile = 3;
  baseImageData = null;
}

export function drawMinimapBase({ map, dungeonW, dungeonH, stairsTile, startTile }) {
  if (!ctx2d || !canvasEl) return;
  const containerW = (canvasEl.parentElement && canvasEl.parentElement.clientWidth) || 252;
  mmTile = Math.max(2, Math.floor((containerW - PAD * 2) / dungeonW));
  const mmW = dungeonW * mmTile + PAD * 2;
  const mmH = dungeonH * mmTile + PAD * 2;
  canvasEl.width = mmW;
  canvasEl.height = mmH;

  // Background
  ctx2d.fillStyle = 'rgba(5,10,20,0.95)';
  ctx2d.fillRect(0, 0, mmW, mmH);
  // Border
  ctx2d.strokeStyle = 'rgba(56,189,248,0.35)';
  ctx2d.lineWidth = 1;
  ctx2d.strokeRect(0.5, 0.5, mmW - 1, mmH - 1);
  // Floor tiles
  ctx2d.fillStyle = '#2a3a52';
  for (let gy = 0; gy < dungeonH; gy++) {
    const row = map[gy];
    if (!row) continue;
    for (let gx = 0; gx < dungeonW; gx++) {
      if (row[gx] === '.') {
        ctx2d.fillRect(
          PAD + gx * mmTile,
          PAD + gy * mmTile,
          mmTile,
          mmTile
        );
      }
    }
  }
  // Stairs down (yellow-orange)
  ctx2d.fillStyle = '#fbbf24';
  ctx2d.fillRect(
    PAD + stairsTile.gx * mmTile - 1,
    PAD + stairsTile.gy * mmTile - 1,
    mmTile + 2,
    mmTile + 2
  );
  // Stairs up / rope (sky-blue)
  ctx2d.fillStyle = '#38bdf8';
  ctx2d.fillRect(
    PAD + startTile.gx * mmTile - 1,
    PAD + startTile.gy * mmTile - 1,
    mmTile + 2,
    mmTile + 2
  );
  // Save static snapshot for fast dynamic overlay
  baseImageData = ctx2d.getImageData(0, 0, mmW, mmH);
}

export function drawMinimapDynamic({ creatures, gridX, gridY }) {
  if (!ctx2d || !baseImageData) return;
  ctx2d.putImageData(baseImageData, 0, 0);
  // Convinced/summoned allies - green dots so the player can locate
  // them when they wander out of sight.
  if (Array.isArray(creatures)) {
    ctx2d.fillStyle = '#22c55e';
    for (const c of creatures) {
      if (!c || !c.alive || !c.isConvinced) continue;
      ctx2d.fillRect(
        PAD + c.gx * mmTile,
        PAD + c.gy * mmTile,
        mmTile,
        mmTile
      );
    }
  }
  // Player on top so it stays visible when an ally shares the tile.
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(
    PAD + gridX * mmTile,
    PAD + gridY * mmTile,
    mmTile,
    mmTile
  );
}
