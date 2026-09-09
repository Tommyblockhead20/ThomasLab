import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSongVoteStore, DisabledSongVoteStore } from '../server/src/song-vote-store.js';
import { GAME_VERSION } from '../src/version.js';

test('v16.3 uses the Node PostgreSQL driver and keeps credentials environment-only', async () => {
  const [serverPackage, config, example] = await Promise.all([
    readFile(new URL('../server/package.json', import.meta.url), 'utf8'),
    readFile(new URL('../server/src/config.js', import.meta.url), 'utf8'),
    readFile(new URL('../server/.env.example', import.meta.url), 'utf8')
  ]);
  assert.equal(GAME_VERSION, 'v16.3');
  assert.equal(JSON.parse(serverPackage).dependencies.pg, '^8.23.0');
  assert.match(config, /process\.env\.DATABASE_URL/);
  assert.match(example, /DATABASE_URL=\s*$/m);
  assert.doesNotMatch(example, /postgres(?:ql)?:\/\/[^\s]+/i);
});

test('PostgreSQL schema is durable, revisioned, unique, and concurrency-safe', async () => {
  const source = await readFile(new URL('../server/src/song-vote-store.js', import.meta.url), 'utf8');
  assert.match(source, /CREATE TABLE IF NOT EXISTS reel_ascent_song_votes/);
  assert.match(source, /PRIMARY KEY \(voter_id, species_id, song_revision\)/);
  assert.match(source, /ON CONFLICT \(voter_id, species_id, song_revision\) DO UPDATE/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /GROUP BY species_id, song_revision/);
  assert.match(source, /PostgreSQL connected/);
  assert.match(source, /song-voting schema initialized successfully/);
  assert.doesNotMatch(source, /ssl:\s*ssl\s*\?[^\n]+:\s*false/);
});

test('missing database configuration is explicit and non-fatal', async () => {
  const messages = [];
  const logger = {
    info: (message) => messages.push(message),
    warn: (message) => messages.push(message),
    error: (message) => messages.push(message)
  };
  const store = await createSongVoteStore({ databaseUrl: '', logger });
  assert.ok(store instanceof DisabledSongVoteStore);
  assert.equal(store.available, false);
  assert.equal(store.durable, false);
  assert.equal(store.postgresConnected, false);
  assert.equal(store.schemaInitialized, false);
  assert.match(messages.join('\n'), /PostgreSQL not configured; song-voting schema not initialized/);
});

