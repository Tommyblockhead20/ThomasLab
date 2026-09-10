export const SONG_VOTES_STORAGE_KEY = 'reel-ascent-song-votes-v2';
export const LEGACY_SONG_VOTES_STORAGE_KEY = 'reel-ascent-song-votes-v1';
export const SONG_VOTE_SCHEMA_VERSION = 5;

export const SONG_DOWNVOTE_REASONS = Object.freeze([
  Object.freeze({ id: 'sounds_bad', label: 'Sounds Bad' }),
  Object.freeze({ id: 'glitched', label: 'Glitched' }),
  Object.freeze({ id: 'too_hard', label: 'Too Hard' }),
  Object.freeze({ id: 'too_easy', label: 'Too Easy' }),
  Object.freeze({ id: 'bad_instrument', label: 'Bad Instrument' })
]);
const DOWNVOTE_REASON_IDS = new Set(SONG_DOWNVOTE_REASONS.map((entry) => entry.id));
export const normalizeDownvoteReason = (value) => DOWNVOTE_REASON_IDS.has(value) ? value : null;
export const songDownvoteReasonForDigit = (code) => {
  const match = /^(?:Digit|Numpad)([1-5])$/.exec(String(code ?? ''));
  return match ? SONG_DOWNVOTE_REASONS[Number(match[1]) - 1]?.id ?? null : null;
};

const safeId = (value, maximum = 180) => String(value ?? '')
  .trim().toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, maximum);
const validVote = (value) => value === 'up' || value === 'down';

export function normalizeSongFeedback(value) {
  if (typeof value === 'string') {
    const match = /^song:([a-z0-9_-]+):/i.exec(value);
    value = { speciesId: match?.[1], songId: value, songRevision: 1 };
  }
  const speciesId = safeId(value?.speciesId, 100);
  const songId = safeId(value?.songId, 180);
  const songRevision = Math.max(1, Math.min(1_000_000, Math.floor(Number(value?.songRevision) || 1)));
  return speciesId && songId.startsWith('song:') ? { speciesId, songId, songRevision } : null;
}

export const songVoteKey = (feedback) => {
  const normalized = normalizeSongFeedback(feedback);
  return normalized ? `${normalized.speciesId}@${normalized.songRevision}` : null;
};

export function normalizeSongVotes(value = {}, voterId = '') {
  const votes = {};
  for (const entry of Object.values(value?.votes ?? {})) {
    const feedback = normalizeSongFeedback(entry);
    if (!feedback || !validVote(entry?.vote)) continue;
    votes[songVoteKey(feedback)] = {
      ...feedback,
      vote: entry.vote,
      reason: entry.vote === 'down' ? normalizeDownvoteReason(entry.reason) : null
    };
  }
  return {
    version: SONG_VOTE_SCHEMA_VERSION,
    voterId: String(voterId || value?.voterId || '').slice(0, 160),
    votes
  };
}

function migrateLegacyVotes(storage, voterId) {
  try {
    const raw = storage?.getItem(LEGACY_SONG_VOTES_STORAGE_KEY);
    const legacy = raw ? JSON.parse(raw) : null;
    const votes = {};
    for (const [songId, vote] of Object.entries(legacy?.votes ?? {})) {
      const feedback = normalizeSongFeedback(songId);
      if (!feedback || !validVote(vote)) continue;
      votes[songVoteKey(feedback)] = { ...feedback, vote };
    }
    return normalizeSongVotes({ votes }, voterId);
  } catch { return normalizeSongVotes({}, voterId); }
}

export class SongVoteStore {
  constructor(storage = null, voterId = '') {
    this.storage = storage ?? (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
    this.voterId = String(voterId || '').slice(0, 160);
    this.data = this.load();
  }

  load() {
    try {
      const raw = this.storage?.getItem(SONG_VOTES_STORAGE_KEY);
      return raw ? normalizeSongVotes(JSON.parse(raw), this.voterId) : migrateLegacyVotes(this.storage, this.voterId);
    } catch { return normalizeSongVotes({}, this.voterId); }
  }

  persist() {
    try { this.storage?.setItem(SONG_VOTES_STORAGE_KEY, JSON.stringify(this.data)); } catch {}
  }

  get(feedback) {
    const key = songVoteKey(feedback);
    return key ? this.data.votes[key]?.vote ?? null : null;
  }

  hasRated(feedback) { return this.get(feedback) !== null; }

  getReason(feedback) {
    const key = songVoteKey(feedback);
    return key && this.data.votes[key]?.vote === 'down' ? this.data.votes[key].reason ?? null : null;
  }

  set(feedback, vote = null, reason = null) {
    const normalized = normalizeSongFeedback(feedback);
    const key = songVoteKey(normalized);
    if (!key || (vote !== null && !validVote(vote))) return null;
    if (vote === null) delete this.data.votes[key];
    else this.data.votes[key] = {
      ...normalized,
      vote,
      reason: vote === 'down' ? normalizeDownvoteReason(reason) : null
    };
    this.persist();
    return this.get(normalized);
  }

  toggle(feedback, vote) {
    if (!validVote(vote)) return this.get(feedback);
    return this.set(feedback, this.get(feedback) === vote ? null : vote);
  }

  exportSummary() {
    return { version: this.data.version, voterId: this.data.voterId, votes: { ...this.data.votes } };
  }
}
