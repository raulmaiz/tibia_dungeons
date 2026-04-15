export const EARLY_LEVELS = 12;

export const FORCED_CREATURE_ID_BY_LEVEL = {
  1: 1116,
  2: 1261,
  3: 1141,
  // Floor 10 ya no usa ID único: tiene Hero + Vampire vía FLOOR_CREATURE_COUNTS
};

export const FORCED_CREATURE_IDS_BY_LEVEL = {
  5: [1457, 1547],
  6: [1243, 1248],
  7: [1355, 1358],
  8: [1235, 1236],
  9: [1150, 1541],
  15: [1483],
  16: [1318, 1377],
  18: [41735, 88676],
  19: [1253],
  20: [1176],
};

export const FORCED_CREATURE_TEMPLATE_BY_LEVEL = {
  1: { id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif', speed: 67, runs_at: 5 },
  2: { id: 1261, title: 'Wolf', type_primary: 'Canines', experience: 18, hitpoints: 25, maxDamage: 10, image: 'creature/Wolf.gif', speed: 82, runs_at: 8 },
  3: { id: 1141, title: 'Rotworm', type_primary: 'Annelids', experience: 40, hitpoints: 65, maxDamage: 18, image: 'creature/Rotworm.gif', speed: 58, runs_at: 0 },
};

export const FORCED_CREATURE_TEMPLATES_BY_LEVEL = {
  4: [
    { id: 1166, title: 'Troll', type_primary: 'Trolls', experience: 20, hitpoints: 50, maxDamage: 10, image: 'creature/Troll.gif', speed: 90, runs_at: 10 },
  ],
  5: [
    { id: 1457, title: 'Ghoul', type_primary: 'Undead Humanoids', experience: 85, hitpoints: 100, maxDamage: 20, image: 'creature/Ghoul.gif', speed: 72, runs_at: 0 },
    { id: 1547, title: 'Skeleton', type_primary: 'Skeletons', experience: 35, hitpoints: 50, maxDamage: 12, image: 'creature/Skeleton.gif', speed: 77, runs_at: 0 },
  ],
  6: [
    { id: 1243, title: 'Hunter', type_primary: 'Outlaws', experience: 150, hitpoints: 150, maxDamage: 35, image: 'creature/Hunter.gif', speed: 105, runs_at: 10 },
    { id: 1248, title: 'Valkyrie', type_primary: 'Amazons', experience: 85, hitpoints: 190, maxDamage: 14, image: 'creature/Valkyrie.gif', speed: 88, runs_at: 10 },
  ],
  7: [
    { id: 1355, title: 'Dwarf', type_primary: 'Dwarves', experience: 45, hitpoints: 90, maxDamage: 10, image: 'creature/Dwarf.gif', speed: 85, runs_at: 0 },
    { id: 1358, title: 'Dwarf Soldier', type_primary: 'Dwarves', experience: 70, hitpoints: 135, maxDamage: 20, image: 'creature/Dwarf Soldier.gif', speed: 88, runs_at: 0 },
  ],
  8: [
    { id: 1235, title: 'Minotaur', type_primary: 'Minotaurs', experience: 50, hitpoints: 100, maxDamage: 12, image: 'creature/Minotaur.gif', speed: 84, runs_at: 0 },
    { id: 1236, title: 'Minotaur Archer', type_primary: 'Minotaurs', experience: 65, hitpoints: 100, maxDamage: 24, image: 'creature/Minotaur Archer.gif', speed: 80, runs_at: 0 },
  ],
  9: [
    { id: 1150, title: 'Vampire', type_primary: 'Vampires', experience: 305, hitpoints: 475, maxDamage: 40, image: 'creature/Vampire.gif', speed: 119, runs_at: 0 },
    { id: 1541, title: 'Demon Skeleton', type_primary: 'Skeletons', experience: 240, hitpoints: 400, maxDamage: 45, image: 'creature/Demon Skeleton.gif', speed: 90, runs_at: 0 },
  ],
  10: [
    { id: 742,  title: 'Hero', type_primary: 'Outlaws', experience: 1200, hitpoints: 1400, maxDamage: 60, image: 'creature/Hero.gif', speed: 140, runs_at: 0 },
    { id: 1150, title: 'Vampire', type_primary: 'Vampires', experience: 305, hitpoints: 475, maxDamage: 40, image: 'creature/Vampire.gif', speed: 119, runs_at: 0 },
  ],
  15: [{ id: 1483, title: 'Giant Spider', type_primary: 'Arachnids', experience: 900, hitpoints: 1300, maxDamage: 38, image: 'creature/Giant Spider.gif', speed: 120, runs_at: 0 }],
  16: [
    { id: 1318, title: 'Dragon', type_primary: 'Dragons', experience: 700, hitpoints: 1000, maxDamage: 45, image: 'creature/Dragon.gif', speed: 86, runs_at: 300 },
    { id: 1377, title: 'Dragon Lord', type_primary: 'Dragons', experience: 2100, hitpoints: 1900, maxDamage: 67, image: 'creature/Dragon Lord.gif', speed: 100, runs_at: 300 },
  ],
  18: [
    { id: 41735, title: 'Lizard Zaogun', type_primary: 'High Class Lizards', experience: 1700, hitpoints: 2955, maxDamage: 52, image: 'creature/Lizard Zaogun.gif', speed: 138, runs_at: 0 },
    { id: 88676, title: 'Cobra Scout', type_primary: 'Members of the Order of the Cobra', experience: 7310, hitpoints: 8500, maxDamage: 70, image: 'creature/Cobra Scout.gif', speed: 150, runs_at: 0 },
  ],
  19: [{ id: 1253, title: 'Behemoth', type_primary: 'Giants', experience: 2500, hitpoints: 4000, maxDamage: 64, image: 'creature/Behemoth.gif', speed: 170, runs_at: 0 }],
  20: [{ id: 1176, title: 'Demon', type_primary: 'Demons', experience: 6000, hitpoints: 8200, maxDamage: 95, image: 'creature/Demon.gif', speed: 128, runs_at: 0 }],
};

export const TROLL_ALLOWED_IDS = [1166, 1167];

/**
 * Counts exactos por tipo de criatura para los floors fijos.
 * Clave: creature_id → cantidad a spawnear.
 * El sistema de spawn usará estos valores en lugar del rango aleatorio MIN/MAX.
 */
export const FLOOR_CREATURE_COUNTS = {
  1:  { 1116: 10 },
  2:  { 1261: 10 },
  3:  { 1141: 15 },
  4:  { 1166: 20 },
  5:  { 1457: 15, 1547: 10 },
  6:  { 1243: 15, 1248: 10 },
  7:  { 1355: 10, 1358: 20 },
  8:  { 1235: 10, 1236: 20 },
  9:  { 1382: 20, 25439: 10, 25465: 10, 20261: 10 },
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

/**
 * Display label shown in the HUD for each floor.
 * Canonical source of truth — avoids mismatches between pickGroupForLevel and FLOOR_CREATURE_COUNTS.
 */
export const FLOOR_DISPLAY_LABEL = {
  1:  'Rats',
  2:  'Wolves',
  3:  'Rotworms',
  4:  'Trolls',
  5:  'Undead',
  6:  'Humans',
  7:  'Dwarves',
  8:  'Minotaurs',
  9:  'Goblins',
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
