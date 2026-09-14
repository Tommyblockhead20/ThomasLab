import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/src/room.js';
import { RoomManager } from '../server/src/room-manager.js';
import { ClientConnection } from '../server/src/connection.js';
import { createMessage, MESSAGE_TYPES } from '../server/src/protocol.js';
import { EventEmitter } from 'node:events';
import { normalizeSongVote, PostgresSongVoteStore } from '../server/src/song-vote-store.js';
import { SaveSystem } from '../src/persistence/save-system.js';
import { serializeProgress, validateProgressImport } from '../src/progression/progress-transfer.js';
import { scoreBestCatch, isBetterCatch } from '../src/persistence/best-catch.js';
import { SongVoteOutbox } from '../src/multiplayer/song-vote-outbox.js';
import { MountainWorld } from '../src/world/mountain-v2.js';

const memoryStorage = () => {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('server arbitrates two occupants and releases a disconnected or departed sitter', () => {
  const room = new Room('1234', 10, 7);
  const sessions = ['a', 'b', 'c'].map((playerId) => ({ playerId, connected: true, displayName: playerId }));
  sessions.forEach((session) => room.add(session));
  assert.equal(room.claimBench('a', 'summit-bench'), true);
  assert.deepEqual(room.stateFor(sessions[0]).benchSeats[0].playerIds, ['a']);
  assert.equal(room.claimBench('b', 'summit-bench'), true);
  assert.deepEqual(room.stateFor(sessions[0]).benchSeats[0].playerIds, ['a', 'b']);
  assert.equal(room.claimBench('c', 'summit-bench'), false);
  room.releaseBench('b');
  assert.deepEqual(room.stateFor(sessions[0]).benchSeats[0].playerIds, ['a']);
  assert.equal(room.claimBench('c', 'summit-bench'), true);
  room.remove(sessions[0]);
  assert.deepEqual(room.stateFor(sessions[1]).benchSeats[0].playerIds, ['c']);
});

test('wire-level bench claims deny a third player and disconnect frees the slot', () => {
  const manager = new RoomManager({ roomCapacity: 10, reconnectWindowMs: 100 });
  const peers = Array.from({ length: 3 }, (_, index) => {
    const socket = new EventEmitter();
    socket.readyState = 1;
    socket.messages = [];
    socket.send = (raw) => socket.messages.push(JSON.parse(raw));
    const connection = new ClientConnection(socket, manager);
    const playerId = `player-${index}`;
    const sendWire = (type, payload) => connection.handleRawMessage(JSON.stringify(createMessage(type, payload)));
    sendWire(MESSAGE_TYPES.HELLO, { playerId });
    return { socket, connection, sendWire, playerId };
  });
  peers[0].sendWire(MESSAGE_TYPES.HOST_ROOM, { displayName: 'One' });
  const code = peers[0].connection.session.room.code;
  peers[1].sendWire(MESSAGE_TYPES.JOIN_ROOM, { roomCode: code, displayName: 'Two' });
  peers[2].sendWire(MESSAGE_TYPES.JOIN_ROOM, { roomCode: code, displayName: 'Three' });
  peers.forEach((peer, index) => peer.sendWire(MESSAGE_TYPES.BENCH_SEAT_REQUEST,
    { requestId: `r${index}`, benchId: 'summit-bench', locationId: 'main-mountain' }));
  assert.deepEqual(peers.map((peer) => peer.socket.messages.findLast((message) => message.type === MESSAGE_TYPES.BENCH_SEAT_RESULT).payload.granted),
    [true, true, false]);
  peers[1].connection.handleClose();
  peers[2].sendWire(MESSAGE_TYPES.BENCH_SEAT_REQUEST, { requestId: 'retry', benchId: 'summit-bench', locationId: 'main-mountain' });
  assert.equal(peers[2].socket.messages.findLast((message) => message.type === MESSAGE_TYPES.BENCH_SEAT_RESULT).payload.granted, true);
  for (const peer of peers) peer.connection.session?.reconnectTimer && clearTimeout(peer.connection.session.reconnectTimer);
});

test('authored Boat/summit bench groups scale 1-4 and keep occupied benches active', () => {
  const groups = new Map();
  for (const site of ['boat', 'summit']) for (let index = 0; index < 4; index += 1) {
    const part = { enabled: false, physicsCollider: { setEnabled(value) { this.enabled = value; } } };
    groups.set(`${site}-${index}`, { index, parts: [part], interaction: {
      id: `${site}-${index}`, enabled: false, position: { x: index * 4, y: 1, z: 0 }
    } });
  }
  const world = { scalableBenches: groups };
  for (let population = 1; population <= 4; population += 1) {
    MountainWorld.prototype.setBenchPopulation.call(world, population);
    for (const site of ['boat', 'summit']) {
      assert.equal([...groups].filter(([id, bench]) => id.startsWith(site) && bench.interaction.enabled).length, population);
    }
  }
  MountainWorld.prototype.setBenchPopulation.call(world, 1, ['boat-3']);
  assert.equal(groups.get('boat-3').interaction.enabled, true);
  assert.equal(groups.get('summit-3').interaction.enabled, false);
  MountainWorld.prototype.setBenchPopulation.call(world, 2, [], [{ x: 4, y: 1, z: 0 }]);
  assert.equal(groups.get('summit-1').interaction.enabled, false, 'new bench waits for player to move clear');
});

test('save names and all six summary values remain slot-specific through portable export', () => {
  const storage = memoryStorage();
  const saves = new SaveSystem(storage);
  const slot1 = saves.activeSlotId;
  const id1 = saves.data.saveId;
  assert.equal(saves.renameSlot(slot1, '  Main   Run  '), true);
  assert.equal(saves.data.saveId, id1);
  saves.data.progression.money = 123;
  saves.data.collection.bluegill = { discovered: true, catches: 3 };
  saves.data.lifetime.fishCaught = 3;
  saves.data.lifetime.summitCount = 2;
  saves.data.lifetime.activePlaytimeSeconds = 90;
  saves.save();
  saves.createSlot('slot-2');
  const [first, second] = saves.getSlotSummaries();
  assert.equal(first.label, 'Main Run');
  assert.deepEqual([first.money, first.discovered, first.fishCaught, first.summits, first.activePlaytimeSeconds], [123, 1, 3, 2, 90]);
  assert.deepEqual([second.money, second.discovered, second.fishCaught, second.summits], [0, 0, 0, 0]);
  const portable = serializeProgress(saves.getSlotSnapshot(slot1));
  assert.equal(validateProgressImport(portable).save.slotName, 'Main Run');
  assert.equal(new SaveSystem(storage).getSlotSummaries()[0].label, 'Main Run');
});

test('Best Catch compares rarity, species-normalized size, and shiny within one save', () => {
  const commonHuge = { speciesId: 'bluegill', rarity: 'Common', sizeFraction: 1.6, weightFraction: 1.6, length: 13, weight: 5 };
  const rareOrdinary = { speciesId: 'rainbow-trout', rarity: 'Rare', sizeFraction: .5, weightFraction: .5, length: 15, weight: 2 };
  assert.ok(scoreBestCatch(rareOrdinary).score > scoreBestCatch(commonHuge).score);
  assert.equal(scoreBestCatch({ ...rareOrdinary, rarity: 'rare' }).score, scoreBestCatch(rareOrdinary).score);
  assert.ok(isBetterCatch({ ...rareOrdinary, shiny: true }, rareOrdinary));
  const saves = new SaveSystem(memoryStorage());
  saves.recordCatch({ ...commonHuge, name: 'Bluegill' });
  saves.recordCatch({ ...rareOrdinary, name: 'Rainbow Trout' });
  assert.equal(saves.getLifetimeSnapshot().bestCatch.speciesId, 'rainbow_trout');
  saves.createSlot('slot-2');
  assert.equal(saves.getSlotSnapshot('slot-2').lifetime.bestCatch, null);
});

test('player profile and offline vote metadata keep durable identity separate from name', () => {
  const storage = memoryStorage();
  const saves = new SaveSystem(storage);
  const id = saves.multiplayerPlayerId;
  saves.setPlayerDisplayName(' Thomas ');
  saves.setPlayerDisplayName('Tommy');
  assert.equal(new SaveSystem(storage).playerDisplayName, 'Tommy');
  assert.equal(new SaveSystem(storage).multiplayerPlayerId, id);
  const outbox = new SongVoteOutbox(id, storage);
  const vote = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 1, vote: 'down', reason: 'too_hard', playerName: 'Thomas' };
  const key = outbox.enqueue(vote);
  assert.equal(new SongVoteOutbox(id, storage).get(key).playerName, 'Thomas');
  const normalized = normalizeSongVote({ ...vote, voterId: id });
  assert.equal(normalized.voterId, id);
  assert.equal(normalized.playerName, 'Thomas');
});

test('PostgreSQL startup migration adds nullable player-name metadata without changing vote identity', async () => {
  const queries = [];
  const store = Object.create(PostgresSongVoteStore.prototype);
  store.pool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
  store.logger = { info() {} };
  store.available = false;
  await store.initialize();
  assert.equal(store.schemaInitialized, true);
  assert.match(queries.join('\n'), /ADD COLUMN IF NOT EXISTS player_name VARCHAR\(18\) NULL/);
  assert.match(queries.join('\n'), /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
});
