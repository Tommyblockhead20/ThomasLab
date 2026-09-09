import pg from 'pg';

const { Pool } = pg;
const safeId = (value, maximum) => String(value ?? '').trim().toLowerCase()
  .replace(/[^a-z0-9_:-]/g, '_').slice(0, maximum);

export function normalizeSongVote(value = {}) {
  const voterId = String(value.voterId ?? '').trim().slice(0, 160);
  const speciesId = safeId(value.speciesId, 100);
  const songId = safeId(value.songId, 180);
  const songRevision = Math.max(1, Math.min(1_000_000, Math.floor(Number(value.songRevision) || 1)));
  const vote = value.vote === null || value.vote === 'none' ? null
    : value.vote === 'up' || value.vote === 'down' ? value.vote : undefined;
  if (!voterId || !speciesId || !songId.startsWith('song:') || vote === undefined) return null;
  return { voterId, speciesId, songId, songRevision, vote };
}

const aggregate = (record, upVotes = 0, downVotes = 0) => {
  const up = Number(upVotes) || 0;
  const down = Number(downVotes) || 0;
  const totalVotes = up + down;
  return {
    speciesId: record.speciesId,
    songId: record.songId,
    songRevision: record.songRevision,
    upVotes: up,
    downVotes: down,
    totalVotes,
    approvalPercent: totalVotes ? up / totalVotes * 100 : 0
  };
};

export class DisabledSongVoteStore {
  constructor(reason = 'DATABASE_URL is not configured') {
    this.available = false;
    this.durable = false;
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
      if (record.vote === 'down') group.downVotes += 1;
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
  constructor(databaseUrl, { ssl = false } = {}) {
    this.available = false;
    this.durable = true;
    this.reason = '';
    this.pool = new Pool({ connectionString: databaseUrl, ssl: ssl ? { rejectUnauthorized: false } : false });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS reel_ascent_song_votes (
        voter_id VARCHAR(160) NOT NULL,
        species_id VARCHAR(100) NOT NULL,
        song_id VARCHAR(180) NOT NULL,
        song_revision INTEGER NOT NULL CHECK (song_revision > 0),
        vote VARCHAR(4) NOT NULL CHECK (vote IN ('up', 'down')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (voter_id, species_id, song_revision)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS reel_ascent_song_votes_species_revision
      ON reel_ascent_song_votes (species_id, song_revision)
    `);
    this.available = true;
  }

  async setVote(value) {
    const record = normalizeSongVote(value);
    if (!record) throw new Error('Invalid song vote');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (record.vote === null) {
        await client.query(
          'DELETE FROM reel_ascent_song_votes WHERE voter_id = $1 AND species_id = $2 AND song_revision = $3',
          [record.voterId, record.speciesId, record.songRevision]
        );
      } else {
        await client.query(`
          INSERT INTO reel_ascent_song_votes
            (voter_id, species_id, song_id, song_revision, vote)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (voter_id, species_id, song_revision) DO UPDATE SET
            song_id = EXCLUDED.song_id,
            vote = EXCLUDED.vote,
            updated_at = NOW()
        `, [record.voterId, record.speciesId, record.songId, record.songRevision, record.vote]);
      }
      const result = await client.query(`
        SELECT
          species_id AS "speciesId",
          MAX(song_id) AS "songId",
          song_revision AS "songRevision",
          COUNT(*) FILTER (WHERE vote = 'up')::integer AS "upVotes",
          COUNT(*) FILTER (WHERE vote = 'down')::integer AS "downVotes"
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
        COUNT(*) FILTER (WHERE vote = 'down')::integer AS "downVotes"
      FROM reel_ascent_song_votes
      ${where}
      GROUP BY species_id, song_revision
      ORDER BY species_id ASC, song_revision DESC
    `, values);
    return result.rows.map((row) => aggregate(row, row.upVotes, row.downVotes));
  }

  async close() { await this.pool.end(); }
}

export async function createSongVoteStore({ databaseUrl = '', databaseSsl = false } = {}) {
  if (!databaseUrl) return new DisabledSongVoteStore();
  const store = new PostgresSongVoteStore(databaseUrl, { ssl: databaseSsl });
  try {
    await store.initialize();
    return store;
  } catch (error) {
    await store.close().catch(() => {});
    return new DisabledSongVoteStore(`Database initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
