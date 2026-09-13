import test from 'node:test';
import assert from 'node:assert/strict';
import { SongVoteOutbox } from '../src/multiplayer/song-vote-outbox.js';
import { MultiplayerClient } from '../src/multiplayer/multiplayer-client.js';
import { orderAndFilterSpecimens } from '../src/progression/specimen-order.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { ProgressionSystem } from '../src/progression/progression.js';
import { specimenModelLength, specimenDisplayScale } from '../src/fishing/specimen-model.js';
import { sampleOnsetSeconds } from '../src/audio/sample-onset.js';

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

const specimen = (id, speciesId, value, caughtAt, locationLabel, rarity = 'Common') => ({
  specimenId: id, speciesId, name: speciesId, rarity, value, length: value / 10, weight: value / 100,
  sizeFraction: .5, provenance: { caughtAt, locationLabel, locationId: locationLabel }
});

test('shared sort directions and owned species/location filters', () => {
  const fish = [specimen('a', 'bluegill', 10, 1, 'Pond'), specimen('b', 'haddock', 30, 3, 'Sea', 'Rare'),
    specimen('c', 'bluegill', 20, 2, 'Pond')];
  assert.deepEqual(orderAndFilterSpecimens(fish, 'value').map((s) => s.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(orderAndFilterSpecimens(fish, 'value-asc').map((s) => s.specimenId), ['a', 'c', 'b']);
  assert.deepEqual(orderAndFilterSpecimens(fish, 'recent-asc').map((s) => s.specimenId), ['a', 'c', 'b']);
  assert.deepEqual(orderAndFilterSpecimens(fish, 'rarity').map((s) => s.specimenId)[0], 'b');
  assert.deepEqual(orderAndFilterSpecimens(fish, 'species', 'bluegill').map((s) => s.specimenId), ['c', 'a']);
  assert.deepEqual(orderAndFilterSpecimens(fish, 'location', 'Sea').map((s) => s.specimenId), ['b']);
});

test('creature scale uses actual canonical model bounds and decoded note onset skips silence', () => {
  const body = { position: { x: 0 }, scale: { x: 1 } };
  const head = { position: { x: .8 }, scale: { x: .3 } };
  const nativeLength = specimenModelLength([body, head]);
  assert.ok(Math.abs(nativeLength - 1.45) < .00001);
  const sixInches = specimenDisplayScale({ speciesId: 'haddock', length: 6 }, Infinity, nativeLength);
  assert.ok(Math.abs(sixInches * nativeLength - .1524) < .00001);
  const samples = new Float32Array(3000);
  samples[1500] = .5;
  const buffer = { length: samples.length, sampleRate: 1000, numberOfChannels: 1,
    getChannelData: () => samples };
  assert.ok(sampleOnsetSeconds(buffer) > 1.48 && sampleOnsetSeconds(buffer) < 1.51);
});

test('tank actions and portable export/import preserve specimens, showcase, and milestones', () => {
  const storage = memoryStorage();
  const saves = new SaveSystem(storage);
  const progression = new ProgressionSystem(saves);
  progression.state.money = 500;
  progression.state.inventory = [specimen('a', 'bluegill', 10, 1, 'Pond'),
    specimen('b', 'haddock', 30, 3, 'Sea'), specimen('c', 'bluegill', 20, 2, 'Pond')];
  progression.state.aquariumTankCount = 2;
  progression.state.aquariumTankDisplays = [[], []];
  progression.state.aquariumTankManual = [true, true];
  progression.commit();
  assert.equal(progression.autoFillAquariumTank(0, { mode: 'value', filter: 'ignored' }).count, 3);
  assert.deepEqual(progression.getAquariumTankDisplays()[0], ['b', 'c', 'a']);
  assert.equal(progression.matchAquariumShowcaseToTank(0).count, 3);
  assert.equal(progression.clearAquariumShowcase().count, 0);
  assert.equal(progression.autoFillAquariumShowcase({ mode: 'species', filter: 'bluegill' }).count, 2);
  assert.equal(progression.emptyAquariumTank(0).count, 3);
  assert.equal(progression.state.inventory.length, 3);
  assert.equal(progression.state.aquarium.length, 0);
  progression.moveAquariumSpecimen('b', { tankIndex: 1 });
  saves.data.collection.bluegill = { discovered: true, catches: 1, name: 'Bluegill' };
  saves.data.worldMilestones = ['cabin-restored'];
  saves.data.tutorials.fishing = true;
  progression.commit();
  const exported = progression.exportProgressForSlot(saves.activeSlotId);
  const importedSaves = new SaveSystem(memoryStorage());
  const imported = new ProgressionSystem(importedSaves);
  imported.importProgress(exported);
  assert.equal(imported.state.money, 500);
  assert.deepEqual(imported.state.inventory.map((s) => s.specimenId).sort(), ['a', 'c']);
  assert.deepEqual(imported.state.aquarium.map((s) => s.specimenId), ['b']);
  assert.equal(imported.state.aquarium[0].ownerId, progression.state.player.id);
  assert.deepEqual(imported.getAquariumTankDisplays()[1], ['b']);
  assert.deepEqual(imported.state.aquariumShowcaseSpecimenIds.sort(), ['a', 'c']);
  assert.equal(importedSaves.data.collection.bluegill.discovered, true);
  assert.deepEqual(importedSaves.data.worldMilestones, ['cabin-restored']);
  assert.equal(importedSaves.data.tutorials.fishing, true);
});

test('vote outbox coalesces vote/reason updates and survives storage reload', () => {
  const storage = memoryStorage();
  const outbox = new SongVoteOutbox('voter', storage);
  const feedback = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 2 };
  const key = outbox.enqueue({ ...feedback, vote: 'down', reason: 'glitched' });
  outbox.enqueue({ ...feedback, vote: 'up', reason: 'glitched' });
  assert.equal(outbox.size, 1);
  assert.equal(outbox.get(key).reason, null);
  const reloaded = new SongVoteOutbox('voter', storage);
  assert.equal(reloaded.get(key).vote, 'up');
  assert.equal(reloaded.acknowledge(key, reloaded.get(key)), true);
  assert.equal(new SongVoteOutbox('voter', storage).size, 0);
});

test('failed live vote remains queued and retries without creating a second logical row', async () => {
  const storage = memoryStorage();
  const oldStorage = globalThis.localStorage;
  globalThis.localStorage = storage;
  const transport = { onMessage: null, onClose: null, close() {} };
  const client = new MultiplayerClient('voter', { endpoint: 'wss://example.invalid', transport });
  const feedback = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 2 };
  client.sendVoteRequest = async () => { throw new Error('offline'); };
  try {
    await assert.rejects(client.submitSongVote(feedback, 'down', 'too_hard'), /offline/);
    assert.equal(client.voteOutbox.size, 1);
    await assert.rejects(client.submitSongVote(feedback, 'up'), /offline/);
    assert.equal(client.voteOutbox.size, 1);
    assert.equal(client.voteOutbox.peek()[1].reason, null);
    client.sendVoteRequest = async () => ({ speciesId: 'bluegill', songRevision: 2, upVotes: 1, downVotes: 0 });
    await client.flushVoteOutbox();
    assert.equal(client.voteOutbox.size, 0);
    assert.equal(new SongVoteOutbox('voter', storage).size, 0);
  } finally {
    client.destroy();
    globalThis.localStorage = oldStorage;
  }
});
