import { FISH_SPECIES } from '../fishing/fish-data.js';

const BOTH = Object.freeze(['human', 'blob']);
const HUMAN = Object.freeze(['human']);
const item = (id, label, slot, source, visual, supports = BOTH) => Object.freeze({
  id, label, slot, source: Object.freeze(source), visual, supports
});
const starter = (id, label, slot, visual, supports = BOTH) => item(id, label, slot,
  { type: 'starter', hint: 'Starter' }, visual, supports);
const shop = (id, label, slot, price, visual, supports = BOTH) => item(id, label, slot,
  { type: 'shop', price, hint: "Available at Outfitter's Reach" }, visual, supports);

export const STARTER_COSMETICS = Object.freeze([
  starter('beanie', 'Pointed Trail Beanie', 'headwear', 'beanie'),
  starter('trail-hat', 'Evergreen Trail Hat', 'headwear', 'cowboy'),
  starter('fishing-cap', 'Fishing Cap', 'headwear', 'cap'),
  starter('glasses', 'Trail Glasses', 'eyewear', 'glasses', HUMAN),
  starter('round-glasses', 'Round Dark Sunglasses', 'eyewear', 'round'),
  starter('scarf', 'Trail Scarf', 'faceAccessory', 'scarf'),
  starter('bandana', 'Bandana', 'faceAccessory', 'bandana'),
  starter('backpack', 'Trail Backpack', 'backAccessory', 'pack')
]);

export const SHOP_COSMETICS = Object.freeze([
  shop('headlamp', 'Headlamp', 'headwear', 45, 'headlamp', HUMAN),
  shop('flower-crown', 'Flower Crown', 'headwear', 35, 'flower'),
  shop('bucket-hat', 'Creek Bucket Hat', 'headwear', 30, 'bucket'),
  shop('cowboy-hat', 'Switchback Cowboy Hat', 'headwear', 55, 'cowboy'),
  shop('wizard-hat', 'Trail Wizard Hat', 'headwear', 65, 'wizard'),
  shop('propeller-cap', 'Wind-Test Propeller Cap', 'headwear', 60, 'propeller'),
  shop('aviators', 'Aviator Sunglasses', 'eyewear', 45, 'aviator', HUMAN),
  shop('sport-shades', 'Sport Shades', 'eyewear', 55, 'visor'),
  shop('clear-spectacles', 'Clear Spectacles', 'eyewear', 25, 'glasses', HUMAN),
  shop('neck-gaiter', 'Neck Gaiter', 'faceAccessory', 30, 'gaiter', HUMAN),
  shop('rain-cape', 'Rain Cape', 'backAccessory', 70, 'cape'),
  shop('daypack', 'Compact Daypack', 'backAccessory', 65, 'pack'),
  shop('trail-flag', 'Tiny Trail Flag', 'backAccessory', 40, 'flag')
]);

const EXISTING_REWARD_COSMETICS = Object.freeze([
  item('snow-glasses', 'Snow Glasses', 'eyewear', { type: 'badge', badgeId: 'water-explorer-2', hint: 'Trail Badge: Water Explorer II' }, 'goggles', HUMAN),
  item('goggles', 'Summit Goggles', 'eyewear', { type: 'badge', badgeId: 'summit-regular', hint: 'Trail Badge: Summit Regular' }, 'goggles', HUMAN),
  item('necklace', 'Summit Necklace', 'faceAccessory', { type: 'badge', badgeId: 'first-ascent', hint: 'Trail Badge: First Ascent' }, 'necklace', HUMAN)
]);

const BADGE_REWARDS = Object.freeze([
  ['field-naturalist-1', 'Fern Scout Pin', 'faceAccessory', 'necklace'],
  ['field-naturalist-2', 'Habitat Patch Cape', 'backAccessory', 'cape'],
  ['field-naturalist-3', 'Field Research Pack', 'backAccessory', 'pack'],
  ['field-naturalist-4', 'Master Naturalist Crown', 'headwear', 'crown'],
  ['seasoned-angler', 'Hundred-Catch Hook Pin', 'faceAccessory', 'necklace'],
  ['thousand-casts', 'Thousand-Catch Angler Vest', 'backAccessory', 'pack'],
  ['living-legend', 'Ten-Thousand-Catch Trophy Rig', 'backAccessory', 'emblem'],
  ['market-naturalist', 'Market Ledger Spectacles', 'eyewear', 'glasses'],
  ['complete-market-ledger', 'Golden Ledger Pack', 'backAccessory', 'pack'],
  ['curator-1', 'Junior Curator Bow', 'faceAccessory', 'collar'],
  ['curator-2', 'Curator Tank Pin', 'faceAccessory', 'necklace'],
  ['curator-3', 'Curator Bubble Shades', 'eyewear', 'round'],
  ['curator-4', 'Senior Curator Collar', 'faceAccessory', 'collar'],
  ['curator-5', 'Aquarium Keeper Pack', 'backAccessory', 'tank'],
  ['curator-6', 'Grand Gallery Cape', 'backAccessory', 'cape'],
  ['grand-curator', 'Living Aquarium Halo', 'headwear', 'halo'],
  ['biome-naturalist', 'Patchwork Biome Cape', 'backAccessory', 'cape'],
  ['water-explorer-1', 'Creekfinder Visor', 'eyewear', 'visor'],
  ['water-explorer-2', 'Snow Glasses', 'eyewear', 'goggles'],
  ['water-explorer-3', 'All-Waters Atlas Pack', 'backAccessory', 'atlas'],
  ['first-ascent', 'Summit Necklace', 'faceAccessory', 'necklace'],
  ['summit-regular', 'Summit Goggles', 'eyewear', 'goggles'],
  ['peak-veteran', 'Peak Veteran Ice Crown', 'headwear', 'crown'],
  ['island-hopper', 'Island Pennant Pack', 'backAccessory', 'flag'],
  ['first-shiny', 'Shimmer Lens', 'eyewear', 'round'],
  ['shiny-hunter', 'Prismatic Trail Halo', 'headwear', 'halo'],
  ['legendary-encounter', 'Legend Keeper Mantle', 'backAccessory', 'cape'],
  ['full-kit', 'Full-Kit Carabiner Collar', 'faceAccessory', 'collar'],
  ['master-outfitter', 'Outfitter Crowned Cap', 'headwear', 'cap'],
  ['world-mapper', 'Cartographer Compass Pack', 'backAccessory', 'atlas']
]);

const badgeCosmetics = BADGE_REWARDS
  .filter(([badgeId]) => !EXISTING_REWARD_COSMETICS.some((entry) => entry.source.badgeId === badgeId))
  .map(([badgeId, label, slot, visual]) => item(`badge-${badgeId}`, label, slot,
    { type: 'badge', badgeId, hint: `Trail Badge: ${badgeId.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')}` }, visual));

// Existing reward IDs stay canonical; map their badges to those IDs instead of manufacturing
// duplicates with the same visible item.
export const BADGE_COSMETIC_REWARD_BY_ID = Object.freeze(Object.fromEntries(
  BADGE_REWARDS.map(([badgeId]) => {
    const existing = EXISTING_REWARD_COSMETICS.find((entry) => entry.source.badgeId === badgeId);
    return [badgeId, existing?.id ?? `badge-${badgeId}`];
  })
));

const LEGENDARY_OVERRIDES = Object.freeze({
  giant_pacific_octopus: ['Tentacled Octopus Hat', 'headwear', 'tentacle'],
  hammerhead_shark: ['Hammer Visor', 'eyewear', 'hammer'],
  manta_ray: ['Manta Glider Cape', 'backAccessory', 'wings'],
  axolotl: ['Axolotl Gill Headband', 'headwear', 'gills'],
  electric_eel: ['Static Current Goggles', 'eyewear', 'electric'],
  japanese_spider_crab: ['Spider-Claw Mantle', 'backAccessory', 'claws'],
  sailfish: ['Sail-Fin Back Crest', 'backAccessory', 'fin'],
  ocean_sunfish: ['Sun-Disc Shades', 'eyewear', 'sun'],
  coelacanth: ['Living Fossil Explorer Hood', 'headwear', 'hood'],
  mermaid: ['Pearl-Shell Crown', 'headwear', 'crown'],
  jormungandr: ['World-Serpent Scarf', 'faceAccessory', 'serpent'],
  umibozu: ['Dark-Ocean Hood', 'headwear', 'hood'],
  lernaean_hydra: ['Hydra Crest', 'backAccessory', 'hydra'],
  charybdis: ['Whirlpool Collar', 'faceAccessory', 'whirlpool'],
  scylla: ['Scylla Tentacle Mantle', 'backAccessory', 'tentacle'],
  chambered_nautilus: ['Nautilus Spiral Pack', 'backAccessory', 'shell'],
  pufferfish: ['Puffer Puff Collar', 'faceAccessory', 'puff'],
  kraken: ['Kraken Wake Cape', 'backAccessory', 'tentacle'],
  narwhal: ['Narwhal Horn Crown', 'headwear', 'horn'],
  crowned_sunray: ['Sunray Crown', 'headwear', 'sun']
});

const SLOT_ROTATION = Object.freeze(['headwear', 'eyewear', 'faceAccessory', 'backAccessory']);
const VISUALS = Object.freeze({
  headwear: ['crown', 'wizard', 'hood', 'horn', 'halo', 'bucket', 'crest'],
  eyewear: ['visor', 'round', 'goggles', 'sun', 'electric', 'hammer'],
  faceAccessory: ['scarf', 'collar', 'necklace', 'serpent', 'puff', 'whirlpool'],
  backAccessory: ['cape', 'fin', 'wings', 'shell', 'emblem', 'tentacle', 'flag']
});
const SUFFIX = Object.freeze({ headwear: 'Crest', eyewear: 'Lens', faceAccessory: 'Charm', backAccessory: 'Mantle' });

const legendarySpecies = FISH_SPECIES.filter((species) => String(species.rarity).toLowerCase() === 'legendary');
export const LEGENDARY_COSMETIC_REWARD_BY_SPECIES = Object.freeze(Object.fromEntries(
  legendarySpecies.map((species) => [species.canonicalId ?? species.id, `catch-${species.canonicalId ?? species.id}`])
));
const legendaryCosmetics = legendarySpecies.map((species, index) => {
  const speciesId = species.canonicalId ?? species.id;
  const slot = LEGENDARY_OVERRIDES[speciesId]?.[1] ?? SLOT_ROTATION[index % SLOT_ROTATION.length];
  const visual = LEGENDARY_OVERRIDES[speciesId]?.[2] ?? VISUALS[slot][index % VISUALS[slot].length];
  const label = LEGENDARY_OVERRIDES[speciesId]?.[0] ?? `${species.name} ${SUFFIX[slot]}`;
  return item(`catch-${speciesId}`, label, slot,
    { type: 'catch', speciesId, speciesName: species.name, hint: `Catch: ${species.name}` }, visual);
});

export const CASINO_EXCLUSIVE_COSMETICS = Object.freeze([
  item('casino-golden-top-hat', 'Golden Top Hat', 'headwear', { type: 'casino', hint: 'Casino Exclusive' }, 'top-hat'),
  item('casino-jackpot-shades', 'Jackpot Shades', 'eyewear', { type: 'casino', hint: 'Casino Exclusive' }, 'visor'),
  item('casino-coin-halo', 'Coin Halo', 'headwear', { type: 'casino', hint: 'Casino Exclusive' }, 'halo'),
  item('casino-dice-charm', 'Lucky Dice Charm', 'faceAccessory', { type: 'casino', hint: 'Casino Exclusive' }, 'necklace'),
  item('casino-card-shark-cap', 'Card-Shark Cap', 'headwear', { type: 'casino', hint: 'Casino Exclusive' }, 'cap'),
  item('casino-high-roller-scarf', 'High-Roller Scarf', 'faceAccessory', { type: 'casino', hint: 'Casino Exclusive' }, 'scarf'),
  item('casino-neon-blob-crown', 'Neon Blob Crown', 'headwear', { type: 'casino', hint: 'Casino Exclusive' }, 'crown', Object.freeze(['blob'])),
  item('casino-flashy-pack', 'Jackpot Light Pack', 'backAccessory', { type: 'casino', hint: 'Casino Exclusive' }, 'tank')
]);

export const COSMETIC_CATALOG = Object.freeze([
  ...STARTER_COSMETICS,
  ...SHOP_COSMETICS,
  ...EXISTING_REWARD_COSMETICS,
  ...badgeCosmetics,
  ...legendaryCosmetics,
  ...CASINO_EXCLUSIVE_COSMETICS
]);
export const PREVIOUS_ACTIVE_COSMETIC_COUNT = 17;
export const COSMETIC_BY_ID = new Map(COSMETIC_CATALOG.map((entry) => [entry.id, entry]));
export const COSMETICS_BY_SLOT = Object.freeze(Object.fromEntries(
  ['headwear', 'eyewear', 'faceAccessory', 'backAccessory'].map((slot) => [
    slot,
    Object.freeze(COSMETIC_CATALOG.filter((entry) => entry.slot === slot))
  ])
));
export const STARTER_COSMETIC_IDS = Object.freeze(STARTER_COSMETICS.map((entry) => entry.id));

export function cosmeticUnlocked(cosmetic, save, testMode = false) {
  if (!cosmetic) return false;
  if (testMode || cosmetic.source.type === 'starter') return true;
  if ((save?.progression?.ownedCosmetics ?? []).includes(cosmetic.id)) return true;
  if (cosmetic.source.type === 'catch') return Boolean(save?.collection?.[cosmetic.source.speciesId]?.catches);
  if (cosmetic.source.type === 'badge') return (save?.trailBadges?.unlocked ?? []).includes(cosmetic.source.badgeId);
  return false;
}
