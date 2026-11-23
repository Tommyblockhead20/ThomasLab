import type { Position } from './types';
import { SHIP_WIDTH_SCALE as W, SHIP_LENGTH_SCALE as L } from './navigation';
// Authoritative corrections beyond a metre still apply immediately. Small
// prediction differences never drag a stopped camera across several snapshots.
export function reconcileCrew(current: Position, authoritative: Position): Position {
  return current.level !== authoritative.level ||
    Math.hypot((current.x - authoritative.x) * W, (current.z - authoritative.z) * L) > 1
    ? { ...authoritative }
    : current;
}

// A landing may face useful room space rather than the last sideways step.
export function passageExitView(
  exitYaw: number | undefined,
  routeYaw: number,
  routePitch: number,
  lookYaw = 0,
  lookPitch = 0,
) {
  return {
    yaw: exitYaw ?? routeYaw + lookYaw,
    pitch: exitYaw === undefined ? Math.max(-1.35, Math.min(1.35, routePitch + lookPitch)) : 0,
  };
}
