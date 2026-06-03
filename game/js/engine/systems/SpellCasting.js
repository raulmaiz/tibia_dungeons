// Player spell-casting orchestrator. Covers:
//   - spellAttackPattern(spell)           — per-title override / auto-pattern dispatch
//   - castPatternAttackSpell(spell, slot) — area-pattern spells (cone/nova/ring…)
//   - castLearnedSpell(slot, now)         — the big one: mana / CD check, conjure
//                                           ammo, food, convince, summon, challenge,
//                                           party, healing, attack, light, speed.
//
// Extracted from game.engine.js Phase 4 (Combat prep). The module
// imports pure helpers directly (SpellStats / SpellVisuals / SpellFx /
// Weapons / CombatMath / ElementalMods / ConjureAmmo); everything that
// needs mutable engine state is passed via `setupSpellCasting(deps)`.

import { addCombatLog, LOG_COLORS } from './CombatLog.js';
import { bus, EVENTS } from '../../core/EventBus.js';
import { createCreatureSprite } from '../../rendering/SpriteFactory.js';
import { floatingCombatText } from '../../rendering/Renderer.js';
import { isBlockedSpellTitle } from '../../entities/Spell/filters.js';
import { SPELL_FX_OVERRIDES } from '../../entities/Spell/fxOverrides.js';
import { showDrinkEffect } from './FloatingEffects.js';
import { didAttackCrit, didAttackMiss, applyCriticalDamage } from './CombatMath.js';
import { applyIncomingElementalDamage, inferSpellDamageElementKey } from './ElementalMods.js';
import { spellFxProfile } from './SpellVisuals.js';
import { inferSpellRange, isSingleTargetAttackPattern } from './SpellStats.js';
import { conjureArrowPayloadFromSpell } from './ConjureAmmo.js';

/** @typedef {import('../../types.js').Spell} Spell */
/** @typedef {import('../../types.js').Creature} Creature */
/** @typedef {import('../../types.js').Item} Item */

/**
 * Build the spell-casting orchestrator bound to engine state.
 *
 * Returns an object exposing {spellAttackPattern, castPatternAttackSpell,
 * castLearnedSpell} — the engine destructures what it needs.
 *
 * @param {Record<string, any>} deps  Engine closure references; see usages below
 */
export function setupSpellCasting(deps) {
  const {
    scene, player, playerState, tileSize,
    floorAtmosphere,
    isWalkableTile, isWalkable,
    enemyCreatureAt, creatureAt,
    aliveAllies, aliveCreatures,
    creatures,
    getCurrentLevel,
    getItemsShopCatalog,
    getSpellsCatalog,
    getTypeProgressionGroups,
    getCreatureAbilitiesById,
    getGameOver,
    MAX_CONVINCED,
    floatingFxCtx,
    // Thin-wrapper callbacks supplied by the engine:
    inferHealingAmount,
    inferClassAdjustedSpellDamage,
    resolvePatternTiles,
    frontSingleTile,
    showSpellTileEffect,
    showSpellAuraEffect,
    showSpellProjectileEffect,
    showCreatureHitEffect,
    showCritText,
    showMissSmoke,
    showRangedProjectileEffect,
    showPlayerCureEffect,
    playCreatureDeathEffect,
    killSummonsOf,
    updatePlayerBar,
    updateCreatureBar,
    updateHud,
    grantPlayerXp,
    effectiveXpFromCreature,
    makeHealthBar,
    makeNameLabel,
    mergeCreatureElementModsForId,
    findNearestRangedTarget,
    resolveConjuredArrowItem,
    placeConjuredArrow,
    setPoisonIndicator,
    hasRopeUpAtPlayer,
    tryClimbUpFloor,
    updatePlayerTimingsByLevel,
  } = deps;

  /** Per-title FX override → {kind, radius, depth, …} or a sensible auto-pattern. */
  function spellAttackPattern(spell) {
    const title = String((spell && spell.title) || '').toLowerCase();
    const wikiOverride = SPELL_FX_OVERRIDES[title];
    if (wikiOverride) return { ...wikiOverride };
    const effect = String((spell && spell.raw && spell.raw.effect) || '').toLowerCase();
    if (title.includes('front sweep')) return { kind: 'front_sweep', depth: 1 };
    if (title.includes('beam')) return { kind: 'beam', depth: title.includes('great') ? 8 : 5 };
    if (title.includes('wave') || effect.includes('directly in front')) {
      return { kind: 'cone', depth: title.includes('strong') || title.includes('great') ? 4 : 3 };
    }
    if (title.includes('berserk') || title.includes('groundshaker')) return { kind: 'nova', radius: 1 };
    if (
      title.includes('caldera')
      || title.includes('core')
      || title.includes('winter')
      || title.includes('wrath')
      || title.includes('skies')
      || title.includes('storm')
      || title.includes('shower')
      || (title.includes('burst') && !title.includes('ice burst') && !title.includes('terra burst'))
      || effect.includes('around the caster')
    ) return { kind: 'nova', radius: 2 };
    if (title.includes('ice burst') || title.includes('terra burst')) return { kind: 'ring', radius: 2 };
    return { kind: 'projectile', depth: inferSpellRange(spell) };
  }

  /** Area/cone/beam/etc. attack spells — projectiles are handled separately. */
  function castPatternAttackSpell(spell, slotNumber) {
    const pattern = spellAttackPattern(spell);
    if (!pattern || pattern.kind === 'projectile') return false;
    const tilesRaw = resolvePatternTiles(pattern);
    if (!tilesRaw || tilesRaw.length === 0) return false;
    const tiles = tilesRaw.filter((t) => isWalkableTile(t.gx, t.gy));
    if (tiles.length === 0) return false;
    const prof = spellFxProfile(spell);
    const color = pattern.color != null ? pattern.color : prof.color;
    const po = pattern.fx && typeof pattern.fx === 'object' ? pattern.fx : {};
    const fxOpts = { ...po, glyph: po.glyph != null ? po.glyph : prof.glyph, kind: pattern.kind };
    showSpellTileEffect(tiles, color, fxOpts);
    const impacted = [];
    const spellElem = inferSpellDamageElementKey(spell);
    const isAreaPattern = !isSingleTargetAttackPattern(pattern);
    for (const t of tiles) {
      const target = enemyCreatureAt(t.gx, t.gy);
      if (!target) continue;
      const crit = didAttackCrit();
      const base = inferClassAdjustedSpellDamage(spell, { area: isAreaPattern });
      const dmgRaw = crit ? applyCriticalDamage(base) : base;
      const dmgBase = applyIncomingElementalDamage(dmgRaw, target, spellElem);
      const dmg = playerState.godMode ? Math.max(1, Number(target.hp || 1)) : dmgBase;
      target.hp = Math.max(0, target.hp - dmg);
      showCreatureHitEffect(target, dmg);
      if (crit) showCritText(target.sprite.x, target.sprite.y);
      impacted.push({ target, dmg });
      if (target.hp <= 0) {
        target.alive = false;
        playCreatureDeathEffect(target);
        updateCreatureBar(target);
        grantPlayerXp(effectiveXpFromCreature(target));
        playerState.runKills += 1;
        killSummonsOf(target);
      }
    }
    if (impacted.length === 0) {
      addCombatLog(`Cast [${slotNumber}] ${spell.title}, but it hits nothing.`, LOG_COLORS.SPELL);
    } else {
      const detail = impacted.map((x) => `${x.target.title}(${x.dmg})`).join(', ');
      addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${detail}.`, LOG_COLORS.SPELL);
    }
    return true;
  }

  function castLearnedSpell(slotNumber, now) {
    const slotIdx = slotNumber - 1;
    const articleId = slotIdx >= 0 && slotIdx < 10 && slotIdx < playerState.learnedSpellOrder.length
      ? playerState.learnedSpellOrder[slotIdx]
      : null;
    if (!articleId) return false;
    const spellsCatalog = getSpellsCatalog();
    const spell = (spellsCatalog || []).find((s) => Number(s.article_id) === Number(articleId));
    if (!spell) return false;
    if (isBlockedSpellTitle(spell.title)) return false;
    const title = String(spell.title || '').toLowerCase();
    const isMagicRopeSpell = title === 'magic rope';
    if (isMagicRopeSpell && !hasRopeUpAtPlayer()) {
      addCombatLog('Cast Magic Rope on the entry tile (where you appear on this floor).');
      return true;
    }
    if (isMagicRopeSpell && getCurrentLevel() <= 1) {
      addCombatLog('You are already on floor 1.');
      return true;
    }
    const manaCost = Math.max(0, Number(spell.mana || 0));
    if (playerState.mana < manaCost) {
      addCombatLog(`Not enough mana for ${spell.title}.`);
      return true;
    }
    const cdSec = Math.max(0, Number((spell.raw && spell.raw.cooldown) || 0));
    const cdUntil = Number(playerState.spellCooldownUntil.get(articleId) || 0);
    if (now < cdUntil) {
      addCombatLog(`${spell.title} is on cooldown.`);
      return true;
    }
    playerState.mana = Math.max(0, playerState.mana - manaCost);
    playerState.spellCooldownUntil.set(articleId, now + (cdSec * 1000));
    if (cdSec > 0) playerState.spellCdDurations.set(articleId, cdSec);
    bus.emit(EVENTS.SPELL_CAST, {
      articleId,
      title: spell.title,
      slot: slotNumber,
      manaCost,
      by: 'player',
    });
    // Cast flash animation on the spell slot
    const castSlotEl = /** @type {HTMLElement | null} */ (document.querySelector(`.spell-slot[data-spell-id="${articleId}"] .spell-slot-img-wrap`));
    if (castSlotEl) {
      castSlotEl.classList.remove('spell-slot-casting');
      void castSlotEl.offsetWidth; // reflow to restart animation
      castSlotEl.classList.add('spell-slot-casting');
      castSlotEl.addEventListener('animationend', () => castSlotEl.classList.remove('spell-slot-casting'), { once: true });
    }
    // Cooldown overlay animation
    if (cdSec > 0) {
      const cdOverlay = /** @type {HTMLElement | null} */ (document.querySelector(`.spell-cd-overlay[data-cd-for="${articleId}"]`));
      const cdText = document.querySelector(`.spell-cd-text[data-cd-text-for="${articleId}"]`);
      if (cdOverlay) {
        cdOverlay.classList.remove('cd-active');
        void cdOverlay.offsetWidth;
        cdOverlay.style.setProperty('--cd-dur', `${cdSec}s`);
        cdOverlay.classList.add('cd-active');
        cdOverlay.addEventListener('animationend', () => {
          cdOverlay.classList.remove('cd-active');
          if (cdText) cdText.textContent = '';
        }, { once: true });
      }
    }
    const group = String(spell.group_spell || '').toLowerCase();
    if (isMagicRopeSpell) {
      updatePlayerBar();
      return tryClimbUpFloor(spell.title || 'Magic Rope');
    }
    const conjuredArrow = conjureArrowPayloadFromSpell(spell);
    if (conjuredArrow) {
      const ammoItem = resolveConjuredArrowItem(conjuredArrow);
      if (!ammoItem) {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}, but no matching arrow item was found.`, LOG_COLORS.SPELL);
      } else {
        const placedAt = placeConjuredArrow(ammoItem, conjuredArrow.count);
        if (placedAt === 'ammo') {
          addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${conjuredArrow.count} ${ammoItem.title}${conjuredArrow.count > 1 ? 's' : ''} equipped in ammo slot.`, LOG_COLORS.SPELL);
        } else if (placedAt === 'bag') {
          addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${conjuredArrow.count} ${ammoItem.title}${conjuredArrow.count > 1 ? 's' : ''} added to loot bag.`, LOG_COLORS.SPELL);
        } else {
          addCombatLog(`Cast [${slotNumber}] ${spell.title}, but ammo creation failed (bag full/capacity).`, LOG_COLORS.SPELL);
        }
      }
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Food (Exevo Pan) ───────────────────────────────────
    if (title === 'food (spell)' || title === 'food') {
      const itemsShopCatalog = getItemsShopCatalog();
      const foods = (itemsShopCatalog || []).filter((it) =>
        it && String(it.item_type || '').toLowerCase() === 'food'
      );
      if (foods.length === 0) {
        addCombatLog('No food items available to conjure.', LOG_COLORS.SPELL);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      const inv = window.debugInventory;
      const stacks = 2 + Math.floor(Math.random() * 3); // 2..4 stacks
      const conjured = [];
      for (let i = 0; i < stacks; i++) {
        const food = foods[Math.floor(Math.random() * foods.length)];
        const qty = 1 + Math.floor(Math.random() * 3); // 1..3 per stack
        const ok = inv && typeof inv.addLoot === 'function'
          ? inv.addLoot({ ...food, isStackable: true, count: qty })
          : false;
        if (ok) conjured.push(`${qty}x ${food.title}`);
      }
      showSpellAuraEffect(player.x, player.y, spell, 1.0);
      if (conjured.length > 0) {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: ${conjured.join(', ')} added to loot bag.`, LOG_COLORS.SPELL);
      } else {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}, but bag is full.`, LOG_COLORS.SPELL);
      }
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Convince Creature ──────────────────────────────────
    if (title === 'convince creature') {
      const front = frontSingleTile();
      const target = isWalkableTile(front.gx, front.gy) ? enemyCreatureAt(front.gx, front.gy) : null;
      if (!target || !target.alive) {
        addCombatLog('No creature in front of you to convince.', LOG_COLORS.SPELL);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      const convinceCost = Math.max(0, Number(target.convinceCost || 0));
      if (convinceCost <= 0) {
        addCombatLog(`${target.title} cannot be convinced.`);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      if (playerState.mana < convinceCost) {
        addCombatLog(`Not enough mana to convince ${target.title} (need ${convinceCost} MP).`);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      playerState.mana = Math.max(0, playerState.mana - convinceCost);
      const currentAllies = aliveAllies();
      if (currentAllies.length >= MAX_CONVINCED) {
        const oldest = currentAllies[0];
        oldest.alive = false;
        playCreatureDeathEffect(oldest);
        updateCreatureBar(oldest);
        addCombatLog(`${oldest.title} (ally) was released.`);
      }
      target.isConvinced = true;
      target.aggroLocked = false;
      target.sprite.setTint(0x88ffaa);
      if (target.nameTag) target.nameTag.destroy();
      target.nameTag = makeNameLabel(target.title, '#4ade80');
      if (target.hpBar) { target.hpBar.bg.destroy(); target.hpBar.fill.destroy(); }
      target.hpBar = makeHealthBar(0x22c55e);
      target.hpBar.bg.setDepth(16);
      target.hpBar.fill.setDepth(17);
      target.nameTag.setDepth(18);
      updateCreatureBar(target);
      showSpellAuraEffect(target.sprite.x, target.sprite.y, spell, 1.2);
      addCombatLog(`You convinced ${target.title}! It fights by your side now (${convinceCost} MP).`, LOG_COLORS.SPELL);
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Summon Creature ──────────────────────────────────
    if (title === 'summon creature') {
      const typeProgressionGroups = getTypeProgressionGroups();
      const creatureAbilitiesById = getCreatureAbilitiesById();
      const candidates = [];
      for (const g of typeProgressionGroups) {
        for (const c of (g.creatures || [])) {
          const cost = Math.max(0, Number(c.summon_cost || 0));
          if (cost <= 0) continue;
          if (cost > playerState.mana) continue;
          const texKey = `creature_${c.id}`;
          if (!scene.textures.exists(texKey)) continue;
          candidates.push(c);
        }
      }
      if (candidates.length === 0) {
        addCombatLog('Not enough mana to summon any creature.', LOG_COLORS.SPELL);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      candidates.sort((a, b) => Number(b.summon_cost) - Number(a.summon_cost));
      const best = candidates[0];
      const summonCost = Math.max(0, Number(best.summon_cost || 0));
      const offsets = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
      const spawnTile = offsets
        .map(([ox, oy]) => ({ gx: playerState.gridX + ox, gy: playerState.gridY + oy }))
        .find((t) => isWalkable(t.gx, t.gy) && !creatureAt(t.gx, t.gy));
      if (!spawnTile) {
        addCombatLog('No free space to summon a creature.', LOG_COLORS.SPELL);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      playerState.mana = Math.max(0, playerState.mana - summonCost);
      const currentAllies = aliveAllies();
      if (currentAllies.length >= MAX_CONVINCED) {
        const oldest = currentAllies[0];
        oldest.alive = false;
        playCreatureDeathEffect(oldest);
        updateCreatureBar(oldest);
        addCombatLog(`${oldest.title} (ally) was released.`);
      }
      const texKey = `creature_${best.id}`;
      const sprite = createCreatureSprite(scene, texKey, spawnTile.gx, spawnTile.gy);
      sprite.setTint(0x88ffaa);
      const ally = {
        id: Number(best.id),
        sprite,
        gx: spawnTile.gx, gy: spawnTile.gy,
        hp: Math.max(1, Number(best.hitpoints || 1)),
        maxHp: Math.max(1, Number(best.hitpoints || 1)),
        maxDamage: Math.max(1, Number(best.maxDamage || 1)),
        runsAt: 0,
        title: best.title,
        experience: 0,
        speed: Math.max(1, Number(best.speed || 100)),
        ranged: best.ranged === true,
        range: Math.max(1, Number(best.range || 1)),
        alive: true,
        nextWanderAt: 0, nextActionAt: 0, nextAbilityAt: 0,
        aggroLocked: false,
        abilities: (creatureAbilitiesById.get(Number(best.id)) || []).slice(0, 16),
        elementMods: mergeCreatureElementModsForId(Number(best.id)),
        hpBar: makeHealthBar(0x22c55e),
        nameTag: makeNameLabel(best.title, '#4ade80'),
        convinceCost: Math.max(0, Number(best.convince_cost || 0)),
        isConvinced: true,
      };
      ally.hpBar.bg.setDepth(16);
      ally.hpBar.fill.setDepth(17);
      ally.nameTag.setDepth(18);
      creatures.push(ally);
      updateCreatureBar(ally);
      showSpellAuraEffect(sprite.x, sprite.y, spell, 1.2);
      addCombatLog(`You summoned ${best.title}! (${summonCost} MP).`, LOG_COLORS.SPELL);
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Challenge ────────────────────────────────────────
    if (title === 'challenge') {
      const range = 5;
      let taunted = 0;
      for (const c of aliveCreatures()) {
        const dist = Math.max(Math.abs(c.gx - playerState.gridX), Math.abs(c.gy - playerState.gridY));
        if (dist > range) continue;
        c.aggroLocked = true;
        taunted++;
        showSpellAuraEffect(c.sprite.x, c.sprite.y, spell, 0.6);
      }
      showSpellAuraEffect(player.x, player.y, spell, 1.0);
      addCombatLog(
        taunted > 0
          ? `Cast [${slotNumber}] ${spell.title}: ${taunted} creature${taunted > 1 ? 's' : ''} taunted!`
          : `Cast [${slotNumber}] ${spell.title}: no creatures nearby.`,
        LOG_COLORS.SPELL
      );
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Party spells ─────────────────────────────────────
    if (title.includes('party')) {
      const allies = aliveAllies();
      const PARTY_DURATION = 120000;
      showSpellAuraEffect(player.x, player.y, spell, 1.0);
      for (const ally of allies) {
        showSpellAuraEffect(ally.sprite.x, ally.sprite.y, spell, 0.8);
      }
      if (title === 'heal party') {
        const healPerTick = Math.max(3, Math.floor(4 + playerState.magicLevel * 0.5));
        let ticks = 0;
        const maxTicks = Math.floor(PARTY_DURATION / 2000);
        const healTimer = scene.time.addEvent({
          delay: 2000, loop: true,
          callback: () => {
            if (++ticks >= maxTicks || getGameOver()) { healTimer.remove(); return; }
            playerState.hp = Math.min(playerState.maxHp, playerState.hp + healPerTick);
            for (const a of aliveAllies()) {
              a.hp = Math.min(a.maxHp, a.hp + healPerTick);
              updateCreatureBar(a);
            }
            updatePlayerBar();
          },
        });
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: +${healPerTick} HP/2s for 2 min (you + allies).`, LOG_COLORS.SPELL);
      } else if (title === 'train party') {
        playerState.fistLevel += 3;
        for (const a of allies) a.maxDamage = Math.floor(a.maxDamage * 1.25);
        scene.time.delayedCall(PARTY_DURATION, () => {
          playerState.fistLevel = Math.max(10, playerState.fistLevel - 3);
          for (const a of aliveAllies()) a.maxDamage = Math.max(1, Math.floor(a.maxDamage / 1.25));
          addCombatLog('Train Party effect expired.');
          updateHud();
        });
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: fighting skills +3, allies +25% damage for 2 min.`, LOG_COLORS.SPELL);
      } else if (title === 'enchant party') {
        playerState.magicLevel += 1;
        for (const a of allies) a.maxDamage = Math.floor(a.maxDamage * 1.15);
        scene.time.delayedCall(PARTY_DURATION, () => {
          playerState.magicLevel = Math.max(0, playerState.magicLevel - 1);
          for (const a of aliveAllies()) a.maxDamage = Math.max(1, Math.floor(a.maxDamage / 1.15));
          addCombatLog('Enchant Party effect expired.');
          updateHud();
        });
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: magic level +1, allies +15% damage for 2 min.`, LOG_COLORS.SPELL);
      } else if (title === 'protect party') {
        playerState.shieldingLevel += 3;
        for (const a of allies) a._protectParty = true;
        scene.time.delayedCall(PARTY_DURATION, () => {
          playerState.shieldingLevel = Math.max(10, playerState.shieldingLevel - 3);
          for (const a of aliveAllies()) a._protectParty = false;
          addCombatLog('Protect Party effect expired.');
          updateHud();
        });
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: shielding +3, allies take 20% less damage for 2 min.`, LOG_COLORS.SPELL);
      } else if (title === 'enlighten party') {
        const manaPerTick = Math.max(5, Math.floor(6 + playerState.magicLevel * 0.6));
        let ticks = 0;
        const maxTicks = Math.floor(PARTY_DURATION / 2000);
        const manaTimer = scene.time.addEvent({
          delay: 2000, loop: true,
          callback: () => {
            if (++ticks >= maxTicks || getGameOver()) { manaTimer.remove(); return; }
            playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaPerTick);
            updatePlayerBar();
          },
        });
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: +${manaPerTick} MP/2s for 2 min.`, LOG_COLORS.SPELL);
      } else {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}.`, LOG_COLORS.SPELL);
      }
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Mass Healing ─────────────────────────────────────
    if (title === 'mass healing') {
      const heal = inferHealingAmount(spell);
      const prevPlayerHp = playerState.hp;
      playerState.hp = Math.min(playerState.maxHp, playerState.hp + heal);
      const playerGained = playerState.hp - prevPlayerHp;
      // Cohesive healing field around the caster — same rich area effect as the
      // attack novas/waves, in healing green, instead of a lone aura glyph.
      const HEAL_R = 2;
      const healTiles = [];
      for (let dy = -HEAL_R; dy <= HEAL_R; dy += 1) {
        for (let dx = -HEAL_R; dx <= HEAL_R; dx += 1) {
          healTiles.push({ gx: playerState.gridX + dx, gy: playerState.gridY + dy });
        }
      }
      showSpellTileEffect(healTiles, spellFxProfile(spell).color, { kind: 'nova', element: 'healing' });
      if (playerGained > 0) showDrinkEffect(scene, floatingFxCtx, `+${playerGained} HP`, '#60a5fa');
      const allies = aliveAllies();
      let allyHealLog = '';
      for (const ally of allies) {
        const prevHp = ally.hp;
        ally.hp = Math.min(ally.maxHp, ally.hp + heal);
        const gained = ally.hp - prevHp;
        updateCreatureBar(ally);
        showSpellAuraEffect(ally.sprite.x, ally.sprite.y, spell, 0.9);
        if (gained > 0) {
          floatingCombatText(scene, ally.sprite.x, ally.sprite.y - tileSize * 0.65, `+${gained}`, {
            color: '#4ade80', fontSize: '15px',
          });
          allyHealLog += `, ${ally.title} +${gained}`;
        }
      }
      addCombatLog(`Cast [${slotNumber}] ${spell.title}: you +${playerGained} HP${allyHealLog}.`, LOG_COLORS.SPELL);
      updatePlayerBar();
      updateHud();
      return true;
    }
    // ── Heal Friend ──────────────────────────────────────
    if (title === 'heal friend') {
      const allies = aliveAllies();
      if (allies.length === 0) {
        addCombatLog('You have no allies to heal.', LOG_COLORS.SPELL);
        playerState.mana = Math.min(playerState.maxMana, playerState.mana + manaCost);
        updatePlayerBar();
        return true;
      }
      const target = allies.reduce((worst, a) =>
        (a.hp / a.maxHp) < (worst.hp / worst.maxHp) ? a : worst
      );
      const heal = inferHealingAmount(spell);
      const prevHp = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + heal);
      const gained = target.hp - prevHp;
      updateCreatureBar(target);
      showSpellAuraEffect(target.sprite.x, target.sprite.y, spell, 1.1);
      showDrinkEffect(scene, floatingFxCtx, `+${gained} HP`, '#4ade80');
      floatingCombatText(scene, target.sprite.x, target.sprite.y - tileSize * 0.65, `+${gained}`, {
        color: '#4ade80', fontSize: '17px',
      });
      addCombatLog(`Cast [${slotNumber}] ${spell.title}: healed ${target.title} for ${gained} HP.`, LOG_COLORS.SPELL);
      updatePlayerBar();
      updateHud();
      return true;
    }
    if (title === 'cure poison') {
      showSpellAuraEffect(player.x, player.y, spell, 1.0);
      if (playerState.poisonState) {
        playerState.poisonState = null;
        setPoisonIndicator(false);
        showPlayerCureEffect();
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: poison removed.`, LOG_COLORS.SPELL);
      } else {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: no poison to cure.`, LOG_COLORS.SPELL);
      }
    } else if (group === 'healing' || title.includes('healing') || title.includes('exura')) {
      const heal = inferHealingAmount(spell);
      const prev = playerState.hp;
      playerState.hp = Math.min(playerState.maxHp, playerState.hp + heal);
      const gained = Math.max(0, playerState.hp - prev);
      addCombatLog(`Cast [${slotNumber}] ${spell.title}: +${gained} HP.`, LOG_COLORS.SPELL);
      showSpellAuraEffect(player.x, player.y, spell, 1.1);
      showDrinkEffect(scene, floatingFxCtx, `+${gained} HP`, '#60a5fa');
    } else if (group === 'attack') {
      if (castPatternAttackSpell(spell, slotNumber)) {
        updatePlayerBar();
        updateHud();
        return true;
      }
      const target = findNearestRangedTarget(inferSpellRange(spell));
      if (!target) {
        const front = frontSingleTile();
        const frontTarget = isWalkableTile(front.gx, front.gy) ? enemyCreatureAt(front.gx, front.gy) : null;
        if (!frontTarget) {
          showSpellAuraEffect(player.x, player.y, spell, 0.8);
          addCombatLog(`Cast [${slotNumber}] ${spell.title}, but no target in range.`, LOG_COLORS.SPELL);
        } else {
          showSpellTileEffect([front], spellFxProfile(spell).color, { duration: 220 });
          const crit = didAttackCrit();
          const base = inferClassAdjustedSpellDamage(spell, { area: false });
          const dmgRaw = crit ? applyCriticalDamage(base) : base;
          const spellElem = inferSpellDamageElementKey(spell);
          const dmgBase = applyIncomingElementalDamage(dmgRaw, frontTarget, spellElem);
          const dmg = playerState.godMode ? Math.max(1, Number(frontTarget.hp || 1)) : dmgBase;
          frontTarget.hp = Math.max(0, frontTarget.hp - dmg);
          showCreatureHitEffect(frontTarget, dmg);
          if (crit) showCritText(frontTarget.sprite.x, frontTarget.sprite.y);
          addCombatLog(`${spell.title} hits ${frontTarget.title} for ${dmg}.`, LOG_COLORS.SPELL);
          if (frontTarget.hp <= 0) {
            frontTarget.alive = false;
            playCreatureDeathEffect(frontTarget);
            updateCreatureBar(frontTarget);
            grantPlayerXp(effectiveXpFromCreature(frontTarget));
            addCombatLog(`${frontTarget.title} dies from ${spell.title}.`);
            killSummonsOf(frontTarget);
          }
        }
      } else if (didAttackMiss()) {
        if (title.includes('ethereal spear')) {
          showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
        } else {
          showSpellProjectileEffect(spell, target);
        }
        showMissSmoke(target.sprite.x, target.sprite.y);
        addCombatLog(`Your ${spell.title} misses ${target.title}.`, LOG_COLORS.SPELL);
      } else {
        if (title.includes('ethereal spear')) {
          showRangedProjectileEffect({ title: 'Ethereal Spear', type_secondary: 'Throwing Weapons' }, target);
          showSpellAuraEffect(target.sprite.x, target.sprite.y, spell, 0.9);
        } else {
          showSpellProjectileEffect(spell, target);
        }
        const crit = didAttackCrit();
        const base = inferClassAdjustedSpellDamage(spell, { area: false });
        const dmgRaw = crit ? applyCriticalDamage(base) : base;
        const spellElem = inferSpellDamageElementKey(spell);
        const dmgBase = applyIncomingElementalDamage(dmgRaw, target, spellElem);
        const dmg = playerState.godMode ? Math.max(1, Number(target.hp || 1)) : dmgBase;
        target.hp = Math.max(0, target.hp - dmg);
        showCreatureHitEffect(target, dmg);
        if (crit) showCritText(target.sprite.x, target.sprite.y);
        addCombatLog(`${spell.title} hits ${target.title} for ${dmg}.`, LOG_COLORS.SPELL);
        if (target.hp <= 0) {
          target.alive = false;
          playCreatureDeathEffect(target);
          updateCreatureBar(target);
          grantPlayerXp(effectiveXpFromCreature(target));
          playerState.runKills += 1;
          addCombatLog(`${target.title} dies from ${spell.title}.`);
          killSummonsOf(target);
        }
      }
    } else {
      const effect = String((spell.raw && spell.raw.effect) || '').toLowerCase();
      const articleIdNum = Number(spell.article_id);
      // Illumination spells: 5-min light with linear decay handled by atmosphere.
      const LIGHT_SPELL_RADII = { 797: 3, 805: 4, 1952: 6 };
      const lightRadius = LIGHT_SPELL_RADII[articleIdNum];
      showSpellAuraEffect(player.x, player.y, spell, 1.0);
      if (lightRadius) {
        floorAtmosphere.addLightSpell(articleIdNum, lightRadius, 5 * 60 * 1000);
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: illumination radius ${lightRadius} tiles (5 min, fading).`, LOG_COLORS.SPELL);
      } else if (effect.includes('speed')) {
        playerState.moveDurationMs = Math.max(90, playerState.moveDurationMs - 20);
        playerState.actionDelayMs = Math.max(150, playerState.actionDelayMs - 30);
        scene.time.delayedCall(10000, () => updatePlayerTimingsByLevel());
        addCombatLog(`Cast [${slotNumber}] ${spell.title}: speed boosted.`, LOG_COLORS.SPELL);
      } else {
        addCombatLog(`Cast [${slotNumber}] ${spell.title}.`, LOG_COLORS.SPELL);
      }
    }
    updatePlayerBar();
    updateHud();
    return true;
  }

  return { spellAttackPattern, castPatternAttackSpell, castLearnedSpell };
}
