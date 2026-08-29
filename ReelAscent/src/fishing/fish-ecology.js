import { FISH_SPECIES, getWeightedSpeciesTable } from './fish-data.js';

export const ECOLOGY_TARGETS = Object.freeze({
  waters: 24,
  species: 280,
  exclusiveSpecies: 96,
  sharedSpecies: 184,
  exclusivePerWater: 4,
  maximumSpeciesShare: .25
});

const SALT_WATER_TYPES = new Set(['ocean', 'tidepool', 'inlet', 'lagoon']);
const TYPE_FAMILIES = Object.freeze({
  coast: new Set(['ocean', 'tidepool', 'inlet', 'lagoon']),
  still: new Set(['pond', 'pool', 'lake', 'tarn', 'summit-pond', 'ice-pool']),
  flow: new Set(['stream-pool', 'waterfall-pool']),
  cave: new Set(['cave-pool', 'cave-tarn'])
});
const THEMES = Object.freeze(['sunwash', 'fernwood', 'blackstone']);

function stableIndex(value, size) {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return Math.abs(hash) % size;
}

export function climateThemeAtPoint(point, center = { x: 0, z: 0 }) {
  const angle = (Math.atan2(point.z - center.z, point.x - center.x) * 180 / Math.PI + 360) % 360;
  const clockDegrees = (90 - angle + 360) % 360;
  if (clockDegrees < 120) return 'sunwash';
  if (clockDegrees < 240) return 'fernwood';
  return 'blackstone';
}

function typeFamily(type) {
  return Object.entries(TYPE_FAMILIES).find(([, members]) => members.has(type))?.[0] ?? type;
}

export function getZoneHabitat(zone, point = zone.center) {
  const waterType = zone.waterType ?? 'pond';
  const isOcean = waterType === 'ocean';
  const visualTheme = isOcean ? climateThemeAtPoint(point, zone.center) : zone.theme ?? climateThemeAtPoint(zone.center);
  // Fallglass is an environment treatment, not a fourth biological climate. Keeping the
  // ecology wedge separate prevents it from filtering out every shared climate creature.
  const ecologyTheme = isOcean
    ? visualTheme
    : zone.ecologyTheme ?? (visualTheme === 'fallglass' ? climateThemeAtPoint(zone.center) : visualTheme);
  const ecologyThemes = Array.isArray(zone.ecologyThemes) && zone.ecologyThemes.length
    ? [...new Set(zone.ecologyThemes)]
    : [ecologyTheme];
  const tier = zone.tier ?? 'lower';
  const rarityTier = isOcean ? 'ocean'
    : (zone.waterfall || waterType === 'waterfall-pool') ? 'waterfall'
      : tier;
  return Object.freeze({
    zoneId: zone.id,
    zoneName: zone.label,
    tier,
    rarityTier,
    waterType,
    typeFamily: typeFamily(waterType),
    salinity: SALT_WATER_TYPES.has(waterType) ? 'salt' : 'fresh',
    theme: visualTheme,
    ecologyTheme,
    ecologyThemes: Object.freeze(ecologyThemes),
    cave: Boolean(zone.cave || waterType.includes('cave')),
    ice: waterType === 'ice-pool',
    waterfall: Boolean(zone.waterfall || waterType === 'waterfall-pool'),
    summit: zone.tier === 'summit' || waterType === 'summit-pond'
  });
}

export function getHabitatWeight(fish, habitat) {
  const preference = fish.habitat ?? {};
  if (preference.exclusiveWaterId) {
    if (preference.exclusiveWaterId !== habitat.zoneId) return 0;
    // This is a strong Stage-B preference only. Rarity has already been chosen separately.
    return ({ Common: 4.2, Uncommon: 4.8, Rare: 5.6, Legendary: 6.4 })[fish.rarity] ?? 4.8;
  }
  if (preference.salinity && preference.salinity !== 'both' && preference.salinity !== habitat.salinity) return 0;
  if (preference.tiers?.length && !preference.tiers.includes(habitat.tier)) return 0;
  if (preference.waterIds?.length && !preference.waterIds.includes(habitat.zoneId)) return 0;
  if (preference.themes?.length && !habitat.ecologyThemes.some((theme) => preference.themes.includes(theme))) return 0;

  let typeWeight = 1;
  if (preference.waterTypes?.length && !preference.waterTypes.includes(habitat.waterType)) {
    if (preference.strictWaterTypes) return 0;
    const familyMatch = preference.waterTypes.some((type) => typeFamily(type) === habitat.typeFamily);
    if (!familyMatch) return 0;
    typeWeight = .52;
  }

  const preferredTheme = preference.preferredTheme ?? THEMES[stableIndex(fish.id, THEMES.length)];
  const themeWeight = habitat.ecologyThemes.length > 1
    ? (habitat.ecologyThemes.includes(preferredTheme) ? 1 : .72)
    : preferredTheme === habitat.ecologyTheme ? 1.48 : .64;
  const favoredWaterWeight = preference.favoredWaterIds?.includes(habitat.zoneId)
    ? (fish.rarity === 'Legendary'
        ? 3.2
        : (({ Common: 1.6, Uncommon: 1.9, Rare: 2.6 })[fish.rarity] ?? 2))
    : 1;
  let featureWeight = 1;
  if (habitat.cave) featureWeight *= preference.waterTypes?.some((type) => type.includes('cave')) ? 1.3 : .78;
  if (habitat.ice) featureWeight *= preference.tiers?.includes('upper') ? 1.2 : .78;
  if (habitat.waterfall) featureWeight *= preference.waterTypes?.includes('waterfall-pool') ? 1.28 : .84;
  if (habitat.summit) featureWeight *= preference.tiers?.includes('summit') ? 1.24 : .8;
  return Math.max(.05, typeWeight * themeWeight * featureWeight * favoredWaterWeight);
}

export function getEcologySelection(zone, point = zone.center) {
  const habitat = getZoneHabitat(zone, point);
  const entries = FISH_SPECIES
    .map((fish) => ({ fish, weight: getHabitatWeight(fish, habitat) }))
    .filter((entry) => entry.weight > 0);
  return Object.freeze({
    habitat,
    fishIds: Object.freeze(entries.map((entry) => entry.fish.id)),
    habitatWeights: Object.freeze(Object.fromEntries(entries.map((entry) => [entry.fish.id, entry.weight])))
  });
}

export function attachZoneEcology(zone) {
  zone.getHabitatAt = (point = zone.center) => getZoneHabitat(zone, point);
  zone.getEcologySelection = (point = zone.center) => getEcologySelection(zone, point);
  const baseline = getEcologySelection(zone, zone.center);
  zone.fishIds = [...baseline.fishIds];
  zone.ecologyWeights = { ...baseline.habitatWeights };
  return zone;
}

export function auditFishingEcology(zones) {
  const waterIds = new Set(zones.map((zone) => zone.id));
  const watersBySpecies = new Map(FISH_SPECIES.map((fish) => [fish.id, []]));
  const pools = zones.map((zone) => {
    // The ocean changes climate theme with cast position. Audit all three wedges instead of
    // treating the descriptor center as a single sunwash sample and falsely reporting
    // climate-specific ocean creatures as unreachable. Inland waters remain one fixed sample.
    const center = zone.center ?? { x: 0, z: 0 };
    const samplePoints = zone.waterType === 'ocean'
      ? [
          { x: center.x + 1, z: center.z },      // sunwash
          { x: center.x, z: center.z - 1 },      // fernwood
          { x: center.x - 1, z: center.z }       // blackstone
        ]
      : [center];
    const selections = samplePoints.map((point) => getEcologySelection(zone, point));
    const unionIds = [...new Set(selections.flatMap((selection) => selection.fishIds))];
    const maximumNormalizedShare = Math.max(0, ...selections.flatMap((selection) => (
      getWeightedSpeciesTable(selection.fishIds, {
        ...zone.modifiers,
        rarityTier: selection.habitat.rarityTier,
        habitatWeights: selection.habitatWeights,
        disablePoolEnrichment: true
      }).map((entry) => entry.probability)
    )));
    unionIds.forEach((fishId) => watersBySpecies.get(fishId)?.push(zone.id));
    return {
      id: zone.id,
      name: zone.label,
      habitat: selections[0].habitat,
      sampledThemes: Object.freeze([...new Set(selections.map((selection) => selection.habitat.theme))]),
      poolSize: unionIds.length,
      maximumNormalizedShare,
      exclusiveCount: unionIds.filter((id) => (
        FISH_SPECIES.find((fish) => fish.id === id)?.habitat?.exclusiveWaterId === zone.id
      )).length
    };
  });
  const zeroWaterSpecies = [...watersBySpecies].filter(([, ids]) => ids.length === 0).map(([id]) => id);
  const exclusive = FISH_SPECIES.filter((fish) => Boolean(fish.habitat?.exclusiveWaterId));
  const shared = FISH_SPECIES.filter((fish) => !fish.habitat?.exclusiveWaterId);
  const mostDiversePool = [...pools].sort((a, b) => b.poolSize - a.poolSize)[0] ?? null;
  return Object.freeze({
    waterCount: zones.length,
    uniqueWaterCount: waterIds.size,
    speciesCount: FISH_SPECIES.length,
    zeroWaterSpecies,
    exclusiveCount: exclusive.length,
    sharedCount: shared.length,
    invalidExclusiveWaters: exclusive
      .filter((fish) => !waterIds.has(fish.habitat.exclusiveWaterId))
      .map((fish) => fish.id),
    sharedBelowTwoWaters: shared
      .filter((fish) => (watersBySpecies.get(fish.id)?.length ?? 0) < 2)
      .map((fish) => fish.id),
    pools,
    maximumNormalizedShare: Math.max(0, ...pools.map((pool) => pool.maximumNormalizedShare)),
    mostDiversePool,
    suspiciousPools: pools.filter((pool) => (
      pool.poolSize < 8 || (pool.id === 'outer-ocean' ? pool.poolSize > 64 : pool.poolSize > 40)
    ))
  });
}
