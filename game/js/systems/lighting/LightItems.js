// Light-source items subsystem. Phase 5 of the architectural refactor —
// owns radius lookup, burn-duration tracking, slot icon resolution and the
// bridge to the atmosphere overlay (which is what actually draws the
// lit area on screen).
//
// State that lives here (private to this module):
//   • _currentLightItemState — the equipped light item's burn schedule
//   • _knownItemImages       — set of item image filenames known to the CDN
//   • _setEquipmentLight     — callback into floorAtmosphere, wired at boot
//
// Bytewise parity with the previous inline code in game.engine.js — the
// fix to the shared-article_id torch bug (commit ab50069) lives here too:
// burn progress is tracked on the item instance via `_burnElapsedMs`,
// not on the article id.

import { getManifest, imageUrl } from '../../dataService.js';
import {
  LIGHT_ITEM_ID_TORCH,
  LIGHT_ITEM_ID_LIGHT_WAND,
  LIGHT_RADIUS_TORCH,
  LIGHT_RADIUS_LIGHT_WAND,
  LIGHT_RADIUS_DEFAULT,
  DEFAULT_LIGHT_DURATION_MS,
  TORCH_BURN_MEDIUM_THRESHOLD,
  TORCH_BURN_SMALL_THRESHOLD,
} from '../../config/visual.config.js';

let _currentLightItemState = null;
let _knownItemImages = null;
let _setEquipmentLight = () => {}; // wired by attachAtmosphereLightSink

/**
 * Wires the floorAtmosphere bridge so this module can drive the on-screen
 * darkness/light overlay without holding a reference to the scene.
 */
export function attachAtmosphereLightSink(fn) {
  _setEquipmentLight = (typeof fn === 'function') ? fn : (() => {});
}

// ── Image catalog (CDN manifest) ──────────────────────────────────────────

export async function loadKnownItemImages() {
  try {
    const m = await getManifest();
    const s = new Set();
    for (const it of (m && m.items) || []) {
      const img = String((it && it.image) || '').trim().toLowerCase();
      if (img) s.add(img);
    }
    _knownItemImages = s;
  } catch {
    _knownItemImages = new Set();
  }
}

export function hasItemImage(filename) {
  if (!_knownItemImages) return false;
  return _knownItemImages.has(`item/${filename}`.toLowerCase());
}

// ── Pure helpers ──────────────────────────────────────────────────────────

export function lightRadiusForLightSourceItem(item) {
  const id = Number((item && (item.article_id || item.id)) || 0);
  if (id === LIGHT_ITEM_ID_TORCH)      return LIGHT_RADIUS_TORCH;
  if (id === LIGHT_ITEM_ID_LIGHT_WAND) return LIGHT_RADIUS_LIGHT_WAND;
  return LIGHT_RADIUS_DEFAULT;         // any other Light Sources → utevo gran lux
}

export function parseDurationStringToMs(raw) {
  if (!raw) return 0;
  const s = String(raw).toLowerCase().trim();
  const m = /^(\d+(?:\.\d+)?)\s*(second|minute|hour|day)s?$/.exec(s);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = m[2];
  const mult = { second: 1000, minute: 60000, hour: 3600000, day: 86400000 }[u];
  return Math.round(n * mult);
}

export function durationMsFromItemAttrs(item) {
  const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
  const attr = attrs.find((a) => String((a && a.name) || '').toLowerCase() === 'duration');
  const parsed = attr ? parseDurationStringToMs(attr.value) : 0;
  return parsed > 0 ? parsed : DEFAULT_LIGHT_DURATION_MS;
}

export function bridgeClockNow() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now() : Date.now();
}

// ── Slot icon resolution ──────────────────────────────────────────────────
// Torch (1396) has a 4-stage progression; every other Light-Sources item
// follows the generic <title> / Lit <title> / Used <title> pattern.
//   [0%, 50%)   Lit Torch.gif             (full flame)
//   [50%, 80%)  Lit Torch (Medium).gif    (half-consumed)
//   [80%, 100%) Lit Torch (Small).gif     (nearly out)
//   [100%, ∞)   Torch (Small).gif         (extinguished, no more light)

export function getLightItemImage(articleId, title, elapsed, duration) {
  if (Number(articleId) === LIGHT_ITEM_ID_TORCH) { // Torch — special 4-stage progression
    if (!(duration > 0)) return 'item/Lit Torch.gif';
    if (elapsed >= duration) return 'item/Torch (Small).gif';
    if (elapsed >= duration * TORCH_BURN_SMALL_THRESHOLD)  return 'item/Lit Torch (Small).gif';
    if (elapsed >= duration * TORCH_BURN_MEDIUM_THRESHOLD) return 'item/Lit Torch (Medium).gif';
    return 'item/Lit Torch.gif';
  }
  const name = String(title || '').trim();
  if (!name) return null;
  const isExpired = duration > 0 && elapsed >= duration;
  if (isExpired) {
    return hasItemImage(`Used ${name}.gif`) ? `item/Used ${name}.gif` : `item/${name}.gif`;
  }
  return hasItemImage(`Lit ${name}.gif`) ? `item/Lit ${name}.gif` : `item/${name}.gif`;
}

// Image for a light-source item sitting in the loot bag (i.e. not equipped).
// Returns null for non-light items so the caller can keep the default image.
export function getLootLightItemImage(item) {
  if (!item) return null;
  const itemType = String(item.item_type || '').toLowerCase();
  if (itemType !== 'light sources') return null;
  const articleId = Number(item.article_id || item.id || 0);
  const title = String(item.title || '').trim();
  const duration = durationMsFromItemAttrs(item);
  // Per-instance burn progress. A stub value of 0 for fresh items (market
  // purchases, loot drops) so the bag preview shows a lit icon rather than
  // inheriting some other torch's burn state.
  let elapsed = Number((item && item._burnElapsedMs) || 0);
  const isExpired = duration > 0 && elapsed >= duration;
  if (articleId === LIGHT_ITEM_ID_TORCH) { // Torch
    return isExpired ? 'item/Torch (Small).gif' : 'item/Torch.gif';
  }
  if (!title) return null;
  if (isExpired && hasItemImage(`Used ${title}.gif`)) return `item/Used ${title}.gif`;
  return `item/${title}.gif`;
}

// ── Equipped-light state ──────────────────────────────────────────────────

export function applyEquipmentLightFromItem(item) {
  const now = bridgeClockNow();
  if (!item) {
    _currentLightItemState = null;
    _setEquipmentLight(0, 0, 0);
    return;
  }
  const articleId = Number(item.article_id || item.id || 0);
  const radius = lightRadiusForLightSourceItem(item);
  const durationMs = durationMsFromItemAttrs(item);
  // Burn progress lives on the item instance itself (`_burnElapsedMs`). The
  // callers that move a torch from slot → bag (unequip or swap) stamp the
  // current elapsed there first, so re-equipping the SAME physical item
  // resumes its progress without bleeding onto a different torch that just
  // happens to share the same article_id (e.g. a fresh one from the market).
  const initialElapsed = Number((item && item._burnElapsedMs) || 0);
  _currentLightItemState = {
    articleId,
    title: String(item.title || '').trim(),
    radius,
    duration: durationMs,
    startTime: now,
    initialElapsed,
  };
  // Pass the real duration/elapsed to the atmosphere so it can hard-cutoff
  // the light when the torch burns out. The atmosphere keeps the radius
  // constant until then (no linear fade) — see updateDarkness.
  _setEquipmentLight(radius, durationMs, initialElapsed);
  updateEquippedLightSlotImage();
}

export function getCurrentLightElapsedMs() {
  if (!_currentLightItemState) return 0;
  const cur = _currentLightItemState;
  return cur.initialElapsed + (bridgeClockNow() - cur.startTime);
}

export function updateEquippedLightSlotImage() {
  const slotImg = document.getElementById('slotLightImg');
  if (!slotImg || !_currentLightItemState) return;
  const cur = _currentLightItemState;
  const elapsed = getCurrentLightElapsedMs();
  const img = getLightItemImage(cur.articleId, cur.title, elapsed, cur.duration);
  if (!img) return;
  const desiredSrc = imageUrl(img);
  if (!slotImg.src.endsWith(img)) slotImg.src = desiredSrc;
}

export function applyCurrentLightStateToAtmosphere() {
  if (!_currentLightItemState) { _setEquipmentLight(0, 0, 0); return; }
  const cur = _currentLightItemState;
  const sessionElapsed = bridgeClockNow() - cur.startTime;
  const totalElapsed = cur.initialElapsed + sessionElapsed;
  _setEquipmentLight(cur.radius, cur.duration, totalElapsed);
}
