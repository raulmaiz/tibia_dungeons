// Tibia Dungeons 3D — prototype entry point (F1).
// Terrain from a generated dungeon, animated player, click-to-move (A*),
// Diablo-4 camera, one chasing enemy, minimal HUD.

import * as THREE from 'three';
import { MAX_DUNGEON_H, MAX_DUNGEON_W, START_TILE } from './core/config';
import { bus } from './core/events';
import { tileToWorld, worldToTile } from './core/grid';
import { generateLevelMap } from './domain/dungeon/generator';
import { isWalkable, tileMapFromGenerated, type TileMap } from './domain/dungeon/tilemap';
import { progressionStatsForLevel } from './domain/progression';
import { makePlayer, makePrototypeEnemy, type Combatant } from './entities/creature';
import { attachPointerInput } from './input/pointer';
import { Diablo4Camera } from './render/camera';
import { loadEnemyRig, loadPlayerRig, type CharacterRig } from './render/character';
import { buildTerrain, createRenderer, createScene } from './render/scene';
import { ChaseAI } from './systems/ai';
import { tryCreatureAttack, tryPlayerAttack } from './systems/combat';
import { findPath } from './systems/pathfinding';
import { Hud } from './ui/hud';

const FLOOR_LEVEL = 1;

interface EnemyEntry {
  combatant: Combatant;
  rig: CharacterRig;
  ai: ChaseAI;
}

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);

  const renderer = createRenderer(canvas);
  const scene = createScene();
  const cam = new Diablo4Camera(window.innerWidth / window.innerHeight);

  // ── World ────────────────────────────────────────────────────────────────
  const level = generateLevelMap({
    totalCreatures: 15,
    MAP_W: MAX_DUNGEON_W,
    MAP_H: MAX_DUNGEON_H,
    START_TILE,
  });
  // Spawn at the center of the first room — the corner START_TILE corridor
  // hid the character between walls at the camera's fixed pitch.
  const spawnRoom = level.rooms[0]!;
  const spawn = {
    gx: Math.floor(spawnRoom.x + spawnRoom.w / 2),
    gy: Math.floor(spawnRoom.y + spawnRoom.h / 2),
  };
  const tm: TileMap = tileMapFromGenerated(level, spawn);
  const terrain = buildTerrain(scene, tm);

  // ── Player ───────────────────────────────────────────────────────────────
  const stats = progressionStatsForLevel(1, 'knight');
  let player = makePlayer(spawn.gx, spawn.gy, stats.maxHp);
  const playerRig = await loadPlayerRig();
  scene.add(playerRig.root);

  // ── Enemy (prototype: one brute near the first room) ─────────────────────
  const enemySpawn = findEnemySpawn(tm);
  const enemy = makePrototypeEnemy('enemy-1', enemySpawn.gx, enemySpawn.gy);
  const enemyRig = await loadEnemyRig();
  scene.add(enemyRig.root);
  const enemies: EnemyEntry[] = [{ combatant: enemy, rig: enemyRig, ai: new ChaseAI(enemy) }];

  let attackTargetId: string | null = null;

  // ── Move marker ──────────────────────────────────────────────────────────
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.8 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  // ── Input ────────────────────────────────────────────────────────────────
  attachPointerInput(
    canvas,
    cam,
    terrain.groundPickPlane,
    () => new Map(enemies.filter((e) => e.combatant.alive).map((e) => [e.combatant.id, e.rig.root])),
    {
      onGroundClick: (wx, wz) => {
        attackTargetId = null;
        const goal = worldToTile(wx, wz);
        if (!isWalkable(tm, goal.gx, goal.gy)) return;
        const path = findPath(tm, { gx: player.mover.gx, gy: player.mover.gy }, goal);
        if (path) {
          player.mover.setPath(path);
          const { x, z } = tileToWorld(goal.gx, goal.gy);
          marker.position.set(x, 0.02, z);
          marker.visible = true;
        }
      },
      onEnemyClick: (enemyId) => {
        attackTargetId = enemyId;
      },
    },
  );

  // ── Combat feedback → HUD floaters ──────────────────────────────────────
  bus.on('entity:damaged', ({ id, amount, crit, gx, gy }) => {
    const { x, z } = tileToWorld(gx, gy);
    const pos = new THREE.Vector3(x, 1.4, z);
    if (id === 'player') {
      hud.spawnDamageNumber(pos, cam.camera, `-${amount}`, 'incoming');
    } else {
      hud.spawnDamageNumber(pos, cam.camera, crit ? `${amount}!` : `${amount}`, crit ? 'crit' : 'hit');
    }
  });
  bus.on('player:dead', () => {
    hud.showDeath(() => {
      // Simple respawn: restore HP at the spawn tile.
      player = makePlayer(spawn.gx, spawn.gy, stats.maxHp);
      const { x, z } = tileToWorld(spawn.gx, spawn.gy);
      cam.snapTo(new THREE.Vector3(x, 0, z));
    });
  });

  // ── Camera start ─────────────────────────────────────────────────────────
  {
    const { x, z } = tileToWorld(player.mover.gx, player.mover.gy);
    cam.snapTo(new THREE.Vector3(x, 0, z));
  }

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.onResize(window.innerWidth / window.innerHeight);
  });

  // ── Game loop ────────────────────────────────────────────────────────────
  let lastMs = performance.now();
  renderer.setAnimationLoop(() => {
    const nowMs = performance.now();
    const dtMs = Math.min(100, nowMs - lastMs); // clamp tab-switch spikes
    const dt = dtMs / 1000;
    lastMs = nowMs;

    // Player chases its attack target when one is set.
    const target = enemies.find((e) => e.combatant.id === attackTargetId)?.combatant ?? null;
    if (target && target.alive && player.alive) {
      if (player.isAdjacentTo(target)) {
        player.mover.stop();
        const result = tryPlayerAttack(player, target, nowMs);
        if (result?.missed) {
          const { x, z } = tileToWorld(target.mover.gx, target.mover.gy);
          hud.spawnDamageNumber(new THREE.Vector3(x, 1.4, z), cam.camera, 'miss', 'miss');
        }
      } else if (!player.mover.isMoving) {
        const path = findPath(
          tm,
          { gx: player.mover.gx, gy: player.mover.gy },
          { gx: target.mover.gx, gy: target.mover.gy },
        );
        if (path) {
          path.pop(); // stop adjacent
          player.mover.setPath(path);
        }
      }
    }

    // Movement + AI + creature attacks.
    player.mover.update(dtMs);
    for (const e of enemies) {
      if (!e.combatant.alive) continue;
      e.ai.update(tm, player, nowMs);
      e.combatant.mover.update(dtMs);
      tryCreatureAttack(e.combatant, player, FLOOR_LEVEL, nowMs);
    }

    // Sync rigs with movers.
    syncRig(playerRig, player, dt);
    for (const e of enemies) {
      if (e.combatant.alive) {
        syncRig(e.rig, e.combatant, dt);
      } else if (e.rig.root.visible) {
        e.rig.root.visible = false;
      }
    }
    if (!player.mover.isMoving && marker.visible) marker.visible = false;

    // Camera + HUD + render.
    const { x, z } = tileToWorld(player.mover.gx, player.mover.gy);
    cam.update(new THREE.Vector3(player.mover.worldX, 0, player.mover.worldZ).lerp(new THREE.Vector3(x, 0, z), 0), dt);
    hud.updatePlayerBars(player);
    hud.tickFps(nowMs);
    renderer.render(scene, cam.camera);
  });
}

function syncRig(rig: CharacterRig, combatant: Combatant, dt: number): void {
  rig.root.position.set(combatant.mover.worldX, 0, combatant.mover.worldZ);
  if (combatant.mover.isMoving) {
    // Smooth turn toward the heading.
    const current = rig.root.rotation.y;
    let delta = combatant.mover.heading - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    rig.root.rotation.y = current + delta * Math.min(1, dt * 12);
    rig.play('walk');
  } else {
    rig.play('idle');
  }
  rig.update(dt);
}

/** First walkable tile far enough from the player spawn to be interesting. */
function findEnemySpawn(tm: TileMap): { gx: number; gy: number } {
  for (let radius = 6; radius < Math.max(tm.w, tm.h); radius += 1) {
    for (let gy = 1; gy < tm.h - 1; gy += 1) {
      for (let gx = 1; gx < tm.w - 1; gx += 1) {
        const dist = Math.abs(gx - tm.spawn.gx) + Math.abs(gy - tm.spawn.gy);
        if (dist === radius && isWalkable(tm, gx, gy)) return { gx, gy };
      }
    }
  }
  return { gx: tm.spawn.gx + 1, gy: tm.spawn.gy };
}

boot().catch((err) => {
  console.error('[boot] fatal:', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div style="color:#f66;padding:16px;font-family:monospace">Boot failed — see console.</div>',
  );
});
