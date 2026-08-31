import { SHINY_CONFIG } from '../config.js';
import { EXPANDED_SPECIES_DEFINITIONS } from './species-expansion.js';
import { buildTwoStageProbabilityTable } from './rarity-selection.js';

export const FISH_SONG_TEMPO_MULTIPLIER = .85;

const ARCHETYPE_PROPORTIONS = Object.freeze({
  panfish: Object.freeze({ lengthScale: .84, depth: 1.24, width: .94, head: 1.02, fin: 1.15, lengthWeightExponent: 3.18 }),
  slender: Object.freeze({ lengthScale: 1.16, depth: .72, width: .68, head: .88, fin: .84, lengthWeightExponent: 2.72 }),
  bass: Object.freeze({ lengthScale: 1.02, depth: .9, width: .84, head: 1.25, fin: 1.08, lengthWeightExponent: 3.05 }),
  carp: Object.freeze({ lengthScale: .94, depth: 1.02, width: 1.08, head: 1.06, fin: .96, lengthWeightExponent: 3.2 }),
  catfish: Object.freeze({ lengthScale: 1.08, depth: .82, width: 1.02, head: 1.2, fin: .82, lengthWeightExponent: 2.92 }),
  trout: Object.freeze({ lengthScale: 1.12, depth: .82, width: .75, head: .96, fin: 1.1, lengthWeightExponent: 3.08 }),
  eel: Object.freeze({ lengthScale: 1.4, depth: .54, width: .62, head: .82, fin: .52, lengthWeightExponent: 2.45 }),
  flatfish: Object.freeze({ lengthScale: .92, depth: .55, width: 1.42, head: .94, fin: .8, lengthWeightExponent: 3.02 }),
  sculpin: Object.freeze({ lengthScale: .82, depth: .94, width: 1.16, head: 1.48, fin: 1.22, lengthWeightExponent: 2.98 }),
  shark: Object.freeze({ lengthScale: 1.18, depth: .68, width: .72, head: 1.02, fin: 1.05, lengthWeightExponent: 2.9 }),
  ray: Object.freeze({ lengthScale: .92, depth: .42, width: 1.46, head: .92, fin: .75, lengthWeightExponent: 2.95 }),
  mammal: Object.freeze({ lengthScale: 1.0, depth: .9, width: .82, head: 1.05, fin: .7, lengthWeightExponent: 2.85 }),
  rodent: Object.freeze({ lengthScale: .96, depth: .98, width: .9, head: 1.08, fin: .66, lengthWeightExponent: 2.9 }),
  otter: Object.freeze({ lengthScale: 1.08, depth: .78, width: .72, head: 1.02, fin: .72, lengthWeightExponent: 2.82 }),
  beaver: Object.freeze({ lengthScale: .98, depth: 1.04, width: .96, head: 1.08, fin: .7, lengthWeightExponent: 2.92 }),
  platypus: Object.freeze({ lengthScale: 1.02, depth: .8, width: .86, head: 1.0, fin: .72, lengthWeightExponent: 2.86 }),
  lusca: Object.freeze({ lengthScale: 1.02, depth: .92, width: .9, head: 1.08, fin: .72, lengthWeightExponent: 2.8 }),
  pinniped: Object.freeze({ lengthScale: 1.08, depth: .82, width: .82, head: .98, fin: .86, lengthWeightExponent: 2.9 }),
  cetacean: Object.freeze({ lengthScale: 1.22, depth: .7, width: .72, head: 1.0, fin: .92, lengthWeightExponent: 2.82 }),
  sirenian: Object.freeze({ lengthScale: 1.02, depth: 1.0, width: .92, head: .96, fin: .8, lengthWeightExponent: 2.95 }),
  turtle: Object.freeze({ lengthScale: .88, depth: .6, width: 1.22, head: .78, fin: .8, lengthWeightExponent: 3.0 }),
  frog: Object.freeze({ lengthScale: .78, depth: .82, width: .94, head: 1.18, fin: .65, lengthWeightExponent: 3.0 }),
  starfish: Object.freeze({ lengthScale: .82, depth: .32, width: 1.2, head: .7, fin: .7, lengthWeightExponent: 3.0 }),
  urchin: Object.freeze({ lengthScale: .62, depth: .84, width: .84, head: .7, fin: .7, lengthWeightExponent: 3.0 }),
  nautilus: Object.freeze({ lengthScale: .72, depth: .92, width: .88, head: .82, fin: .7, lengthWeightExponent: 3.0 }),
  waterhorse: Object.freeze({ lengthScale: 1.08, depth: .9, width: .78, head: 1.1, fin: .72, lengthWeightExponent: 2.9 }),
  serpent: Object.freeze({ lengthScale: 1.48, depth: .46, width: .5, head: .88, fin: .52, lengthWeightExponent: 2.55 }),
  dragon: Object.freeze({ lengthScale: 1.44, depth: .64, width: .66, head: 1.2, fin: .82, lengthWeightExponent: 2.7 }),
  plesiosaur: Object.freeze({ lengthScale: 1.24, depth: .68, width: .74, head: .78, fin: .92, lengthWeightExponent: 2.75 })
});

// The summit pond needs a broad but still believable high-country food web. These shared
// species retain every existing habitat and merely gain the cold summit tarn as one more.
const SUMMIT_COMPATIBLE_SPECIES = new Set([
  // Uncommon / accessible high-country residents
  'rainbow-trout', 'brook-trout', 'mountain-whitefish', 'stone-loach',
  'freshwater-drum', 'brown-trout', 'walleye', 'kokanee-salmon',
  'signal-crayfish', 'freshwater-mussel', 'water-sprite',
  // Rare alpine, cold-water, cave-water, and supernatural residents
  'cutthroat-trout', 'cave-tetra', 'burbot', 'northern-pike', 'lake-trout',
  'arctic-grayling', 'splake', 'american-eel', 'freshwater-eel', 'bowfin',
  'mudpuppy', 'arctic-char', 'dolly-varden', 'tiger-trout', 'alpine-mudpuppy',
  'diving-beetle', 'fairy-shrimp', 'tadpole-shrimp', 'silver-salmon',
  'undine', 'naiad', 'axolotl',
  // Legendary summit payoff
  'alpine-char', 'blind-cave-eel', 'muskellunge', 'golden-trout',
  'lake-sturgeon', 'rimefin-wisp', 'abaia', 'beluga-sturgeon'
]);

// Four formerly shared high-country creatures become true Crooked Peak discoveries in v7.1.
// Together with the four authored Crooked Peak species this produces eight summit exclusives.
const SUMMIT_PROMOTED_EXCLUSIVES = new Set([
  'water-sprite', 'alpine-mudpuppy', 'fairy-shrimp', 'rimefin-wisp'
]);

function speciesVariation(id) {
  const hash = [...id].reduce((value, character) => value + character.charCodeAt(0), 0);
  return ((hash % 9) - 4) * .012;
}

const LEGACY_HABITATS = Object.freeze({
  "bluegill": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","pool","lake"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["fernwater-pond"]}),
  "redear-sunfish": Object.freeze({"salinity":"fresh","tiers":["lower"],"waterTypes":["pond","lake"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["amber-reed-pond"]}),
  "pumpkinseed": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","pool","lake"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["sheltered-mirror"],"waterIds":["fernwater-pond","amber-reed-pond","sheltered-mirror","twilight-basin"]}),
  "yellow-perch": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","lake"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["pineglass-lake"]}),
  "golden-shiner": Object.freeze({"salinity":"fresh","tiers":["lower"],"waterTypes":["pond","pool","lake"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["sheltered-mirror"]}),
  "creek-chub": Object.freeze({"salinity":"fresh","tiers":["lower","middle","waterfall"],"waterTypes":["pool","stream-pool","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["red-river-bend"]}),
  "fathead-minnow": Object.freeze({"salinity":"fresh","tiers":["lower"],"waterTypes":["pond","pool"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["amber-reed-pond"]}),
  "black-crappie": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","lake"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["gull-crag-pond"],"waterIds":["gull-crag-pond","pineglass-lake","mossbell-lake"]}),
  "smallmouth-bass": Object.freeze({"salinity":"fresh","tiers":["lower","middle","waterfall"],"waterTypes":["pool","lake","stream-pool","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["split-rock-pool"]}),
  "largemouth-bass": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","lake"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["fernwater-pond"]}),
  "chain-pickerel": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","lake"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["gull-crag-pond"],"waterIds":["fernwater-pond","gull-crag-pond"]}),
  "common-carp": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","pool","lake"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["sheltered-mirror"],"waterIds":["amber-reed-pond","sheltered-mirror","twilight-basin","split-rock-pool"]}),
  "channel-catfish": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","pool","lake","stream-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["gull-crag-pond"]}),
  "white-sucker": Object.freeze({"salinity":"fresh","tiers":["lower","middle","waterfall"],"waterTypes":["pool","lake","stream-pool","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["redbank-pool"]}),
  "longnose-dace": Object.freeze({"salinity":"fresh","tiers":["lower","middle","waterfall"],"waterTypes":["pool","stream-pool","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["fallglass-cascade"]}),
  "freshwater-drum": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["lake","stream-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["mossbell-lake"]}),
  "rainbow-trout": Object.freeze({"salinity":"fresh","tiers":["middle","upper","summit","waterfall"],"waterTypes":["stream-pool","lake","tarn","ice-pool","summit-pond","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["crooked-peak-tarn"]}),
  "brook-trout": Object.freeze({"salinity":"fresh","tiers":["middle","upper","waterfall"],"waterTypes":["stream-pool","lake","tarn","waterfall-pool"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["cloudstep-lake"]}),
  "cutthroat-trout": Object.freeze({"salinity":"fresh","tiers":["middle","upper","summit","waterfall"],"waterTypes":["stream-pool","lake","tarn","ice-pool","summit-pond","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["hidden-ridge-pool"]}),
  "mountain-whitefish": Object.freeze({"salinity":"fresh","tiers":["middle","upper","waterfall"],"waterTypes":["stream-pool","lake","tarn","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["windcut-tarn"]}),
  "alpine-char": Object.freeze({"salinity":"fresh","tiers":["upper","summit"],"waterTypes":["lake","tarn","ice-pool","cave-tarn","summit-pond"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["blue-ice-melt"]}),
  "stone-loach": Object.freeze({"salinity":"fresh","tiers":["lower","middle","upper"],"waterTypes":["cave-pool","cave-tarn","pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["basalt-grotto"]}),
  "mottled-sculpin": Object.freeze({"salinity":"fresh","tiers":["lower","middle","upper","waterfall"],"waterTypes":["cave-pool","cave-tarn","stream-pool","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["echo-cave-pool"]}),
  "cave-tetra": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["cave-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["obsidian-cup"]}),
  "blind-cave-eel": Object.freeze({"salinity":"fresh","tiers":["lower","middle","upper"],"waterTypes":["cave-pool","cave-tarn"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["obsidian-cup"]}),
  "burbot": Object.freeze({"salinity":"fresh","tiers":["lower","middle","upper"],"waterTypes":["cave-pool","cave-tarn","lake","tarn"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["high-cirque-tarn"]}),
  "sardine": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet","lagoon"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["outer-ocean"]}),
  "anchovy": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet","lagoon","tidepool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["sunwash-tidepool"]}),
  "rainbow-smelt": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["blackstone-inlet"]}),
  "mackerel": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["outer-ocean"]}),
  "flounder": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["inlet","lagoon","ocean"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["boulder-lagoon"]}),
  "sea-bass": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet","lagoon"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["blackstone-inlet"]}),
  "rockfish": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet","lagoon"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["boulder-lagoon"]}),
  "striped-mullet": Object.freeze({"salinity":"salt","tiers":["lower"],"waterTypes":["lagoon","inlet","tidepool"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["boulder-lagoon"]}),
  "tidepool-sculpin": Object.freeze({"salinity":"salt","tiers":["lower"],"waterTypes":["tidepool","inlet"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["sunwash-tidepool"]}),
  "green-sunfish": Object.freeze({"salinity":"fresh","tiers":["lower"],"waterTypes":["pond","pool"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["redbank-pool"]}),
  "rock-bass": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["lake","pool","stream-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["pineglass-lake"]}),
  "bullhead-catfish": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["pond","lake","pool"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["gull-crag-pond"],"waterIds":["fernwater-pond","gull-crag-pond","split-rock-pool"]}),
  "walleye": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["lake","stream-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["pineglass-lake"]}),
  "northern-pike": Object.freeze({"salinity":"fresh","tiers":["lower","middle","upper"],"waterTypes":["lake","pond","tarn"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["windcut-tarn"]}),
  "muskellunge": Object.freeze({"salinity":"fresh","tiers":["lower","middle"],"waterTypes":["lake"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["mossbell-lake"]}),
  "brown-trout": Object.freeze({"salinity":"fresh","tiers":["middle","upper","waterfall"],"waterTypes":["stream-pool","lake","tarn","waterfall-pool"],"themes":["sunwash","fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"fernwood","favoredWaterIds":["red-river-bend"]}),
  "lake-trout": Object.freeze({"salinity":"fresh","tiers":["middle","upper"],"waterTypes":["lake"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["cloudstep-lake"]}),
  "arctic-grayling": Object.freeze({"salinity":"fresh","tiers":["middle","upper","waterfall"],"waterTypes":["stream-pool","tarn","lake","ice-pool","waterfall-pool"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["blue-ice-melt"]}),
  "golden-trout": Object.freeze({"salinity":"fresh","tiers":["upper","summit","waterfall"],"waterTypes":["tarn","lake","summit-pond","waterfall-pool"],"themes":["sunwash"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["crooked-peak-tarn"]}),
  "splake": Object.freeze({"salinity":"fresh","tiers":["middle","upper"],"waterTypes":["lake","tarn"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["cloudstep-lake"]}),
  "lake-sturgeon": Object.freeze({"salinity":"fresh","tiers":["middle"],"waterTypes":["lake","stream-pool"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["mossbell-lake"]}),
  "atlantic-cod": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet"],"themes":["fernwood","blackstone"],"strictWaterTypes":true,"preferredTheme":"blackstone","favoredWaterIds":["outer-ocean"]}),
  "bluefish": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","inlet","lagoon"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["outer-ocean"]}),
  "red-snapper": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","lagoon"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["boulder-lagoon"]}),
  "needlefish": Object.freeze({"salinity":"salt","tiers":["ocean","lower"],"waterTypes":["ocean","lagoon","tidepool"],"themes":["sunwash","fernwood"],"strictWaterTypes":true,"preferredTheme":"sunwash","favoredWaterIds":["sunwash-tidepool"]}),
});

const LEGACY_RARITY_OVERRIDES = Object.freeze({
  "bluegill": "Common",
  "redear-sunfish": "Common",
  "pumpkinseed": "Common",
  "yellow-perch": "Common",
  "golden-shiner": "Common",
  "creek-chub": "Common",
  "fathead-minnow": "Common",
  "black-crappie": "Uncommon",
  "smallmouth-bass": "Uncommon",
  "largemouth-bass": "Uncommon",
  "chain-pickerel": "Uncommon",
  "common-carp": "Common",
  "channel-catfish": "Uncommon",
  "white-sucker": "Common",
  "longnose-dace": "Common",
  "freshwater-drum": "Uncommon",
  "rainbow-trout": "Uncommon",
  "brook-trout": "Uncommon",
  "cutthroat-trout": "Rare",
  "mountain-whitefish": "Uncommon",
  "alpine-char": "Rare",
  "stone-loach": "Uncommon",
  "mottled-sculpin": "Common",
  "cave-tetra": "Rare",
  "blind-cave-eel": "Legendary",
  "burbot": "Rare",
  "sardine": "Common",
  "anchovy": "Common",
  "rainbow-smelt": "Common",
  "mackerel": "Common",
  "flounder": "Uncommon",
  "sea-bass": "Uncommon",
  "rockfish": "Uncommon",
  "striped-mullet": "Common",
  "tidepool-sculpin": "Uncommon",
  "green-sunfish": "Common",
  "rock-bass": "Uncommon",
  "bullhead-catfish": "Uncommon",
  "walleye": "Uncommon",
  "northern-pike": "Rare",
  "muskellunge": "Legendary",
  "brown-trout": "Common",
  "lake-trout": "Rare",
  "arctic-grayling": "Rare",
  "golden-trout": "Rare",
  "splake": "Rare",
  "lake-sturgeon": "Legendary",
  "atlantic-cod": "Uncommon",
  "bluefish": "Uncommon",
  "red-snapper": "Rare",
  "needlefish": "Rare",
  "cascade-goby": "Common",
  "glacier-snail": "Common",
  "rust-crayfish": "Uncommon",
  "bowfin": "Uncommon",
  "mudpuppy": "Uncommon",
  "american-lobster": "Uncommon",
  "red-river-gar": "Uncommon",
  "emberless-tetra": "Uncommon",
  "sailfish": "Legendary",
  "hammerhead-shark": "Legendary",
  "manta-ray": "Legendary",
  "giant-pacific-octopus": "Legendary",
  "japanese-spider-crab": "Legendary",
  "coelacanth": "Legendary",
  "electric-eel": "Legendary",
  "ocean-sunfish": "Legendary",
  "mantis-shrimp": "Legendary",
  "axolotl": "Legendary",
  "great_barracuda": "Rare",
  "chambered-nautilus": "Rare",
  "pufferfish": "Rare",
  "summit-glassfish": "Uncommon",
  "bluewater-bonnet-shark": "Rare",
  "sandbar-shark": "Rare",
  "blue-shark": "Rare",
  "blue-ice-codling": "Rare",
  "cirque-salamander": "Rare",
  "pallid-cave-crab": "Rare",
  "arctic-char": "Uncommon",
  "dolly-varden": "Uncommon",
  "snowmelt-loach": "Uncommon",
});

function legacyHabitatFor(id) {
  return LEGACY_HABITATS[id] ?? { salinity: 'fresh', tiers: ['lower'], waterTypes: ['pond'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true };
}

function resolvedHabitatFor(id, authoredHabitat) {
  const habitat = authoredHabitat ?? legacyHabitatFor(id);
  if (id === 'penguin') {
    return Object.freeze({
      ...habitat,
      salinity: 'both',
      tiers: Object.freeze(['upper']),
      waterTypes: Object.freeze(['ice-pool']),
      waterIds: Object.freeze(['blue-ice-melt']),
      favoredWaterIds: Object.freeze(['blue-ice-melt']),
      exclusiveWaterId: 'blue-ice-melt',
      exclusive: true
    });
  }
  if (SUMMIT_PROMOTED_EXCLUSIVES.has(id)) {
    return Object.freeze({
      ...habitat,
      tiers: Object.freeze(['summit']),
      waterTypes: Object.freeze(['summit-pond']),
      themes: Object.freeze(['sunwash', 'fernwood', 'blackstone']),
      waterIds: Object.freeze(['crooked-peak-tarn']),
      favoredWaterIds: Object.freeze(['crooked-peak-tarn']),
      exclusiveWaterId: 'crooked-peak-tarn',
      exclusive: true
    });
  }
  if (!SUMMIT_COMPATIBLE_SPECIES.has(id) || habitat.exclusiveWaterId) {
    return Object.freeze({ ...habitat, exclusive: Boolean(authoredHabitat?.exclusive) });
  }
  return Object.freeze({
    ...habitat,
    tiers: Object.freeze([...new Set([...(habitat.tiers ?? []), 'summit'])]),
    waterTypes: Object.freeze([...new Set([...(habitat.waterTypes ?? []), 'summit-pond'])]),
    themes: Object.freeze([...new Set(habitat.themes ?? ['sunwash', 'fernwood', 'blackstone'])]),
    exclusive: false
  });
}

function motifComplexity(motifs) {
  const source = motifs?.[0] ?? '';
  let notes = 0; let chordExtra = 0; let holdLevels = 0; let restSteps = 0;
  for (const token of source.trim().split(/\s+/)) {
    if (!token) continue;
    if (/^-+$/.test(token)) { restSteps += token.length; continue; }
    const parts = token.split('+').filter(Boolean);
    notes += parts.length; chordExtra += Math.max(0, parts.length - 1);
    for (const part of parts) holdLevels += (part.match(/~/g) ?? []).length;
  }
  return { notes, chordExtra, holdLevels, restSteps };
}

function normalizedSongSettings(rarity, sourceBpm, motifs, sourceDifficulty) {
  const stats = motifComplexity(motifs);
  const targetCenter = ({ Common: 82.5, Uncommon: 87.5, Rare: 92.5, Legendary: 97.5 })[rarity] ?? 90;
  const targetNotes = ({ Common: 7, Uncommon: 11, Rare: 15, Legendary: 19 })[rarity] ?? 11;
  const limits = ({ Common: [77, 89], Uncommon: [82, 94], Rare: [87, 99], Legendary: [92, 104] })[rarity] ?? [82, 98];
  const sourceActualCenter = ((sourceBpm?.[0] ?? 100) + (sourceBpm?.[1] ?? 110)) * .5 * FISH_SONG_TEMPO_MULTIPLIER;
  const character = Math.max(-2.8, Math.min(2.8, (sourceActualCenter - targetCenter) * .28));
  const notePenalty = Math.max(0, stats.notes - targetNotes) * .55;
  const complexityPenalty = stats.chordExtra * .9 + stats.holdLevels * .42;
  const pauseRelief = Math.min(2.2, stats.restSteps * .16);
  const actualCenter = Math.max(limits[0], Math.min(limits[1], targetCenter + character - notePenalty - complexityPenalty + pauseRelief));
  const rawSpan = Math.max(6, Math.min(10, ((sourceBpm?.[1] ?? 110) - (sourceBpm?.[0] ?? 100)) * FISH_SONG_TEMPO_MULTIPLIER));
  const authoredCenter = actualCenter / FISH_SONG_TEMPO_MULTIPLIER;
  const authoredSpan = rawSpan / FISH_SONG_TEMPO_MULTIPLIER;
  const authoredBpm = [Math.round(authoredCenter - authoredSpan / 2), Math.round(authoredCenter + authoredSpan / 2)];
  const bpm = authoredBpm.map((value) => Math.max(1, Math.round(value * FISH_SONG_TEMPO_MULTIPLIER)));
  const baseDifficulty = ({ Common: .16, Uncommon: .39, Rare: .64, Legendary: .85 })[rarity] ?? .5;
  const loadTarget = targetNotes + ({ Common: 0, Uncommon: .7, Rare: 2.2, Legendary: 4.5 })[rarity];
  const load = stats.notes + stats.chordExtra * 1.4 + stats.holdLevels * .65 - Math.min(2, stats.restSteps * .15);
  const loadDelta = (load - loadTarget) / Math.max(4, loadTarget);
  const difficulty = Math.max(baseDifficulty - .07, Math.min(baseDifficulty + .07, baseDifficulty - loadDelta * .09 + (sourceDifficulty - baseDifficulty) * .12));
  return { bpm, authoredBpm, difficulty, stats };
}


function species(id, name, rarity, catchWeight, length, weight, archetype, colors, instrument, root, bpm, motifs, difficulty, flavor, habitat = null) {
  const resolvedRarity = LEGACY_RARITY_OVERRIDES[id] ?? rarity;
  const resolvedCatchWeight = resolvedRarity === rarity ? catchWeight : ({ Common: 12, Uncommon: 8, Rare: 4, Legendary: 1.8 })[resolvedRarity];
  const songSettings = normalizedSongSettings(resolvedRarity, bpm, motifs, difficulty);
  const base = ARCHETYPE_PROPORTIONS[archetype] ?? ARCHETYPE_PROPORTIONS.trout;
  const variation = speciesVariation(id);
  const sizeModel = Object.freeze({
    typicalLength: Object.freeze([...length]),
    typicalWeight: Object.freeze([...weight]),
    lengthWeightExponent: base.lengthWeightExponent + variation * 2,
    lengthScale: base.lengthScale + variation,
    depth: base.depth - variation,
    width: base.width + variation * .7,
    head: base.head + variation * .8,
    fin: base.fin - variation * .5
  });
  const slowedBpm = songSettings.bpm;
  const rhythm = {
    instrument,
    root,
    bpm: slowedBpm,
    authoredBpm: [...songSettings.authoredBpm],
    sourceAuthoredBpm: [...bpm],
    tempoMultiplier: FISH_SONG_TEMPO_MULTIPLIER,
    motifs,
    timingTolerance: 1.18 - songSettings.difficulty * 0.35,
    escapeTolerance: 1,
    difficulty: songSettings.difficulty
  };
  const motifLengths = motifs.map((motif) => motif.split(/\s+/).reduce((count, token) => {
    if (!token || /^-+$/.test(token)) return count;
    return count + token.split('+').filter(Boolean).length;
  }, 0));
  // Kept as derived metadata for debug tooling; the authored motifs remain the source of truth.
  rhythm.inputs = [Math.min(...motifLengths), Math.max(...motifLengths)];
  return {
    id, name, rarity: resolvedRarity, rarityLabel: resolvedRarity, catchWeight: resolvedCatchWeight,
    minLength: length[0], maxLength: length[1],
    minWeight: weight[0], maxWeight: weight[1],
    sizeModel,
    visual: {
      archetype,
      colors,
      lengthScale: sizeModel.lengthScale,
      depth: sizeModel.depth,
      width: sizeModel.width,
      head: sizeModel.head,
      fin: sizeModel.fin
    },
    rhythm,
    flavor,
    habitat: resolvedHabitatFor(id, habitat)
  };
}

const SPECIES = [
  species('bluegill', 'Bluegill', 'Common', 18, [4.5, 11.5], [.12, 1.8], 'panfish', [[.22, .48, .58], [.82, .63, .25]], 'kalimba', 55, [76, 86], ['A A S W D A -- A W'], .08, 'A bright little scrapper from sunny shallows.'),
  species('redear-sunfish', 'Redear Sunfish', 'Common', 14, [5, 12], [.15, 2.1], 'panfish', [[.4, .55, .3], [.88, .48, .22]], 'marimba', 58, [80, 94], ['A1 A2 W1 S1 W2 S2 D1 -- S1 W2 A2'], .14, 'A warm-water sunfish with a bright red ear flap and a bouncy little tune.'),
  species('pumpkinseed', 'Pumpkinseed', 'Common', 16, [4, 10], [.1, 1.1], 'panfish', [[.32, .55, .4], [.92, .45, .18]], 'marimba', 57, [78, 90], ['S A+W D S A -- A S'], .1, 'Copper-bright and much bolder than it looks.'),
  species('yellow-perch', 'Yellow Perch', 'Common', 15, [6, 15], [.2, 2.7], 'slender', [[.78, .64, .2], [.22, .3, .2]], 'mandolin', 59, [86, 98], ['A A A S W D S -- S'], .18, 'Striped gold with a quick rattle at the line.'),
  species('golden-shiner', 'Golden Shiner', 'Common', 14, [5, 13], [.15, 1.6], 'slender', [[.8, .68, .2], [.95, .86, .45]], 'glockenspiel', 62, [94, 108], ['A S W+D W S -- S W'], .22, 'A flicker of pond-light with sudden turns.'),
  species('creek-chub', 'Creek Chub', 'Common', 13, [4, 12], [.1, 1.3], 'slender', [[.42, .5, .44], [.76, .68, .4]], 'harmonica', 53, [82, 96], ['A W S A A D S -- S'], .18, 'A creekside opportunist with a bright flank.'),
  species('fathead-minnow', 'Fathead Minnow', 'Common', 12, [2, 4.5], [.02, .18], 'slender', [[.42, .47, .38], [.74, .67, .42]], 'xylophone', 67, [92, 108], ['A1 W1 A2 W2 S1 W2 A2 -- A1 S1 A2'], .12, 'A tiny pond minnow with a quick toy-box melody.'),
  species('black-crappie', 'Black Crappie', 'Uncommon', 9, [6, 16], [.3, 3.4], 'panfish', [[.24, .31, .29], [.68, .72, .58]], 'xylophone', 55, [88, 103], ['A+S W S D W A -- S W A+D'], .3, 'A speckled shape weaving through drowned timber.'),
  species('smallmouth-bass', 'Smallmouth Bass', 'Uncommon', 9, [8, 21], [.55, 7.2], 'bass', [[.36, .49, .27], [.7, .57, .31]], 'upright_bass_pizz', 50, [96, 112], ['A S W+D W S A -- S A W'], .38, 'A stubborn bronze fighter that never comes quietly.'),
  species('largemouth-bass', 'Largemouth Bass', 'Uncommon', 8, [9, 25], [.7, 11.5], 'bass', [[.27, .45, .25], [.72, .75, .46]], 'electric_bass', 45, [92, 108], ['A~ - S W D S A~ -- S A W~ - D'], .42, 'A heavy ambusher with one last surge in reserve.'),
  species('chain-pickerel', 'Chain Pickerel', 'Uncommon', 7, [10, 24], [.5, 4.8], 'slender', [[.25, .43, .23], [.7, .68, .36]], 'mandolin', 60, [106, 124], ['D1 W2 A1 S2 W1 D2 A2 -- W2 D1 S1'], .44, 'A chain-patterned ambusher with a sharp, skipping melody.'),
  species('common-carp', 'Common Carp', 'Rare', 4, [12, 35], [2.2, 28], 'carp', [[.55, .38, .2], [.82, .64, .28]], 'tuba', 43, [78, 92], ['A~~+D~ - S W - D S A -- S~+W~~ - A D - W S'], .5, 'Old bronze muscle built for long patient runs.'),
  species('channel-catfish', 'Channel Catfish', 'Legendary', 2, [14, 39], [2.8, 32], 'catfish', [[.2, .34, .35], [.48, .56, .46]], 'contrabassoon', 41, [88, 106], ['A~~+D~~ - S W S~~~+A~~ - W D -- S~+W~~~ - A D W~~+D~ - S A'], .72, 'A deep-water shadow with weight behind every pull.'),
  species('white-sucker', 'White Sucker', 'Common', 12, [7, 20], [.35, 5.5], 'carp', [[.44, .48, .39], [.74, .7, .52]], 'bassoon', 48, [80, 94], ['A S S S W D A -- S'], .22, 'A steady river grazer with tireless shoulders.'),
  species('longnose-dace', 'Longnose Dace', 'Common', 12, [3, 8], [.05, .5], 'slender', [[.38, .42, .39], [.74, .5, .28]], 'xylophone', 64, [100, 116], ['A W S D A A W -- S'], .28, 'A tiny current-rider that changes direction instantly.'),
  species('freshwater-drum', 'Freshwater Drum', 'Rare', 4, [10, 28], [1.2, 18], 'carp', [[.52, .57, .57], [.78, .75, .58]], 'handpan', 43, [84, 100], ['A~ S W+D A S~~ W -- S A W~~~ D S W+A'], .55, 'A silver river drum with a deep deliberate pulse.'),
  species('rainbow-trout', 'Rainbow Trout', 'Uncommon', 9, [8, 23], [.45, 8.4], 'trout', [[.46, .66, .62], [.82, .35, .42]], 'flute', 62, [106, 124], ['A1 W1 W2 S1 D1 - S2 D2 S2 W2 - W1 A2 A1'], .46, 'Cold-water color and a fast darting run.'),
  species('brook-trout', 'Brook Trout', 'Uncommon', 8, [6, 18], [.3, 5.8], 'trout', [[.2, .46, .4], [.9, .58, .26]], 'ocarina', 60, [102, 120], ['A W S D S S W A -- S A'], .44, 'Cold-stream color beneath a marbled back.'),
  species('cutthroat-trout', 'Cutthroat Trout', 'Rare', 4, [8, 25], [.55, 9.2], 'trout', [[.44, .62, .52], [.86, .3, .22]], 'oboe', 64, [112, 132], ['A S W+D - W A D S W -- S W A+D'], .66, 'A sharp-turning trout marked by a red slash.'),
  species('mountain-whitefish', 'Mountain Whitefish', 'Rare', 5, [8, 24], [.5, 7.5], 'slender', [[.6, .73, .75], [.82, .88, .84]], 'harp', 57, [96, 114], ['A S W~~ - - D S A+W -- S A W+D~~~ - - W S'], .52, 'A pale high-water traveler with steady resolve.'),
  species('alpine-char', 'Alpine Char', 'Legendary', 2, [10, 30], [.9, 14], 'trout', [[.16, .31, .39], [.92, .38, .2]], 'french_horn', 67, [118, 140], ['A A S W+D - W A S D W+D - D -- S S W A+D'], .86, 'An ember-colored fish from water above the clouds.'),
  species('stone-loach', 'Stone Loach', 'Uncommon', 8, [3.5, 9.5], [.08, .9], 'catfish', [[.28, .3, .25], [.57, .48, .3]], 'bass_clarinet', 50, [92, 108], ['A S W A D S W -- S A W'], .4, 'A cave-pool skitterer that hugs the stones.'),
  species('mottled-sculpin', 'Mottled Sculpin', 'Common', 11, [3, 7], [.05, .45], 'sculpin', [[.33, .39, .3], [.65, .52, .34]], 'cor_anglais', 48, [78, 92], ['A1 A2 W1 A1 S1 W2 A2 -- S1 A1'], .14, 'A tiny stone-colored bottom dweller with a woodsy little call.'),
  species('cave-tetra', 'Cave Tetra', 'Rare', 5, [3, 8], [.05, .55], 'panfish', [[.65, .61, .58], [.9, .74, .62]], 'clarinet', 64, [108, 126], ['A W S D W A D S -- S D A W D'], .58, 'A pale spark in the mountain dark.'),
  species('blind-cave-eel', 'Blind Cave Eel', 'Legendary', 2, [11, 31], [.7, 10], 'eel', [[.58, .48, .52], [.88, .75, .68]], 'contrabassoon', 40, [86, 104], ['A~~+D~ - S W - D~~~ S A W -- S~+W~~ - A D - S~~ W A D'], .76, 'A silent ribbon that pulls from unseen cracks.'),
  species('burbot', 'Burbot', 'Rare', 4, [12, 30], [1.1, 16], 'eel', [[.25, .32, .26], [.58, .52, .33]], 'bassoon', 43, [82, 100], ['A S~ W D - A W~~ S D -- S A W~~~ D - S'], .62, 'A cold-water coil with a stubborn rolling fight.'),
  species('sardine', 'Sardine', 'Common', 17, [5, 10], [.08, .35], 'slender', [[.48, .7, .75], [.86, .9, .78]], 'glockenspiel', 62, [94, 108], ['A S W D A A S -- S'], .16, 'A small ocean flash moving like quicksilver.'),
  species('anchovy', 'Anchovy', 'Common', 16, [4, 8], [.04, .2], 'slender', [[.35, .58, .7], [.82, .86, .72]], 'kalimba', 67, [104, 120], ['A W W S D W A -- S'], .22, 'A tiny blue streak from the tide line.'),
  species('rainbow-smelt', 'Rainbow Smelt', 'Common', 13, [4, 10], [.05, .45], 'slender', [[.55, .72, .78], [.86, .9, .72]], 'glockenspiel', 65, [96, 112], ['A1 W1 S1 W2 D1 S2 W1 -- A2 W2 S1'], .16, 'A silvery coastal spark with a bell-like skipping phrase.'),
  species('mackerel', 'Mackerel', 'Uncommon', 9, [10, 23], [.6, 5.5], 'slender', [[.18, .5, .58], [.72, .83, .72]], 'mandolin', 59, [112, 130], ['W1 D1 S2 A1 W2 S1 D2 -- A2 W1 D1'], .54, 'Green-backed speed with an electric zigzag.'),
  species('flounder', 'Flounder', 'Uncommon', 8, [8, 22], [.5, 6.5], 'flatfish', [[.38, .34, .25], [.72, .61, .42]], 'trombone', 48, [82, 98], ['A1 A1 W1~ - A2 S1 A2 - W1 S1 A1~ D1'], .38, 'A sand-colored disc with a low stubborn pull.'),
  species('sea-bass', 'Sea Bass', 'Rare', 5, [12, 32], [1.4, 18], 'bass', [[.28, .42, .47], [.75, .78, .64]], 'double_bass_arco', 52, [100, 118], ['D1 S1 W2+A1 - D2 S2 A2 W1 -- D1 A1 S2+D2'], .62, 'A strong coastal hunter that fights in clean bursts.'),
  species('rockfish', 'Rockfish', 'Rare', 5, [8, 24], [.7, 9], 'panfish', [[.62, .24, .19], [.92, .54, .26]], 'marimba', 55, [96, 114], ['A W S+D A D W S -- S A W+D S'], .56, 'A spined ember tucked against the coastal stone.'),
  species('striped-mullet', 'Striped Mullet', 'Uncommon', 8, [9, 25], [.6, 7], 'slender', [[.48, .61, .6], [.78, .7, .46]], 'banjo', 55, [96, 112], ['A S S W S D W A -- S W'], .4, 'A striped shallows runner with skipping bursts.'),
  species('tidepool-sculpin', 'Tidepool Sculpin', 'Rare', 6, [3, 9], [.06, .8], 'sculpin', [[.3, .42, .36], [.84, .45, .24]], 'cor_anglais', 50, [90, 108], ['A1 W1 A2 - S1 D1 S2 A1 - W2 S1 D2 A2'], .46, 'A broad-headed tidepool lurker with a comic glare.'),
  species('green-sunfish', 'Green Sunfish', 'Common', 14, [4, 11], [.12, 1.7], 'panfish', [[.24, .47, .34], [.82, .66, .22]], 'kalimba', 56, [82, 94], ['W1 W2 A2 S1 - W2 D1 A1'], .16, 'A compact little bruiser with bright-edged fins.'),
  species('rock-bass', 'Rock Bass', 'Uncommon', 8, [6, 14], [.35, 3], 'panfish', [[.38, .34, .24], [.76, .4, .2]], 'electric_bass', 52, [88, 104], ['S1 A1 S1 W2 - D1 W1 A2 S2 - D2 S1 A1'], .34, 'A red-eyed ambusher that lives up to its rocky name.'),
  species('bullhead-catfish', 'Bullhead Catfish', 'Uncommon', 8, [7, 16], [.5, 4.5], 'catfish', [[.25, .24, .18], [.57, .47, .25]], 'tuba', 42, [78, 94], ['S1~ A1 W1 - S2 D1 A2 -- W2 S1~ D1'], .4, 'A squat muddy-water catfish with more fight than glamour.'),
  species('walleye', 'Walleye', 'Rare', 4, [10, 30], [.7, 12], 'slender', [[.44, .5, .28], [.84, .7, .26]], 'viola_arco', 54, [96, 114], ['D1 S2 W2 - S1 A2 A1 W1 - S1 D1 S2 A1'], .58, 'Golden eyes and a steady deep-water pull.'),
  species('northern-pike', 'Northern Pike', 'Rare', 4, [16, 42], [1.5, 24], 'slender', [[.28, .43, .27], [.7, .73, .46]], 'mandolin', 48, [106, 124], ['A W W S+D - W A D S W -- S D D'], .66, 'A long green missile with sudden sideways bursts.'),
  species('muskellunge', 'Muskellunge', 'Legendary', 2, [24, 52], [5, 38], 'slender', [[.33, .42, .31], [.74, .7, .52]], 'cello_arco', 41, [116, 138], ['D1~~+A2~ - W1 S2 - D2 A1 W2+D1 -- A2 S1~~ W1 D2+A1'], .9, 'A giant ambush predator that turns a quiet cast into a crisis.'),
  species('brown-trout', 'Brown Trout', 'Rare', 4, [9, 28], [.7, 13], 'trout', [[.52, .42, .22], [.84, .58, .26]], 'guitar', 58, [104, 122], ['A1 D1 W2+S1 - A2 W1 D2 S2 -- W2 A1+D1 - S1'], .6, 'Gold-brown river muscle covered in dark spots.'),
  species('lake-trout', 'Lake Trout', 'Legendary', 2, [18, 40], [3, 30], 'trout', [[.34, .46, .48], [.74, .78, .65]], 'french_horn', 49, [102, 124], ['A~~+D~~ - S W - A W~~~ S D W -- S~+W~~ - A D - S W A'], .82, 'A cold deep-water heavyweight with a long patient song.'),
  species('arctic-grayling', 'Arctic Grayling', 'Rare', 4, [9, 22], [.6, 6], 'trout', [[.46, .58, .62], [.62, .4, .78]], 'flute', 65, [112, 132], ['A W S+D W A D S -- S D W+A S'], .64, 'A high-country fish with a sail-like dorsal fin and quick turns.'),
  species('golden-trout', 'Golden Trout', 'Legendary', 2, [6, 18], [.3, 4.5], 'trout', [[.88, .61, .2], [.9, .25, .18]], 'harp', 70, [122, 144], ['A S W+D W W A S D W -- S W D A A W+D'], .88, 'A brilliant mountain trout that sounds almost too clean to be real.'),
  species('splake', 'Splake', 'Rare', 4, [10, 30], [1, 16], 'trout', [[.34, .49, .42], [.82, .58, .3]], 'harp', 61, [108, 128], ['A1 W1 S1+D1 W2~~ S2 A2 D2 -- W1 S1 A1'], .62, 'A brook-and-lake-trout hybrid with a rising, chiming mountain phrase.'),
  species('lake-sturgeon', 'Lake Sturgeon', 'Legendary', 1.5, [28, 60], [8, 55], 'catfish', [[.4, .43, .38], [.68, .65, .49]], 'tuba', 36, [78, 98], ['A~~~+D~~ - S W~~ - A S~+W~~~ - D A -- S~~+W~~ - A D~~~ - S W A~~~+D~~'], .94, 'Ancient armored bulk that feels like hooking the bottom until it moves.'),
  species('atlantic-cod', 'Atlantic Cod', 'Rare', 4, [14, 36], [1.5, 22], 'bass', [[.4, .43, .34], [.73, .64, .42]], 'trombone', 46, [90, 108], ['S1 W1~~ - A2 D1 - S2 W2 A1 -- D2 A2+W1~~~ - S1'], .58, 'A heavy coastal fish with a deep, measured pull.'),
  species('bluefish', 'Bluefish', 'Rare', 4, [12, 34], [1.2, 20], 'bass', [[.3, .49, .58], [.74, .77, .66]], 'trumpet', 60, [118, 140], ['D1 A1 S2 D2 - W1 D1 A2 W2 -- D2 S1 A1+D1'], .72, 'A coastal brawler that attacks the rhythm as hard as the bait.'),
  species('red-snapper', 'Red Snapper', 'Rare', 4, [12, 32], [1.2, 18], 'panfish', [[.72, .26, .22], [.96, .52, .32]], 'saxophone', 58, [104, 122], ['W1 S1 D1 A2 - W2 S2 D2 W1+S1 - A1 W2~ S1 D1 A2 - D2 W1'], .62, 'A brilliant reef fish with crisp, punchy movements.'),
  species('needlefish', 'Needlefish', 'Uncommon', 8, [10, 30], [.25, 3.5], 'slender', [[.34, .59, .62], [.8, .84, .64]], 'violin_arco', 68, [118, 136], ['A W W S D A W S -- S D'], .5, 'A silver-green dart with a beak and a nervous little melody.')
];

SPECIES.push(...EXPANDED_SPECIES_DEFINITIONS.map((entry) => species(
  entry.id, entry.name, entry.rarity, entry.catchWeight, entry.length, entry.weight,
  entry.archetype, entry.colors, entry.instrument, entry.root, entry.bpm, [entry.motif],
  entry.difficulty, entry.flavor, entry.habitat
)));

const RETIRED_SPECIES_IDS = new Set([
  'windscale-bream', 'blueglass-trout', 'veiled-char', 'whiteveil-crayfish',
  'icefin-char', 'crownwater-shrimp', 'cirrus-shrimp', 'dusk-mussel',
  'mossfin-darter', 'bellwater-mussel',
  'ridge-pond-snail', 'tarn-snail', 'echo-crayfish', 'crevice-crayfish',
  'rapids-crayfish', 'quietwater-shrimp', 'reed-shrimp', 'golden-pond-mussel',
  'inlet-lobster', 'highcountry-eel'
]);

const REAL_SPECIES_ADJUSTMENTS = Object.freeze({
  'bluewater-bonnet-shark': Object.freeze({ canonicalId: 'bonnethead_shark', name: 'Bonnethead Shark', length: [24, 48], weight: [6, 24], taxonomy: 'Sphyrna tiburo', flavor: 'A small hammerhead of warm coastal shallows, turning sharply through seagrass and sand flats.' }),
  'ochre-anemone-crab': Object.freeze({ canonicalId: 'porcelain_anemone_crab', name: 'Porcelain Anemone Crab', length: [.4, 1.2], weight: [.01, .08], taxonomy: 'Neopetrolisthes maculatus', flavor: 'A tiny spotted porcelain crab that lives among the protected tentacles of tropical anemones.' }),
  'slate-conger': Object.freeze({ canonicalId: 'european_conger', name: 'European Conger', length: [36, 96], weight: [8, 160], taxonomy: 'Conger conger', flavor: 'A powerful Atlantic conger that leaves rocky shelter after dark to hunt.' }),
  'copper-tadpolefish': Object.freeze({ canonicalId: 'tadpole_madtom', name: 'Tadpole Madtom', length: [2, 5], weight: [.02, .12], taxonomy: 'Noturus gyrinus', flavor: 'A compact North American madtom with a rounded tail and a preference for quiet, vegetated water.' }),
  'grotto-olmfish': Object.freeze({ canonicalId: 'olm', name: 'Olm', length: [8, 12], weight: [.04, .12], taxonomy: 'Proteus anguinus', flavor: 'A pale, cave-adapted salamander that navigates permanent darkness without functional sight.' }),
  'clayfin-loach': Object.freeze({ canonicalId: 'zebra_loach', name: 'Zebra Loach', length: [2, 4], weight: [.02, .08], taxonomy: 'Botia striata', flavor: 'A small striped loach that searches rocky stream bottoms in tight social groups.' }),
  'rust-crayfish': Object.freeze({ canonicalId: 'rusty_crayfish', name: 'Rusty Crayfish', length: [3, 5], weight: [.1, .35], taxonomy: 'Faxonius rusticus', flavor: 'A robust crayfish marked by rusty patches on either side of its hard carapace.' }),
  'sunset-shiner': Object.freeze({ canonicalId: 'rainbow_shiner', name: 'Rainbow Shiner', length: [2, 4], weight: [.02, .08], taxonomy: 'Notropis chrosomus', flavor: 'A brilliant southeastern minnow whose breeding colors flash blue, violet, and rose.' }),
  'emberless-tetra': Object.freeze({ canonicalId: 'ember_tetra', name: 'Ember Tetra', length: [.6, 1], weight: [.001, .01], taxonomy: 'Hyphessobrycon amandae', flavor: 'A tiny orange tetra from slow, plant-rich tributaries with a warm ember-like glow.' }),
  'gale-minnow': Object.freeze({ canonicalId: 'white_cloud_mountain_minnow', name: 'White Cloud Mountain Minnow', length: [1, 2], weight: [.002, .02], taxonomy: 'Tanichthys albonubes', flavor: 'A cool-water mountain minnow with a bright lateral stripe and red-tipped fins.' })
});

const NEW_ACTIVE_SPECIES = [
  species('great_barracuda', 'Great Barracuda', 'Uncommon', 7, [24, 72], [3, 100], 'slender', [[.42, .55, .5], [.73, .78, .58]], 'mandolin', 48, [106, 120], ['A1 D1 W2 A2 - S1 D2 W1 A1 -- D1 W2'], .48, 'A long reef predator that accelerates in one startling silver flash.', { salinity: 'salt', tiers: ['ocean', 'lower'], waterTypes: ['ocean', 'inlet', 'lagoon'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'outer-ocean' }),
  species('polar_bear', 'Polar Bear', 'Legendary', 1.2, [72, 120], [330, 1600], 'mammal', [[.86, .88, .82], [.52, .61, .65]], 'french_horn', 38, [86, 104], ['A2~~ W1+D2 - S1 A1 W2 -- D1~~ S2+A2 W1 D2'], .9, 'A massive Arctic marine mammal whose strength makes the line feel impossibly small.', { salinity: 'both', tiers: ['ocean', 'upper', 'summit'], waterTypes: ['ocean', 'ice-pool', 'summit-pond'], themes: ['fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'blue-ice-melt' }),
  species('saltwater_crocodile', 'Saltwater Crocodile', 'Legendary', 1.2, [84, 204], [200, 2200], 'serpent', [[.27, .34, .22], [.62, .56, .32]], 'contrabassoon', 34, [82, 102], ['S1~~~+D2~~ - A1 W2 - D1 S2+A2 -- W1~~ D2 S1 A1+D1'], .92, 'The largest living reptile, equally at home in tidal rivers, estuaries, and coastal water.', { salinity: 'both', tiers: ['ocean', 'lower', 'middle'], waterTypes: ['ocean', 'inlet', 'lagoon', 'pond', 'lake'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'blackstone-inlet' }),
  species('american_alligator', 'American Alligator', 'Rare', 3.5, [72, 156], [100, 1000], 'serpent', [[.22, .31, .2], [.55, .51, .3]], 'bassoon', 40, [88, 106], ['A1~ S2 W1+D2 - A2 S1 W2 -- D1 A1~ S2'], .7, 'A broad-snouted freshwater reptile from warm marshes, ponds, and slow lakes.', { salinity: 'fresh', tiers: ['lower', 'middle'], waterTypes: ['pond', 'pool', 'lake'], themes: ['sunwash', 'fernwood'], strictWaterTypes: true, exclusiveWaterId: 'fernwater-pond' }),
  species('hippopotamus', 'Hippopotamus', 'Legendary', 1.1, [114, 198], [2500, 7000], 'mammal', [[.38, .36, .34], [.64, .52, .45]], 'tuba', 30, [72, 92], ['A1~~~+D1~~ - S2 W1 - A2 S1+W2 -- D2~~ A1 S2 W1+D1'], .94, 'A colossal semiaquatic grazer whose dense body and explosive power dominate deep pools.', { salinity: 'fresh', tiers: ['lower', 'middle'], waterTypes: ['pond', 'pool', 'lake'], themes: ['sunwash', 'fernwood'], strictWaterTypes: true, exclusiveWaterId: 'mossbell-lake' }),
  species('yellowfin_tuna', 'Yellowfin Tuna', 'Rare', 3.8, [48, 96], [80, 440], 'slender', [[.2, .42, .53], [.92, .72, .18]], 'upright_bass_pizz', 48, [112, 132], ['D1 W2 S1+A2 - D2 A1 W1~ S2 -- D1+A2 W2 S1'], .72, 'A warm-ocean sprinter with yellow finlets and relentless sustained speed.', { salinity: 'salt', tiers: ['ocean'], waterTypes: ['ocean'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'outer-ocean' }),
  species('swordfish', 'Swordfish', 'Legendary', 1.3, [60, 150], [90, 1000], 'slender', [[.2, .3, .42], [.72, .68, .55]], 'cello_arco', 42, [108, 130], ['A1~~+D2 - W1 S2 A2~ - D1+S1 W2 -- A1 D2~~ W1+S2 A2'], .9, 'A huge pelagic hunter built around a long flattened bill and extraordinary burst speed.', { salinity: 'salt', tiers: ['ocean'], waterTypes: ['ocean'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'outer-ocean' }),
  species('sailfish', 'Sailfish', 'Uncommon', 6.5, [60, 120], [50, 220], 'slender', [[.18, .37, .52], [.26, .64, .82]], 'violin_arco', 54, [116, 132], ['W1 D1 S2 A1 - W2~ S1 D2 -- A2 W1 D1'], .5, 'A fast blue-water billfish carrying an immense cobalt dorsal sail.', { salinity: 'salt', tiers: ['ocean'], waterTypes: ['ocean'], themes: ['sunwash', 'fernwood', 'blackstone'], strictWaterTypes: true, exclusiveWaterId: 'outer-ocean' }),
  species('giant_caribbean_anemone', 'Giant Caribbean Anemone', 'Common', 10, [4, 14], [1, 12], 'softbody', [[.42, .25, .55], [.85, .55, .32]], 'handpan', 58, [78, 90], ['A1 W1 S1 A2 - W2 S1'], .16, 'A large tropical sea anemone whose waving tentacles shelter small reef animals.', { salinity: 'salt', tiers: ['lower'], waterTypes: ['tidepool', 'lagoon', 'inlet'], themes: ['sunwash', 'fernwood'], strictWaterTypes: true, exclusiveWaterId: 'sunwash-tidepool' }),
  species('staghorn_coral', 'Staghorn Coral', 'Common', 10, [12, 48], [10, 250], 'bivalve', [[.7, .48, .32], [.9, .72, .48]], 'marimba', 62, [76, 88], ['A1 A2 W1 S1 - W2 A1'], .15, 'A branching Caribbean reef coral that builds dense thickets in clear, shallow water.', { salinity: 'salt', tiers: ['lower'], waterTypes: ['tidepool', 'lagoon', 'inlet'], themes: ['sunwash', 'fernwood'], strictWaterTypes: true, exclusiveWaterId: 'boulder-lagoon' })
];

const V92_RHYTHMS = Object.freeze({
  Common: Object.freeze({ weight: 11, bpm: [82, 94], difficulty: .18, motif: 'A1 W1 S1 D1 - A2 W2 S1' }),
  Uncommon: Object.freeze({ weight: 7, bpm: [88, 102], difficulty: .42, motif: 'A1 W2 S1 D2 - W1 A2 S2 D1 W2' }),
  Rare: Object.freeze({ weight: 3.5, bpm: [98, 116], difficulty: .68, motif: 'A1 W2 S1+D2 - A2 W1 D1 S2 -- W2 A1 D2 S1' }),
  Legendary: Object.freeze({ weight: 1.25, bpm: [108, 128], difficulty: .9, motif: 'A1~~+D2 - W1 S2 A2~ - D1+S1 W2 -- A1 D2~~ W1+S2 A2' })
});
const v92Habitat = (salinity, tiers, waterTypes, favoredWaterIds = [], extra = {}) => ({
  salinity, tiers, waterTypes, favoredWaterIds, themes: ['sunwash', 'fernwood', 'blackstone'],
  strictWaterTypes: true, ...extra
});
function v92Species(id, name, rarity, archetype, length, weight, colors, flavor, habitat) {
  const rhythm = V92_RHYTHMS[rarity];
  const root = 42 + [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 24;
  return species(id, name, rarity, rhythm.weight, length, weight, archetype, colors,
    rarity === 'Legendary' ? 'cello_arco' : rarity === 'Rare' ? 'handpan' : 'marimba',
    root, rhythm.bpm, [rhythm.motif], rhythm.difficulty, flavor, habitat);
}

// The supplied v9.2 roster says “30” but names 31 distinct creatures. Every named entry is
// retained here so no explicit requested species is silently dropped.
const V92_ACTIVE_SPECIES = [
  v92Species('mermaid', 'Mermaid', 'Legendary', 'sirenian', [60, 84], [90, 260], [[.2, .62, .66], [.78, .62, .38]], 'A half-seen singer whose melody travels farther than the swell.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'lagoon'], ['boulder-lagoon', 'outer-ocean'])),
  v92Species('scylla', 'Scylla', 'Legendary', 'lusca', [84, 180], [300, 2400], [[.23, .19, .34], [.72, .25, .31]], 'A many-limbed sea terror waiting beside black coastal stone.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'inlet'], ['blackstone-inlet'])),
  v92Species('charybdis', 'Charybdis', 'Legendary', 'lusca', [96, 220], [500, 3600], [[.1, .24, .34], [.62, .72, .76]], 'A living maelstrom whose pull arrives before its silhouette.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'], { exclusiveWaterId: 'outer-ocean' })),
  v92Species('jormungandr', 'Jormungandr', 'Legendary', 'serpent', [180, 480], [900, 9000], [[.14, .3, .28], [.62, .72, .42]], 'The world serpent, surfacing as a horizon-sized coil in cold open water.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('umibozu', 'Umibozu', 'Legendary', 'waterhorse', [90, 210], [600, 4200], [[.06, .08, .12], [.31, .45, .55]], 'A midnight ocean spirit rising soundlessly from calm water.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'inlet'], ['blackstone-inlet', 'outer-ocean'])),
  v92Species('lernaean_hydra', 'Lernaean Hydra', 'Legendary', 'dragon', [96, 240], [500, 5000], [[.18, .38, .18], [.72, .58, .22]], 'A many-headed marsh dragon whose rhythm renews every time it seems beaten.', v92Habitat('fresh', ['middle', 'upper'], ['lake', 'cave-tarn'], ['high-cirque-tarn'])),
  v92Species('oarfish', 'Oarfish', 'Legendary', 'eel', [96, 360], [40, 600], [[.72, .74, .78], [.82, .18, .2]], 'A silver ribbon from the deep, crowned with a crimson fin.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('megamouth_shark', 'Megamouth Shark', 'Legendary', 'shark', [150, 216], [750, 2700], [[.14, .17, .2], [.62, .54, .4]], 'A rare deep-sea filter feeder with a cavernous luminous mouth.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('smalltooth_sawfish', 'Smalltooth Sawfish', 'Legendary', 'shark', [120, 216], [400, 1300], [[.34, .44, .43], [.72, .66, .45]], 'A great ray with a toothed rostrum sweeping the coastal floor.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'lagoon', 'inlet'], ['boulder-lagoon'])),
  v92Species('blue_ringed_octopus', 'Blue Ringed Octopus', 'Legendary', 'lusca', [3, 8], [.05, .25], [[.78, .64, .22], [.08, .48, .88]], 'A tiny octopus whose electric blue rings warn of extraordinary venom.', v92Habitat('salt', ['lower'], ['tidepool', 'lagoon'], ['sunwash-tidepool'])),
  v92Species('portuguese_man_o_war', 'Portuguese Man o War', 'Legendary', 'softbody', [4, 20], [.2, 4], [[.35, .34, .82], [.78, .28, .72]], 'A drifting blue colony trailing a dangerous curtain beneath the surface.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'lagoon'], ['outer-ocean'])),

  v92Species('taniwha', 'Taniwha', 'Rare', 'dragon', [54, 150], [80, 900], [[.16, .38, .32], [.52, .72, .34]], 'A powerful guardian moving beneath a remote mountain lake.', v92Habitat('fresh', ['upper'], ['lake', 'tarn'], ['cloudstep-lake'])),
  v92Species('qallupilluk', 'Qallupilluk', 'Rare', 'mammal', [48, 84], [100, 360], [[.32, .66, .68], [.72, .86, .84]], 'A cold-water being said to wait beneath the Arctic ice.', v92Habitat('fresh', ['upper'], ['ice-pool'], ['blue-ice-melt'], { exclusiveWaterId: 'blue-ice-melt' })),
  v92Species('ahuizotl', 'Ahuizotl', 'Rare', 'otter', [30, 60], [18, 80], [[.2, .3, .34], [.62, .44, .24]], 'A water guardian with a gripping tail-hand and a taste for quiet banks.', v92Habitat('fresh', ['lower', 'middle'], ['pond', 'pool', 'lake'], ['redbank-pool'])),
  v92Species('kappa', 'Kappa', 'Rare', 'turtle', [24, 48], [25, 110], [[.24, .5, .28], [.72, .68, .24]], 'A mischievous river spirit with a shell and a water-filled crown.', v92Habitat('fresh', ['lower'], ['pond', 'pool'], ['amber-reed-pond'])),
  v92Species('goblin_shark', 'Goblin Shark', 'Rare', 'shark', [84, 150], [150, 900], [[.58, .42, .42], [.72, .64, .58]], 'A deep-water shark with a long snout and startlingly extendable jaws.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('flowerhorn_cichlid', 'Flowerhorn Cichlid', 'Rare', 'panfish', [6, 16], [.4, 3.5], [[.72, .18, .22], [.28, .62, .74]], 'A brilliant ornamental cichlid with a bold forehead hump.', v92Habitat('fresh', ['lower'], ['pond', 'lake'], ['fernwater-pond'])),
  v92Species('barreleye', 'Barreleye', 'Rare', 'panfish', [4, 8], [.1, .5], [[.18, .28, .27], [.62, .88, .72]], 'A deep-sea fish peering upward through a transparent shield.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('blue_dragon_sea_slug', 'Blue Dragon Sea Slug', 'Rare', 'softbody', [.8, 1.6], [.002, .02], [[.12, .42, .86], [.72, .86, .98]], 'A tiny pelagic sea slug shaped like a cobalt dragon.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'tidepool'], ['sunwash-tidepool'])),
  v92Species('stonefish', 'Stonefish', 'Rare', 'sculpin', [10, 20], [2, 6], [[.36, .34, .22], [.62, .53, .3]], 'A venomous reef ambusher almost indistinguishable from rock.', v92Habitat('salt', ['lower'], ['lagoon', 'inlet', 'tidepool'], ['boulder-lagoon'])),

  v92Species('nokken', 'Nokken', 'Uncommon', 'waterhorse', [42, 96], [45, 420], [[.12, .3, .28], [.48, .7, .58]], 'A lake spirit that changes shape when the shore grows quiet.', v92Habitat('fresh', ['middle', 'upper'], ['lake', 'tarn', 'cave-tarn'], ['high-cirque-tarn'])),
  v92Species('leafy_seadragon', 'Leafy Seadragon', 'Uncommon', 'dragon', [8, 14], [.1, .35], [[.48, .55, .22], [.76, .64, .3]], 'A drifting relative of the seahorse disguised as seaweed.', v92Habitat('salt', ['lower', 'ocean'], ['lagoon', 'inlet', 'ocean'], ['boulder-lagoon'])),
  v92Species('vampire_squid', 'Vampire Squid', 'Uncommon', 'lusca', [6, 12], [.2, 1], [[.3, .08, .12], [.68, .22, .26]], 'A deep-sea cephalopod that wraps itself in a dark webbed cloak.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('giant_isopod', 'Giant Isopod', 'Uncommon', 'sculpin', [8, 20], [1, 4], [[.42, .45, .5], [.7, .68, .6]], 'An armored deep-sea scavenger resembling an enormous pill bug.', v92Habitat('salt', ['ocean'], ['ocean'], ['outer-ocean'])),
  v92Species('diving_bell_spider', 'Diving Bell Spider', 'Uncommon', 'arachnid', [.3, .7], [.001, .01], [[.32, .25, .18], [.7, .72, .62]], 'An aquatic spider living inside its own submerged bubble of air.', v92Habitat('fresh', ['lower', 'middle'], ['pond', 'lake'], ['fernwater-pond'])),
  v92Species('oranda', 'Oranda', 'Uncommon', 'panfish', [5, 12], [.2, 2], [[.9, .42, .12], [.92, .84, .66]], 'A fancy goldfish with a flowing tail and a raspberry-like head growth.', v92Habitat('fresh', ['lower'], ['pond', 'lake'], ['sheltered-mirror'])),

  v92Species('mudskipper', 'Mudskipper', 'Common', 'sculpin', [3, 10], [.05, .6], [[.36, .42, .3], [.68, .55, .3]], 'An amphibious goby that skips across warm mudflats.', v92Habitat('salt', ['lower'], ['lagoon', 'inlet', 'tidepool'], ['sunwash-tidepool'])),
  v92Species('archerfish', 'Archerfish', 'Common', 'panfish', [4, 12], [.1, 1.5], [[.72, .66, .38], [.16, .22, .24]], 'A brackish-water hunter that knocks insects down with a jet of water.', v92Habitat('salt', ['lower'], ['lagoon', 'inlet'], ['boulder-lagoon'])),
  v92Species('remora', 'Remora', 'Common', 'slender', [12, 36], [1, 8], [[.22, .31, .34], [.6, .66, .62]], 'A traveling fish with a suction disc for hitching rides on larger animals.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'inlet'], ['outer-ocean'])),
  v92Species('flying_gurnard', 'Flying Gurnard', 'Common', 'sculpin', [10, 20], [1, 4], [[.38, .48, .54], [.26, .66, .82]], 'A bottom fish that opens enormous blue-edged pectoral fins like wings.', v92Habitat('salt', ['ocean', 'lower'], ['ocean', 'lagoon', 'inlet'], ['boulder-lagoon']))
];

const canonicalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const preparedSpecies = [...SPECIES, ...NEW_ACTIVE_SPECIES, ...V92_ACTIVE_SPECIES].map((fish) => {
  const adjustment = REAL_SPECIES_ADJUSTMENTS[fish.id];
  const length = adjustment?.length ?? [fish.minLength, fish.maxLength];
  const weight = adjustment?.weight ?? [fish.minWeight, fish.maxWeight];
  const canonicalId = adjustment?.canonicalId ?? canonicalize(fish.id);
  return {
    ...fish,
    canonicalId,
    legacyIds: Object.freeze([...new Set([fish.id, canonicalize(fish.id)])]),
    name: adjustment?.name ?? fish.name,
    taxonomy: adjustment?.taxonomy ?? '',
    flavor: adjustment?.flavor ?? fish.flavor,
    minLength: length[0], maxLength: length[1],
    minWeight: weight[0], maxWeight: weight[1],
    sizeModel: Object.freeze({
      ...fish.sizeModel,
      typicalLength: Object.freeze([...length]),
      typicalWeight: Object.freeze([...weight])
    }),
    retired: RETIRED_SPECIES_IDS.has(fish.id),
    catalogId: null
  };
});

const rarityOrder = Object.freeze(['Common', 'Uncommon', 'Rare', 'Legendary']);
const rarityPrefix = Object.freeze({ Common: 'C', Uncommon: 'U', Rare: 'R', Legendary: 'L' });
const activeSorted = preparedSpecies.filter((fish) => !fish.retired).sort((a, b) => (
  rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity)
    || a.name.localeCompare(b.name)
));
const rarityCounts = new Map();
const activeWithCatalog = activeSorted.map((fish) => {
  const sequence = (rarityCounts.get(fish.rarity) ?? 0) + 1;
  rarityCounts.set(fish.rarity, sequence);
  return Object.freeze({ ...fish, catalogId: `${rarityPrefix[fish.rarity]}${String(sequence).padStart(3, '0')}` });
});
const retiredFrozen = preparedSpecies.filter((fish) => fish.retired).map((fish) => Object.freeze(fish));

export const FISH_SPECIES = Object.freeze(activeWithCatalog);
export const ALL_FISH_SPECIES = Object.freeze([...activeWithCatalog, ...retiredFrozen]);
const SPECIES_BY_ALIAS = new Map();
for (const fish of ALL_FISH_SPECIES) {
  for (const alias of [...fish.legacyIds, fish.canonicalId]) SPECIES_BY_ALIAS.set(alias, fish);
}

export function resolveSpecies(speciesId, includeRetired = true) {
  const species = SPECIES_BY_ALIAS.get(String(speciesId ?? ''))
    ?? SPECIES_BY_ALIAS.get(canonicalize(speciesId));
  return species && (includeRetired || !species.retired) ? species : null;
}

export function canonicalSpeciesId(speciesId) {
  return resolveSpecies(speciesId, true)?.canonicalId ?? String(speciesId ?? '');
}

export const RARITY_LABELS = Object.freeze({
  Common: 'Common', Uncommon: 'Uncommon', Rare: 'Rare', Legendary: 'Legendary'
});
export const RARITY_COLORS = Object.freeze({
  Common: [.73, .82, .7], Uncommon: [.34, .78, .48], Rare: [.34, .58, .96], Legendary: [.72, .39, .92]
});

export const LENGTH_CATEGORY_LABELS = Object.freeze([
  'Very Short', 'Short', 'Average', 'Long', 'Extremely Long'
]);
export const SIZE_CATEGORY_LABELS = Object.freeze([
  'Tiny', 'Small', 'Average', 'Large', 'Massive'
]);

const CATEGORY_BREAKS = Object.freeze([.18, .38, .68, .88]);
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function categoryIndex(score) {
  const normalized = Math.max(0, score);
  for (let index = 0; index < CATEGORY_BREAKS.length; index += 1) {
    if (normalized < CATEGORY_BREAKS[index]) return index;
  }
  return 4;
}

function categoryBounds(index) {
  const lower = index <= 0 ? 0 : CATEGORY_BREAKS[index - 1];
  const upper = index >= 4 ? 1.65 : CATEGORY_BREAKS[index];
  return [lower, upper];
}

function constrainToCategory(score, referenceIndex) {
  const [minimum, maximum] = categoryBounds(referenceIndex);
  return clamp(score, minimum + .001, maximum - .001);
}

// Bell-shaped samples remain useful for subtle condition/girth variation.
function normalish(rng) {
  let total = 0;
  for (let index = 0; index < 6; index += 1) total += rng();
  return total / 6;
}

function lengthFromScore(fish, score) {
  const lowTail = fish.minLength * .82;
  if (score <= 1) {
    const t = clamp(score, 0, 1);
    return lowTail + (fish.maxLength - lowTail) * Math.pow(t, 1.04);
  }
  const range = fish.maxLength - fish.minLength;
  return fish.maxLength + range * Math.pow(score - 1, .78) * 1.15;
}

function expectedWeightForLength(fish, length) {
  const lowLength = fish.minLength * .82;
  const lowWeight = fish.minWeight * .68;
  if (length <= fish.maxLength) {
    const t = clamp((length - lowLength) / Math.max(.01, fish.maxLength - lowLength), 0, 1);
    // Archetype exponents are around 3. Dividing by three keeps the supplied real-ish endpoint
    // ranges authoritative while still making weight rise faster for deeper-bodied species.
    const curve = Math.pow(t, clamp(fish.sizeModel.lengthWeightExponent / 3, .78, 1.16));
    return lowWeight + (fish.maxWeight - lowWeight) * curve;
  }
  const ratio = length / Math.max(.01, fish.maxLength);
  const trophyExponent = clamp(fish.sizeModel.lengthWeightExponent * .78, 1.8, 2.65);
  return fish.maxWeight * Math.pow(ratio, trophyExponent);
}

const POOL_ENRICHMENT_RULES = Object.freeze([
  Object.freeze({ anchors: ['bluegill', 'pumpkinseed'], add: ['redear-sunfish', 'fathead-minnow', 'chain-pickerel'] }),
  Object.freeze({ anchors: ['creek-chub', 'longnose-dace'], add: ['fathead-minnow', 'chain-pickerel', 'mottled-sculpin'] }),
  Object.freeze({ anchors: ['stone-loach', 'cave-tetra'], add: ['mottled-sculpin'] }),
  Object.freeze({ anchors: ['sardine', 'anchovy'], add: ['rainbow-smelt'] }),
  Object.freeze({ anchors: ['brook-trout', 'lake-trout'], add: ['splake'] })
]);

function enrichPoolIds(fishIds) {
  // Single-species lists are used by debug/forced catches and must stay exact.
  if (!Array.isArray(fishIds) || fishIds.length <= 1) return fishIds ?? [];
  const ids = new Set(fishIds);
  for (const rule of POOL_ENRICHMENT_RULES) {
    if (rule.anchors.some((id) => ids.has(id))) rule.add.forEach((id) => ids.add(id));
  }
  return [...ids];
}

function capWeightedShares(rawWeights, requestedCap = .25) {
  const count = rawWeights.length;
  if (!count) return [];
  const total = rawWeights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return rawWeights.map(() => 1 / count);

  // A hard 25% ceiling is only mathematically possible with four or more choices.
  const cap = Math.max(requestedCap, 1 / count);
  const probabilities = Array(count).fill(0);
  const remaining = new Set(rawWeights.map((_, index) => index));
  let mass = 1;

  while (remaining.size) {
    const remainingWeight = [...remaining].reduce((sum, index) => sum + Math.max(0, rawWeights[index]), 0);
    if (remainingWeight <= 0) {
      const even = mass / remaining.size;
      for (const index of remaining) probabilities[index] = even;
      break;
    }

    const newlyCapped = [];
    for (const index of remaining) {
      const share = mass * Math.max(0, rawWeights[index]) / remainingWeight;
      if (share > cap + 1e-9) newlyCapped.push(index);
    }

    if (!newlyCapped.length) {
      for (const index of remaining) probabilities[index] = mass * Math.max(0, rawWeights[index]) / remainingWeight;
      break;
    }

    for (const index of newlyCapped) {
      probabilities[index] = cap;
      mass -= cap;
      remaining.delete(index);
    }
    mass = Math.max(0, mass);
  }

  return probabilities;
}

export function getWeightedSpeciesTable(fishIds, modifiers = {}) {
  const expandedIds = modifiers.disablePoolEnrichment ? fishIds : enrichPoolIds(fishIds);
  return buildTwoStageProbabilityTable(FISH_SPECIES, expandedIds, modifiers);
}

export function chooseWeightedSpecies(fishIds, rng = Math.random, modifiers = {}) {
  const table = getWeightedSpeciesTable(fishIds, modifiers);
  if (!table.length) return null;
  const weights = table.map((entry) => entry.selectionWeight);
  let roll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  return table.find((entry, index) => ((roll -= weights[index]) <= 0))?.fish ?? table.at(-1).fish;
}

export function normalizeSpecimenCategoryPair(lengthIndex, sizeIndex, changedDimension = 'length') {
  let length = clamp(Math.round(lengthIndex), 0, 4);
  let size = clamp(Math.round(sizeIndex), 0, 4);
  if (Math.abs(length - size) <= 1) return Object.freeze({ lengthIndex: length, sizeIndex: size });
  if (changedDimension === 'size') length = size + Math.sign(length - size);
  else size = length + Math.sign(size - length);
  return Object.freeze({ lengthIndex: clamp(length, 0, 4), sizeIndex: clamp(size, 0, 4) });
}

function categoryMidpoint(index) {
  const [minimum, maximum] = categoryBounds(clamp(index, 0, 4));
  return (minimum + maximum) * .5;
}

function buildSpecimen(fish, lengthScore, weightScore, shiny, rng) {
  const lengthCategoryIndex = categoryIndex(lengthScore);
  let weightCategoryIndex = categoryIndex(weightScore);
  if (Math.abs(lengthCategoryIndex - weightCategoryIndex) > 1) {
    weightCategoryIndex = lengthCategoryIndex + Math.sign(weightCategoryIndex - lengthCategoryIndex);
    weightScore = constrainToCategory(weightScore, weightCategoryIndex);
  }
  const length = lengthFromScore(fish, lengthScore);
  const expectedWeight = expectedWeightForLength(fish, length);
  const relativeCondition = clamp(1 + (weightScore - lengthScore) * .72 + (normalish(rng) - .5) * .08, .72, 1.42);
  const weight = Math.max(fish.minWeight * .55, expectedWeight * relativeCondition);
  return Object.freeze({
    id: `${fish.id}-${Math.floor(rng() * 1e9)}`,
    speciesId: fish.canonicalId ?? fish.id,
    runtimeSpeciesId: fish.id,
    catalogId: fish.catalogId ?? null,
    name: fish.name,
    rarity: fish.rarity,
    rarityLabel: fish.rarityLabel ?? RARITY_LABELS[fish.rarity] ?? fish.rarity,
    length: Math.round(length * 10) / 10,
    weight: Math.round(weight * 100) / 100,
    expectedWeight: Math.round(expectedWeight * 100) / 100,
    lengthCategory: LENGTH_CATEGORY_LABELS[lengthCategoryIndex],
    sizeCategory: SIZE_CATEGORY_LABELS[weightCategoryIndex],
    lengthCategoryIndex,
    sizeCategoryIndex: weightCategoryIndex,
    sizeLabel: SIZE_CATEGORY_LABELS[weightCategoryIndex],
    sizeFraction: lengthScore,
    weightFraction: weightScore,
    condition: relativeCondition,
    shiny,
    sizeModel: fish.sizeModel,
    visual: fish.visual,
    rhythm: fish.rhythm,
    flavor: fish.flavor
  });
}

export function createFishSpecimenForCategories(speciesOrId, lengthIndex, sizeIndex, shiny = false, rng = Math.random, changedDimension = 'length') {
  const fish = typeof speciesOrId === 'string'
    ? resolveSpecies(speciesOrId, false)
    : speciesOrId;
  if (!fish || fish.retired) return null;
  const normalized = normalizeSpecimenCategoryPair(lengthIndex, sizeIndex, changedDimension);
  return buildSpecimen(
    fish,
    categoryMidpoint(normalized.lengthIndex),
    categoryMidpoint(normalized.sizeIndex),
    shiny,
    rng
  );
}

export function createFishSpecimen(speciesOrId, sizeFraction = .5, shiny = false, rng = Math.random) {
  const fish = typeof speciesOrId === 'string'
    ? resolveSpecies(speciesOrId, false)
    : speciesOrId;
  if (!fish || fish.retired) return null;

  const baseScore = clamp(sizeFraction, .02, 1.65);
  // Length and body mass share one latent size score, then receive small independent variation.
  // This gives believable same-species variation without allowing a tiny-length fish to become Massive.
  const lengthScore = clamp(baseScore + (normalish(rng) - .5) * .08, .02, 1.65);
  let weightScore = clamp(baseScore + (normalish(rng) - .5) * .2, .02, 1.65);
  return buildSpecimen(fish, lengthScore, weightScore, shiny, rng);
}

export function getFishDisplayMetrics(fish) {
  if (!fish) return { displayedLength: .7, weightCondition: 1, girthMultiplier: 1, widthMultiplier: 1 };
  // Start from the generated inch measurement, then apply the established held-fish pose
  // allowance. The very wide safety limits preserve tiny/huge roster differences; camera
  // framing, not model shrinkage, is responsible for keeping the complete catch visible.
  const displayedLength = clamp(Math.max(.35, fish.length) * .0254 * 1.18, .035, 30);
  const weightCondition = clamp(
    fish.weight / Math.max(.01, fish.expectedWeight ?? fish.weight),
    .5,
    1.9
  );
  return {
    displayedLength,
    weightCondition,
    girthMultiplier: Math.pow(weightCondition, .74),
    widthMultiplier: Math.pow(weightCondition, .92)
  };
}

export function createCatchRecord(specimen, zone, quality, caughtAt = Date.now()) {
  return Object.freeze({
    ...specimen,
    quality,
    location: zone.id,
    locationLabel: zone.label,
    elevation: Number.isFinite(zone.surfaceY) ? zone.surfaceY : 0,
    caughtAt
  });
}

export function rollFish(fishIds, modifiers = {}, rng = Math.random) {
  const fish = chooseWeightedSpecies(fishIds, rng, modifiers);
  if (!fish) return null;
  const trophyBoost = Math.max(.5, modifiers.trophyChance ?? 1);

  // Pick a visible category first so the population has deliberate tails instead of a
  // narrow bell curve: Tiny 13.5%, Small 23.5%, Average 28%, Large 22%, Massive 13%.
  // High waters and trophy modifiers nudge (rather than replace) that distribution.
  const sizeBias = clamp((modifiers.size ?? 1) - 1 + (modifiers.specimenSizeBias ?? 0), -.25, .3);
  const largeShift = sizeBias * .12;
  const trophyShift = clamp((trophyBoost - 1) * .018, -.01, .035);
  const weights = [
    .135 - largeShift * .4,
    .235 - largeShift * .6,
    .28 - trophyShift,
    .22 + largeShift * .55,
    .13 + largeShift * .45 + trophyShift
  ].map((weight) => Math.max(.04, weight));
  let categoryRoll = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  let selectedCategory = weights.findIndex((weight) => ((categoryRoll -= weight) <= 0));
  if (selectedCategory < 0) selectedCategory = 4;

  const scoreRanges = [[.025, .175], [.185, .375], [.39, .675], [.69, .875], [.89, 1.06]];
  const [minimum, maximum] = scoreRanges[selectedCategory];
  let size = minimum + (maximum - minimum) * rng();
  if (selectedCategory === 4 && rng() < clamp(.035 * trophyBoost, .02, .085)) {
    // Massive contains a very small second tail for absurd, memorable giants.
    size = 1.08 + Math.pow(rng(), .55) * .57;
  }

  const shinyChance = SHINY_CONFIG.chance * Math.max(0, modifiers.shinyChanceMultiplier ?? 1);
  const shiny = modifiers.forceShiny ?? (SHINY_CONFIG.debugForce || rng() < shinyChance);
  return createFishSpecimen(fish, clamp(size, .02, 1.65), shiny, rng);
}
