export const SELECTIVE_BOBBER_SETTINGS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    targetWaitSeconds: null,
    delayVariance: 0,
    acceptanceByRarity: Object.freeze({ Common: 1, Uncommon: 1, Rare: 1, Legendary: 1 })
  }),
  selective: Object.freeze({
    id: 'selective',
    targetWaitSeconds: 30,
    delayVariance: 0.25,
    acceptanceByRarity: Object.freeze({ Common: 0.42, Uncommon: 0.72, Rare: 0.96, Legendary: 1 })
  }),
  trophy: Object.freeze({
    id: 'trophy',
    targetWaitSeconds: 120,
    delayVariance: 0.2,
    acceptanceByRarity: Object.freeze({ Common: 0.08, Uncommon: 0.30, Rare: 0.82, Legendary: 1 })
  })
});

export function getSelectiveBobberSettings(mode = 'standard') {
  return SELECTIVE_BOBBER_SETTINGS[mode] ?? SELECTIVE_BOBBER_SETTINGS.standard;
}

export function sampleBobberBiteDelay(settings, randomValue, base = {}) {
  const biteRate = Math.max(0.01, base.biteRate ?? 1);
  const biteDelayMultiplier = Math.max(0, base.biteDelayMultiplier ?? 1);
  if (Number.isFinite(settings?.targetWaitSeconds)) {
    const centered = Math.max(0, Math.min(1, Number(randomValue) || 0)) * 2 - 1;
    return settings.targetWaitSeconds * (1 + centered * settings.delayVariance)
      / biteRate * biteDelayMultiplier;
  }
  const minimum = Math.max(0, base.minimum ?? 2);
  const maximum = Math.max(minimum, base.maximum ?? 8);
  return (minimum + Math.max(0, Math.min(1, Number(randomValue) || 0)) * (maximum - minimum))
    / biteRate * biteDelayMultiplier;
}
