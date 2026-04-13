function bindToggleEvent(el, cb) {
  if (!el) return;
  el.addEventListener('toggle', cb);
}

export function wirePanelLayoutSync({
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
}) {
  const syncLootPanelPosition = () => {
    if (!equipmentPanelEl || !lootPanelEl) return;
    const rect = equipmentPanelEl.getBoundingClientRect();
    lootPanelEl.style.top = `${Math.round(rect.bottom + 6)}px`;
  };
  const syncStatsPanelPosition = () => {
    if (!itemsShopPanelEl || !statsPanelEl) return;
    const rect = itemsShopPanelEl.getBoundingClientRect();
    statsPanelEl.style.top = `${Math.round(rect.bottom + 6)}px`;
  };
  const syncLearnedPanelPosition = () => {
    if (!spellsPanelEl || !learnedSpellsPanelEl) return;
    const rect = spellsPanelEl.getBoundingClientRect();
    learnedSpellsPanelEl.style.top = `${Math.round(rect.bottom + 6)}px`;
  };
  const syncItemsShopPanelPosition = () => {
    if (!learnedSpellsPanelEl || !itemsShopPanelEl) return;
    const rect = learnedSpellsPanelEl.getBoundingClientRect();
    itemsShopPanelEl.style.top = `${Math.round(rect.bottom + 6)}px`;
    syncStatsPanelPosition();
  };

  bindToggleEvent(equipmentAccordionEl, syncLootPanelPosition);
  bindToggleEvent(spellsAccordionEl, syncLearnedPanelPosition);
  const learnedDetails = learnedSpellsPanelEl && learnedSpellsPanelEl.querySelector('details');
  bindToggleEvent(learnedDetails, syncItemsShopPanelPosition);
  bindToggleEvent(itemsShopAccordionEl, syncItemsShopPanelPosition);

  window.addEventListener('resize', syncLootPanelPosition);
  window.addEventListener('resize', syncStatsPanelPosition);
  window.addEventListener('resize', syncLearnedPanelPosition);
  window.addEventListener('resize', syncItemsShopPanelPosition);

  return {
    syncLootPanelPosition,
    syncStatsPanelPosition,
    syncLearnedPanelPosition,
    syncItemsShopPanelPosition,
  };
}
