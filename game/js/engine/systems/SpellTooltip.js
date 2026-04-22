// Spell tooltip system — Phase 4 extraction from game.engine.js.
//
// Owns the `#itemTooltip` DOM node while it is showing SPELL content (the
// learned-spells grid, the spell bar, the spell shop). The separate item
// tooltip — used for market cards and equipment slots — lives under
// `ui/panels/itemTooltip.js`; both compete for the same DOM target,
// which is fine because only one is visible at a time.
//
// Public surface:
//   hideSpellTooltip()                       — close the tooltip
//   bindSpellTooltip(el, spell, opts)        — attach hover/tap handlers
//   bindSpellBarTooltip(el, spell, slotLabel) — short-form variant for hotbar
//   setupSpellTooltipDismissers()            — global listeners (blur, Esc, …)
//
// Call `setupSpellTooltipDismissers()` once at scene create. The other
// functions are called per DOM element as the engine re-renders the
// spell UI.

// Outside-tap dismissal ignores clicks on these selectors so the row
// handlers (Learned Spells / Spell Shop / Items Shop / Market) can
// refresh or replace the tooltip on tap without a frame flicker.
const TOOLTIP_KEEP_ALIVE_SELECTOR = '.learned-spell-row, .spell-row, .item-shop-row, .market-card';

export const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const ttRow = (label, value) => `<div class="tt-row"><span class="tt-label">${esc(label)}</span><span class="tt-value">${esc(String(value))}</span></div>`;
export const hasRealHover = () => !!(window.matchMedia && window.matchMedia('(hover: hover)').matches);

function tooltipEl() {
  return document.getElementById('itemTooltip');
}

export function hideSpellTooltip() {
  const el = tooltipEl();
  if (!el) return;
  el.style.display = 'none';
  el.innerHTML = '';
}

function formatSpellTooltip(spell) {
  if (!spell) return '';
  const raw = spell.raw && typeof spell.raw === 'object' ? spell.raw : {};
  const effect = String(raw.effect || '').trim();
  let h = `<div class="tt-header">`;
  h += `<div class="tt-title">${esc(spell.title || 'Unknown Spell')}</div>`;
  if (spell.words) h += `<div class="tt-words">${esc(spell.words)}</div>`;
  h += `</div><div class="tt-body">`;
  h += `<div class="tt-section">Info</div>`;
  h += ttRow('Type', spell.spell_type || '—');
  h += ttRow('Group', spell.group_spell || '—');
  h += `<div class="tt-sep"></div>`;
  h += `<div class="tt-section">Requirements</div>`;
  h += ttRow('Level', Math.max(0, Number(spell.level || 0)));
  h += ttRow('Mana', Math.max(0, Number(spell.mana || 0)));
  h += `<div class="tt-sep"></div>`;
  h += `<div class="tt-section">Shop</div>`;
  h += ttRow('Price', `${Math.max(0, Number(spell.price || 0))} gp`);
  if (effect) {
    h += `<div class="tt-sep"></div>`;
    h += `<div class="tt-effect">${esc(effect)}</div>`;
  }
  h += `</div>`;
  return h;
}

function formatSpellBarTooltip(spell, slotLabel) {
  if (!spell) return '';
  const raw = spell.raw && typeof spell.raw === 'object' ? spell.raw : {};
  const effect = String(raw.effect || '').trim();
  const title = slotLabel ? `${esc(slotLabel)} ${esc(spell.title || '')}` : esc(spell.title || '');
  let h = `<div class="tt-header"><div class="tt-title">${title}</div>`;
  if (spell.words) h += `<div class="tt-words">${esc(spell.words)}</div>`;
  h += `</div><div class="tt-body">`;
  if (effect) h += `<div class="tt-desc">${esc(effect)}</div><div class="tt-sep"></div>`;
  h += `<div class="tt-row"><span class="tt-label">Mana</span><span class="tt-value">${Math.max(0, Number(spell.mana || 0))}</span></div>`;
  h += `</div>`;
  return h;
}

export function bindSpellTooltip(el, spell, opts = {}) {
  const ttEl = tooltipEl();
  if (!el || !ttEl) return;
  const touchShow = opts.touchShow !== false; // default: show on tap
  const place = (ev) => {
    const pad = 14;
    const x = Math.min(window.innerWidth - 270, ev.clientX + pad);
    const y = Math.min(window.innerHeight - 260, ev.clientY + pad);
    ttEl.style.left = `${Math.max(6, x)}px`;
    ttEl.style.top = `${Math.max(6, y)}px`;
  };
  const showAt = (ev) => {
    ttEl.innerHTML = formatSpellTooltip(spell);
    ttEl.style.display = 'block';
    ttEl.style.maxWidth = '260px';
    place(ev);
  };
  // Hover handlers only on true hover-capable devices — on touch,
  // synthesized mouseenter/leave fires at the end of a tap and would
  // hide the tooltip immediately after our pointerup shows it.
  if (hasRealHover()) {
    el.addEventListener('mouseenter', showAt);
    el.addEventListener('mousemove', place);
    el.addEventListener('mouseleave', hideSpellTooltip);
  }
  // Unified tap-to-show via pointer events — works for mouse, touch,
  // and pen. Filters out taps on child buttons/reorder arrows so their
  // own handlers (reorder / buy) don't get masked by tooltip logic.
  // Callers can pass { touchShow: false } to opt out (e.g. Spells
  // Shop uses a dedicated "Info" button instead of a tap anywhere).
  if (touchShow) {
    let _pttX = 0;
    let _pttY = 0;
    let _pttMoved = false;
    let _pttActive = false;
    el.addEventListener('pointerdown', (ev) => {
      _pttX = ev.clientX;
      _pttY = ev.clientY;
      _pttMoved = false;
      _pttActive = true;
    });
    el.addEventListener('pointermove', (ev) => {
      if (!_pttActive || _pttMoved) return;
      if (Math.abs(ev.clientX - _pttX) > 10 || Math.abs(ev.clientY - _pttY) > 10) {
        _pttMoved = true;
      }
    });
    const pointerFinish = (ev) => {
      if (!_pttActive) return;
      _pttActive = false;
      if (_pttMoved) return;
      if (ev.pointerType === 'mouse') return; // mouse uses mouseenter
      if (ev.target.closest && ev.target.closest('.ls-reorder-arrows, button')) return;
      showAt(ev);
    };
    el.addEventListener('pointerup', pointerFinish);
    el.addEventListener('pointercancel', () => { _pttActive = false; });
  }
  return showAt;
}

export function bindSpellBarTooltip(el, spell, slotLabel) {
  const ttEl = tooltipEl();
  if (!el || !ttEl) return;
  const html = formatSpellBarTooltip(spell, slotLabel);
  const place = (ev) => {
    const pad = 14;
    const x = Math.min(window.innerWidth - 220, ev.clientX + pad);
    const y = Math.min(window.innerHeight - 160, ev.clientY + pad);
    ttEl.style.left = `${Math.max(6, x)}px`;
    ttEl.style.top = `${Math.max(6, y)}px`;
  };
  el.addEventListener('mouseenter', (ev) => {
    ttEl.innerHTML = html;
    ttEl.style.display = 'block';
    ttEl.style.maxWidth = '220px';
    place(ev);
  });
  el.addEventListener('mousemove', place);
  el.addEventListener('mouseleave', hideSpellTooltip);
}

// Global dismissers — attach once on scene create.
export function setupSpellTooltipDismissers() {
  window.addEventListener('blur', hideSpellTooltip);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hideSpellTooltip();
  });
  document.addEventListener('keydown', hideSpellTooltip);
  // Outside-tap dismissal. Runs in the capture phase so it fires even
  // when a child handler calls stopPropagation (row taps, arrows, etc.).
  // If the tap lands inside the tooltip itself or on a row that wants to
  // refresh its own tooltip, we let those flows run.
  document.addEventListener('pointerdown', (ev) => {
    const ttEl = tooltipEl();
    if (!ttEl || ttEl.style.display === 'none') return;
    if (ttEl.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest(TOOLTIP_KEEP_ALIVE_SELECTOR)) return;
    hideSpellTooltip();
  }, true);
  document.addEventListener('click', (ev) => {
    const ttEl = tooltipEl();
    if (!ttEl || ttEl.style.display === 'none') return;
    if (ttEl.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest(TOOLTIP_KEEP_ALIVE_SELECTOR)) return;
    hideSpellTooltip();
  });
}
