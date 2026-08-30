import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAYER_FOOT_OFFSET } from '../src/config.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import { getEcologySelection } from '../src/fishing/fish-ecology.js';
import {
  SAVE_SLOT_COUNT,
  SAVE_SLOTS_STORAGE_KEY,
  SAVE_STORAGE_KEY,
  SaveSystem,
  defaultSave
} from '../src/persistence/save-system.js';
import {
  MAP_ITEMS,
  SMALL_ISLAND_LOCATIONS,
  WORLD_LOCATIONS
} from '../src/world/world-locations.js';
import { CheatGate } from '../src/debug/cheat-gate.js';
import { MountainWorld, START_LOCATIONS, createMountainMapData } from '../src/world/mountain-v2.js';
import { RunManager } from '../src/world/run-manager.js';
import { MountainMapMenu } from '../src/ui/mountain-map.js';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('v9 registry has a main destination and six small, docked islands', () => {
  assert.equal(WORLD_LOCATIONS.length, 7);
  assert.equal(SMALL_ISLAND_LOCATIONS.length, 6);
  assert.ok(SMALL_ISLAND_LOCATIONS.every((location) => Number.isFinite(location.angle) && Number.isFinite(location.radius)));
  assert.ok(SMALL_ISLAND_LOCATIONS.every((location) => location.dock?.arrivalPosition));
  const cave = SMALL_ISLAND_LOCATIONS.find((location) => location.id === 'cave-fishing-island');
  const normal = SMALL_ISLAND_LOCATIONS.find((location) => location.id === 'normal-fishing-island');
  assert.ok(Math.hypot(
    cave.worldPosition.x - normal.worldPosition.x,
    cave.worldPosition.z - normal.worldPosition.z
  ) > 550);
  assert.deepEqual(MAP_ITEMS.map((item) => item.id), ['paper-map', 'gps-map']);
  assert.ok(MAP_ITEMS[1].price >= MAP_ITEMS[0].price * 5);
});

test('boat arrival lookup reaches an island and randomizes main docks', () => {
  const world = Object.create(MountainWorld.prototype);
  const island = world.chooseTravelArrival('home-island', () => 0);
  assert.equal(island.location.id, 'home-island');
  assert.equal(island.dockId, 'home-island-dock');
  const first = world.chooseTravelArrival('main-mountain', () => 0);
  const last = world.chooseTravelArrival('main-mountain', () => .9999);
  assert.equal(first.dockId, `${START_LOCATIONS[0].id}-dock`);
  assert.equal(last.dockId, `${START_LOCATIONS.at(-1).id}-dock`);
  assert.notEqual(first.dockId, last.dockId);
});

test('shop interaction exists only in the customer space beside its counter', () => {
  const world = Object.create(MountainWorld.prototype);
  world.homeInteractions = [];
  world.materials = {
    wood: {}, cabinWall: {}, cabinRoof: {}, cabinTrim: {}
  };
  world.createStructureRoot = () => ({});
  world.addStructureBox = () => ({});
  world.buildShopOutpost();

  const shop = SMALL_ISLAND_LOCATIONS.find((location) => location.id === 'shop-island');
  const floorY = shop.elevation + .2;
  const customerPosition = world.point(
    shop.angle, shop.radius + 2.65, floorY + PLAYER_FOOT_OFFSET + .1
  );
  assert.equal(world.getNearestHomeInteraction(customerPosition)?.id, 'shop-counter');
  assert.equal(world.getNearestHomeInteraction(START_LOCATIONS[0].position), null);
  assert.equal(world.getNearestHomeInteraction(world.point(
    shop.angle, shop.radius - 2, floorY + PLAYER_FOOT_OFFSET
  )), null);
});

test('Home action resolves to the cabin porch instead of the run spawn', () => {
  const world = Object.create(MountainWorld.prototype);
  world.homeCabinFloorY = .98;
  const home = world.getHomeArrival();
  const start = START_LOCATIONS[0];
  assert.equal(home.locationId, 'home-island');
  assert.match(home.label, /Cabin/);
  assert.ok(Math.hypot(home.position.x - start.position.x, home.position.z - start.position.z) > 100);

  let teleported = null;
  let cameraYaw = null;
  const manager = Object.assign(Object.create(RunManager.prototype), {
    debugQueue: [{ type: 'home' }],
    status: 'ended',
    endedTime: 2,
    fishing: { cancel() {} },
    player: { teleport: (position, facingYaw) => { teleported = { position, facingYaw }; } },
    camera: { setYaw: (yaw) => { cameraYaw = yaw; } },
    world: {
      getHomeArrival: () => home,
      setDeveloperCourseVisible() {}
    },
    currentStart: start
  });
  manager.processDebugQueue();
  assert.deepEqual(teleported, { position: home.position, facingYaw: home.facingYaw });
  assert.equal(cameraYaw, home.facingYaw);
  assert.equal(manager.banner.title, 'BACK AT CABIN');
});

test('data-derived world map includes islands, docks, waters, and in-bounds GPS projection', () => {
  const data = createMountainMapData();
  assert.equal(data.locations.length, 7);
  assert.equal(data.docks.length, 12);
  assert.equal(data.waters.length, 24);
  const menu = Object.create(MountainMapMenu.prototype);
  menu.mapData = data;
  for (const location of data.locations) {
    const point = menu.project(location.position);
    assert.ok(point.x >= 25 && point.x <= 495);
    assert.ok(point.y >= 25 && point.y <= 495);
  }
});

test('path fishing zones follow local surface height while sharing one ecology table', () => {
  const zone = new FishingZone({
    id: 'uniform-waterfall', label: 'Uniform Waterfall', center: { x: 0, z: 5 },
    shape: 'path', pathWidth: 2, pathPoints: [{ x: 0, y: 12, z: 0 }, { x: 0, y: 2, z: 10 }],
    surfaceY: 7, fishIds: [], depth: 'shallow'
  });
  zone.tier = 'waterfall';
  zone.waterType = 'waterfall-pool';
  zone.theme = 'fallglass';
  zone.uniformProbabilities = true;
  assert.equal(zone.resolveSurfaceY({ x: 0, z: 1 }), 11);
  assert.equal(zone.resolveSurfaceY({ x: 0, z: 9 }), 3);
  const upper = getEcologySelection(zone, { x: 0, z: 1 });
  const lower = getEcologySelection(zone, { x: 0, z: 9 });
  assert.deepEqual(upper.habitatWeights, lower.habitatWeights);
});

test('legacy single save migrates to slot 1 and other slots stay independent', () => {
  const legacy = defaultSave();
  legacy.progression.money = 321;
  const storage = new MemoryStorage({ [SAVE_STORAGE_KEY]: JSON.stringify(legacy) });
  const saves = new SaveSystem(storage);
  assert.equal(SAVE_SLOT_COUNT, 4);
  assert.equal(saves.getSlotSummaries()[0].money, 321);
  assert.ok(storage.getItem(SAVE_SLOTS_STORAGE_KEY));
  assert.equal(saves.createSlot('slot-2'), true);
  assert.equal(saves.selectSlot('slot-2'), true);
  saves.data.progression.money = 77;
  assert.equal(saves.save(), true);
  assert.equal(saves.getSlotSummaries()[0].money, 321);
  assert.equal(saves.getSlotSummaries()[1].money, 77);
  assert.equal(saves.resetSlot('slot-2'), true);
  assert.equal(saves.getSlotSummaries()[0].money, 321);
});

test('cheat gate cancels a tap and enables only after a complete hold', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const windowTarget = new EventTarget();
  const indicator = { hidden: true, textContent: '', style: { setProperty() {} } };
  globalThis.window = windowTarget;
  globalThis.document = { querySelector: () => indicator };
  const keyEvent = (type) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: 'F1' }, repeat: { value: false } });
    return event;
  };
  try {
    const tapGate = new CheatGate(35).install();
    windowTarget.dispatchEvent(keyEvent('keydown'));
    windowTarget.dispatchEvent(keyEvent('keyup'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(tapGate.enabled, false);
    tapGate.destroy();

    const holdGate = new CheatGate(35).install();
    windowTarget.dispatchEvent(keyEvent('keydown'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(holdGate.enabled, true);
    holdGate.destroy();
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
