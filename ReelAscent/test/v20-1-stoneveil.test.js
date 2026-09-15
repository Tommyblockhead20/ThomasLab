import test from 'node:test';
import assert from 'node:assert/strict';
import MAP_EDITOR_PATCH from '../src/world/map-editor-patch.json' with { type: 'json' };
import { PLAYER_CONFIG } from '../src/config.js';
import {
  AUTHORED_STONEVEIL_CORE_ACTIVE,
  MOUNTAIN_CENTER,
  MOUNTAIN_FISHING_LOCATIONS,
  shouldBuildLegacyCaveShell
} from '../src/world/mountain-v2.js';
import { getBakedTerrainBoundarySamples } from '../src/world/map-editor-runtime.js';

test('frozen Stoneveil terrain is active and supplies a complete shoreline profile', () => {
  assert.equal(AUTHORED_STONEVEIL_CORE_ACTIVE, true);
  const boundary = getBakedTerrainBoundarySamples(MAP_EDITOR_PATCH, MOUNTAIN_CENTER, 360);
  assert.equal(boundary.samples.length, 360);
  assert.ok(boundary.maximumRadius > 200);
  assert.ok(boundary.samples.every((point) => point.length === 3 && point.every(Number.isFinite)));
});

test('authored main caves skip legacy shells while offshore Basalt remains procedural', () => {
  const caves = MOUNTAIN_FISHING_LOCATIONS.filter((location) => location.cave);
  const mainCaves = caves.filter((location) => !location.offshore);
  const offshoreCaves = caves.filter((location) => location.offshore);
  assert.ok(mainCaves.length >= 4);
  assert.ok(offshoreCaves.some((location) => location.id === 'basalt-grotto'));
  assert.ok(mainCaves.every((location) => !shouldBuildLegacyCaveShell(location, true)));
  assert.ok(offshoreCaves.every((location) => shouldBuildLegacyCaveShell(location, true)));
  assert.ok(caves.every((location) => shouldBuildLegacyCaveShell(location, false)));
});

test('v20.1 adds only the requested three-degree walking tolerance', () => {
  assert.equal(PLAYER_CONFIG.maxSlopeDegrees, 47);
  assert.equal(PLAYER_CONFIG.slideSlopeDegrees, 51);
  assert.equal(PLAYER_CONFIG.slideExitSlopeDegrees, 46);
  assert.equal(PLAYER_CONFIG.hardNoStandSlopeDegrees, 55);
});
