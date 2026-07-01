// Floor spawn tables — TS port of game/js/data/floorSpawnConfig.js.
// Values byte-identical to the 2D version (floors 1-20 hand-tuned).

export interface CreatureTemplate {
  id: number;
  title: string;
  typePrimary: string;
  experience: number;
  hitpoints: number;
  maxDamage: number;
  /** Tibia speed value (~60 slow … ~170 fast). */
  speed: number;
  /** HP threshold at which the creature flees (0 = never). AI parity: T-050. */
  runsAt: number;
}

/** Exact per-creature counts for the fixed floors 1-20. id → count. */
export const FLOOR_CREATURE_COUNTS: Record<number, Record<number, number>> = {
  1: { 1116: 10 },
  2: { 1261: 10 },
  3: { 1141: 15 },
  4: { 1166: 20 },
  5: { 1457: 15, 1547: 10 },
  6: { 1243: 15, 1248: 10 },
  7: { 1355: 10, 1358: 20 },
  8: { 1235: 10, 1236: 20 },
  9: { 1382: 20, 25439: 10, 25465: 10, 20261: 10 },
  10: { 1178: 10, 1501: 10, 1499: 10, 1497: 10, 1498: 10 },
  11: { 1235: 10, 1236: 10, 1238: 10, 1174: 10, 67733: 10 },
  12: { 1355: 20, 1358: 10, 1357: 10, 1356: 10 },
  13: { 4338: 10, 4339: 10, 3201: 10, 41737: 10, 41734: 10 },
  14: { 1150: 25, 1541: 10 },
  15: { 1483: 20 },
  16: { 25469: 25 },
  17: { 742: 25, 1150: 10 },
  18: { 1318: 25, 1377: 25 },
  19: { 1253: 25 },
  20: { 1176: 1 },
};

/** HUD label per floor — canonical source of truth. */
export const FLOOR_DISPLAY_LABEL: Record<number, string> = {
  1: 'Rats',
  2: 'Wolves',
  3: 'Rotworms',
  4: 'Trolls',
  5: 'Undead',
  6: 'Humans',
  7: 'Dwarves',
  8: 'Minotaurs',
  9: 'Goblins',
  10: 'Orcs',
  11: 'Minotaurs',
  12: 'Dwarves',
  13: 'Lizards',
  14: 'Vampires',
  15: 'Giant Spiders',
  16: 'Wyrms',
  17: 'Outlaws',
  18: 'Dragons',
  19: 'Behemoths',
  20: 'Demons',
};

/**
 * Hand-tuned templates for creatures whose catalog rows are incomplete —
 * merged over catalog data when present (legacy FORCED_CREATURE_TEMPLATE(S)).
 */
export const FALLBACK_TEMPLATES: Record<number, CreatureTemplate> = {
  1116: { id: 1116, title: 'Rat', typePrimary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, speed: 67, runsAt: 5 },
  1261: { id: 1261, title: 'Wolf', typePrimary: 'Canines', experience: 18, hitpoints: 25, maxDamage: 10, speed: 82, runsAt: 8 },
  1141: { id: 1141, title: 'Rotworm', typePrimary: 'Annelids', experience: 40, hitpoints: 65, maxDamage: 18, speed: 58, runsAt: 0 },
  1166: { id: 1166, title: 'Troll', typePrimary: 'Trolls', experience: 20, hitpoints: 50, maxDamage: 10, speed: 90, runsAt: 10 },
  1457: { id: 1457, title: 'Ghoul', typePrimary: 'Undead Humanoids', experience: 85, hitpoints: 100, maxDamage: 20, speed: 72, runsAt: 0 },
  1547: { id: 1547, title: 'Skeleton', typePrimary: 'Skeletons', experience: 35, hitpoints: 50, maxDamage: 12, speed: 77, runsAt: 0 },
  1243: { id: 1243, title: 'Hunter', typePrimary: 'Outlaws', experience: 150, hitpoints: 150, maxDamage: 35, speed: 105, runsAt: 10 },
  1248: { id: 1248, title: 'Valkyrie', typePrimary: 'Amazons', experience: 85, hitpoints: 190, maxDamage: 14, speed: 88, runsAt: 10 },
  1355: { id: 1355, title: 'Dwarf', typePrimary: 'Dwarves', experience: 45, hitpoints: 90, maxDamage: 10, speed: 85, runsAt: 0 },
  1358: { id: 1358, title: 'Dwarf Soldier', typePrimary: 'Dwarves', experience: 70, hitpoints: 135, maxDamage: 20, speed: 88, runsAt: 0 },
  1235: { id: 1235, title: 'Minotaur', typePrimary: 'Minotaurs', experience: 50, hitpoints: 100, maxDamage: 12, speed: 84, runsAt: 0 },
  1236: { id: 1236, title: 'Minotaur Archer', typePrimary: 'Minotaurs', experience: 65, hitpoints: 100, maxDamage: 24, speed: 80, runsAt: 0 },
  1150: { id: 1150, title: 'Vampire', typePrimary: 'Vampires', experience: 305, hitpoints: 475, maxDamage: 40, speed: 119, runsAt: 0 },
  1541: { id: 1541, title: 'Demon Skeleton', typePrimary: 'Skeletons', experience: 240, hitpoints: 400, maxDamage: 45, speed: 90, runsAt: 0 },
  742: { id: 742, title: 'Hero', typePrimary: 'Outlaws', experience: 1200, hitpoints: 1400, maxDamage: 60, speed: 140, runsAt: 0 },
  1483: { id: 1483, title: 'Giant Spider', typePrimary: 'Arachnids', experience: 900, hitpoints: 1300, maxDamage: 38, speed: 120, runsAt: 0 },
  1318: { id: 1318, title: 'Dragon', typePrimary: 'Dragons', experience: 700, hitpoints: 1000, maxDamage: 45, speed: 86, runsAt: 300 },
  1377: { id: 1377, title: 'Dragon Lord', typePrimary: 'Dragons', experience: 2100, hitpoints: 1900, maxDamage: 67, speed: 100, runsAt: 300 },
  41735: { id: 41735, title: 'Lizard Zaogun', typePrimary: 'High Class Lizards', experience: 1700, hitpoints: 2955, maxDamage: 52, speed: 138, runsAt: 0 },
  88676: { id: 88676, title: 'Cobra Scout', typePrimary: 'Members of the Order of the Cobra', experience: 7310, hitpoints: 8500, maxDamage: 70, speed: 150, runsAt: 0 },
  1253: { id: 1253, title: 'Behemoth', typePrimary: 'Giants', experience: 2500, hitpoints: 4000, maxDamage: 64, speed: 170, runsAt: 0 },
  1176: { id: 1176, title: 'Demon', typePrimary: 'Demons', experience: 6000, hitpoints: 8200, maxDamage: 95, speed: 128, runsAt: 0 },
};
