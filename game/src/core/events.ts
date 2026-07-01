// Typed pub/sub event bus — TS port of game/js/core/EventBus.js.
// Gameplay systems emit; render/audio/UI listen. Domain never imports render.

export interface EventPayloads {
  'entity:died': { id: string; title: string; gx: number; gy: number };
  'entity:damaged': { id: string; amount: number; crit: boolean; gx: number; gy: number };
  'player:moved': { gx: number; gy: number };
  'player:dead': Record<string, never>;
  'coins:changed': Record<string, never>;
  'spell:cast': { articleId: number; title: string; slot: number; manaCost: number; by: 'player' };
  'loot:dropped': { sourceId: string; sourceTitle: string; drops: { itemId: number; itemTitle: string }[] };
  'floor:descended': { from: number; to: number };
}

export type EventName = keyof EventPayloads;
type Listener<E extends EventName> = (payload: EventPayloads[E]) => void;

class EventBus {
  private listeners = new Map<EventName, Set<Listener<EventName>>>();

  on<E extends EventName>(event: E, fn: Listener<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(fn as Listener<EventName>);
    return () => set.delete(fn as Listener<EventName>);
  }

  off<E extends EventName>(event: E, fn: Listener<E>): void {
    this.listeners.get(event)?.delete(fn as Listener<EventName>);
  }

  emit<E extends EventName>(event: E, payload: EventPayloads[E]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    // Snapshot so a listener that removes itself doesn't disturb iteration.
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[EventBus] listener for "${event}" threw:`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const bus = new EventBus();
