const integer = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

export const SERVER_CONFIG = Object.freeze({
  port: integer(process.env.PORT, 8787, 1, 65535),
  roomCapacity: integer(process.env.ROOM_CAPACITY, 6, 2, 12),
  reconnectWindowMs: integer(process.env.RECONNECT_WINDOW_MS, 25_000, 5_000, 120_000),
  heartbeatIntervalMs: integer(process.env.HEARTBEAT_INTERVAL_MS, 15_000, 5_000, 60_000),
  maxPayloadBytes: integer(process.env.MAX_PAYLOAD_BYTES, 32 * 1024, 4096, 256 * 1024),
  allowedOrigins: String(process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
});
