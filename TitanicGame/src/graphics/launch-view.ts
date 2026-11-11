import type { Point } from '../../shared/navigation';

// Pick a clear water-side view once at boarding; never move existing ice or
// change viewpoints during the sinking. Check the whole hull, not just its centre.
export function chooseLaunchView(ice: (Point & { radius: number })[]): Point {
  const candidates = [170, 80, -80, -170].flatMap((z) => [210, -210].map((x) => ({ x, z })));
  const targets = [-80, 0, 80].map((z) => ({ x: 0, z }));
  const clearance = (eye: Point, target: Point, berg: Point & { radius: number }) => {
    const dx = target.x - eye.x,
      dz = target.z - eye.z;
    const t = Math.max(
      0,
      Math.min(1, ((berg.x - eye.x) * dx + (berg.z - eye.z) * dz) / (dx * dx + dz * dz)),
    );
    return Math.hypot(berg.x - eye.x - dx * t, berg.z - eye.z - dz * t) - berg.radius - 20;
  };
  const score = (eye: Point) =>
    Math.min(
      10000,
      ...ice.flatMap((berg) => targets.map((target) => clearance(eye, target, berg))),
    );
  return candidates.reduce((best, eye) => (score(eye) > score(best) ? eye : best));
}
