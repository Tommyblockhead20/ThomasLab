import { DOORWAYS } from '../shared/layout';
import { canOccupy, moveWithCollision, distance } from '../shared/world';
import { SHIP_WIDTH_SCALE as W, SHIP_LENGTH_SCALE as L } from '../shared/navigation';
for (const d of DOORWAYS) {
  const horizontal = d.w > d.d;
  const bad = [];
  for (let m = -1; m <= 1.001; m += 0.05) {
    const p = {
      x: d.x + (horizontal ? 0 : m / W),
      z: d.z + (horizontal ? m / L : 0),
      level: 0 as const,
    };
    if (!canOccupy(p)) bad.push(+m.toFixed(2));
  }
  console.log(d.x, d.z, bad.length ? bad : 'clear');
}
