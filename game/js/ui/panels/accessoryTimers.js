// Ring / amulet duration timers. Starts a 1 Hz interval that counts down
// the accessory's charges / duration and updates the slot label. When it
// hits zero it clears the slot, logs the expiry, and triggers a loot-slot
// re-render (because clearing the slot may push the item back into the bag).

import { parseDurationStringToMs } from '../../systems/lighting/LightItems.js';
import { panelState } from './state.js';
import { SLOT_RULES } from './constants.js';
import { onPanelLog } from '../../state/playerSession.js';

const intervalsBySlot = { ring: null, amulet: null };

/** `"5 minutes"` → seconds. Canonical parser returns ms; accessory UI ticks per second. */
const parseDurationSeconds = (raw) => Math.floor(parseDurationStringToMs(raw) / 1000);

export function stopAccessoryTimer(slotKey) {
  const t = intervalsBySlot[slotKey];
  if (!t) return;
  clearInterval(t.intervalId);
  intervalsBySlot[slotKey] = null;
}

export function startAccessoryTimer(slotKey, item) {
  stopAccessoryTimer(slotKey);
  const attrs = Array.isArray(item && item.attributes) ? item.attributes : [];
  const durationRow = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'duration');
  const chargesRow  = attrs.find((a) => a && String(a.name || '').toLowerCase() === 'charges');
  let secondsLeft = 0;
  if (durationRow) {
    secondsLeft = parseDurationSeconds(durationRow.value);
  } else if (chargesRow) {
    secondsLeft = Math.max(1, Number(chargesRow.value) || 0) * 60;
  }
  if (secondsLeft <= 0) return;
  const rule = SLOT_RULES[slotKey];
  const slotLabel = rule ? document.getElementById(`slot${rule.id}Label`) : null;
  const formatLabel = (secs) => {
    const mm = Math.floor(secs / 60);
    const ss = String(secs % 60).padStart(2, '0');
    return `${item.title} (${mm}:${ss})`;
  };
  if (slotLabel) slotLabel.textContent = formatLabel(secondsLeft);
  const intervalId = setInterval(() => {
    secondsLeft -= 1;
    if (slotLabel) slotLabel.textContent = formatLabel(Math.max(0, secondsLeft));
    if (secondsLeft <= 0) {
      stopAccessoryTimer(slotKey);
      // Cross-module calls go through panelState.helpers - wired once by
      // the orchestrator in inventoryPanel.js at setup time.
      if (panelState.helpers.clearEquippedSlotVisual) {
        panelState.helpers.clearEquippedSlotVisual(slotKey, `${item.title} has expired.`);
      }
      if (typeof onPanelLog === 'function') onPanelLog(`Your ${item.title} has expired.`);
      if (panelState.helpers.renderLootSlots) {
        panelState.helpers.renderLootSlots(panelState.currentBagCapacity);
      }
    }
  }, 1000);
  intervalsBySlot[slotKey] = { intervalId };
}
