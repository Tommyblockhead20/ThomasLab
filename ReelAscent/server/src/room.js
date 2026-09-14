import crypto from 'node:crypto';
import { MESSAGE_TYPES, send } from './protocol.js';

export class Room {
  constructor(code, capacity, runSeed = crypto.randomInt(1, 2_147_483_647)) {
    this.code = code;
    this.capacity = capacity;
    this.runSeed = runSeed;
    this.players = new Map();
    this.benchSeats = new Map();
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
    this.releaseBench(session.playerId);
    session.room = null;
    if (this.hostId === session.playerId) this.hostId = this.players.keys().next().value ?? null;
    return true;
  }

  claimBench(playerId, benchId) {
    const current = this.benchSeats.get(benchId) ?? [];
    if (current.includes(playerId)) return true;
    if (current.length >= 2) return false;
    this.releaseBench(playerId);
    this.benchSeats.set(benchId, [...current, playerId]);
    this.broadcastState();
    return true;
  }

  releaseBench(playerId) {
    let changed = false;
    for (const [benchId, occupants] of this.benchSeats) {
      if (!occupants.includes(playerId)) continue;
      const next = occupants.filter((id) => id !== playerId);
      if (next.length) this.benchSeats.set(benchId, next);
      else this.benchSeats.delete(benchId);
      changed = true;
    }
    return changed;
  }

  stateFor(session) {
    return {
      roomCode: this.code,
      runSeed: this.runSeed,
      capacity: this.capacity,
      hostId: this.hostId,
      reconnectToken: session.reconnectToken,
      benchSeats: [...this.benchSeats].map(([benchId, playerIds]) => ({ benchId, playerIds })),
      players: [...this.players.values()].map((player) => ({
        id: player.playerId,
        connected: player.connected,
        host: player.playerId === this.hostId,
        displayName: player.displayName || 'Player',
        appearance: player.lastSnapshot?.appearance ?? null,
        posture: player.lastSnapshot?.posture ?? 'standing',
        fishingState: player.lastSnapshot?.fishingState ?? player.fishingState ?? null,
        heldItem: player.lastSnapshot?.heldItem ?? null,
        aquariumShowcase: player.aquariumShowcase ?? [],
        locationId: player.lastSnapshot?.locationId ?? 'main-mountain',
        coordinateSpace: player.lastSnapshot?.coordinateSpace ?? 'global-world',
        globalPosition: player.lastSnapshot?.globalPosition ?? player.lastSnapshot?.position ?? null,
        snapshot: player.lastSnapshot ?? null
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
