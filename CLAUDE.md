# Tibia Dungeons — Claude Code entry point

Browser-based roguelite dungeon crawler inspired by Tibia. Single-page app, Phaser 3, vanilla JS, deployed to Vercel from `game/`.

> This file is what Claude Code reads when entering the repo. It is intentionally short. For depth, follow the links to [`docs/`](docs/).

## Run it locally (the only commands you need)

```bash
node scripts/build.js --watch    # rebuild bundle on every save (run once, leave open)
npm run dev                      # static file server on http://localhost:5173
```

`npm run dev` does **not** bundle. The page references `game/dist/main.min.js`; without it you get 404s. Always run `node scripts/build.js` (or `--watch`) first.

For the itch.io flavor preview: `OFFLINE_BUILD=1 npm run dev` (then `node scripts/build.js --offline`).

## Where things live (skim the tree once)

```
game/
├── index.html              ← HUD layout + script tags
├── data/                   ← JSON catalogs (creatures, items, spells…) + images
├── dist/                   ← esbuild output (gitignored, regenerable)
└── js/
    ├── main.js             ← entry point (2 lines: ui/auth + engine)
    ├── loading-screen.js   ← separate bundle entry (SW register + changelog scroller)
    ├── dataService.js      ← JSON catalog loaders + imageUrl()
    ├── offline-api.js      ← localStorage stub for itch.io build
    ├── vfx.js              ← low-level Phaser draw routines (DON'T import directly — use rendering/Renderer.js)
    │
    ├── config/             ← every magic number (game.config.js, visual.config.js)
    ├── core/               ← EventBus.js (pub/sub)
    ├── world/              ← Projection.js (world↔screen seam, iso migration plug point)
    ├── rendering/          ← SpriteFactory + Renderer shim (Lights2D + post-FX seams)
    ├── systems/            ← reusable behaviour modules
    │   └── lighting/       ← LightItems.js (torch burn + radius)
    ├── state/              ← playerSession.js (ESM-binding setter pattern)
    ├── ui/                 ← auth.js, inventoryPanel.js (1.6k!), loadingScreen.js, panelLayout.js
    ├── data/               ← static tuning tables (floorSpawnConfig, floorThemes, changelog, version)
    ├── entities/           ← domain grouping by entity
    │   ├── Creature/       ← abilityPatterns.js + damageModifiers.js
    │   ├── Spell/          ← filters.js + fxOverrides.js
    │   ├── Item/           ← placeholder (logic still in ui/inventoryPanel.js)
    │   └── Player/         ← placeholder (state still in engine closure)
    ├── engine/             ← game.engine.js (~7.7k, scene + combat + AI + save)
    │                         + floorAtmosphere.js + creatureSpellVfx.js
    ├── dungeon/            ← procedural floor generator
    └── mechanics/          ← progression curves + loot pity tracker

api/                        ← Vercel serverless functions (auth, saves, runs)
scripts/                    ← build, dev-server, playtest, version-bump, store covers
docs/                       ← architecture, how-tos, glossary, gameplay notes
```

Layer-by-layer detail with reasoning: [`docs/architecture.md`](docs/architecture.md).

## Conventions that matter (and the foot-guns)

- **Magic numbers go to `game/js/config/`.** Never inline a tile size, color, or timing.
- **Sprites for entities** (player, creature, fire/poison field, ground tile) are built via `rendering/SpriteFactory.js`. Never `this.add.sprite(...)` directly in the engine — it bypasses the future Lights2D/normal-map pipeline.
- **VFX calls** (shake, flash, beams, projectiles, **spell particles/bloom**) import from `rendering/Renderer.js`, never from `vfx.js` or `rendering/SpellParticles.js` directly. The spell "magic" look (bursts, beams, cohesive area blasts, bloom) lives in [`rendering/SpellParticles.js`](game/js/rendering/SpellParticles.js) — see [`docs/spell-vfx.md`](docs/spell-vfx.md).
- **Never leave a large static `Graphics` live.** Phaser re-tessellates a Graphics' full command list every frame — a map-wide one tanks FPS. Bake it to a `RenderTexture` once (see `bakeStaticDecor` in `floorAtmosphere.js`). [`docs/perf-playbook.md`](docs/perf-playbook.md).
- **Coordinates** go through `world/Projection.js`. Inline `gx * tileSize + tileSize/2` is forbidden — it will silently break the iso migration.
- **Module-shared state** uses `state/playerSession.js` setter pattern. Never reassign an imported `let` binding (ESM throws). Always call the matching `set<Name>()`.
- **Gameplay events** emit through `core/EventBus.js` (`bus.emit(EVENTS.ENTITY_DIED, {...})`). Future systems (particles, audio) hook in via `bus.on()` without touching combat code.

## Foot-guns burned into past sessions

- ❌ **`npm run build` is destructive.** It runs with `--prod` which deletes `game/js/` after bundling (only Vercel CI should use it). Use `node scripts/build.js` for local validation.
- ❌ **Service worker caches the bundle aggressively.** After moving files, bump `CACHE` in [`game/sw.js`](game/sw.js) and tell the user to hard-refresh.
- ❌ **`game.engine.js` has a 5.7k-line `startGame()` closure.** Combat, movement, AI, save/load, scene lifecycle all live inside it. Phase 4 of the current refactor will break it apart; until then, treat closure variables (`gridX`, `playerHp`, `creatures[]`) as read-only-ish from outside.
- ❌ **`inventoryPanel.js` is 1.6k lines** mixing character-select, equipment, loot bag, market shop, spells shop, and save/resume. Phase 3 will carve it.
- ❌ **Two destructive prod-build flags exist:** `npm run build` (Vercel) and `npm run build:itch` (only when explicitly asked — produces the itch.io zip). Never run them speculatively.

## Tasks → docs

| Want to… | Read |
|---|---|
| Add a creature / monster | [`docs/how-to-add-creature.md`](docs/how-to-add-creature.md) |
| Add a spell | [`docs/how-to-add-spell.md`](docs/how-to-add-spell.md) |
| Add a floor / theme | [`docs/how-to-add-floor.md`](docs/how-to-add-floor.md) |
| Touch / tune spell visuals (particles, beams, bloom, area FX) | [`docs/spell-vfx.md`](docs/spell-vfx.md) |
| Fix lag / frame-rate (method + `window.debugPerf`) | [`docs/perf-playbook.md`](docs/perf-playbook.md) |
| Debug a runtime issue | [`docs/how-to-debug.md`](docs/how-to-debug.md) |
| Understand the layer structure / why | [`docs/architecture.md`](docs/architecture.md) |
| Know why the codebase looks the way it does (decisions, history) | [`docs/dev-log.md`](docs/dev-log.md) |
| Decode Tibia jargon (vocation, cap, fist, …) | [`docs/glossary.md`](docs/glossary.md) |
| Reference real playtest observations | [`docs/gameplay-notes.md`](docs/gameplay-notes.md) |

## Versioning & deploy

Version in `game/js/data/version.js`. Patch on commit, minor on deploy. Update [`game/js/data/changelog.js`](game/js/data/changelog.js) **before** any Vercel deploy.

```bash
npm run push                                      # bump patch + commit + push
npm run release                                   # bump minor + commit + push
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel --prod --yes  # deploy (TLS flag is the WSL workaround)
```

**Deploy reality (read before shipping):**
- The manual release loop we actually use: bump `VERSION` in `game/js/data/version.js`, add a `changelog.js` entry, bump `CACHE` in `game/sw.js`, `node scripts/build.js`, commit, push, `vercel --prod --yes`. Then verify live: `curl -sL https://www.tibia-dungeons.com/sw.js | grep CACHE`.
- **Two Vercel projects exist.** The live player domain **`www.tibia-dungeons.com` is the `tibia_dungeons-main` project** (a successful `vercel --prod` prints `Aliased: https://www.tibia-dungeons.com`). The other project (`tibia_dungeons` → `tibiadungeons.vercel.app`) is a stale duplicate — ignore it.
- **`git push` needs a manually-supplied GitHub PAT** — there is no `gh` login or credential helper, and `origin` is HTTPS. Push via `git push "https://<token>@github.com/raulmaiz/tibia_dungeons.git" main` and mask the token in any output. Don't store it.
- Upstash Redis creds (prod saves/HoF) aren't in `vercel env ls`; `vercel env pull --environment=production` retrieves them. The prod admin user already exists (`user:admin`, role=admin) for `window.debugGod`.

Full session history + rationale: [`docs/dev-log.md`](docs/dev-log.md).
