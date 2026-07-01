// Tibia Dungeons 3D — entry point.
// F1 prototype + F2: themed instanced dungeons, stairs descend between floors.

import * as THREE from 'three';
import { bus } from './core/events';
import { tileToWorld, worldToTile } from './core/grid';
import { isWalkable } from './domain/dungeon/tilemap';
import { progressionStatsForLevel } from './domain/progression';
import { makePlayer, type Combatant } from './entities/creature';
import { loadFloor, type FloorState } from './game/floorManager';
import { attachPointerInput } from './input/pointer';
import { Diablo4Camera } from './render/camera';
import { loadPlayerRig, type CharacterRig } from './render/character';
import { createRenderer, createScene, followShadow } from './render/scene';
import { tryCreatureAttack, tryPlayerAttack } from './systems/combat';
import { findPath } from './systems/pathfinding';
import { Hud } from './ui/hud';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#app')!;
  const hud = new Hud(document.querySelector<HTMLElement>('#hud')!);
  const fadeEl = document.querySelector<HTMLElement>('#fade')!;

  const renderer = createRenderer(canvas);
  const { scene, lights } = createScene();
  const cam = new Diablo4Camera(window.innerWidth / window.innerHeight);

  // ── Floor + player state ─────────────────────────────────────────────────
  let floorLevel = 1;
  let floor: FloorState = await loadFloor(scene, lights, floorLevel);
  const stats = progressionStatsForLevel(1, 'knight');
  let player: Combatant = makePlayer(floor.spawn.gx, floor.spawn.gy, stats.maxHp);
  const playerRig: CharacterRig = await loadPlayerRig();
  scene.add(playerRig.root);

  let attackTargetId: string | null = null;
  let descending = false;

  hud.setFloor(floorLevel, floor.label);

  // ── Move marker ──────────────────────────────────────────────────────────
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.25, 0.35, 24),
    new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.8 }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);

  // ── Input ────────────────────────────────────────────────────────────────
  // The pick plane is swapped on floor change; resolve it lazily.
  attachPointerInput(
    canvas,
    cam,
    () => floor.dungeon.groundPickPlane,
    () =>
      new Map(
        floor.enemies.filter((e) => e.combatant.alive).map((e) => [e.combatant.id, e.rig.root]),
      ),
    {
      onGroundClick: (wx, wz) => {
        if (descending || !player.alive) return;
        attackTargetId = null;
        const goal = worldToTile(wx, wz);
        if (!isWalkable(floor.tm, goal.gx, goal.gy)) return;
        const path = findPath(floor.tm, { gx: player.mover.gx, gy: player.mover.gy }, goal);
        if (path) {
          player.mover.setPath(path);
          const { x, z } = tileToWorld(goal.gx, goal.gy);
          marker.position.set(x, 0.02, z);
          marker.visible = true;
        }
      },
      onEnemyClick: (enemyId) => {
        if (!descending) attackTargetId = enemyId;
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
      player = makePlayer(floor.spawn.gx, floor.spawn.gy, stats.maxHp);
      snapCameraToPlayer();
    });
  });

  function snapCameraToPlayer(): void {
    cam.snapTo(new THREE.Vector3(player.mover.worldX, 0, player.mover.worldZ));
  }
  snapCameraToPlayer();

  // ── Floor descent (T-022) ────────────────────────────────────────────────
  async function descend(): Promise<void> {
    descending = true;
    attackTargetId = null;
    player.mover.stop();
    fadeEl.classList.add('visible');
    await new Promise((r) => setTimeout(r, 450)); // fade-out
    const from = floorLevel;
    floorLevel += 1;
    floor.dispose();
    floor = await loadFloor(scene, lights, floorLevel);
    // Legacy behavior: current HP carries across floors (no free heal).
    const prevHp = player.stats.hp;
    player = makePlayer(floor.spawn.gx, floor.spawn.gy, player.stats.maxHp);
    player.stats.hp = Math.min(prevHp, player.stats.maxHp);
    hud.setFloor(floorLevel, floor.label);
    bus.emit('floor:descended', { from, to: floorLevel });
    snapCameraToPlayer();
    marker.visible = false;
    fadeEl.classList.remove('visible');
    descending = false;
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

    if (!descending) {
      // Player chases its attack target when one is set.
      const target = floor.enemies.find((e) => e.combatant.id === attackTargetId)?.combatant ?? null;
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
            floor.tm,
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
      for (const e of floor.enemies) {
        if (!e.combatant.alive) continue;
        e.ai.update(floor.tm, player, nowMs);
        e.combatant.mover.update(dtMs);
        tryCreatureAttack(e.combatant, player, floor.floorLevel, nowMs);
      }

      // Stairs: standing on the stairs tile (and not fighting) descends.
      if (
        player.alive &&
        !player.mover.isMoving &&
        player.mover.gx === floor.tm.stairs.gx &&
        player.mover.gy === floor.tm.stairs.gy
      ) {
        void descend();
      }
    }

    // Sync rigs with movers.
    syncRig(playerRig, player, dt);
    for (const e of floor.enemies) {
      if (e.combatant.alive) {
        syncRig(e.rig, e.combatant, dt);
      } else if (e.rig.root.visible) {
        e.rig.root.visible = false;
      }
    }
    if (!player.mover.isMoving && marker.visible) marker.visible = false;

    // Camera + shadow + HUD + render.
    const playerPos = new THREE.Vector3(player.mover.worldX, 0, player.mover.worldZ);
    cam.update(playerPos, dt);
    followShadow(lights, playerPos);
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

boot().catch((err) => {
  console.error('[boot] fatal:', err);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div style="color:#f66;padding:16px;font-family:monospace">Boot failed — see console.</div>',
  );
});
