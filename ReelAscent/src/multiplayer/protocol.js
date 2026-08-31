import { compactAppearance } from '../player/appearance.js';

export const MULTIPLAYER_PROTOCOL_VERSION = 1;

export const MESSAGE_TYPES = Object.freeze({
  HELLO: 'hello',
  HOST_ROOM: 'host_room',
  JOIN_ROOM: 'join_room',
  LEAVE_ROOM: 'leave_room',
  ROOM_STATE: 'room_state',
  PLAYER_SNAPSHOT: 'player_snapshot',
  CATCH_EVENT: 'catch_event',
  FISHING_STATE: 'fishing_state',
  ERROR: 'error'
});

const ALLOWED_TYPES = new Set(Object.values(MESSAGE_TYPES));

export function createProtocolMessage(type, payload = {}) {
  if (!ALLOWED_TYPES.has(type)) throw new Error(`Unknown multiplayer message type: ${type}`);
  return { protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, type, sentAt: Date.now(), payload };
}

export function parseProtocolMessage(value) {
  let message = value;
  if (typeof value === 'string') {
    try { message = JSON.parse(value); } catch { return null; }
  }
  if (!message || typeof message !== 'object' || Array.isArray(message)) return null;
  if (message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION || !ALLOWED_TYPES.has(message.type)) return null;
  if (!message.payload || typeof message.payload !== 'object' || Array.isArray(message.payload)) return null;
  return message;
}

// Rhythm key presses, held lanes, chart judgments, and note timing deliberately never
// cross this boundary. Only remote presentation state is included in a snapshot.
export function createPlayerSnapshot(playerId, state, sequence) {
  const now = Date.now();
  const emote = state.emote?.id ? {
    id: state.emote.id,
    startedAt: Number(state.emote.startedAt) || now,
    elapsedMs: Math.max(0, now - (Number(state.emote.startedAt) || now))
  } : null;
  const heldItem = state.heldItem?.type === 'specimen' && state.heldItem.speciesId
    ? {
        type: 'specimen',
        specimenId: String(state.heldItem.specimenId ?? '').slice(0, 140),
        speciesId: String(state.heldItem.speciesId).slice(0, 100),
        name: String(state.heldItem.name ?? '').slice(0, 100),
        rarity: String(state.heldItem.rarity ?? 'Common').slice(0, 24),
        length: Number(state.heldItem.length) || 0,
        weight: Number(state.heldItem.weight) || 0,
        shiny: Boolean(state.heldItem.shiny)
      }
    : state.heldItem?.type === 'equipment' && state.heldItem.itemId === 'ice-axe'
      ? { type: 'equipment', itemId: 'ice-axe', name: 'Ice Axe' }
      : null;
  return createProtocolMessage(MESSAGE_TYPES.PLAYER_SNAPSHOT, {
    playerId,
    sequence,
    position: state.position,
    // Optional v9 location metadata is backward-compatible with protocol v1 servers.
    // Rendering still interpolates `position`; GPS/room state can use stable global data.
    locationId: state.locationId ?? 'main-mountain',
    coordinateSpace: state.coordinateSpace ?? 'global-world',
    globalPosition: state.globalPosition ?? state.position,
    yaw: state.yaw,
    movement: state.movement,
    posture: state.posture === 'seated' ? 'seated' : 'standing',
    appearance: compactAppearance(state.appearance),
    emote,
    fishingState: state.fishingState ?? null,
    heldItem
  });
}
