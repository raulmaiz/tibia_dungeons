// Floor lifecycle (T-021/T-022): generate → derive MeshPlan → build themed
// instanced render → spawn enemies; dispose everything on descent.

import * as THREE from 'three';
import { MAX_DUNGEON_H, MAX_DUNGEON_W, START_TILE } from '../core/config';
import { themeForFloor } from '../data/themes';
import { generateLevelMap } from '../domain/dungeon/generator';
import { buildMeshPlan } from '../domain/dungeon/meshPlan';
import { isWalkable, tileMapFromGenerated, type TileMap } from '../domain/dungeon/tilemap';
import { makePrototypeEnemy, type Combatant } from '../entities/creature';
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
  tm: TileMap;
  spawn: { gx: number; gy: number };
  dungeon: DungeonHandles;
  enemies: EnemyEntry[];
  dispose(): void;
}

/** Placeholder enemy count until floorSpawnConfig lands (T-024). */
function enemyCountForFloor(floorLevel: number): number {
  return Math.min(6, 2 + floorLevel);
}

/** Scatter spawn tiles: walkable, far from the player spawn, spread apart. */
function pickEnemySpawns(tm: TileMap, count: number): { gx: number; gy: number }[] {
  const picks: { gx: number; gy: number }[] = [];
  const minPlayerDist = 7;
  const minMutualDist = 4;
  outer: for (let gy = 1; gy < tm.h - 1 && picks.length < count; gy += 2) {
    for (let gx = 1; gx < tm.w - 1 && picks.length < count; gx += 2) {
      if (!isWalkable(tm, gx, gy)) continue;
      if (Math.abs(gx - tm.spawn.gx) + Math.abs(gy - tm.spawn.gy) < minPlayerDist) continue;
      for (const p of picks) {
        if (Math.abs(gx - p.gx) + Math.abs(gy - p.gy) < minMutualDist) continue outer;
      }
      picks.push({ gx, gy });
    }
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

  const enemies: EnemyEntry[] = [];
  const spawns = pickEnemySpawns(tm, enemyCountForFloor(floorLevel));
  for (let i = 0; i < spawns.length; i += 1) {
    const s = spawns[i]!;
    const combatant = makePrototypeEnemy(`enemy-${floorLevel}-${i}`, s.gx, s.gy);
    const rig = await loadEnemyRig();
    scene.add(rig.root);
    enemies.push({ combatant, rig, ai: new ChaseAI(combatant) });
  }

  return {
    floorLevel,
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
