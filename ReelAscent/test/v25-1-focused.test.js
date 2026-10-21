import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CheatGate } from '../src/debug/cheat-gate.js';
import { getDestinationAccess, normalizeDestinationProgression } from '../src/progression/destination-progression.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { partitionTerrainBySupport } from '../src/world/map-editor-runtime.js';
import { aquariumResidentDisplayMultiplier, resolveAquariumResidentDisplays } from '../src/world/mountain-v2.js';
import { GAME_VERSION } from '../src/version.js';

test('v25.1 cheat activation survives browser-style F1 repeats and has a Shift+C fallback', async () => {
  assert.equal(GAME_VERSION, 'v25.1');
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const windowTarget = new EventTarget();
  const indicator = { hidden: true, textContent: '', style: { setProperty() {} } };
  globalThis.window = windowTarget;
  globalThis.document = { querySelector: () => indicator };
  const key = (code, repeat = false, shiftKey = false) => {
    const event = new Event('keydown', { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: repeat }, shiftKey: { value: shiftKey } });
    return event;
  };
  try {
    const gate = new CheatGate(20).install();
    windowTarget.dispatchEvent(key('F1'));
    const repeated = key('F1', true);
    windowTarget.dispatchEvent(repeated);
    assert.equal(repeated.defaultPrevented, true);
    await new Promise((resolve) => setTimeout(resolve, 28));
    assert.equal(gate.enabled, true);
    gate.destroy();
    const fallback = new CheatGate(20).install();
    windowTarget.dispatchEvent(key('KeyC', false, true));
    await new Promise((resolve) => setTimeout(resolve, 28));
    assert.equal(fallback.enabled, true);
    fallback.destroy();
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

test('all-islands override is per-save, durable through normalization, and does not grant badges', () => {
  const first = { boat: { owned: false }, destinationProgression: normalizeDestinationProgression({ debugUnlockedAll: true }), trailBadges: {} };
  const second = { boat: { owned: false }, destinationProgression: normalizeDestinationProgression({}), trailBadges: {} };
  for (const id of ['normal-fishing-island', 'cold-island', 'veiled-athenaeum', 'bluewater-reach']) {
    assert.equal(getDestinationAccess(first, id).playable, true, id);
  }
  assert.equal(getDestinationAccess(second, 'normal-fishing-island').playable, false);
  assert.equal(first.trailBadges.unlocked, undefined);
  assert.equal(getDestinationAccess(first, 'unknown-island').reason, '');
  const storage = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) { this.values.set(key, String(value)); } };
  const saves = new SaveSystem(storage);
  new ProgressionSystem(saves).debugUnlockAllIslands();
  assert.equal(new SaveSystem(storage).data.destinationProgression.debugUnlockedAll, true);
  assert.equal(saves.createSlot('slot-2'), true);
  assert.equal(saves.selectSlot('slot-2'), true);
  assert.equal(saves.data.destinationProgression.debugUnlockedAll, false);
});

test('aquarium displays restore imported tank residents and never blank the local multiplayer tank', () => {
  const fish = { specimenId: 'fish-1', speciesId: 'bluegill', length: 10, weight: 1 };
  const progression = { aquarium: [fish], aquariumTankCount: 1, aquariumTankDisplays: [[]] };
  const solo = resolveAquariumResidentDisplays(progression);
  assert.deepEqual(solo.displays[0].specimens, [fish]);
  const social = resolveAquariumResidentDisplays(progression, [
    { playerId: 'local', displayName: 'Me', isLocal: true, specimens: [] },
    { playerId: 'remote', displayName: 'Friend', isLocal: false, specimens: [] }
  ]);
  assert.deepEqual(social.displays[0].specimens, [fish]);
  assert.deepEqual(social.displays[1].specimens, []);
  assert.equal(aquariumResidentDisplayMultiplier(.2), 5);
  assert.equal(aquariumResidentDisplayMultiplier(.05), 8);
  assert.equal(aquariumResidentDisplayMultiplier(2), 1);
});

test('authored core render buckets separate level, walkable, and sliding faces without losing triangles', () => {
  const positions = [0,0,0, 1,0,0, 0,0,1, 2,0,0, 2,1,1, 3,0,0, 4,0,0, 4,1,0, 4,0,1];
  const indices = [0,2,1, 3,4,5, 6,7,8];
  const groups = partitionTerrainBySupport(positions, indices);
  assert.equal(Object.values(groups).reduce((count, group) => count + group.indices.length, 0), indices.length);
  assert.equal(groups.standable.indices.length, 3);
  assert.equal(groups.slide.indices.length, 3);
  assert.equal(groups.walkable.indices.length, 3);
});
