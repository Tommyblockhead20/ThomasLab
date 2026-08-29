export const CATCH_RARITIES = Object.freeze(['Common', 'Uncommon', 'Rare', 'Legendary']);

export const TIER_RARITY_PROFILES = Object.freeze({
  lower: Object.freeze({ Common: .60, Uncommon: .32, Rare: .06, Legendary: .02 }),
  middle: Object.freeze({ Common: .35, Uncommon: .26, Rare: .27, Legendary: .12 }),
  upper: Object.freeze({ Common: .05, Uncommon: .18, Rare: .64, Legendary: .13 }),
  summit: Object.freeze({ Common: 0, Uncommon: .20, Rare: .45, Legendary: .35 }),
  waterfall: Object.freeze({ Common: .41, Uncommon: .25, Rare: .28, Legendary: .06 }),
  ocean: Object.freeze({ Common: .62, Uncommon: .20, Rare: .11, Legendary: .07 })
});

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function isNonFishCreature(fish) {
  const fishArchetypes = new Set([
    'panfish', 'slender', 'bass', 'carp', 'catfish', 'trout', 'eel', 'flatfish',
    'sculpin', 'shark', 'ray'
  ]);
  return !fishArchetypes.has(fish?.visual?.archetype ?? 'panfish');
}

function profileFromLegacyBias(bias = 0) {
  const t = clamp(bias, 0, 1);
  const lower = TIER_RARITY_PROFILES.lower;
  const upper = TIER_RARITY_PROFILES.upper;
  return Object.fromEntries(CATCH_RARITIES.map((rarity) => [
    rarity,
    lower[rarity] + (upper[rarity] - lower[rarity]) * t
  ]));
}

export function getRarityProfile(modifiers = {}, availableRarities = CATCH_RARITIES) {
  const source = modifiers.rarityProfile
    ?? TIER_RARITY_PROFILES[modifiers.rarityTier]
    ?? profileFromLegacyBias(modifiers.rarityBias);
  const multipliers = {
    Common: 1,
    Uncommon: 1,
    Rare: Math.max(0, modifiers.rareWeightMultiplier ?? 1),
    Legendary: Math.max(0, modifiers.legendaryWeightMultiplier ?? 1)
  };
  const available = new Set(availableRarities);
  const weighted = Object.fromEntries(CATCH_RARITIES.map((rarity) => [
    rarity,
    available.has(rarity) ? Math.max(0, source[rarity] ?? 0) * multipliers[rarity] : 0
  ]));
  const total = Object.values(weighted).reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const fallback = Math.max(1, available.size);
    return Object.freeze(Object.fromEntries(CATCH_RARITIES.map((rarity) => [
      rarity, available.has(rarity) ? 1 / fallback : 0
    ])));
  }
  return Object.freeze(Object.fromEntries(CATCH_RARITIES.map((rarity) => [rarity, weighted[rarity] / total])));
}

function capProbabilityShares(rawWeights, requestedCap = 1) {
  const count = rawWeights.length;
  if (!count) return [];
  const total = rawWeights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return rawWeights.map(() => 1 / count);
  const cap = Math.max(requestedCap, 1 / count);
  const probabilities = Array(count).fill(0);
  const remaining = new Set(rawWeights.map((_, index) => index));
  let mass = 1;
  while (remaining.size) {
    const remainingWeight = [...remaining].reduce((sum, index) => sum + Math.max(0, rawWeights[index]), 0);
    const newlyCapped = [...remaining].filter((index) => (
      remainingWeight > 0 && mass * Math.max(0, rawWeights[index]) / remainingWeight > cap + 1e-9
    ));
    if (!newlyCapped.length) {
      const denominator = Math.max(Number.EPSILON, remainingWeight);
      for (const index of remaining) probabilities[index] = mass * Math.max(0, rawWeights[index]) / denominator;
      break;
    }
    for (const index of newlyCapped) {
      probabilities[index] = cap;
      mass = Math.max(0, mass - cap);
      remaining.delete(index);
    }
  }
  return probabilities;
}

function repeatWeight(fishId, eligibleCount, recentSpeciesIds) {
  if (eligibleCount <= 1) return 1;
  const recentIndex = recentSpeciesIds.indexOf(fishId);
  let result = recentIndex === 0 ? .14 : recentIndex === 1 ? .38 : recentIndex === 2 ? .68 : 1;
  const recentCount = recentSpeciesIds.filter((id) => id === fishId).length;
  if (eligibleCount >= 4 && recentCount >= 2) result *= .04;
  else if (recentCount >= 2) result *= .45;
  return result;
}

export function buildTwoStageProbabilityTable(species, fishIds, modifiers = {}) {
  const ids = new Set(fishIds ?? []);
  const eligible = species.filter((fish) => ids.has(fish.id));
  if (!eligible.length) return [];
  const availableRarities = [...new Set(eligible.map((fish) => fish.rarity))];
  const rarityProfile = getRarityProfile(modifiers, availableRarities);
  const recentSpeciesIds = Array.isArray(modifiers.recentSpeciesIds) ? modifiers.recentSpeciesIds : [];
  const habitatWeights = modifiers.habitatWeights ?? {};
  const maximumFinalShare = clamp(modifiers.maximumSpeciesProbability ?? .25, .01, 1);
  const nonFishMultiplier = Math.max(0, modifiers.nonFishWeightMultiplier ?? 1);
  const entries = [];

  for (const rarity of CATCH_RARITIES) {
    const group = eligible.filter((fish) => fish.rarity === rarity);
    const rarityProbability = rarityProfile[rarity] ?? 0;
    if (!group.length || rarityProbability <= 0) continue;
    const rawWeights = group.map((fish) => {
      const habitatWeight = habitatWeights instanceof Map
        ? habitatWeights.get(fish.id) ?? 1
        : habitatWeights[fish.id] ?? 1;
      return Math.max(.001, fish.catchWeight)
        * Math.max(.001, habitatWeight)
        * repeatWeight(fish.id, eligible.length, recentSpeciesIds)
        * (isNonFishCreature(fish) ? nonFishMultiplier : 1);
    });
    const withinCap = Math.min(1, maximumFinalShare / Math.max(.0001, rarityProbability));
    const withinProbabilities = capProbabilityShares(rawWeights, withinCap);
    group.forEach((fish, index) => {
      const probability = rarityProbability * withinProbabilities[index];
      entries.push(Object.freeze({
        fish,
        rawWeight: rawWeights[index],
        selectionWeight: probability,
        probability,
        rarityProbability,
        withinRarityProbability: withinProbabilities[index]
      }));
    });
  }
  return entries;
}

export function summarizeRarityProbabilities(table) {
  const summary = Object.fromEntries(CATCH_RARITIES.map((rarity) => [rarity, 0]));
  for (const entry of table) summary[entry.fish.rarity] += entry.probability;
  return Object.freeze(summary);
}
