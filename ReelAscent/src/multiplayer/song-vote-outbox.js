import { normalizeSongFeedback, songVoteKey } from '../fishing/song-votes.js';

const STORAGE_PREFIX = 'reel-ascent-song-vote-outbox-v1:';

export class SongVoteOutbox {
  constructor(voterId, storage = null) {
    this.voterId = String(voterId ?? '').slice(0, 160);
    this.storage = storage ?? (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
    this.storageKey = `${STORAGE_PREFIX}${this.voterId}`;
    this.pending = new Map();
    try {
      const rows = JSON.parse(this.storage?.getItem(this.storageKey) || '[]');
      if (Array.isArray(rows)) for (const row of rows) this.enqueue(row, false);
    } catch { /* The in-memory outbox remains usable when storage is blocked. */ }
    this.persisted = Boolean(this.storage);
  }

  enqueue(value, persist = true) {
    const feedback = normalizeSongFeedback(value);
    const key = songVoteKey(feedback);
    if (!key || !['up', 'down', null].includes(value?.vote)) return null;
    const row = {
      ...feedback,
      vote: value.vote,
      reason: value.vote === 'down' ? (value.reason ?? null) : null
    };
    this.pending.set(key, row);
    if (persist) this.persist();
    return key;
  }

  persist() {
    try {
      if (!this.storage) { this.persisted = false; return false; }
      this.storage.setItem(this.storageKey, JSON.stringify([...this.pending.values()]));
      this.persisted = true;
      return true;
    } catch { this.persisted = false; return false; }
  }

  peek() { return this.pending.entries().next().value ?? null; }
  get(key) { return this.pending.get(key) ?? null; }
  get size() { return this.pending.size; }

  acknowledge(key, sentRow) {
    if (this.pending.get(key) !== sentRow) return false;
    this.pending.delete(key);
    this.persist();
    return true;
  }
}
