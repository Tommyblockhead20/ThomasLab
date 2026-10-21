import test from 'node:test';
import assert from 'node:assert/strict';
import { CheatGate, CHEAT_HELP_TEXT } from '../src/debug/cheat-gate.js';
import { RemotePlayer } from '../src/multiplayer/remote-player.js';
import { RoomState } from '../src/multiplayer/room-state.js';
import { createPlayerSnapshot } from '../src/multiplayer/protocol.js';
import { validateSnapshot } from '../server/src/snapshot-validation.js';
import { createSurfacePixels } from '../src/graphics/surface-detail.js';
import { AQUATIC_SCULPTURES, buildAquaticSculpture } from '../src/fishing/aquatic-sculpture.js';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';

const snapshot = (sequence, x, teleportRevision = 0) => ({
  playerId: 'remote', sequence, serverTime: 1000 + sequence * 100,
  position: { x, y: 2, z: 0 }, yaw: 0, movement: 'grounded',
  locationId: 'main-mountain', coordinateSpace: 'global-world', teleportRevision
});

test('cheat activation stays secret and enabled F1 lists every control group', async () => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const fakeWindow = new EventTarget();
  const indicator = { hidden: true, textContent: '', style: { setProperty() {} } };
  globalThis.window = fakeWindow;
  globalThis.document = { querySelector: () => indicator };
  const key = (type, code = 'F1') => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { code: { value: code }, repeat: { value: false } });
    return event;
  };
  try {
    const gate = new CheatGate(20).install();
    fakeWindow.dispatchEvent(key('keydown'));
    assert.equal(indicator.hidden, true, 'holding the secret key shows no hint');
    await new Promise((resolve) => setTimeout(resolve, 26));
    assert.equal(gate.enabled, true);
    assert.equal(indicator.textContent, CHEAT_HELP_TEXT);
    for (const control of ['F2', 'F3', 'F4/P', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'Home', 'B force', 'N easy', '1–6', 'T course']) {
      assert.ok(CHEAT_HELP_TEXT.includes(control), control);
    }
    indicator.hidden = true;
    fakeWindow.dispatchEvent(key('keydown'));
    assert.equal(indicator.hidden, false, 'F1 reopens the controls after activation');
    gate.destroy();
  } finally {
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
  }
});

test('teleport revision bypasses only the matching ordinary movement check', () => {
  const session = { playerId: 'remote', lastSequence: 1, lastSnapshot: {
    ...snapshot(1, 0), serverTime: 1000
  } };
  const ordinary = { ...snapshot(2, 400), serverTime: 1100 };
  assert.equal(validateSnapshot(ordinary, session, 1100).reason, 'implausible_jump');
  const teleport = { ...ordinary, teleportRevision: 1 };
  const accepted = validateSnapshot(teleport, session, 1100);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.snapshot.teleportRevision, 1);
  const encoded = createPlayerSnapshot('remote', { position: teleport.position, teleportRevision: 1 }, 2);
  assert.equal(encoded.payload.teleportRevision, 1);
});

test('remote interpolation snaps to a teleported position and keeps the same avatar', () => {
  const positions = [], visible = [];
  const model = {
    setRemoteVisible(value) { visible.push(value); },
    setPosition(x) { positions.push(x); },
    setEulerAngles() {}, setMovementState() {}
  };
  const remote = new RemotePlayer('remote', model);
  remote.consumeSnapshot(snapshot(1, 1));
  remote.consumeSnapshot(snapshot(2, 2));
  remote.update(1250);
  remote.consumeSnapshot(snapshot(3, 400, 1));
  assert.equal(remote.snapshots.snapshots.length, 1);
  remote.update(1400);
  assert.equal(positions.at(-1), 400);
  assert.equal(visible.at(-1), true);
  assert.equal(remote.representation, model);
});

test('partial and stale room rosters never erase the latest remote appearance', () => {
  const looks = [], visible = [];
  const room = new RoomState('local');
  const make = () => ({ setAppearance(value) { looks.push(value); }, setRemoteVisible(value) { visible.push(value); },
    setDisplayName() {}, setPosture() {}, setEmote() {}, setFishingState() {}, setHeldItem() {}, destroy() {} });
  const look = { avatarType: 'human', headwear: 'catch-giant_pacific_octopus' };
  room.applyRoomState({ players: [{ id: 'remote', snapshot: { ...snapshot(1, 0), appearance: look } }] }, make);
  assert.deepEqual(looks.at(-1), look);
  room.applyRoomState({ players: [{ id: 'remote', appearance: null, snapshot: null,
    locationId: 'stale-other-island' }] }, make);
  assert.deepEqual(looks.at(-1), look);
  assert.equal(room.members.get('remote').locationId, 'main-mountain');
  assert.equal(visible.at(-1), true);
  room.applyRoomState({ players: [{ id: 'remote', appearance: { avatarType: 'blob' }, snapshot: {
    ...snapshot(1, 0), appearance: { avatarType: 'blob' }
  } }] }, make);
  assert.deepEqual(looks.at(-1), look, 'older roster cannot overwrite a newer snapshot');
  room.clear();
});

test('flat authored core uses a dedicated deterministic grass-like relief tile', () => {
  const first = createSurfacePixels('core-standable', 32);
  const second = createSurfacePixels('core-standable', 32);
  assert.deepEqual(first.color, second.color);
  assert.notDeepEqual(first.color, createSurfacePixels('core-walkable', 32).color);
});

test('Lusca restores the corrupted forward-skull/rear-arm silhouette, unlike octopus', () => {
  const renderParts = (archetype, speciesId = archetype) => {
    const parts = [];
    buildAquaticSculpture({}, { archetype, speciesId, name: 'Audit', art: {},
      primitive(_root, name, type, position, scale) { parts.push({ name, type, position, scale }); },
      base: {}, accent: {}, dark: {}, materials: [{}, {}, {}, {}] });
    return parts;
  };
  const lusca = renderParts('lusca');
  const octopus = renderParts('octopus');
  assert.ok(AQUATIC_SCULPTURES.has('lusca'));
  assert.ok(lusca.some((part) => part.name.includes('forward monstrous head')));
  assert.equal(lusca.filter((part) => part.name.includes('corrupted arm') && part.name.includes('sweep')).length, 8);
  assert.ok(lusca.some((part) => part.name.includes('mantle thorn')));
  assert.ok(octopus.some((part) => part.name.includes('rounded torso')) === false);
  assert.ok(octopus.some((part) => part.name.includes('mantle')));
  assert.ok(!octopus.some((part) => part.name.includes('corrupted')));
  assert.equal(FISH_SPECIES.find((species) => species.id === 'blue_ringed_octopus')?.visual?.archetype, 'octopus');
  assert.equal(FISH_SPECIES.find((species) => species.id === 'vampire_squid')?.visual?.archetype, 'squid');
});

test('mythic archetypes have distinct named anatomy instead of shared four-sphere bodies', () => {
  const partsFor = (archetype, speciesId) => {
    const parts = [];
    buildAquaticSculpture({}, { archetype, speciesId, name: 'Audit', art: {},
      primitive(_root, name) { parts.push(name); }, base: {}, accent: {}, dark: {}, materials: [{}, {}, {}, {}] });
    return parts.join('|');
  };
  assert.match(partsFor('dragon', 'lernaean_hydra'), /dragon head 0.*dragon head 1.*dragon head 2/);
  assert.match(partsFor('serpent', 'jormungandr'), /sinuous armored segment 8/);
  assert.match(partsFor('plesiosaur', 'plesiosaur'), /arched neck/);
  assert.match(partsFor('waterhorse', 'nokken'), /wave mane/);
  assert.match(partsFor('wisp', 'rimefin_wisp'), /radiant streamer 6/);
});
