# Spell VFX system

The "modern magic" look — additive particle bursts, glowing beams, cohesive area
blasts, and a soft selective bloom. Added 2026-06-03 as a 2D-Phaser port of the
abandoned 3D engine's spell visuals, with **zero new dependencies** (no Three.js).

> Origin: the 3D experiment used `three` + `three-nebula` (particles) + `meshline`
> (beams) + `UnrealBloomPass` (glow). The 2D port replaces each with a built-in
> Phaser equivalent — see [`dev-log.md`](dev-log.md) for the why.

## Where it lives

| File | Role |
|---|---|
| [`game/js/rendering/SpellParticles.js`](../game/js/rendering/SpellParticles.js) | **The whole system.** Spark texture, per-element presets, bursts, beams, cohesive area effect, the VFX layer + bloom. |
| [`game/js/rendering/Renderer.js`](../game/js/rendering/Renderer.js) | Re-exports the public fns (canonical VFX import seam — never import SpellParticles directly elsewhere). |
| [`game/js/engine/systems/SpellVisuals.js`](../game/js/engine/systems/SpellVisuals.js) | Player spells. `showSpellAuraEffect` / `showSpellTileEffect` / `showSpellProjectileEffect` call the bursts/area/beam. |
| [`game/js/engine/systems/CreatureAbilities.js`](../game/js/engine/systems/CreatureAbilities.js) | Monster abilities. `showCreatureAbilityEffect` routes by element + shape (reduced density, no shake). |
| [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js) | Calls `initSpellFx(this, { bloom: true })` once on scene create; `window.debugPerf.bloom` toggle. |

## Public API (via Renderer.js)

```js
initSpellFx(scene, { bloom })           // once on scene create — builds spark texture + VFX layer + bloom
setSpellBloom(scene, on)                // toggle the bloom (window.debugPerf.bloom)
spellElementKey(spell)                  // player spell  → preset key
abilityElementKey(ability)              // monster ability → preset key (reads ability.element + name)
elementKeyFromColor(color)              // AoE fallback when only the spellFxProfile colour is known
spawnSpellBurst(scene, x, y, element, count?)            // one-shot radial burst
spawnSpellBeam(scene, x1, y1, x2, y2, element)           // glowing additive beam
spawnSpellArea(scene, worldPts, element, tileSize, opts) // cohesive area blast (see below)
```

## How it works

1. **Spark texture** (`ensureSparkTexture`) — a 32px white radial-gradient dot,
   generated once via a canvas texture. Everything (bursts, beams, fields) is this
   one texture, tinted + additively blended. No image assets.
2. **Per-element presets** (`PRESETS`) — `fire / ice / energy / earth / death /
   holy / healing / physical`. Each defines a 2-stop colour ramp (A→B over life),
   particle count, lifespan, speed, scale, and gravity (negative = floats up).
3. **Bursts** — one reusable Phaser emitter **per element** (lazy, cached), all
   added to a dedicated **VFX Layer**. `explode(n, x, y)` fires a one-shot batch.
4. **Selective bloom** — the bloom is applied to the **VFX Layer**, not the camera.
   The layer is empty except where magic is, so only the magic glows and the dark
   dungeon stays crisp — this reproduces the 3D `UnrealBloomPass` luminance
   threshold (which was tuned so "only spell impacts trip the glow"). Falls back to
   a milder camera bloom if the runtime lacks layer `postFX`.
5. **Cohesive area blast** (`spawnSpellArea`) — replaces the old flat per-tile
   diamond grid (the "tile-based" tell). Three layers, NO diamonds:
   - central **flash** (the pop),
   - a soft **ground field** decal that flares then lingers (~700ms),
   - an **anti-grid particle cloud** across the footprint: each affected tile emits
     several jittered (±0.8 tile, off-grid) sub-bursts, staggered in time so it
     ripples like a wave. Plus a brief camera kick (player only).

## Routing: which spell gets which effect

Player ([SpellVisuals.js](../game/js/engine/systems/SpellVisuals.js)) and monsters
([CreatureAbilities.js](../game/js/engine/systems/CreatureAbilities.js)) both map
**element → colour** and **shape → effect**:

| Shape | Detected from | Effect |
|---|---|---|
| Single tile (`player_cell`, 1–2 tiles) | pattern / footprint | `spawnSpellBurst` (+ beam if ranged) |
| Beam (`line_to_player`, `kind: 'beam'`) | pattern / `fxOverrides` kind | `spawnSpellBeam` + impact burst |
| Area ≥3 tiles (`cone` / `nova` / wave / fireball) | footprint length + pattern/`kind` | `spawnSpellArea` (cohesive blast) |

Element comes from `spell.raw.element` / `ability.element` plus name keywords
(`fire`, `wave`, `terra`, `frost`, …). Monster abilities have **no explicit
"is area" flag** — we infer it from the resolved tile footprint (`resolveCreatureAbilityTiles`)
and `inferCreatureAbilityPattern`.

## `spawnSpellArea(scene, worldPts, element, tileSize, opts)`

| opt | meaning |
|---|---|
| `kind` | `'nova'` (×1.25 density), `'cone'` (×2.8 — waves cover few tiles so need more), else default |
| `beam` | true → draw a beam from first→last point instead of a circular field |
| `ordered` | true → particles ripple outward by distance (waves); false → random stagger |
| `stepMs` | per-step delay for the ordered ripple (defaults to the spell's `delayStep`) |
| `density` | global count multiplier. **Player = 1; monsters = 0.55** (they cast far more often) |
| `shake` | camera kick. **Player = true; monsters = false** (constant shake would be sickening) |

## Tuning — the dials, in order of impact

All in [`SpellParticles.js`](../game/js/rendering/SpellParticles.js):

1. **`setSpellBloom`'s `addBloom(...)` args** — `(color, offsetX, offsetY, blurStrength, strength, steps)`. This is the single biggest "magic glow" lever. History: 0.35-equiv (3D) → 2.0 (blew the screen white) → **1.0 / 6 steps** (current). Don't go near 2.0.
2. **`PRESETS` scale + alpha** (`alpha` start is in the emitter config, ~0.7). Additive + bloom blows out fast — bigger/brighter is not always better.
3. **Density** — the per-kind `boost` (nova 1.25, cone 2.8) and the per-tile sub-burst counts in the cloud loop. This is the "más tralla" lever.
4. **Lifespan** (`PRESETS[*].life`, ms) — controls how long the animation lasts.
5. **Ground field decal alpha/size** — keep dim (`0.22`, `maxR*1.7`); it was the main white-blowout culprit.

### Add a new element
Add a key to `PRESETS` (colour ramp + numbers), then make `spellElementKey` /
`abilityElementKey` return it for the right element/name. That's it.

## Debug toggles (WebGL console)

`window.debugPerf` — toggle pieces live and watch `stats().fps`:
`bloom(false)`, `cull(false)`, `nametags(false)`, `healthbars(false)`,
`env/darkness/particles/decor(false)`, `stats()`, `profile()`.
See [`perf-playbook.md`](perf-playbook.md).

## Performance notes

Particles are GPU-batched and cheap; the **bloom is a per-frame shader** and the
real cost. Monster casts are frequent → they run at `density: 0.55` and no shake.
If a dense floor of casters drops FPS: lower monster `density` (in
`CreatureAbilities.showCreatureAbilityEffect`'s `MONSTER_FX`), soften the bloom, or
cap total particles per area cast. Diagnose with `window.debugPerf.stats()` +
`bloom(false)`.
