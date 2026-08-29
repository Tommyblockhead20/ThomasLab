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

export function createMessage(type, payload = {}) {
  return { protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, type, sentAt: Date.now(), payload };
}

export function parseMessage(raw) {
  let value;
  try {
    const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
    value = JSON.parse(text);
  } catch {
    return { ok: false, code: 'invalid_message', message: 'Message must be valid JSON.' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, code: 'invalid_message', message: 'Message must be a JSON object.' };
  }
  if (value.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) {
    return { ok: false, code: 'unsupported_protocol_version', message: `Protocol version ${MULTIPLAYER_PROTOCOL_VERSION} is required.` };
  }
  if (!ALLOWED_TYPES.has(value.type)) {
    return { ok: false, code: 'invalid_message', message: 'Unknown multiplayer message type.' };
  }
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) {
    return { ok: false, code: 'invalid_message', message: 'Message payload must be an object.' };
  }
  return { ok: true, message: value };
}

export function send(socket, type, payload = {}) {
  if (!socket || socket.readyState !== 1) return false;
  socket.send(JSON.stringify(createMessage(type, payload)));
  return true;
}

export function sendError(socket, code, message) {
  return send(socket, MESSAGE_TYPES.ERROR, { code, message });
}
