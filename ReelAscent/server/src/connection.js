import { MESSAGE_TYPES, parseMessage, send, sendError } from './protocol.js';
import { PlayerSession } from './player-session.js';
import { validateSnapshot } from './snapshot-validation.js';

const safeString = (value, max = 100) => typeof value === 'string' ? value.slice(0, max) : '';
const safeDisplayName = (value) => safeString(value, 18).replace(/\s+/g, ' ').trim();

export class ClientConnection {
  constructor(socket, roomManager, { songVoteStore = null, broadcastSongAggregate = () => {} } = {}) {
    this.socket = socket;
    this.roomManager = roomManager;
    this.session = null;
    this.closed = false;
    this.songVoteStore = songVoteStore;
    this.broadcastSongAggregate = broadcastSongAggregate;
    this.malformedLimiter = null;

    socket.on('message', (raw) => this.handleRawMessage(raw));
    socket.on('close', () => this.handleClose());
    socket.on('error', () => {});
  }

  rateLimit(name, limit, windowMs, { code = 'rate_limit', requestId = '' } = {}) {
    if (!this.session) return true;
    if (this.session.rateLimiter.allow(name, limit, windowMs)) return true;
    sendError(this.socket, code, 'Too many multiplayer messages. Slow down and try again.', requestId ? { requestId } : {});
    return false;
  }

  handleRawMessage(raw) {
    const parsed = parseMessage(raw);
    if (!parsed.ok) {
      if (this.session && !this.session.rateLimiter.allow('malformed', 10, 10_000)) {
        this.socket.close(1008, 'Too many invalid messages');
        return;
      }
      sendError(this.socket, parsed.code, parsed.message);
      return;
    }

    const { message } = parsed;
    if (message.type === MESSAGE_TYPES.HELLO) {
      this.handleHello(message.payload);
      return;
    }

    if (!this.session?.playerId) {
      sendError(this.socket, 'invalid_state_transition', 'Send hello before multiplayer requests.');
      return;
    }

    switch (message.type) {
      case MESSAGE_TYPES.HOST_ROOM:
        this.handleHost(message.payload);
        break;
      case MESSAGE_TYPES.JOIN_ROOM:
        this.handleJoin(message.payload);
        break;
      case MESSAGE_TYPES.LEAVE_ROOM:
        this.handleLeave();
        break;
      case MESSAGE_TYPES.PLAYER_SNAPSHOT:
        this.handleSnapshot(message.payload);
        break;
      case MESSAGE_TYPES.FISHING_STATE:
        this.handleFishingState(message.payload);
        break;
      case MESSAGE_TYPES.CATCH_EVENT:
        this.handleCatchEvent(message.payload);
        break;
      case MESSAGE_TYPES.AQUARIUM_SHOWCASE:
        this.handleAquariumShowcase(message.payload);
        break;
      case MESSAGE_TYPES.SONG_VOTE_SET:
        void this.handleSongVoteSet(message.payload);
        break;
      case MESSAGE_TYPES.SONG_VOTE_RESULTS_REQUEST:
        void this.handleSongVoteResultsRequest(message.payload);
        break;
      default:
        sendError(this.socket, 'invalid_message', 'That message type is server-only.');
        break;
    }
  }

  handleHello(payload) {
    const playerId = safeString(payload.playerId, 128);
    if (!playerId) {
      sendError(this.socket, 'invalid_message', 'hello requires a playerId.');
      return;
    }

    const reconnectToken = safeString(payload.reconnectToken, 256);
    if (reconnectToken) {
      const restored = this.roomManager.reconnect(playerId, reconnectToken, this.socket);
      if (!restored) {
        sendError(this.socket, 'reconnect_failed', 'The reconnect window expired or the reconnect token is invalid.');
        return;
      }
      this.session = restored;
      restored.displayName = safeDisplayName(payload.displayName) || restored.displayName;
      restored.room?.broadcastState();
      return;
    }

    if (this.session?.playerId === playerId) return;
    if (this.session?.room) {
      sendError(this.socket, 'invalid_state_transition', 'Cannot change player identity while in a room.');
      return;
    }
    this.session = new PlayerSession(playerId, this.socket);
    this.session.displayName = safeDisplayName(payload.displayName);
  }

  handleHost(payload = {}) {
    if (!this.rateLimit('room', 8, 10_000)) return;
    this.session.displayName = safeDisplayName(payload.displayName) || this.session.displayName || 'Player';
    const result = this.roomManager.host(this.session);
    if (!result.ok) sendError(this.socket, result.code, result.message);
  }

  handleJoin(payload) {
    if (!this.rateLimit('room', 8, 10_000)) return;
    this.session.displayName = safeDisplayName(payload.displayName) || this.session.displayName || 'Player';
    const result = this.roomManager.join(this.session, payload.roomCode);
    if (!result.ok) sendError(this.socket, result.code, result.message);
  }

  handleLeave() {
    if (!this.rateLimit('room', 8, 10_000)) return;
    const result = this.roomManager.leave(this.session);
    if (!result.ok) sendError(this.socket, result.code, result.message);
  }

  handleSnapshot(payload) {
    if (!this.session.room) {
      sendError(this.socket, 'invalid_state_transition', 'Join a room before sending player snapshots.');
      return;
    }
    if (!this.rateLimit('snapshot', 32, 1000)) return;
    const validated = validateSnapshot(payload, this.session);
    if (!validated.ok) return;
    const snapshot = validated.snapshot;
    this.session.lastSequence = snapshot.sequence;
    this.session.lastSnapshot = snapshot;
    this.session.room.broadcast(MESSAGE_TYPES.PLAYER_SNAPSHOT, snapshot, this.session.playerId);
  }

  handleFishingState(payload) {
    if (!this.session.room || !this.rateLimit('events', 20, 10_000)) return;
    const state = {
      playerId: this.session.playerId,
      active: Boolean(payload.active),
      state: safeString(payload.state, 32) || (payload.active ? 'active' : 'inactive'),
      zoneId: safeString(payload.zoneId, 80) || null,
      serverTime: Date.now()
    };
    this.session.fishingState = state;
    this.session.room.broadcast(MESSAGE_TYPES.FISHING_STATE, state, this.session.playerId);
  }

  handleCatchEvent(payload) {
    if (!this.session.room || !this.rateLimit('events', 20, 10_000)) return;
    const speciesId = safeString(payload.speciesId, 100);
    if (!speciesId) return;
    const event = {
      playerId: this.session.playerId,
      speciesId,
      name: safeString(payload.name, 100) || speciesId,
      rarity: safeString(payload.rarity, 24) || 'Common',
      length: Number.isFinite(Number(payload.length)) ? Number(payload.length) : 0,
      weight: Number.isFinite(Number(payload.weight)) ? Number(payload.weight) : 0,
      shiny: Boolean(payload.shiny),
      locationLabel: safeString(payload.locationLabel, 100),
      presentationId: safeString(payload.presentationId, 140),
      active: payload.active !== false,
      serverTime: Date.now()
    };
    this.session.room.broadcast(MESSAGE_TYPES.CATCH_EVENT, event, this.session.playerId);
  }

  handleAquariumShowcase(payload = {}) {
    if (!this.session.room || !this.rateLimit('aquarium_showcase', 8, 10_000)) return;
    const source = Array.isArray(payload.specimens) ? payload.specimens.slice(0, 30) : [];
    const specimens = source.flatMap((entry) => {
      const speciesId = safeString(entry?.speciesId, 100);
      const specimenId = safeString(entry?.specimenId, 140);
      if (!speciesId || !specimenId) return [];
      return [{
        specimenId,
        speciesId,
        name: safeString(entry.name, 100) || speciesId,
        rarity: safeString(entry.rarity, 24) || 'Common',
        length: Math.max(0, Math.min(10000, Number(entry.length) || 0)),
        weight: Math.max(0, Math.min(100000, Number(entry.weight) || 0)),
        sizeFraction: Math.max(0, Math.min(1, Number(entry.sizeFraction) || 0)),
        shiny: Boolean(entry.shiny),
        value: Math.max(0, Math.min(1_000_000_000, Math.floor(Number(entry.value) || 0)))
      }];
    });
    this.session.aquariumShowcase = specimens;
    this.session.room.broadcast(MESSAGE_TYPES.AQUARIUM_SHOWCASE, {
      playerId: this.session.playerId,
      specimens,
      serverTime: Date.now()
    }, this.session.playerId);
  }

  async handleSongVoteSet(payload = {}) {
    const requestId = safeString(payload.requestId, 80);
    if (!this.rateLimit('song_vote', 12, 60_000, { code: 'song_vote_rate_limit', requestId })) return;
    if (!this.songVoteStore?.available || !this.songVoteStore?.durable) {
      sendError(this.socket, 'song_vote_unavailable', "Feedback couldn't be saved.", { requestId });
      return;
    }
    try {
      const aggregate = await this.songVoteStore.setVote({
        voterId: this.session.playerId,
        speciesId: payload.speciesId,
        songId: payload.songId,
        songRevision: payload.songRevision,
        vote: payload.vote ?? null
      });
      send(this.socket, MESSAGE_TYPES.SONG_VOTE_AGGREGATE, {
        requestId,
        aggregate,
        yourVote: payload.vote ?? null
      });
      this.broadcastSongAggregate(aggregate, this.socket);
    } catch (error) {
      console.error('[reel-ascent] song vote write failed', error);
      sendError(this.socket, 'song_vote_failed', "Feedback couldn't be saved.", { requestId });
    }
  }

  async handleSongVoteResultsRequest(payload = {}) {
    const requestId = safeString(payload.requestId, 80);
    if (!this.rateLimit('song_vote_results', 8, 30_000, { code: 'song_vote_rate_limit', requestId })) return;
    if (!this.songVoteStore?.available || !this.songVoteStore?.durable) {
      sendError(this.socket, 'song_vote_unavailable', 'Song feedback storage is unavailable.', { requestId });
      return;
    }
    try {
      const results = await this.songVoteStore.listAggregates({
        speciesId: safeString(payload.speciesId, 100),
        songRevision: payload.songRevision === null || payload.songRevision === undefined
          ? null : Number(payload.songRevision)
      });
      send(this.socket, MESSAGE_TYPES.SONG_VOTE_RESULTS, { requestId, results });
    } catch (error) {
      console.error('[reel-ascent] song vote query failed', error);
      sendError(this.socket, 'song_vote_failed', 'Song feedback results are unavailable.', { requestId });
    }
  }

  handleClose() {
    if (this.closed) return;
    this.closed = true;
    if (!this.session) return;
    if (this.session.room) this.roomManager.disconnect(this.session);
    else this.session.detach();
  }
}
