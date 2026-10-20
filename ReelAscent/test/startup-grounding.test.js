import test from 'node:test';
import assert from 'node:assert/strict';
import MAP_EDITOR_PATCH from '../src/world/map-editor-patch.json' with { type: 'json' };
import { createBakedTerrainGroundQuery } from '../src/world/map-editor-runtime.js';
import * as pc from 'playcanvas';
import { MountainWorld, createMountainMapData } from '../src/world/mountain-v2.js';
import { MAIN_WORLD_LOCATION, WORLD_LOCATIONS } from '../src/world/world-locations.js';

test('finer terrain buckets preserve the authored mountain ground hits', () => {
  const original = createBakedTerrainGroundQuery(MAP_EDITOR_PATCH, { cellSize: 8 });
  const optimized = createBakedTerrainGroundQuery(MAP_EDITOR_PATCH, { cellSize: 2 });
  // Cover the summit, slopes, shore, negative coordinates, and bucket boundaries.
  for (let index = 0; index < 20000; index += 1) {
    const radius = 5 + (index % 141);
    const angle = index * 2.399963229728653;
    const x = index % 20 === 0 ? Math.round(260 + Math.cos(angle) * radius) : 260 + Math.cos(angle) * radius;
    const z = index % 20 === 0 ? Math.round(Math.sin(angle) * radius) : Math.sin(angle) * radius;
    assert.deepEqual(optimized(x, z), original(x, z), `ground at ${x}, ${z}`);
  }
});

test('inactive island children stay inactive during construction and activate on travel', () => {
  const markers = new Map();
  const world = {
    activeLocationId: MAIN_WORLD_LOCATION.id,
    buildTarget: new pc.Entity('world'),
    locationLoadGroups: new Map(),
    buildBluewaterBoat(location, group) {
      const marker = new pc.Entity('boat render marker');
      group.addChild(marker);
      markers.set(location.id, marker);
      assert.equal(marker.enabled, false, 'offshore children must not activate during construction');
    }
  };
  // Initialize the test root as PlayCanvas initializes its application root.
  world.buildTarget._notifyHierarchyStateChanged(world.buildTarget, true);
  const locations = WORLD_LOCATIONS.filter((location) => location.type === 'open-water-boat');
  assert.ok(locations.length > 0);
  for (const location of locations) MountainWorld.prototype.buildOceanIsland.call(world, location);
  for (const destination of [...locations, MAIN_WORLD_LOCATION]) {
    MountainWorld.prototype.setActiveLocation.call(world, destination.id);
    for (const location of locations) {
      assert.equal(markers.get(location.id).enabled, destination.id === location.id);
    }
  }
  world.buildTarget.destroy();
});

test('deferred maps preserve every contour, destination, water and navigation marker', () => {
  const full = createMountainMapData();
  const lazy = createMountainMapData({ deferContours: true });
  assert.deepEqual(lazy.waters, full.waters);
  assert.deepEqual(lazy.locations, full.locations);
  assert.deepEqual(lazy, full);
  assert.equal(lazy.contours, lazy.contours, 'reopening a map reuses its computed terrain');
});
