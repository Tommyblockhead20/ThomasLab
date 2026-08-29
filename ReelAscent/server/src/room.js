import crypto from 'node:crypto';
import { MESSAGE_TYPES, send } from './protocol.js';

export class Room {
  constructor(code, capacity, runSeed = crypto.randomInt(1, 2_147_483_647)) {
    this.code = code;
    this.capacity = capacity;
    this.runSeed = runSeed;
    this.players = new Map();
    this.hostId = null;
  }

  get size() { return this.players.size; }

  hasSpace() { return this.players.size < this.capacity; }

  add(session) {
    if (this.players.has(session.playerId) || !this.hasSpace()) return false;
    this.players.set(session.playerId, session);
    session.room = this;
    if (!this.hostId) this.hostId = session.playerId;
    return true;
  }

  remove(session) {
    if (!session || this.players.get(session.playerId) !== session) return false;
    this.players.delete(session.playerId);
    session.room = null;
    if (this.hostId === session.playerId) this.hostId = this.players.keys().next().value ?? null;
    return true;
  }

  stateFor(session) {
    return {
      roomCode: this.code,
      runSeed: this.runSeed,
      capacity: this.capacity,
      hostId: this.hostId,
      reconnectToken: session.reconnectToken,
      players: [...this.players.values()].map((player) => ({
        id: player.playerId,
        connected: player.connected,
        host: player.playerId === this.hostId
      }))
    };
  }

  sendState(session) {
    if (session.connected) send(session.socket, MESSAGE_TYPES.ROOM_STATE, this.stateFor(session));
  }

  broadcastState() {
    for (const session of this.players.values()) this.sendState(session);
  }

  broadcast(type, payload, exceptPlayerId = null) {
    for (const session of this.players.values()) {
      if (!session.connected || session.playerId === exceptPlayerId) continue;
      send(session.socket, type, payload);
    }
  }
}
