# Tibia Dungeons

Browser-based dungeon crawler inspired by Tibia. Phaser 3 game engine, vanilla JS, single-page app served from `game/`.

## Versioning & Deployment

Version lives in `game/js/data/version.js` (VERSION + RELEASE_DATE).

**Scripts (from project root):**

- `npm run push` — bump **patch** (0.1.1 → 0.1.2), commit, and push to GitHub.
- `npm run release` — bump **minor** (0.1.x → 0.2.0, patch resets), commit, and push.

**Deploy to Vercel production:**

```
NODE_TLS_REJECT_UNAUTHORIZED=0 vercel --prod --yes
```

The `NODE_TLS_REJECT_UNAUTHORIZED=0` flag is needed in this WSL environment due to certificate issues.

Vercel config (`vercel.json`): no build step, serves `game/` directory directly.

## Dev Server

```
npm run dev
```

Runs on `http://localhost:5173`. Includes backend API (auth, saves, hall of fame) with local JSON file storage (`.runs.local.json`, `.auth.local.json`, `.saves.local.json`).

Preview the itch.io / offline flavor without re-zipping:

```
OFFLINE_BUILD=1 npm run dev
```

## Offline / itch.io Build

Package the game as a self-contained browser app (no server, no accounts) for itch.io and similar HTML5 portals:

```
npm run build:itch
```

Output: `dist/tibia-dungeons-itch.zip`. On itch.io pick **Kind of project: HTML** and check *"This file will be played in the browser"*.

**How it works.** A build-time flag `OFFLINE_BUILD` (esbuild `define` in `scripts/build.js` and `scripts/build-itch.js`) routes every `/api/*` call through `game/js/offline-api.js`, a localStorage-backed stub (`td.offline.user`, `td.offline.saves`, `td.offline.runs`). The login overlay is skipped — the player lands in character select with a persisted guest name. Hall of Fame becomes personal (per-device). The service worker registration and PWA manifest `<link>` are stripped from the staged `index.html` because both break inside itch.io's iframe; the files themselves still ship (harmless).

`scripts/build-itch.js` never mutates `game/` — it stages to `dist/itch-staging/`, bundles there, and zips from that tree.

## Pre-game UI theme

Menu overlays (auth, character select, saved games, loading, hall of fame) share a dungeon-cinematic palette:

- Primary: ember amber `#e2a030` → `#f4c054` (torchlight)
- Accent: ice blue `#5fb3ff` (enchanted sword)
- Destructive: crimson `#8a2a2a` → `#d74848` (hero's cape)
- Text: parchment `#efe4c9` / stone `#c9b589` / dim `#9a8468`

Background art in `game/data/images/game/`:

- `preview.jpg` → auth overlay, character select, loading screen, social preview (`og:image`)
- `sword.jpg` → saved games overlay, hall of fame overlay

## Project Structure

- `game/` — frontend (index.html, JS modules, data files, images)
- `game/js/runtime/core/engine/game.engine.js` — main game engine (~9400+ lines)
- `game/js/auth.js` — auth bootstrap + saves screen (routes through `offline-api.js` when `OFFLINE_BUILD`)
- `game/js/offline-api.js` — localStorage-backed `/api/*` stub for the itch.io build
- `game/data/` — JSON data files (items, creatures, spells, etc.) and images
- `api/` — Vercel serverless functions (production, uses Upstash Redis)
- `scripts/build.js` — esbuild bundler (supports `--offline`)
- `scripts/build-itch.js` — stages, bundles offline, and zips `dist/tibia-dungeons-itch.zip`
- `scripts/dev-server.js` — local dev server mirroring the Vercel API
- `scripts/bump-patch.js` / `bump-minor.js` — version bump helpers
