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

> **⚠ Don't run `npm run build:itch` unless the user explicitly asks for it.** The offline bundle is only rebuilt ahead of itch.io submissions — it's not part of the regular push/release flow and running it unsolicited wastes time and pollutes `dist/`.

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

## Controls (how to play)

**Movement:** Arrow keys or WASD to walk through the dungeon. Walk into
creatures to attack them in melee.

**Spells:** Number keys 1–9 to cast the spells in your hotbar. Buy new
spells at the Spells Shop between floors.

**Combat:** Ranged classes (Paladin, Sorcerer, Druid) auto-target the
nearest enemy. Knights should close the distance and tank.

**Inventory & shops:** Click items in the Equipment panel and Loot Bag
to equip, drop, or sell them. Open Items Shop to buy consumables, Spells
Shop to learn new magic.

**Tips:**
- Pick up every item you can — gold buys better gear and potions
- Clear every room before the stairs, enemies give XP
- Knight is the best starter class; Sorcerer scales hardest

**Touchscreen:** virtual joystick appears on mobile; tap UI buttons to
interact.

## Gameplay notes (from production playtests)

Observed via [scripts/playtest.js](scripts/playtest.js) (Playwright bot —
registers a random-name account on prod, picks random class/gender, records
DOM/combat-log state, plays until death). Data across 3 fresh runs on
v1.0.0.

**Starting stats are almost identical across classes** at level 1 — in every
run the character spawned with:

- HP 150 / MP 10 (MP is 10 even for Paladin/Knight; caster MP scaling
  presumably comes via Magic Level, not base)
- Fist 10, Shield 10, Capacity 13.0 / 400
- Equipment: `Bag` in the bag slot + `Torch` in the light slot. Every other
  slot (weapon, armor, shield, amulet, ring, legs, boots, ammo) is **empty**.

The implication: the game is designed around buying starter gear before
engaging. A player who rushes the first corridor with fists deals laughable
damage and gets swarmed — all three bot runs died on **Floor 1** without
clearing more than 1 rat. A real player should open **Items Shop** (on the
character select / floor-transition UI) before stepping into combat.

**Floor tiers are named.** The first combat-log line on each floor reads
e.g. `Floor 1: Glires (base dmg 8).` — so each floor has a theme
(`Glires` = rodents) and a "base damage" number that sets creature hit
strength. Floor-1 Glires = Rats, 10 spawned per run.

**Combat log vocabulary** (useful when wiring tutorials or tooltips):

- `Rat uses Melee for 7.` — telegraphed intent + damage.
- `Rat hits you for 4.` — attack landed.
- `Rat uses Melee, but misses.` / `Rat misses the hit.` — miss.
- `Rat lands a CRITICAL hit for 17.` — crits roughly 2× base damage.
- `You hit Rat for 3.` / `You hit Rat for 2 (6 HP).` — second number is
  the target's remaining HP.
- `Fist Fighting advanced to 11.` — skills level up mid-combat.
- `You are dead.` — terminal line before the death overlay mounts.

**Death overlay** (`#deathSummaryOverlay`) exposes five labelled stat rows
(`.stat-row` → `.stat-label` + `.stat-value`): *Killed by, Floor reached,
Creatures killed, Player level, Gold earned*. Plus a `.death-subtitle`
that reads e.g. `🏹 Vale617 — Royal Paladin`. Safe to scrape for
leaderboards/analytics.

**Hotkey mechanics confirmed**: `F`/`G`/`H` map to consumable slots. If the
slot is empty, the keypress is a no-op — the bot pressed F dozens of times
with no potion in inventory and never recovered HP. Digits `1`–`0` and
numpad equivalents cast spells in hotbar slots.

**Bot-accessible run signals** (for future playtest scripts):

- `#sbHpText`, `#sbMpText`, `#sbLevel`, `#sbFloor`, `#sbML`, `#sbFist`,
  `#sbShield`, `#sbCap`, `#sbCharName`, `#sbCreatures` — populated during
  play; poll every few seconds for a complete character snapshot.
- `#gameXpBarText` — current XP + level threshold.
- `.game-log-row` × 5 — rolling combat log.
- Equipment slot labels: `#slot{Helmet,Bag,Hand,Armor,Shield,Ring,Legs,
  Ammo,Boots,Light,Amulet}Label` — `"Empty"` or item name.

**Floor-exit rule** (confirmed by a human playtester): the stairs to the
next floor only unlock **after every creature in the current floor's
"room" has been killed**. The `#sbCreatures` strip (e.g. `Rats 10/10`)
shows the kill progress — left number is alive, right is total. Walking
over a stairs tile with creatures remaining does nothing.

**New characters start with 0 gold** (`addCoinsToInventory(0)` at [game.engine.js:1895](game/js/runtime/core/engine/game.engine.js#L1895)),
no equipment in any combat slot, and no spells learned (MP sits at 10/10
across all four classes throughout the run). Every starting character,
regardless of class, has the same 150 HP / Fist 10 / Shield 10 block,
so early-floor progression is entirely about **picking up rat drops to
afford a weapon from the Items Shop**, not class choice.

**Engine combat rule** ([game.engine.js:9041-9059](game/js/runtime/core/engine/game.engine.js#L9041)):
pressing a direction key computes `targetTile = pos + dir` and then:

- creature on that tile → `performPlayerAttack()` (bump-attack, no move)
- tile walkable & empty → move one step
- wall → nothing (no move, no attack, key is wasted)

Throttled to one action per ~190 ms (`nextPlayerActionAt`). So holding
a direction for N seconds yields `N × 5.3` action attempts, each one
either a swing (if a creature is in front) or a step.

**Pivot strategy** — single-direction holds of >10 s attack nothing
because rats close in from other angles and the character never faces
them. The reliable pattern is: cycle all four directions ~1.8 s each
(≈9 swings per heading before pivoting). Any rat adjacent on any side
eats 2–3 swings per rotation. This is what
[scripts/playtest.js](scripts/playtest.js) now does, and it's worth
knowing for anyone building their own automation.

**Runs dropped loot** (observed in combat log):

- `Rat dropped: Gold Coin.` → `Stored in bag: Gold Coin.` — gold auto-
  picked up when walking over the loot tile.
- `Stored in bag: Cheese.` — cheese drops. When HP gets low the engine
  auto-eats food from the bag (`You eat Cheese.`) and HP regen ticks
  up. Starving (no food) halts regen, which is what kills unassisted
  bots.
- `Fist Fighting advanced to 12.` — weapon skills level mid-combat; a
  +2 fist skill round is meaningful for bare-knuckle runs.

**Keyboard-only bot ceiling** after tuning: best observed run was 4/10
kills on Floor 1 as Knight with the pivot cycle (Aeron119, guest mode,
157 s survival). Across 10 scripted runs the bot never cleared the room
— Floor 2 would require either (a) a lucky seed where rats cluster in a
corridor that funnels them into the bot's facing, or (b) mouse-click UI
automation to open Items Shop, buy a weapon with looted gold, and drag
it into the `#slotHand` panel. The engine's `playerActionDelayMs` and
rat AI aggression make the fist-only ceiling hard to break past ~40 %
room clear.

The register endpoint on prod is **rate-limited** (HTTP 429 after ≈5
consecutive POSTs to `/api/auth/register` from the same IP); the
playtest script supports `TD_LOGIN_USER` + `TD_LOGIN_PASS` to reuse an
existing account and `TD_MODE=guest` to click "Play as guest" and
bypass auth entirely when iterating.

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
- `scripts/playtest.js` — Playwright bot that registers a fresh account and records a full run (useful for regression + gameplay observation)
- `scripts/record-gameplay.js` — Playwright + ffmpeg 19-second gameplay clip for store submissions
- `scripts/gen-covers.js` — sharp-based generator for the 16:9 / 2:3 / 1:1 store cover images
- `scripts/bump-patch.js` / `bump-minor.js` — version bump helpers
