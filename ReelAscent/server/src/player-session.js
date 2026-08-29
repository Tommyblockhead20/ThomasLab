import crypto from 'node:crypto';
import { RateLimiter } from './rate-limit.js';

export class PlayerSession {
  constructor(playerId, socket) {
    this.playerId = playerId;
    this.socket = socket;
    this.room = null;
    this.connected = true;
    this.reconnectToken = crypto.randomBytes(24).toString('base64url');
    this.disconnectedAt = 0;
    this.reconnectTimer = null;
    this.lastSequence = -1;
    this.lastSnapshot = null;
    this.fishingState = null;
    this.rateLimiter = new RateLimiter();
  }

  attach(socket) {
    this.socket = socket;
    this.connected = true;
    this.disconnectedAt = 0;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  detach() {
    this.socket = null;
    this.connected = false;
    this.disconnectedAt = Date.now();
  }
}
