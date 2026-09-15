import { FISH_SPECIES, getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import { getEcologySelection } from '../src/fishing/fish-ecology.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { ALL_FISHING_WATER_DESCRIPTORS, MOUNTAIN_CENTER } from '../src/world/mountain-v2.js';

function zoneFromDescriptor(water) {
  const angle = (water.angle ?? 0) * Math.PI / 180;
  const center = water.center ?? {
    x: MOUNTAIN_CENTER.x + Math.cos(angle) * (water.radius ?? 0),
    z: MOUNTAIN_CENTER.z + Math.sin(angle) * (water.radius ?? 0)
  };
  const zone = new FishingZone({
    id: water.id, label: water.label, center,
    shape: water.innerRadius != null ? 'annulus' : 'ellipse',
    innerRadius: water.innerRadius ?? 0, outerRadius: water.outerRadius ?? 0,
    radii: { x: water.radii?.[0] ?? 7, z: water.radii?.[1] ?? 7 },
    surfaceY: water.y ?? water.waterY ?? 0, fishIds: water.fish ?? [],
    modifiers: {
      rarityTier: water.probabilityGroup === 'cloudstep-lake' ? 'cloudstep'
        : water.tier === 'ocean' ? 'ocean' : water.waterfall ? 'waterfall' : water.tier,
      rarityBias: water.rarityBias,
      maximumSpeciesProbability: water.maximumSpeciesProbability ?? .25,
      largeSpeciesWeightBias: water.largeSpeciesWeightBias ?? 0
    }
  });
  Object.assign(zone, {
    tier: water.tier, waterType: water.waterType, theme: water.theme,
    ecologyThemes: water.ecologyThemes, ecologyTheme: water.ecologyTheme,
    cave: water.cave, waterfall: water.waterfall,
    uniformProbabilities: water.uniformProbabilities,
    probabilityGroup: water.probabilityGroup,
    habitatAliasIds: water.habitatAliasIds,
    allowedRarities: water.allowedRarities,
    allowedFishIds: water.allowedFishIds
  });
  return zone;
}

export function buildEcologyAudit() {
  const zones = ALL_FISHING_WATER_DESCRIPTORS.map(zoneFromDescriptor);
  const watersBySpecies = new Map(FISH_SPECIES.map((fish) => [fish.id, []]));
  const waters = zones.map((zone) => {
    const selection = getEcologySelection(zone);
    const table = getWeightedSpeciesTable(selection.fishIds, {
      ...zone.modifiers, rarityTier: selection.habitat.rarityTier,
      habitatWeights: selection.habitatWeights, disablePoolEnrichment: true
    }).filter((entry) => entry.probability > 0);
    for (const entry of table) watersBySpecies.get(entry.fish.id)?.push({
      waterId: zone.id, probability: entry.probability
    });
    return {
      id: zone.id, name: zone.label, waterType: zone.waterType,
      eligibleSpecies: table.length,
      exclusives: [],
      rarities: Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary'].map((rarity) => [
        rarity, table.filter((entry) => entry.fish.rarity === rarity).length
      ])),
      topTen: [...table].sort((a, b) => b.probability - a.probability).slice(0, 10)
        .map((entry) => ({ id: entry.fish.id, name: entry.fish.name,
          probability: Math.round(entry.probability * 10000) / 100 })),
      warnings: table.length < 6 ? ['thin catch table'] : []
    };
  });
  const species = FISH_SPECIES.map((fish) => {
    const locations = [...(watersBySpecies.get(fish.id) ?? [])].sort((a, b) => b.probability - a.probability);
    const status = fish.futureReserved ? 'FUTURE RESERVED'
      : locations.length ? 'CURRENTLY OBTAINABLE' : 'ACCIDENTALLY UNREACHABLE';
    if (locations.length === 1) waters.find((water) => water.id === locations[0].waterId)?.exclusives.push(fish.id);
    return {
      id: fish.id, name: fish.name, rarity: fish.rarity,
      eligibleWaters: locations.length, exclusive: locations.length === 1,
      futureReserved: fish.futureReserved, futureLocation: fish.futureLocation,
      status, mostLikely: locations.slice(0, 3)
    };
  });
  return {
    counts: Object.fromEntries(['Common', 'Uncommon', 'Rare', 'Legendary'].map((rarity) => [
      rarity, FISH_SPECIES.filter((fish) => fish.rarity === rarity).length
    ])),
    waterCount: waters.length, speciesCount: species.length,
    futureReservedCount: species.filter((fish) => fish.futureReserved).length,
    accidentallyUnreachable: species.filter((fish) => statusIsUnreachable(fish)).map((fish) => fish.id),
    waters, species
  };
}

function statusIsUnreachable(fish) { return fish.status === 'ACCIDENTALLY UNREACHABLE'; }

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, '/')}`).href) {
  const audit = buildEcologyAudit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(audit, null, 2));
  else {
    console.log(`Roster ${audit.speciesCount} ${JSON.stringify(audit.counts)} | waters ${audit.waterCount} | future ${audit.futureReservedCount} | accidental unreachable ${audit.accidentallyUnreachable.length}`);
    for (const water of audit.waters) console.log(`${water.id} | ${water.eligibleSpecies} eligible | ${water.exclusives.length} exclusive | ${JSON.stringify(water.rarities)} | top ${water.topTen.map((fish) => `${fish.name} ${fish.probability}%`).join(', ')}${water.warnings.length ? ` | WARNING ${water.warnings.join(', ')}` : ''}`);
    for (const fish of audit.species) console.log(`${fish.id} | ${fish.name} | ${fish.rarity} | ${fish.eligibleWaters} waters | ${fish.status} | ${fish.mostLikely.map((location) => location.waterId).join(', ')}`);
  }
  if (audit.accidentallyUnreachable.length) process.exitCode = 1;
}
