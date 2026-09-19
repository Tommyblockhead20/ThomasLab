import test from 'node:test';
import assert from 'node:assert/strict';
import SCENE from '../src/world/library-island-v2.scene.json' with { type: 'json' };
import { defaultSave, migrate, SAVE_SCHEMA_VERSION, SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import {
  getDestinationAccess,
  normalizeDestinationProgression,
  refreshDestinationProgression
} from '../src/progression/destination-progression.js';
import { WORLD_LOCATION_BY_ID } from '../src/world/world-locations.js';
import { FISH_SPECIES, getWeightedSpeciesTable } from '../src/fishing/fish-data.js';
import { getEcologySelection } from '../src/fishing/fish-ecology.js';
import { libraryProductionTerrain } from '../tools/map-editor/library-scene-adapter.js';
import { makeCleanCaveEditorLevel } from '../tools/map-editor/production-island-adapter.js';
import { recordActionSnapshot, redoActionSnapshot, undoActionSnapshot } from '../tools/map-editor/action-history.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('v23 destination thresholds are per-save, permanent, and preserve known unavailable states', () => {
  const save = defaultSave();
  assert.equal(getDestinationAccess(save, 'normal-fishing-island').state, 'locked-cloud');
  save.trailBadges.uniqueSpeciesCaught = Array.from({ length: 25 }, (_, index) => `species-${index}`);
  refreshDestinationProgression(save);
  assert.equal(getDestinationAccess(save, 'normal-fishing-island').playable, true);
  save.trailBadges.uniqueSpeciesCaught = [];
  assert.equal(getDestinationAccess(save, 'normal-fishing-island').playable, true, 'stored unlock is permanent');

  save.trailBadges.unlocked = ['badge-a', 'badge-b'];
  save.destinationProgression = normalizeDestinationProgression(save.destinationProgression, save);
  const cave = getDestinationAccess(save, 'cave-fishing-island');
  assert.equal(cave.state, 'known-unavailable');
  assert.equal(cave.playable, false);
  assert.equal(getDestinationAccess(save, 'skyreach-foundation').state, 'known-unavailable');
  assert.equal(WORLD_LOCATION_BY_ID.get('normal-fishing-island').displayName, 'Mangrove Island');
});

test('v23.1 migration does not confuse old ordinary travel with a Bluewater purchase', () => {
  const old = defaultSave();
  old.version = 15;
  delete old.boat;
  old.lifetime.boatTrips = 3;
  const migrated = migrate(old);
  assert.equal(migrated.version, SAVE_SCHEMA_VERSION);
  assert.deepEqual(migrated.boat, { owned: false, purchasedAt: 0, grandfathered: false });
  assert.equal(defaultSave().boat.owned, false);
});

test('v23 Trail Boat costs $2000 and persists only on the active save', () => {
  const storage = new MemoryStorage();
  let saves = new SaveSystem(storage);
  let progression = new ProgressionSystem(saves);
  progression.addMoney(2000);
  const result = progression.purchaseBoat();
  assert.equal(result.ok, true);
  assert.equal(progression.getSnapshot().money, 0);
  assert.equal(saves.data.boat.owned, true);
  saves = new SaveSystem(storage);
  progression = new ProgressionSystem(saves);
  assert.equal(progression.ownsBoat(), true);
});

test('all Athenaeum waters resolve to nonempty closed mythical pools without future reservations', () => {
  const species = new Map(FISH_SPECIES.map((entry) => [entry.id, entry]));
  const pools = [];
  for (const water of SCENE.waters) {
    assert.equal(water.mythicalOnly, true);
    assert.ok(water.fishIds.length >= 8);
    assert.ok(water.fishIds.every((id) => species.has(id) && !species.get(id).futureReserved));
    const zone = {
      id: water.id, label: water.label, center: { x: 0, z: 0 }, radii: { x: 5, z: 4 },
      tier: water.tier ?? 'lower', waterType: water.waterType, theme: water.theme,
      ecologyThemes: water.ecologyThemes, cave: water.cave,
      authoredFishIds: [...water.fishIds], allowedFishIds: [...water.fishIds],
      probabilityGroup: water.probabilityGroup ?? water.id,
      modifiers: { maximumSpeciesProbability: .25 }
    };
    const selection = getEcologySelection(zone, zone.center);
    assert.ok(selection.fishIds.length >= 8);
    assert.ok(selection.fishIds.every((id) => water.fishIds.includes(id)));
    const table = getWeightedSpeciesTable(selection.fishIds, {
      rarityTier: selection.habitat.rarityTier,
      habitatWeights: selection.habitatWeights,
      maximumSpeciesProbability: .25
    });
    assert.ok(Math.abs(table.reduce((sum, entry) => sum + entry.probability, 0) - 1) < 1e-9);
    pools.push(selection.fishIds.slice().sort().join('|'));
  }
  assert.equal(new Set(pools).size, 3, 'each water keeps a distinct pool');
});

test('editor v23 provides a refined Library mesh and clean Cave baseline', () => {
  const library = libraryProductionTerrain();
  assert.ok(library.indices.length / 3 >= 6000);
  assert.match(library.metadata.refinement, /two topology-preserving/);

  const cave = makeCleanCaveEditorLevel({ id: 'cave-fishing-island', label: 'Cave Fishing Island' });
  assert.equal(cave.metadata.cleanCaveBaselineV23, true);
  assert.equal(cave.terrain.mode, 'authored-triangle-mesh');
  assert.ok(cave.terrain.positions.length / 3 >= 900);
  assert.deepEqual(cave.waters.map((water) => water.id), ['basalt-grotto']);
  assert.equal(cave.objects.length, 0);
});

test('editor action history interleaves terrain and object actions one transaction at a time', () => {
  const past = [];
  const future = [];
  let state = [];
  const act = (label) => {
    recordActionSnapshot(past, future, JSON.stringify(state));
    state = [...state, label];
  };
  ['raise A', 'raise B', 'move object 1', 'smooth C', 'move object 2'].forEach(act);
  for (let expected = 4; expected >= 0; expected -= 1) {
    state = JSON.parse(undoActionSnapshot(past, future, JSON.stringify(state)));
    assert.equal(state.length, expected);
  }
  for (let expected = 1; expected <= 5; expected += 1) {
    state = JSON.parse(redoActionSnapshot(past, future, JSON.stringify(state)));
    assert.equal(state.length, expected);
  }
  assert.deepEqual(state, ['raise A', 'raise B', 'move object 1', 'smooth C', 'move object 2']);
});
