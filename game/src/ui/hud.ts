// Minimal DOM HUD (ADR-003): player HP/mana bars, floating damage numbers
// projected from world space, F3 FPS counter. Reusable node pool — no
// per-hit DOM churn.

import * as THREE from 'three';
import type { Combatant } from '../entities/creature';

export class Hud {
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private fpsEl: HTMLElement;
  private floaterPool: HTMLElement[] = [];
  private fpsVisible = false;
  private frames = 0;
  private lastFpsAtMs = 0;

  constructor(private hudRoot: HTMLElement) {
    this.hpFill = hudRoot.querySelector('#hp-fill')!;
    this.hpText = hudRoot.querySelector('#hp-text')!;
    this.fpsEl = hudRoot.querySelector('#fps')!;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.fpsVisible = !this.fpsVisible;
        this.fpsEl.style.display = this.fpsVisible ? 'block' : 'none';
      }
    });
  }

  setFloor(floorLevel: number): void {
    this.hudRoot.querySelector<HTMLElement>('#floor-indicator')!.textContent = `Floor ${floorLevel}`;
  }

  updatePlayerBars(player: Combatant): void {
    const pct = (player.stats.hp / player.stats.maxHp) * 100;
    this.hpFill.style.width = `${pct}%`;
    this.hpText.textContent = `${player.stats.hp} / ${player.stats.maxHp}`;
  }

  tickFps(nowMs: number): void {
    this.frames += 1;
    if (nowMs - this.lastFpsAtMs >= 1000) {
      if (this.fpsVisible) this.fpsEl.textContent = `${this.frames} fps`;
      this.frames = 0;
      this.lastFpsAtMs = nowMs;
    }
  }

  /** Floating combat text at a world position, projected to the screen. */
  spawnDamageNumber(
    worldPos: THREE.Vector3,
    camera: THREE.Camera,
    text: string,
    kind: 'hit' | 'crit' | 'miss' | 'incoming',
  ): void {
    let el = this.floaterPool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'damage-floater';
      this.hudRoot.appendChild(el);
    }
    const ndc = worldPos.clone().project(camera);
    el.style.left = `${((ndc.x + 1) / 2) * 100}%`;
    el.style.top = `${((1 - ndc.y) / 2) * 100}%`;
    el.textContent = text;
    el.dataset.kind = kind;
    el.classList.remove('floating');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('floating');
    window.setTimeout(() => {
      el.classList.remove('floating');
      this.floaterPool.push(el);
    }, 900);
  }

  showDeath(onRespawn: () => void): void {
    const panel = this.hudRoot.querySelector<HTMLElement>('#death-panel')!;
    panel.style.display = 'flex';
    panel.querySelector<HTMLButtonElement>('#respawn-btn')!.onclick = () => {
      panel.style.display = 'none';
      onRespawn();
    };
  }
}
