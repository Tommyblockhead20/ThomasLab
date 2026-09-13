import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Room } from '../server/src/room.js';
import { RoomState } from '../src/multiplayer/room-state.js';

const snapshot = (playerId, sequence = 1, heldItem = null, locationId = 'main-mountain') => ({
  playerId, sequence, serverTime: Date.now(),
  position: { x: 5, y: 2, z: 9 }, globalPosition: { x: 5, y: 2, z: 9 },
  locationId, coordinateSpace: 'global-world', yaw: 25, movement: 'grounded',
  appearance: { avatarType: 'human', headwear: 'catch-giant_pacific_octopus' }, heldItem
});

test('late join room state carries durable avatar and held specimen snapshot plus showcase', () => {
  const room = new Room('1234', 10, 42);
  const host = { playerId: 'host', connected: true, displayName: 'Host', reconnectToken: 'token' };
  const held = { type: 'specimen', specimenId: 's1', speciesId: 'haddock', length: 6, weight: 1 };
  room.add(host);
  host.lastSnapshot = snapshot('host', 4, held);
  host.aquariumShowcase = [{ specimenId: 's2', speciesId: 'bluegill', length: 8 }];
  const joiner = { playerId: 'joiner', connected: true, displayName: 'Joiner', reconnectToken: 'other' };
  room.add(joiner);
  const state = room.stateFor(joiner);
  assert.deepEqual(state.players.find((player) => player.id === 'host').snapshot.heldItem, held);
  assert.equal(state.players.find((player) => player.id === 'host').aquariumShowcase.length, 1);
});

test('room state seeds one visible remote, hides on disconnect/area change, then removes on leave', () => {
  const room = new RoomState('local');
  let created = 0;
  let destroyed = 0;
  const visible = [];
  const appearances = [];
  const held = [];
  const make = () => {
    created++;
    return {
      setAppearance(value) { appearances.push(value); },
      setDisplayName() {}, setPosture() {}, setEmote() {}, setFishingState() {},
      setHeldItem(value) { held.push(value); },
      setRemoteVisible(value) { visible.push(value); },
      setPosition() {}, setEulerAngles() {}, setMovementState() {},
      destroy() { destroyed++; }
    };
  };
  const heldItem = { type: 'specimen', specimenId: 's1', speciesId: 'haddock', length: 6 };
  const player = { id: 'remote', connected: true, displayName: 'Remote', snapshot: snapshot('remote', 1, heldItem),
    appearance: { avatarType: 'human', headwear: 'catch-giant_pacific_octopus' }, heldItem,
    aquariumShowcase: [{ specimenId: 's2', speciesId: 'bluegill' }], locationId: 'main-mountain' };
  room.applyRoomState({ players: [player] }, make);
  room.update(Date.now());
  assert.equal(created, 1);
  assert.equal(visible.at(-1), true);
  assert.equal(appearances.at(-1).headwear, 'catch-giant_pacific_octopus');
  assert.equal(held.at(-1).specimenId, 's1');
  room.update(Date.now() + 16_000);
  assert.equal(held.at(-1).specimenId, 's1', 'held creature must not expire after 15 seconds');
  assert.equal(room.getPlayerPresentation('remote').aquariumShowcase.length, 1);
  room.applyRoomState({ players: [{ ...player, connected: false }] }, make);
  assert.equal(visible.at(-1), false);
  room.applyRoomState({ players: [player] }, make);
  assert.equal(created, 1);
  assert.equal(visible.at(-1), true);
  room.setLocalLocationId('aquarium-island');
  assert.equal(visible.at(-1), false);
  room.applyRoomState({ players: [] }, make);
  assert.equal(destroyed, 1);
  assert.equal(room.members.size, 0);
});

test('all avatar and held-creature factories bind created entities to their owning PlayCanvas application', async () => {
  for (const file of ['src/player/character-model.js', 'src/fishing/specimen-model.js', 'src/fishing/rod-model.js',
    'src/player/held-item-model.js', 'src/multiplayer/remote-avatar.js']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /new pc\.Entity\([^,\n)]+\)/, `${file} has no singleton-bound entity constructor`);
  }
});
