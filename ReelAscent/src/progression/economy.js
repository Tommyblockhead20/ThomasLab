const RARITY_BASE_VALUE = Object.freeze({ Common: 8, Uncommon: 20, Rare: 52, Legendary: 150 });
const QUALITY_MULTIPLIER = Object.freeze({ GOOD: 1, GREAT: 1.08, PERFECT: 1.16 });
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function getCatchValueBreakdown(fish = {}) {
  const base = RARITY_BASE_VALUE[fish.rarity] ?? RARITY_BASE_VALUE.Common;
  const sizeScore = clamp(Number(fish.sizeFraction) || .5, .02, 1.65);
  const sizeMultiplier = .68 + sizeScore * .72;
  const condition = clamp(
    (Number(fish.weight) || 1) / Math.max(.01, Number(fish.expectedWeight) || Number(fish.weight) || 1),
    .72,
    1.42
  );
  const conditionMultiplier = .82 + condition * .18;
  const qualityMultiplier = QUALITY_MULTIPLIER[fish.quality] ?? 1;
  const shinyMultiplier = fish.shiny ? 4 : 1;
  return Object.freeze({ base, sizeMultiplier, conditionMultiplier, qualityMultiplier, shinyMultiplier });
}

export function getCatchValue(fish) {
  const value = getCatchValueBreakdown(fish);
  return Math.max(1, Math.round(
    value.base * value.sizeMultiplier * value.conditionMultiplier * value.qualityMultiplier * value.shinyMultiplier
  ));
}
