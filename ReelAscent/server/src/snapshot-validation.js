const MOVEMENT_STATES = new Set(['grounded', 'airborne', 'sliding', 'climbing', 'mantling', 'fishing']);
const finite = (value) => Number.isFinite(Number(value));

export function validateSnapshot(payload, session, now = Date.now()) {
  if (!payload || payload.playerId !== session.playerId) return { ok: false, reason: 'player_id_mismatch' };
  const position = payload.position;
  if (!position || !['x', 'y', 'z'].every((axis) => finite(position[axis]))) return { ok: false, reason: 'invalid_position' };
  const normalizedPosition = { x: Number(position.x), y: Number(position.y), z: Number(position.z) };
  if (Math.abs(normalizedPosition.x) > 5000 || Math.abs(normalizedPosition.z) > 5000 || normalizedPosition.y < -500 || normalizedPosition.y > 5000) {
    return { ok: false, reason: 'out_of_bounds' };
  }

  const sequence = Number(payload.sequence);
  if (!Number.isSafeInteger(sequence) || sequence <= session.lastSequence) return { ok: false, reason: 'stale_sequence' };
  const yaw = Number(payload.yaw);
  if (!finite(yaw)) return { ok: false, reason: 'invalid_yaw' };
  const movement = MOVEMENT_STATES.has(payload.movement) ? payload.movement : 'airborne';

  if (session.lastSnapshot) {
    const dt = Math.max(0.05, Math.min(5, (now - session.lastSnapshot.serverTime) / 1000));
    const previous = session.lastSnapshot.position;
    const distance = Math.hypot(
      normalizedPosition.x - previous.x,
      normalizedPosition.y - previous.y,
      normalizedPosition.z - previous.z
    );
    // Deliberately generous. This catches only obviously impossible packet jumps while still
    // allowing falls, debug teleports, lag bursts, and climbing recovery movement.
    const allowedDistance = 35 + 90 * dt;
    if (distance > allowedDistance) return { ok: false, reason: 'implausible_jump' };
  }

  return {
    ok: true,
    snapshot: {
      playerId: session.playerId,
      sequence,
      position: normalizedPosition,
      yaw: ((yaw % 360) + 360) % 360,
      movement,
      fishingState: payload.fishingState ?? null,
      serverTime: now
    }
  };
}
