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
