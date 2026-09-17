const profile = (Common, Uncommon, Rare, Legendary) => Object.freeze({
  Common, Uncommon, Rare, Legendary
});

export const BASELINE_SPECIES_PROBABILITY_CAPS = Object.freeze({
  Common: .15,
  Uncommon: .10,
  Rare: .05,
  Legendary: .025
});

export const WATER_RARITY_PROFILES = Object.freeze({
  lower: profile(.65, .26, .07, .02),
  middle: profile(.45, .30, .18, .07),
  upper: profile(.20, .30, .35, .15),
  summit: profile(0, .15, .55, .30),
  cave: profile(.10, .30, .40, .20),
  'summit-cave': profile(.10, .20, .45, .25),
  cloudstep: profile(.10, .25, .45, .20),
  waterfall: profile(.50, .25, .20, .05),
  ocean: profile(.62, .20, .11, .07),
  frosthook: profile(.15, .25, .40, .20)
});

const FRESH_SHARED_LEGENDARIES = Object.freeze([
  'abaia', 'ahuizotl', 'arapaima', 'axolotl', 'beluga-sturgeon', 'blind-cave-eel',
  'bunyip', 'electric-eel', 'lake-sturgeon', 'lernaean_hydra', 'muskellunge', 'paddlefish'
]);

const CAVE_RARES = Object.freeze([
  'cave-tetra', 'burbot', 'american-eel', 'tadpole-shrimp',
  'undine', 'arctic-grayling', 'lake-trout', 'tiger-trout'
]);

const CAVE_LEGENDARIES = Object.freeze([
  'abaia', 'axolotl', 'blind-cave-eel', 'beluga-sturgeon',
  'lake-sturgeon', 'lernaean_hydra', 'muskellunge', 'paddlefish'
]);

const HIGH_RARES = Object.freeze([
  'cutthroat-trout', 'burbot', 'northern-pike', 'lake-trout', 'arctic-grayling',
  'golden-trout', 'splake', 'tiger-trout', 'silver-salmon', 'undine',
  'naiad', 'tadpole-shrimp', 'nokken', 'taniwha'
]);

const COLD_OCEAN_RARES = Object.freeze([
  'blue-ice-codling', 'frostglass-shrimp', 'qallupilluk', 'walrus',
  'beluga-whale', 'harbor-seal', 'blue-shark', 'giant_isopod',
  'barreleye', 'anglerfish', 'goblin_shark'
]);

const COLD_OCEAN_LEGENDARIES = Object.freeze([
  'polar_bear', 'narwhal', 'orca', 'blue-whale', 'humpback-whale',
  'jormungandr', 'leviathan', 'oarfish', 'sea-serpent', 'sperm-whale'
]);

// Explicit estuary compatibility. These creatures retain their fresh/salt homes while
// also being valid in the one authored brackish lagoon.
export const BRACKISH_COMPATIBLE_SPECIES = Object.freeze(new Set([
  'amber-killifish', 'copper-tadpolefish', 'anchovy', 'archerfish', 'blue-crab',
  'flounder', 'mudskipper', 'oyster-toadfish', 'striped-mullet', 'tidepool-sculpin',
  'bottlenose-dolphin', 'broadclub-cuttlefish', 'leafy_seadragon', 'manatee',
  'needlefish', 'pufferfish', 'red-snapper', 'sandbar-shark', 'stonefish',
  'bunyip', 'giant_panda', 'mermaid', 'smalltooth_sawfish', 'thornback-ray'
]));

const config = (rarityProfile, additions = [], options = {}) => Object.freeze({
  rarityProfile,
  additions: Object.freeze([...new Set(additions)]),
  exclusions: Object.freeze([...(options.exclusions ?? [])]),
  speciesWeights: Object.freeze({ ...(options.speciesWeights ?? {}) })
});

export const WATER_ECOLOGY_CONFIG = Object.freeze({
  'hearthward-pond': config(WATER_RARITY_PROFILES.lower, ['pumpkinseed']),
  'amber-reed-pond': config(WATER_RARITY_PROFILES.lower),

  'basalt-grotto': config(WATER_RARITY_PROFILES.cave, [
    'freshwater-shrimp', 'freshwater-mussel', 'mudpuppy', ...CAVE_RARES, ...CAVE_LEGENDARIES
  ], { speciesWeights: { 'basalt-cave-shrimp': 2.4, 'ashen-cave-snail': .8, 'mottled-sculpin': .32, 'stone-loach': .55 } }),
  'echo-cave-pool': config(WATER_RARITY_PROFILES.cave, [
    'pond-snail', 'freshwater-shrimp', 'freshwater-eel', 'mudpuppy', 'bowfin',
    ...CAVE_RARES, ...CAVE_LEGENDARIES
  ], { speciesWeights: { 'freshwater-eel': 2.3, 'stone-loach': .45, 'mottled-sculpin': .28, 'pallid-cave-crab': 1.8 } }),
  'obsidian-cup': config(WATER_RARITY_PROFILES.cave, [
    'ramshorn-snail', 'freshwater-mussel', 'freshwater-eel', 'mudpuppy',
    ...CAVE_RARES, ...CAVE_LEGENDARIES
  ], { speciesWeights: { 'emberless-tetra': 2.5, 'stone-loach': .5, 'mottled-sculpin': .3, 'american-eel': 1.4 } }),
  'high-cirque-tarn': config(WATER_RARITY_PROFILES.cave, [
    'brook-trout', 'brown-trout', 'mountain-whitefish', 'kokanee-salmon',
    'walleye', 'bowfin', ...HIGH_RARES, ...CAVE_LEGENDARIES
  ], { exclusions: ['nokken', 'rainbow-trout', 'freshwater-eel', 'stone-loach', 'mudpuppy'], speciesWeights: { 'snowmelt-loach': 2.6, 'mountain-whitefish': .25, 'mottled-sculpin': .28, 'cirque-salamander': 1.8 } }),
  'crown-vault': config(WATER_RARITY_PROFILES['summit-cave'], [
    ...FRESH_SHARED_LEGENDARIES
  ], { speciesWeights: { 'alpine-mudpuppy': 2.1, 'rimefin-wisp': 2.2, 'mottled-sculpin': .25, 'stone-loach': .45 } }),

  'cloudstep-lake': config(WATER_RARITY_PROFILES.cloudstep, [
    'brook-trout', 'brown-trout', 'rainbow-trout', 'mountain-whitefish', 'kokanee-salmon',
    ...HIGH_RARES, ...FRESH_SHARED_LEGENDARIES
  ], { speciesWeights: { 'cloudstep-salmon': 2.4, 'frost-wyrm': 1.8, nokken: .35, taniwha: .7 } }),
  'hidden-ridge-pool': config(profile(.15, .30, .40, .15), [
    'rainbow-trout', 'mountain-whitefish', ...HIGH_RARES, ...FRESH_SHARED_LEGENDARIES
  ], { exclusions: ['nokken'], speciesWeights: { 'hidden-ridge-newt': 2.4, 'baikal-seal': 2.1, 'diving-beetle': 1.6 } }),
  'blue-ice-melt': config(WATER_RARITY_PROFILES.frosthook, [
    ...HIGH_RARES, ...FRESH_SHARED_LEGENDARIES
  ], { exclusions: ['nokken'], speciesWeights: { 'arctic-char': 2.5, 'dolly-varden': 1.8, 'glacier-snail': 1.6, taniwha: .5 } }),
  'crooked-peak-tarn': config(WATER_RARITY_PROFILES.summit, [
    ...FRESH_SHARED_LEGENDARIES
  ], { speciesWeights: { 'summit-water-dragon': 2.4, 'fairy-shrimp': 1.7, 'peaklight-koi': 1.6 } }),

  'fallglass-cascade': config(WATER_RARITY_PROFILES.waterfall, [
    'rainbow-trout', 'mountain-whitefish', 'arctic-grayling', 'silver-salmon'
  ], { speciesWeights: { 'cascade-goby': 1.9, 'plungepool-crab': 1.8, 'smallmouth-bass': .55 } }),

  'frosthook-cold-ocean': config(WATER_RARITY_PROFILES.frosthook, [
    'atlantic-herring', 'haddock', 'pollock', 'atlantic-cod', 'harbor-seal', 'harbor-porpoise',
    ...COLD_OCEAN_RARES, ...COLD_OCEAN_LEGENDARIES
  ], { speciesWeights: { penguin: 2.2, haddock: .25, 'blue-ice-codling': 1.8, polar_bear: 1.7 } }),
  'bluewater-reach-water': config(WATER_RARITY_PROFILES.ocean, [], {
    speciesWeights: { sardine: .36, anchovy: .55, 'yellowfin_tuna': 1.9, sailfish: 1.8, 'blue-marlin': 1.45, 'moonwake-squid': 1.4 }
  }),
  'outer-ocean': config(WATER_RARITY_PROFILES.ocean, [], {
    speciesWeights: { sardine: .82, 'sand-lance': 1.12, 'atlantic-herring': 1.04 }
  }),
  'split-rock-pool': config(WATER_RARITY_PROFILES.middle, [], { exclusions: ['stone-loach'] })
});

export function ecologyConfigForWater(waterId, habitat = {}) {
  const explicit = WATER_ECOLOGY_CONFIG[waterId];
  if (explicit) return explicit;
  const rarityProfile = habitat.waterfall ? WATER_RARITY_PROFILES.waterfall
    : habitat.cave ? WATER_RARITY_PROFILES.cave
      : WATER_RARITY_PROFILES[habitat.rarityTier] ?? WATER_RARITY_PROFILES[habitat.tier]
        ?? WATER_RARITY_PROFILES.lower;
  return config(rarityProfile);
}
