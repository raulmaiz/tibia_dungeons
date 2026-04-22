// Boot flow - the seam between the character-select overlay and the running
// engine scene. Wires:
//
//   • "Enter Dungeon" click  → bootGame({ name, sex, classKey })
//   • Enter key on name input → equivalent to clicking "Enter Dungeon"
//   • window.tdGame           → entry point for the Saves screen's "Resume"
//                                and the in-game Save button (save-id carry)
//   • window._resetInventoryForNewRun → called by the engine on death so a
//                                new character-select round starts clean
//
// The closure holds two pieces of state unique to the boot lifecycle:
//   • _starting      - one-shot guard so double-clicking "Enter" doesn't
//                      kick off two parallel boots
//   • currentSaveId  - which server-side save slot this run is bound to
//                      (null for a brand-new run)
//
// Dep injection: the orchestrator passes `startGame` in so we don't
// circular-import the engine module from here.

import { progressionStatsForLevel } from '../../mechanics/progression.js';
import { START_BAG_ARTICLE_ID } from '../../config/game.config.js';
import { LIGHT_ITEM_ID_TORCH } from '../../config/visual.config.js';
import { setLastLootRejectReason } from '../../state/playerSession.js';
import { loadEngineData } from '../../engine/game.engine.js';
import { setLoadingProgress } from '../loadingScreen.js';
import { panelState } from './state.js';
import { equipBagByArticleId, equipItemInSlot } from './equipFlow.js';
import { ensureCoinTemplatesLoaded, addCoinsToInventory } from './coins.js';
import { addLootItemToBag, renderLootSlots } from './lootBag.js';
import { clearEquippedSlotVisual } from './equipment.js';

export function setupBootFlow(deps) {
  const { startGame } = deps;
  const startBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('startBtn'));
  const playerNameInput = /** @type {HTMLInputElement | null} */ (document.getElementById('playerName'));

  let _starting = false;
  // Save id of the currently-active run, so subsequent in-game "Save"
  // clicks can overwrite that slot instead of spawning new entries.
  //   null        → this run has never been saved (fresh game or guest)
  //   "<hex>"     → the id returned by the server on a previous save /
  //                 the id of the save we resumed from
  let currentSaveId = null;

  // Unified boot path used by both the "Enter Dungeon" click and the
  // "Resume" action from the Saved Games screen.
  //   cfg = { name, sex, classKey, resumeSnapshot?, resumeSaveId? }
  async function bootGame(cfg) {
    if (_starting) return;
    _starting = true;
    if (startBtn) startBtn.disabled = true;
    const snap = (cfg && cfg.resumeSnapshot) || null;
    currentSaveId = snap && typeof cfg.resumeSaveId === 'string' ? cfg.resumeSaveId : null;
    const playerName = String((cfg && cfg.name) || 'Adventurer').trim() || 'Adventurer';
    const sex = (cfg && cfg.sex) || 'male';
    const classKey = (cfg && cfg.classKey) || 'knight';
    panelState.currentPlayerCapacity = progressionStatsForLevel(1, classKey).capacity;
    panelState.playerConfig = { name: playerName, sex, classKey, resumeSnapshot: snap };

    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    setLoadingProgress(0, 'Loading creature data...');

    // Progress bar driver - one tick per finished task. Engine tasks (6)
    // arrive via loadEngineData's onProgress callback; the panel-internal
    // tasks (bag + coin templates) tick on completion of their own promise.
    let jsonsDone = 0;
    const JSON_TASKS = 8;
    const jsonLabels = [
      'Loading creature data...', 'Preparing inventory...', 'Loading loot tables...',
      'Loading abilities...', 'Loading damage data...', 'Loading currencies...',
      'Loading spells...', 'Loading items...',
    ];
    const onJsonDone = () => {
      jsonsDone += 1;
      setLoadingProgress(
        Math.round((jsonsDone / JSON_TASKS) * 45),
        jsonLabels[jsonsDone] || 'Finalizing data...',
      );
    };

    const bagToEquip = snap && Number(snap.bagArticleId) ? Number(snap.bagArticleId) : START_BAG_ARTICLE_ID;
    await Promise.all([
      loadEngineData(onJsonDone),
      equipBagByArticleId(bagToEquip).then(onJsonDone),
      ensureCoinTemplatesLoaded().then(onJsonDone),
    ]);

    setLoadingProgress(45, 'Starting game engine...');
    addCoinsToInventory(0);
    if (snap) {
      // Restore the saved inventory: equipped slots + bag items + gold.
      // We equip by article_id; equipItemInSlot hydrates the full item from
      // the catalog so stats/sprites match the shop entries.
      const eq = (snap && snap.equippedSlots) || {};
      for (const [slotKey, item] of Object.entries(eq)) {
        if (!item) continue;
        const articleId = Number(item.article_id || item.id || 0);
        if (!articleId) continue;
        try { await equipItemInSlot(slotKey, articleId); } catch { /* skip bad slot */ }
      }
      const bag = Array.isArray(snap.bagLootItems) ? snap.bagLootItems : [];
      for (const item of bag) {
        if (!item) continue;
        try { addLootItemToBag({ ...item }); } catch { /* skip bad entry */ }
      }
      if (Number.isFinite(Number(snap.gold)) && Number(snap.gold) > 0) {
        addCoinsToInventory(Math.floor(Number(snap.gold)));
      }
    } else {
      // Default starting inventory: torch equipped and lit (3-tile radius).
      await equipItemInSlot('light', LIGHT_ITEM_ID_TORCH);
    }
    document.getElementById('startOverlay').style.display = 'none';
    const savesOv = document.getElementById('savesOverlay');
    if (savesOv) savesOv.style.display = 'none';
    startGame(panelState.playerConfig);
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      const playerName = ((playerNameInput && playerNameInput.value) || '').trim() || 'Adventurer';
      bootGame({ name: playerName, sex: panelState.selectedSex, classKey: panelState.selectedClass });
    });
  }
  if (playerNameInput) {
    // Un único listener de Enter para el input (el document listener era redundante y causaba doble disparo)
    playerNameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (startBtn && !startBtn.disabled && !_starting) startBtn.click();
      }
    });
  }

  // Exposed so the saves screen ("Resume") can re-enter the game.
  window.tdGame = {
    resume(snapshot, saveId) {
      if (!snapshot) return;
      // Clear the saves-screen hash so a subsequent refresh lands on the
      // character overlay (or the game, if it's already running).
      if (window.location.hash === '#/saves') window.location.hash = '';
      bootGame({
        name:     snapshot.name,
        sex:      snapshot.sex,
        classKey: snapshot.classKey,
        resumeSnapshot: snapshot,
        resumeSaveId:   saveId || null,
      });
    },
    // Shared-state accessors for the in-game Save button.
    getCurrentSaveId() { return currentSaveId; },
    setCurrentSaveId(id) { currentSaveId = id || null; },
    // Wipe the active run's save slot - called from death flows so a
    // completed/failed run doesn't keep polluting the Load Game list.
    async deleteCurrentSave() {
      const id = currentSaveId;
      if (!id) return false;
      const api = window.tdAuth && window.tdAuth.apiFetch;
      if (!api) return false;
      if (!OFFLINE_BUILD) {
        const loggedIn = window.tdAuth.isLoggedIn && window.tdAuth.isLoggedIn();
        if (!loggedIn) return false;
      }
      currentSaveId = null;
      try {
        await api(`/api/saves?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
        return true;
      } catch { return false; }
    },
  };

  // Engine calls this after a death so the character-select overlay opens
  // with a clean inventory / re-enabled Start button.
  window._resetInventoryForNewRun = () => {
    panelState.bagLootItems = [];
    for (const slotKey of Object.keys(panelState.equippedSlots)) {
      panelState.equippedSlots[slotKey] = null;
      clearEquippedSlotVisual(slotKey);
    }
    panelState.currentBagCapacity = 0;
    panelState.currentBagItem = null;
    setLastLootRejectReason('');
    renderLootSlots(0);
    if (startBtn) startBtn.disabled = false;
    _starting = false;
  };
}
