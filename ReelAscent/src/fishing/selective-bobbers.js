export const BOBBER_RARITIES = Object.freeze(['Common', 'Uncommon', 'Rare', 'Legendary']);
// These are retention chances applied to an already-generated potential bite. They are
// deliberately NOT replacement rarity tables: water ecology and lure changes happen first.
export const SELECTIVE_BOBBER_SETTINGS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    targetWaitSeconds: 10,
    delayVariance: .5,
    acceptanceByRarity: Object.freeze({ Common: 1, Uncommon: 1, Rare: 1, Legendary: 1 })
  }),
  selective: Object.freeze({
    id: 'selective',
    targetWaitSeconds: 30,
    delayVariance: .25,
    acceptanceByRarity: Object.freeze({
      Common: .06,
      Uncommon: .56,
      Rare: .96,
      Legendary: 1
    })
  }),
  trophy: Object.freeze({
    id: 'trophy',
    targetWaitSeconds: 120,
    delayVariance: .2,
    acceptanceByRarity: Object.freeze({
      Common: 0,
      Uncommon: .05,
      Rare: .82,
      Legendary: 1
    })
  })
});

export const STRONG_BOBBER_REFUSAL_MESSAGES = Object.freeze([
  'The Sentinel has standards.',
  'You brought that bobber… here?',
  'Not every puddle hides a sea monster.',
  'The fish here are doing their best.',
  'You may be overestimating this water.',
  'Maybe try somewhere a little wilder.',
  'That is a lot of bobber for a small pond.',
  'Ambitious. The Sentinel remains unmoved.',
  'Perhaps lower your expectations—or change ponds.',
  'The Sentinel politely declines this assignment.'
]);

export function getSelectiveBobberSettings(mode = 'standard') {
  return SELECTIVE_BOBBER_SETTINGS[mode] ?? SELECTIVE_BOBBER_SETTINGS.standard;
}

export function samplePotentialBiteDelay(randomValue, base = {}) {
  const biteRate = Math.max(0.01, base.biteRate ?? 1);
  const biteDelayMultiplier = Math.max(0, base.biteDelayMultiplier ?? 1);
  const minimum = Math.max(0, base.minimum ?? 5);
  const maximum = Math.max(minimum, base.maximum ?? 15);
  return (minimum + Math.max(0, Math.min(1, Number(randomValue) || 0)) * (maximum - minimum))
    / biteRate * biteDelayMultiplier;
}

export function sampleBobberBiteDelay(settings, randomValue, base = {}) {
  const mode = settings?.id ?? 'standard';
  if (mode === 'standard') return samplePotentialBiteDelay(randomValue, base);
  const biteRate = Math.max(.01, base.biteRate ?? 1);
  const biteDelayMultiplier = Math.max(0, base.biteDelayMultiplier ?? 1);
  const centered = Math.max(0, Math.min(1, Number(randomValue) || 0)) * 2 - 1;
  return settings.targetWaitSeconds
    * (1 + centered * settings.delayVariance)
    / biteRate * biteDelayMultiplier;
}

export function deriveAcceptedBobberProfile(profile, mode = 'standard') {
  const acceptance = deriveBobberAcceptance(profile, mode);
  const weighted = Object.fromEntries(BOBBER_RARITIES.map((rarity) => [
    rarity, Math.max(0, profile?.[rarity] ?? 0) * (acceptance[rarity] ?? 0)
  ]));
  const total = BOBBER_RARITIES.reduce((sum, rarity) => sum + weighted[rarity], 0);
  if (total <= 0) return Object.freeze(Object.fromEntries(BOBBER_RARITIES.map((rarity) => [rarity, 0])));
  return Object.freeze(Object.fromEntries(BOBBER_RARITIES.map((rarity) => [rarity, weighted[rarity] / total])));
}

export function getBobberAcceptance(mode, rarity) {
  return getSelectiveBobberSettings(mode).acceptanceByRarity[rarity] ?? 0;
}

export function deriveBobberAcceptance(profile, mode = 'standard') {
  const settings = getSelectiveBobberSettings(mode);
  return Object.freeze(Object.fromEntries(BOBBER_RARITIES.map((rarity) => [
    rarity, settings.acceptanceByRarity[rarity] ?? 0
  ])));
}

export function expectedAcceptedBites(profile, mode = 'standard', potentialBites = 60) {
  const acceptance = deriveBobberAcceptance(profile, mode);
  const counts = Object.fromEntries(BOBBER_RARITIES.map((rarity) => [
    rarity,
    Math.max(0, profile?.[rarity] ?? 0) * potentialBites
      * (acceptance[rarity] ?? 0)
  ]));
  counts.total = BOBBER_RARITIES.reduce((sum, rarity) => sum + counts[rarity], 0);
  return Object.freeze(counts);
}

export function strongestBobberHasEligibleTarget(eligibleRarities = []) {
  const available = new Set(eligibleRarities);
  return available.has('Uncommon') || available.has('Rare') || available.has('Legendary');
}

export function chooseStrongBobberRefusal(randomValue = Math.random(), previous = null) {
  const choices = STRONG_BOBBER_REFUSAL_MESSAGES.filter((message) => message !== previous);
  const unit = Math.max(0, Math.min(.999999, Number(randomValue) || 0));
  return choices[Math.floor(unit * choices.length)] ?? STRONG_BOBBER_REFUSAL_MESSAGES[0];
}
