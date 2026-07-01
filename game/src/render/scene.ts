// Scene bootstrap: renderer + lights. Background/fog and dungeon geometry
// are owned by dungeonRenderer (theme-driven, per floor).
// Perf budget (CLAUDE.md): max 2-3 dynamic lights, shadows only on the key light.

import * as THREE from 'three';
import type { FloorTheme } from '../data/themes';

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

export interface SceneLights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
}

export function createScene(): { scene: THREE.Scene; lights: SceneLights } {
  const scene = new THREE.Scene();

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

  return { scene, lights: { hemi, sun } };
}

/** Re-tint the shared lights for a floor theme. */
export function applyThemeLights(lights: SceneLights, theme: FloorTheme): void {
  lights.hemi.color.setHex(theme.hemiSky);
  lights.hemi.groundColor.setHex(theme.hemiGround);
  lights.sun.color.setHex(theme.keyLight);
}

/** Keep the shadow camera centered on the action (cheap follow, once per frame). */
export function followShadow(lights: SceneLights, target: THREE.Vector3): void {
  lights.sun.position.set(target.x + 12, 18, target.z + 8);
  lights.sun.target.position.copy(target);
  lights.sun.target.updateMatrixWorld();
}
