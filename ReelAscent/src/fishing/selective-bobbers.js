export const BOBBER_RARITIES = Object.freeze(['Common', 'Uncommon', 'Rare', 'Legendary']);
export const BOBBER_TARGET_ACCEPTANCE = Object.freeze({ standard: 1, selective: 1 / 3, trophy: 1 / 12 });

// These are retention chances applied to an already-generated potential bite. They are
// deliberately NOT replacement rarity tables: water ecology and lure changes happen first.
export const SELECTIVE_BOBBER_SETTINGS = Object.freeze({
  standard: Object.freeze({
    id: 'standard',
    acceptanceByRarity: Object.freeze({ Common: 1, Uncommon: 1, Rare: 1, Legendary: 1 })
  }),
  selective: Object.freeze({
    id: 'selective',
    acceptanceByRarity: Object.freeze({
      Common: 2.2 / 37.2,
      Uncommon: 7 / 12,
      Rare: 1,
      Legendary: 1
    })
  }),
  trophy: Object.freeze({
    id: 'trophy',
    acceptanceByRarity: Object.freeze({
      Common: 0,
      Uncommon: .5 / 12,
      Rare: 2 / 6.6,
      Legendary: 2.5 / 4.2
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

// Compatibility export for older diagnostics. Bobber mode no longer changes the internal
// potential-bite clock; accepted interaction frequency emerges from filtering.
export function sampleBobberBiteDelay(settings, randomValue, base = {}) {
  void settings;
  return samplePotentialBiteDelay(randomValue, base);
}

export function getBobberAcceptance(mode, rarity) {
  return getSelectiveBobberSettings(mode).acceptanceByRarity[rarity] ?? 0;
}

export function deriveBobberAcceptance(profile, mode = 'standard') {
  const settings = getSelectiveBobberSettings(mode);
  const rawAcceptedShare = BOBBER_RARITIES.reduce((sum, rarity) => (
    sum + Math.max(0, profile?.[rarity] ?? 0) * (settings.acceptanceByRarity[rarity] ?? 0)
  ), 0);
  const target = BOBBER_TARGET_ACCEPTANCE[settings.id] ?? 1;
  // Never scale a weak-water filter upward: the Cabin pond's selective bobber should remain
  // exceptionally quiet. Only high-rarity waters are scaled down to cap interruptions.
  const ecologyScale = rawAcceptedShare > target ? target / rawAcceptedShare : 1;
  return Object.freeze(Object.fromEntries(BOBBER_RARITIES.map((rarity) => [
    rarity, (settings.acceptanceByRarity[rarity] ?? 0) * ecologyScale
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
  return available.has('Rare') || available.has('Legendary');
}

export function chooseStrongBobberRefusal(randomValue = Math.random(), previous = null) {
  const choices = STRONG_BOBBER_REFUSAL_MESSAGES.filter((message) => message !== previous);
  const unit = Math.max(0, Math.min(.999999, Number(randomValue) || 0));
  return choices[Math.floor(unit * choices.length)] ?? STRONG_BOBBER_REFUSAL_MESSAGES[0];
}
