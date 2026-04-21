// Tiny pub/sub event bus. Phase 2 of the architectural refactor — gives
// future systems (particles, post-FX, lighting, ambient audio) a way to react
// to gameplay moments without coupling the emitter to the listener.
//
// Names are stable contracts; the catalog is at the bottom of this file.

class EventBus {
  constructor() {
    this._listeners = new Map(); // event name → Set<listener>
  }

  on(event, fn) {
    if (typeof fn !== 'function') return () => {};
    let set = this._listeners.get(event);
    if (!set) { set = new Set(); this._listeners.set(event, set); }
    set.add(fn);
    return () => set.delete(fn); // disposer
  }

  off(event, fn) {
    const set = this._listeners.get(event);
    if (set) set.delete(fn);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return;
    // Snapshot so a listener that removes itself doesn't disturb iteration.
    for (const fn of [...set]) {
      try { fn(payload); }
      catch (err) { console.error(`[EventBus] listener for "${event}" threw:`, err); }
    }
  }

  clear() { this._listeners.clear(); }
}

export const bus = new EventBus();

// ── Event catalog ─────────────────────────────────────────────────────────
// Informal payload contracts (vanilla JS — no enforcement at runtime):
//
//   coins:changed     → no payload
//                       (consumers read total via getTotalGoldInInventory)
//   entity:died       → { id, title, gx, gy, sprite }
//   spell:cast        → { articleId, title, slot, manaCost, by: 'player' }
//   loot:dropped      → { sourceId, sourceTitle,
//                         drops: [{ itemId, itemTitle }] }
//   floor:descended   → { from, to }    floor numbers
//
// Reserved for future emit points: 'entity:damaged', 'player:levelup',
// 'player:dead'. Add them here when wired so the catalog stays the source
// of truth.
export const EVENTS = Object.freeze({
  COINS_CHANGED:   'coins:changed',
  ENTITY_DIED:     'entity:died',
  SPELL_CAST:      'spell:cast',
  LOOT_DROPPED:    'loot:dropped',
  FLOOR_DESCENDED: 'floor:descended',
});
