# Performance playbook

How to diagnose and fix frame-rate problems in this game. Written after a long
lag-hunt on 2026-06-03 (floors 10/12 ran at ~9 fps). The method matters more than
the specific fixes — **measure, don't guess**.

## The golden rule: it's almost always RENDER, not logic

This is a turn-based-ish Phaser game. The creature AI is cheap (~2 ms/turn even
with 50 creatures). When the game lags it is nearly always **per-frame rendering
cost** (60 Hz), not the AI tick (~11 Hz). So:

1. Reproduce on the laggy floor (use `window.debugGod.goToFloor(n)` — admin only).
2. Open `window.debugPerf.stats()` → read **`fps`**.
3. Read `window.debugPerf.profile()` → **`avgTurnMs`**. If that's small (~2 ms) but
   fps is low, the cost is rendering, not AI. (It almost always is.)
4. Binary-search the renderer with the toggles below: flip one OFF, watch `fps`.

## `window.debugPerf` — the diagnostic console (WebGL)

Defined in [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js)
(`perfFlags` + the `window.debugPerf` object). Not admin-gated; harmless (only
affects the local client's rendering).

| Call | What it does |
|---|---|
| `stats()` | `{ fps, objects, tweens, alive, onScreen, summons, flags }` — the one-glance health check |
| `profile()` | `{ avgTurnMs, maxTurnMs, samples }` since last call — is the **AI turn** the cost? |
| `cull(false)` | disable off-screen creature culling |
| `nametags(false)` / `healthbars(false)` | hide creature labels / bars |
| `env(false)` | all floor atmosphere off (darkness + particles + decor) |
| `darkness(false)` | just the darkness/lighting overlay |
| `particles(false)` | just the ambient particles |
| `decor(false)` | just the wall decoration + accents + tint |
| `bloom(false)` | the spell-VFX bloom |

**Diagnosis pattern:** if toggling X off restores fps, X is the cost. That's how
the floor-12 lag was traced to `decor` in one session.

## Known costs + fixes (what we already learned)

### 1. Static `Graphics` re-tessellate every frame — bake them (BIGGEST one)
Phaser re-submits a `Graphics` object's entire command list **every frame**. The
wall decoration (`rebuildWallAccents` / `rebuildDecorations`) draws thousands of
`fillRect`s across a 60×40 map into one Graphics → tens of thousands of triangles
per frame → floor 12 at ~9 fps.
**Fix (shipped):** `bakeStaticDecor()` in [`floorAtmosphere.js`](../game/js/engine/floorAtmosphere.js)
renders the static Graphics into a cached `RenderTexture` once per floor and hides
the live Graphics → one composited quad per frame.
**Rule: never leave a large, static `Graphics` live. Bake it to a texture.**

### 2. Map-sized render textures — only touch the visible rect
`darknessRT` is the size of the whole dungeon. Re-`fill()`ing the entire texture
every frame is wasted fill-rate.
**Fix (shipped):** `updateDarkness` fills only the camera's `worldView` rect (+
margin). (Note: this alone wasn't the floor-12 culprit — decor was — but it helps
every floor.)

### 3. Draw what's on screen — cull the rest
50 creatures × (sprite + 2 health-bar shapes + 1 Text name) were all rendered even
off-camera. Text + Shapes break sprite batching and are expensive.
**Fix (shipped):** `updateAllHealthBars` hides each creature's sprite/bar/nametag
when its world position is outside the camera `worldView` (+ pad).

### 4. Blocked abilities re-evaluated every tick
`creatureTurn` only advanced `nextAbilityAt` on a **successful** cast, so a creature
whose ability kept failing (out of range, summon at cap) re-ran the (sometimes
costly) ability evaluation every 90 ms.
**Fix (shipped):** back off `nextAbilityAt` on failure (`ABILITY_RETRY_MS`).
Also memoised `findCreatureTemplateByTitle` + `inferCreatureAbilityPattern`.

### 5. Per-creature BFS pathfinding (the original lag fix)
Each chasing creature ran its own BFS toward the player every turn → O(creatures ×
BFS). **Fix (shipped):** one shared **flow field** (single BFS from the player per
turn) in [`CreatureMovement.js`](../game/js/engine/systems/CreatureMovement.js);
creatures descend the gradient in O(1), falling back to BFS only when boxed in.

### 6. Spell VFX particles + bloom (the newest cost to watch)
Particles are GPU-batched and cheap; the **bloom is a per-frame shader**. Monster
abilities cast far more than the player, so they run at reduced density
(`MONSTER_FX.density = 0.55`) and never shake. If a floor full of caster monsters
drops fps, that's the first dial to lower. See [`spell-vfx.md`](spell-vfx.md).

## Phaser gotchas that bite here

- `Graphics` = re-tessellated every frame. Static art → bake to a `RenderTexture`.
- `Text` objects are expensive and break batching. Cull off-screen; don't spawn one per frame.
- Render textures: prefer screen/viewport-sized over map-sized; `fill()` a sub-rect, not the whole thing.
- `blendMode: 'ADD'` + bloom **compounds** — bright overlapping additives blow out to white fast. Keep alphas modest.
- Don't trust a single `actualFps` sample; toggle a system off and look for a clear jump.

## Per-frame work inventory (where to look)

- `this.events.on('update', …)` in `game.engine.js` — input, movement, `updateAllHealthBars`, `updateDarkness`.
- `creatureTurn` (90 ms timer) — AI, ability ticks, the flow field rebuild.
- 1 s housekeeping timer — light burn-down, save button, combat indicator, descent-pit sync.
- Phaser render — everything visible: tiles (baked), creatures (culled), VFX particles, bloom.
