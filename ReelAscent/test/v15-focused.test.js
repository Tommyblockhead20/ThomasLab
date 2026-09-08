import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { attachZoneEcology } from '../src/fishing/fish-ecology.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import {
  AQUARIUM_MAX_TANKS,
  AQUARIUM_TANK_CAPACITY,
  AQUARIUM_TANK_UPGRADES,
  normalizeAquariumTankDisplays
} from '../src/progression/aquarium.js';
import { normalizeProgressionState } from '../src/progression/progression-save.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import {
  FROSTHOOK_COLD_OCEAN_DESCRIPTOR,
  MOUNTAIN_FISHING_LOCATIONS,
  MID_MOUNTAIN_SPIRAL_CONFIG
} from '../src/world/mountain-v2.js';
import { SHARK_HAZARD_CONFIG } from '../src/world/ocean-shark-hazard.js';
import { SATELLITE_WORLD_LOCATIONS } from '../src/world/world-locations.js';

const here = new URL('..', import.meta.url);
class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const specimen = (index, value = index + 1) => ({
  specimenId: `v15-${index}`, speciesId: 'bluegill', name: 'Bluegill', rarity: 'Common',
  length: 8, weight: 1, value, quality: 'GOOD', provenance: { legitimate: true }
});

test('v15 Aquarium migrates losslessly into 30-creature tanks with centralized prices', () => {
  assert.equal(AQUARIUM_TANK_CAPACITY, 30);
  assert.equal(AQUARIUM_MAX_TANKS, 10);
  assert.deepEqual(AQUARIUM_TANK_UPGRADES.map((tier) => tier.price), [0, 2500, 5000, 9000, 15000, 24000, 36000, 50000, 68000, 90000]);
  const aquarium = Array.from({ length: 67 }, (_, index) => specimen(index));
  const migrated = normalizeProgressionState({ aquariumCapacityTier: 0, aquarium });
  assert.equal(migrated.aquarium.length, 67);
  assert.equal(migrated.aquariumTankCount, 3);
  assert.equal(new Set(migrated.aquariumTankDisplays.flat()).size, 67);
  assert.deepEqual(migrated.aquariumTankDisplays.map((ids) => ids.length), [30, 30, 7]);
});

test('v15 Aquarium assignments are unique and income uses displayed creatures only', () => {
  const aquarium = [specimen(1, 500), specimen(2, 200), specimen(3, 100)];
  const normalized = normalizeAquariumTankDisplays(aquarium, 2, [['v15-1'], ['v15-1', 'v15-2']], [true, true]);
  assert.deepEqual(normalized.displays, [['v15-1'], ['v15-2']]);
  const save = new SaveSystem(new MemoryStorage());
  save.data.progression = normalizeProgressionState({
    aquarium, aquariumTankCount: 2, aquariumTankDisplays: [['v15-1'], []], aquariumTankManual: [true, true]
  });
  const progression = new ProgressionSystem(save);
  const economy = progression.getAquariumEconomy();
  assert.equal(economy.displayedCount, 1);
  assert.equal(economy.exhibitedValue, 500);
  assert.equal(economy.payout, 5);
  assert.deepEqual(economy.tanks.map((tank) => tank.exhibitedValue), [500, 0]);
  assert.equal(economy.tanks.reduce((total, tank) => total + tank.payout, 0), economy.payout);
});

test('save slots keep collection, Aquarium, money, tutorials, and durable identity isolated', () => {
  const saves = new SaveSystem(new MemoryStorage());
  const firstId = saves.data.saveId;
  saves.data.progression.money = 321;
  saves.data.progression.aquarium = [specimen(1, 99)];
  saves.data.progression.appearance.shirtTint = '#123456';
  saves.data.collection.bluegill = { discovered: true, catches: 4 };
  saves.data.lifetime.fishCaught = 77;
  saves.data.trailBadges.unlocked = ['developer-route'];
  saves.markTutorialSeen('fishing');
  saves.save();
  assert.equal(saves.createSlot('slot-2'), true);
  assert.equal(saves.selectSlot('slot-2'), true);
  assert.notEqual(saves.data.saveId, firstId);
  assert.equal(saves.data.progression.money, 0);
  assert.equal(saves.data.progression.aquarium.length, 0);
  assert.equal(saves.data.collection.bluegill, undefined);
  assert.equal(saves.data.lifetime.fishCaught, 0);
  assert.deepEqual(saves.data.trailBadges.unlocked, []);
  assert.notEqual(saves.data.progression.appearance.shirtTint, '#123456');
  assert.equal(saves.hasSeenTutorial('fishing'), false);
  assert.equal(saves.replaceSlotData('slot-3', saves.getSlotSnapshot('slot-1')), true);
  assert.notEqual(saves.getSlotSnapshot('slot-3').saveId, firstId, 'copying a slot must fork its identity');
  assert.equal(saves.selectSlot('slot-1'), true);
  assert.equal(saves.data.progression.money, 321);
  assert.equal(saves.data.lifetime.fishCaught, 77);
  assert.deepEqual(saves.data.trailBadges.unlocked, ['developer-route']);
});

test('Hearthward pond is common-only and Frosthook has continuous dedicated cold water', () => {
  const pond = MOUNTAIN_FISHING_LOCATIONS.find((entry) => entry.id === 'hearthward-pond');
  assert.deepEqual(pond.allowedRarities, ['Common']);
  const zone = new FishingZone({ id: pond.id, label: pond.label, center: { x: 0, z: 0 }, radii: { x: 4, z: 3 }, surfaceY: 0, fishIds: pond.fish });
  Object.assign(zone, { tier: pond.tier, waterType: pond.waterType, theme: pond.theme, ecologyThemes: pond.ecologyThemes, allowedFishIds: pond.fish, allowedRarities: pond.allowedRarities });
  attachZoneEcology(zone);
  assert.ok(zone.fishIds.length > 0);
  assert.ok(zone.fishIds.every((id) => FISH_SPECIES.find((fish) => fish.id === id)?.rarity === 'Common'));
  const frosthook = SATELLITE_WORLD_LOCATIONS.find((entry) => entry.id === 'cold-island');
  assert.ok(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.innerRadius <= Math.min(frosthook.radii.x, frosthook.radii.z) + .5);
  assert.equal(FROSTHOOK_COLD_OCEAN_DESCRIPTOR.label, 'Frosthook Cold Ocean');
});

test('v15 targeted world, creature, multiplayer, and shark contracts are wired', async () => {
  assert.ok(MID_MOUNTAIN_SPIRAL_CONFIG.priority660To700StepHeight < MID_MOUNTAIN_SPIRAL_CONFIG.generalStepHeight / 1.5);
  assert.equal(SHARK_HAZARD_CONFIG.safeDistance, 15);
  const [model, game, clientProtocol, serverProtocol, serverConnection, aquariumUi] = await Promise.all([
    readFile(new URL('src/fishing/specimen-model.js', here), 'utf8'),
    readFile(new URL('src/game.js', here), 'utf8'),
    readFile(new URL('src/multiplayer/protocol.js', here), 'utf8'),
    readFile(new URL('server/src/protocol.js', here), 'utf8'),
    readFile(new URL('server/src/connection.js', here), 'utf8'),
    readFile(new URL('src/ui/aquarium.js', here), 'utf8')
  ]);
  for (const id of ['penguin', 'polar_bear', 'giant_panda']) assert.match(model, new RegExp(id));
  assert.match(model, /enforceCreatureAttachmentInvariant\(root, archetype\)/);
  assert.match(game, /OceanSharkHazard/);
  assert.match(clientProtocol, /AQUARIUM_SHOWCASE/);
  assert.match(serverProtocol, /AQUARIUM_SHOWCASE/);
  assert.match(serverConnection, /slice\(0, 30\)/);
  assert.match(aquariumUi, /MY MULTIPLAYER TANK/);
  assert.match(aquariumUi, /read only/i);
});
