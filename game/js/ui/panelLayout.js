/**
 * Panel layout sync. With the new flex-column sidebar layout the browser
 * reflows panels automatically when accordions open/close, so no manual
 * position updates are needed. The API is kept for backwards compatibility.
 */
export function wirePanelLayoutSync() {
  const noop = () => {};
  return {
    syncLootPanelPosition: noop,
    syncStatsPanelPosition: noop,
    syncLearnedPanelPosition: noop,
    syncItemsShopPanelPosition: noop,
  };
}
