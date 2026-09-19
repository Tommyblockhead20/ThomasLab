import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSave, migrate, SAVE_SCHEMA_VERSION, SaveSystem } from '../src/persistence/save-system.js';
import { getDestinationAccess } from '../src/progression/destination-progression.js';
import { ProgressionSystem, oldManObtainableSpecies } from '../src/progression/progression.js';
import { setGamepadBinding, DEFAULT_GAMEPAD_BINDINGS } from '../src/player/movement.js';
import {
  RHYTHM_CHORD_INPUT_WINDOW_SECONDS,
  RHYTHM_CONTROLLER_CHORD_INPUT_WINDOW_SECONDS
} from '../src/fishing/rhythm-session.js';
import { buildCleanBasaltTerrainLocal, buildCleanBasaltTerrainWorld } from '../src/world/cave-island-v23.js';
import { WORLD_LOCATION_BY_ID } from '../src/world/world-locations.js';
import { makeCleanCaveEditorLevel } from '../tools/map-editor/production-island-adapter.js';
import { waterPathPose } from '../tools/map-editor/water-path-tools.js';
import { validateLibraryEcology } from '../src/fishing/library-ecology-validation.js';
import { buildWorldParityDiagnostic } from '../tools/map-editor/world-parity.js';
import { Room } from '../server/src/room.js';
import { GAME_VERSION } from '../src/version.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('v23.1 build identity and room state expose an authoritative shared clock', () => {
  assert.equal(GAME_VERSION, 'v23.1');
  const before = Date.now();
  const state = new Room('1234', 10, 99).stateFor({ reconnectToken: 'test-token' });
  assert.ok(state.serverTime >= before && state.serverTime <= Date.now());
  assert.equal(state.runSeed, 99);
});

test('v23.1 Bluewater Boat gates only Bluewater and old travel history grants nothing', () => {
  const old = defaultSave();
  old.version = 15;
  delete old.boat;
  old.lifetime.boatTrips = 99;
  old.trailBadges.uniqueSpeciesCaught = Array.from({ length: 100 }, (_, index) => `species-${index}`);
  const migrated = migrate(old);
  assert.equal(migrated.version, SAVE_SCHEMA_VERSION);
  assert.equal(migrated.boat.owned, false);
  for (const id of ['home-island', 'shop-island', 'aquarium-island', 'normal-fishing-island', 'cold-island', 'veiled-athenaeum']) {
    assert.equal(getDestinationAccess(migrated, id).playable, true, id);
  }
  assert.equal(getDestinationAccess(migrated, 'bluewater-reach').playable, false);

  const purchasedV16 = { ...migrated, version: 16, boat: { owned: true, purchasedAt: 123456, grandfathered: false } };
  assert.equal(migrate(purchasedV16).boat.owned, true);
  const accidentalV16 = { ...migrated, version: 16, boat: { owned: true, purchasedAt: 0, grandfathered: true } };
  assert.equal(migrate(accidentalV16).boat.owned, false);
});

test('v23.1 Basalt production and editor terrain are the same translated mesh', () => {
  const location = WORLD_LOCATION_BY_ID.get('cave-fishing-island');
  const local = buildCleanBasaltTerrainLocal();
  const runtime = buildCleanBasaltTerrainWorld(location);
  const editor = makeCleanCaveEditorLevel({ id: 'cave-fishing-island', label: 'Basalt Hollow' });
  assert.deepEqual(editor.terrain.positions, local.positions);
  assert.deepEqual(editor.terrain.indices, local.indices);
  assert.equal(runtime.vertices.length, local.positions.length / 3);
  assert.deepEqual(runtime.triangles.flat(), local.indices);
  assert.deepEqual(runtime.vertices[0], [location.worldPosition.x + local.positions[0], local.positions[1], location.worldPosition.z + local.positions[2]]);
  const diagnostic = buildWorldParityDiagnostic({ id: 'cave-fishing-island' }, editor);
  assert.equal(diagnostic.status, 'shared-authority');
  assert.equal(diagnostic.terrainTriangles, local.indices.length / 3);
});

test('controller binding capture swaps conflicts and controller chord grace is isolated', () => {
  const result = setGamepadBinding('jump', DEFAULT_GAMEPAD_BINDINGS.fish, { ...DEFAULT_GAMEPAD_BINDINGS });
  assert.equal(result.ok, true);
  assert.equal(result.bindings.jump, DEFAULT_GAMEPAD_BINDINGS.fish);
  assert.equal(result.bindings.fish, DEFAULT_GAMEPAD_BINDINGS.jump);
  assert.equal(result.swappedAction, 'fish');
  assert.equal(RHYTHM_CHORD_INPUT_WINDOW_SECONDS, .075);
  assert.equal(RHYTHM_CONTROLLER_CHORD_INPUT_WINDOW_SECONDS, .2);
});

test('reverse lazy-river pose faces the actual direction of travel', () => {
  const path = { id: 'reverse', type: 'lazy-river', closed: true, direction: -1, flowSpeed: 1,
    points: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 }, { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 0 }] };
  const first = waterPathPose(path, 2);
  const later = waterPathPose(path, 2.05);
  const motion = { x: later.position.x - first.position.x, z: later.position.z - first.position.z };
  assert.ok(motion.x * first.tangent.x + motion.z * first.tangent.z > 0);
});

test('all three Library pools are distinct, mythical, obtainable and normalized', () => {
  const report = validateLibraryEcology();
  assert.equal(report.ok, true, report.errors.join('\n'));
  assert.equal(report.waters.length, 3);
  for (const water of report.waters) {
    assert.ok(water.candidates.length > 0);
    assert.ok(water.candidates.every((candidate) => candidate.mythicalReason && !candidate.futureReserved));
    assert.ok(Math.abs(water.totalProbability - 1) < 1e-8);
  }
});

test('Old Man request is one stable obtainable species and only that species gets exactly 2x', () => {
  const storage = new MemoryStorage();
  const saves = new SaveSystem(storage);
  const progression = new ProgressionSystem(saves);
  const now = new Date(2026, 8, 19, 12, 0, 0);
  const status = progression.getOldManDailySaleStatus(now);
  const again = progression.getOldManDailySaleStatus(now);
  assert.equal(again.requestedSpeciesId, status.requestedSpeciesId);
  assert.ok(oldManObtainableSpecies(saves.data).some((species) => species.id === status.requestedSpeciesId));
  assert.ok(!oldManObtainableSpecies(saves.data).some((species) => species.futureReserved));
  const nonmatch = oldManObtainableSpecies(saves.data).find((species) => species.id !== status.requestedSpeciesId);
  progression.state.inventory.push({ specimenId: 'wrong', speciesId: nonmatch.id, value: 25, provenance: { legitimate: true } });
  assert.equal(progression.sellOldManDailySpecimen('wrong', now).ok, false);
  assert.equal(progression.state.inventory.some((entry) => entry.specimenId === 'wrong'), true);
  progression.state.inventory.push({ specimenId: 'match', speciesId: status.requestedSpeciesId, value: 40, provenance: { legitimate: true } });
  const sold = progression.sellOldManDailySpecimen('match', now);
  assert.equal(sold.ok, true);
  assert.equal(sold.amount, 80);
  assert.equal(progression.getOldManDailySaleStatus(now).completed, true);
});
