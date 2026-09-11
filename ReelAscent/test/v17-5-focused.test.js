import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { COSMETIC_CATALOG, SHOP_COSMETICS } from '../src/progression/cosmetics.js';
import { auditCosmeticModelCoverage } from '../src/player/character-model.js';
import { SongVoteStore } from '../src/fishing/song-votes.js';
import { MemorySongVoteStore } from '../server/src/song-vote-store.js';
import { INVENTORY_SORT_OPTIONS, sortInventorySpecimens } from '../src/ui/inventory.js';
import { WORLD_LOCATIONS } from '../src/world/world-locations.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);
const feedback = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 7 };

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function readGlbJson(buffer) {
  assert.equal(buffer.toString('utf8', 0, 4), 'glTF');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

test('v17.5 audits every active cosmetic against a real model recipe', async () => {
  assert.equal(GAME_VERSION, 'v17.5');
  assert.equal(COSMETIC_CATALOG.length, 134);
  assert.equal(new Set(COSMETIC_CATALOG.map(({ id }) => id)).size, 134);
  assert.deepEqual(auditCosmeticModelCoverage(COSMETIC_CATALOG), {
    activeCount: 134,
    renderableCount: 134,
    missingModelIds: [],
    invalidCompatibilityIds: []
  });

  const source = await readFile(new URL('src/player/character-model.js', here), 'utf8');
  for (const visiblePart of ['octopus head', 'raised spiral', 'hand cuff', 'hand ${side} claw']) {
    assert.match(source, new RegExp(visiblePart.replace(/[${}]/g, '\\$&'), 'i'));
  }
  assert.match(source, /visual === 'electric'[\s\S]{0,500}spark/);
  assert.match(source, /visual === 'flower'/);
  assert.match(source, /visual === 'bandana'/);
  assert.match(source, /visual === 'whirlpool'/);
});

test('Outfitter tabs partition existing inventory and seller reuses all six shared sorts', async () => {
  const [html, source] = await Promise.all([
    readFile(new URL('index.html', here), 'utf8'),
    readFile(new URL('src/ui/shop.js', here), 'utf8')
  ]);
  assert.match(html, /data-shop-tab="fishing"[\s\S]*data-shop-tab="climbing"[\s\S]*data-shop-tab="cosmetics"/);
  assert.match(source, /sortInventorySpecimens\(state\.inventory, this\.sellerSort\)/);
  assert.match(source, /INVENTORY_SORT_OPTIONS\.map/);
  assert.match(source, /FISHING_CATEGORIES[\s\S]*'rod'[\s\S]*'bobber'/);
  assert.match(source, /CLIMBING_CATEGORIES[\s\S]*'boots'[\s\S]*'harness'/);
  assert.ok(SHOP_COSMETICS.every(({ source: acquisition }) => acquisition.type === 'shop'));
  assert.deepEqual(INVENTORY_SORT_OPTIONS.map(([id]) => id), ['recent', 'value', 'rarity', 'size', 'species', 'location']);

  const specimens = [
    { name: 'Zulu', rarity: 'Common', value: 2, length: 4, weight: 1, caughtAt: 2, provenance: { locationLabel: 'Creek' } },
    { name: 'Alpha', rarity: 'Legendary', value: 20, length: 8, weight: 4, caughtAt: 1, provenance: { locationLabel: 'Ocean' } }
  ];
  assert.equal(sortInventorySpecimens(specimens, 'recent')[0].name, 'Zulu');
  assert.equal(sortInventorySpecimens(specimens, 'value')[0].name, 'Alpha');
  assert.equal(sortInventorySpecimens(specimens, 'rarity')[0].name, 'Alpha');
  assert.equal(sortInventorySpecimens(specimens, 'size')[0].name, 'Alpha');
  assert.equal(sortInventorySpecimens(specimens, 'species')[0].name, 'Alpha');
  assert.equal(sortInventorySpecimens(specimens, 'location')[0].name, 'Zulu');
});

test('Veiled Athenaeum keeps only its name and localized translucent mist', async () => {
  const location = WORLD_LOCATIONS.find(({ id }) => id === 'veiled-athenaeum');
  assert.equal(location.displayName, 'The Veiled Athenaeum');
  assert.equal(location.destination.enabled, false);
  assert.equal(location.destination.concealDetails, true);
  assert.equal(location.destination.lockMessage, '');
  assert.deepEqual(location.functions, ['veiled']);

  const [world, boat] = await Promise.all([
    readFile(new URL('src/world/mountain-v2.js', here), 'utf8'),
    readFile(new URL('src/ui/boat-travel.js', here), 'utf8')
  ]);
  assert.match(world, /athenaeumMist[\s\S]*opacity: \.085/);
  assert.match(world, /Veiled Athenaeum localized mist/);
  assert.doesNotMatch(world, /Veiled Athenaeum (?:shadowed door|column)/);
  assert.match(boat, /!location\.destination\.concealDetails/);
});

test('runtime uses the supplied direct multi-material ESB GLB and excludes its preview plane', async () => {
  const [runtime, archive, source] = await Promise.all([
    readFile(new URL('public/assets/models/empire-state-building.glb', here)),
    readFile(new URL('third_party/empire-state-building/empire-state-building-direct.glb', here)),
    readFile(new URL('src/world/mountain-v2.js', here), 'utf8')
  ]);
  assert.equal(createHash('sha256').update(runtime).digest('hex'), '475cb0117e5802364d3af101423dd267408a6b068b6b17ef35499c21bd9f6533');
  assert.deepEqual(runtime, archive);
  const glb = readGlbJson(runtime);
  const buildingNode = glb.nodes.find(({ name }) => name === 'ESB');
  const building = glb.meshes[buildingNode.mesh];
  assert.deepEqual(building.primitives.map(({ material }) => glb.materials[material].name), ['windows', 'light']);
  assert.equal(building.primitives.reduce((sum, primitive) => sum + glb.accessors[primitive.attributes.POSITION].count, 0), 7546);
  assert.ok(building.primitives.reduce((sum, primitive) => sum + glb.accessors[primitive.indices].count, 0) / 3 >= 5700);
  assert.ok(glb.nodes.some(({ name }) => name === 'Plane'));
  assert.match(source, /previewPlane\.enabled = false/);
  assert.match(source, /sourceBuilding\.findComponents/);
  assert.match(source, /meshInstance\.aabb/);
  assert.match(source, /visualGroundEmbed/);
});

test('downvote, changing reasons, upvote, and reload all retain one-row semantics', async () => {
  const storage = new MemoryStorage();
  const local = new SongVoteStore(storage, 'browser-player');
  const server = new MemorySongVoteStore();

  local.set(feedback, 'down');
  let aggregate = await server.setVote({ ...feedback, voterId: 'browser-player', vote: 'down' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(new SongVoteStore(storage, 'browser-player').get(feedback), 'down');

  for (const reason of ['too_hard', 'bad_instrument']) {
    local.set(feedback, 'down', reason);
    aggregate = await server.setVote({ ...feedback, voterId: 'browser-player', vote: 'down', reason });
    assert.equal(aggregate.totalVotes, 1);
    assert.equal(aggregate.downvoteReasons[reason], 1);
    assert.equal(new SongVoteStore(storage, 'browser-player').getReason(feedback), reason);
  }

  local.set(feedback, 'up');
  aggregate = await server.setVote({ ...feedback, voterId: 'browser-player', vote: 'up', reason: 'bad_instrument' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(aggregate.upVotes, 1);
  assert.equal(aggregate.downvoteReasons.bad_instrument, 0);
  const reloaded = new SongVoteStore(storage, 'browser-player');
  assert.equal(reloaded.get(feedback), 'up');
  assert.equal(reloaded.getReason(feedback), null);

  const [game, hud, serverSource] = await Promise.all([
    readFile(new URL('src/game.js', here), 'utf8'),
    readFile(new URL('src/ui/hud.js', here), 'utf8'),
    readFile(new URL('server/src/song-vote-store.js', here), 'utf8')
  ]);
  assert.match(game, /beginSongVote[\s\S]{0,180}applyLocalSongVote[\s\S]{0,180}submitSongVote/);
  assert.match(game, /beginSongDownvoteReason[\s\S]{0,180}applyLocalSongDownvoteReason[\s\S]{0,180}submitSongVote/);
  assert.match(hud, /fishingResultControls\?\.hidden === false[\s\S]{0,160}songVoteStore\.get\(feedback\) === 'down'/);
  assert.match(serverSource, /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
  assert.match(serverSource, /ON CONFLICT \(voter_id, species_id, song_revision\) DO UPDATE/);
  assert.match(serverSource, /downvote_reason = EXCLUDED\.downvote_reason/);
});
