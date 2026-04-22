// Weapon classification + equipment queries + ammo rules.
//
// All functions are pure or near-pure: they take an `item` (catalog row
// or runtime equip) and return a boolean / string / number. The three
// `getEquipped*` helpers read through the panel's `window.debugInventory`
// bridge — still effectively pure from the engine's perspective since no
// closure state is touched.
//
// Extracted from game.engine.js Phase 4 (Combat prep). This module has
// no deps bag and no setup call — import the functions and call them.

/** @typedef {import('../../types.js').Item} Item */

// ── Equipment readers (via the panel's window.debugInventory bridge) ───

/** @returns {Item | null} */
export function getEquippedHandWeapon() {
  const state = window.debugInventory && typeof window.debugInventory.state === 'function'
    ? window.debugInventory.state()
    : null;
  return state && state.equipped ? state.equipped.hand : null;
}

/** @returns {Item | null} */
export function getEquippedAmmo() {
  const state = window.debugInventory && typeof window.debugInventory.state === 'function'
    ? window.debugInventory.state()
    : null;
  return state && state.equipped ? state.equipped.ammunition : null;
}

/** @returns {Item | null} */
export function getEquippedShield() {
  const state = window.debugInventory && typeof window.debugInventory.state === 'function'
    ? window.debugInventory.state()
    : null;
  return state && state.equipped ? state.equipped.shield : null;
}

// ── Weapon classification (pure) ───────────────────────────────────────

/** @param {Item | null} item */
export function isMagicRangedWeapon(item) {
  if (!item) return false;
  const t = String(item.item_type || '').toLowerCase();
  return t === 'rods' || t === 'wands';
}

/** @param {Item | null} item */
export function isThrowableWeapon(item) {
  if (!item) return false;
  if (item.throwable) return true;
  return String(item.type_secondary || '').toLowerCase() === 'throwing weapons';
}

/** @param {Item | null} item */
export function isClassicDistanceWeapon(item) {
  return Boolean(
    item
    && String(item.item_class || '').toLowerCase() === 'weapons'
    && String(item.item_type || '').toLowerCase() === 'distance weapons'
  );
}

/** @param {Item | null} item */
export function isDistanceWeapon(item) {
  return isClassicDistanceWeapon(item) || isMagicRangedWeapon(item);
}

// ── Magic weapon attribute readers ─────────────────────────────────────

/** @param {Item | null} weapon */
export function magicWeaponDamageTypeSuffix(weapon) {
  if (!weapon || !isMagicRangedWeapon(weapon)) return '';
  const attrs = Array.isArray(weapon.attributes) ? weapon.attributes : [];
  const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_type');
  const v = row ? String(row.value || '').trim() : '';
  return v ? ` (${v})` : '';
}

/** @param {Item | null} weapon */
export function magicWeaponDamageTypeRaw(weapon) {
  if (!weapon || !isMagicRangedWeapon(weapon)) return '';
  const attrs = Array.isArray(weapon.attributes) ? weapon.attributes : [];
  const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_type');
  return row ? String(row.value || '').trim() : '';
}

/** @param {Item | null} weapon */
export function magicWeaponManaCost(weapon) {
  if (!weapon || !isMagicRangedWeapon(weapon)) return 0;
  const attrs = Array.isArray(weapon.attributes) ? weapon.attributes : [];
  const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'mana_cost');
  const n = row ? Number(row.value) : 0;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// ── Ammo rules (pure) ──────────────────────────────────────────────────

/** @param {Item | null} weapon */
export function ammoKindForWeapon(weapon) {
  const secondary = String((weapon && weapon.type_secondary) || '').toLowerCase();
  if (secondary.includes('crossbow')) return 'bolt';
  if (secondary.includes('bow')) return 'arrow';
  return null;
}

/** @param {Item | null} ammoItem */
export function ammoKindForItem(ammoItem) {
  if (!ammoItem) return null;
  if (String(ammoItem.item_type || '').toLowerCase() !== 'ammunition') return null;
  const title = String(ammoItem.title || '').toLowerCase();
  if (title.includes('bolt')) return 'bolt';
  if (title.includes('arrow')) return 'arrow';
  return null;
}

/**
 * @param {Item | null} weapon
 * @param {Item | null} ammoItem
 */
export function isAmmoCompatibleWithWeapon(weapon, ammoItem) {
  const needed = ammoKindForWeapon(weapon);
  if (!needed) return true;
  const has = ammoKindForItem(ammoItem);
  return has === needed;
}

/** @param {Item | null} item */
export function requiresAmmoForWeapon(item) {
  return Boolean(
    item
    && isClassicDistanceWeapon(item)
    && !isThrowableWeapon(item)
  );
}

/** @param {Item | null} item */
export function hasAmmoForWeapon(item) {
  if (!requiresAmmoForWeapon(item)) return true;
  const ammo = getEquippedAmmo();
  if (!ammo) return false;
  const count = Math.max(0, Number(ammo.count || 0));
  if (count <= 0) return false;
  return isAmmoCompatibleWithWeapon(item, ammo);
}

/** @param {Item | null} [weapon] */
export function ammoAttackBonus(weapon = null) {
  const ammo = getEquippedAmmo();
  if (!ammo) return 0;
  if (weapon && !isAmmoCompatibleWithWeapon(weapon, ammo)) return 0;
  return Math.max(0, Number((ammo && ammo.attack_value) || 0));
}

// ── Range helpers ──────────────────────────────────────────────────────

/** @param {Item | null} item */
export function rangeFromAttributes(item) {
  const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
  const row = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'range');
  if (!row) return null;
  const n = Number(row.value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/** @param {Item | null} item */
export function effectiveWeaponRange(item) {
  if (!item) return 1;
  if (isMagicRangedWeapon(item)) {
    const fromAttrs = rangeFromAttributes(item);
    return fromAttrs != null ? fromAttrs : 5;
  }
  const fromAttrs = rangeFromAttributes(item);
  if (fromAttrs != null) return fromAttrs;
  const raw = Number(item.range_value || 1);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  if (isDistanceWeapon(item)) {
    return isThrowableWeapon(item) ? 4 : 5;
  }
  return 1;
}
