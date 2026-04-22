// Floor-level creature group picker. Owns the run-scoped shuffle pool +
// recent history so repeated picks stay varied between floors AND between
// runs.
//
// Extracted from game.engine.js Phase 4 (Combat prep). Not a full
// spawner — it only chooses WHICH creature-type group the floor
// inherits; the actual sprite instantiation stays in the engine
// (spawnCreaturesForLevel owns too many tile/room refs).

/**
 * Build the group-picker + a pure pickRandomCreatures helper.
 *
 * @param {{
 *   getTypeProgressionGroups: () => Array<any>,
 * }} deps
 */
export function setupCreatureSpawn(deps) {
  const { getTypeProgressionGroups } = deps;

  // Per-run biases: generated once, shape the whole run's group picks.
  const runStartBias = Phaser.Math.Between(0, 8);
  const runSpreadBias = Phaser.Math.Between(0, 4);
  const runVariantBias = Phaser.Math.Between(0, 1000000);

  // Mutable shuffle state, reset implicitly when the pool empties.
  const recentGroupIndices = [];
  let earlyShufflePool = [];
  let earlyShuffleCursor = 0;

  /**
   * Pick a creature-type group for the given floor level. Mixes:
   * 1. Hard-coded mapping for early levels 4-20 (forcedTypeByLevel).
   * 2. Per-run shuffled pool for levels ≤ 14 (avoids repeats, varies runs).
   * 3. Weighted random around a progression target for level > 14.
   *
   * @param {number} level
   */
  function pickGroupForLevel(level) {
    const typeProgressionGroups = getTypeProgressionGroups();
    if (!typeProgressionGroups.length) return null;
    const forcedTypeByLevel = {
      4: 'trolls',
      5: 'skeletons',
      6: 'humans',
      7: 'dwarves',
      8: 'minotaurs',
      9: 'vampires',
      10: 'outlaws',
      11: 'goblins',
      12: 'dwarves',
      13: 'minotaurs',
      14: 'vampires',
      15: 'arachnids',
      16: 'dragons',
      17: 'orcs',
      18: 'cobra',
      19: 'giants',
      20: 'demons',
    };
    const forcedType = forcedTypeByLevel[Number(level)];
    if (forcedType) {
      const forcedIdx = typeProgressionGroups.findIndex(
        (g) => String((g && g.type_primary) || '').toLowerCase().includes(forcedType)
      );
      if (forcedIdx >= 0) {
        recentGroupIndices.push(forcedIdx);
        if (recentGroupIndices.length > 5) recentGroupIndices.shift();
        return typeProgressionGroups[forcedIdx];
      }
    }
    const n = typeProgressionGroups.length;
    const recentSet = new Set(recentGroupIndices);

    // Early-game rework:
    // - Build a per-run shuffled pool from easier groups.
    // - Iterate without immediate repeats, giving real variation between runs.
    const earlyLevels = 14;
    if (level <= earlyLevels) {
      const phase = (level - 1) / Math.max(1, earlyLevels - 1); // 0..1
      const easyPct = 0.08 + phase * 0.24; // lvl1~8% -> lvl14~32%
      const easyMax = Math.max(2, Math.min(n - 1, Math.floor(n * easyPct)));
      const hpValues = typeProgressionGroups
        .map((g) => Number(g.average_hitpoints || 0))
        .filter((v) => Number.isFinite(v) && v > 0)
        .sort((a, b) => a - b);
      const hpPct = 0.10 + phase * 0.24; // lvl1~10% -> lvl14~34%
      const hpCap = hpValues.length > 0
        ? hpValues[Math.min(hpValues.length - 1, Math.floor((hpValues.length - 1) * hpPct))]
        : Number.POSITIVE_INFINITY;
      if (earlyShufflePool.length === 0) {
        earlyShufflePool = Array.from({ length: easyMax + 1 }, (_, i) => i)
          .filter((idx) => Number(typeProgressionGroups[idx].average_hitpoints || 0) <= hpCap);
        if (earlyShufflePool.length === 0) {
          earlyShufflePool = Array.from({ length: easyMax + 1 }, (_, i) => i);
        }
        const blockA = earlyShufflePool.filter((_, i) => i % 2 === 0);
        const blockB = earlyShufflePool.filter((_, i) => i % 2 === 1);
        Phaser.Utils.Array.Shuffle(blockA);
        Phaser.Utils.Array.Shuffle(blockB);
        earlyShufflePool = (runVariantBias % 2 === 0) ? [...blockA, ...blockB] : [...blockB, ...blockA];
        const offset = (runStartBias + (runVariantBias % Math.max(1, earlyShufflePool.length))) % earlyShufflePool.length;
        earlyShufflePool = earlyShufflePool.slice(offset).concat(earlyShufflePool.slice(0, offset));
        earlyShuffleCursor = 0;
      } else {
        // Growing easy range (as level rises): add new indices + reshuffle softly.
        const missing = [];
        const inPool = new Set(earlyShufflePool);
        for (let i = 0; i <= easyMax; i += 1) {
          if (!inPool.has(i)) missing.push(i);
        }
        const filteredMissing = missing.filter(
          (idx) => Number(typeProgressionGroups[idx].average_hitpoints || 0) <= hpCap
        );
        if (filteredMissing.length > 0) {
          Phaser.Utils.Array.Shuffle(filteredMissing);
          for (const m of filteredMissing) {
            const pos = (runVariantBias + m + earlyShufflePool.length) % (earlyShufflePool.length + 1);
            earlyShufflePool.splice(pos, 0, m);
          }
        }
      }
      let chosen = null;
      const maxTries = earlyShufflePool.length;
      for (let t = 0; t < maxTries; t += 1) {
        const idx = earlyShufflePool[(earlyShuffleCursor + t) % earlyShufflePool.length];
        if (!recentSet.has(idx)) {
          chosen = idx;
          earlyShuffleCursor = (earlyShuffleCursor + t + 1) % earlyShufflePool.length;
          break;
        }
      }
      if (chosen == null) {
        chosen = earlyShufflePool[earlyShuffleCursor % earlyShufflePool.length];
        earlyShuffleCursor = (earlyShuffleCursor + 1) % earlyShufflePool.length;
      }
      recentGroupIndices.push(chosen);
      if (recentGroupIndices.length > 5) recentGroupIndices.shift();
      return typeProgressionGroups[chosen];
    }

    // Mid/late game: weighted randomness around progression target with broader spread.
    const target = Math.min(n - 1, Math.floor((level - earlyLevels) * 1.45) + runStartBias);
    const radius = Math.max(7 + runSpreadBias, Math.floor(n * 0.28));
    const minIdx = Math.max(0, target - radius);
    const maxIdx = Math.min(n - 1, target + radius);
    let candidates = [];
    for (let i = minIdx; i <= maxIdx; i += 1) {
      if (!recentSet.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = minIdx; i <= maxIdx; i += 1) candidates.push(i);
    }
    const weighted = candidates.map((idx) => {
      const dist = Math.abs(idx - target);
      const randomBoost = 0.65 + Math.random() * 0.7;
      return { idx, w: (1 / (1 + dist)) * randomBoost };
    });
    const totalW = weighted.reduce((acc, x) => acc + x.w, 0);
    let r = Math.random() * totalW;
    let chosen = weighted[weighted.length - 1].idx;
    for (const item of weighted) {
      r -= item.w;
      if (r <= 0) {
        chosen = item.idx;
        break;
      }
    }
    recentGroupIndices.push(chosen);
    if (recentGroupIndices.length > 5) recentGroupIndices.shift();
    return typeProgressionGroups[chosen];
  }

  return { pickGroupForLevel };
}

/**
 * Pure helper: shuffle + pad to exact count. Kept module-level (no state
 * of its own).
 */
export function pickRandomCreatures(pool, count) {
  if (!pool || pool.length === 0) return [];
  const copy = [...pool];
  Phaser.Utils.Array.Shuffle(copy);
  if (copy.length >= count) return copy.slice(0, count);
  const out = [...copy];
  while (out.length < count) out.push(copy[out.length % copy.length]);
  return out;
}
