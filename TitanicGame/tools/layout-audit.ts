import {
  canOccupy,
  moveWithCollision,
  distance,
  wallsBetween,
  STATIONS,
  WALLS,
} from '../shared/world';
const start = { x: 0, z: -18, level: 0 as const },
  stepX = 0.25,
  stepZ = 0.125;
const points = [start],
  ix = [[0, 0]],
  seen = new Set(['0,0']);
for (let i = 0; i < points.length; i++)
  for (const [a, b] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const n = [ix[i][0] + a, ix[i][1] + b],
      key = n.join(',');
    if (seen.has(key)) continue;
    const p = { x: n[0] * stepX, z: -18 + n[1] * stepZ, level: 0 as const };
    if (!canOccupy(p) || distance(moveWithCollision(points[i], a * stepX, b * stepZ), p) > 0.001)
      continue;
    seen.add(key);
    ix.push(n);
    points.push(p);
  }
for (const id of ['wireless', 'wireless-copy', 'bridge-phone', 'command']) {
  const s = STATIONS.find((s) => s.id === id)!;
  const closest = points
    .filter((p) => wallsBetween(p, s) === 0)
    .sort((a, b) => distance(a, s) - distance(b, s))
    .slice(0, 2);
  console.log(
    id,
    closest.map((p) => ({ p, d: distance(p, s) })),
    'station walls',
    WALLS.filter(
      (w) =>
        !w.prop && w.level === 0 && Math.abs(w.x - s.x) < w.w / 2 && Math.abs(w.z - s.z) < w.d / 2,
    ),
  );
}
