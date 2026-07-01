// Grid mover: follows a tile path with smooth world-space interpolation.
// Pure logic (no render imports) — the renderer reads worldX/worldZ/heading.

import { tileToWorld } from '../core/grid';
import type { PathNode } from './pathfinding';

export class GridMover {
  gx: number;
  gy: number;
  worldX: number;
  worldZ: number;
  /** Radians, Y-up world; the render applies it to the model. */
  heading = 0;

  private path: PathNode[] = [];
  private fromX: number;
  private fromZ: number;
  private toX: number;
  private toZ: number;
  private stepProgressMs = 0;
  private stepDurationMs: number;
  private moving = false;

  constructor(gx: number, gy: number, private moveDurationMs: number) {
    this.gx = gx;
    this.gy = gy;
    const { x, z } = tileToWorld(gx, gy);
    this.worldX = x;
    this.worldZ = z;
    this.fromX = x;
    this.fromZ = z;
    this.toX = x;
    this.toZ = z;
    this.stepDurationMs = moveDurationMs;
  }

  get isMoving(): boolean {
    return this.moving;
  }

  /** Replaces the current path (click-to-move replans freely). */
  setPath(path: PathNode[]): void {
    this.path = [...path];
    if (!this.moving) this.advance();
  }

  stop(): void {
    this.path = [];
  }

  private advance(): void {
    const next = this.path.shift();
    if (!next) {
      this.moving = false;
      return;
    }
    const isDiagonal = next.gx !== this.gx && next.gy !== this.gy;
    this.fromX = this.worldX;
    this.fromZ = this.worldZ;
    const { x, z } = tileToWorld(next.gx, next.gy);
    this.toX = x;
    this.toZ = z;
    this.gx = next.gx;
    this.gy = next.gy;
    this.stepProgressMs = 0;
    this.stepDurationMs = this.moveDurationMs * (isDiagonal ? Math.SQRT2 : 1);
    this.heading = Math.atan2(this.toX - this.fromX, this.toZ - this.fromZ);
    this.moving = true;
  }

  update(dtMs: number): void {
    if (!this.moving) return;
    this.stepProgressMs += dtMs;
    let t = this.stepProgressMs / this.stepDurationMs;
    if (t >= 1) {
      // Consume leftover time into the next step for constant speed.
      const leftover = this.stepProgressMs - this.stepDurationMs;
      this.worldX = this.toX;
      this.worldZ = this.toZ;
      this.advance();
      if (this.moving) {
        this.stepProgressMs = leftover;
        t = this.stepProgressMs / this.stepDurationMs;
      } else {
        return;
      }
    }
    this.worldX = this.fromX + (this.toX - this.fromX) * Math.min(1, t);
    this.worldZ = this.fromZ + (this.toZ - this.fromZ) * Math.min(1, t);
  }
}
