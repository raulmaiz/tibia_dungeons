import {
  getCreatureTypeProgressionGroups,
  getItemByArticleId,
  getItemShopCatalog,
  getCreatureDropTable,
  getSpellsCatalogWithPrices,
  getCreatureAbilitiesById,
  getCreatureDamageModifiersById,
  getManifest,
  imageUrl,
} from '../dataService.js';
import {
  parseDamageRangeString,
  averageMagicWeaponHitPreview,
  progressionStatsForLevel,
} from '../mechanics/progression.js';
import { LootPityTracker } from '../mechanics/loot.js';
import { generateLevelMap as buildDungeonLevelMap, computeDungeonSize } from '../dungeon/generator.js';
import { createFloorAtmosphere } from './floorAtmosphere.js';
import { castCreatureSpellVfx, castFireballExplosion, isElementalAbility, isFireballAbility } from './creatureSpellVfx.js';
import { wirePanelLayoutSync } from '../ui/panelLayout.js';
import { isBlockedSpellTitle } from '../entities/Spell/filters.js';
import { inferCreatureAbilityPattern } from '../entities/Creature/abilityPatterns.js';
import {
  EARLY_LEVELS,
  FORCED_CREATURE_ID_BY_LEVEL,
  FORCED_CREATURE_IDS_BY_LEVEL,
  FORCED_CREATURE_TEMPLATE_BY_LEVEL,
  FORCED_CREATURE_TEMPLATES_BY_LEVEL,
  TROLL_ALLOWED_IDS,
  FLOOR_CREATURE_COUNTS,
  FLOOR_DISPLAY_LABEL,
} from '../data/floorSpawnConfig.js';
import {
  shakeCamera,
  flashCamera,
  radialSparkBurst,
  shockwaveRing,
  floatingCombatText,
  tileSpellBurst,
  spellAuraBurst,
  spellProjectileLine,
  rangedProjectileLine,
  missEffect,
  critBanner,
} from '../rendering/Renderer.js';
import {
  frameTextureName,
  deathTextureName,
  creatureKey,
  applyCreatureSize,
  createPlayerSprite,
  createCreatureSprite,
  createGroundTile,
  createFireFieldSprite,
  createPoisonFieldSprite,
} from '../rendering/SpriteFactory.js';
import {
  TILE_SIZE,
  MAP_W,
  MAP_H,
  MAX_DUNGEON_W,
  MAX_DUNGEON_H,
  START_TILE,
  START_BAG_ARTICLE_ID,
  GOLD_COIN_ID,
  PLATINUM_COIN_ID,
  CRYSTAL_COIN_ID,
  GOLD_PER_PLATINUM,
  PLATINUM_PER_CRYSTAL,
  CREATURE_POOL_PER_LEVEL,
  MIN_CREATURES_PER_LEVEL,
  MAX_CREATURES_PER_LEVEL,
  PLAYER_BASE_DAMAGE,
  PLAYER_INITIAL_FIST_LEVEL,
  PLAYER_INITIAL_SHIELDING_LEVEL,
  PLAYER_MOVE_DURATION_BASE_MS,
  PLAYER_MOVE_DURATION_MIN_MS,
  PLAYER_MOVE_DURATION_MAX_MS,
  PLAYER_ACTION_DELAY_BASE_MS,
  PLAYER_ACTION_DELAY_MIN_MS,
  PLAYER_ACTION_DELAY_MAX_MS,
  MAX_FOOD_SECONDS,
} from '../config/game.config.js';
import {
  SCENE_BACKGROUND_COLOR,
  CREATURE_FILL_TARGET,
  LEFT_SIDEBAR_W,
  RIGHT_SIDEBAR_W,
  TOP_PANELS_H,
  BOTTOM_BAR_H,
  UI_BOTTOM_SPACE,
  UI_OVERLAP_ROWS,
  LIGHT_ITEM_ID_TORCH,
  LIGHT_ITEM_ID_LIGHT_WAND,
  LIGHT_RADIUS_TORCH,
  LIGHT_RADIUS_LIGHT_WAND,
  LIGHT_RADIUS_DEFAULT,
  DEFAULT_LIGHT_DURATION_MS,
  TORCH_BURN_MEDIUM_THRESHOLD,
  TORCH_BURN_SMALL_THRESHOLD,
} from '../config/visual.config.js';
import { bus, EVENTS } from '../core/EventBus.js';
import { worldX, worldY } from '../world/Projection.js';
import {
  attachAtmosphereLightSink,
  loadKnownItemImages,
  applyEquipmentLightFromItem,
  getCurrentLightElapsedMs,
  getLootLightItemImage,
  updateEquippedLightSlotImage,
  applyCurrentLightStateToAtmosphere,
} from '../systems/lighting/LightItems.js';
import { SPELL_FX_OVERRIDES } from '../entities/Spell/fxOverrides.js';
import { CREATURE_DAMAGE_MULTIPLIER_BY_ID } from '../entities/Creature/damageModifiers.js';
import {
  onPanelLog,
  onConsumeFood,
  onUseLiquid,
  onUseTool,
  onPlayerLevelStatsUpdate,
  inventorySetEquippedSlotVisual,
  inventoryClearEquippedSlotVisual,
  lastLootRejectReason,
  setOnPanelLog,
  setOnConsumeFood,
  setOnUseLiquid,
  setOnUseTool,
} from '../state/playerSession.js';
import { setupInventoryPanel } from '../ui/inventoryPanel.js';
import { setLoadingProgress } from '../ui/loadingScreen.js';
import {
  captureSaveSnapshot,
  restoreWeaponSkills,
  restoreLearnedSpells,
} from './systems/SaveLoad.js';
import {
  initMinimap,
  drawMinimapBase,
  drawMinimapDynamic,
} from './systems/Minimap.js';
import {
  initCombatLog,
  addCombatLog,
  LOG_COLORS,
} from './systems/CombatLog.js';
import {
  hideSpellTooltip,
  bindSpellTooltip,
  bindSpellBarTooltip,
  setupSpellTooltipDismissers,
  hasRealHover,
  esc,
  ttRow,
} from './systems/SpellTooltip.js';
import {
  showEatEffect,
  showDrinkEffect,
  showFullFoodEffect,
  showLevelUpText,
  showSkillLevelUpText,
} from './systems/FloatingEffects.js';
import {
  setupMarket,
  updateMarketBanner,
  updateOpenMarketButton,
} from './systems/Market.js';
import {
  setupItemsShop,
  renderItemsShop,
} from './systems/ItemsShop.js';
import {
  setupSpellShop,
  renderSpellShop,
  invalidateSpellShopCache,
} from './systems/SpellShop.js';
import { generateLevelMap } from './systems/Dungeon.js';
import {
  setupDeathSummary,
  showDeathSummary,
  showHallOfFame,
} from './systems/DeathSummary.js';
import {
  setupGroundLoot,
  dropItemOnGround,
  pickupGroundLootAtPlayer,
  clearGroundLoot,
} from './systems/GroundLoot.js';
import { createPlayer } from '../entities/Player/Player.js';
import {
  getEquippedHandWeapon,
  getEquippedAmmo,
  getEquippedShield,
  isMagicRangedWeapon,
  isThrowableWeapon,
  isClassicDistanceWeapon,
  isDistanceWeapon,
  magicWeaponDamageTypeSuffix,
  magicWeaponDamageTypeRaw,
  magicWeaponManaCost,
  ammoKindForWeapon,
  ammoKindForItem,
  isAmmoCompatibleWithWeapon,
  requiresAmmoForWeapon,
  hasAmmoForWeapon,
  ammoAttackBonus,
  rangeFromAttributes,
  effectiveWeaponRange,
} from './systems/Weapons.js';
import {
  pickCreatureDamage as _pickCreatureDamage,
  maxIncomingHitByFloor as _maxIncomingHitByFloor,
  clampIncomingCreatureDamage as _clampIncomingCreatureDamage,
  didAttackMiss,
  didAttackCrit,
  applyCriticalDamage,
  applyShieldingReduction as _applyShieldingReduction,
  applyMultiAttackerPressure as _applyMultiAttackerPressure,
} from './systems/CombatMath.js';
import {
  defaultElementMods,
  mergeCreatureElementModsForId as _mergeCreatureElementModsForId,
  normalizeDamageTypeToModifierKey,
  inferSpellDamageElementKey,
  applyIncomingElementalDamage,
} from './systems/ElementalMods.js';
import {
  projectileVisualForWeapon as _projectileVisualForWeapon,
  showAmmoImpactEffect as _showAmmoImpactEffect,
  showCritText as _showCritText,
  showMissSmoke as _showMissSmoke,
  showPlayerHitEffect as _showPlayerHitEffect,
  showCreatureHitEffect as _showCreatureHitEffect,
  showRangedProjectileEffect as _showRangedProjectileEffect,
} from './systems/HitVisuals.js';
import {
  spellFxProfile,
  showSpellTileEffect as _showSpellTileEffect,
  showSpellAuraEffect as _showSpellAuraEffect,
  showSpellProjectileEffect as _showSpellProjectileEffect,
  abilityStyle,
  fireballSizeTilesForEffect,
} from './systems/SpellVisuals.js';
import {
  inferSpellRange,
  inferHealingAmount as _inferHealingAmount,
  inferAttackDamage as _inferAttackDamage,
  isSingleTargetAttackPattern,
  inferClassAdjustedSpellDamage as _inferClassAdjustedSpellDamage,
  parseAbilityDamage,
  parseAbilityHeal,
  parseSummonMax,
} from './systems/SpellStats.js';
import {
  frontSweepTiles as _frontSweepTiles,
  frontSingleTile as _frontSingleTile,
  frontConeTiles as _frontConeTiles,
  frontBeamTiles as _frontBeamTiles,
  aroundCasterTiles as _aroundCasterTiles,
  ringAroundCasterTiles as _ringAroundCasterTiles,
  frontPlusTiles as _frontPlusTiles,
  frontBoxTiles as _frontBoxTiles,
  resolvePatternTiles as _resolvePatternTiles,
  bresenhamLineTiles,
  tilesNovaAtPoint,
  plusTilesAt,
  ringTilesAt,
  tilesNovaAroundCreature,
  creatureConeTowardPlayer as _creatureConeTowardPlayer,
  lineToPlayerFromCreature as _lineToPlayerFromCreature,
} from './systems/SpellPatterns.js';
import {
  setupLearnedSpells,
  renderLearnedSpells,
} from './systems/LearnedSpells.js';
import {
  setupSpellBar,
  renderSpellBar,
  renderConsumableBar,
  invalidateSpellBarCache,
  consumePendingSpellSlot,
  consumePendingConsumable,
} from './systems/SpellBar.js';
import { setupPlayerAttack } from './systems/PlayerAttack.js';
import { setupTargeting } from './systems/Targeting.js';
import {
  primeConjureAmmoCache,
  conjureArrowPayloadFromSpell,
  resolveConjuredArrowItem as _resolveConjuredArrowItem,
  placeConjuredArrow as _placeConjuredArrow,
} from './systems/ConjureAmmo.js';
import {
  setupStatusEffects,
  BURN_TICK_INTERVAL_MS,
  POISON_TICK_INTERVAL_MS,
  ELECTRIFIED_TICK_INTERVAL_MS,
} from './systems/StatusEffects.js';
import {
  showPlayerPoisonedEffect as _showPlayerPoisonedEffect,
  showPlayerElectrifiedEffect as _showPlayerElectrifiedEffect,
  showPlayerCureEffect as _showPlayerCureEffect,
  showPlayerLifeDrainEffect as _showPlayerLifeDrainEffect,
  showPlayerManaDrainEffect as _showPlayerManaDrainEffect,
} from './systems/PlayerFx.js';
import {
  playCreatureDeathEffect as _playCreatureDeathEffect,
  showCreatureSummonEffect as _showCreatureSummonEffect,
  showCreatureHealEffect as _showCreatureHealEffect,
} from './systems/CreatureFx.js';
import { setupCreatureMovement } from './systems/CreatureMovement.js';
import { setupSpellCasting } from './systems/SpellCasting.js';
import { setupCreatureAbilities } from './systems/CreatureAbilities.js';
import { setupCreatureSpawn, pickRandomCreatures } from './systems/CreatureSpawn.js';

// Expose the bus for debugging / browser console listeners.
if (typeof window !== 'undefined') window.tdEvents = bus;

let game;
let typeProgressionGroups = [];
let creatureDropTable = new Map();
const lootPityTracker = new LootPityTracker();
let spellsCatalog = [];
let itemsShopCatalog = [];
let creatureAbilitiesById = new Map();
let creatureDamageModifiersById = new Map();

// Light source state, image resolution, and atmosphere bridge live in
// systems/lighting/LightItems.js. The scene wires the atmosphere callback
// via attachAtmosphereLightSink() once floorAtmosphere is ready.

// Per-spell VFX (shapes/timing modeled after tibia.fandom.com spell
// descriptions) live in data/spellFxOverrides.js. Per-creature damage
// multipliers live in data/creatureDamageModifiers.js.

// Dimensiones del mapa actual (se actualizan en cada descendLevel).
let dungeonW = MAP_W;
let dungeonH = MAP_H;

function creaturePlural(name, count) {
  return `${name}${count === 1 ? '' : 's'}`;
}

function pickRandomTileFrom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function rollCreatureDrops(creatureId) {
  return lootPityTracker.roll(creatureDropTable, creatureId);
}

function isWalkableTile(gx, gy) {
  return gx >= 0 && gx < dungeonW && gy >= 0 && gy < dungeonH;
}

function startGame(configPlayer) {
  if (game) return;
  setupDeathSummary({
    onPlayAgain: () => {
      if (game) {
        // false = don't remove the canvas from DOM (avoids WebGL null-context errors)
        game.destroy(false);
        game = null;
        const phaserDiv = document.getElementById('phaser');
        if (phaserDiv) phaserDiv.innerHTML = '';
      }
    },
  });

  const tileSize = TILE_SIZE;
  const mapWidth = MAP_W * tileSize;
  const mapHeight = MAP_H * tileSize;
  const width = Math.min(window.innerWidth - LEFT_SIDEBAR_W - RIGHT_SIDEBAR_W, mapWidth);
  const height = Math.min(window.innerHeight - TOP_PANELS_H - BOTTOM_BAR_H, mapHeight);

  game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'phaser',
    backgroundColor: SCENE_BACKGROUND_COLOR,
    width,
    height,
    resolution: 1,
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: {
      preload() {
        // Registrar progress ANTES de encolar imágenes para que Phaser lo capture desde el inicio
        setLoadingProgress(45, 'Loading creatures...');
        this.load.on('progress', (value) => {
          setLoadingProgress(45 + Math.floor(value * 50), 'Loading creatures...');
        });

        for (let i = 0; i < 4; i += 1) {
          this.load.image(frameTextureName('male', i), imageUrl(`outfit_frames/male_${i}.png`));
          this.load.image(frameTextureName('female', i), imageUrl(`outfit_frames/female_${i}.png`));
        }
        this.load.image(deathTextureName('male'), imageUrl('other/you_are_death_male.jpg'));
        this.load.image(deathTextureName('female'), imageUrl('other/you_are_death_female.jpg'));
        // Hazard-field tile sprites (reused across every tile in a field).
        this.load.image('fx_fire_field', imageUrl('item/Fire.gif'));
        this.load.image('fx_poison_field', imageUrl('item/Poison Gas.gif'));
        const unique = new Map();
        for (const tier of typeProgressionGroups) {
          for (const c of tier.creatures) {
            if (!unique.has(c.id)) unique.set(c.id, c);
          }
        }
        for (const c of unique.values()) {
          this.load.image(creatureKey(c), imageUrl(c.image));
        }
      },
      create() {
        setLoadingProgress(100, 'Ready!');
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
          loadingOverlay.style.transition = 'opacity 0.4s ease';
          loadingOverlay.style.opacity = '0';
          setTimeout(() => { loadingOverlay.style.display = 'none'; loadingOverlay.style.opacity = '1'; }, 420);
        }

        const mapTiles = [];
        for (let y = 0; y < MAX_DUNGEON_H; y += 1) {
          mapTiles[y] = [];
          for (let x = 0; x < MAX_DUNGEON_W; x += 1) {
            mapTiles[y][x] = createGroundTile(this, x, y);
          }
        }

        const floorAtmosphere = createFloorAtmosphere(this, {
          tileSize,
          mapTiles,
          MAX_DUNGEON_W,
          MAX_DUNGEON_H,
        });
        // Bridge the equipment-light channel now that the atmosphere is ready.
        attachAtmosphereLightSink((r, d, e) => floorAtmosphere.setEquipmentLight(r, d, e));
        applyCurrentLightStateToAtmosphere();

        // SpriteFactory handles centering, 0.9-tile fill, and depth 25.
        const player = createPlayerSprite(this, configPlayer.sex, START_TILE.gx, START_TILE.gy);
        const deathCaption = this.add.text(player.x, player.y + tileSize * 0.72, 'You are dead.', {
          color: '#ffffff',
          fontSize: '12px',
          fontStyle: 'bold',
        });
        deathCaption.setOrigin(0.5, 0.5);
        deathCaption.setVisible(false);
        deathCaption.setDepth(30);
        const basePlayerScaleX = player.scaleX;
        const basePlayerScaleY = player.scaleY;
        const makeHealthBar = (color = 0x22c55e) => {
          const bg = this.add.rectangle(0, 0, tileSize * 0.9, 5, 0x111111, 0.95);
          const fill = this.add.rectangle(0, 0, tileSize * 0.86, 3, color, 1);
          bg.setStrokeStyle(1, 0x000000, 0.8);
          // Anclaje a la izquierda para evitar drift visual al reducir HP.
          bg.setOrigin(0.5, 0.5);
          fill.setOrigin(0, 0.5);
          return { bg, fill, width: tileSize * 0.86 };
        };
        const makeNameLabel = (text, color = '#e5e7eb') => {
          const label = this.add.text(0, 0, text, {
            color,
            fontSize: '11px',
            fontStyle: 'bold',
          });
          label.setOrigin(0.5, 0.5);
          return label;
        };
        const nameColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return '#22c55e'; // verde
          if (ratio > 0.33) return '#facc15'; // amarillo
          return '#ef4444'; // rojo
        };
        const barColorByHpRatio = (ratio) => {
          if (ratio > 0.66) return 0x22c55e; // verde
          if (ratio > 0.33) return 0xfacc15; // amarillo
          return 0xef4444; // rojo
        };
        const placeHealthBar = (bar, x, y) => {
          bar.bg.setPosition(x, y);
          bar.fill.setPosition(x - bar.width / 2, y);
        };
        const setHealthBarRatio = (bar, ratio) => {
          const r = Number.isFinite(ratio) ? ratio : 0;
          const clamped = Phaser.Math.Clamp(r, 0, 1);
          bar.fill.width = Math.max(0, bar.width * clamped);
        };
        const playerBar = makeHealthBar(0x22c55e);
        const playerManaBar = makeHealthBar(0x3b82f6);
        const playerNameTag = makeNameLabel(configPlayer.name, '#e5e7eb');
        playerBar.bg.setDepth(26);
        playerBar.fill.setDepth(27);
        playerManaBar.bg.setDepth(28);
        playerManaBar.fill.setDepth(29);
        playerNameTag.setDepth(31);

        // ── Stats bar DOM refs ────────────────────────────────────────────────
        const sbCharName = document.getElementById('sbCharName');
        const sbLevel = document.getElementById('sbLevel');
        const sbFloor = document.getElementById('sbFloor');
        const sbCreatures = document.getElementById('sbCreatures');
        const sbHpFill = document.getElementById('sbHpFill');
        const sbHpText = document.getElementById('sbHpText');
        const sbMpFill = document.getElementById('sbMpFill');
        const sbMpText = document.getElementById('sbMpText');
        const sbML = document.getElementById('sbML');
        const sbSkill = document.getElementById('sbSkill');
        const sbFistLabel = document.getElementById('sbFistLabel');
        const sbFist = document.getElementById('sbFist');
        const sbShield = document.getElementById('sbShield');
        const sbShieldLabel = document.getElementById('sbShieldLabel');
        const sbCap = document.getElementById('sbCap');
        const _isMobileView = () => window.innerWidth < 1200;
        const capitalise = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

        initCombatLog();
        setOnPanelLog(addCombatLog);
        addCombatLog('Combat ready.');


        // ── Minimap (HTML canvas in right sidebar) ───────────────────────────
        initMinimap();
        // Small wrappers so call sites stay short. The engine still drives
        // WHEN the minimap redraws (floor change + 200ms tick); Minimap.js
        // owns HOW it draws.
        const redrawMinimapBase = () => drawMinimapBase({
          map: currentMap, dungeonW, dungeonH,
          stairsTile: currentStairsTile, startTile: START_TILE,
        });
        const redrawMinimapDynamic = () => drawMinimapDynamic({ creatures, gridX: playerState.gridX, gridY: playerState.gridY });

        this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
        this.cameras.main.startFollow(player, true, 0.15, 0.15);

        const cursors = this.input.keyboard.createCursorKeys();
        const keys = this.input.keyboard.addKeys('W,A,S,D');
        const ctrlKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
        const consumableKeys = this.input.keyboard.addKeys({
          F: Phaser.Input.Keyboard.KeyCodes.F,
          G: Phaser.Input.Keyboard.KeyCodes.G,
          H: Phaser.Input.Keyboard.KeyCodes.H,
        });
        const spellHotkeys = this.input.keyboard.addKeys({
          one: Phaser.Input.Keyboard.KeyCodes.ONE,
          two: Phaser.Input.Keyboard.KeyCodes.TWO,
          three: Phaser.Input.Keyboard.KeyCodes.THREE,
          four: Phaser.Input.Keyboard.KeyCodes.FOUR,
          five: Phaser.Input.Keyboard.KeyCodes.FIVE,
          six: Phaser.Input.Keyboard.KeyCodes.SIX,
          seven: Phaser.Input.Keyboard.KeyCodes.SEVEN,
          eight: Phaser.Input.Keyboard.KeyCodes.EIGHT,
          nine: Phaser.Input.Keyboard.KeyCodes.NINE,
          zero: Phaser.Input.Keyboard.KeyCodes.ZERO,
          num1: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ONE,
          num2: Phaser.Input.Keyboard.KeyCodes.NUMPAD_TWO,
          num3: Phaser.Input.Keyboard.KeyCodes.NUMPAD_THREE,
          num4: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FOUR,
          num5: Phaser.Input.Keyboard.KeyCodes.NUMPAD_FIVE,
          num6: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SIX,
          num7: Phaser.Input.Keyboard.KeyCodes.NUMPAD_SEVEN,
          num8: Phaser.Input.Keyboard.KeyCodes.NUMPAD_EIGHT,
          num9: Phaser.Input.Keyboard.KeyCodes.NUMPAD_NINE,
          num0: Phaser.Input.Keyboard.KeyCodes.NUMPAD_ZERO,
        });
        const isTypingInInput = () => {
          const el = document.activeElement;
          if (!el) return false;
          const tag = String(el.tagName || '').toLowerCase();
          if (tag === 'textarea') return true;
          if (tag === 'input') {
            const input = /** @type {HTMLInputElement} */ (el);
            const type = String(input.type || 'text').toLowerCase();
            return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
          }
          return Boolean(/** @type {HTMLElement} */ (el).isContentEditable);
        };
        const syncGameKeyboardEnabled = () => {
          // Guard: focusin/focusout are document-level. After `game.destroy()`
          // (death → Play Again), the OLD scene's closure is still registered
          // but `this.input.keyboard` is stale. `addCapture` is the first
          // method off that null-ish object — check by presence, not truthy.
          const kb = this.input && this.input.keyboard;
          if (!kb || typeof kb.addCapture !== 'function') return;
          const typing = isTypingInInput();
          kb.enabled = !typing;
          // Phaser can still capture movement keys even when typing.
          // Remove captures while an input has focus so WASD writes normally.
          if (typing) {
            kb.removeCapture([
              Phaser.Input.Keyboard.KeyCodes.W,
              Phaser.Input.Keyboard.KeyCodes.A,
              Phaser.Input.Keyboard.KeyCodes.S,
              Phaser.Input.Keyboard.KeyCodes.D,
              Phaser.Input.Keyboard.KeyCodes.F,
              Phaser.Input.Keyboard.KeyCodes.G,
              Phaser.Input.Keyboard.KeyCodes.H,
              Phaser.Input.Keyboard.KeyCodes.UP,
              Phaser.Input.Keyboard.KeyCodes.DOWN,
              Phaser.Input.Keyboard.KeyCodes.LEFT,
              Phaser.Input.Keyboard.KeyCodes.RIGHT,
            ]);
          } else {
            kb.addCapture([
              Phaser.Input.Keyboard.KeyCodes.W,
              Phaser.Input.Keyboard.KeyCodes.A,
              Phaser.Input.Keyboard.KeyCodes.S,
              Phaser.Input.Keyboard.KeyCodes.D,
              Phaser.Input.Keyboard.KeyCodes.F,
              Phaser.Input.Keyboard.KeyCodes.G,
              Phaser.Input.Keyboard.KeyCodes.H,
              Phaser.Input.Keyboard.KeyCodes.UP,
              Phaser.Input.Keyboard.KeyCodes.DOWN,
              Phaser.Input.Keyboard.KeyCodes.LEFT,
              Phaser.Input.Keyboard.KeyCodes.RIGHT,
            ]);
          }
        };
        document.addEventListener('focusin', syncGameKeyboardEnabled, true);
        document.addEventListener('focusout', () => {
          this.time.delayedCall(0, syncGameKeyboardEnabled);
        }, true);
        syncGameKeyboardEnabled();
        const lvl1Stats = progressionStatsForLevel(1, String(configPlayer.classKey || 'knight').toLowerCase());
        // All player-scoped mutable state in one object. Every field is
        // written through `player.X`; systems modules receive the player
        // reference directly instead of a deps bag of getters.
        // Authoritative user-chosen display/reorder order of learned spells
        // lives on `playerState.learnedSpellOrder`; the first 10 entries are
        // the hotkey slots (1-9, then 0 for index 9). Named `playerState` to
        // avoid colliding with the Phaser sprite `player` created above.
        const playerState = createPlayer(configPlayer, lvl1Stats, {
          fistLevel: PLAYER_INITIAL_FIST_LEVEL,
          shieldingLevel: PLAYER_INITIAL_SHIELDING_LEVEL,
          moveDurationBase: PLAYER_MOVE_DURATION_BASE_MS,
          actionDelayBase: PLAYER_ACTION_DELAY_BASE_MS,
        });
        playerState.gridX = START_TILE.gx;
        playerState.gridY = START_TILE.gy;
        const playerBaseDamage = PLAYER_BASE_DAMAGE;
        let gameOver = false;
        let currentLevel = 1;
        let currentLevelGroup = null;
        let currentFloorCreatureLabel = '';
        const { pickGroupForLevel } = setupCreatureSpawn({
          getTypeProgressionGroups: () => typeProgressionGroups,
        });
        const recentEarlyCreatureIds = [];
        let currentMap = [];
        let currentFloors = [];
        let currentRooms = [];
        let currentStairsTile = { gx: MAP_W - 2, gy: MAP_H - 2 };
        let creaturesTargetCount = 0;
        // Local aliases that delegate to the Projection layer. Kept for the
        // dozens of closure-captured call sites; ISO migration removes these
        // and rewrites callers to use worldToScreen() directly.
        const centerX = worldX;
        const centerY = worldY;
        const xpToNextLevel = (level) => 50 + (level - 1) * 40;
        const weaponUsesToNextLevel = (skillLevel) => {
          const dl = Math.max(10, Math.floor(Number(skillLevel) || 10));
          // Much faster skill progression requested by user.
          return Math.max(6, Math.floor(4 + dl * 0.75));
        };
        const weaponSkillTypeKey = (item) => {
          if (!item) return null;
          if (String(item.item_class || '').toLowerCase() !== 'weapons') return null;
          const rawType = String(item.item_type || '').trim().toLowerCase();
          return rawType || 'weapons';
        };
        const weaponSkillLabel = (typeKey) => {
          const raw = String(typeKey || 'weapons')
            .replace(/\s+/g, ' ')
            .trim();
          return raw
            .split(' ')
            .map((p) => (p ? (p.charAt(0).toUpperCase() + p.slice(1)) : p))
            .join(' ');
        };
        const getWeaponSkillLevelByType = (typeKey) => {
          const key = String(typeKey || '').toLowerCase();
          if (!key) return 10;
          if (!playerState.weaponSkillLevelByType.has(key)) playerState.weaponSkillLevelByType.set(key, 10);
          return Math.max(10, Number(playerState.weaponSkillLevelByType.get(key) || 10));
        };
        const getWeaponSkillUsesByType = (typeKey) => {
          const key = String(typeKey || '').toLowerCase();
          if (!key) return 0;
          if (!playerState.weaponSkillUsesByType.has(key)) playerState.weaponSkillUsesByType.set(key, 0);
          return Math.max(0, Number(playerState.weaponSkillUsesByType.get(key) || 0));
        };
        const gainWeaponSkillUse = (item, amount = 1) => {
          const typeKey = weaponSkillTypeKey(item);
          if (!typeKey) return;
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          let level = getWeaponSkillLevelByType(typeKey);
          let uses = getWeaponSkillUsesByType(typeKey) + add;
          let leveled = false;
          while (uses >= weaponUsesToNextLevel(level)) {
            uses -= weaponUsesToNextLevel(level);
            level += 1;
            leveled = true;
          }
          playerState.weaponSkillUsesByType.set(typeKey, uses);
          playerState.weaponSkillLevelByType.set(typeKey, level);
          if (leveled) {
            addCombatLog(`${weaponSkillLabel(typeKey)} fighting advanced to ${level}.`);
            showSkillLevelUpText(this,`${weaponSkillLabel(typeKey)} Fighting`, level);
          }
        };
        const gainFistSkillUse = (amount = 1) => {
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          playerState.fistUses += add;
          let leveled = false;
          while (playerState.fistUses >= weaponUsesToNextLevel(playerState.fistLevel)) {
            playerState.fistUses -= weaponUsesToNextLevel(playerState.fistLevel);
            playerState.fistLevel += 1;
            leveled = true;
          }
          if (leveled) {
            addCombatLog(`Fist Fighting advanced to ${playerState.fistLevel}.`);
            showSkillLevelUpText(this,'Fist Fighting', playerState.fistLevel);
          }
        };
        const gainShieldingSkillUse = (amount = 1) => {
          const add = Math.max(0, Math.floor(Number(amount) || 0)) * 3;
          if (add <= 0) return;
          playerState.shieldingUses += add;
          let leveled = false;
          while (playerState.shieldingUses >= weaponUsesToNextLevel(playerState.shieldingLevel)) {
            playerState.shieldingUses -= weaponUsesToNextLevel(playerState.shieldingLevel);
            playerState.shieldingLevel += 1;
            leveled = true;
          }
          if (leveled) {
            addCombatLog(`Shielding advanced to ${playerState.shieldingLevel}.`);
            showSkillLevelUpText(this,'Shielding', playerState.shieldingLevel);
          }
        };
        const updatePlayerTimingsByLevel = () => {
          // Progresion gradual por nivel del personaje (arranque mas lento).
          playerState.moveDurationMs = Phaser.Math.Clamp(
            PLAYER_MOVE_DURATION_BASE_MS - (playerState.level - 1) * 2,
            PLAYER_MOVE_DURATION_MIN_MS,
            PLAYER_MOVE_DURATION_MAX_MS,
          );
          playerState.actionDelayMs = Phaser.Math.Clamp(
            PLAYER_ACTION_DELAY_BASE_MS - (playerState.level - 1) * 5,
            PLAYER_ACTION_DELAY_MIN_MS,
            PLAYER_ACTION_DELAY_MAX_MS,
          );
        };
        const grantPlayerXp = (amount) => {
          const raw = Number(amount);
          const add = Number.isFinite(raw) ? Math.max(0, raw) : 0;
          playerState.xp = (Number.isFinite(playerState.xp) ? playerState.xp : 0) + add;
          let leveled = false;
          while (playerState.xp >= xpToNextLevel(playerState.level)) {
            playerState.xp -= xpToNextLevel(playerState.level);
            playerState.level += 1;
            const nextStats = progressionStatsForLevel(playerState.level, playerState.classKey);
            playerState.maxHp = nextStats.maxHp;
            playerState.maxMana = nextStats.maxMana;
            playerState.magicLevel = Math.max(0, Number(nextStats.magicLevel || playerState.magicLevel || 0));
            if (typeof onPlayerLevelStatsUpdate === 'function') onPlayerLevelStatsUpdate(playerState.level);
            leveled = true;
          }
          if (leveled) {
            playerState.hp = playerState.maxHp;
            playerState.mana = playerState.maxMana;
            updatePlayerTimingsByLevel();
            addCombatLog(`You reached level ${playerState.level}.`);
            showLevelUpText(this);
            updatePlayerBar();
          }
        };
        const effectiveXpFromCreature = (creature) => {
          const xp = Number((creature && creature.experience) || 0);
          if (Number.isFinite(xp) && xp > 0) return Math.max(1, Math.floor(xp));
          // Fallback: monsters with 0 XP grant scaling XP based on player level.
          const lv = Number.isFinite(playerState.level) ? playerState.level : 1;
          return Math.max(1, Math.floor((5 + (lv * 3)) * 2));
        };
        const fallbackGoldFromLevel = () => {
          // Baseline gold reward when a monster drops no items.
          return Math.max(1, Math.floor(2 + (playerState.level * 2)));
        };

        const creatures = [];
        setupGroundLoot({
          scene: this,
          tileSize,
          centerX, centerY,
          getPlayerPos: () => ({ gx: playerState.gridX, gy: playerState.gridY }),
          onHudRefresh: () => updateHud(),
        });

        const isWallTile = (gx, gy) => {
          if (!isWalkableTile(gx, gy)) return true;
          return currentMap[gy][gx] === '#';
        };
        const isWalkable = (gx, gy) => !isWallTile(gx, gy);
        const isAdjacent = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
        /** Casillas a distancia 1 en 8 direcciones (incluye diagonal) para melé criatura → jugador. */
        const isCreatureMeleeAdjacent = (ax, ay, bx, by) => (
          Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1
        );
        const aliveCreatures = () => creatures.filter((c) => c.alive && !c.isConvinced);
        const aliveAllies = () => creatures.filter((c) => c.alive && c.isConvinced);
        const allAliveCreatures = () => creatures.filter((c) => c.alive);
        // Spatial cache for O(1) tile lookups. Invalidated on move/death/spawn;
        // rebuilt lazily on first read. BFS calls isOccupiedByActor thousands
        // of times per tick — without this, each call re-scans the full
        // creatures array.
        let _creatureTileMap = null;
        const _invalidateCreatureTileMap = () => { _creatureTileMap = null; };
        const _getCreatureTileMap = () => {
          if (_creatureTileMap) return _creatureTileMap;
          const m = new Map();
          for (let i = 0; i < creatures.length; i += 1) {
            const c = creatures[i];
            if (c && c.alive) m.set(c.gx * 100000 + c.gy, c);
          }
          _creatureTileMap = m;
          return m;
        };
        const creatureAt = (gx, gy) => {
          const c = _getCreatureTileMap().get(gx * 100000 + gy);
          return (c && c.alive) ? c : null;
        };
        const enemyCreatureAt = (gx, gy) => aliveCreatures().find((c) => c.gx === gx && c.gy === gy) || null;
        const MAX_CONVINCED = 2;
        // Saved ally templates for floor transitions
        let savedAllyTemplates = [];
        // Look up a creature template by title across every tier — used by
        // summon abilities to resolve "name" → spawnable creature. Returns
        // null if the title isn't in any tier (e.g. flavour-only summons).
        const findCreatureTemplateByTitle = (title) => {
          const needle = String(title || '').trim().toLowerCase();
          if (!needle) return null;
          for (const g of typeProgressionGroups) {
            const c = (g.creatures || []).find((x) => String(x.title || '').trim().toLowerCase() === needle);
            if (c) return c;
          }
          return null;
        };
        const findWalkableAdjacentTile = (gx, gy) => {
          const dirs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
          Phaser.Utils.Array.Shuffle(dirs);
          for (const [dx, dy] of dirs) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (!isWalkableTile(nx, ny)) continue;
            if (creatureAt(nx, ny)) continue;
            if (nx === playerState.gridX && ny === playerState.gridY) continue;
            return { gx: nx, gy: ny };
          }
          return null;
        };
        const isOccupiedByActor = (gx, gy) => {
          if (gx === playerState.gridX && gy === playerState.gridY) return true;
          return Boolean(creatureAt(gx, gy));
        };
        const orientCreatureSprite = (creature, dx, dy) => {
          // Tabla cerrada N/S/O/E.
          creature.sprite.setAngle(0);
          creature.sprite.setFlipX(false);
          creature.sprite.setFlipY(false);

          if (dx < 0) {
            // OESTE
            creature.sprite.setAngle(90);
            return;
          }
          if (dx > 0) {
            // ESTE (calibrado)
            creature.sprite.setAngle(-90);
            creature.sprite.setFlipX(true);
            return;
          }
          if (dy < 0) {
            // NORTE
            creature.sprite.setFlipY(true);
            return;
          }
          // SUR
          return;
        };
        const inAggroRange = (creature) => Math.abs(playerState.gridX - creature.gx) <= 4 && Math.abs(playerState.gridY - creature.gy) <= 4;
        const hasAggro = (creature) => creature.aggroLocked || inAggroRange(creature);
        const actionDelayFromSpeed = (speed) => {
          const s = Math.max(1, Number(speed || 100));
          // mas speed -> menos delay entre acciones
          return Phaser.Math.Clamp(950 - s * 2, 120, 900);
        };
        const updatePlayerBar = () => {
          placeHealthBar(playerBar, player.x, player.y - tileSize * 0.62);
          placeHealthBar(playerManaBar, player.x, player.y - tileSize * 0.48);
          playerNameTag.setPosition(player.x, player.y - tileSize * 0.8);
          const ratio = playerState.hp / playerState.maxHp;
          const manaRatio = playerState.maxMana > 0 ? (playerState.mana / playerState.maxMana) : 0;
          setHealthBarRatio(playerBar, ratio);
          setHealthBarRatio(playerManaBar, manaRatio);
          if (playerState.hp <= 0) {
            playerNameTag.setColor('#000000');
            playerBar.fill.setFillStyle(0x000000, 1);
            playerManaBar.fill.setFillStyle(0x000000, 1);
          } else {
            playerNameTag.setColor(nameColorByHpRatio(ratio));
            playerBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
            playerManaBar.fill.setFillStyle(0x3b82f6, 1);
          }
        };
        const setHungryState = (hungry, secondsLeft = 0) => {
          playerState.isHungry = hungry;
          if (typeof window.setHungryUi === 'function') window.setHungryUi(hungry, secondsLeft);
        };
        // Ctx passed to FloatingEffects for eat/drink/fullFood — bundles
        // the player sprite refs + an alive-check so the effects don't
        // overwrite the death pose if the player dies mid-tween.
        const floatingFxCtx = {
          player, tileSize, basePlayerScaleX, basePlayerScaleY,
          isActive: () => !playerState.dead,
        };
        setHungryState(true, 0);
        if (typeof onPlayerLevelStatsUpdate === 'function') onPlayerLevelStatsUpdate(playerState.level);
        setOnConsumeFood((foodSeconds, itemTitle) => {
          if (!Number.isFinite(foodSeconds) || foodSeconds <= 0 || playerState.dead || gameOver) return false;
          const nextSatiety = playerState.hungerSecondsLeft + Math.floor(foodSeconds);
          if (playerState.hungerSecondsLeft >= MAX_FOOD_SECONDS || nextSatiety > MAX_FOOD_SECONDS) {
            addCombatLog('You are too full to eat more.');
            showFullFoodEffect(this, floatingFxCtx);
            return false;
          }
          playerState.hungerSecondsLeft = nextSatiety;
          setHungryState(false, playerState.hungerSecondsLeft);
          addCombatLog(`You eat ${itemTitle}.`);
          showEatEffect(this, floatingFxCtx, itemTitle);
          return true;
        });
        setOnUseLiquid((item) => {
          if (!item || playerState.dead || gameOver) return false;
          const title = String(item.title || '').toLowerCase();
          let hpGain = 0;
          let mpGain = 0;
          // Canonical potion/fluid mapping (simplified).
          if (title.includes('ultimate health potion')) hpGain = 250;
          else if (title.includes('great health potion')) hpGain = 120;
          else if (title.includes('strong health potion')) hpGain = 70;
          else if (title.includes('health potion') || title.includes('lifefluid')) hpGain = 45;
          else if (title.includes('ultimate mana potion')) mpGain = 180;
          else if (title.includes('great mana potion')) mpGain = 90;
          else if (title.includes('strong mana potion')) mpGain = 55;
          else if (title.includes('mana potion') || title.includes('manafluid')) mpGain = 35;
          else if (title.includes('great spirit potion')) {
            hpGain = 85;
            mpGain = 45;
          }
          if (hpGain <= 0 && mpGain <= 0) {
            addCombatLog(`${item.title}: no usable liquid effect.`);
            return false;
          }
          const prevHp = playerState.hp;
          const prevMp = playerState.mana;
          playerState.hp = Math.min(playerState.maxHp, playerState.hp + hpGain);
          playerState.mana = Math.min(playerState.maxMana, playerState.mana + mpGain);
          const healed = playerState.hp - prevHp;
          const restored = playerState.mana - prevMp;
          if (healed > 0 && restored > 0) {
            addCombatLog(`You drink ${item.title}: +${healed} HP, +${restored} MP.`);
            showDrinkEffect(this, floatingFxCtx, `+${healed}HP +${restored}MP`, '#7dd3fc');
          } else if (healed > 0) {
            addCombatLog(`You drink ${item.title}: +${healed} HP.`);
            showDrinkEffect(this, floatingFxCtx, `+${healed}HP`, '#86efac');
          } else if (restored > 0) {
            addCombatLog(`You drink ${item.title}: +${restored} MP.`);
            showDrinkEffect(this, floatingFxCtx, `+${restored}MP`, '#93c5fd');
          } else {
            addCombatLog(`You drink ${item.title}, but no stats were restored.`);
          }
          updatePlayerBar();
          updateHud();
          return true;
        });
        const tryClimbUpFloor = (sourceName = 'rope') => {
          if (!hasRopeUpAtPlayer()) {
            addCombatLog('Use it on the entry tile (where you appear on this floor).');
            return true;
          }
          if (currentLevel <= 1) {
            addCombatLog('You are already on floor 1.');
            return true;
          }
          currentLevel = Math.max(1, currentLevel - 1);
          descendLevel(false);
          addCombatLog(`You climbed to floor ${currentLevel} using ${sourceName}.`);
          updateHud();
          return true;
        };
        setOnUseTool((item) => {
          if (!item || playerState.dead || gameOver) return false;
          if (Number(item.id) !== 2253) return false;
          return tryClimbUpFloor(item.title || 'item 2253');
        });
        const updateCreatureBar = (creature) => {
          if (!creature.hpBar) return;
          placeHealthBar(creature.hpBar, creature.sprite.x, creature.sprite.y - tileSize * 0.62);
          if (creature.nameTag) {
            creature.nameTag.setPosition(creature.sprite.x, creature.sprite.y - tileSize * 0.8);
          }
          const ratio = creature.maxHp > 0 ? creature.hp / creature.maxHp : 0;
          setHealthBarRatio(creature.hpBar, ratio);
          if (creature.nameTag) creature.nameTag.setColor(nameColorByHpRatio(ratio));
          creature.hpBar.fill.setFillStyle(barColorByHpRatio(ratio), 1);
          creature.hpBar.bg.setVisible(creature.alive);
          creature.hpBar.fill.setVisible(creature.alive);
          if (creature.nameTag) creature.nameTag.setVisible(creature.alive);
        };
        const updateAllHealthBars = () => {
          updatePlayerBar();
          // Per-move mutations already call updateCreatureBar themselves, so
          // this per-frame pass only needs to sync creatures near the player
          // (the ones the user can actually see). Off-screen monsters keep
          // their last bar state until they next move/take damage.
          const CULL_RANGE_TILES = 18;
          for (let i = 0; i < creatures.length; i += 1) {
            const c = creatures[i];
            if (!c.alive) continue;
            const dx = c.gx - playerState.gridX;
            const dy = c.gy - playerState.gridY;
            const absdx = dx < 0 ? -dx : dx;
            const absdy = dy < 0 ? -dy : dy;
            if ((absdx > absdy ? absdx : absdy) > CULL_RANGE_TILES) continue;
            updateCreatureBar(c);
          }
        };
        const hasStairsAtPlayer = () => playerState.gridX === currentStairsTile.gx && playerState.gridY === currentStairsTile.gy;
        const hasRopeUpAtPlayer = () => playerState.gridX === START_TILE.gx && playerState.gridY === START_TILE.gy;
        const refreshMapVisuals = () => {
          floorAtmosphere.rebuildAll(
            currentMap,
            dungeonW,
            dungeonH,
            currentStairsTile,
            START_TILE,
          );
        };
        const spawnCreaturesForLevel = (level) => {
          // Save convinced allies before clearing
          savedAllyTemplates = [];
          for (const c of creatures) {
            if (c.alive && c.isConvinced) {
              savedAllyTemplates.push({
                id: c.id, title: c.title, hp: c.hp, maxHp: c.maxHp,
                maxDamage: c.maxDamage, runsAt: c.runsAt, experience: c.experience,
                speed: c.speed, ranged: c.ranged, range: c.range,
                convinceCost: c.convinceCost,
                abilities: c.abilities, elementMods: c.elementMods,
              });
            }
            c.sprite.destroy();
            if (c.hpBar) {
              c.hpBar.bg.destroy();
              c.hpBar.fill.destroy();
            }
            if (c.nameTag) c.nameTag.destroy();
          }
          creatures.length = 0;

          // --- Sistema de counts exactos por floor fijo ---
          // Busca la plantilla de una criatura por ID en todas las fuentes conocidas.
          // Lookup ranged/range from typeProgressionGroups by creature ID.
          const lookupRangedFields = (id) => {
            for (const g of typeProgressionGroups) {
              const c = (g.creatures || []).find((x) => Number(x.id) === id);
              if (c) return {
                ranged: c.ranged === true,
                range: Math.max(1, Number(c.range || 1)),
                convince_cost: Math.max(0, Number(c.convince_cost || 0)),
                summon_cost: Math.max(0, Number(c.summon_cost || 0)),
              };
            }
            return { ranged: false, range: 1, convince_cost: 0, summon_cost: 0 };
          };
          const findTemplateById = (id) => {
            for (const arr of Object.values(FORCED_CREATURE_TEMPLATES_BY_LEVEL)) {
              const t = arr.find((x) => Number(x.id) === id);
              if (t) return { ...t, ...lookupRangedFields(id) };
            }
            const t2 = Object.values(FORCED_CREATURE_TEMPLATE_BY_LEVEL).find((x) => Number(x.id) === id);
            if (t2) return { ...t2, ...lookupRangedFields(id) };
            for (const g of typeProgressionGroups) {
              const c = (g.creatures || []).find((x) => Number(x.id) === id);
              if (c) return c;
            }
            return null;
          };
          let exactTemplates = null;
          const countConfig = FLOOR_CREATURE_COUNTS[Number(level)];
          if (countConfig) {
            exactTemplates = [];
            for (const [idStr, cnt] of Object.entries(countConfig)) {
              const tmpl = findTemplateById(Number(idStr));
              if (tmpl) {
                for (let k = 0; k < cnt; k += 1) exactTemplates.push({ ...tmpl });
              }
            }
            Phaser.Utils.Array.Shuffle(exactTemplates);
            creaturesTargetCount = exactTemplates.length;
          }

          const group = currentLevelGroup;
          const basePool = (group && group.creatures && group.creatures.length > 0)
            ? group.creatures.filter((c) => c.type_primary === group.type_primary)
            : [{ id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif', convince_cost: 200, summon_cost: 200 }];
          const earlyLevels = EARLY_LEVELS;
          const forcedCreatureIdByLevel = FORCED_CREATURE_ID_BY_LEVEL;
          const forcedCreatureIdsByLevel = FORCED_CREATURE_IDS_BY_LEVEL;
          const forcedCreatureTemplateByLevel = FORCED_CREATURE_TEMPLATE_BY_LEVEL;
          const forcedCreatureTemplatesByLevel = FORCED_CREATURE_TEMPLATES_BY_LEVEL;
          let levelPool;
          let hasForcedPoolRestriction = false;
          const templateDeck = forcedCreatureTemplatesByLevel[Number(level)];
          if (Array.isArray(templateDeck) && templateDeck.length > 0) {
            levelPool = templateDeck.map((x) => ({ ...x }));
            hasForcedPoolRestriction = true;
          } else {
            levelPool = basePool.slice();
          }
          if (String((group && group.type_primary) || '').toLowerCase().includes('troll')) {
            const trollAllowedIds = new Set(TROLL_ALLOWED_IDS);
            levelPool = levelPool.filter((c) => trollAllowedIds.has(Number(c && c.id)));
            hasForcedPoolRestriction = true;
          }
          const forcedCreatureId = forcedCreatureIdByLevel[Number(level)];
          const forcedCreatureIds = forcedCreatureIdsByLevel[Number(level)];
          if (Array.isArray(forcedCreatureIds) && forcedCreatureIds.length > 0) {
            const allowed = new Set(forcedCreatureIds.map((id) => Number(id)));
            levelPool = levelPool.filter((c) => allowed.has(Number(c && c.id)));
            hasForcedPoolRestriction = true;
            if (levelPool.length === 0) {
              if (Array.isArray(forcedCreatureTemplatesByLevel[Number(level)])) {
                levelPool = forcedCreatureTemplatesByLevel[Number(level)].map((x) => ({ ...x }));
              } else if (forcedCreatureTemplateByLevel[Number(level)]) {
                levelPool = [{ ...forcedCreatureTemplateByLevel[Number(level)] }];
              }
            }
          }
          if (forcedCreatureId != null) {
            levelPool = levelPool.filter((c) => Number(c && c.id) === forcedCreatureId);
            hasForcedPoolRestriction = true;
            if (levelPool.length === 0 && forcedCreatureTemplateByLevel[Number(level)]) {
              levelPool = [{ ...forcedCreatureTemplateByLevel[Number(level)] }];
            }
          }
          // Single-type-primary guarantee per floor:
          // we only use creatures from the selected group's type_primary.
          if (level <= earlyLevels) {
            const phase = (level - 1) / Math.max(1, earlyLevels - 1); // 0..1
            const values = (arr, pick) => arr
              .map((x) => Number(pick(x)))
              .filter((v) => Number.isFinite(v) && v > 0)
              .sort((a, b) => a - b);
            const pct = (sorted, p, fallback) => {
              if (!sorted || sorted.length === 0) return fallback;
              const clamped = Phaser.Math.Clamp(Number(p) || 0, 0, 1);
              const pos = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * clamped));
              return sorted[pos];
            };
            const baseHpSorted = values(basePool, (c) => c.hitpoints);
            const baseDmgSorted = values(basePool, (c) => c.maxDamage);
            const baseExpSorted = values(basePool, (c) => c.experience);
            const hpBase = pct(baseHpSorted, 0.72, 30);
            const dmgBase = pct(baseDmgSorted, 0.72, 8);
            const expBase = pct(baseExpSorted, 0.72, 15);
            const hpCap = Math.max(20, Math.floor(hpBase * (1.04 + phase * 0.30) + 5));
            const dmgCap = Math.max(4, Math.floor(dmgBase * (1.04 + phase * 0.34) + 1));
            const expCap = Math.max(8, Math.floor(expBase * (1.04 + phase * 0.36) + 3));
            const difficultyFiltered = levelPool.filter((c) => {
              const hp = Number(c && c.hitpoints);
              const dmg = Number(c && c.maxDamage);
              const exp = Number(c && c.experience);
              if (!Number.isFinite(hp) || !Number.isFinite(dmg) || !Number.isFinite(exp)) return false;
              return hp <= hpCap && dmg <= dmgCap && exp <= expCap;
            });
            if (difficultyFiltered.length >= 8) {
              levelPool = difficultyFiltered;
            } else if (!hasForcedPoolRestriction) {
              levelPool = basePool.slice();
            }
            // Progression hard-gate by floor (very conservative for first floors).
            const strictHpCapByFloor = (floor) => {
              if (floor <= 1) return 42;
              if (floor === 2) return 55;
              if (floor === 3) return 72;
              if (floor === 4) return 92;
              if (floor === 5) return 118;
              return Math.floor(118 + (floor - 5) * 20);
            };
            const strictDmgCapByFloor = (floor) => {
              if (floor <= 1) return 10;
              if (floor === 2) return 13;
              if (floor === 3) return 17;
              if (floor === 4) return 22;
              if (floor === 5) return 28;
              return Math.floor(28 + (floor - 5) * 4);
            };
            const strictExpCapByFloor = (floor) => {
              if (floor <= 1) return 22;
              if (floor === 2) return 36;
              if (floor === 3) return 54;
              if (floor === 4) return 78;
              if (floor === 5) return 110;
              return Math.floor(110 + (floor - 5) * 28);
            };
            const hpStrict = strictHpCapByFloor(level);
            const dmgStrict = strictDmgCapByFloor(level);
            const expStrict = strictExpCapByFloor(level);
            const strictFiltered = levelPool.filter((c) => {
              const hp = Number(c && c.hitpoints);
              const dmg = Number(c && c.maxDamage);
              const exp = Number(c && c.experience);
              if (!Number.isFinite(hp) || !Number.isFinite(dmg) || !Number.isFinite(exp)) return false;
              return hp <= hpStrict && dmg <= dmgStrict && exp <= expStrict;
            });
            if (strictFiltered.length >= 8) {
              levelPool = strictFiltered;
            }
            const recentSet = new Set(recentEarlyCreatureIds);
            const filtered = levelPool.filter((c) => !recentSet.has(Number(c.id)));
            if (filtered.length >= 12) levelPool = filtered;
            Phaser.Utils.Array.Shuffle(levelPool);
          }
          if (!exactTemplates) {
            if (Number(level) === 1) {
              creaturesTargetCount = 10;
            } else if (Number(level) > 20) {
              creaturesTargetCount = Phaser.Math.Between(1, 100);
            } else {
              creaturesTargetCount = Phaser.Math.Between(MIN_CREATURES_PER_LEVEL, MAX_CREATURES_PER_LEVEL);
            }
          }
          const templates = exactTemplates || pickRandomCreatures(levelPool, creaturesTargetCount);
          if (!templates || templates.length === 0) {
            addCombatLog(`Floor ${level}: no valid creature templates found.`);
            creaturesTargetCount = 0;
            return;
          }
          {
            const uniqueTitles = [...new Set(templates.map((t) => t.title).filter(Boolean))];
            const uniqueTypes = [...new Set(templates.map((t) => t.type_primary).filter(Boolean))];
            const explicitLabel = FLOOR_DISPLAY_LABEL[Number(level)];
            currentFloorCreatureLabel = explicitLabel
              || (uniqueTitles.length === 1 ? uniqueTitles[0]
                : (uniqueTypes.length === 1 ? uniqueTypes[0]
                  : (currentLevelGroup ? currentLevelGroup.type_primary : (templates[0]?.title || 'Creature'))));
          }
          if (level <= earlyLevels) {
            for (const t of templates) {
              const cid = Number(t && t.id);
              if (!Number.isFinite(cid)) continue;
              recentEarlyCreatureIds.push(cid);
            }
            if (recentEarlyCreatureIds.length > 40) {
              recentEarlyCreatureIds.splice(0, recentEarlyCreatureIds.length - 40);
            }
          }
          const roomTileSet = new Set();
          for (const room of currentRooms) {
            for (let ry = room.y; ry < room.y + room.h; ry += 1) {
              for (let rx = room.x; rx < room.x + room.w; rx += 1) {
                roomTileSet.add(`${rx},${ry}`);
              }
            }
          }
          const floorsForSpawn = currentFloors.filter(
            (t) =>
              !(t.gx === START_TILE.gx && t.gy === START_TILE.gy)
              && !(t.gx === currentStairsTile.gx && t.gy === currentStairsTile.gy)
              && (roomTileSet.size === 0 || roomTileSet.has(`${t.gx},${t.gy}`))
          );

          for (let i = 0; i < creaturesTargetCount; i += 1) {
            const spawn = floorsForSpawn.length > 0 ? floorsForSpawn.splice(Phaser.Math.Between(0, floorsForSpawn.length - 1), 1)[0] : null;
            const template = templates[i % templates.length];
            if (!spawn || !isWalkableTile(spawn.gx, spawn.gy)) continue;
            const requestedTextureKey = creatureKey(template);
            const fallbackTextureKey = creatureKey({ id: 1116 }); // Rat
            const requestedTexture = this.textures.get(requestedTextureKey);
            const requestedSource = requestedTexture && typeof requestedTexture.getSourceImage === 'function'
              ? requestedTexture.getSourceImage()
              : null;
            const fallbackTexture = this.textures.get(fallbackTextureKey);
            const fallbackSource = fallbackTexture && typeof fallbackTexture.getSourceImage === 'function'
              ? fallbackTexture.getSourceImage()
              : null;
            const safeTextureKey = requestedSource ? requestedTextureKey : (fallbackSource ? fallbackTextureKey : null);
            if (!safeTextureKey) {
              addCombatLog(`Floor ${level}: skipped ${template.title || 'creature'} (missing texture).`);
              continue;
            }
            if (safeTextureKey !== requestedTextureKey) {
              addCombatLog(`Floor ${level}: texture missing for ${template.title || 'creature'}, using fallback sprite.`);
            }
            const sprite = createCreatureSprite(this, safeTextureKey, spawn.gx, spawn.gy);
            const creatureId = Number(template.id);
            const damageMul = Number(CREATURE_DAMAGE_MULTIPLIER_BY_ID.get(creatureId) || 1);
            const baseMaxDamage = Math.max(1, Number(template.maxDamage || 1));
            const adjustedMaxDamage = Math.max(1, Math.floor(baseMaxDamage * damageMul));
            creatures.push({
              id: creatureId,
              sprite,
              gx: spawn.gx,
              gy: spawn.gy,
              hp: Math.max(1, Number(template.hitpoints || 1)),
              maxHp: Math.max(1, Number(template.hitpoints || 1)),
              maxDamage: adjustedMaxDamage,
              runsAt: Math.max(0, Number(template.runs_at || 0)),
              title: template.title,
              experience: Number(template.experience || 0),
              speed: Math.max(1, Number(template.speed || 100)),
              ranged: template.ranged === true,
              range: Math.max(1, Number(template.range || 1)),
              alive: true,
              nextWanderAt: 0,
              nextActionAt: 0,
              nextAbilityAt: 0,
              aggroLocked: false,
              abilities: (creatureAbilitiesById.get(creatureId) || []).slice(0, 16),
              elementMods: mergeCreatureElementModsForId(creatureId),
              hpBar: makeHealthBar(0xef4444),
              nameTag: makeNameLabel(template.title, '#f3f4f6'),
              convinceCost: Math.max(0, Number(template.convince_cost || 0)),
              isConvinced: false,
            });
            const spawned = creatures[creatures.length - 1];
            spawned.hpBar.bg.setDepth(16);
            spawned.hpBar.fill.setDepth(17);
            spawned.nameTag.setDepth(18);
            updateCreatureBar(spawned);
          }
          const first = templates[0] || levelPool[0];
          addCombatLog(
            `Floor ${level}: ${first.type_primary} (base dmg ${first.maxDamage}).`
          );
          // Respawn saved convinced allies near the player start tile (capped).
          // BFS outward from START_TILE through walkable tiles so the ally lands
          // on the nearest *reachable* free tile instead of being silently
          // dropped when the 8 immediate neighbours are all taken by enemies.
          const findAllyRespawnTile = () => {
            const seen = new Set([`${START_TILE.gx},${START_TILE.gy}`]);
            const queue = [{ x: START_TILE.gx, y: START_TILE.gy, d: 0 }];
            const steps = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
            const maxDist = 15;
            while (queue.length > 0) {
              const cur = queue.shift();
              if (cur.d > 0 && isWalkable(cur.x, cur.y) && !creatureAt(cur.x, cur.y)) {
                return { gx: cur.x, gy: cur.y };
              }
              if (cur.d >= maxDist) continue;
              for (const [dx, dy] of steps) {
                const nx = cur.x + dx;
                const ny = cur.y + dy;
                const k = `${nx},${ny}`;
                if (seen.has(k)) continue;
                seen.add(k);
                if (!isWalkable(nx, ny)) continue;
                queue.push({ x: nx, y: ny, d: cur.d + 1 });
              }
            }
            return null;
          };
          for (let i = 0; i < Math.min(savedAllyTemplates.length, MAX_CONVINCED); i++) {
            const tpl = savedAllyTemplates[i];
            const requestedKey = `creature_${tpl.id}`;
            const fallbackKey = 'creature_1116';
            const textureKey = this.textures.exists(requestedKey)
              ? requestedKey
              : (this.textures.exists(fallbackKey) ? fallbackKey : null);
            if (!textureKey) continue;
            const spot = findAllyRespawnTile();
            if (!spot) continue;
            const spawnGX = spot.gx;
            const spawnGY = spot.gy;
            const sprite = createCreatureSprite(this, textureKey, spawnGX, spawnGY);
            const ally = {
              id: tpl.id, sprite, gx: spawnGX, gy: spawnGY,
              hp: tpl.hp, maxHp: tpl.maxHp, maxDamage: tpl.maxDamage,
              runsAt: 0, title: tpl.title, experience: 0,
              speed: tpl.speed, ranged: tpl.ranged, range: tpl.range,
              alive: true, nextWanderAt: 0, nextActionAt: 0, nextAbilityAt: 0,
              aggroLocked: false,
              abilities: tpl.abilities || [], elementMods: tpl.elementMods || {},
              hpBar: makeHealthBar(0x22c55e),
              nameTag: makeNameLabel(tpl.title, '#4ade80'),
              convinceCost: tpl.convinceCost, isConvinced: true,
            };
            ally.hpBar.bg.setDepth(16);
            ally.hpBar.fill.setDepth(17);
            ally.nameTag.setDepth(18);
            ally.sprite.setTint(0x88ffaa);
            creatures.push(ally);
            updateCreatureBar(ally);
          }
          savedAllyTemplates = [];
        };
        const descendLevel = (toNext = true) => {
          setCombatIndicator(false);
          clearGroundLoot();
          clearAllFireFields();
          const prevLevel = currentLevel;
          if (toNext) currentLevel += 1;
          if (toNext) bus.emit(EVENTS.FLOOR_DESCENDED, { from: prevLevel, to: currentLevel });
          currentLevelGroup = pickGroupForLevel(currentLevel);
          // Calcular tamaño del mapa según las criaturas de este floor
          const floorCountCfg = FLOOR_CREATURE_COUNTS[Number(currentLevel)];
          const floorTotal = floorCountCfg
            ? Object.values(floorCountCfg).reduce((s, v) => s + v, 0)
            : MAX_CREATURES_PER_LEVEL;
          const { w: newW, h: newH } = computeDungeonSize(floorTotal);
          dungeonW = Math.min(newW, MAX_DUNGEON_W);
          dungeonH = Math.min(newH, MAX_DUNGEON_H);
          const generated = buildDungeonLevelMap({
            totalCreatures: floorTotal,
            MAP_W: dungeonW,
            MAP_H: dungeonH,
            START_TILE,
            between: Phaser.Math.Between,
            clamp: Phaser.Math.Clamp,
            random: Math.random,
          });
          currentMap = generated.map;
          currentStairsTile = generated.stairs;
          currentRooms = generated.rooms || [];
          this.cameras.main.setBounds(0, 0, dungeonW * tileSize, dungeonH * tileSize);
          // Solo usamos casillas conectadas al inicio para evitar monstruos bloqueados.
          const reachable = [];
          const visited = Array.from({ length: dungeonH }, () => Array.from({ length: dungeonW }, () => false));
          const q = [{ gx: START_TILE.gx, gy: START_TILE.gy }];
          visited[START_TILE.gy][START_TILE.gx] = true;
          while (q.length > 0) {
            const cur = q.shift();
            if (currentMap[cur.gy][cur.gx] === '.') reachable.push(cur);
            const dirs = [
              { dx: 1, dy: 0 },
              { dx: -1, dy: 0 },
              { dx: 0, dy: 1 },
              { dx: 0, dy: -1 },
            ];
            for (const d of dirs) {
              const nx = cur.gx + d.dx;
              const ny = cur.gy + d.dy;
              if (nx < 0 || ny < 0 || nx >= dungeonW || ny >= dungeonH) continue;
              if (visited[ny][nx]) continue;
              if (currentMap[ny][nx] !== '.') continue;
              visited[ny][nx] = true;
              q.push({ gx: nx, gy: ny });
            }
          }
          currentFloors = reachable;
          floorAtmosphere.setThemeForLevel(currentLevel);
          refreshMapVisuals();
          // refreshMapVisuals recreates the darkness render texture. The
          // equipment-light radius survives in the atmosphere closure, but
          // re-syncing from the UI layer ensures a floor change never leaves
          // the player with only the base halo while a torch is equipped.
          applyCurrentLightStateToAtmosphere();
          floorAtmosphere.showPit(false);
          redrawMinimapBase();
          redrawMinimapDynamic();
          const canRopeUp = currentLevel > 1;
          floorAtmosphere.showRopeAnchor(canRopeUp);
          spawnCreaturesForLevel(currentLevel);
          playerState.gridX = START_TILE.gx;
          playerState.gridY = START_TILE.gy;
          player.x = centerX(playerState.gridX);
          player.y = centerY(playerState.gridY);
          updatePlayerBar();
        };
        const isAdminUser = () => {
          try {
            return !!(window.tdAuth && typeof window.tdAuth.isAdmin === 'function' && window.tdAuth.isAdmin());
          } catch { return false; }
        };
        const setGodMode = (enabled) => {
          if (enabled && !isAdminUser()) {
            addCombatLog('God Mode is restricted to administrators.');
            return false;
          }
          playerState.godMode = Boolean(enabled);
          if (playerState.godMode) {
            gameOver = false;
            playerState.dead = false;
            playerState.hp = playerState.maxHp;
            playerState.mana = playerState.maxMana;
            addCombatLog('God Mode enabled.');
          } else {
            addCombatLog('God Mode disabled.');
          }
          updatePlayerBar();
          updateHud();
          return playerState.godMode;
        };
        const denyNonAdmin = () => {
          addCombatLog('debugGod is restricted to administrators.');
          return false;
        };
        window.debugGod = {
          enable() {
            return setGodMode(true);
          },
          disable() {
            // Always allow disabling — no reason to trap a non-admin in god mode
            // if it was somehow enabled before role state was known.
            return setGodMode(false);
          },
          toggle() {
            return setGodMode(!playerState.godMode);
          },
          isEnabled() {
            return Boolean(playerState.godMode);
          },
          goToFloor(level) {
            if (!isAdminUser()) return denyNonAdmin();
            const target = Math.max(1, Math.floor(Number(level) || 1));
            currentLevel = target;
            descendLevel(false);
            addCombatLog(`Teleported to floor ${target}.`);
            updateHud();
            return target;
          },
          nextFloor() {
            if (!isAdminUser()) return denyNonAdmin();
            return this.goToFloor(currentLevel + 1);
          },
          prevFloor() {
            if (!isAdminUser()) return denyNonAdmin();
            return this.goToFloor(Math.max(1, currentLevel - 1));
          },
        };
        const equipmentPanelEl = document.querySelector('.equipment-panel');
        const equipmentAccordionEl = document.getElementById('equipmentAccordion');
        const lootPanelEl = document.querySelector('.loot-panel');
        const statsPanelEl = document.getElementById('statsPanel');
        const spellsPanelEl = document.querySelector('.spells-panel');
        const spellsAccordionEl = document.getElementById('spellsAccordion');
        const learnedSpellsPanelEl = document.getElementById('learnedSpellsPanel');
        const itemsShopPanelEl = document.getElementById('itemsShopPanel');
        const itemsShopAccordionEl = document.getElementById('itemsShopAccordion');
        const itemsShopSearchInputEl = document.getElementById('itemsShopSearchInput');
        setupSpellTooltipDismissers();
        setupSpellBar({
          getCatalog:          () => spellsCatalog,
          learnedSpellIds: playerState.learnedSpellIds,
          learnedSpellOrder: playerState.learnedSpellOrder,
          spellCooldownUntil: playerState.spellCooldownUntil,
          spellCdDurations: playerState.spellCdDurations,
        });
        const lootAccordionEl = document.getElementById('lootAccordion');
        const {
          syncLootPanelPosition,
          syncStatsPanelPosition,
          syncLearnedPanelPosition,
          syncItemsShopPanelPosition,
        } = wirePanelLayoutSync({
          equipmentPanelEl,
          equipmentAccordionEl,
          lootPanelEl,
          lootAccordionEl,
          statsPanelEl,
          spellsPanelEl,
          spellsAccordionEl,
          learnedSpellsPanelEl,
          itemsShopPanelEl,
          itemsShopAccordionEl,
        });
        setupLearnedSpells({
          getCatalog:             () => spellsCatalog,
          learnedSpellIds: playerState.learnedSpellIds,
          learnedSpellOrder: playerState.learnedSpellOrder,
          onOrderChanged:         invalidateSpellBarCache,
          onPanelsResync:         () => {
            syncLootPanelPosition();
            syncLearnedPanelPosition();
            syncItemsShopPanelPosition();
          },
          onSpellBarRefresh:      () => renderSpellBar(),
          onConsumableBarRefresh: () => renderConsumableBar(),
        });
        const consumeConsumable = (type) => {
          const inv = window.debugInventory;
          if (!inv) return false;
          const ok = inv.consumeItem(type);
          if (ok) renderConsumableBar();
          return ok;
        };

        // ── Full Market overlay ─────────────────────────────────────────
        // Market browse/buy UI lives in engine/systems/Market.js. The engine
        // only feeds it the catalog + a few live getters + the HUD refresh
        // hook. setupMarket() wires the overlay's DOM listeners internally.
        setupItemsShop({
          getCatalog:             () => itemsShopCatalog,
          playerClassKey:         playerState.classKey,
          getAliveCreaturesCount: () => aliveCreatures().length,
          onHudRefresh:           () => updateHud(),
        });
        setupSpellShop({
          getCatalog:             () => spellsCatalog,
          playerClassKey:         playerState.classKey,
          getPlayerLevel:         () => playerState.level,
          learnedSpellIds: playerState.learnedSpellIds,
          learnedSpellOrder: playerState.learnedSpellOrder,
          getAliveCreaturesCount: () => aliveCreatures().length,
          onHudRefresh:           () => updateHud(),
          onLearnedSpellsRefresh: () => renderLearnedSpells(),
        });
        setupMarket({
          getCatalog:             () => itemsShopCatalog,
          playerClassKey:         playerState.classKey,
          getAliveCreaturesCount: () => aliveCreatures().length,
          onHudRefresh:           () => updateHud(),
        });
        const saveGameBtnEl = /** @type {HTMLButtonElement | null} */ (document.getElementById('saveGameBtn'));
        // Offline build: no cloud saves, and the itch.io audience expects
        // a simple pick-up-and-play experience. Hide the button entirely.
        if (OFFLINE_BUILD && saveGameBtnEl) saveGameBtnEl.style.display = 'none';
        const updateSaveGameButton = () => {
          if (!saveGameBtnEl || OFFLINE_BUILD) return;
          const clear = aliveCreatures().length === 0;
          saveGameBtnEl.disabled = !clear;
          saveGameBtnEl.title = clear ? '' : 'Clear all creatures first';
        };
        // Build the ctx object that SaveLoad.js expects. Kept as a single
        // callable so we don't rebuild the scaffold on every save click.
        const snapshotCtx = () => ({
          configPlayer,
          playerClassKey:       playerState.classKey,
          playerLevel:          playerState.level,
          playerXp:             playerState.xp,
          playerHp:             playerState.hp,
          playerMana:           playerState.mana,
          playerMaxHp:          playerState.maxHp,
          playerMaxMana:        playerState.maxMana,
          playerMagicLevel:     playerState.magicLevel,
          playerFistLevel:      playerState.fistLevel,
          playerShieldingLevel: playerState.shieldingLevel,
          weaponSkillLevelByType: playerState.weaponSkillLevelByType,
          currentLevel,
          gridX:             playerState.gridX,
          gridY:             playerState.gridY,
          hungerSecondsLeft: playerState.hungerSecondsLeft,
          runKills:          playerState.runKills,
          learnedSpellIds:   playerState.learnedSpellIds,
          learnedSpellOrder: playerState.learnedSpellOrder,
          burnState:         playerState.burnState,
          poisonState:       playerState.poisonState,
          electrifiedState:  playerState.electrifiedState,
        });
        if (saveGameBtnEl) {
          saveGameBtnEl.addEventListener('click', () => {
            if (aliveCreatures().length > 0) return;
            // Capture the run and hand it off to the Save Game screen — the
            // actual POST happens there when the player picks a slot. Guests
            // keep the snapshot in sessionStorage and are routed to the
            // registration form first (auth.js picks this up).
            try {
              const snapshot = captureSaveSnapshot(snapshotCtx());
              const existingId = (window.tdGame && typeof window.tdGame.getCurrentSaveId === 'function')
                ? window.tdGame.getCurrentSaveId() : null;
              sessionStorage.setItem('td.pendingSnapshot', JSON.stringify(snapshot));
              if (existingId) sessionStorage.setItem('td.pendingSaveId', existingId);
              else sessionStorage.removeItem('td.pendingSaveId');
            } catch { /* sessionStorage quota shouldn't realistically hit */ }
            if (window.tdAuth && typeof window.tdAuth.openSaveScreen === 'function') {
              window.tdAuth.openSaveScreen();
            } else {
              window.location.hash = '#/saves/save';
              window.location.reload();
            }
          });
        }
        updateSaveGameButton();

        // ── Game Settings: zoom slider (persisted in localStorage) ──
        const zoomSlider = /** @type {HTMLInputElement | null} */ (document.getElementById('gameZoomSlider'));
        const zoomValueEl = document.getElementById('gameZoomValue');
        if (zoomSlider) {
          const baseW = game.scale.width;
          const baseH = game.scale.height;
          const applyZoom = (val) => {
            const pct = Number(val) / 100;
            if (zoomValueEl) zoomValueEl.textContent = val + '%';
            zoomSlider.value = val;
            game.scale.resize(Math.round(baseW * pct), Math.round(baseH * pct));
          };
          const saved = localStorage.getItem('td.gameZoom');
          if (saved && Number(saved) >= 50 && Number(saved) <= 150) applyZoom(Number(saved));
          zoomSlider.addEventListener('input', () => {
            applyZoom(zoomSlider.value);
            try { localStorage.setItem('td.gameZoom', zoomSlider.value); } catch {}
          });
        }

        const renderTopStatsPanel = () => {
          const statsGridEl = document.getElementById('statsGrid');
          const statsFootEl = document.getElementById('statsFoot');
          if (!statsGridEl || !statsFootEl) return;
          const stats = [
            { key: 'Magic Level', level: Math.max(0, Number(playerState.magicLevel || 0)) },
            { key: 'Fist Fighting', level: Math.max(10, Number(playerState.fistLevel || 10)) },
            { key: 'Shielding', level: Math.max(10, Number(playerState.shieldingLevel || 10)) },
          ];
          for (const [typeKey, level] of playerState.weaponSkillLevelByType.entries()) {
            stats.push({
              key: `${weaponSkillLabel(typeKey)} Fighting`,
              level: Math.max(10, Number(level || 10)),
            });
          }
          stats.sort((a, b) => {
            if (b.level !== a.level) return b.level - a.level;
            return String(a.key).localeCompare(String(b.key));
          });
          statsGridEl.innerHTML = '';
          for (const s of stats) {
            const row = document.createElement('div');
            row.className = 'stats-row';
            const left = document.createElement('span');
            left.textContent = s.key;
            const right = document.createElement('strong');
            right.textContent = String(s.level);
            row.appendChild(left);
            row.appendChild(right);
            statsGridEl.appendChild(row);
          }
          statsFootEl.textContent = `${stats.length} stat${stats.length !== 1 ? 's' : ''}`;
          syncStatsPanelPosition();
        };
        const updateHud = () => {
          const group = currentLevelGroup;
          const typeName = currentFloorCreatureLabel || (group ? group.type_primary : 'Creature');
          const invState = window.debugInventory && typeof window.debugInventory.state === 'function'
            ? window.debugInventory.state()
            : null;
          const capTotal = invState ? Number(invState.capacity || 0) : progressionStatsForLevel(playerState.level, playerState.classKey).capacity;
          const capCurrent = invState ? Number(invState.carriedWeight || 0) : 0;
          const capCurrentText = Number.isFinite(capCurrent) ? capCurrent.toFixed(1) : '0.0';
          const capTotalText = Number.isFinite(capTotal) ? capTotal.toFixed(0) : '0';
          const handEq = invState && invState.equipped ? invState.equipped.hand : null;
          const skillType = weaponSkillTypeKey(handEq);
          const skillLevel = getWeaponSkillLevelByType(skillType);
          const skillUses = getWeaponSkillUsesByType(skillType);
          const skillNeed = weaponUsesToNextLevel(skillLevel);
          const skillPct = skillNeed > 0 ? Math.floor((skillUses / skillNeed) * 100) : 0;
          const skillLabel = weaponSkillLabel(skillType || 'Unarmed');
          if (typeof window !== 'undefined') {
            window.__gameHud = { ml: playerState.magicLevel, pl: playerState.level };
          }
          // ── Stats bar HTML update ───────────────────────────────────────
          if (sbCharName) sbCharName.textContent = `${configPlayer.name} (${capitalise(playerState.classKey)})`;
          if (sbLevel) sbLevel.textContent = String(playerState.level);
          if (sbFloor) sbFloor.textContent = String(currentLevel);
          if (sbCreatures) sbCreatures.textContent = `${typeName}  ${aliveCreatures().length}/${creaturesTargetCount}`;
          const hpPct = playerState.maxHp > 0 ? Phaser.Math.Clamp(playerState.hp / playerState.maxHp, 0, 1) : 0;
          const mpPct = playerState.maxMana > 0 ? Phaser.Math.Clamp(playerState.mana / playerState.maxMana, 0, 1) : 0;
          if (sbHpFill) sbHpFill.style.width = `${(hpPct * 100).toFixed(1)}%`;
          if (sbHpText) sbHpText.textContent = `${playerState.hp}/${playerState.maxHp}`;
          if (sbMpFill) sbMpFill.style.width = `${(mpPct * 100).toFixed(1)}%`;
          if (sbMpText) sbMpText.textContent = `${playerState.mana}/${playerState.maxMana}`;
          if (sbML) sbML.textContent = String(playerState.magicLevel);
          if (sbSkill) sbSkill.textContent = `${skillLabel} ${skillLevel} (${skillPct}%)`;
          const fistFullLabel = skillType ? skillLabel.split(' ')[0] : 'Fist';
          const fistDisplayLevel = skillType ? skillLevel : playerState.fistLevel;
          const mobile = _isMobileView();
          if (sbFistLabel) sbFistLabel.textContent = mobile ? fistFullLabel.slice(0, 3) : fistFullLabel;
          if (sbFist) sbFist.textContent = String(fistDisplayLevel);
          // Show Ammo count instead of Shielding when using a two-handed distance weapon
          const handWeaponHud = getEquippedHandWeapon();
          const handAttrsHud = Array.isArray(handWeaponHud && handWeaponHud.attributes) ? handWeaponHud.attributes : [];
          const isTwoHandedDist = handWeaponHud
            && String(handWeaponHud.item_type || '').toLowerCase() === 'distance weapons'
            && handAttrsHud.some(a => a && String(a.name || '').toLowerCase() === 'hands' && String(a.value || '').toLowerCase() === 'two');
          if (isTwoHandedDist) {
            const ammoItem = getEquippedAmmo();
            const ammoCount = ammoItem ? Math.max(1, Number(ammoItem.count || 1)) : 0;
            if (sbShieldLabel) sbShieldLabel.textContent = mobile ? 'Amm' : 'Ammo';
            if (sbShield) sbShield.textContent = String(ammoCount);
          } else {
            if (sbShieldLabel) sbShieldLabel.textContent = mobile ? 'Shi' : 'Shield';
            if (sbShield) sbShield.textContent = String(playerState.shieldingLevel);
          }
          if (sbCap) {
            sbCap.textContent = `CAP ${capCurrentText}/${capTotalText}`;
            const capRatio = capTotal > 0 ? Phaser.Math.Clamp(capCurrent / capTotal, 0, 1) : 0;
            const r = Math.round(226 + (248 - 226) * capRatio);
            const g = Math.round(232 - (232 - 113) * capRatio);
            const b = Math.round(240 - (240 - 113) * capRatio);
            sbCap.style.color = `rgb(${r},${g},${b})`;
          }
          const xpNeeded = xpToNextLevel(playerState.level);
          const safeXp = Number.isFinite(playerState.xp) ? playerState.xp : 0;
          const progress = xpNeeded > 0 && Number.isFinite(safeXp) ? safeXp / xpNeeded : 0;
          const safeProgress = Number.isFinite(progress) ? Phaser.Math.Clamp(progress, 0, 1) : 0;
          const xpBarFill = document.getElementById('gameXpBarFill');
          const xpBarText = document.getElementById('gameXpBarText');
          if (xpBarFill) xpBarFill.style.width = `${(safeProgress * 100).toFixed(1)}%`;
          if (xpBarText) xpBarText.textContent = `XP ${Math.floor(safeXp)} / ${xpNeeded}`;
          renderSpellShop();
          renderItemsShop();
          renderTopStatsPanel();
        };
        // Thin wrappers that inject engine-closure context into the pure
        // CombatMath helpers. Keeps per-call arg lists short at the (many)
        // call sites below.
        const pickCreatureDamage = () => _pickCreatureDamage(this._activeAttackerMaxDamage, currentLevel);
        const maxIncomingHitByFloor = () => _maxIncomingHitByFloor(currentLevel, playerState.maxHp);
        const clampIncomingCreatureDamage = (damage, creatureMaxDamage = 1) =>
          _clampIncomingCreatureDamage(damage, creatureMaxDamage, currentLevel, playerState.maxHp);
        const applyShieldingReduction = (incomingDamage) =>
          _applyShieldingReduction(incomingDamage, playerState.shieldingLevel);
        const canStrafeCastMagicWeapon = (weapon) => {
          if (!weapon) return false;
          if (isMagicRangedWeapon(weapon)) return playerState.classKey === 'druid' || playerState.classKey === 'sorcerer';
          if (isClassicDistanceWeapon(weapon)) return true;
          return false;
        };
        const hasEnoughManaForMagicWeapon = (weapon) => {
          const cost = magicWeaponManaCost(weapon);
          if (cost <= 0) return true;
          return playerState.mana >= cost;
        };
        // Thin wrapper injecting the catalog Map that ElementalMods.js needs.
        const mergeCreatureElementModsForId = (creatureId) =>
          _mergeCreatureElementModsForId(creatureId, creatureDamageModifiersById);
        const magicWeaponDamage = (weapon) => {
          const ml = Math.max(0, Number(playerState.magicLevel || 0));
          const lv = Math.max(1, Number(playerState.level || 1));
          const attrs = Array.isArray(weapon && weapon.attributes) ? weapon.attributes : [];
          const drRow = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'damage_range');
          const dr = drRow ? parseDamageRangeString(drRow.value) : null;
          const typeKey = weaponSkillTypeKey(weapon);
          const skillLevel = getWeaponSkillLevelByType(typeKey);
          const skillBonus = Math.max(0, Math.floor((skillLevel - 10) * 0.25));
          if (dr) {
            const rolled = Phaser.Math.Between(dr.min, dr.max);
            const mlFactor = 1 + ml * 0.045;
            const lvFactor = 1 + (lv - 1) * 0.01;
            return Math.max(1, Math.floor(rolled * mlFactor * lvFactor + skillBonus));
          }
          const weaponAttack = Math.max(0, Number((weapon && weapon.attack_value) || 0));
          return Math.max(5, Math.floor(3 + lv * 0.55 + ml * 3.0 + weaponAttack * 0.65 + skillBonus));
        };
        const currentPlayerDamage = (handOverride = undefined) => {
          const hand = handOverride === undefined ? getEquippedHandWeapon() : handOverride;
          if (isMagicRangedWeapon(hand)) return magicWeaponDamage(hand);
          if (!hand) {
            // Keep unarmed damage clearly below weapon damage progression.
            const fistBonus = Math.max(0, Math.floor((playerState.fistLevel - 10) * 0.6));
            return Math.max(1, Math.floor(3 + playerState.level * 0.22 + fistBonus));
          }
          const weaponAttack = Math.max(0, Number((hand && hand.attack_value) || 0));
          const rangedAmmoBonus = requiresAmmoForWeapon(hand) ? ammoAttackBonus(hand) : 0;
          const typeKey = weaponSkillTypeKey(hand);
          const skillLevel = getWeaponSkillLevelByType(typeKey);
          const weaponSkillBonus = Math.max(0, Math.floor((skillLevel - 10) * 0.8));
          const weaponBaseBonus = 6;
          const scaledWeaponAttack = Math.floor(weaponAttack * 1.35);
          return Math.max(2, playerBaseDamage + weaponBaseBonus + scaledWeaponAttack + rangedAmmoBonus + weaponSkillBonus);
        };
        const spendOneAmmo = (weapon) => {
          if (!requiresAmmoForWeapon(weapon)) return true;
          const ammo = getEquippedAmmo();
          if (!ammo) return false;
          if (!isAmmoCompatibleWithWeapon(weapon, ammo)) return false;
          const currentCount = Math.max(0, Number(ammo.count || 0));
          if (currentCount <= 0) return false;
          if (currentCount > 1) {
            const nextAmmo = { ...ammo, count: currentCount - 1 };
            if (typeof inventorySetEquippedSlotVisual !== 'function') return false;
            inventorySetEquippedSlotVisual('ammunition', nextAmmo, `${ammo.title}: ${currentCount - 1} left.`);
          } else {
            if (typeof inventoryClearEquippedSlotVisual !== 'function') return false;
            inventoryClearEquippedSlotVisual('ammunition', 'Out of ammunition.');
          }
          return true;
        };
        const {
          findRangedTargetInDirection,
          hasRangedLineOfSight,
          findNearestRangedTarget,
        } = setupTargeting({
          playerState,
          isWalkableTile,
          isWallTile,
          enemyCreatureAt,
          aliveCreatures,
        });
        // Thin wrappers injecting playerState progression into SpellStats.
        const inferHealingAmount = (spell) => _inferHealingAmount(spell, playerState.level, playerState.magicLevel);
        const inferAttackDamage = (spell) => _inferAttackDamage(spell, playerState.level, playerState.magicLevel);
        const inferClassAdjustedSpellDamage = (spell, opts = {}) => _inferClassAdjustedSpellDamage(
          spell, playerState.classKey, playerState.level, playerState.magicLevel,
          currentPlayerDamage, getWeaponSkillLevelByType, opts,
        );
        const resolveConjuredArrowItem = (payload) => _resolveConjuredArrowItem(payload, itemsShopCatalog);
        const placeConjuredArrow = (ammoItem, amount) => _placeConjuredArrow(ammoItem, amount, { inventorySetEquippedSlotVisual });
        // Thin wrappers: scene + tileSize + centerX/Y live in engine.
        const _spellTileCtx = () => ({
          tileSize, centerX, centerY,
          caster: { gridX: playerState.gridX, gridY: playerState.gridY },
          isWalkable: isWalkableTile,
        });
        const showSpellTileEffect = (tiles, color = 0xf59e0b, opts = {}) =>
          _showSpellTileEffect(this, _spellTileCtx(), tiles, color, opts);
        const showSpellAuraEffect = (x, y, spell, scale = 1) =>
          _showSpellAuraEffect(this, tileSize, x, y, spell, scale);
        const showSpellProjectileEffect = (spell, target) =>
          _showSpellProjectileEffect(this, { player, tileSize }, spell, target);
        // Thin wrappers: read playerState.{gridX,gridY,facingFrame} once per call.
        const _playerPos = () => ({ gridX: playerState.gridX, gridY: playerState.gridY, facingFrame: playerState.facingFrame });
        const frontSweepTiles = () => _frontSweepTiles(_playerPos());
        const frontSingleTile = () => _frontSingleTile(_playerPos());
        const frontConeTiles = (depth = 3) => _frontConeTiles(_playerPos(), depth);
        const frontBeamTiles = (len = 5) => _frontBeamTiles(_playerPos(), len);
        const aroundCasterTiles = (radius = 1) => _aroundCasterTiles(_playerPos(), radius);
        const ringAroundCasterTiles = (radius) => _ringAroundCasterTiles(_playerPos(), radius);
        const frontPlusTiles = (reach = 2) => _frontPlusTiles(_playerPos(), reach);
        const frontBoxTiles = (width, depth) => _frontBoxTiles(_playerPos(), width, depth);
        const resolvePatternTiles = (pattern) => _resolvePatternTiles(_playerPos(), pattern);
        // Ammo-aware projectile visuals
        // Thin wrapper so call sites don't have to pass ammo every time.
        const projectileVisualForWeapon = (weapon) => _projectileVisualForWeapon(weapon, getEquippedAmmo());
        // Thin wrappers injecting scene + local refs into the HitVisuals module.
        const hitFxPlayerCtx = {
          player, tileSize, basePlayerScaleX, basePlayerScaleY,
          isActive: () => !playerState.dead,
          onBarUpdate: () => updatePlayerBar(),
        };
        const hitFxCreatureCtx = {
          tileSize, centerX, centerY, applyCreatureSize,
          onBarUpdate: (c) => updateCreatureBar(c),
        };
        const showAmmoImpactEffect = (tx, ty, impactType) => _showAmmoImpactEffect(this, tx, ty, impactType);
        const showCritText = (x, y) => _showCritText(this, x, y, tileSize);
        const showMissSmoke = (x, y) => _showMissSmoke(this, x, y, tileSize);
        const showPlayerHitEffect = (dmg) => _showPlayerHitEffect(this, hitFxPlayerCtx, dmg);
        const showRangedProjectileEffect = (weapon, target) => _showRangedProjectileEffect(this, {
          player, tileSize, floorAtmosphere,
        }, weapon, target, getEquippedAmmo());
        const killSummonsOf = (parent) => {
          if (!parent) return;
          for (const c of creatures) {
            if (!c.alive) continue;
            if (c.summonedBy !== parent) continue;
            c.hp = 0;
            c.alive = false;
            playCreatureDeathEffect(c);
            updateCreatureBar(c);
            addCombatLog(`${c.title} (summoned by ${parent.title}) vanishes.`);
          }
        };
        const playCreatureDeathEffect = (creature) => _playCreatureDeathEffect({ scene: this, tileSize }, creature);
        const showCreatureHitEffect = (creature, dmg) => _showCreatureHitEffect(this, hitFxCreatureCtx, creature, dmg);
        const performPlayerAttack = setupPlayerAttack({
          scene: this,
          playerState,
          tileSize,
          centerX,
          centerY,
          floorAtmosphere,
          getCurrentLevel: () => currentLevel,
          aliveCreatures,
          inventorySetEquippedSlotVisual,
          updatePlayerBar,
          updateCreatureBar,
          updateHud,
          currentPlayerDamage,
          spendOneAmmo,
          gainWeaponSkillUse,
          gainFistSkillUse,
          grantPlayerXp,
          effectiveXpFromCreature,
          playCreatureDeathEffect,
          killSummonsOf,
          rollCreatureDrops,
          fallbackGoldFromLevel,
          canStrafeCastMagicWeapon,
          showCreatureHitEffect,
          showCritText,
          showAmmoImpactEffect,
          showMissSmoke,
          showRangedProjectileEffect,
        });
        const spawnSummonFromTemplate = (template, gx, gy, parent) => {
          const textureKey = creatureKey(template);
          if (!this.textures.exists(textureKey)) return null;
          const sprite = createCreatureSprite(this, textureKey, gx, gy);
          const creatureId = Number(template.id);
          const damageMul = Number(CREATURE_DAMAGE_MULTIPLIER_BY_ID.get(creatureId) || 1);
          const baseMaxDamage = Math.max(1, Number(template.maxDamage || 1));
          const adjustedMaxDamage = Math.max(1, Math.floor(baseMaxDamage * damageMul));
          const fresh = {
            id: creatureId,
            sprite,
            gx, gy,
            hp: Math.max(1, Number(template.hitpoints || 1)),
            maxHp: Math.max(1, Number(template.hitpoints || 1)),
            maxDamage: adjustedMaxDamage,
            runsAt: Math.max(0, Number(template.runs_at || 0)),
            title: template.title,
            experience: Number(template.experience || 0),
            speed: Math.max(1, Number(template.speed || 100)),
            ranged: template.ranged === true,
            range: Math.max(1, Number(template.range || 1)),
            alive: true,
            nextWanderAt: 0,
            nextActionAt: 0,
            nextAbilityAt: 0,
            aggroLocked: false,
            abilities: (creatureAbilitiesById.get(creatureId) || []).slice(0, 16),
            elementMods: mergeCreatureElementModsForId(creatureId),
            hpBar: makeHealthBar(0xef4444),
            nameTag: makeNameLabel(template.title, '#f3f4f6'),
            isSummon: true,
            summonedBy: parent || null,
            convinceCost: Math.max(0, Number(template.convince_cost || 0)),
            isConvinced: false,
          };
          fresh.hpBar.bg.setDepth(16);
          fresh.hpBar.fill.setDepth(17);
          fresh.nameTag.setDepth(18);
          creatures.push(fresh);
          _invalidateCreatureTileMap();
          updateCreatureBar(fresh);
          return fresh;
        };
        // ── Status chips (HUD indicator pills) ────────────────────────
        const combatChipEl = document.getElementById('statusCombat');
        const burnChipEl = document.getElementById('statusBurn');
        const poisonChipEl = document.getElementById('statusPoison');
        const electrifiedChipEl = document.getElementById('statusShock');
        let _lastCombatState = false;
        const setCombatIndicator = (active) => {
          if (!combatChipEl) return;
          if (active === _lastCombatState) return;
          _lastCombatState = active;
          combatChipEl.hidden = !active;
        };
        const setBurnIndicator = (active) => {
          if (!burnChipEl) return;
          burnChipEl.hidden = !active;
        };
        const setPoisonIndicator = (active) => {
          if (!poisonChipEl) return;
          poisonChipEl.hidden = !active;
        };
        const setElectrifiedIndicator = (active) => {
          if (!electrifiedChipEl) return;
          electrifiedChipEl.hidden = !active;
        };
        // ── Fire / poison fields + burn / poison / shock DoT ──────────
        const {
          addFireFieldTile,
          addPoisonFieldTile,
          cleanupExpiredFireFields,
          cleanupExpiredPoisonFields,
          clearAllFireFields,
          placeFireFieldAroundPlayer,
          placePoisonFieldAroundPlayer,
          playerOnFireField,
          playerOnPoisonField,
          applyFireDamage,
          triggerFireStep,
          triggerPoisonStep,
          triggerPoisonApply,
          triggerElectrifiedApply,
          tickBurn,
          tickPoison,
          tickElectrified,
        } = setupStatusEffects({
          scene: this,
          player,
          playerState,
          tileSize,
          centerX,
          centerY,
          floorAtmosphere,
          configPlayer,
          deathCaption,
          isWalkableTile,
          getCurrentLevel: () => currentLevel,
          setGameOver: () => { gameOver = true; },
          updatePlayerBar,
          updateHud,
          setCombatIndicator,
          setBurnIndicator,
          setPoisonIndicator,
          setElectrifiedIndicator,
        });
        // Thin wrappers over PlayerFx so call sites don't pass the ctx.
        const _playerFxCtx = () => ({ scene: this, player, playerState, tileSize });
        const showPlayerPoisonedEffect = () => _showPlayerPoisonedEffect(_playerFxCtx());
        const showPlayerElectrifiedEffect = () => _showPlayerElectrifiedEffect(_playerFxCtx());
        const showPlayerCureEffect = () => _showPlayerCureEffect(_playerFxCtx());
        const showPlayerLifeDrainEffect = (amount, casterSprite) => _showPlayerLifeDrainEffect(_playerFxCtx(), amount, casterSprite);
        const showPlayerManaDrainEffect = (amount, casterSprite) => _showPlayerManaDrainEffect(_playerFxCtx(), amount, casterSprite);
        const _creatureFxCtx = { scene: this, tileSize };
        const showCreatureSummonEffect = (caster, summoned) => _showCreatureSummonEffect(_creatureFxCtx, caster, summoned);
        const showCreatureHealEffect = (creature, healAmount) => _showCreatureHealEffect(_creatureFxCtx, creature, healAmount);
        const {
          spellAttackPattern,
          castPatternAttackSpell,
          castLearnedSpell,
        } = setupSpellCasting({
          scene: this,
          player,
          playerState,
          tileSize,
          floorAtmosphere,
          isWalkableTile,
          isWalkable,
          enemyCreatureAt,
          creatureAt,
          aliveAllies,
          aliveCreatures,
          creatures,
          getCurrentLevel: () => currentLevel,
          getItemsShopCatalog: () => itemsShopCatalog,
          getSpellsCatalog: () => spellsCatalog,
          getTypeProgressionGroups: () => typeProgressionGroups,
          getCreatureAbilitiesById: () => creatureAbilitiesById,
          getGameOver: () => gameOver,
          MAX_CONVINCED,
          floatingFxCtx,
          inferHealingAmount,
          inferClassAdjustedSpellDamage,
          resolvePatternTiles,
          frontSingleTile,
          showSpellTileEffect,
          showSpellAuraEffect,
          showSpellProjectileEffect,
          showCreatureHitEffect,
          showCritText,
          showMissSmoke,
          showRangedProjectileEffect,
          showPlayerCureEffect,
          playCreatureDeathEffect,
          killSummonsOf,
          updatePlayerBar,
          updateCreatureBar,
          updateHud,
          grantPlayerXp,
          effectiveXpFromCreature,
          makeHealthBar,
          makeNameLabel,
          mergeCreatureElementModsForId,
          findNearestRangedTarget,
          resolveConjuredArrowItem,
          placeConjuredArrow,
          setPoisonIndicator,
          hasRopeUpAtPlayer,
          tryClimbUpFloor,
          updatePlayerTimingsByLevel,
        });
        const {
          tileKey,
          findNearestEnemy,
          findNextStepToTarget,
          findNextStepToPlayer,
          tryMoveCreature,
          tryWanderCreature,
          tryMoveRangedCreature,
          shouldFlee,
          tryFleeCreature,
        } = setupCreatureMovement({
          playerState,
          centerX,
          centerY,
          isWalkable,
          isCreatureMeleeAdjacent,
          creatureAt,
          isOccupiedByActor,
          aliveCreatures,
          _invalidateCreatureTileMap,
          updateCreatureBar,
          orientCreatureSprite,
        });
        const {
          tryUseCreatureAbility,
          resolveCreatureAbilityTiles,
          playerInAbilityTiles,
          showCreatureAbilityEffect,
          abilityType,
          applyMultiAttackerPressure,
          resetAttackersPressure,
          incrementAttackersPressure,
          lineToPlayerFromCreature,
          creatureConeTowardPlayer,
        } = setupCreatureAbilities({
          scene: this,
          player,
          playerState,
          tileSize,
          floorAtmosphere,
          isWalkableTile,
          isWallTile,
          hasRangedLineOfSight,
          getCurrentLevel: () => currentLevel,
          findCreatureTemplateByTitle,
          findWalkableAdjacentTile,
          spawnSummonFromTemplate,
          showCreatureHealEffect,
          showCreatureSummonEffect,
          showMissSmoke,
          showPlayerHitEffect,
          showPlayerLifeDrainEffect,
          showPlayerManaDrainEffect,
          updatePlayerBar,
          updateHud,
          updateCreatureBar,
          clampIncomingCreatureDamage,
          applyShieldingReduction,
          applyMultiAttackerPressureBase: _applyMultiAttackerPressure,
          gainShieldingSkillUse,
          triggerPoisonApply,
          triggerElectrifiedApply,
          placeFireFieldAroundPlayer,
          placePoisonFieldAroundPlayer,
        });
        const allyTurn = (ally, now) => {
          if (gameOver || playerState.dead) return;
          if (!ally.alive) return;
          if (now < ally.nextActionAt) return;
          const followPlayerStep = () => {
            const stepToPlayer = findNextStepToTarget(ally.gx, ally.gy, playerState.gridX, playerState.gridY);
            if (stepToPlayer && !(stepToPlayer.x === playerState.gridX && stepToPlayer.y === playerState.gridY)) {
              orientCreatureSprite(ally, stepToPlayer.x - ally.gx, stepToPlayer.y - ally.gy);
              ally.gx = stepToPlayer.x;
              ally.gy = stepToPlayer.y;
              _invalidateCreatureTileMap();
              ally.sprite.x = centerX(ally.gx);
              ally.sprite.y = centerY(ally.gy);
              updateCreatureBar(ally);
            }
            ally.nextActionAt = now + actionDelayFromSpeed(ally.speed);
          };
          const enemies = aliveCreatures();
          if (enemies.length === 0) {
            followPlayerStep();
            return;
          }
          // If the ally drifted too far from the player (common right after a
          // floor change when it spawns adjacent to the start tile and the
          // player walks away), prioritize regrouping over chasing enemies.
          const distToPlayer = Math.max(Math.abs(ally.gx - playerState.gridX), Math.abs(ally.gy - playerState.gridY));
          if (distToPlayer > 6) {
            followPlayerStep();
            return;
          }
          // Find nearest enemy
          const target = findNearestEnemy(ally.gx, ally.gy);
          if (!target || !target.alive) { ally.nextActionAt = now + 200; return; }
          // If adjacent — attack
          if (isCreatureMeleeAdjacent(ally.gx, ally.gy, target.gx, target.gy)) {
            orientCreatureSprite(ally, target.gx - ally.gx, target.gy - ally.gy);
            if (Math.random() < 0.15) {
              // Miss
              if (target.sprite) showMissSmoke(target.sprite.x, target.sprite.y);
            } else {
              const dmg = Math.max(1, Phaser.Math.Between(1, ally.maxDamage));
              target.hp = Math.max(0, target.hp - dmg);
              showCreatureHitEffect(target, dmg);
              addCombatLog(`${ally.title} (ally) hits ${target.title} for ${dmg}.`);
              if (target.hp <= 0) {
                target.alive = false;
                playCreatureDeathEffect(target);
                updateCreatureBar(target);
                grantPlayerXp(effectiveXpFromCreature(target));
                playerState.runKills += 1;
                addCombatLog(`${target.title} dies from ${ally.title}'s attack.`);
                killSummonsOf(target);
              } else {
                updateCreatureBar(target);
              }
            }
            ally.nextActionAt = now + actionDelayFromSpeed(ally.speed);
            return;
          }
          // Move toward enemy
          const step = findNextStepToTarget(ally.gx, ally.gy, target.gx, target.gy);
          if (step && !(step.x === target.gx && step.y === target.gy)) {
            orientCreatureSprite(ally, step.x - ally.gx, step.y - ally.gy);
            ally.gx = step.x;
            ally.gy = step.y;
            _invalidateCreatureTileMap();
            ally.sprite.x = centerX(ally.gx);
            ally.sprite.y = centerY(ally.gy);
            updateCreatureBar(ally);
            ally.nextActionAt = now + actionDelayFromSpeed(ally.speed);
            return;
          }
          // Path to the nearest enemy is blocked — fall back to following the
          // player so the ally doesn't freeze in place.
          followPlayerStep();
        };
        // Ability cooldown ranges (ms): normal and fury mode
        const ABILITY_CD_MIN = 2400;
        const ABILITY_CD_MAX = 4200;
        const ABILITY_CD_FURY_MIN = 700;
        const ABILITY_CD_FURY_MAX = 1400;

        const creatureTurn = () => {
          if (gameOver) return;
          _invalidateCreatureTileMap();
          const now = this.time.now;
          resetAttackersPressure();
          for (const creature of aliveCreatures()) {
            if (now < creature.nextActionAt) continue;
            if (!hasAggro(creature)) {
              const wandered = tryWanderCreature(creature, now);
              creature.nextActionAt = now + (wandered ? actionDelayFromSpeed(creature.speed) : 120);
              continue;
            }
            creature.aggroLocked = true;
            let acted = false;
            const isFleeing = shouldFlee(creature);

            // --- Fury / flee mode ---
            if (isFleeing) {
              acted = tryFleeCreature(creature) || acted;
              // tryUseCreatureAbility gates per-ability cast range itself, so fleeing
              // creatures will only fire spells whose pattern actually reaches the player.
              if (now >= creature.nextAbilityAt) {
                const usedAbility = tryUseCreatureAbility(creature);
                if (usedAbility) {
                  creature.nextAbilityAt = now + Phaser.Math.Between(ABILITY_CD_FURY_MIN, ABILITY_CD_FURY_MAX);
                }
                acted = usedAbility || acted;
              }
              creature.nextActionAt = now + (acted ? actionDelayFromSpeed(creature.speed) : 120);
              continue;
            }

            const distToPlayer = Math.max(Math.abs(creature.gx - playerState.gridX), Math.abs(creature.gy - playerState.gridY));

            // --- Ability tick (independent cooldown) ---
            if (now >= creature.nextAbilityAt) {
              const usedAbility = tryUseCreatureAbility(creature);
              if (usedAbility) {
                creature.nextAbilityAt = now + Phaser.Math.Between(ABILITY_CD_MIN, ABILITY_CD_MAX);
                acted = true;
              }
            }

            // --- Movement ---
            if (creature.ranged) {
              // Ranged: maintain distance, only melee if player walks into adjacency
              const moved = tryMoveRangedCreature(creature);
              acted = moved || acted;
            } else {
              // Melee: always approach
              if (!isCreatureMeleeAdjacent(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) {
                acted = tryMoveCreature(creature) || acted;
              }
            }

            // --- Melee attack (all creatures, only when adjacent and no other action this tick) ---
            if (!acted && isCreatureMeleeAdjacent(creature.gx, creature.gy, playerState.gridX, playerState.gridY)) {
              orientCreatureSprite(creature, playerState.gridX - creature.gx, playerState.gridY - creature.gy);
              if (didAttackMiss()) {
                showMissSmoke(player.x, player.y);
                addCombatLog(`${creature.title} misses the hit.`);
                acted = true;
              } else {
                this._activeAttackerMaxDamage = creature.maxDamage;
                const baseDamage = pickCreatureDamage();
                const isCrit = didAttackCrit();
                const rawDamage = isCrit ? applyCriticalDamage(baseDamage) : baseDamage;
                const pressuredDamage = applyMultiAttackerPressure(rawDamage);
                const dmg = clampIncomingCreatureDamage(pressuredDamage, creature.maxDamage);
                const reduced = playerState.godMode ? 0 : applyShieldingReduction(dmg);
                if (!playerState.godMode) playerState.hp = Math.max(0, playerState.hp - reduced);
                incrementAttackersPressure();
                if (reduced < dmg && getEquippedShield()) gainShieldingSkillUse(1);
                showPlayerHitEffect(reduced);
                if (isCrit) {
                  showCritText(player.x, player.y);
                  addCombatLog(`${creature.title} lands a CRITICAL hit for ${reduced}.`);
                } else {
                  addCombatLog(`${creature.title} hits you for ${reduced}.`);
                }
                acted = true;
              }
              if (!playerState.godMode && playerState.hp <= 0) {
                gameOver = true;
                playerState.dead = true;
                if (window.tdGame && typeof window.tdGame.deleteCurrentSave === 'function') {
                  window.tdGame.deleteCurrentSave();
                }
                const killedByTitle = creature.title || 'Unknown';
                this.tweens.killTweensOf(player);
                const deathKey = deathTextureName(configPlayer.sex === 'female' ? 'female' : 'male');
                player.setTexture(deathKey);
                player.setAngle(0);
                player.setFlipX(false);
                player.setFlipY(false);
                player.setScale(1, 1);
                player.setDisplaySize(tileSize, tileSize);
                deathCaption.setPosition(player.x, player.y + tileSize * 0.72);
                deathCaption.setVisible(true);
                addCombatLog('You are dead.');
                this.time.delayedCall(3000, () => {
                  showDeathSummary({
                    name: configPlayer.name,
                    classKey: configPlayer.classKey,
                    sex: configPlayer.sex || 'male',
                    floor: currentLevel,
                    kills: playerState.runKills,
                    playerLevel: playerState.level,
                    gold: window.debugInventory ? window.debugInventory.getGold() : 0,
                    killedBy: killedByTitle,
                  });
                });
                break;
              }
            }
            // --- Melee attack on adjacent ally (if didn't attack player) ---
            if (!acted) {
              const adjacentAlly = aliveAllies().find(a =>
                isCreatureMeleeAdjacent(creature.gx, creature.gy, a.gx, a.gy)
              );
              if (adjacentAlly) {
                orientCreatureSprite(creature, adjacentAlly.gx - creature.gx, adjacentAlly.gy - creature.gy);
                if (didAttackMiss()) {
                  showMissSmoke(adjacentAlly.sprite.x, adjacentAlly.sprite.y);
                  addCombatLog(`${creature.title} misses ${adjacentAlly.title}.`);
                } else {
                  let dmg = Math.max(1, Phaser.Math.Between(1, creature.maxDamage));
                  if (adjacentAlly._protectParty) dmg = Math.max(1, Math.floor(dmg * 0.8));
                  adjacentAlly.hp = Math.max(0, adjacentAlly.hp - dmg);
                  showCreatureHitEffect(adjacentAlly, dmg);
                  addCombatLog(`${creature.title} hits ${adjacentAlly.title} (ally) for ${dmg}.`);
                  if (adjacentAlly.hp <= 0) {
                    adjacentAlly.alive = false;
                    playCreatureDeathEffect(adjacentAlly);
                    updateCreatureBar(adjacentAlly);
                    addCombatLog(`${adjacentAlly.title} (ally) has been killed by ${creature.title}.`);
                  } else {
                    updateCreatureBar(adjacentAlly);
                  }
                }
                acted = true;
              }
            }
            creature.nextActionAt = now + (acted ? actionDelayFromSpeed(creature.speed) : 120);
          }
          // Ally turns (convinced creatures)
          for (const ally of aliveAllies()) {
            allyTurn(ally, now);
          }
          updatePlayerBar();
          updateHud();
        };

        descendLevel(false); // initialize first level with random dungeon composition

        // Resume flow — apply everything from the snapshot that needs the
        // live scene (progression stats, the saved floor, learned spells,
        // DoT statuses). Inventory + gold were already restored by bootGame
        // before the scene was created.
        const resumeSnap = configPlayer && configPlayer.resumeSnapshot;
        if (resumeSnap) {
          // Progression stats.
          playerState.level          = Math.max(1, Number(resumeSnap.playerLevel) || 1);
          playerState.xp             = Math.max(0, Number(resumeSnap.playerXp) || 0);
          playerState.maxHp          = Math.max(1, Number(resumeSnap.playerMaxHp) || playerState.maxHp);
          playerState.maxMana        = Math.max(0, Number(resumeSnap.playerMaxMana) || playerState.maxMana);
          playerState.magicLevel     = Math.max(0, Number(resumeSnap.playerMagicLevel) || 0);
          playerState.fistLevel      = Math.max(10, Number(resumeSnap.playerFistLevel) || 10);
          playerState.shieldingLevel = Math.max(10, Number(resumeSnap.playerShieldingLevel) || 10);
          restoreWeaponSkills(playerState.weaponSkillLevelByType, resumeSnap);
          playerState.hp     = Phaser.Math.Clamp(Number(resumeSnap.playerHp)   || playerState.maxHp, 1, playerState.maxHp);
          playerState.mana   = Phaser.Math.Clamp(Number(resumeSnap.playerMana) || playerState.maxMana, 0, playerState.maxMana);
          playerState.hungerSecondsLeft = Math.max(0, Number(resumeSnap.hungerSecondsLeft) || MAX_FOOD_SECONDS);
          playerState.runKills     = Math.max(0, Number(resumeSnap.runKills) || 0);
          if (typeof onPlayerLevelStatsUpdate === 'function') onPlayerLevelStatsUpdate(playerState.level);
          updatePlayerTimingsByLevel();

          // Jump to the saved floor (regenerates the dungeon for that level).
          const savedFloor = Math.max(1, Number(resumeSnap.currentLevel) || 1);
          while (currentLevel < savedFloor) descendLevel(true);

          // Learned spells (IDs + hotkey slots).
          restoreLearnedSpells(playerState.learnedSpellIds, playerState.learnedSpellOrder, resumeSnap);
          try { renderLearnedSpells(); } catch { /* best effort */ }

          // DoT statuses — retime their tick schedule to the current clock.
          if (resumeSnap.burnState) {
            playerState.burnState = {
              startedAt: this.time.now,
              nextTickAt: this.time.now + BURN_TICK_INTERVAL_MS,
              tickIndex: Math.max(0, Number(resumeSnap.burnState.tickIndex) || 0),
            };
            setBurnIndicator(true);
          }
          if (resumeSnap.poisonState) {
            playerState.poisonState = {
              startedAt: this.time.now,
              nextTickAt: this.time.now + POISON_TICK_INTERVAL_MS,
              tickIndex: Math.max(0, Number(resumeSnap.poisonState.tickIndex) || 0),
            };
            setPoisonIndicator(true);
          }
          if (resumeSnap.electrifiedState) {
            playerState.electrifiedState = {
              startedAt: this.time.now,
              nextTickAt: this.time.now + ELECTRIFIED_TICK_INTERVAL_MS,
              tickIndex: Math.max(0, Number(resumeSnap.electrifiedState.tickIndex) || 0),
            };
            setElectrifiedIndicator(true);
          }

          addCombatLog(`Resumed save: Lv ${playerState.level} on floor ${currentLevel}.`, LOG_COLORS.SPELL);
        }

        updatePlayerBar();
        updateHud();
        this.time.addEvent({
          delay: 200,
          loop: true,
          callback: redrawMinimapDynamic,
        });
        this.time.addEvent({
          delay: 2000,
          loop: true,
          callback: updateEquippedLightSlotImage,
        });
        this.time.addEvent({
          delay: 90,
          loop: true,
          callback: creatureTurn,
        });
        this.time.addEvent({
          delay: 90,
          loop: true,
          callback: () => {
            if (gameOver || playerState.dead) return;
            if (isTypingInInput()) return;
            const now = this.time.now;
            const w = getEquippedHandWeapon();
            if (!w) return;
            if (!canStrafeCastMagicWeapon(w)) return;
            if (!isDistanceWeapon(w)) return;
            if (requiresAmmoForWeapon(w) && !hasAmmoForWeapon(w)) return;
            if (isMagicRangedWeapon(w) && !hasEnoughManaForMagicWeapon(w)) return;
            if (now < playerState.nextMagicWeaponShotAt) return;
            const t = findNearestRangedTarget(effectiveWeaponRange(w));
            if (!t) return;
            performPlayerAttack(t, w, true, now);
          },
        });
        this.time.addEvent({
          delay: 1000,
          loop: true,
          callback: () => {
            // Torch / light-source burn-down progression — refreshed every
            // second so the slot icon walks through Lit → Medium → Small →
            // extinguished. Runs even when dead so the icon reflects reality.
            updateEquippedLightSlotImage();
            // Enable/disable the "Open Market" button based on whether the
            // floor is clear. Also refresh the market's "combat started"
            // banner if it happens to be open.
            updateOpenMarketButton();
            updateSaveGameButton();
            updateMarketBanner();
            // Combat indicator: show when any creature has aggro on the player
            setCombatIndicator(aliveCreatures().some(c => hasAggro(c)));
            // Fire / poison field expiry + ongoing burn / poison / shock DoT.
            const nowMs = this.time.now;
            cleanupExpiredFireFields(nowMs);
            cleanupExpiredPoisonFields(nowMs);
            tickBurn(nowMs);
            tickPoison(nowMs);
            tickElectrified(nowMs);
            if (playerState.dead || gameOver) return;
            if (playerState.hungerSecondsLeft <= 0) {
              if (!playerState.isHungry) setHungryState(true, 0);
              return;
            }
            playerState.hungerSecondsLeft = Math.max(0, playerState.hungerSecondsLeft - 1);
            if (playerState.hp < playerState.maxHp) playerState.hp += 1;
            if (playerState.mana < playerState.maxMana) playerState.mana += 1;
            updatePlayerBar();
            updateHud();
            setHungryState(false, playerState.hungerSecondsLeft);
            if (playerState.hungerSecondsLeft <= 0) setHungryState(true, 0);
          },
        });

        this.events.on('update', () => {
          updateAllHealthBars();
          floorAtmosphere.updateDarkness(this.time.now, player.x, player.y);
          if (playerState.moving || gameOver) return;
          if (isTypingInInput()) return;
          const now = this.time.now;
          const canMageCastWithMagicWeapon = () => {
            if (playerState.classKey !== 'druid' && playerState.classKey !== 'sorcerer') return false;
            const equippedHand = getEquippedHandWeapon();
            return Boolean(equippedHand && isMagicRangedWeapon(equippedHand));
          };
          // Check click/touch-triggered spell slot first, then keyboard
          let spellSlotToCast = consumePendingSpellSlot();
          if (!spellSlotToCast) {
            spellSlotToCast = (
              Phaser.Input.Keyboard.JustDown(spellHotkeys.one)   || Phaser.Input.Keyboard.JustDown(spellHotkeys.num1) ? 1
                : Phaser.Input.Keyboard.JustDown(spellHotkeys.two)   || Phaser.Input.Keyboard.JustDown(spellHotkeys.num2) ? 2
                  : Phaser.Input.Keyboard.JustDown(spellHotkeys.three) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num3) ? 3
                    : Phaser.Input.Keyboard.JustDown(spellHotkeys.four)  || Phaser.Input.Keyboard.JustDown(spellHotkeys.num4) ? 4
                      : Phaser.Input.Keyboard.JustDown(spellHotkeys.five)  || Phaser.Input.Keyboard.JustDown(spellHotkeys.num5) ? 5
                        : Phaser.Input.Keyboard.JustDown(spellHotkeys.six)   || Phaser.Input.Keyboard.JustDown(spellHotkeys.num6) ? 6
                          : Phaser.Input.Keyboard.JustDown(spellHotkeys.seven) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num7) ? 7
                            : Phaser.Input.Keyboard.JustDown(spellHotkeys.eight) || Phaser.Input.Keyboard.JustDown(spellHotkeys.num8) ? 8
                              : Phaser.Input.Keyboard.JustDown(spellHotkeys.nine)  || Phaser.Input.Keyboard.JustDown(spellHotkeys.num9) ? 9
                                : Phaser.Input.Keyboard.JustDown(spellHotkeys.zero)  || Phaser.Input.Keyboard.JustDown(spellHotkeys.num0) ? 10
                                  : 0
            );
          }
          if (spellSlotToCast > 0) {
            const casted = castLearnedSpell(spellSlotToCast, now);
            if (casted) {
              if (!canMageCastWithMagicWeapon()) {
                playerState.nextActionAt = now + Math.max(140, Math.floor(playerState.actionDelayMs * 0.55));
              }
              return;
            }
          }

          // Consumable hotkeys: F=Food, G=Mana potion, H=Health potion
          let consumableType = consumePendingConsumable();
          if (!consumableType) {
            if (Phaser.Input.Keyboard.JustDown(consumableKeys.F)) consumableType = 'food';
            else if (Phaser.Input.Keyboard.JustDown(consumableKeys.G)) consumableType = 'mana';
            else if (Phaser.Input.Keyboard.JustDown(consumableKeys.H)) consumableType = 'health';
          }
          if (consumableType && !gameOver && !playerState.dead) {
            consumeConsumable(consumableType);
          }
          // Keep consumable bar in sync (cheap — uses key cache)
          renderConsumableBar();

          if (now < playerState.nextActionAt) return;

          let dx = 0;
          let dy = 0;
          let frame = null;
          const ctrlPressed = ctrlKey.isDown;
          const vj = window.virtualJoystick || {};

          if (cursors.left.isDown || keys.A.isDown || vj.left) {
            dx = -1;
            frame = 3; // oeste
          } else if (cursors.right.isDown || keys.D.isDown || vj.right) {
            dx = 1;
            frame = 1; // este
          } else if (cursors.up.isDown || keys.W.isDown || vj.up) {
            dy = -1;
            frame = 2; // norte
          } else if (cursors.down.isDown || keys.S.isDown || vj.down) {
            dy = 1;
            frame = 0; // sur
          }

          if (frame !== null) {
            player.setTexture(frameTextureName(configPlayer.sex, frame));
            playerState.facingFrame = frame;
          }

          const handWeapon = getEquippedHandWeapon();
          const handIsDistance = Boolean(
            handWeapon
            && isDistanceWeapon(handWeapon)
            && (!requiresAmmoForWeapon(handWeapon) || hasAmmoForWeapon(handWeapon))
          );
          if (dx === 0 && dy === 0) {
            // All distance weapons auto-fire via the dedicated strafe timer.
            return;
          }
          if (ctrlPressed && (cursors.left.isDown || cursors.right.isDown || cursors.up.isDown || cursors.down.isDown)) {
            return;
          }

          const targetGX = playerState.gridX + dx;
          const targetGY = playerState.gridY + dy;
          if (!isWalkable(targetGX, targetGY)) {
            return;
          }

          let targetCreature = enemyCreatureAt(targetGX, targetGY);
          if (!targetCreature && handIsDistance) {
            targetCreature = findRangedTargetInDirection(dx, dy, effectiveWeaponRange(handWeapon));
          }
          const usedRangedShot = Boolean(
            targetCreature
            && handIsDistance
            && (targetCreature.gx !== targetGX || targetCreature.gy !== targetGY)
          );
          if (targetCreature) {
            performPlayerAttack(targetCreature, handWeapon, usedRangedShot, now);
            return;
          }

          playerState.moving = true;
          playerState.gridX = targetGX;
          playerState.gridY = targetGY;
          this.tweens.add({
            targets: player,
            x: centerX(playerState.gridX),
            y: centerY(playerState.gridY),
            duration: playerState.moveDurationMs,
            ease: 'Linear',
            onComplete: () => {
              // Asegura alineacion exacta al centro de la casilla.
              player.x = centerX(playerState.gridX);
              player.y = centerY(playerState.gridY);
              player.setOrigin(0.5, 0.5);
              pickupGroundLootAtPlayer();
              playerState.moving = false;
              if (playerOnFireField()) triggerFireStep();
              if (playerOnPoisonField()) triggerPoisonStep();
              if (hasStairsAtPlayer() && aliveCreatures().length === 0) {
                descendLevel();
              }
              updateHud();
            },
          });
          playerState.nextActionAt = now + Math.max(playerState.actionDelayMs, playerState.moveDurationMs);
        });
      },
    },
  });
}

// Mount the character-select / inventory panel. The startGame fn is the one
// piece of engine API the panel needs (called from bootGame after the user
// clicks "Enter Dungeon").
setupInventoryPanel({ startGame });

// setLoadingProgress now lives in game/js/ui/loadingScreen.js so the panel
// can call it too. Engine still imports + uses it during the Phaser preload
// (lines ~215-240).


async function loadProgressionDatabase() {
  if (typeProgressionGroups.length > 0) return;
  typeProgressionGroups = await getCreatureTypeProgressionGroups();
  if (typeProgressionGroups.length === 0) {
    typeProgressionGroups = [{
      type_primary: 'Glires',
      average_experience: 5,
      creatures: [{ id: 1116, title: 'Rat', type_primary: 'Glires', experience: 5, hitpoints: 20, maxDamage: 8, image: 'creature/Rat.gif' }],
    }];
  }
}

// Loads everything the engine's startGame() needs from disk into the
// engine-scope let bindings (creatureDropTable, spellsCatalog, etc.).
// The inventory panel calls this from bootGame and runs it in parallel
// with its own bag/coin loaders. `onProgress(label?)` is invoked once
// per task so the panel can drive the loading bar.
export async function loadEngineData(onProgress) {
  const tick = (label) => { if (typeof onProgress === 'function') onProgress(label); };
  await Promise.all([
    loadProgressionDatabase().then(() => tick('Loading creature data...')),
    (async () => { creatureDropTable = await getCreatureDropTable(); })().then(() => tick('Loading loot tables...')),
    (async () => { creatureAbilitiesById = await getCreatureAbilitiesById(); })().then(() => tick('Loading abilities...')),
    (async () => { creatureDamageModifiersById = await getCreatureDamageModifiersById(); })().then(() => tick('Loading damage data...')),
    (async () => { spellsCatalog = await getSpellsCatalogWithPrices(); })().then(() => tick('Loading spells...')),
    (async () => { itemsShopCatalog = await getItemShopCatalog(); })().then(() => tick('Loading items...')),
    loadKnownItemImages(),
  ]);
  // Pre-cache ammo items not in shop catalog (value_buy=0).
  await primeConjureAmmoCache(itemsShopCatalog, getItemByArticleId);
}
