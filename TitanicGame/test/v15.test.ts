import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { joinArchitecturalBoxes } from '../src/graphics/joins';
import { batchStaticShip } from '../src/graphics/performance';
import {
  buildOfficerDetails,
  buildPassengerDetails,
  buildStairways,
  buildMachineryWalls,
} from '../src/graphics/interiors';
import { buildCabinWall } from '../src/graphics/architecture';
import { buildTallShell, buildDeckhouseRoofs } from '../src/graphics/liner';
import { box } from '../src/graphics/building';
import type { ShipMaterials } from '../src/graphics/materials';
import { DOORWAYS, WIRELESS } from '../shared/layout';
import { STATIONS, WALLS, canOccupy, moveWithCollision, distance, spawnFor } from '../shared/world';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';
import { Room } from '../server/game';
const material = new T.MeshStandardMaterial();
const palette = new Proxy({}, { get: () => material }) as ShipMaterials;
function architecture() {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildOfficerDetails(g, palette);
  buildPassengerDetails(g, palette);
  buildStairways(g, palette);
  buildMachineryWalls(g, palette);
  buildTallShell(g, palette);
  buildDeckhouseRoofs(g, palette);
  for (const w of WALLS.filter((w) => w.level === 0 && !w.prop))
    g.add(buildCabinWall(w, 0, palette));
  return g;
}
test('all fifteen top-deck doors have clear walking approaches on both sides, including room to turn', () => {
  for (const d of DOORWAYS) {
    const horizontal = d.w > d.d;
    for (const lane of [-0.2, 0, 0.2]) {
      const point = (metres: number) => ({
        x: d.x + (horizontal ? lane : metres) / W,
        z: d.z + (horizontal ? metres : lane) / L,
        level: 0 as const,
      });
      const start = point(-1),
        end = point(1);
      for (let n = 0; n <= 40; n++)
        assert.ok(canOccupy(point(-1 + n * 0.05)), `${d.x},${d.z}, lane ${lane}, step ${n}`);
      assert.ok(
        distance(moveWithCollision(start, end.x - start.x, end.z - start.z), end) < 0.001,
        `${d.x},${d.z}`,
      );
    }
  }
  for (let n = 0; n <= 50; n++) {
    const t = n / 50;
    assert.ok(
      canOccupy({ x: -2.8 + 0.2 * t, z: -9.55 + 2.35 * t, level: 0 }),
      'continuous wireless through passage',
    );
  }
});
test('wireless furniture, station targets, spawns and prepared demos agree with the rearranged room', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildOfficerDetails(g, palette);
  g.updateMatrixWorld(true);
  for (const [id, fixture, layout] of [
    ['wireless', 'wireless-receiver-fixture', WIRELESS.receiver],
    ['wireless-copy', 'wireless-copy-fixture', WIRELESS.copy],
  ] as const) {
    const s = STATIONS.find((s) => s.id === id)!;
    assert.equal(s.x, layout.x);
    assert.equal(s.z, layout.z);
    const b = new T.Box3().setFromObject(g.getObjectByName(fixture)!);
    assert.ok(b.max.x < -0.15 * W || b.min.x < -4 * W);
    const r = new Room('DEMO', 5),
      p = r.addPlayer('Mate', 's');
    r.start(p.id, { practice: true, demo: 'wireless' });
    r.practiceAction(p.id, { verb: 'travel', value: id });
    assert.ok(canOccupy(p));
    assert.ok(distance(p, s) < 2);
    assert.ok(id === 'wireless' ? p.x < s.x : p.x > s.x, 'face the working side of each desk');
  }
  assert.ok(canOccupy(spawnFor('Wireless Operator')));
  assert.ok(canOccupy(spawnFor('Second Wireless Operator')));
  const phone = STATIONS.find((s) => s.id === 'wireless-phone')!;
  assert.ok(
    WALLS.filter((w) => w.level === 0 && !w.prop).every(
      (w) => Math.abs(phone.z - w.z) > 0.2 || Math.abs(phone.x - w.x) > w.w / 2 + 0.2 / W,
    ),
  );
});
test('architectural joins preserve external silhouettes, normals and UVs in reflected groups and leave genuine openings', () => {
  const root = new T.Group();
  root.scale.set(W, H, L);
  const reflected = new T.Group();
  reflected.scale.z = -1;
  root.add(reflected);
  box(reflected, 0, 1, 0, 4, 2, 0.3, material, 'plaster');
  box(reflected, 1.9, 1, 1.8, 0.3, 2, 4, material, 'plaster');
  box(reflected, -1.9, 1, 1.8, 0.3, 2, 4, material, 'plaster');
  const origins = Array.from({ length: 70 }, (_, i) => new T.Vector3(-3 + i * 0.09, 1, 5));
  root.updateMatrixWorld(true);
  const before = origins.map(
    (o) =>
      new T.Raycaster(o, new T.Vector3(0, 0, -1)).intersectObject(root, true)[0]?.distance ?? null,
  );
  const result = joinArchitecturalBoxes(root);
  assert.ok(result.trimmedFaces > 0);
  const after = origins.map(
    (o) =>
      new T.Raycaster(o, new T.Vector3(0, 0, -1)).intersectObject(root, true)[0]?.distance ?? null,
  );
  for (let i = 0; i < before.length; i++)
    assert.ok(before[i] === null ? after[i] === null : Math.abs(before[i]! - after[i]!) < 0.00001);
  root.traverse((o) => {
    if (!(o instanceof T.Mesh) || !o.visible) return;
    const p = o.geometry.getAttribute('position'),
      n = o.geometry.getAttribute('normal'),
      uv = o.geometry.getAttribute('uv');
    for (let i = 0; i < p.count; i += 3) {
      const a = new T.Vector3().fromBufferAttribute(p, i),
        b = new T.Vector3().fromBufferAttribute(p, i + 1),
        c = new T.Vector3().fromBufferAttribute(p, i + 2);
      assert.ok(b.sub(a).cross(c.sub(a)).dot(new T.Vector3().fromBufferAttribute(n, i)) > 0);
      for (let j = 0; j < 3; j++)
        assert.ok(Number.isFinite(uv.getX(i + j)) && Number.isFinite(uv.getY(i + j)));
    }
  });
  assert.equal(
    new T.Raycaster(new T.Vector3(0, 1, -10), new T.Vector3(0, 0, 1), 0, 8).intersectObject(
      root,
      true,
    ).length,
    0,
    'open end of the U remains open',
  );
});
test('the assembled wall, frame, stair and promenade solids have no duplicate coplanar exterior patches after joining', () => {
  const g = architecture();
  const result = joinArchitecturalBoxes(g);
  assert.ok(result.trimmedFaces > 2000);
  g.updateMatrixWorld(true);
  type Axis = 'x' | 'y' | 'z';
  const faces: { mesh: T.Mesh; axis: Axis; at: number; normal: T.Vector3; bounds: T.Box3 }[] = [];
  g.traverse((o) => {
    if (!(o instanceof T.Mesh) || !o.visible || !o.userData.architectureJoined) return;
    const p = o.geometry.getAttribute('position'),
      n = o.geometry.getAttribute('normal');
    for (let i = 0; i < p.count; i += 6) {
      const normal = new T.Vector3().fromBufferAttribute(n, i).transformDirection(o.matrixWorld);
      const axis = (['x', 'y', 'z'] as Axis[]).find((a) => Math.abs(normal[a]) > 0.99999)!;
      const points = Array.from({ length: 6 }, (_, j) =>
        new T.Vector3().fromBufferAttribute(p, i + j).applyMatrix4(o.matrixWorld),
      );
      faces.push({
        mesh: o,
        axis,
        at: points[0][axis],
        normal,
        bounds: new T.Box3().setFromPoints(points),
      });
    }
  });
  for (let i = 0; i < faces.length; i++)
    for (let j = i + 1; j < faces.length; j++) {
      const a = faces[i],
        b = faces[j];
      if (
        a.mesh === b.mesh ||
        a.axis !== b.axis ||
        Math.abs(a.at - b.at) > 0.0001 ||
        a.normal.dot(b.normal) < 0.999
      )
        continue;
      const area = (['x', 'y', 'z'] as Axis[])
        .filter((c) => c !== a.axis)
        .map(
          (c) =>
            Math.min(a.bounds.max[c], b.bounds.max[c]) - Math.max(a.bounds.min[c], b.bounds.min[c]),
        );
      assert.ok(
        area.some((v) => v < 0.00001),
        `${a.mesh.name}/${b.mesh.name}: overlapping ${area}`,
      );
    }
  const joined = g.children.length;
  batchStaticShip(g, []);
  assert.ok(g.children.length > joined, 'joined architecture still batches');
});
test('forward roof is continuous across the officer and wireless houses, with an open funnel casing', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildDeckhouseRoofs(g, palette);
  g.updateMatrixWorld(true);
  assert.equal(g.children.length, 3);
  for (const z of [-20, -16.301, -16.299, -9.251, -9.249, -7]) {
    const hits = new T.Raycaster(
      new T.Vector3(3 * W, 8, z * L),
      new T.Vector3(0, -1, 0),
      0,
      8,
    ).intersectObject(g, true);
    assert.equal(hits.length, 1, `one roof at ${z}`);
  }
  assert.equal(
    new T.Raycaster(new T.Vector3(0, 8, -13 * L), new T.Vector3(0, -1, 0), 0, 8).intersectObject(
      g,
      true,
    ).length,
    0,
  );
});
test('lounge books rest on real shelves instead of intersecting a solid box', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildPassengerDetails(g, palette);
  g.updateMatrixWorld(true);
  const books: T.Mesh[] = [],
    shelves: T.Mesh[] = [],
    backs: T.Mesh[] = [];
  g.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    if (o.name === 'shelved-book') books.push(o);
    if (o.name === 'bookcase-shelf') shelves.push(o);
    if (o.name === 'bookcase-back') backs.push(o);
  });
  assert.equal(books.length, 132);
  assert.equal(shelves.length, 8);
  for (const book of books) {
    const b = new T.Box3().setFromObject(book);
    assert.ok(
      shelves.some((s) => {
        const a = new T.Box3().setFromObject(s);
        return (
          Math.abs(a.max.y - b.min.y) < 0.00001 &&
          a.containsPoint(
            new T.Vector3(
              b.getCenter(new T.Vector3()).x,
              a.min.y + 0.01,
              b.getCenter(new T.Vector3()).z,
            ),
          )
        );
      }),
    );
    assert.ok(
      backs.every((s) => {
        const a = new T.Box3().setFromObject(s);
        return (
          Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) < 0.00001 ||
          Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) < 0.00001
        );
      }),
    );
  }
});

test('lower machinery doors and the steering-room entrance have clear approaches beside equipment', () => {
  for (const d of [
    { x: 0, z: -6, level: -1 as const },
    { x: 0, z: 0, level: -1 as const },
    { x: 1.6, z: 12.2, level: -1 as const },
    { x: 0, z: 21.7, level: -1 as const },
    { x: 1.5, z: 27.6, level: 2 as const },
  ])
    for (const lane of [-0.2, 0, 0.2]) {
      const start = { ...d, x: d.x + lane / W, z: d.z - 1 / L },
        end = { ...d, x: d.x + lane / W, z: d.z + 1 / L };
      assert.ok(canOccupy(start) && canOccupy(end), JSON.stringify(d));
      assert.ok(distance(moveWithCollision(start, 0, 2 / L), end) < 0.001, JSON.stringify(d));
    }
});
