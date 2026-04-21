// Per-spell VFX overrides. Phase 5 of the architectural refactor — moved
// out of game.engine.js so the engine no longer carries 75 lines of static
// data. Shape/timing values modeled after tibia.fandom.com spell pages.
//
// Keys are `spell.title.toLowerCase()`. Lookup is done by the spell-cast
// path; missing entries fall back to inferred patterns from creatures/abilityPatterns.js.

export const SPELL_FX_OVERRIDES = {
  // Beams (sequential tile flash along the line)
  'energy beam': { kind: 'beam', depth: 5, fx: { delayStep: 40, duration: 200, order: 'beam' } },
  'great energy beam': { kind: 'beam', depth: 8, fx: { delayStep: 36, duration: 210, order: 'beam' } },
  'great death beam': { kind: 'beam', depth: 8, color: 0x9d7dd9, fx: { delayStep: 34, duration: 220, order: 'beam', glyph: '✢' } },
  // Waves / cones in facing direction
  'practise fire wave': { kind: 'cone', depth: 2, fx: { duration: 220, delayStep: 25, order: 'beam' } },
  scorch: { kind: 'cone', depth: 2, fx: { duration: 230, delayStep: 28, order: 'beam' } },
  'chill out': { kind: 'cone', depth: 2, fx: { duration: 230, delayStep: 28, order: 'beam' } },
  'fire wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'ice wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'terra wave': { kind: 'cone', depth: 3, fx: { duration: 260, delayStep: 30, order: 'beam' } },
  'energy wave': { kind: 'cone', depth: 3, fx: { duration: 280, delayStep: 32, order: 'beam' } },
  'great fire wave': { kind: 'cone', depth: 4, fx: { duration: 300, delayStep: 34, order: 'beam' } },
  'strong ice wave': { kind: 'cone', depth: 2, fx: { duration: 240, delayStep: 32, order: 'beam' } },
  // Knight cleaves
  'lesser front sweep': { kind: 'front_sweep', fx: { duration: 320, glyph: '✦' } },
  'front sweep': { kind: 'front_sweep', fx: { duration: 360, glyph: '✦' } },
  // Whirl hits around the caster
  berserk: { kind: 'nova', radius: 1, fx: { duration: 280, delayStep: 20, order: 'beam' } },
  groundshaker: { kind: 'nova', radius: 1, fx: { duration: 300, delayStep: 18, order: 'beam' } },
  'fierce berserk': { kind: 'nova', radius: 1, fx: { duration: 340, delayStep: 16, order: 'beam' } },
  // Large circular bursts (ultimate-style)
  thunderstorm: { kind: 'nova', radius: 2, fx: { duration: 320, delayStep: 12, order: 'beam' } },
  'stone shower': { kind: 'nova', radius: 2, fx: { duration: 340, delayStep: 14, order: 'beam' } },
  'divine caldera': { kind: 'nova', radius: 2, color: 0xfde68a, fx: { duration: 360, delayStep: 12, glyph: '✦', order: 'beam' } },
  'spiritual outburst': { kind: 'nova', radius: 2, fx: { duration: 380, delayStep: 10, order: 'beam' } },
  'rage of the skies': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  'hell\'s core': { kind: 'nova', radius: 3, fx: { duration: 420, delayStep: 10, order: 'beam' } },
  'wrath of nature': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  'eternal winter': { kind: 'nova', radius: 3, fx: { duration: 400, delayStep: 10, order: 'beam' } },
  // Ring bursts around caster (Ice/Terra Burst)
  'ice burst': { kind: 'ring', radius: 2, fx: { duration: 350, delayStep: 22, order: 'beam' } },
  'terra burst': { kind: 'ring', radius: 2, fx: { duration: 350, delayStep: 22, order: 'beam' } },
  // Cross-shaped explosion (rune-style)
  explosion: { kind: 'plus', reach: 2, fx: { duration: 300, delayStep: 35, order: 'beam' } },
  // Frontal boxes (monk / takedown style)
  'flurry of blows': { kind: 'front_box', width: 3, depth: 1, fx: { duration: 260, delayStep: 24, order: 'beam' } },
  'greater flurry of blows': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 300, delayStep: 22, order: 'beam' } },
  'sweeping takedown': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 320, delayStep: 20, order: 'beam' } },
  'balanced brawl': { kind: 'front_box', width: 3, depth: 2, fx: { duration: 280, delayStep: 22, order: 'beam' } },
  // Single-target melee spells
  'double jab': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 220 } },
  'swift jab': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 220 } },
  'tiger clash': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 260 } },
  'greater tiger clash': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 280 } },
  'forceful uppercut': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 280 } },
  'mystic repulse': { kind: 'projectile', depth: 7 },
  'lesser mystic repulse': { kind: 'projectile', depth: 5 },
  'devastating knockout': { kind: 'front_box', width: 1, depth: 1, fx: { duration: 300 } },
  // Strike/missile family (single square target / front square)
  'apprentice\'s strike': { kind: 'projectile', depth: 3 },
  buzz: { kind: 'projectile', depth: 3 },
  'mud attack': { kind: 'projectile', depth: 3 },
  'death strike': { kind: 'projectile', depth: 3 },
  'flame strike': { kind: 'projectile', depth: 3 },
  'energy strike': { kind: 'projectile', depth: 3 },
  'ice strike': { kind: 'projectile', depth: 3 },
  'terra strike': { kind: 'projectile', depth: 3 },
  'physical strike': { kind: 'projectile', depth: 3 },
  'strong flame strike': { kind: 'projectile', depth: 3 },
  'strong energy strike': { kind: 'projectile', depth: 3 },
  'strong ice strike': { kind: 'projectile', depth: 3 },
  'strong terra strike': { kind: 'projectile', depth: 3 },
  'ultimate flame strike': { kind: 'projectile', depth: 3 },
  'ultimate energy strike': { kind: 'projectile', depth: 3 },
  'ultimate ice strike': { kind: 'projectile', depth: 3 },
  'ultimate terra strike': { kind: 'projectile', depth: 3 },
  lightning: { kind: 'projectile', depth: 5 },
  'divine missile': { kind: 'projectile', depth: 4 },
  'ethereal spear': { kind: 'projectile', depth: 4 },
  'lesser ethereal spear': { kind: 'projectile', depth: 4 },
  'strong ethereal spear': { kind: 'projectile', depth: 5 },
  'whirlwind throw': { kind: 'projectile', depth: 4 },
  annihilation: { kind: 'front_box', width: 1, depth: 1, fx: { duration: 300 } },
};
