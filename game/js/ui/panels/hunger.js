// Hunger indicator. Tiny DOM helper — toggles the `.sated` class on the
// indicator and updates its tooltip text. Exposed on `window.setHungryUi`
// because the engine reads hunger state but the DOM lives with the panel.

export function setHungryUi(isHungry, _secondsLeft = 0) {
  const hungryIndicator = document.getElementById('hungryIndicator');
  const hungryLabel = document.getElementById('hungryLabel');
  if (!hungryIndicator || !hungryLabel) return;
  if (isHungry) {
    hungryIndicator.classList.remove('sated');
    hungryLabel.textContent = 'Hungry';
    hungryIndicator.title = 'You are hungry.';
  } else {
    hungryIndicator.classList.add('sated');
    hungryLabel.textContent = '';
    hungryIndicator.title = 'Food regeneration active.';
  }
}

/** Install on window so the engine can call it. Idempotent. */
export function installHungerWindowApi() {
  if (typeof window !== 'undefined') window.setHungryUi = setHungryUi;
}
