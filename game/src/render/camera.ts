// Diablo-4-style camera (spec: docs/migration-3d.md).
// - Perspective, fixed pitch ~57° from the vertical. Input can NEVER change it.
// - Wheel zoom with clamped, smoothed distance.
// - Free yaw while the right mouse button is held; kept on release.
// - Exponential lerp follow of the target — no snapping, no dead zones.

import * as THREE from 'three';
import { CAMERA } from '../core/config';

export class Diablo4Camera {
  readonly camera: THREE.PerspectiveCamera;

  private focus = new THREE.Vector3();
  private yaw = Math.PI * 0.25;
  private distance: number = CAMERA.initialDistance;
  private targetDistance: number = CAMERA.initialDistance;
  private readonly pitchFromVertical = THREE.MathUtils.degToRad(CAMERA.pitchFromVerticalDeg);

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovDeg, aspect, 0.1, 200);
  }

  /** Instant placement (spawn / floor change). */
  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.apply();
  }

  addYaw(deltaPixels: number): void {
    this.yaw -= deltaPixels * CAMERA.yawPerPixel;
  }

  addZoom(wheelDeltaY: number): void {
    const notches = Math.sign(wheelDeltaY);
    this.targetDistance = THREE.MathUtils.clamp(
      this.targetDistance + notches * CAMERA.zoomStep,
      CAMERA.minDistance,
      CAMERA.maxDistance,
    );
  }

  update(target: THREE.Vector3, dt: number): void {
    // Exponential smoothing: frame-rate independent, never overshoots.
    const followT = 1 - Math.exp(-CAMERA.followLerpK * dt);
    this.focus.lerp(target, followT);
    const zoomT = 1 - Math.exp(-CAMERA.zoomLerpK * dt);
    this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, zoomT);
    this.apply();
  }

  private apply(): void {
    // Spherical offset with fixed polar angle (pitch) and free azimuth (yaw).
    const sinPitch = Math.sin(this.pitchFromVertical);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * sinPitch,
      Math.cos(this.pitchFromVertical),
      Math.cos(this.yaw) * sinPitch,
    ).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(offset);
    this.camera.lookAt(this.focus);
  }

  onResize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
