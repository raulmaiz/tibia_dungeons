// Ambient globals. Not imported — the TS server picks them up from the
// `include` glob of tsconfig.json. Keep these as loose as possible; this
// file exists to silence "X is not defined" noise so real type errors
// aren't buried, not to fully describe every external API.

// Build-time `define` in esbuild (scripts/build.js). String 'true' | 'false'
// gets injected as a boolean; we treat it as boolean here for type purposes.
declare const OFFLINE_BUILD: boolean;

// Prefix for image URLs. Empty string in the online build (same-origin);
// a CDN URL like 'https://www.tibia-dungeons.com' in the offline / itch build.
declare const IMAGE_BASE_URL: string;

// Phaser 3 lives as a plain global from the CDN <script> tag — no import.
// We don't model the API; using `any` means `this.add`, `this.tweens`,
// etc. don't trigger errors. If we ever want full Phaser types, add
// @types/phaser as a devDep and remove this.
//
// The namespace declaration lets JSDoc `{Phaser.Scene}` annotations type-
// check without blowing up. Every member is `any`.
declare const Phaser: any;
declare namespace Phaser {
  type Scene = any;
  type Game = any;
}

// Window extensions published by various modules to bridge closures.
// Each is installed exactly once and read by multiple callers.
interface Window {
  /** Inventory bridge — see ui/panels/debugApi.js. */
  debugInventory?: {
    addLoot(item?: any): boolean;
    getGold(): number;
    spendGold(amount: number): boolean;
    addGold(amount: number): void;
    state(): {
      bag: any;
      equipped: Record<string, any>;
      bagSlots: number;
      capacity: number;
      carriedWeight: number;
      used: number;
      items: any[];
    } | null;
    findConsumable(type: string): { item: any; idx: number } | null;
    consumeItem(type: string): boolean;
    equipBag(articleId: number): Promise<void>;
    equipArmor(articleId: number): Promise<boolean>;
    equipShield(articleId: number): Promise<boolean>;
    equipLegs(articleId: number): Promise<boolean>;
    equipBoots(articleId: number): Promise<boolean>;
    equipRing(articleId: number): Promise<boolean>;
    equipAmmo(articleId: number): Promise<boolean>;
    equipHelmet(articleId: number): Promise<boolean>;
    equipAmulet(articleId: number): Promise<boolean>;
    equipHand(articleId: number): Promise<boolean>;
    equipLight(articleId: number): Promise<boolean>;
    unequipHand(): boolean;
  };

  /** Saves-screen entry points — see ui/panels/bootFlow.js. */
  tdGame?: {
    resume(snapshot: any, saveId?: string | null): void;
    getCurrentSaveId(): string | null;
    setCurrentSaveId(id: string | null): void;
    deleteCurrentSave(): Promise<boolean>;
  };

  /** Auth bridge — ui/auth.js. */
  tdAuth?: {
    apiFetch?: typeof fetch;
    isLoggedIn?(): boolean;
    isAdmin?(): boolean;
    openSaveScreen?(): void;
  };

  /** Engine → HUD sidebar. */
  setHungryUi?(hungry: boolean, secondsLeft?: number): void;
  /** Engine → panel reset on death. */
  _resetInventoryForNewRun?(): void;
  /** SpellBar trigger shims — see engine/systems/SpellBar.js. */
  _triggerSpellSlot?(slot: number): void;
  _triggerConsumable?(type: 'food' | 'mana' | 'health'): void;

  /** Magic-weapon tooltip preview reads `window.__gameHud.ml` + `.pl`. */
  __gameHud?: { ml: number; pl: number };

  /** EventBus re-exposed for console debugging. */
  tdEvents?: any;

  /** Mobile virtual joystick overlay (optional; only present on touch). */
  virtualJoystick?: any;

  /** Debug god mode — engine/systems (still in game.engine.js). */
  debugGod?: {
    enable(): boolean;
    disable(): boolean;
    toggle(): boolean;
    isEnabled(): boolean;
    goToFloor(level: number): number | boolean;
    nextFloor(): number | boolean;
    prevFloor(): number | boolean;
  };
  debugPerf?: {
    cull(on?: boolean): boolean;
    env(on?: boolean): boolean;
    darkness(on?: boolean): boolean;
    particles(on?: boolean): boolean;
    decor(on?: boolean): boolean;
    nametags(on?: boolean): boolean;
    healthbars(on?: boolean): boolean;
    stats(): { fps: number; objects: number; tweens: number; alive: number; onScreen: number; summons: number; flags: object };
    profile(): { avgTurnMs: number; maxTurnMs: number; samples: number };
  };
}
