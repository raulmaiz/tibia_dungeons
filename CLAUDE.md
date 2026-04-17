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

## Project Structure

- `game/` — frontend (index.html, JS modules, data files, images)
- `game/js/runtime/core/engine/game.engine.js` — main game engine (~7600+ lines)
- `game/data/` — JSON data files (items, creatures, spells, etc.)
- `api/` — Vercel serverless functions (production, uses Upstash Redis)
- `scripts/` — version bump scripts
