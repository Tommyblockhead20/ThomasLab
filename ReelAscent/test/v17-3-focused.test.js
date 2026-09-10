import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import {
  SONG_DOWNVOTE_REASONS,
  SONG_VOTE_SCHEMA_VERSION,
  SongVoteStore,
  songDownvoteReasonForDigit
} from '../src/fishing/song-votes.js';
import { MemorySongVoteStore, SONG_DOWNVOTE_REASON_IDS } from '../server/src/song-vote-store.js';
import { TestWorld } from '../src/world/world.js';
import {
  COASTAL_SHELF_RADIUS,
  FISHING_WATER_COUNTS,
  MOUNTAIN_CENTER,
  OCEAN_VISUAL_OUTER_RADIUS,
  OCEAN_WATER_INNER_RADIUS,
  SKYREACH_FISHING_DESCRIPTORS,
  SKYREACH_TOWER_CONFIG
} from '../src/world/mountain-v2.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);
const reasons = ['sounds_bad', 'glitched', 'too_hard', 'too_easy', 'bad_instrument'];
const feedback = { speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 1 };

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

test('v17.3 exposes exactly the corrected five readable feedback reasons', async () => {
  assert.equal(GAME_VERSION, 'v17.3');
  assert.equal(SONG_VOTE_SCHEMA_VERSION, 5);
  assert.deepEqual(SONG_DOWNVOTE_REASONS.map(({ id }) => id), reasons);
  assert.deepEqual(SONG_DOWNVOTE_REASON_IDS, reasons);
  reasons.forEach((reason, index) => {
    assert.equal(songDownvoteReasonForDigit(`Digit${index + 1}`), reason);
    assert.equal(songDownvoteReasonForDigit(`Numpad${index + 1}`), reason);
  });

  const local = new SongVoteStore(new MemoryStorage(), 'browser-player');
  local.set(feedback, 'down', 'sounds_bad');
  local.set(feedback, 'down', 'glitched');
  assert.equal(local.getReason(feedback), 'glitched');
  assert.equal(Object.keys(local.exportSummary().votes).length, 1);
  local.set(feedback, 'up', 'bad_instrument');
  assert.equal(local.getReason(feedback), null);

  const server = new MemorySongVoteStore();
  await server.setVote({ ...feedback, voterId: 'one', vote: 'down', reason: 'too_hard' });
  const aggregate = await server.setVote({ ...feedback, voterId: 'one', vote: 'down', reason: 'bad_instrument' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(aggregate.downvoteReasons.too_hard, 0);
  assert.equal(aggregate.downvoteReasons.bad_instrument, 1);
});

test('PostgreSQL migration maps bugged, retains named legacy reasons, and keeps one-row upserts', async () => {
  const source = await readFile(new URL('server/src/song-vote-store.js', here), 'utf8');
  assert.match(source, /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
  assert.match(source, /ON CONFLICT \(voter_id, species_id, song_revision\) DO UPDATE/);
  assert.match(source, /SET downvote_reason = 'glitched'[\s\S]{0,100}downvote_reason = 'bugged'/);
  for (const legacy of ['awkward_rhythm', 'too_long', 'bad_fit', 'other']) {
    assert.match(source, new RegExp(`'${legacy}'`));
  }
});

test('Skyreach is one centered opaque supplied model with a continuous non-climbable hull', async () => {
  assert.equal(SKYREACH_TOWER_CONFIG.mainRoofHeight / .3048, 1250);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.spireHeight / .3048 - 1407.45) < .02);
  assert.equal(SKYREACH_TOWER_CONFIG.collisionLayers.length, 6);
  assert.deepEqual(SKYREACH_FISHING_DESCRIPTORS, []);
  assert.equal(FISHING_WATER_COUNTS.total, 28);

  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  const builder = source.slice(source.indexOf('  buildSkyreachFoundation(location)'), source.indexOf('  loadSkyreachVisualShell(root)'));
  assert.match(builder, /collisionLayers\.entries\(\)/);
  assert.match(builder, /collision\.render\.enabled = false/);
  assert.match(builder, /collision\.tags\.add\('non-climbable'\)/);
  assert.doesNotMatch(builder, /registerClimbSurface|pool|bathroom|toilet|elevator|moving|route|fountain/i);
  for (const removed of ['Skyreach striped arrival walk', 'Skyreach midpoint bathroom floor',
    'Skyreach rooftop fishable pool water', 'Skyreach tracked moving beam']) {
    assert.doesNotMatch(source, new RegExp(removed));
  }

  const glb = readGlbJson(await readFile(new URL('public/assets/models/empire-state-building.glb', here)));
  assert.equal(glb.materials.length, 2);
  for (const material of glb.materials) {
    assert.notEqual(material.alphaMode, 'BLEND');
    assert.equal(material.pbrMetallicRoughness.baseColorFactor[3], 1);
  }
  assert.deepEqual(glb.materials[0].emissiveFactor, [0, 0, 0]);
  assert.ok(Math.max(...glb.materials[1].emissiveFactor) < .05);
});

test('the ocean begins at the coastal shelf so a modest outward shore cast is wet', () => {
  assert.equal(OCEAN_WATER_INNER_RADIUS, COASTAL_SHELF_RADIUS);
  const ocean = new FishingZone({
    id: 'outer-ocean', label: 'Outer Ocean', center: MOUNTAIN_CENTER, shape: 'annulus',
    innerRadius: OCEAN_WATER_INNER_RADIUS, renderedInnerRadius: OCEAN_WATER_INNER_RADIUS,
    outerRadius: OCEAN_VISUAL_OUTER_RADIUS - 5, surfaceY: -.76, fishIds: ['sardine']
  });
  const fakeWorld = { fishingZones: [ocean], findFishingZoneAt: TestWorld.prototype.findFishingZoneAt };
  const shoreline = { x: MOUNTAIN_CENTER.x + 208, y: -.76, z: MOUNTAIN_CENTER.z };
  assert.equal(TestWorld.prototype.getFishingZoneForCast.call(fakeWorld, shoreline, { x: 1, z: 0 }, 2.8, 12), ocean);
  assert.equal(TestWorld.prototype.getFishingZoneForCast.call(fakeWorld, shoreline, { x: -1, z: 0 }, 2.8, 12), null);
});

test('result recast preserves pre-presentation aim and mobile UI reserves a control-safe band', async () => {
  const [fishing, html, styles] = await Promise.all([
    readFile(new URL('src/fishing/fishing.js', here), 'utf8'),
    readFile(new URL('index.html', here), 'utf8'),
    readFile(new URL('src/styles.css', here), 'utf8')
  ]);
  assert.match(fishing, /resultRecastAimDirection\.copy\(this\.aimDirection\)/);
  assert.match(fishing, /this\.resultRecastCharging[\s\S]{0,100}this\.resultRecastAimDirection/);
  assert.match(styles, /body\.mobile-mode \.fishing-result-controls[\s\S]{0,260}clamp\(5\.8rem, 18vh, 7\.4rem\)/);
  assert.match(styles, /body\.mobile-mode \.song-downvote-reason kbd[\s\S]{0,80}display: none/);
  assert.match(styles, /grid-template: 4\.35rem 4\.65rem/);
  assert.match(html, /data-song-downvote-reason="sounds_bad"[\s\S]*data-song-downvote-reason="glitched"[\s\S]*data-song-downvote-reason="bad_instrument"/);
  assert.doesNotMatch(html, /AWKWARD RHYTHM|TOO LONG|BAD FIT/);
});
