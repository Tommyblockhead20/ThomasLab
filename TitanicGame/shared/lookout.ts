import { SHIP_WIDTH_SCALE as W, SHIP_LENGTH_SCALE as L } from './navigation';
import type { Position } from './types';
export const NEST = { z: -31, width: 2.7, depth: 1.7, rear: 0.05, floor: 7 };
export const nestPoint = (x: number, z: number): Position => ({
  x: x / W,
  z: NEST.z + z / L,
  level: 1,
});
export const NEST_PHONE = nestPoint(1, -0.1);
export const NEST_BELL = nestPoint(-0.72, -0.35);
export const NEST_EXIT = nestPoint(0, -0.75);
export const NEST_ENTRY: Position = { x: 0, z: NEST.z - 0.82 / L, level: 2 };
export function lookoutSpawn(second = false) {
  return nestPoint(second ? 0.48 : -0.48, -0.9);
}
export function insideNest(p: Position) {
  const x = p.x * W,
    z = (p.z - NEST.z) * L;
  if (z > NEST.rear - 0.24 || z < NEST.rear - (NEST.depth - 0.24)) return false;
  if ((x / (NEST.width / 2 - 0.24)) ** 2 + ((z - NEST.rear) / (NEST.depth - 0.24)) ** 2 >= 1)
    return false;
  return Math.hypot(x, z) > 0.59;
}
