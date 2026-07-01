// glTF character loading + animation state (idle/walk crossfade).
// The prototype uses Soldier.glb (Idle/Walk/Run clips) — replaced by a
// CC0 low-poly pack in T-052b. Enemies are tinted SkeletonUtils clones.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export type CharacterAnim = 'idle' | 'walk';

export interface CharacterRig {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  play(anim: CharacterAnim): void;
  update(dt: number): void;
}

interface LoadedTemplate {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

let templatePromise: Promise<LoadedTemplate> | null = null;

function loadTemplate(): Promise<LoadedTemplate> {
  templatePromise ??= new GLTFLoader().loadAsync('/assets/models/Soldier.glb').then((gltf) => {
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        obj.castShadow = true;
      }
    });
    return { scene: gltf.scene, clips: gltf.animations };
  });
  return templatePromise;
}

function buildRig(template: LoadedTemplate, tint: number | null): CharacterRig {
  const model = SkeletonUtils.clone(template.scene);
  model.scale.setScalar(0.55); // soldier is ~1.8u tall; fit ~1-tile world scale
  // Soldier.glb faces -Z; bake a 180° turn so `root.rotation.y = heading`
  // (movement systems assume +Z-facing models, the glTF standard).
  model.rotation.y = Math.PI;
  const root = new THREE.Group();
  root.add(model);

  if (tint != null) {
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        mat.color.multiply(new THREE.Color(tint));
        mesh.material = mat;
      }
    });
  }

  const mixer = new THREE.AnimationMixer(model);
  const byName = new Map(template.clips.map((c) => [c.name.toLowerCase(), c]));
  const actions: Record<CharacterAnim, THREE.AnimationAction | null> = {
    idle: byName.has('idle') ? mixer.clipAction(byName.get('idle')!) : null,
    walk: byName.has('walk') ? mixer.clipAction(byName.get('walk')!) : null,
  };

  let current: CharacterAnim | null = null;
  const play = (anim: CharacterAnim) => {
    if (anim === current) return;
    const next = actions[anim];
    if (!next) return;
    const prev = current ? actions[current] : null;
    next.reset().fadeIn(0.2).play();
    prev?.fadeOut(0.2);
    current = anim;
  };
  play('idle');

  return {
    root,
    mixer,
    play,
    update: (dt) => mixer.update(dt),
  };
}

/** Player rig (untinted). */
export async function loadPlayerRig(): Promise<CharacterRig> {
  return buildRig(await loadTemplate(), null);
}

/** Enemy rig — red tint distinguishes hostiles until real models land (T-052b). */
export async function loadEnemyRig(): Promise<CharacterRig> {
  return buildRig(await loadTemplate(), 0xff5544);
}
