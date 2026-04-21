# Gameplay notes — empirical observations

Concrete observations about how the game actually behaves. Captured from production playtests via [`scripts/playtest.js`](../scripts/playtest.js) (Playwright bot — registers a random-name account, picks random class/gender, records DOM/combat-log state, plays until death) and from human play. Source of truth for combat formulas, balance quirks, and bot-accessible signals.

> Most of this used to live in [`CLAUDE.md`](../CLAUDE.md). It moved here in the docs refactor to keep the entry point lean. **The data is empirical** — verify against current code if you depend on a specific value.

## Starting state across all classes

In every bot run on v1.0.0:

- **HP 150 / MP 10** — MP is 10 even for Paladin/Knight; caster MP scaling presumably comes via Magic Level, not base.
- **Fist 10, Shield 10, Capacity 13.0 / 400.**
- **Equipment:** `Bag` in the bag slot + `Torch` in the light slot. Every other slot (weapon, armor, shield, amulet, ring, legs, boots, ammo) is **empty**.
- **0 gold** ([`game/js/ui/inventoryPanel.js`](../game/js/ui/inventoryPanel.js) — `addCoinsToInventory(0)` near the boot block).
- **No spells learned.**

The implication: the game is designed around buying starter gear before engaging. A player who rushes the first corridor with fists deals laughable damage and gets swarmed — three bot runs died on **Floor 1** without clearing more than 1 rat. A real player should open **Items Shop** before stepping into combat.

## Floor structure

**Floor tiers are named.** First combat-log line each floor reads e.g. `Floor 1: Glires (base dmg 8).` — each floor has a theme (`Glires` = rodents) and a "base damage" number that sets creature hit strength. Configured in [`game/js/data/floorSpawnConfig.js`](../game/js/data/floorSpawnConfig.js).

**Floor 1 = Glires = Rats**, 10 spawned per run.

**Floor-exit rule:** the stairs to the next floor only unlock **after every creature in the current floor's "room" has been killed**. The `#sbCreatures` strip (e.g. `Rats 10/10`) shows kill progress — left number alive, right total. Walking over a stairs tile with creatures remaining does nothing.

## Combat-log vocabulary

Useful when wiring tutorials, tooltips, or scraping for telemetry.

| Line | Meaning |
|---|---|
| `Rat uses Melee for 7.` | Telegraphed intent + damage. |
| `Rat hits you for 4.` | Attack landed. |
| `Rat uses Melee, but misses.` / `Rat misses the hit.` | Miss. |
| `Rat lands a CRITICAL hit for 17.` | Crits roughly 2× base damage. |
| `You hit Rat for 3.` / `You hit Rat for 2 (6 HP).` | Second number is target's remaining HP. |
| `Fist Fighting advanced to 11.` | Skills level up mid-combat. |
| `You are dead.` | Terminal line before the death overlay mounts. |

## Engine combat rule

Pressing a direction key (in [`game/js/engine/game.engine.js`](../game/js/engine/game.engine.js), search for `performPlayerAttack`) computes `targetTile = pos + dir` and then:

- creature on that tile → `performPlayerAttack()` (bump-attack, no move)
- tile walkable & empty → move one step
- wall → nothing (no move, no attack, key is wasted)

Throttled to one action per `playerActionDelayMs` (~190–320 ms depending on level — see `PLAYER_ACTION_DELAY_*` in [`game/js/config/game.config.js`](../game/js/config/game.config.js)). Holding a direction for N seconds yields `N × ~5` action attempts, each one either a swing (if a creature is in front) or a step.

**Pivot strategy** — single-direction holds of >10 s attack nothing because rats close in from other angles and the character never faces them. The reliable pattern is: cycle all four directions ~1.8 s each (≈9 swings per heading before pivoting). Any rat adjacent on any side eats 2–3 swings per rotation. This is what `scripts/playtest.js` does.

## Loot pickup behaviour

- `Rat dropped: Gold Coin.` → `Stored in bag: Gold Coin.` — gold auto-picked up when walking over the loot tile.
- `Stored in bag: Cheese.` — cheese drops. When HP gets low the engine auto-eats food from the bag (`You eat Cheese.`) and HP regen ticks up. Starving (no food) halts regen, which is what kills unassisted bots.
- `Fist Fighting advanced to 12.` — weapon skills level mid-combat; +2 fist skill matters for bare-knuckle runs.

## Hotkey mechanics

- **Movement:** Arrow keys or WASD. Walk into creatures to bump-attack.
- **Spells:** number keys `1`–`0` (and numpad equivalents) cast the spells in the hotbar slots.
- **Consumables:** `F` / `G` / `H` map to the three consumable slots. Empty slot = no-op (the bot pressed F dozens of times with no potion in inventory and never recovered HP).
- **Touchscreen:** virtual joystick + tap UI buttons.

## Bot-accessible run signals

| Selector | Content |
|---|---|
| `#sbHpText`, `#sbMpText`, `#sbLevel`, `#sbFloor`, `#sbML`, `#sbFist`, `#sbShield`, `#sbCap`, `#sbCharName`, `#sbCreatures` | Stats bar — poll every few seconds for a complete character snapshot. |
| `#gameXpBarText` | Current XP + level threshold. |
| `.game-log-row` × 5 | Rolling combat log. |
| `#slot{Helmet,Bag,Hand,Armor,Shield,Ring,Legs,Ammo,Boots,Light,Amulet}Label` | Equipment slot labels — `"Empty"` or item name. |

## Death overlay

`#deathSummaryOverlay` exposes five labelled stat rows (`.stat-row` → `.stat-label` + `.stat-value`):
- *Killed by, Floor reached, Creatures killed, Player level, Gold earned*

Plus a `.death-subtitle` like `🏹 Vale617 — Royal Paladin`. Safe to scrape for leaderboards/analytics.

## Keyboard-only bot ceiling

After tuning: best observed run was 4/10 kills on Floor 1 as Knight with the pivot cycle (Aeron119, guest mode, 157 s survival). Across 10 scripted runs the bot never cleared the room — Floor 2 would require either (a) a lucky seed where rats cluster in a corridor that funnels them into the bot's facing, or (b) mouse-click UI automation to open Items Shop, buy a weapon with looted gold, and drag it into the `#slotHand` panel. The engine's action delay and rat AI aggression cap the fist-only ceiling at ~40% room clear.

## Pre-game UI theme

Menu overlays (auth, character select, saved games, loading, hall of fame) share a dungeon-cinematic palette:

- Primary: ember amber `#e2a030` → `#f4c054` (torchlight)
- Accent: ice blue `#5fb3ff` (enchanted sword)
- Destructive: crimson `#8a2a2a` → `#d74848` (hero's cape)
- Text: parchment `#efe4c9` / stone `#c9b589` / dim `#9a8468`

Background art in `game/data/images/game/`:
- `preview.jpg` → auth overlay, character select, loading screen, social preview (`og:image`)
- `sword.jpg` → saved games overlay, hall of fame overlay

## Playtest bot quirks

- **Rate limiting.** The register endpoint on prod is rate-limited (HTTP 429 after ≈5 consecutive POSTs to `/api/auth/register` from the same IP).
- **Reuse credentials.** Set `TD_LOGIN_USER` + `TD_LOGIN_PASS` to log into an existing account.
- **Guest mode.** `TD_MODE=guest` clicks "Play as guest" and bypasses auth entirely.
