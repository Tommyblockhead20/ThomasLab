import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SaveSystem } from '../src/persistence/save-system.js';
import { serializeProgress, validateProgressImport, PROGRESS_EXPORT_VERSION } from '../src/progression/progress-transfer.js';
import { DEFAULT_APPEARANCE } from '../src/player/appearance.js';
import {
  createOceanShelfRingRadii,
  HOME_CABIN_CONFIG,
  MOUNTAIN_FISHING_LOCATIONS,
  OCEAN_SHALLOW_WALK_END_RADIUS,
  OCEAN_WATER_INNER_RADIUS
} from '../src/world/mountain-v2.js';
import { SATELLITE_WORLD_LOCATIONS } from '../src/world/world-locations.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const completeAppearance = Object.freeze({
  ...DEFAULT_APPEARANCE,
  avatarType: 'human',
  skinTone: 'deep',
  shirtColor: 'lavender',
  pantsColor: 'navy',
  hairStyle: 'braids',
  hairColor: 'rose-gold',
  headwear: 'flower-crown',
  eyewear: 'aviators',
  faceAccessory: 'necklace',
  backAccessory: 'none',
  backpackColor: 'coral',
  blobColor: 'violet',
  shirtTint: '#123456',
  pantsTint: '#234567',
  hairTint: '#345678',
  accessoryTint: '#456789',
  blobTint: '#56789a'
});

test('v15.3 slot switch, reload, and export/import preserve the complete per-save payload', () => {
  const storage = new MemoryStorage();
  const saves = new SaveSystem(storage);
  saves.data.progression.appearance = { ...completeAppearance };
  saves.data.progression.money = 4321;
  saves.data.progression.ownedItems = ['field-map'];
  saves.data.collection.bluegill = { discovered: true, catches: 3, name: 'Bluegill' };
  saves.data.lifetime.fishCaught = 3;
  saves.data.trailBadges.unlocked = ['first-catch'];
  saves.data.runHistory = [{ highestElevation: 90, summitReached: false }];
  saves.data.tutorials = { fishing: true, climbing: true, dock: true };
  assert.equal(saves.save(), true);
  assert.equal(saves.createSlot('slot-2'), true);
  assert.equal(saves.selectSlot('slot-2'), true);
  saves.data.progression.appearance = { ...DEFAULT_APPEARANCE, shirtColor: 'moss' };
  saves.data.progression.money = 7;
  assert.equal(saves.save(), true);
  assert.equal(saves.selectSlot('slot-1'), true);
  assert.deepEqual(saves.data.progression.appearance, completeAppearance);
  assert.equal(saves.data.progression.money, 4321);

  const reloaded = new SaveSystem(storage);
  assert.deepEqual(reloaded.data.progression.appearance, completeAppearance);
  assert.deepEqual(reloaded.data.tutorials, { fishing: true, climbing: true, dock: true });
  assert.equal(reloaded.data.collection.bluegill.catches, 3);
  assert.deepEqual(reloaded.data.trailBadges.unlocked, ['first-catch']);
  assert.equal(reloaded.data.runHistory.length, 1);

  const exported = serializeProgress(reloaded.getSnapshot(), reloaded.getSlotMetadata('slot-1'));
  const imported = validateProgressImport(exported).save;
  assert.equal(PROGRESS_EXPORT_VERSION, 4);
  assert.equal(imported.saveId, reloaded.data.saveId);
  assert.deepEqual(imported.progression.appearance, completeAppearance);
  assert.deepEqual(imported.tutorials, { fishing: true, climbing: true, dock: true });
  assert.equal(imported.progression.money, 4321);
  assert.equal(imported.lifetime.fishCaught, 3);
});

test('Aquarium dock and arrival share the outward entrance axis', () => {
  const aquarium = SATELLITE_WORLD_LOCATIONS.find((location) => location.id === 'aquarium-island');
  const direction = {
    x: Math.cos(aquarium.angle * Math.PI / 180),
    z: Math.sin(aquarium.angle * Math.PI / 180)
  };
  const dockOffset = (aquarium.dock.worldPosition.x - aquarium.worldPosition.x) * direction.x
    + (aquarium.dock.worldPosition.z - aquarium.worldPosition.z) * direction.z;
  const arrivalOffset = (aquarium.dock.arrivalPosition.x - aquarium.worldPosition.x) * direction.x
    + (aquarium.dock.arrivalPosition.z - aquarium.worldPosition.z) * direction.z;
  assert.ok(dockOffset > arrivalOffset && arrivalOffset > 0);
});

test('world source binds Aquarium collision and interactions to moving tank modules', async () => {
  const source = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(source, /front viewing glass[\s\S]{0,180}cabinGlass, \{\}, true/);
  assert.match(source, /collisionEntities[\s\S]{0,900}syncStructureCollider/);
  assert.match(source, /id: `aquarium-tank-\$\{index \+ 1\}`/);
  assert.match(source, /cell\.interaction\.position = this\.aquariumPoint/);
  assert.match(source, /if \(interaction\.enabled === false\) continue/);
});

test('Hearthward water is below its bank and island mesh receives local pond rings', async () => {
  const pond = MOUNTAIN_FISHING_LOCATIONS.find((location) => location.id === 'hearthward-pond');
  assert.ok(pond.waterY <= HOME_CABIN_CONFIG.floorY - .18);
  const source = await readFile(new URL('../src/world/mountain-v2.js', import.meta.url), 'utf8');
  assert.match(source, /home-island' \? \[\.84, \.68, \.52, \.36, \.2\]/);
  assert.match(source, /const basinFloor = HOME_CABIN_CONFIG\.floorY - \.32/);
  assert.match(source, /Trail cabin rear gable course/);
  assert.match(source, /Frosthook offshore slush plate/);
});

test('Stoneveil shelf has a dense continuous near-shore collider profile', () => {
  const radii = createOceanShelfRingRadii();
  assert.ok(radii.includes(OCEAN_WATER_INNER_RADIUS));
  assert.ok(radii.includes(OCEAN_SHALLOW_WALK_END_RADIUS));
  const nearby = radii.filter((radius) => radius <= 270);
  assert.ok(nearby.slice(1).every((radius, index) => radius - nearby[index] <= 2));
});
