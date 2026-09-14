import { resolveSpecies } from '../fishing/fish-data.js';

const RARITY_POINTS = Object.freeze({ common: 0, uncommon: 20, rare: 40, legendary: 60 });
const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function scoreBestCatch(specimen = {}) {
  const species = resolveSpecies(specimen.speciesId);
  const lengthRange = Math.max(.01, (species?.maxLength ?? 1) - (species?.minLength ?? 0) * .82);
  const weightRange = Math.max(.01, (species?.maxWeight ?? 1) - (species?.minWeight ?? 0) * .55);
  const lengthPerformance = specimen.sizeFraction != null && Number.isFinite(Number(specimen.sizeFraction))
    ? clamp01(Number(specimen.sizeFraction) / 1.65)
    : clamp01((Number(specimen.length) - (species?.minLength ?? 0) * .82) / lengthRange);
  const weightPerformance = specimen.weightFraction != null && Number.isFinite(Number(specimen.weightFraction))
    ? clamp01(Number(specimen.weightFraction) / 1.65)
    : clamp01((Number(specimen.weight) - (species?.minWeight ?? 0) * .55) / weightRange);
  const sizePoints = Math.round((lengthPerformance * .6 + weightPerformance * .4) * 30 * 100) / 100;
  const rarity = String(specimen.rarityLabel ?? specimen.rarity ?? species?.rarity ?? 'Common').toLowerCase();
  return {
    sizePoints,
    score: (RARITY_POINTS[rarity] ?? 0) + sizePoints + (specimen.shiny ? 25 : 0)
  };
}

export function isBetterCatch(candidate, current) {
  if (!current) return true;
  const left = scoreBestCatch(candidate);
  const right = scoreBestCatch(current);
  return left.score > right.score
    || (left.score === right.score && (left.sizePoints > right.sizePoints
      || (left.sizePoints === right.sizePoints && ((Number(candidate.value) || 0) > (Number(current.value) || 0)
        || ((Number(candidate.value) || 0) === (Number(current.value) || 0)
          && (Number(candidate.caughtAt) || 0) < (Number(current.caughtAt) || 0))))));
}
