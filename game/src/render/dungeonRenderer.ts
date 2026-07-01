// Dungeon renderer: consumes a MeshPlan (ADR-002) and builds one
// InstancedMesh per (piece, variant) bucket with theme materials.
// Perf: whole floor = ≤ 3 pieces × 3 variants + pick plane < 15 draw calls.

import * as THREE from 'three';
import { tileToWorld } from '../core/grid';
import type { MeshInstance, MeshPlan } from '../domain/dungeon/meshPlan';
import { PIECE_VARIANTS } from '../domain/dungeon/meshPlan';
import type { TileMap } from '../domain/dungeon/tilemap';
import type { FloorTheme } from '../data/themes';

export interface DungeonHandles {
  group: THREE.Group;
  groundPickPlane: THREE.Mesh;
  /** Remove from the scene and free GPU resources (floor change). */
  dispose(): void;
}

/** Procedural noise texture reused across floors (theme tints recolor it). */
let sharedFloorTexture: THREE.Texture | null = null;
function floorTexture(): THREE.Texture {
  if (sharedFloorTexture) return sharedFloorTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#bcbcbc';
  ctx.fillRect(0, 0, size, size);
  // Deterministic speckle pattern (no RNG — same look every boot).
  for (let i = 0; i < 220; i += 1) {
    const x = (i * 37) % size;
    const y = (i * 53 + ((i * i) % 7)) % size;
    const shade = 150 + ((i * 29) % 80);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(x, y, 2, 2);
  }
  sharedFloorTexture = new THREE.CanvasTexture(canvas);
  sharedFloorTexture.colorSpace = THREE.SRGBColorSpace;
  return sharedFloorTexture;
}

function tinted(base: number, tint: number): THREE.Color {
  return new THREE.Color(base).multiply(new THREE.Color(tint));
}

export function buildDungeon(scene: THREE.Scene, tm: TileMap, plan: MeshPlan, theme: FloorTheme): DungeonHandles {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];

  scene.background = new THREE.Color(theme.background);
  scene.fog = new THREE.Fog(theme.fog, 28, 60);

  const floorGeo = new THREE.BoxGeometry(1, 0.1, 1);
  const wallGeo = new THREE.BoxGeometry(1, 0.9, 1);
  const stairsGeo = new THREE.BoxGeometry(1, 0.14, 1);
  disposables.push(floorGeo, wallGeo, stairsGeo);

  // Bucket instances by piece+variant → one InstancedMesh each.
  const buckets = new Map<string, MeshInstance[]>();
  for (const inst of plan.instances) {
    const key = `${inst.piece}:${inst.variant}`;
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(inst);
  }

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);

  for (const [key, list] of buckets) {
    const [piece, variantStr] = key.split(':') as [MeshInstance['piece'], string];
    const variant = Math.min(Number(variantStr), PIECE_VARIANTS - 1);

    let geo: THREE.BufferGeometry;
    let mat: THREE.MeshStandardMaterial;
    let y: number;
    let castShadow = false;
    switch (piece) {
      case 'floor':
        geo = floorGeo;
        mat = new THREE.MeshStandardMaterial({
          map: floorTexture(),
          color: tinted(theme.floor, theme.floorVariantTints[variant] ?? 0xffffff),
          roughness: 0.95,
        });
        y = -0.05;
        break;
      case 'stairs':
        geo = stairsGeo;
        mat = new THREE.MeshStandardMaterial({
          color: 0xd9a441,
          emissive: theme.stairsEmissive,
          emissiveIntensity: 0.55,
          roughness: 0.6,
        });
        y = -0.03;
        break;
      case 'wall':
        geo = wallGeo;
        mat = new THREE.MeshStandardMaterial({
          color: tinted(theme.wall, theme.wallVariantTints[variant] ?? 0xffffff),
          roughness: 0.9,
        });
        y = 0.45;
        castShadow = true;
        break;
    }
    disposables.push(mat);

    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((inst, i) => {
      const { x, z } = tileToWorld(inst.gx, inst.gy);
      quat.setFromAxisAngle(up, inst.rotationY);
      matrix.compose(new THREE.Vector3(x, y, z), quat, scale);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    mesh.castShadow = castShadow;
    group.add(mesh);
  }

  // Invisible plane for ground picking.
  const pickGeo = new THREE.PlaneGeometry(tm.w, tm.h);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(pickGeo, pickMat);
  const groundPickPlane = new THREE.Mesh(pickGeo, pickMat);
  groundPickPlane.rotation.x = -Math.PI / 2;
  groundPickPlane.position.set(tm.w / 2, 0, tm.h / 2);
  group.add(groundPickPlane);

  scene.add(group);

  return {
    group,
    groundPickPlane,
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.InstancedMesh) obj.dispose();
      });
    },
  };
}
