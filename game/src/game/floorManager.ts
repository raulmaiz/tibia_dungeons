// Floor lifecycle (T-021/T-022/T-024): generate → derive MeshPlan → build
// themed instanced render → spawn creatures from the floor tables; dispose
// everything on descent.

import * as THREE from 'three';
import { MAX_DUNGEON_H, MAX_DUNGEON_W, START_TILE } from '../core/config';
import { loadCreatureCatalog } from '../data/dataService';
import { themeForFloor } from '../data/themes';
import { generateLevelMap } from '../domain/dungeon/generator';
import { buildMeshPlan } from '../domain/dungeon/meshPlan';
import { isWalkable, tileMapFromGenerated, type TileMap } from '../domain/dungeon/tilemap';
import { buildSpawnPlan, floorLabel, moveDurationFromSpeed } from '../domain/spawning';
import { makeCreature, type Combatant } from '../entities/creature';
import { buildDungeon, type DungeonHandles } from '../render/dungeonRenderer';
import { loadEnemyRig, type CharacterRig } from '../render/character';
import { applyThemeLights, type SceneLights } from '../render/scene';
import { ChaseAI } from '../systems/ai';

export interface EnemyEntry {
  combatant: Combatant;
  rig: CharacterRig;
  ai: ChaseAI;
}

export interface FloorState {
  floorLevel: number;
  label: string;
  tm: TileMap;
  spawn: { gx: number; gy: number };
  dungeon: DungeonHandles;
  enemies: EnemyEntry[];
  dispose(): void;
}

/** Tint per creature family so packs read distinct until real models (T-052b). */
const FAMILY_TINTS = [0xff5544, 0xffaa33, 0x66ccff, 0xaa66ff, 0x66ff88, 0xffee55];
function tintForFamily(typePrimary: string): number {
  let h = 0;
  for (let i = 0; i < typePrimary.length; i += 1) h = (h * 31 + typePrimary.charCodeAt(i)) >>> 0;
  return FAMILY_TINTS[h % FAMILY_TINTS.length]!;
}

/** Walkable spawn tiles: far from the player, spread apart. */
function pickSpawnTiles(tm: TileMap, count: number): { gx: number; gy: number }[] {
  const picks: { gx: number; gy: number }[] = [];
  const minPlayerDist = 5; // close enough that the first pack is visible from spawn
  const minMutualDist = 3;
  const candidates: { gx: number; gy: number }[] = [];
  for (let gy = 1; gy < tm.h - 1; gy += 1) {
    for (let gx = 1; gx < tm.w - 1; gx += 1) {
      if (!isWalkable(tm, gx, gy)) continue;
      if (Math.abs(gx - tm.spawn.gx) + Math.abs(gy - tm.spawn.gy) < minPlayerDist) continue;
      candidates.push({ gx, gy });
    }
  }
  // Shuffle (spawn variety is cosmetic — Math.random is fine here).
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  outer: for (const c of candidates) {
    if (picks.length >= count) break;
    for (const p of picks) {
      if (Math.abs(c.gx - p.gx) + Math.abs(c.gy - p.gy) < minMutualDist) continue outer;
    }
    picks.push(c);
  }
  return picks;
}

export async function loadFloor(
  scene: THREE.Scene,
  lights: SceneLights,
  floorLevel: number,
): Promise<FloorState> {
  const level = generateLevelMap({
    totalCreatures: 15,
    MAP_W: MAX_DUNGEON_W,
    MAP_H: MAX_DUNGEON_H,
    START_TILE,
  });
  const spawnRoom = level.rooms[0]!;
  const spawn = {
    gx: Math.floor(spawnRoom.x + spawnRoom.w / 2),
    gy: Math.floor(spawnRoom.y + spawnRoom.h / 2),
  };
  const tm = tileMapFromGenerated(level, spawn);
  const theme = themeForFloor(floorLevel);
  const dungeon = buildDungeon(scene, tm, buildMeshPlan(tm), theme);
  applyThemeLights(lights, theme);

  // ── Creatures from the floor spawn tables (T-024) ────────────────────────
  const catalog = await loadCreatureCatalog().catch((err) => {
    console.error('[floorManager] creature catalog failed to load, using fallbacks only:', err);
    return new Map();
  });
  const plan = buildSpawnPlan(floorLevel, catalog);
  const totalWanted = plan.reduce((acc, e) => acc + e.count, 0);
  const tiles = pickSpawnTiles(tm, totalWanted);

  const enemies: EnemyEntry[] = [];
  let tileIdx = 0;
  for (const entry of plan) {
    for (let i = 0; i < entry.count && tileIdx < tiles.length; i += 1) {
      const tile = tiles[tileIdx]!;
      tileIdx += 1;
      const combatant = makeCreature(
        `c-${floorLevel}-${entry.template.id}-${i}`,
        tile.gx,
        tile.gy,
        {
          title: entry.template.title,
          hitpoints: entry.template.hitpoints,
          maxDamage: entry.template.maxDamage,
          moveDurationMs: moveDurationFromSpeed(entry.template.speed),
        },
      );
      const rig = await loadEnemyRig(tintForFamily(entry.template.typePrimary), entry.template.typePrimary);
      scene.add(rig.root);
      enemies.push({ combatant, rig, ai: new ChaseAI(combatant) });
    }
  }

  return {
    floorLevel,
    label: floorLabel(floorLevel),
    tm,
    spawn,
    dungeon,
    enemies,
    dispose() {
      dungeon.dispose();
      for (const e of enemies) scene.remove(e.rig.root);
    },
  };
}
