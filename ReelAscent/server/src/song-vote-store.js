import pg from 'pg';

const { Pool } = pg;
const safeId = (value, maximum) => String(value ?? '').trim().toLowerCase()
  .replace(/[^a-z0-9_:-]/g, '_').slice(0, maximum);
export const SONG_DOWNVOTE_REASON_IDS = Object.freeze([
  'too_hard', 'too_easy', 'awkward_rhythm', 'too_long', 'bad_fit'
]);
const DOWNVOTE_REASON_IDS = new Set(SONG_DOWNVOTE_REASON_IDS);
const normalizeReason = (value) => DOWNVOTE_REASON_IDS.has(value) ? value : null;
const REASON_AGGREGATE_COLUMNS = SONG_DOWNVOTE_REASON_IDS.map((reason) => (
  `COUNT(*) FILTER (WHERE vote = 'down' AND downvote_reason = '${reason}')::integer AS "reason_${reason}"`
)).join(',\n          ');

export function normalizeSongVote(value = {}) {
  const voterId = String(value.voterId ?? '').trim().slice(0, 160);
  const speciesId = safeId(value.speciesId, 100);
  const songId = safeId(value.songId, 180);
  const songRevision = Math.max(1, Math.min(1_000_000, Math.floor(Number(value.songRevision) || 1)));
  const vote = value.vote === null || value.vote === 'none' ? null
    : value.vote === 'up' || value.vote === 'down' ? value.vote : undefined;
  if (!voterId || !speciesId || !songId.startsWith('song:') || vote === undefined) return null;
  const reason = vote === 'down' ? normalizeReason(value.reason) : null;
  return { voterId, speciesId, songId, songRevision, vote, reason };
}

const aggregate = (record, upVotes = 0, downVotes = 0) => {
  const up = Number(upVotes) || 0;
  const down = Number(downVotes) || 0;
  const totalVotes = up + down;
  const downvoteReasons = Object.fromEntries(SONG_DOWNVOTE_REASON_IDS.map((reason) => [
    reason, Number(record[`reason_${reason}`] ?? record.downvoteReasons?.[reason]) || 0
  ]));
  return {
    speciesId: record.speciesId,
    songId: record.songId,
    songRevision: record.songRevision,
    upVotes: up,
    downVotes: down,
    totalVotes,
    approvalPercent: totalVotes ? up / totalVotes * 100 : 0,
    downvoteReasons
  };
};

export class DisabledSongVoteStore {
  constructor(reason = 'DATABASE_URL is not configured') {
    this.available = false;
    this.durable = false;
    this.postgresConnected = false;
    this.schemaInitialized = false;
    this.initializationStage = 'connection';
    this.reason = reason;
  }
  async initialize() {}
  async setVote() { throw new Error(this.reason); }
  async listAggregates() { throw new Error(this.reason); }
  async close() {}
}

export class MemorySongVoteStore {
  constructor() {
    this.available = true;
    this.durable = false;
    this.postgresConnected = false;
    this.schemaInitialized = false;
    this.reason = 'Test-only memory adapter';
    this.votes = new Map();
  }
  async initialize() {}
  async setVote(value) {
    const record = normalizeSongVote(value);
    if (!record) throw new Error('Invalid song vote');
    const key = `${record.voterId}\u0000${record.speciesId}\u0000${record.songRevision}`;
    if (record.vote === null) this.votes.delete(key); else this.votes.set(key, record);
    return (await this.listAggregates({ speciesId: record.speciesId, songRevision: record.songRevision }))[0]
      ?? aggregate(record);
  }
  async listAggregates({ speciesId = '', songRevision = null } = {}) {
    const groups = new Map();
    for (const record of this.votes.values()) {
      if (speciesId && record.speciesId !== speciesId) continue;
      if (songRevision !== null && record.songRevision !== Number(songRevision)) continue;
      const key = `${record.speciesId}@${record.songRevision}`;
      const group = groups.get(key) ?? aggregate(record);
      if (record.vote === 'up') group.upVotes += 1;
      if (record.vote === 'down') {
        group.downVotes += 1;
        if (record.reason) group.downvoteReasons[record.reason] += 1;
      }
      group.totalVotes = group.upVotes + group.downVotes;
      group.approvalPercent = group.totalVotes ? group.upVotes / group.totalVotes * 100 : 0;
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => left.speciesId.localeCompare(right.speciesId)
      || right.songRevision - left.songRevision);
  }
  async close() {}
}

export class PostgresSongVoteStore {
  constructor(databaseUrl, { ssl = false, logger = console } = {}) {
    this.available = false;
    this.durable = true;
    this.postgresConnected = false;
    this.schemaInitialized = false;
    this.initializationStage = 'connection';
    this.reason = '';
    this.logger = logger;
    // Let pg honor sslmode and other secure options embedded in DATABASE_URL. The
    // optional legacy override remains available when a provider supplies a URL
    // without its required SSL mode.
    const poolConfig = { connectionString: databaseUrl, connectionTimeoutMillis: 8_000 };
    if (ssl) poolConfig.ssl = { rejectUnauthorized: false };
    this.pool = new Pool(poolConfig);
  }

  async initialize() {
    await this.pool.query('SELECT 1');
    this.postgresConnected = true;
    this.logger.info('[reel-ascent] PostgreSQL connected');
    this.initializationStage = 'schema';
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reel_ascent_song_votes (
        voter_id VARCHAR(160) NOT NULL,
        species_id VARCHAR(100) NOT NULL,
        song_id VARCHAR(180) NOT NULL,
        song_revision INTEGER NOT NULL CHECK (song_revision > 0),
        vote VARCHAR(4) NOT NULL CHECK (vote IN ('up', 'down')),
        downvote_reason VARCHAR(32) NULL CHECK (downvote_reason IS NULL OR (vote = 'down' AND downvote_reason IN ('too_hard', 'too_easy', 'awkward_rhythm', 'too_long', 'bad_fit'))),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (voter_id, species_id, song_revision)
      )
    `);
    // Existing v16.3 databases receive the nullable column without losing vote history.
    await this.pool.query('ALTER TABLE reel_ascent_song_votes ADD COLUMN IF NOT EXISTS downvote_reason VARCHAR(32) NULL');
    // v17.2 replaces the brief v17.1 draft taxonomy. Only the optional reason is cleared;
    // the vote row, voter identity, timestamps, song, and historical revision all survive.
    await this.pool.query(`
      UPDATE reel_ascent_song_votes
      SET downvote_reason = NULL
      WHERE downvote_reason IS NOT NULL
        AND (vote <> 'down'
          OR downvote_reason NOT IN ('too_hard', 'too_easy', 'awkward_rhythm', 'too_long', 'bad_fit'))
    `);
    await this.pool.query('ALTER TABLE reel_ascent_song_votes DROP CONSTRAINT IF EXISTS reel_ascent_song_votes_downvote_reason_check');
    await this.pool.query(`
      ALTER TABLE reel_ascent_song_votes
      ADD CONSTRAINT reel_ascent_song_votes_downvote_reason_check
      CHECK (downvote_reason IS NULL OR (vote = 'down' AND downvote_reason IN ('too_hard', 'too_easy', 'awkward_rhythm', 'too_long', 'bad_fit')))
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS reel_ascent_song_votes_species_revision
      ON reel_ascent_song_votes (species_id, song_revision)
    `);
    this.schemaInitialized = true;
    this.available = true;
    this.initializationStage = 'ready';
    this.logger.info('[reel-ascent] song-voting schema initialized successfully');
  }

  async setVote(value) {
    const record = normalizeSongVote(value);
    if (!record) throw new Error('Invalid song vote');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize changes for one species/revision so each live aggregate is computed
      // after prior writes to that same aggregate have committed.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`${record.speciesId}:${record.songRevision}`]
      );
      if (record.vote === null) {
        await client.query(
          'DELETE FROM reel_ascent_song_votes WHERE voter_id = $1 AND species_id = $2 AND song_revision = $3',
          [record.voterId, record.speciesId, record.songRevision]
        );
      } else {
        await client.query(`
          INSERT INTO reel_ascent_song_votes
            (voter_id, species_id, song_id, song_revision, vote, downvote_reason)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (voter_id, species_id, song_revision) DO UPDATE SET
            song_id = EXCLUDED.song_id,
            vote = EXCLUDED.vote,
            downvote_reason = EXCLUDED.downvote_reason,
            updated_at = NOW()
        `, [record.voterId, record.speciesId, record.songId, record.songRevision, record.vote, record.reason]);
      }
      const result = await client.query(`
        SELECT
          species_id AS "speciesId",
          MAX(song_id) AS "songId",
          song_revision AS "songRevision",
          COUNT(*) FILTER (WHERE vote = 'up')::integer AS "upVotes",
          COUNT(*) FILTER (WHERE vote = 'down')::integer AS "downVotes",
          ${REASON_AGGREGATE_COLUMNS}
        FROM reel_ascent_song_votes
        WHERE species_id = $1 AND song_revision = $2
        GROUP BY species_id, song_revision
      `, [record.speciesId, record.songRevision]);
      await client.query('COMMIT');
      const row = result.rows[0];
      return row ? aggregate(row, row.upVotes, row.downVotes) : aggregate(record);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }

  async listAggregates({ speciesId = '', songRevision = null } = {}) {
    const clauses = [];
    const values = [];
    if (speciesId) {
      values.push(safeId(speciesId, 100));
      clauses.push(`species_id = $${values.length}`);
    }
    if (songRevision !== null && Number.isFinite(Number(songRevision))) {
      values.push(Math.max(1, Math.floor(Number(songRevision))));
      clauses.push(`song_revision = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const result = await this.pool.query(`
      SELECT
        species_id AS "speciesId",
        MAX(song_id) AS "songId",
        song_revision AS "songRevision",
        COUNT(*) FILTER (WHERE vote = 'up')::integer AS "upVotes",
        COUNT(*) FILTER (WHERE vote = 'down')::integer AS "downVotes",
        ${REASON_AGGREGATE_COLUMNS}
      FROM reel_ascent_song_votes
      ${where}
      GROUP BY species_id, song_revision
      ORDER BY species_id ASC, song_revision DESC
    `, values);
    return result.rows.map((row) => aggregate(row, row.upVotes, row.downVotes));
  }

  async close() { await this.pool.end(); }
}

export async function createSongVoteStore({ databaseUrl = '', databaseSsl = false, logger = console } = {}) {
  if (!databaseUrl) {
    logger.warn('[reel-ascent] PostgreSQL not configured; song-voting schema not initialized');
    return new DisabledSongVoteStore();
  }
  let store = null;
  try {
    store = new PostgresSongVoteStore(databaseUrl, { ssl: databaseSsl, logger });
    await store.initialize();
    return store;
  } catch (error) {
    await store?.close().catch(() => {});
    const diagnostic = typeof error?.code === 'string' ? ` (${error.code})` : '';
    if (store?.initializationStage === 'schema') {
      logger.error(`[reel-ascent] song-voting schema initialization failed; durable voting disabled${diagnostic}`);
    } else {
      logger.error(`[reel-ascent] PostgreSQL connection failed; song-voting schema not initialized${diagnostic}`);
    }
    return new DisabledSongVoteStore(`Database initialization failed${diagnostic}`);
  }
}
