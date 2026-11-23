import * as T from 'three';
import {
  buildOfficerDetails,
  buildStairways,
  buildPassengerDetails,
  buildMachineryWalls,
} from '../src/graphics/interiors';
import { joinArchitecturalBoxes } from '../src/graphics/joins';
import { buildCabinWall } from '../src/graphics/architecture';
import { buildTallShell, buildDeckhouseRoofs } from '../src/graphics/liner';
import { WALLS } from '../shared/world';
import { LEVEL_Y } from '../shared/layout';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../shared/navigation';
const mat = new T.MeshStandardMaterial();
const palette = new Proxy({}, { get: () => mat }) as any;
const g = new T.Group();
g.scale.set(W, H, L);
buildOfficerDetails(g, palette);
buildStairways(g, palette);
buildPassengerDetails(g, palette);
buildMachineryWalls(g, palette);
buildTallShell(g, palette);
buildDeckhouseRoofs(g, palette);
for (const w of WALLS.filter((w) => w.level === 0 && !w.prop)) g.add(buildCabinWall(w, 0, palette));
if (process.argv.includes('--join')) console.log('Joined', joinArchitecturalBoxes(g));
g.updateMatrixWorld(true);
const faces: any[] = [];
g.traverse((o) => {
  if (
    !(o instanceof T.Mesh) ||
    !o.visible ||
    (o.geometry.type !== 'BoxGeometry' && !o.userData.architectureJoined)
  )
    return;
  const p = o.geometry.getAttribute('position'),
    n = o.geometry.getAttribute('normal');
  const stride = o.userData.architectureJoined ? 6 : 4;
  for (let k = 0; k < p.count; k += stride) {
    const points = Array.from({ length: stride }, (_, j) =>
      new T.Vector3().fromBufferAttribute(p, k + j).applyMatrix4(o.matrixWorld),
    );
    const normal = new T.Vector3().fromBufferAttribute(n, k).transformDirection(o.matrixWorld);
    const axis = ['x', 'y', 'z'].find((a) => Math.abs(normal[a as 'x']) > 0.99999) as
      | 'x'
      | 'y'
      | 'z'
      | undefined;
    if (!axis) continue;
    const b = new T.Box3().setFromPoints(points);
    faces.push({ o, axis, at: points[0][axis], b, normal });
  }
});
let count = 0;
for (let i = 0; i < faces.length; i++)
  for (let j = i + 1; j < faces.length; j++) {
    const a = faces[i],
      b = faces[j];
    if (
      a.o === b.o ||
      a.axis !== b.axis ||
      a.normal.dot(b.normal) < 0.999 ||
      Math.abs(a.at - b.at) > 0.0001
    )
      continue;
    const axes = ['x', 'y', 'z'].filter((c) => c !== a.axis);
    const sizes = axes.map(
      (c) => Math.min(a.b.max[c], b.b.max[c]) - Math.max(a.b.min[c], b.b.min[c]),
    );
    if (sizes.some((s) => s < 0.006) || sizes[0] * sizes[1] < 0.005) continue;
    if (count++ < 85)
      console.log(
        a.o.name || a.o.parent?.name || 'box',
        b.o.name || b.o.parent?.name || 'box',
        a.axis,
        a.at.toFixed(3),
        sizes.map((s) => s.toFixed(3)).join('x'),
        a.o
          .getWorldPosition(new T.Vector3())
          .toArray()
          .map((s: number) => s.toFixed(2)),
        b.o
          .getWorldPosition(new T.Vector3())
          .toArray()
          .map((s: number) => s.toFixed(2)),
      );
  }
console.log('overlapping exterior box faces', count);
