// Scene bootstrap: renderer, lights, prototype terrain.
// Perf budget (CLAUDE.md): max 2-3 dynamic lights, shadows only on the key light.

import * as THREE from 'three';
import { tileToWorld } from '../core/grid';
import type { TileMap } from '../domain/dungeon/tilemap';

export interface GameScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export function createScene(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0b14);
  scene.fog = new THREE.Fog(0x0d0b14, 28, 60);

  // Light 1: hemisphere ambient (cheap, no shadows).
  const hemi = new THREE.HemisphereLight(0x8a7f9e, 0x2a2233, 0.9);
  scene.add(hemi);

  // Light 2: key directional with shadows — the only shadow caster.
  const sun = new THREE.DirectionalLight(0xffe6c0, 1.6);
  sun.position.set(12, 18, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -25;
  sun.shadow.camera.right = 25;
  sun.shadow.camera.top = 25;
  sun.shadow.camera.bottom = -25;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(sun.target);

  return scene;
}

/** Procedural checker texture — zero-cost placeholder terrain skin. */
function makeCheckerTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3b3347';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#453c54';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export interface TerrainHandles {
  /** Mesh used by the pointer raycaster to resolve ground clicks. */
  groundPickPlane: THREE.Mesh;
  group: THREE.Group;
}

/**
 * Prototype terrain from a TileMap: one instanced floor tile per walkable
 * cell, one instanced block per wall cell adjacent to a floor (interior
 * walls only — the void stays dark). Real themed dungeon render is T-021.
 */
export function buildTerrain(scene: THREE.Scene, tm: TileMap): TerrainHandles {
  const group = new THREE.Group();

  const floorTex = makeCheckerTexture();
  floorTex.wrapS = THREE.RepeatWrapping;
  floorTex.wrapT = THREE.RepeatWrapping;

  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x27202f, roughness: 0.9 });
  const stairsMat = new THREE.MeshStandardMaterial({
    color: 0xd9a441,
    emissive: 0x8a5a00,
    emissiveIntensity: 0.5,
    roughness: 0.6,
  });

  const cells: { gx: number; gy: number; type: 'floor' | 'wall' | 'stairs' }[] = [];
  for (let gy = 0; gy < tm.h; gy += 1) {
    for (let gx = 0; gx < tm.w; gx += 1) {
      const t = tm.tiles[gy]![gx]!;
      if (t !== 'wall') {
        cells.push({ gx, gy, type: t });
        continue;
      }
      // Interior wall: touches at least one walkable tile (8-neighborhood).
      let nearFloor = false;
      for (let dy = -1; dy <= 1 && !nearFloor; dy += 1) {
        for (let dx = -1; dx <= 1 && !nearFloor; dx += 1) {
          const ny = gy + dy;
          const nx = gx + dx;
          if (ny >= 0 && ny < tm.h && nx >= 0 && nx < tm.w && tm.tiles[ny]![nx] !== 'wall') {
            nearFloor = true;
          }
        }
      }
      if (nearFloor) cells.push({ gx, gy, type: 'wall' });
    }
  }

  const floors = cells.filter((c) => c.type === 'floor');
  const walls = cells.filter((c) => c.type === 'wall');
  const stairs = cells.filter((c) => c.type === 'stairs');

  const floorGeo = new THREE.BoxGeometry(1, 0.1, 1);
  // Low walls (waist-high): the fixed-pitch camera must never fully hide
  // the character. Proper occlusion fading for tall themed walls is T-021.
  const wallGeo = new THREE.BoxGeometry(1, 0.9, 1);

  const addInstances = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    list: { gx: number; gy: number }[],
    y: number,
    receiveShadow: boolean,
    castShadow: boolean,
  ) => {
    if (list.length === 0) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    list.forEach((c, i) => {
      const { x, z } = tileToWorld(c.gx, c.gy);
      m.setPosition(x, y, z);
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = receiveShadow;
    mesh.castShadow = castShadow;
    group.add(mesh);
  };

  addInstances(floorGeo, floorMat, floors, -0.05, true, false);
  addInstances(floorGeo, stairsMat, stairs, -0.03, true, false);
  addInstances(wallGeo, wallMat, walls, 0.45, true, true);

  // Invisible plane for ground picking (covers the whole map).
  const pickGeo = new THREE.PlaneGeometry(tm.w, tm.h);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  const groundPickPlane = new THREE.Mesh(pickGeo, pickMat);
  groundPickPlane.rotation.x = -Math.PI / 2;
  groundPickPlane.position.set(tm.w / 2, 0, tm.h / 2);
  group.add(groundPickPlane);

  scene.add(group);
  return { groundPickPlane, group };
}
