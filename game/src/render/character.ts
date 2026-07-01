// glTF character loading + animation state (idle/walk crossfade).
// Templates are cached per URL; SkeletonUtils clones share geometry.
// Any missing/broken model falls back to the Soldier placeholder so a
// bad asset can never break the game.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CREATURE_MODELS, HERO_MODEL, modelKeyForFamily, SOLDIER_FALLBACK, type ModelSpec } from './models';

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
  spec: ModelSpec;
  /** Uniform scale that maps the raw model to spec.targetHeight. */
  fitScale: number;
}

const templateCache = new Map<string, Promise<LoadedTemplate>>();
const loader = new GLTFLoader();

function loadTemplate(spec: ModelSpec): Promise<LoadedTemplate> {
  let cached = templateCache.get(spec.url);
  if (!cached) {
    cached = loader
      .loadAsync(spec.url)
      .then((gltf) => {
        gltf.scene.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
        });
        const bbox = new THREE.Box3().setFromObject(gltf.scene);
        const height = Math.max(0.01, bbox.max.y - bbox.min.y);
        return {
          scene: gltf.scene,
          clips: gltf.animations,
          spec,
          fitScale: spec.targetHeight / height,
        };
      })
      .catch((err) => {
        if (spec.url === SOLDIER_FALLBACK.url) throw err;
        console.warn(`[character] ${spec.url} failed to load — falling back to Soldier`, err);
        return loadTemplate({ ...SOLDIER_FALLBACK, targetHeight: spec.targetHeight });
      });
    templateCache.set(spec.url, cached);
  }
  return cached;
}

/** Fuzzy clip lookup: exact name → contains → first clip. */
function pickClip(clips: THREE.AnimationClip[], wanted: string[]): THREE.AnimationClip | null {
  for (const name of wanted) {
    const exact = clips.find((c) => c.name.toLowerCase() === name);
    if (exact) return exact;
  }
  for (const name of wanted) {
    const partial = clips.find((c) => c.name.toLowerCase().includes(name));
    if (partial) return partial;
  }
  return clips[0] ?? null;
}

function buildRig(template: LoadedTemplate, tint: number | null): CharacterRig {
  const model = SkeletonUtils.clone(template.scene);
  model.scale.setScalar(template.fitScale);
  model.rotation.y = template.spec.yawOffset;
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
  const idleClip = pickClip(template.clips, ['idle', 'idle_a', 'stand']);
  const walkClip = pickClip(template.clips, ['walk', 'walking', 'run', 'running', 'move']);
  const actions: Record<CharacterAnim, THREE.AnimationAction | null> = {
    idle: idleClip ? mixer.clipAction(idleClip) : null,
    walk: walkClip ? mixer.clipAction(walkClip) : null,
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

/** Player rig (untinted hero model). */
export async function loadPlayerRig(): Promise<CharacterRig> {
  return buildRig(await loadTemplate(HERO_MODEL), null);
}

/** Creature rig by family; tint keeps same-model species distinguishable. */
export async function loadEnemyRig(tint = 0xff5544, typePrimary = ''): Promise<CharacterRig> {
  const spec = CREATURE_MODELS[modelKeyForFamily(typePrimary)];
  return buildRig(await loadTemplate(spec), tint);
}
