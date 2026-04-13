const BASE_PLAYER_HP = 150;
const BASE_PLAYER_MANA = 10;
const BASE_PLAYER_CAPACITY = 400;

const CLASS_GROWTH = {
  knight: { hp: 15, mana: 5, capacity: 25 },
  paladin: { hp: 10, mana: 15, capacity: 20 },
  sorcerer: { hp: 5, mana: 30, capacity: 10 },
  druid: { hp: 5, mana: 30, capacity: 10 },
};

const CLASS_MAGIC_LEVEL_GROWTH = {
  knight: 0.12,
  paladin: 0.45,
  sorcerer: 1.0,
  druid: 1.0,
};

/** Wand/Rod `damage_range` attribute: "70-110" or "106". */
export function parseDamageRangeString(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const n = Number(s);
  return Number.isFinite(n) ? { min: n, max: n } : null;
}

/** Tooltip preview: average of range × ML / level scaling (matches in-game formula without random roll). */
export function averageMagicWeaponHitPreview(damageRangeRaw, ml, playerLevel) {
  const dr = parseDamageRangeString(damageRangeRaw);
  if (!dr) return null;
  const avg = (dr.min + dr.max) / 2;
  const mlN = Math.max(0, Number(ml) || 0);
  const plN = Math.max(1, Number(playerLevel) || 1);
  const scaled = avg * (1 + mlN * 0.045) * (1 + (plN - 1) * 0.01);
  return Math.max(1, Math.floor(scaled));
}

export function progressionStatsForLevel(level, playerClass = 'knight') {
  const lv = Math.max(1, Number(level || 1));
  const growth = CLASS_GROWTH[playerClass] || CLASS_GROWTH.knight;
  const mlGrowth = Number(CLASS_MAGIC_LEVEL_GROWTH[playerClass] || CLASS_MAGIC_LEVEL_GROWTH.knight);
  return {
    maxHp: BASE_PLAYER_HP + (lv - 1) * growth.hp,
    maxMana: BASE_PLAYER_MANA + (lv - 1) * growth.mana,
    capacity: BASE_PLAYER_CAPACITY + (lv - 1) * growth.capacity,
    magicLevel: Math.max(0, Math.floor((lv - 1) * mlGrowth)),
  };
}
