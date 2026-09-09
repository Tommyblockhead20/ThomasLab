import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fishingResultActionForDirection } from '../src/fishing/result-actions.js';
import {
  LEGACY_SONG_VOTES_STORAGE_KEY,
  SONG_VOTES_STORAGE_KEY,
  SongVoteStore,
  songVoteKey
} from '../src/fishing/song-votes.js';
import { generateRhythmPattern } from '../src/fishing/rhythm-session.js';
import { FISH_SPECIES } from '../src/fishing/fish-data.js';
import { MemorySongVoteStore } from '../server/src/song-vote-store.js';
import { MESSAGE_TYPES as CLIENT_MESSAGES, createPlayerSnapshot } from '../src/multiplayer/protocol.js';
import { MESSAGE_TYPES as SERVER_MESSAGES } from '../server/src/protocol.js';
import { GAME_VERSION } from '../src/version.js';

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

const feedback = Object.freeze({
  speciesId: 'giant_pacific_octopus',
  songId: 'song:giant_pacific_octopus:authored-1',
  songRevision: 1
});

test('v16.1 version and four result directions are canonical', () => {
  assert.equal(GAME_VERSION, 'v16.1');
  assert.deepEqual([
    fishingResultActionForDirection('ArrowUp'),
    fishingResultActionForDirection('ArrowDown'),
    fishingResultActionForDirection('ArrowLeft'),
    fishingResultActionForDirection('ArrowRight')
  ], ['recast', 'stay', 'down', 'up']);
  assert.equal(fishingResultActionForDirection('up'), 'recast');
});

test('song assignments carry a stable explicit revision', () => {
  const fish = FISH_SPECIES[0];
  const first = generateRhythmPattern(fish, () => .1);
  const second = generateRhythmPattern(fish, () => .9);
  assert.equal(first.songId, second.songId);
  assert.equal(first.songRevision, 1);
  assert.equal(generateRhythmPattern({ ...fish, songRevision: 2 }, () => .5).songRevision, 2);
});

test('local votes are keyed by species and revision using the browser player identity', () => {
  const storage = new MemoryStorage();
  const store = new SongVoteStore(storage, 'browser-player-a');
  assert.equal(store.set(feedback, 'up'), 'up');
  assert.equal(store.set({ ...feedback, songId: 'song:giant_pacific_octopus:authored-99' }, 'down'), 'down');
  assert.equal(Object.keys(store.exportSummary().votes).length, 1);
  assert.equal(store.exportSummary().voterId, 'browser-player-a');
  assert.equal(store.get({ ...feedback, songRevision: 2 }), null);
  assert.equal(store.set({ ...feedback, songRevision: 2 }, 'up'), 'up');
  assert.equal(Object.keys(JSON.parse(storage.getItem(SONG_VOTES_STORAGE_KEY)).votes).length, 2);
});

test('legacy v16 song votes migrate to revision one without keeping a second voter identity', () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_SONG_VOTES_STORAGE_KEY, JSON.stringify({
    version: 1,
    voterId: 'old-independent-id',
    votes: { [feedback.songId]: 'up' }
  }));
  const store = new SongVoteStore(storage, 'browser-multiplayer-id');
  assert.equal(store.get(feedback), 'up');
  assert.equal(store.exportSummary().voterId, 'browser-multiplayer-id');
  assert.equal(songVoteKey(feedback), 'giant_pacific_octopus@1');
});

test('aggregate store updates rather than inflates and keeps revisions historical', async () => {
  const store = new MemorySongVoteStore();
  const vote = (voterId, value, songRevision = 1) => store.setVote({ ...feedback, voterId, vote: value, songRevision });
  assert.deepEqual(await vote('a', 'up'), { ...feedback, upVotes: 1, downVotes: 0, totalVotes: 1, approvalPercent: 100 });
  assert.deepEqual(await vote('a', 'down'), { ...feedback, upVotes: 0, downVotes: 1, totalVotes: 1, approvalPercent: 0 });
  assert.equal((await vote('a', 'down')).totalVotes, 1);
  assert.deepEqual(await vote('b', 'up'), { ...feedback, upVotes: 1, downVotes: 1, totalVotes: 2, approvalPercent: 50 });
  assert.equal((await vote('a', null)).totalVotes, 1);
  assert.equal((await vote('a', 'up', 2)).songRevision, 2);
  const history = await store.listAggregates({ speciesId: feedback.speciesId });
  assert.deepEqual(history.map(({ songRevision }) => songRevision), [2, 1]);
});

test('votes use dedicated low-frequency protocol types and never enter movement snapshots', () => {
  for (const name of ['SONG_VOTE_SET', 'SONG_VOTE_AGGREGATE', 'SONG_VOTE_RESULTS_REQUEST', 'SONG_VOTE_RESULTS']) {
    assert.equal(CLIENT_MESSAGES[name], SERVER_MESSAGES[name]);
  }
  const snapshot = createPlayerSnapshot('player', {
    position: { x: 0, y: 0, z: 0 }, globalPosition: { x: 0, y: 0, z: 0 }, appearance: {}
  }, 1);
  assert.doesNotMatch(JSON.stringify(snapshot), /songVote|song_vote|approvalPercent/);
});

test('v16.1 source preserves results, owns mobile input, and uses durable PostgreSQL storage', async () => {
  const [html, styles, fishing, game, serverStore, server, dashboard] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/fishing/fishing.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/game.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/src/song-vote-store.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/src/server.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/song-feedback-dashboard.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /mobile-utility-cluster[\s\S]*mobile-pause[\s\S]*open-inventory[\s\S]*open-journal/);
  assert.match(styles, /mobile-dpad[\s\S]{0,180}12\.8rem/);
  assert.match(html, /data-fishing-result-action="recast"[\s\S]*data-fishing-result-action="stay"/);
  assert.match(fishing, /if \(!this\.lastSongFeedback\)[\s\S]{0,260}this\.resultTimer -= dt/);
  assert.match(fishing, /performResultAction\(action\)[\s\S]{0,500}this\.startCast\(\)/);
  assert.match(game, /onFishingResultKeyDown[\s\S]*stopImmediatePropagation/);
  assert.match(game, /onFishingResultPointerDown[\s\S]*stopImmediatePropagation/);
  assert.match(serverStore, /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
  assert.match(serverStore, /ON CONFLICT \(voter_id, species_id, song_revision\) DO UPDATE/);
  assert.match(server, /broadcastSongAggregate/);
  assert.match(dashboard, /Lowest Approval[\s\S]*Most Dislikes[\s\S]*Most Votes[\s\S]*Species Name/);
  assert.match(dashboard, /SHOW HISTORICAL REVISIONS/);
});
