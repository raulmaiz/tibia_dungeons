// Model registry: creature family → glb file + target world height.
// Scale is auto-derived from the model's bounding box, so swapping assets
// never needs manual tuning. Missing files fall back to the Soldier
// placeholder at load time (see character.ts).

export interface ModelSpec {
  url: string;
  /** Desired world height in tiles (player ≈ 0.95). */
  targetHeight: number;
  /** Extra yaw baked into the rig (Soldier faces -Z; glTF standard is +Z). */
  yawOffset: number;
}

export const SOLDIER_FALLBACK: ModelSpec = {
  url: '/assets/models/Soldier.glb',
  targetHeight: 0.95,
  yawOffset: Math.PI,
};

export const HERO_MODEL: ModelSpec = {
  url: '/assets/models/hero.glb',
  targetHeight: 0.95,
  yawOffset: 0,
};

export type CreatureModelKey = 'rat' | 'wolf' | 'skeleton' | 'monster';

export const CREATURE_MODELS: Record<CreatureModelKey, ModelSpec> = {
  rat: { url: '/assets/models/creatures/rat.glb', targetHeight: 0.38, yawOffset: 0 },
  wolf: { url: '/assets/models/creatures/wolf.glb', targetHeight: 0.6, yawOffset: 0 },
  skeleton: { url: '/assets/models/creatures/skeleton.glb', targetHeight: 0.95, yawOffset: 0 },
  monster: { url: '/assets/models/creatures/monster.glb', targetHeight: 1.05, yawOffset: 0 },
};

/** Map a Tibia `type_primary` family to the closest available model. */
export function modelKeyForFamily(typePrimary: string): CreatureModelKey {
  const f = typePrimary.toLowerCase();
  if (/glires|rodent|annelid|arachnid|insect|vermin/.test(f)) return 'rat';
  if (/canine|feline|bear|boar|mammal|beast/.test(f)) return 'wolf';
  if (/skeleton|undead|vampire|ghost|bone/.test(f)) return 'skeleton';
  return 'monster';
}
