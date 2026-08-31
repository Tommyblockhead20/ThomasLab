import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH_SPECIES, getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import {
  attachZoneEcology, auditFishingEcology, climateThemeAtPoint, ECOLOGY_TARGETS, getEcologySelection
} from '../src/fishing/fish-ecology.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import {
  ALL_FISHING_WATER_DESCRIPTORS,
  COASTAL_SHELF_RADIUS,
  CROWN_DENSITY_CONFIG,
  FISHING_WATER_COUNTS,
  MOUNTAIN_CENTER,
  MOUNTAIN_FAILURE_RADIUS,
  MOUNTAIN_FISHING_LOCATIONS,
  OCEAN_FISHING_DESCRIPTOR,
  START_LOCATIONS,
  SUMMIT_HEIGHT,
  TERRAIN_ANGLE_PROFILE
} from '../src/world/mountain-v2.js';

test('Crown traversal density supplies supported routes, branches, rests, and upper belts', () => {
  assert.ok(CROWN_DENSITY_CONFIG.routeStages >= 28);
  assert.ok(CROWN_DENSITY_CONFIG.branchStages.length >= 5);
  assert.ok(CROWN_DENSITY_CONFIG.beltCounts.length >= 6);
  assert.ok(CROWN_DENSITY_CONFIG.beltCounts.reduce((total, count) => total + count, 0) >= 220);
});

function pointAt(angle, radius) {
  const radians = angle * Math.PI / 180;
  return {
    x: MOUNTAIN_CENTER.x + Math.cos(radians) * radius,
    z: MOUNTAIN_CENTER.z + Math.sin(radians) * radius
  };
}

function ecologyZones() {
  const inland = MOUNTAIN_FISHING_LOCATIONS.map((water) => {
    const zone = new FishingZone({
      id: water.id,
      label: water.label,
      center: pointAt(water.angle, water.radius),
      radii: { x: water.radii[0], z: water.radii[1] },
      surfaceY: water.y,
      fishIds: water.fish,
      modifiers: {
        rarityBias: water.rarityBias,
        size: water.size,
        trophyChance: water.trophyChance,
        maximumSpeciesProbability: water.maximumSpeciesProbability ?? ECOLOGY_TARGETS.maximumSpeciesShare
      }
    });
    Object.assign(zone, {
      tier: water.tier,
      waterType: water.waterType,
      theme: water.theme,
      ecologyThemes: water.ecologyThemes,
      cave: water.cave,
      waterfall: water.waterfall
    });
    return attachZoneEcology(zone);
  });
  const ocean = new FishingZone({
    id: OCEAN_FISHING_DESCRIPTOR.id,
    label: OCEAN_FISHING_DESCRIPTOR.label,
    center: OCEAN_FISHING_DESCRIPTOR.center,
    shape: 'annulus',
    innerRadius: OCEAN_FISHING_DESCRIPTOR.innerRadius,
    outerRadius: OCEAN_FISHING_DESCRIPTOR.outerRadius,
    surfaceY: 0,
    fishIds: OCEAN_FISHING_DESCRIPTOR.fish,
    modifiers: { rarityBias: .18 },
    depth: 'deep'
  });
  Object.assign(ocean, {
    tier: OCEAN_FISHING_DESCRIPTOR.tier,
    waterType: OCEAN_FISHING_DESCRIPTOR.waterType,
    theme: OCEAN_FISHING_DESCRIPTOR.theme
  });
  return [...inland, attachZoneEcology(ocean)];
}

test('mountain v2 provides six unique safe starts and preserves traversal geometry contracts', () => {
  assert.equal(START_LOCATIONS.length, 6);
  assert.equal(new Set(START_LOCATIONS.map((start) => start.id)).size, 6);
  assert.equal(SUMMIT_HEIGHT, 304.8);
  assert.deepEqual(TERRAIN_ANGLE_PROFILE.walkable, [0, 30]);
  assert.equal(TERRAIN_ANGLE_PROFILE.overhangCount, 0);
  assert.ok(MOUNTAIN_FAILURE_RADIUS > COASTAL_SHELF_RADIUS);

  for (const start of START_LOCATIONS) {
    const radius = Math.hypot(start.position.x - MOUNTAIN_CENTER.x, start.position.z - MOUNTAIN_CENTER.z);
    assert.ok(radius < COASTAL_SHELF_RADIUS);
    assert.ok(MOUNTAIN_FAILURE_RADIUS - radius >= 30);
  }
});

test('the world exposes exactly 24 waters with one hollow annular ocean', () => {
  assert.deepEqual(FISHING_WATER_COUNTS, {
    ocean: 1, lower: 10, middle: 7, upper: 4, summit: 1, waterfall: 1, total: 24
  });
  assert.equal(MOUNTAIN_FISHING_LOCATIONS.length, 23);
  assert.equal(ALL_FISHING_WATER_DESCRIPTORS.length, 24);
  assert.equal(new Set(ALL_FISHING_WATER_DESCRIPTORS.map((water) => water.id)).size, 24);
  assert.equal(OCEAN_FISHING_DESCRIPTOR.id, 'outer-ocean');
  assert.ok(OCEAN_FISHING_DESCRIPTOR.innerRadius >= COASTAL_SHELF_RADIUS - 5);
  assert.ok(OCEAN_FISHING_DESCRIPTOR.outerRadius > OCEAN_FISHING_DESCRIPTOR.innerRadius);

  const ocean = ecologyZones().find((zone) => zone.id === 'outer-ocean');
  assert.equal(ocean.shape, 'annulus');
  assert.equal(ocean.contains(MOUNTAIN_CENTER), false);
  assert.equal(ocean.contains(pointAt(0, ocean.innerRadius + 2)), true);
});

test('300-creature ecology audit preserves the active 24-water topology', () => {
  const zones = ecologyZones();
  const audit = auditFishingEcology(zones);
  assert.equal(FISH_SPECIES.length, 300);
  assert.equal(audit.waterCount, 24);
  assert.equal(audit.uniqueWaterCount, 24);
  assert.deepEqual(audit.zeroWaterSpecies, []);
  assert.equal(audit.exclusiveCount, ECOLOGY_TARGETS.exclusiveSpecies);
  assert.equal(audit.sharedCount, ECOLOGY_TARGETS.sharedSpecies);
  assert.deepEqual(audit.invalidExclusiveWaters, []);
  assert.ok(audit.sharedBelowTwoWaters.length <= Math.ceil(audit.sharedCount * .16));
  assert.ok(audit.sharedBelowTwoWaters.every((id) => (
    FISH_SPECIES.some((fish) => fish.id === id && !fish.habitat.exclusiveWaterId)
  )));
  assert.equal(audit.pools.reduce((total, pool) => total + pool.exclusiveCount, 0), audit.exclusiveCount);
  assert.ok(audit.pools.every((pool) => (
    pool.exclusiveCount >= ECOLOGY_TARGETS.minimumExclusivePerWater
      && pool.exclusiveCount <= ECOLOGY_TARGETS.maximumExclusivePerWater
  )));
  assert.ok(audit.pools.every((pool) => pool.poolSize >= 8));
  assert.ok(audit.maximumNormalizedShare <= .25 + 1e-9);
  assert.ok(audit.mostDiversePool.poolSize >= 40);

  for (const zone of zones) {
    const selection = getEcologySelection(zone, zone.center);
    const table = getWeightedSpeciesTable(selection.fishIds, {
      ...zone.modifiers,
      habitatWeights: selection.habitatWeights,
      disablePoolEnrichment: true
    });
    assert.equal(table.length, selection.fishIds.length);
    assert.ok(table.every((entry) => entry.probability > 0));
  }
});

test('ocean ecology changes climate theme with cast angle while remaining one zone ID', () => {
  const ocean = ecologyZones().find((zone) => zone.id === 'outer-ocean');
  const samples = [0, 120, 240].map((angle) => getEcologySelection(ocean, pointAt(angle, 225)));
  assert.equal(new Set(samples.map((selection) => selection.habitat.zoneId)).size, 1);
  assert.equal(new Set(samples.map((selection) => selection.habitat.theme)).size, 3);
  assert.equal(new Set([0, 120, 240].map((angle) => climateThemeAtPoint(pointAt(angle, 225), MOUNTAIN_CENTER))).size, 3);
  const themedFish = FISH_SPECIES.find((fish) => !fish.habitat.exclusiveWaterId && fish.habitat.salinity === 'salt');
  assert.equal(new Set(samples.map((selection) => selection.habitatWeights[themedFish.id])).size, 2);
});
