import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { MOBILE_CLIMBING_ASSIST } from '../src/config.js';
import { FishingZone } from '../src/fishing/fishing-zone.js';
import {
  FISHING_RESULT_DIRECTIONS,
  MOBILE_FISHING_DIRECTION_ORDER
} from '../src/fishing/result-actions.js';
import {
  SONG_DOWNVOTE_REASONS,
  SONG_VOTE_SCHEMA_VERSION,
  SongVoteStore,
  songDownvoteReasonForDigit
} from '../src/fishing/song-votes.js';
import { SAVE_SCHEMA_VERSION, SaveSystem, migrate } from '../src/persistence/save-system.js';
import { StaminaResource } from '../src/player/movement.js';
import { SKYREACH_FISHING_DESCRIPTORS, SKYREACH_TOWER_CONFIG } from '../src/world/mountain-v2.js';
import { MemorySongVoteStore, SONG_DOWNVOTE_REASON_IDS } from '../server/src/song-vote-store.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);
const feedback = Object.freeze({
  speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 1
});
const expectedReasons = Object.freeze([
  'too_hard', 'too_easy', 'awkward_rhythm', 'too_long', 'bad_fit'
]);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

test('v17.2 uses one canonical LEFT / UP / DOWN / RIGHT fishing row and result mapping', async () => {
  assert.equal(GAME_VERSION, 'v17.2');
  assert.deepEqual(MOBILE_FISHING_DIRECTION_ORDER, ['left', 'up', 'down', 'right']);
  assert.deepEqual(MOBILE_FISHING_DIRECTION_ORDER.map((direction) => FISHING_RESULT_DIRECTIONS[direction]),
    ['down', 'recast', 'stay', 'up']);
  assert.deepEqual(['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'].map((direction) => FISHING_RESULT_DIRECTIONS[direction]),
    ['down', 'recast', 'stay', 'up']);
  const [hud, styles] = await Promise.all([
    readFile(new URL('src/ui/hud.js', here), 'utf8'),
    readFile(new URL('src/styles.css', here), 'utf8')
  ]);
  assert.match(hud, /MOBILE_FISHING_DIRECTION_ORDER\.entries\(\)/);
  assert.match(styles, /grid-area:\s*1 \/ var\(--fishing-direction-column\)/);
  assert.doesNotMatch(styles, /data-mode="result"\]\) \.touch-down\s*\{\s*grid-area:\s*1 \/ 2/);
});

test('the exact optional 1–5 reasons update one vote and UP clears its reason', async () => {
  assert.equal(SONG_VOTE_SCHEMA_VERSION, 4);
  assert.deepEqual(SONG_DOWNVOTE_REASONS.map(({ id }) => id), expectedReasons);
  assert.deepEqual(SONG_DOWNVOTE_REASON_IDS, expectedReasons);
  expectedReasons.forEach((reason, index) => {
    assert.equal(songDownvoteReasonForDigit(`Digit${index + 1}`), reason);
    assert.equal(songDownvoteReasonForDigit(`Numpad${index + 1}`), reason);
  });

  const local = new SongVoteStore(new MemoryStorage(), 'browser-player');
  local.set(feedback, 'down');
  assert.equal(local.getReason(feedback), null);
  local.set(feedback, 'down', 'too_hard');
  local.set(feedback, 'down', 'awkward_rhythm');
  assert.equal(local.getReason(feedback), 'awkward_rhythm');
  assert.equal(Object.keys(local.exportSummary().votes).length, 1);
  local.set(feedback, 'up', 'bad_fit');
  assert.equal(local.getReason(feedback), null);

  const server = new MemorySongVoteStore();
  await server.setVote({ ...feedback, voterId: 'one', vote: 'down' });
  await server.setVote({ ...feedback, voterId: 'one', vote: 'down', reason: 'too_hard' });
  let aggregate = await server.setVote({ ...feedback, voterId: 'one', vote: 'down', reason: 'bad_fit' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(aggregate.downVotes, 1);
  assert.equal(aggregate.downvoteReasons.too_hard, 0);
  assert.equal(aggregate.downvoteReasons.bad_fit, 1);
  aggregate = await server.setVote({ ...feedback, voterId: 'one', vote: 'up', reason: 'bad_fit' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(aggregate.upVotes, 1);
  assert.ok(Object.values(aggregate.downvoteReasons).every((count) => count === 0));
});

test('PostgreSQL migration and dashboard retain votes while adding readable reason totals', async () => {
  const [store, dashboard] = await Promise.all([
    readFile(new URL('server/src/song-vote-store.js', here), 'utf8'),
    readFile(new URL('src/ui/song-feedback-dashboard.js', here), 'utf8')
  ]);
  assert.match(store, /ADD COLUMN IF NOT EXISTS downvote_reason VARCHAR\(32\) NULL/);
  assert.match(store, /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
  assert.match(store, /ON CONFLICT \(voter_id, species_id, song_revision\) DO UPDATE/);
  assert.match(store, /vote <> 'down'/);
  assert.match(store, /reason_\$\{reason\}/);
  expectedReasons.forEach((reason) => assert.match(store, new RegExp(`'${reason}'`)));
  assert.match(dashboard, /SONG_DOWNVOTE_REASONS\.map\(\(\{ label \}\) => `<th>/);
  assert.match(dashboard, /entry\.downvoteReasons\?\.\[id\]/);
});

test('mobile climbing assists capacity by 15%, range by 12%, and ballistic apex by 8%', async () => {
  assert.equal(MOBILE_CLIMBING_ASSIST.grabDistanceMultiplier, 1.12);
  assert.equal(MOBILE_CLIMBING_ASSIST.staminaCapacityMultiplier, 1.15);
  assert.equal(MOBILE_CLIMBING_ASSIST.jumpApexMultiplier, 1.08);
  assert.ok(Math.abs(MOBILE_CLIMBING_ASSIST.jumpVelocityMultiplier ** 2 - 1.08) < 1e-12);
  const stamina = new StaminaResource({
    maximum: 100, sprintResumeThreshold: 15, sprintDrainPerSecond: 10,
    regenerationPerSecond: 8, regenerationDelay: 0
  });
  stamina.spend(50, 0);
  stamina.setCapacityMultiplier(1.15);
  assert.ok(Math.abs(stamina.maximum - 115) < 1e-12);
  assert.ok(Math.abs(stamina.value - 57.5) < 1e-12);
  stamina.update(1, false, false, true);
  assert.ok(Math.abs(stamina.value - 66.7) < 1e-12);
  stamina.setCapacityMultiplier(1);
  assert.ok(Math.abs(stamina.value / stamina.maximum - 66.7 / 115) < 1e-12);

  const player = await readFile(new URL('src/player/player.js', here), 'utf8');
  assert.match(player, /this\.input\.mobileMode[\s\S]{0,130}grabDistanceMultiplier/);
  assert.match(player, /this\.input\.mobileMode[\s\S]{0,130}jumpVelocityMultiplier/);
});

test('Aquarium Close is outside its transformed content and pinned to safe-area viewport edges', async () => {
  const [html, styles, aquarium] = await Promise.all([
    readFile(new URL('index.html', here), 'utf8'),
    readFile(new URL('src/styles.css', here), 'utf8'),
    readFile(new URL('src/ui/aquarium.js', here), 'utf8')
  ]);
  const closeIndex = html.indexOf('id="close-aquarium"');
  const modalIndex = html.indexOf('id="aquarium-menu"');
  const modalEnd = html.indexOf('</section>', modalIndex);
  assert.ok(closeIndex >= 0 && closeIndex < modalIndex);
  assert.ok(closeIndex < modalIndex || closeIndex > modalEnd);
  assert.match(styles, /\.aquarium-close-overlay\s*\{[^}]*position:\s*fixed/);
  assert.match(styles, /top:\s*calc\(env\(safe-area-inset-top\) \+ 8px\)/);
  assert.match(styles, /right:\s*calc\(env\(safe-area-inset-right\) \+ 8px\)/);
  assert.match(styles, /\.aquarium-close-overlay\s*\{[^}]*z-index:\s*94/);
  assert.match(aquarium, /this\.closeButton\.hidden = false/);
  assert.match(aquarium, /this\.closeButton\.hidden = true/);
});

test('Skyreach uses the supplied GLB shell at measured roof/spire scale with authored proxies', async () => {
  assert.equal(SKYREACH_TOWER_CONFIG.mainRoofHeight, 381);
  assert.equal(SKYREACH_TOWER_CONFIG.mainRoofHeight / .3048, 1250);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceRoofHeight
    * SKYREACH_TOWER_CONFIG.visualVerticalScale - 381) < .001);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.visualSourceSpireHeight
    * SKYREACH_TOWER_CONFIG.visualVerticalScale - SKYREACH_TOWER_CONFIG.spireHeight) < .001);
  assert.ok(Math.abs(SKYREACH_TOWER_CONFIG.spireHeight / .3048 - 1407.45) < .02);
  assert.equal(SKYREACH_TOWER_CONFIG.routeCount, 4);
  assert.equal(SKYREACH_TOWER_CONFIG.observationHeight, 316.992);
  assert.ok((await stat(new URL('public/assets/models/empire-state-building.glb', here))).size > 250_000);
  assert.ok((await stat(new URL('third_party/empire-state-building/LICENSE.html', here))).size > 1_000);

  const source = await readFile(new URL('src/world/mountain-v2.js', here), 'utf8');
  assert.match(source, /loadFromUrl\(SKYREACH_TOWER_CONFIG\.visualAssetUrl, 'container'/);
  assert.match(source, /visual shell — SonnySee CC BY 3\.0/);
  assert.match(source, /facade proxy corner[\s\S]{0,260}render\.enabled = false/);
  for (const route of ['Accessible Architectural', 'Technical Masonry', 'Moving Maintenance', 'Exposed Fast']) {
    assert.match(source, new RegExp(route));
  }
  assert.match(source, /addSkyreachElevators/);
  assert.match(source, /skyreach-observation-reached/);
  assert.match(source, /skyreach-roof-reached/);
});

test('toilet is a real tiny normal-system fishing source with a fixed bowl target', () => {
  const descriptor = SKYREACH_FISHING_DESCRIPTORS.find(({ id }) => id === 'skyreach-toilet');
  assert.equal(descriptor.label, 'Skyscraper Restroom');
  assert.deepEqual(descriptor.radii, [.32, .33]);
  assert.equal(descriptor.minimumCastDistance, .35);
  assert.equal(descriptor.maximumCastDistance, 2.2);
  assert.deepEqual(descriptor.fixedCastTarget, descriptor.center);
  const zone = new FishingZone({
    id: descriptor.id, label: descriptor.label, center: descriptor.center,
    radii: { x: descriptor.radii[0], z: descriptor.radii[1] },
    surfaceY: descriptor.center.y, fishIds: descriptor.fish,
    minimumCastDistance: descriptor.minimumCastDistance,
    maximumCastDistance: descriptor.maximumCastDistance,
    fixedCastTarget: descriptor.fixedCastTarget
  });
  assert.equal(zone.containsWaterFootprint(zone.fixedCastTarget), true);
  assert.equal(zone.fishIds.length, 2);
});

test('Skyreach elevator milestones migrate and persist per save without duplicates', () => {
  assert.equal(SAVE_SCHEMA_VERSION, 13);
  assert.deepEqual(migrate({ version: 12 }).worldMilestones, []);
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  assert.equal(save.unlockWorldMilestone('skyreach-observation-reached', { legitimate: false }), false);
  assert.equal(save.hasWorldMilestone('skyreach-observation-reached'), false);
  assert.equal(save.unlockWorldMilestone('skyreach-observation-reached'), true);
  assert.equal(save.unlockWorldMilestone('skyreach-observation-reached'), false);
  assert.equal(save.hasWorldMilestone('skyreach-observation-reached'), true);
  assert.equal(new SaveSystem(storage).hasWorldMilestone('skyreach-observation-reached'), true);
});
