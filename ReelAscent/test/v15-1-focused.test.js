import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { GAME_VERSION } from '../src/version.js';
import {
  DOCK_DECK_LOWERING,
  MOUNTAIN_FISHING_LOCATIONS,
  PUBLIC_AQUARIUM_CONFIG,
  distanceFromPolygonSafeEdge
} from '../src/world/mountain-v2.js';
import { SATELLITE_WORLD_LOCATIONS } from '../src/world/world-locations.js';

const here = new URL('..', import.meta.url);

test('v15.1 scales Glasswater and its exhibit tanks as one coordinated layout', () => {
  assert.equal(GAME_VERSION, 'v15.1');
  const glasswater = SATELLITE_WORLD_LOCATIONS.find((location) => location.id === 'aquarium-island');
  assert.ok(glasswater.radii.x >= 80 && glasswater.radii.z >= 60);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.width >= 70);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.depth >= 40);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.tankWidth >= 11);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.tankDepth >= 14);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.tankHeight >= 8);
  assert.ok(PUBLIC_AQUARIUM_CONFIG.waterlineY > PUBLIC_AQUARIUM_CONFIG.waterFloorY + 7);
});

test('shore safety is measured from a boundary rather than its center', () => {
  const square = [
    { x: -10, z: -10 }, { x: 10, z: -10 }, { x: 10, z: 10 }, { x: -10, z: 10 }
  ];
  assert.equal(distanceFromPolygonSafeEdge({ x: 0, z: 0 }, square), 0);
  assert.equal(distanceFromPolygonSafeEdge({ x: 15, z: 0 }, square), 5);
  assert.equal(distanceFromPolygonSafeEdge({ x: 10, z: 4 }, square), 0);
});

test('Aquarium ownership and explicit water containment are structural', async () => {
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.match(source, /cell\.root\.addChild\(model\.root\)/);
  assert.match(source, /model\.root\.parent !== resident\.tankRoot/);
  assert.match(source, /motionBounds/);
  assert.match(source, /clamp\(resident\.centerX/);
  assert.match(source, /maximumScale: 4\.25/);
  assert.doesNotMatch(source, /aquariumResidentRoot\.addChild\(model\.root\)/);
});

test('Cabin pond, doorway, bench, and docks use the v15.1 fixes', async () => {
  const pond = MOUNTAIN_FISHING_LOCATIONS.find((water) => water.id === 'hearthward-pond');
  assert.ok(pond.localOffset.z > 0, 'pond belongs in front of the cabin');
  assert.ok(DOCK_DECK_LOWERING > 0 && DOCK_DECK_LOWERING < .4);
  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.doesNotMatch(source, /Trail cabin open door/);
  assert.doesNotMatch(source, /Trail cabin door jamb/);
  assert.match(source, /Trail cabin front wall above doorway/);
  assert.match(source, /deckPosition = \{ \.\.\.position, y: position\.y - DOCK_DECK_LOWERING \}/);
  assert.match(source, /Hearthward pond bench back[\s\S]{0,180}z: 4\.08/);
  assert.match(source, /facingYaw: cabinYaw \+ 180/);
});
