import crypto from 'node:crypto';
import { Room } from './room.js';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export class RoomManager {
  constructor({ roomCapacity = 6, reconnectWindowMs = 25_000 } = {}) {
    this.roomCapacity = roomCapacity;
    this.reconnectWindowMs = reconnectWindowMs;
    this.rooms = new Map();
  }

  createCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = '';
      for (let index = 0; index < 5; index += 1) code += ROOM_ALPHABET[crypto.randomInt(0, ROOM_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not allocate a room code.');
  }

  host(session) {
    if (session.room) return { ok: false, code: 'already_in_room', message: 'You are already in a room.' };
    const room = new Room(this.createCode(), this.roomCapacity);
    room.add(session);
    this.rooms.set(room.code, room);
    room.broadcastState();
    return { ok: true, room };
  }

  join(session, rawCode) {
    if (session.room) return { ok: false, code: 'already_in_room', message: 'You are already in a room.' };
    const code = String(rawCode ?? '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, code: 'room_not_found', message: 'That room does not exist.' };
    if (room.players.has(session.playerId)) return { ok: false, code: 'already_in_room', message: 'That player is already in this room.' };
    if (!room.hasSpace()) return { ok: false, code: 'room_full', message: 'That room is full.' };
    room.add(session);
    room.broadcastState();
    return { ok: true, room };
  }

  leave(session) {
    const room = session.room;
    if (!room) return { ok: false, code: 'invalid_state_transition', message: 'You are not currently in a room.' };
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = null;
    room.remove(session);
    if (room.size === 0) this.rooms.delete(room.code);
    else room.broadcastState();
    return { ok: true };
  }

  disconnect(session) {
    const room = session.room;
    if (!room) return;
    session.detach();
    room.broadcastState();
    session.reconnectTimer = setTimeout(() => {
      if (session.connected || session.room !== room) return;
      room.remove(session);
      if (room.size === 0) this.rooms.delete(room.code);
      else room.broadcastState();
    }, this.reconnectWindowMs);
    session.reconnectTimer.unref?.();
  }

  reconnect(playerId, reconnectToken, socket) {
    if (!playerId || !reconnectToken) return null;
    for (const room of this.rooms.values()) {
      const session = room.players.get(playerId);
      if (!session || session.connected || session.reconnectToken !== reconnectToken) continue;
      session.attach(socket);
      room.broadcastState();
      return session;
    }
    return null;
  }
}
