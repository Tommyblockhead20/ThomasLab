import { RemotePlayer } from './remote-player.js';
import { REMOTE_PLAYER_COLORS } from './player-colors.js';

export function stablePlayerColorSeed(playerId) {
  let hash = 2166136261;
  for (const character of String(playerId ?? '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export class RoomState {
  constructor(localPlayerId) {
    this.localPlayerId = localPlayerId;
    this.roomCode = '';
    this.runSeed = null;
    this.localLocationId = 'main-mountain';
    this.members = new Map();
    this.roster = new Map();
    this.colorAssignments = new Map([[localPlayerId, REMOTE_PLAYER_COLORS.findIndex((color) => color.name === 'ORANGE')]]);
  }

  assignColor(playerId) {
    if (this.colorAssignments.has(playerId)) return this.colorAssignments.get(playerId);
    const used = new Set([...this.colorAssignments.values()]);
    const start = stablePlayerColorSeed(playerId) % REMOTE_PLAYER_COLORS.length;
    let colorIndex = start;
    for (let offset = 0; offset < REMOTE_PLAYER_COLORS.length; offset += 1) {
      const candidate = (start + offset) % REMOTE_PLAYER_COLORS.length;
      if (!used.has(candidate)) { colorIndex = candidate; break; }
    }
    this.colorAssignments.set(playerId, colorIndex);
    return colorIndex;
  }

  applyRoomState(payload = {}, createRepresentation = () => null) {
    this.roomCode = typeof payload.roomCode === 'string' ? payload.roomCode : this.roomCode;
    this.runSeed = payload.runSeed ?? this.runSeed;
    const players = Array.isArray(payload.players) ? payload.players : [];
    this.roster = new Map(players.filter((player) => player?.id).map((player) => {
      const colorIndex = this.assignColor(player.id);
      return [player.id, { ...player, colorIndex, colorName: REMOTE_PLAYER_COLORS[colorIndex].name }];
    }));
    const activeIds = new Set(players.map((player) => player?.id).filter(Boolean));
    activeIds.delete(this.localPlayerId);

    for (const playerId of activeIds) {
      const presentation = this.roster.get(playerId);
      if (!this.members.has(playerId)) {
        const colorIndex = this.colorAssignments.get(playerId) ?? this.assignColor(playerId);
        const remote = new RemotePlayer(playerId,
          createRepresentation(playerId, colorIndex, presentation?.appearance, presentation?.displayName ?? presentation?.name ?? 'Player'));
        remote.setLocalLocationId(this.localLocationId);
        this.members.set(playerId, remote);
      }
      this.members.get(playerId)?.representation?.setAppearance?.(presentation?.appearance);
      this.members.get(playerId)?.representation?.setDisplayName?.(presentation?.displayName ?? presentation?.name ?? 'Player');
      this.members.get(playerId)?.representation?.setPosture?.(presentation?.posture);
      this.members.get(playerId)?.representation?.setEmote?.(presentation?.emote ?? null);
      const remote = this.members.get(playerId);
      remote?.representation?.setFishingState?.(presentation?.fishingState);
      remote?.representation?.setHeldItem?.(presentation?.heldItem ?? null);
      if (typeof presentation?.locationId === 'string') remote.locationId = presentation.locationId;
      if (presentation?.globalPosition) remote.globalPosition = { ...presentation.globalPosition };
      remote?.syncVisibility?.();
    }
    for (const [playerId, player] of this.members) {
      if (activeIds.has(playerId)) continue;
      player.destroy();
      this.members.delete(playerId);
      this.colorAssignments.delete(playerId);
    }
  }


  setLocalLocationId(locationId) {
    this.localLocationId = locationId || 'main-mountain';
    for (const player of this.members.values()) player.setLocalLocationId(this.localLocationId);
  }

  consumeSnapshot(payload) {
    const remote = this.members.get(payload?.playerId);
    const consumed = remote?.consumeSnapshot(payload) ?? false;
    if (consumed && this.roster.has(payload.playerId)) {
      this.roster.set(payload.playerId, {
        ...this.roster.get(payload.playerId),
        locationId: remote.locationId,
        coordinateSpace: remote.coordinateSpace,
        globalPosition: remote.globalPosition ? { ...remote.globalPosition } : null
      });
    }
    return consumed;
  }

  consumeFishingState(payload) {
    const player = this.members.get(payload?.playerId);
    if (!player) return false;
    player.fishingState = payload;
    player.representation?.setFishingState?.(payload);
    return true;
  }

  consumeCatchEvent(payload) {
    const player = this.members.get(payload?.playerId);
    if (!player) return false;
    if (payload.active === false) player.clearCatch(payload.presentationId ?? null);
    else player.showCatch(payload);
    return true;
  }

  getPlayerPresentation(playerId) {
    return this.roster.get(playerId) ?? null;
  }

  update(now) { for (const player of this.members.values()) player.update(now); }

  clear({ preserveRoomIdentity = false } = {}) {
    for (const player of this.members.values()) player.destroy();
    this.members.clear();
    this.roster.clear();
    if (!preserveRoomIdentity) {
      this.colorAssignments.clear();
      this.colorAssignments.set(
        this.localPlayerId,
        REMOTE_PLAYER_COLORS.findIndex((color) => color.name === 'ORANGE')
      );
    }
    if (!preserveRoomIdentity) {
      this.roomCode = '';
      this.runSeed = null;
    }
  }
}
