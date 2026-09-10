import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAquariumTankDisplays } from '../src/progression/aquarium.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { defaultProgressionState } from '../src/progression/progression-save.js';
import {
  FISHING_WATER_COUNTS, SKYREACH_FISHING_DESCRIPTORS, SKYREACH_TOWER_CONFIG,
  createMountainMapData, skyreachRectanglePoint
} from '../src/world/mountain-v2.js';
import { getWorldLocation } from '../src/world/world-locations.js';

const specimen = (index, value = index) => ({
  specimenId: `specimen-${index}`, speciesId: 'bluegill', name: `Fish ${index}`,
  rarity: 'Common', quality: 'GOOD', length: 8, weight: 1, value,
  provenance: { locationLabel: 'Test Water' }
});

function progressionFixture() {
  const saveSystem = {
    data: { progression: defaultProgressionState('v17-test'), lifetime: { activePlaytimeSeconds: 0 } },
    save() {}, recordLegitimateEarnings() {}, recordSpeciesSold() {}
  };
  return new ProgressionSystem(saveSystem);
}

test('v17 Aquarium has no hidden resident layer and selected-tank Auto-Fill moves exact Inventory records', () => {
  const residents = Array.from({ length: 37 }, (_, index) => specimen(index, index));
  const normalized = normalizeAquariumTankDisplays(residents, 2, [[residents[0].specimenId], []], [true, true]);
  assert.equal(normalized.displays.flat().length, 37);
  assert.equal(new Set(normalized.displays.flat()).size, 37);
  assert.ok(normalized.displays.every((ids) => ids.length <= 30));

  const progression = progressionFixture();
  progression.state.aquariumTankCount = 2;
  progression.state.aquariumTankDisplays = [[], []];
  progression.state.aquariumTankManual = [true, true];
  progression.state.inventory = Array.from({ length: 35 }, (_, index) => specimen(index, index + 1));
  const result = progression.autoFillAquariumTank(1);
  assert.deepEqual({ ok: result.ok, count: result.count, total: result.total }, { ok: true, count: 30, total: 30 });
  assert.equal(progression.state.inventory.length, 5);
  assert.equal(progression.state.aquarium.length, 30);
  assert.equal(progression.state.aquariumTankDisplays[0].length, 0);
  assert.equal(progression.state.aquariumTankDisplays[1].length, 30);
  assert.equal(progression.state.aquariumTankDisplays[1][0], 'specimen-34');
  assert.equal(progression.autoFillAquariumTank(1).ok, false);

  const movingId = progression.state.aquariumTankDisplays[1][0];
  assert.equal(progression.moveAquariumSpecimen(movingId, { inventory: true }).ok, true);
  assert.equal(progression.moveAquariumSpecimen(movingId, { tankIndex: 0 }).ok, true);
  assert.ok(progression.state.aquariumTankDisplays[0].includes(movingId));
  assert.ok(!progression.state.aquariumTankDisplays[1].includes(movingId));
  const beforeLocation = progression.state.aquariumTankDisplays[0].slice();
  assert.equal(progression.setAquariumShowcase(movingId, true).ok, true);
  assert.deepEqual(progression.state.aquariumTankDisplays[0], beforeLocation);
});

test('v17 multiplayer starts directly at Hearthward and result recast owns press/release', async () => {
  const game = await readFile(new URL('../src/game.js', import.meta.url), 'utf8');
  const fishing = await readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8');
  const aquariumUi = await readFile(new URL('../src/ui/aquarium.js', import.meta.url), 'utf8');
  assert.match(game, /getMultiplayerHomeArrival\?\.\(slotIndex\)/);
  assert.doesNotMatch(game, /applyAuthoritativeRunSeed[\s\S]{0,500}chooseStart/);
  assert.match(game, /onFishingResultKeyUp/);
  assert.match(game, /fishingResultActionForDirection\(event\.code\) !== 'recast'/);
  assert.match(game, /releaseResultRecast/);
  assert.match(fishing, /beginResultRecast[\s\S]*setState\('charging'/);
  assert.match(fishing, /releaseResultRecast[\s\S]*this\.startCast\(\)/);
  assert.doesNotMatch(fishing, /const recastCharge = this\.lastCastCharge/);
  assert.match(aquariumUi, /data-aquarium-action="inventory"/);
  assert.match(aquariumUi, /data-aquarium-action="move-location"/);
  assert.match(aquariumUi, /Presentation only/);
});

test('v17 Skyreach is enabled, spans 1,000 playable feet, and keeps a hollow four-route structure', async () => {
  const location = getWorldLocation('skyreach-foundation');
  assert.equal(location.displayName, 'Skyreach Foundation');
  assert.equal(location.destination.enabled, true);
  assert.equal(SKYREACH_TOWER_CONFIG.playableHeight, 304.8);
  assert.equal(SKYREACH_TOWER_CONFIG.routeCount, 4);
  assert.ok(SKYREACH_TOWER_CONFIG.crownHeight > SKYREACH_TOWER_CONFIG.playableHeight);
  assert.equal(SKYREACH_TOWER_CONFIG.movingObstacleCount, 12);
  assert.equal(FISHING_WATER_COUNTS.total, 30);
  assert.deepEqual(SKYREACH_FISHING_DESCRIPTORS.map((water) => water.id),
    ['skyreach-toilet', 'skyreach-rooftop-pool']);
  const mapWaterIds = new Set(createMountainMapData().waters.map((water) => water.id));
  assert.ok(SKYREACH_FISHING_DESCRIPTORS.every((water) => mapWaterIds.has(water.id)));
  const sides = new Set(Array.from({ length: 16 }, (_, index) => skyreachRectanglePoint(index / 16).side));
  assert.deepEqual([...sides].sort(), ['east', 'north', 'south', 'west']);
  const source = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  for (const contract of ['Skyreach fountain lower basin', 'Skyreach midpoint bathroom floor', 'skyreach-toilet',
    'skyreach-rooftop-pool', 'swimmable: true', 'addSkyreachMovingPlatform', 'getSurfaceMotion']) assert.match(source, new RegExp(contract));
});
