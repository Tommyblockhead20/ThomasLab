import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { RhythmSession, RHYTHM_CHORD_INPUT_WINDOW_SECONDS } from '../src/fishing/rhythm-session.js';
import {
  SONG_DOWNVOTE_REASONS,
  SONG_VOTE_SCHEMA_VERSION,
  SongVoteStore
} from '../src/fishing/song-votes.js';
import { INVENTORY_SORT_OPTIONS, sortInventorySpecimens } from '../src/ui/inventory.js';
import { MemorySongVoteStore } from '../server/src/song-vote-store.js';
import { GAME_VERSION } from '../src/version.js';

const here = new URL('../', import.meta.url);
const feedback = Object.freeze({
  speciesId: 'bluegill', songId: 'song:bluegill:authored-1', songRevision: 1
});

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const specimens = Object.freeze([
  { specimenId: 'a', name: 'Zander', rarity: 'Common', value: 5, length: 4, weight: 1, lengthCategoryIndex: 0, sizeCategoryIndex: 0, provenance: { caughtAt: 1, locationLabel: 'Alpine Pond' } },
  { specimenId: 'b', name: 'Bluegill', rarity: 'Legendary', value: 50, length: 8, weight: 4, lengthCategoryIndex: 3, sizeCategoryIndex: 3, provenance: { caughtAt: 3, locationLabel: 'Cabin Pond' } },
  { specimenId: 'c', name: 'Carp', rarity: 'Rare', value: 20, length: 6, weight: 2, lengthCategoryIndex: 2, sizeCategoryIndex: 2, provenance: { caughtAt: 2, locationLabel: 'Beach' } }
]);

test('v17.1 exposes the exact shared Inventory/Aquarium sort contract', () => {
  assert.equal(GAME_VERSION, 'v17.1');
  assert.deepEqual(INVENTORY_SORT_OPTIONS.map(([, label]) => label), [
    'Recently Caught', 'Value', 'Rarity', 'Size', 'Species', 'Location'
  ]);
  assert.deepEqual(sortInventorySpecimens(specimens, 'recent').map((entry) => entry.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(sortInventorySpecimens(specimens, 'value').map((entry) => entry.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(sortInventorySpecimens(specimens, 'rarity').map((entry) => entry.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(sortInventorySpecimens(specimens, 'size').map((entry) => entry.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(sortInventorySpecimens(specimens, 'species').map((entry) => entry.specimenId), ['b', 'c', 'a']);
  assert.deepEqual(sortInventorySpecimens(specimens, 'location').map((entry) => entry.specimenId), ['a', 'c', 'b']);
});

function makeChordSession(lanes) {
  const session = new RhythmSession(FISH_SPECIES[0], 0, () => .5);
  session.pattern = {
    notes: lanes.map((lane, id) => ({
      id, lane, degree: id + 1, groupIndex: 4, stepIndex: id, hitTime: 1,
      duration: 0, timingWindowScale: 1, status: 'pending'
    })),
    requiredHits: lanes.length,
    totalEvents: lanes.length,
    duration: 2
  };
  // The real game updates continuously during the approach; start this focused fixture
  // just before the chord so pause-gap compensation does not treat setup as a tab pause.
  session.lastNow = .95;
  return session;
}

test('rhythm chords collect 2, 3, and 4 unordered lanes across a real input window', () => {
  assert.ok(RHYTHM_CHORD_INPUT_WINDOW_SECONDS >= .05 && RHYTHM_CHORD_INPUT_WINDOW_SECONDS <= .1);
  for (const order of [['W', 'A'], ['A', 'W', 'S'], ['D', 'A', 'S', 'W']]) {
    const session = makeChordSession([...order].sort());
    order.forEach((lane, index) => session.update(.98 + index * .018, [{ lane, time: .98 + index * .018 }]));
    assert.equal(session.successfulNotes, order.length);
    assert.equal(session.misses, 0);
    assert.equal(session.result, 'caught');
  }
});

test('a partial chord is not failed on its first separately delivered keydown', () => {
  const session = makeChordSession(['W', 'S', 'A']);
  session.update(.99, [{ lane: 'W', time: .99 }]);
  assert.equal(session.successfulNotes, 0);
  assert.equal(session.misses, 0);
  assert.ok(session.pendingChordInput);
  session.update(1.025, [{ lane: 'S', time: 1.025 }]);
  session.update(1.055, [{ lane: 'A', time: 1.055 }]);
  assert.equal(session.successfulNotes, 3);
  assert.equal(session.misses, 0);
});

test('single rhythm notes remain immediate', () => {
  const session = makeChordSession(['W']);
  session.update(1, [{ lane: 'W', time: 1 }]);
  assert.equal(session.successfulNotes, 1);
  assert.equal(session.result, 'caught');
});

test('downvote reasons use stable IDs locally and clear when DOWN changes to UP', () => {
  assert.deepEqual(SONG_DOWNVOTE_REASONS.map(({ id }) => id), [
    'sounds_bad', 'too_hard', 'too_easy', 'bugged', 'bad_instrument', 'other'
  ]);
  assert.equal(SONG_VOTE_SCHEMA_VERSION, 3);
  const store = new SongVoteStore(new MemoryStorage(), 'browser-player');
  assert.equal(store.set(feedback, 'down'), 'down');
  assert.equal(store.getReason(feedback), null);
  store.set(feedback, 'down', 'bugged');
  assert.equal(store.getReason(feedback), 'bugged');
  store.set(feedback, 'up');
  assert.equal(store.getReason(feedback), null);
});

test('server aggregates one durable-style reason per voter and removes it on vote change', async () => {
  const store = new MemorySongVoteStore();
  await store.setVote({ ...feedback, voterId: 'a', vote: 'down' });
  let aggregate = await store.setVote({ ...feedback, voterId: 'a', vote: 'down', reason: 'too_hard' });
  assert.equal(aggregate.totalVotes, 1);
  assert.equal(aggregate.downvoteReasons.too_hard, 1);
  aggregate = await store.setVote({ ...feedback, voterId: 'a', vote: 'up', reason: 'too_hard' });
  assert.equal(aggregate.downVotes, 0);
  assert.equal(aggregate.downvoteReasons.too_hard, 0);
  aggregate = await store.setVote({ ...feedback, voterId: 'b', vote: 'down', reason: 'sounds_bad' });
  assert.equal(aggregate.downvoteReasons.sounds_bad, 1);
});

test('Aquarium, Appearance, mobile, and downvote UI source retains the requested architecture', async () => {
  const [html, aquarium, appearance, movement, hud, game, styles, serverStore, dashboard] = await Promise.all([
    readFile(new URL('index.html', here), 'utf8'),
    readFile(new URL('src/ui/aquarium.js', here), 'utf8'),
    readFile(new URL('src/ui/appearance-menu.js', here), 'utf8'),
    readFile(new URL('src/player/movement.js', here), 'utf8'),
    readFile(new URL('src/ui/hud.js', here), 'utf8'),
    readFile(new URL('src/game.js', here), 'utf8'),
    readFile(new URL('src/styles.css', here), 'utf8'),
    readFile(new URL('server/src/song-vote-store.js', here), 'utf8'),
    readFile(new URL('src/ui/song-feedback-dashboard.js', here), 'utf8')
  ]);
  assert.match(aquarium, /sortInventorySpecimens\(result\.items, this\.sortMode\)/);
  assert.match(aquarium, /captureBrowserPosition[\s\S]*restoreBrowserPosition/);
  assert.match(aquarium, /selectionFallbackIndex/);
  assert.match(appearance, /key: 'avatarType'[\s\S]{0,120}section: 'body'/);
  assert.doesNotMatch(appearance, /key: 'avatarType'[\s\S]{0,120}section: 'accessories'/);
  assert.match(html, /data-touch-action="sprint"[\s\S]{0,260}data-touch-action="jump"[\s\S]{0,260}data-touch-action="slide"/);
  assert.match(movement, /this\.touchPointers\.set\(event\.pointerId/);
  assert.match(styles, /data-mode="fishing"[\s\S]{0,900}repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /data-mode="fishing"[\s\S]{0,1500}touch-sprint[\s\S]{0,100}touch-slide[\s\S]{0,100}touch-jump[\s\S]{0,100}display: none/);
  assert.match(hud, /postCastFishing = !\['inactive', 'ready', 'charging'\]/);
  assert.match(game, /submitSongVote\(feedback, 'down', detail\)/);
  assert.match(serverStore, /downvote_reason VARCHAR\(32\)/);
  assert.match(serverStore, /REASON_AGGREGATE_COLUMNS[\s\S]*downvoteReasons/);
  assert.match(dashboard, /Downvote reasons/);
  assert.match(html, /data-song-downvote-reason="skip"/);
});
