// Ground loot — Phase 4 extraction.
//
// Tile-keyed Map of piles of items dropped by dying creatures. Each pile
// renders a marker: first item's image if its texture is already loaded,
// otherwise a 📦 emoji until the texture finishes loading in the
// background. A small counter badge shows the item count when > 1.
//
// API:
//   setupGroundLoot(deps)          — once at scene create
//   dropItemOnGround(gx, gy, item) — called by combat when a creature dies
//   pickupGroundLootAtPlayer()     — called by movement when the player
//                                    steps onto (or interacts with) a pile
//   clearGroundLoot()              — descendLevel() flush
//
// deps: {
//   scene, tileSize, centerX, centerY,
//   getPlayerPos:    () => ({ gx, gy }),
//   onHudRefresh:    () => void,
// }

import { imageUrl } from '../../dataService.js';
import { addCombatLog } from './CombatLog.js';

let deps = null;
const groundLootByTile = new Map();

const groundTileKey = (gx, gy) => `${gx},${gy}`;
const groundLootTextureKey = (imagePath) =>
  `ground_loot_${String(imagePath || '').replace(/[^a-zA-Z0-9_]/g, '_')}`;

export function setupGroundLoot(_deps) {
  deps = _deps;
}

function refreshGroundLootMarker(entry) {
  if (!entry) return;
  const { scene, tileSize, centerX, centerY } = deps;
  const count = entry.items.length;
  const firstItem = count > 0 ? entry.items[0] : null;
  const markerX = centerX(entry.gx);
  const markerY = centerY(entry.gy) + tileSize * 0.18;
  const ensureTextMarker = (txt = '📦') => {
    if (!entry.marker || entry.marker.type !== 'Text') {
      if (entry.marker) entry.marker.destroy();
      entry.marker = scene.add.text(markerX, markerY, txt, {
        color: '#facc15',
        fontSize: '14px',
        fontStyle: 'bold',
      });
      entry.marker.setOrigin(0.5, 0.5);
    } else {
      entry.marker.setText(txt);
    }
  };
  const ensureImageMarker = (textureKey) => {
    const isImageMarker = entry.marker && entry.marker.type !== 'Text' && typeof entry.marker.setTexture === 'function';
    if (!isImageMarker) {
      if (entry.marker) entry.marker.destroy();
      entry.marker = scene.add.image(markerX, markerY, textureKey);
      entry.marker.setOrigin(0.5, 0.5);
      entry.marker.setDisplaySize(tileSize * 0.42, tileSize * 0.42);
    } else {
      entry.marker.setTexture(textureKey);
      entry.marker.setDisplaySize(tileSize * 0.42, tileSize * 0.42);
    }
  };
  if (count <= 0) {
    if (entry.marker) entry.marker.destroy();
    if (entry.markerCount) entry.markerCount.destroy();
    groundLootByTile.delete(groundTileKey(entry.gx, entry.gy));
    return;
  }
  if (firstItem && firstItem.image) {
    const textureKey = groundLootTextureKey(firstItem.image);
    if (scene.textures.exists(textureKey)) {
      ensureImageMarker(textureKey);
    } else {
      ensureTextMarker('📦');
      if (entry.loadingTextureKey !== textureKey) {
        entry.loadingTextureKey = textureKey;
        scene.load.image(textureKey, imageUrl(firstItem.image));
        scene.load.once(`filecomplete-image-${textureKey}`, () => {
          entry.loadingTextureKey = null;
          refreshGroundLootMarker(entry);
        });
        if (!scene.load.isLoading()) scene.load.start();
      }
    }
  } else {
    ensureTextMarker('📦');
  }
  if (!entry.markerCount) {
    entry.markerCount = scene.add.text(markerX + tileSize * 0.2, markerY + tileSize * 0.08, '', {
      color: '#f8fafc',
      fontSize: '10px',
      fontStyle: 'bold',
    });
    entry.markerCount.setOrigin(1, 1);
  }
  entry.markerCount.setPosition(markerX + tileSize * 0.2, markerY + tileSize * 0.08);
  entry.markerCount.setText(count > 1 ? String(count) : '');
}

export function dropItemOnGround(gx, gy, item) {
  const key = groundTileKey(gx, gy);
  if (!groundLootByTile.has(key)) {
    groundLootByTile.set(key, { gx, gy, items: [], marker: null, markerCount: null, loadingTextureKey: null });
  }
  const entry = groundLootByTile.get(key);
  const incoming = { ...item };
  if (incoming.isStackable) {
    const stackIdx = entry.items.findIndex((it) => (
      Boolean(it && it.isStackable)
      && (
        (incoming.id != null && it.id != null && Number(incoming.id) === Number(it.id))
        || String(incoming.title || '').toLowerCase() === String(it.title || '').toLowerCase()
      )
    ));
    if (stackIdx >= 0) {
      entry.items[stackIdx].count = Math.max(1, Number(entry.items[stackIdx].count || 1)) + Math.max(1, Number(incoming.count || 1));
      refreshGroundLootMarker(entry);
      return;
    }
  }
  entry.items.push(incoming);
  refreshGroundLootMarker(entry);
}

export function pickupGroundLootAtPlayer() {
  const { gx, gy } = deps.getPlayerPos();
  const key = groundTileKey(gx, gy);
  const entry = groundLootByTile.get(key);
  if (!entry || entry.items.length === 0) return;
  const kept = [];
  let picked = 0;
  for (const item of entry.items) {
    const stored = window.debugInventory && typeof window.debugInventory.addLoot === 'function'
      ? window.debugInventory.addLoot(item)
      : false;
    if (stored) {
      picked += 1;
      addCombatLog(`Picked from ground: ${item.title}.`);
    } else {
      kept.push(item);
    }
  }
  entry.items = kept;
  refreshGroundLootMarker(entry);
  if (picked > 0) deps.onHudRefresh();
}

export function clearGroundLoot() {
  for (const entry of groundLootByTile.values()) {
    if (entry.marker) entry.marker.destroy();
    if (entry.markerCount) entry.markerCount.destroy();
  }
  groundLootByTile.clear();
}
