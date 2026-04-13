export const EARLY_LEVELS = 12;

export const FORCED_CREATURE_ID_BY_LEVEL = {
  1: 1116,
  2: 1261,
  3: 1141,
  10: 742,
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
  10: { id: 742, title: 'Hero', type_primary: 'Outlaws', experience: 1200, hitpoints: 1400, maxDamage: 60, image: 'creature/Hero.gif', speed: 140, runs_at: 0 },
};

export const FORCED_CREATURE_TEMPLATES_BY_LEVEL = {
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
