// Pointer input: left click = move / attack (raycast pick), right drag =
// camera yaw, wheel = zoom. UI panels live in the DOM overlay and call
// stopPropagation, so canvas listeners never see their events (ADR-003).

import * as THREE from 'three';
import type { Diablo4Camera } from '../render/camera';

export interface PickHandlers {
  onGroundClick(worldX: number, worldZ: number): void;
  /** Return true when the click hit an enemy (suppresses the ground move). */
  onEnemyClick(enemyId: string): void;
}

export function attachPointerInput(
  canvas: HTMLCanvasElement,
  cam: Diablo4Camera,
  groundPickPlane: THREE.Mesh,
  enemyPickTargets: () => Map<string, THREE.Object3D>,
  handlers: PickHandlers,
): void {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let rightDragging = false;
  let lastDragX = 0;

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) {
      rightDragging = true;
      lastDragX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0) return;

    ndc.set((e.clientX / canvas.clientWidth) * 2 - 1, -(e.clientY / canvas.clientHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, cam.camera);

    // Enemies first — clicking a creature beats clicking the tile below it.
    const enemies = enemyPickTargets();
    for (const [id, obj] of enemies) {
      if (raycaster.intersectObject(obj, true).length > 0) {
        handlers.onEnemyClick(id);
        return;
      }
    }
    const hit = raycaster.intersectObject(groundPickPlane, false)[0];
    if (hit) handlers.onGroundClick(hit.point.x, hit.point.z);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!rightDragging) return;
    cam.addYaw(e.clientX - lastDragX);
    lastDragX = e.clientX;
  });

  const endDrag = (e: PointerEvent) => {
    if (e.button === 2) rightDragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      cam.addZoom(e.deltaY);
    },
    { passive: false },
  );
}
