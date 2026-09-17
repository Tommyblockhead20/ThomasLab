import { FISH_SPECIES, getWeightedSpeciesTable } from './fish-data.js';
import {
  BRACKISH_COMPATIBLE_SPECIES,
  ecologyConfigForWater
} from './ecology-config.js';

export const ECOLOGY_TARGETS = Object.freeze({
  waters: 28,
  species: 300,
  // Current catchable species are counted separately from future-reserved roster
  // entries. Individual waters vary instead of carrying a fixed exclusive quota.
  exclusiveSpecies: FISH_SPECIES.filter((fish) => !fish.futureReserved && fish.habitat?.exclusiveWaterId).length,
  sharedSpecies: FISH_SPECIES.filter((fish) => !fish.futureReserved && !fish.habitat?.exclusiveWaterId).length,
  minimumExclusivePerWater: 2,
  maximumExclusivePerWater: 9,
  maximumSpeciesShare: .25
});

const SALT_WATER_TYPES = new Set(['ocean', 'cold-ocean', 'bluewater-ocean', 'tidepool', 'inlet', 'lagoon']);
const BRACKISH_WATER_TYPES = new Set(['brackish-lagoon']);
const TYPE_FAMILIES = Object.freeze({
  coast: new Set(['ocean', 'bluewater-ocean', 'tidepool', 'inlet', 'lagoon', 'brackish-lagoon']),
  'cold-coast': new Set(['cold-ocean']),
  still: new Set(['pond', 'pool', 'lake', 'tarn', 'summit-pond', 'ice-pool']),
  flow: new Set(['stream-pool', 'waterfall-pool']),
  cave: new Set(['cave-pool', 'cave-tarn'])
});
const THEMES = Object.freeze(['sunwash', 'fernwood', 'blackstone']);
const OBLIGATE_CAVE_SPECIES = new Set([
  'blind-cave-eel', 'cave-tetra', 'ashen-cave-snail', 'basalt-cave-shrimp',
  'chimeblind-shrimp', 'pallid-cave-crab', 'whisper-eel',
  'echo-cave-salamander', 'glass-cave-lobster', 'obsidian-blindfish'
]);
const STRONG_CAVE_SPECIES = new Set(['stone-loach']);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
function localAbundance(speciesId, waterId) {
  const hash = stableIndex(`${speciesId}:${waterId}`, 10001);
  return .75 + hash / 10000 * .60;
}

function waterSizeWeight(fish, habitat) {
  const speciesScale = clamp((Math.log1p(Math.max(.1, fish.maxLength ?? 20)) - Math.log1p(24)) / Math.log(8), -1, 1);
  const waterScale = clamp((Math.log1p(habitat.equivalentRadius ?? 7) - Math.log1p(7)) / Math.log(14), -1, 1);
  return clamp(1 + speciesScale * waterScale * .34, .65, 1.5);
}

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
  const probabilityPoint = zone.uniformProbabilities ? (zone.probabilityAnchor ?? zone.center) : point;
  const waterType = zone.waterType ?? 'pond';
  const isOcean = ['ocean', 'cold-ocean', 'bluewater-ocean'].includes(waterType);
  const visualTheme = waterType === 'ocean'
    ? climateThemeAtPoint(probabilityPoint, zone.center)
    : zone.theme ?? climateThemeAtPoint(zone.center);
  // Fallglass is an environment treatment, not a fourth biological climate. Keeping the
  // ecology wedge separate prevents it from filtering out every shared climate creature.
  const ecologyTheme = isOcean
    ? visualTheme
    : zone.ecologyTheme ?? (visualTheme === 'fallglass' ? climateThemeAtPoint(zone.center) : visualTheme);
  const ecologyThemes = Array.isArray(zone.ecologyThemes) && zone.ecologyThemes.length
    ? [...new Set(zone.ecologyThemes)]
    : [ecologyTheme];
  const tier = zone.tier ?? 'lower';
  const rarityTier = zone.probabilityGroup === 'cloudstep-lake' ? 'cloudstep'
    : isOcean ? 'ocean'
    : Boolean(zone.cave || waterType.includes('cave')) ? 'cave'
    : (zone.waterfall || waterType === 'waterfall-pool') ? 'waterfall'
      : tier;
  return Object.freeze({
    zoneId: zone.id,
    zoneName: zone.label,
    habitatAliasIds: Object.freeze([...(zone.habitatAliasIds ?? [])]),
    tier,
    rarityTier,
    waterType,
    typeFamily: typeFamily(waterType),
    salinity: BRACKISH_WATER_TYPES.has(waterType) ? 'brackish'
      : SALT_WATER_TYPES.has(waterType) ? 'salt' : 'fresh',
    theme: visualTheme,
    ecologyTheme,
    ecologyThemes: Object.freeze(ecologyThemes),
    cave: Boolean(zone.cave || waterType.includes('cave')),
    ice: waterType === 'ice-pool',
    waterfall: Boolean(zone.waterfall || waterType === 'waterfall-pool'),
    summit: zone.tier === 'summit' || waterType === 'summit-pond',
    equivalentRadius: Math.max(.5, zone.shape === 'annulus'
      ? (zone.outerRadius - zone.innerRadius) * .5
      : zone.shape === 'path' ? zone.pathWidth * 2
        : Math.sqrt(Math.max(.25, (zone.radii?.x ?? 7) * (zone.radii?.z ?? 7))))
  });
}

function salinityIsCompatible(fish, preference, habitat) {
  if (preference.salinity === 'both') return true;
  if (Array.isArray(preference.salinities)) return preference.salinities.includes(habitat.salinity);
  if (habitat.salinity === 'brackish' && BRACKISH_COMPATIBLE_SPECIES.has(fish.id)) return true;
  return !preference.salinity || preference.salinity === habitat.salinity;
}

export function getHabitatWeight(fish, habitat, waterConfig = ecologyConfigForWater(habitat.zoneId, habitat)) {
  if (fish.futureReserved) return 0;
  if (OBLIGATE_CAVE_SPECIES.has(fish.id) && !habitat.cave) return 0;
  const preference = fish.habitat ?? {};
  const excluded = waterConfig.exclusions.includes(fish.id);
  if (excluded || !salinityIsCompatible(fish, preference, habitat)) return 0;
  const compatibleWaterIds = new Set([habitat.zoneId, ...(habitat.habitatAliasIds ?? [])]);
  if (preference.exclusiveWaterId) {
    if (habitat.zoneId !== preference.exclusiveWaterId) return 0;
    // This is a strong Stage-B preference only. Rarity has already been chosen separately.
    return (({ Common: 4.2, Uncommon: 4.8, Rare: 5.6, Legendary: 6.4 })[fish.rarity] ?? 4.8)
      * (waterConfig.speciesWeights[fish.id] ?? 1)
      * waterSizeWeight(fish, habitat) * localAbundance(fish.id, habitat.zoneId);
  }
  const configuredAddition = waterConfig.additions.includes(fish.id);
  if (configuredAddition) {
    return Math.max(.001, (waterConfig.speciesWeights[fish.id] ?? 1)
      * waterSizeWeight(fish, habitat) * localAbundance(fish.id, habitat.zoneId));
  }
  if (preference.tiers?.length && !preference.tiers.includes(habitat.tier)) return 0;
  if (preference.waterIds?.length && !preference.waterIds.some((id) => compatibleWaterIds.has(id))) return 0;
  if (preference.themes?.length && !habitat.ecologyThemes.some((theme) => preference.themes.includes(theme))) return 0;

  let typeWeight = 1;
  if (preference.waterTypes?.length && !preference.waterTypes.includes(habitat.waterType)) {
    const familyMatch = preference.waterTypes.some((type) => typeFamily(type) === habitat.typeFamily);
    if (!familyMatch) return 0;
    typeWeight = preference.strictWaterTypes ? 1 : .52;
  }

  const preferredTheme = preference.preferredTheme ?? THEMES[stableIndex(fish.id, THEMES.length)];
  const themeWeight = habitat.ecologyThemes.length > 1
    ? (habitat.ecologyThemes.includes(preferredTheme) ? 1 : .72)
    : preferredTheme === habitat.ecologyTheme ? 1.48 : .64;
  const favoredWaterWeight = preference.favoredWaterIds?.some((id) => compatibleWaterIds.has(id))
    ? (fish.rarity === 'Legendary'
        ? 3.2
        : (({ Common: 1.6, Uncommon: 1.9, Rare: 2.6 })[fish.rarity] ?? 2))
    : 1;
  let featureWeight = 1;
  if (habitat.cave) featureWeight *= OBLIGATE_CAVE_SPECIES.has(fish.id) ? 2.1
    : STRONG_CAVE_SPECIES.has(fish.id) ? 1.8
      : preference.waterTypes?.some((type) => type.includes('cave')) ? 1.35 : .26;
  else if (STRONG_CAVE_SPECIES.has(fish.id)) featureWeight *= .07;
  if (habitat.ice) featureWeight *= preference.tiers?.includes('upper') ? 1.2 : .78;
  if (habitat.waterfall) featureWeight *= preference.waterTypes?.includes('waterfall-pool') ? 1.28 : .84;
  if (habitat.summit) featureWeight *= preference.tiers?.includes('summit') ? 1.24 : .8;
  return Math.max(.001, typeWeight * themeWeight * featureWeight * favoredWaterWeight
    * (waterConfig.speciesWeights[fish.id] ?? 1)
    * waterSizeWeight(fish, habitat) * localAbundance(fish.id, habitat.zoneId));
}

export function getEcologySelection(zone, point = zone.center) {
  const habitat = getZoneHabitat(zone, point);
  const waterConfig = ecologyConfigForWater(zone.id, habitat);
  const allowedIds = Array.isArray(zone.allowedFishIds) && zone.allowedFishIds.length
    ? new Set(zone.allowedFishIds)
    : null;
  const allowedRarities = Array.isArray(zone.allowedRarities) && zone.allowedRarities.length
    ? new Set(zone.allowedRarities)
    : null;
  const entries = FISH_SPECIES
    .map((fish) => ({ fish, weight: getHabitatWeight(fish, habitat, waterConfig) }))
    .filter((entry) => entry.weight > 0
      && (!allowedIds || allowedIds.has(entry.fish.id))
      && (!allowedRarities || allowedRarities.has(entry.fish.rarity)));
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
  const waterConfig = ecologyConfigForWater(zone.id, baseline.habitat);
  zone.modifiers = { ...zone.modifiers, rarityProfile: waterConfig.rarityProfile };
  zone.fishIds = [...baseline.fishIds];
  zone.ecologyWeights = { ...baseline.habitatWeights };
  zone.ecologyTheme = baseline.habitat.ecologyTheme;
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
    const samplePoints = zone.waterType === 'ocean' && !zone.uniformProbabilities
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
  const zeroWaterSpecies = FISH_SPECIES.filter((fish) => !fish.futureReserved
    && (watersBySpecies.get(fish.id)?.length ?? 0) === 0).map((fish) => fish.id);
  const futureReservedSpecies = FISH_SPECIES.filter((fish) => fish.futureReserved).map((fish) => fish.id);
  const exclusive = FISH_SPECIES.filter((fish) => !fish.futureReserved && Boolean(fish.habitat?.exclusiveWaterId));
  const shared = FISH_SPECIES.filter((fish) => !fish.futureReserved && !fish.habitat?.exclusiveWaterId);
  const mostDiversePool = [...pools].sort((a, b) => b.poolSize - a.poolSize)[0] ?? null;
  return Object.freeze({
    waterCount: zones.length,
    uniqueWaterCount: waterIds.size,
    speciesCount: FISH_SPECIES.length,
    zeroWaterSpecies,
    futureReservedSpecies,
    accidentallyUnreachable: zeroWaterSpecies,
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
