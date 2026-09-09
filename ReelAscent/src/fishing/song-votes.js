export const SONG_VOTES_STORAGE_KEY = 'reel-ascent-song-votes-v1';
export const SONG_VOTE_SCHEMA_VERSION = 1;

const createVoterId = () => `voter-${globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
const validSongId = (value) => typeof value === 'string' && /^song:[a-z0-9_:-]{1,180}$/i.test(value);
const validVote = (value) => value === 'up' || value === 'down';

export function normalizeSongVotes(value = {}) {
  const votes = {};
  for (const [songId, vote] of Object.entries(value?.votes ?? {})) {
    if (validSongId(songId) && validVote(vote)) votes[songId] = vote;
  }
  return {
    version: SONG_VOTE_SCHEMA_VERSION,
    voterId: typeof value?.voterId === 'string' && value.voterId ? value.voterId.slice(0, 180) : createVoterId(),
    votes
  };
}

export class SongVoteStore {
  constructor(storage = null) {
    this.storage = storage ?? (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
    this.data = this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(SONG_VOTES_STORAGE_KEY);
      return normalizeSongVotes(raw ? JSON.parse(raw) : {});
    } catch { return normalizeSongVotes(); }
  }

  persist() {
    try { this.storage?.setItem(SONG_VOTES_STORAGE_KEY, JSON.stringify(this.data)); } catch {}
  }

  get(songId) { return validSongId(songId) ? this.data.votes[songId] ?? null : null; }

  set(songId, vote = null) {
    if (!validSongId(songId) || (vote !== null && !validVote(vote))) return null;
    if (vote === null) delete this.data.votes[songId];
    else this.data.votes[songId] = vote;
    this.persist();
    return this.get(songId);
  }

  toggle(songId, vote) {
    if (!validVote(vote)) return this.get(songId);
    return this.set(songId, this.get(songId) === vote ? null : vote);
  }

  exportSummary() { return { voterId: this.data.voterId, votes: { ...this.data.votes } }; }
}
