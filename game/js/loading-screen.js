/**
 * Loading-screen changelog animation. Imported as the second module from
 * index.html so VERSION + CHANGELOG get inlined into the bundle instead of
 * loaded as raw source files at runtime.
 *
 * Also responsible for the service-worker registration (moved here from an
 * inline <script> in index.html so esbuild's OFFLINE_BUILD define can
 * tree-shake it out of the itch.io / standalone flavor, where the SW just
 * gets in the way).
 */
import { VERSION }   from './data/version.js';
import { CHANGELOG } from './data/changelog.js';

// Service worker registration — online builds only. In the offline flavor
// there is no network cache to manage and an SW inside the itch.io iframe
// tends to intercept cross-origin CDN loads we can't control (Phaser).
if (!OFFLINE_BUILD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

// Version badge in title
const verEl = document.getElementById('loadingVersion');
if (verEl) verEl.textContent = ` v${VERSION}`;

// Flatten entries: most recent version first
const allEntries = CHANGELOG.flatMap((release) =>
  release.entries.map((text) => ({ text, version: release.version })),
);

const overlay     = document.getElementById('loadingOverlay');
const header      = document.getElementById('changelogHeader');
const textEl      = document.getElementById('changelogText');
const metaEl      = document.getElementById('changelogMeta');
const versionTag  = document.getElementById('changelogVersionTag');
const counterEl   = document.getElementById('changelogCounter');
const dotsEl      = document.getElementById('changelogDots');

const DISPLAY_MS = 3000;
const FADE_MS    = 450;

let started = false;
let timers  = [];
let dots    = [];

function setDot(i) {
  dots.forEach((d, j) => d.classList.toggle('cl-active', j === i));
}

function showEntry(i) {
  const entry = allEntries[i];
  textEl.classList.remove('cl-show');
  metaEl.classList.remove('cl-show');

  const t = setTimeout(() => {
    textEl.textContent = entry.text;
    versionTag.textContent = `v${entry.version}`;
    counterEl.textContent  = `${i + 1} / ${allEntries.length}`;
    setDot(i);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      textEl.classList.add('cl-show');
      metaEl.classList.add('cl-show');
    }));

    const next = (i + 1) % allEntries.length;
    timers.push(setTimeout(() => showEntry(next), DISPLAY_MS));
  }, FADE_MS);

  timers.push(t);
}

function startChangelogAnimation() {
  if (started || !allEntries.length) return;
  started = true;

  if (header) header.textContent = `What's new in v${CHANGELOG[0]?.version ?? VERSION}`;

  const dotCount = Math.min(allEntries.length, 20);
  for (let i = 0; i < dotCount; i += 1) {
    const d = document.createElement('div');
    d.className = 'cl-dot';
    dotsEl.appendChild(d);
    dots.push(d);
  }

  textEl.textContent = allEntries[0].text;
  versionTag.textContent = `v${allEntries[0].version}`;
  counterEl.textContent  = `1 / ${allEntries.length}`;
  setDot(0);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    textEl.classList.add('cl-show');
    metaEl.classList.add('cl-show');
  }));

  timers.push(setTimeout(() => showEntry(1 % allEntries.length), DISPLAY_MS));
}

// Start when overlay becomes visible
const observer = new MutationObserver(() => {
  if (overlay.style.display === 'flex') {
    observer.disconnect();
    setTimeout(startChangelogAnimation, 500);
  }
});
observer.observe(overlay, { attributes: true, attributeFilter: ['style'] });

// Clean up when game starts
new MutationObserver(() => {
  if (overlay.style.display === 'none') {
    timers.forEach(clearTimeout);
    timers = [];
  }
}).observe(overlay, { attributes: true, attributeFilter: ['style'] });
