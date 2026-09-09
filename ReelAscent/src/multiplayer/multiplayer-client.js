import { createPlayerSnapshot, createProtocolMessage, MESSAGE_TYPES, parseProtocolMessage } from './protocol.js';
import { RoomState } from './room-state.js';
import { NoopTransport, WebSocketTransport } from './transport.js';

export const MULTIPLAYER_STATES = Object.freeze([
  'disconnected', 'connecting', 'connected', 'joining', 'in_room', 'reconnecting', 'error'
]);

export const MULTIPLAYER_ENDPOINT = String(import.meta.env?.VITE_MULTIPLAYER_ENDPOINT ?? '').trim();

const SNAPSHOT_INTERVAL_MS = 1000 / 15;
const RECONNECT_DELAYS_MS = Object.freeze([500, 1000, 2000, 3000, 4500, 6000]);
const VOTE_REQUEST_TIMEOUT_MS = 8000;
export const ROOM_CODE_LENGTH = 4;
export const DISPLAY_NAME_MAX_LENGTH = 18;
export const normalizeRoomCode = (value) => String(value ?? '').replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH);
export const normalizeDisplayName = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX_LENGTH);

export class MultiplayerClient extends EventTarget {
  constructor(playerId, {
    endpoint = MULTIPLAYER_ENDPOINT,
    transport = null,
    createRemoteRepresentation = () => null,
    onAuthoritativeRunSeed = () => {}
  } = {}) {
    super();
    this.playerId = playerId;
    this.endpoint = endpoint;
    this.transport = transport ?? (endpoint ? new WebSocketTransport(endpoint) : new NoopTransport());
    this.createRemoteRepresentation = createRemoteRepresentation;
    this.onAuthoritativeRunSeed = onAuthoritativeRunSeed;
    this.state = 'disconnected';
    this.error = '';
    this.room = new RoomState(playerId);
    this.reconnectToken = '';
    this.snapshotSequence = 0;
    this.lastSnapshotSentAt = 0;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.destroyed = false;
    this.pendingRoomRequest = null;
    this.displayName = '';
    this.pendingVoteRequests = new Map();
    this.songVoteAggregates = new Map();
    this.transport.onMessage = (value) => this.handleMessage(value);
    this.transport.onClose = () => this.handleClose();
  }

  setState(state, error = '') {
    if (!MULTIPLAYER_STATES.includes(state)) throw new Error(`Invalid multiplayer state: ${state}`);
    this.state = state;
    this.error = error;
    this.dispatchEvent(new CustomEvent('statechange', { detail: this.getState() }));
  }

  sendHello() {
    return this.transport.send(createProtocolMessage(MESSAGE_TYPES.HELLO, {
      playerId: this.playerId,
      reconnectToken: this.reconnectToken || undefined,
      roomCode: this.room.roomCode || undefined,
      displayName: this.displayName || undefined
    }));
  }

  async connect({ reconnecting = false } = {}) {
    if (!this.endpoint) {
      this.setState('error', 'Multiplayer service is not configured in this build.');
      return false;
    }
    if (this.transport.isOpen) {
      if (!reconnecting && !['joining', 'in_room'].includes(this.state)) this.setState('connected');
      return true;
    }
    if (!['disconnected', 'error', 'reconnecting', 'connecting'].includes(this.state)) return true;
    this.setState(reconnecting ? 'reconnecting' : 'connecting');
    try {
      await this.transport.connect();
      if (this.destroyed) return false;
      if (!reconnecting) this.setState('connected');
      this.sendHello();
      return true;
    } catch (error) {
      if (reconnecting && this.room.roomCode && this.reconnectToken) {
        this.setState('reconnecting', 'Connection lost. Reconnecting…');
      } else {
        this.setState('error', error instanceof Error ? error.message : 'Multiplayer connection failed.');
      }
      return false;
    }
  }

  async host(displayName) {
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedName) {
      this.setState('error', 'Enter a display name.');
      return false;
    }
    this.displayName = normalizedName;
    this.pendingRoomRequest = {
      type: MESSAGE_TYPES.HOST_ROOM,
      payload: { playerId: this.playerId, displayName: normalizedName }
    };
    if (!(await this.connect())) return false;
    this.setState('joining');
    return this.transport.send(createProtocolMessage(this.pendingRoomRequest.type, this.pendingRoomRequest.payload));
  }

  async join(roomCode, displayName) {
    const normalized = normalizeRoomCode(roomCode);
    const normalizedName = normalizeDisplayName(displayName);
    if (!normalizedName) {
      this.setState('error', 'Enter a display name.');
      return false;
    }
    if (normalized.length !== ROOM_CODE_LENGTH) {
      this.setState('error', 'Enter the four-digit room code.');
      return false;
    }
    this.displayName = normalizedName;
    this.pendingRoomRequest = {
      type: MESSAGE_TYPES.JOIN_ROOM,
      payload: { playerId: this.playerId, roomCode: normalized, displayName: normalizedName }
    };
    if (!(await this.connect())) return false;
    this.setState('joining');
    return this.transport.send(createProtocolMessage(this.pendingRoomRequest.type, this.pendingRoomRequest.payload));
  }

  leave() {
    this.cancelReconnect();
    if (this.room.roomCode && this.transport.isOpen) {
      this.transport.send(createProtocolMessage(MESSAGE_TYPES.LEAVE_ROOM, { roomCode: this.room.roomCode }));
    }
    this.pendingRoomRequest = null;
    this.reconnectToken = '';
    this.room.clear();
    this.setState(this.transport.isOpen ? 'connected' : 'disconnected');
  }

  sendFishingState(state = {}) {
    if (this.state !== 'in_room') return false;
    return this.transport.send(createProtocolMessage(MESSAGE_TYPES.FISHING_STATE, {
      playerId: this.playerId,
      active: Boolean(state.active),
      state: String(state.state ?? (state.active ? 'active' : 'inactive')).slice(0, 32),
      zoneId: state.zoneId ? String(state.zoneId).slice(0, 80) : null
    }));
  }

  sendCatchEvent(catchData = {}) {
    if (this.state !== 'in_room') return false;
    return this.transport.send(createProtocolMessage(MESSAGE_TYPES.CATCH_EVENT, {
      playerId: this.playerId,
      speciesId: String(catchData.speciesId ?? '').slice(0, 100),
      name: String(catchData.name ?? catchData.speciesName ?? 'Catch').slice(0, 100),
      rarity: String(catchData.rarity ?? 'Common').slice(0, 24),
      length: Number(catchData.length) || 0,
      weight: Number(catchData.weight) || 0,
      shiny: Boolean(catchData.shiny),
      locationLabel: String(catchData.locationLabel ?? '').slice(0, 100),
      presentationId: String(catchData.presentationId ?? '').slice(0, 140),
      active: catchData.active !== false
    }));
  }

  sendAquariumShowcase(specimens = []) {
    if (this.state !== 'in_room') return false;
    return this.transport.send(createProtocolMessage(MESSAGE_TYPES.AQUARIUM_SHOWCASE, {
      playerId: this.playerId,
      specimens: Array.isArray(specimens) ? specimens.slice(0, 30) : []
    }));
  }

  createVoteRequestId() {
    return `vote-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  }

  async sendVoteRequest(type, payload = {}) {
    if (!(await this.connect())) throw new Error(this.error || 'Song feedback service is unavailable.');
    const requestId = this.createVoteRequestId();
    return new Promise((resolve, reject) => {
      const timer = globalThis.setTimeout(() => {
        this.pendingVoteRequests.delete(requestId);
        reject(new Error('Song feedback request timed out.'));
      }, VOTE_REQUEST_TIMEOUT_MS);
      this.pendingVoteRequests.set(requestId, { resolve, reject, timer });
      const sent = this.transport.send(createProtocolMessage(type, { ...payload, requestId }));
      if (!sent) {
        globalThis.clearTimeout(timer);
        this.pendingVoteRequests.delete(requestId);
        reject(new Error('Song feedback service is unavailable.'));
      }
    });
  }

  submitSongVote(feedback, vote) {
    return this.sendVoteRequest(MESSAGE_TYPES.SONG_VOTE_SET, {
      speciesId: String(feedback?.speciesId ?? '').slice(0, 100),
      songId: String(feedback?.songId ?? '').slice(0, 180),
      songRevision: Math.max(1, Math.floor(Number(feedback?.songRevision) || 1)),
      vote: vote === 'up' || vote === 'down' ? vote : null
    });
  }

  requestSongVoteResults(filter = {}) {
    return this.sendVoteRequest(MESSAGE_TYPES.SONG_VOTE_RESULTS_REQUEST, {
      speciesId: filter.speciesId ? String(filter.speciesId).slice(0, 100) : '',
      songRevision: filter.songRevision ?? null
    });
  }

  settleVoteRequest(requestId, value, error = null) {
    const pending = this.pendingVoteRequests.get(requestId);
    if (!pending) return false;
    globalThis.clearTimeout(pending.timer);
    this.pendingVoteRequests.delete(requestId);
    if (error) pending.reject(error); else pending.resolve(value);
    return true;
  }

  handleMessage(value) {
    const message = parseProtocolMessage(value);
    if (!message) return;

    if (message.type === MESSAGE_TYPES.ROOM_STATE) {
      const previousSeed = this.room.runSeed;
      this.room.applyRoomState(message.payload, this.createRemoteRepresentation);
      if (typeof message.payload.reconnectToken === 'string' && message.payload.reconnectToken) {
        this.reconnectToken = message.payload.reconnectToken;
      }
      this.pendingRoomRequest = null;
      this.reconnectAttempt = 0;
      this.cancelReconnect();
      this.setState('in_room');
      if (this.room.runSeed !== null && this.room.runSeed !== previousSeed) {
        this.onAuthoritativeRunSeed(this.room.runSeed, message.payload);
      }
      this.dispatchEvent(new CustomEvent('roomstate', { detail: message.payload }));
    } else if (message.type === MESSAGE_TYPES.PLAYER_SNAPSHOT) {
      this.room.consumeSnapshot(message.payload);
    } else if (message.type === MESSAGE_TYPES.FISHING_STATE) {
      this.room.consumeFishingState(message.payload);
    } else if (message.type === MESSAGE_TYPES.CATCH_EVENT) {
      this.room.consumeCatchEvent(message.payload);
    } else if (message.type === MESSAGE_TYPES.AQUARIUM_SHOWCASE) {
      this.room.consumeAquariumShowcase(message.payload);
    } else if (message.type === MESSAGE_TYPES.SONG_VOTE_AGGREGATE) {
      const aggregate = message.payload.aggregate;
      if (aggregate?.speciesId && Number.isFinite(Number(aggregate.songRevision))) {
        this.songVoteAggregates.set(`${aggregate.speciesId}@${aggregate.songRevision}`, aggregate);
        this.dispatchEvent(new CustomEvent('songvoteaggregate', { detail: aggregate }));
      }
      if (message.payload.requestId) this.settleVoteRequest(message.payload.requestId, aggregate);
    } else if (message.type === MESSAGE_TYPES.SONG_VOTE_RESULTS) {
      const results = Array.isArray(message.payload.results) ? message.payload.results : [];
      for (const aggregate of results) {
        if (aggregate?.speciesId) this.songVoteAggregates.set(`${aggregate.speciesId}@${aggregate.songRevision}`, aggregate);
      }
      this.dispatchEvent(new CustomEvent('songvoteresults', { detail: results }));
      if (message.payload.requestId) this.settleVoteRequest(message.payload.requestId, results);
    } else if (message.type === MESSAGE_TYPES.ERROR) {
      const code = String(message.payload.code ?? 'server_error');
      const text = String(message.payload.message ?? 'Multiplayer service error.');
      if (code.startsWith('song_vote_')) {
        if (message.payload.requestId) this.settleVoteRequest(message.payload.requestId, null, new Error(text));
        this.dispatchEvent(new CustomEvent('songvoteerror', { detail: { code, message: text } }));
        this.dispatchEvent(new CustomEvent('message', { detail: message }));
        return;
      }
      if (code === 'reconnect_failed') {
        this.cancelReconnect();
        this.reconnectToken = '';
        this.room.clear();
      }
      this.setState('error', text);
    }

    this.dispatchEvent(new CustomEvent('message', { detail: message }));
  }

  handleClose() {
    if (this.destroyed) return;
    const wasInRoom = this.state === 'in_room' || (this.room.roomCode && this.reconnectToken);
    if (wasInRoom) {
      this.room.clear({ preserveRoomIdentity: true });
      this.setState('reconnecting', 'Connection lost. Reconnecting…');
      this.scheduleReconnect();
      return;
    }
    this.setState('disconnected');
  }

  scheduleReconnect() {
    if (this.destroyed || this.reconnectTimer || !this.endpoint) return;
    if (this.reconnectAttempt >= RECONNECT_DELAYS_MS.length) {
      this.room.clear();
      this.reconnectToken = '';
      this.setState('error', 'Could not reconnect to the room. You can keep playing solo or join again.');
      return;
    }
    const delay = RECONNECT_DELAYS_MS[this.reconnectAttempt++];
    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      const ok = await this.connect({ reconnecting: true });
      if (!ok) this.scheduleReconnect();
    }, delay);
  }

  cancelReconnect() {
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  update(now = Date.now(), localState = null) {
    this.room.update(now);
    if (this.state !== 'in_room' || !localState || now - this.lastSnapshotSentAt < SNAPSHOT_INTERVAL_MS) return;
    this.lastSnapshotSentAt = now;
    this.snapshotSequence += 1;
    this.transport.send(createPlayerSnapshot(this.playerId, localState, this.snapshotSequence));
  }

  getState() {
    const players = [...this.room.roster.values()];
    return {
      state: this.state,
      error: this.error,
      endpointConfigured: Boolean(this.endpoint),
      roomCode: this.room.roomCode,
      runSeed: this.room.runSeed,
      remotePlayers: this.room.members.size,
      players,
      reconnecting: this.state === 'reconnecting',
      displayName: this.displayName
    };
  }

  destroy() {
    this.destroyed = true;
    this.cancelReconnect();
    this.room.clear();
    for (const [requestId, pending] of this.pendingVoteRequests) {
      globalThis.clearTimeout(pending.timer);
      pending.reject(new Error('Multiplayer client closed.'));
      this.pendingVoteRequests.delete(requestId);
    }
    this.transport.close();
  }
}
