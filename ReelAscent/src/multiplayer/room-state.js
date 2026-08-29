import { RemotePlayer } from './remote-player.js';

export class RoomState {
  constructor(localPlayerId) {
    this.localPlayerId = localPlayerId;
    this.roomCode = '';
    this.runSeed = null;
    this.members = new Map();
    this.roster = new Map();
  }

  applyRoomState(payload = {}, createRepresentation = () => null) {
    this.roomCode = typeof payload.roomCode === 'string' ? payload.roomCode : this.roomCode;
    this.runSeed = payload.runSeed ?? this.runSeed;
    const players = Array.isArray(payload.players) ? payload.players : [];
    this.roster = new Map(players.filter((player) => player?.id).map((player) => [player.id, { ...player }]));
    const activeIds = new Set(players.map((player) => player?.id).filter(Boolean));
    activeIds.delete(this.localPlayerId);

    for (const playerId of activeIds) {
      if (!this.members.has(playerId)) {
        this.members.set(playerId, new RemotePlayer(playerId, createRepresentation(playerId)));
      }
    }
    for (const [playerId, player] of this.members) {
      if (activeIds.has(playerId)) continue;
      player.destroy();
      this.members.delete(playerId);
    }
  }

  consumeSnapshot(payload) {
    return this.members.get(payload?.playerId)?.consumeSnapshot(payload) ?? false;
  }

  consumeFishingState(payload) {
    const player = this.members.get(payload?.playerId);
    if (!player) return false;
    player.fishingState = payload;
    player.representation?.setFishingState?.(payload);
    return true;
  }

  update(now) { for (const player of this.members.values()) player.update(now); }

  clear({ preserveRoomIdentity = false } = {}) {
    for (const player of this.members.values()) player.destroy();
    this.members.clear();
    this.roster.clear();
    if (!preserveRoomIdentity) {
      this.roomCode = '';
      this.runSeed = null;
    }
  }
}

