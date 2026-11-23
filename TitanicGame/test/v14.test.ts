import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { batchStaticShip, nearbyPickRoots } from '../src/graphics/performance';
import { buildAuxiliaryMachinery } from '../src/graphics/auxiliary';
import {
  buildBoilerRoom,
  buildStairways,
  buildPassengerDetails,
  buildOfficerDetails,
} from '../src/graphics/interiors';
import { buildEngineRoom } from '../src/graphics/machinery';
import { buildBridgeDetails, buildTelephone } from '../src/graphics/bridge';
import { light } from '../src/graphics/building';
import { SinkingSections } from '../src/graphics/sinking';
import { Room } from '../server/game';
import type { ShipMaterials } from '../src/graphics/materials';
import { LEVEL_Y } from '../shared/layout';
import { STATIONS, canOccupy, wallsBetween } from '../shared/world';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';

const material = new T.MeshStandardMaterial();
const palette = Object.fromEntries(
  [
    'wood',
    'darkWood',
    'ivory',
    'steel',
    'brass',
    'black',
    'glass',
    'roof',
    'rope',
    'deck',
    'red',
    'glow',
    'floor',
  ].map((k) => [k, material]),
) as ShipMaterials;
const triangles = (g: T.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3;
function visibleTriangles(root: T.Object3D) {
  let n = 0;
  root.traverseVisible((o) => {
    if (o instanceof T.Mesh) n += triangles(o.geometry);
  });
  return n;
}

test('static batching preserves triangles, UVs, bounds and mirrored winding while retaining exact ray geometry', () => {
  const root = new T.Group();
  root.scale.set(W, H, L);
  const lower = new T.Group();
  lower.scale.z = -1;
  root.add(lower);
  const originals: T.Mesh[] = [];
  for (let i = 0; i < 12; i++) {
    const m = new T.Mesh(new T.BoxGeometry(0.5, 0.7, 0.8), material);
    m.position.set(i * 0.6, 0, -2);
    m.name = 'part-' + i;
    lower.add(m);
    originals.push(m);
  }
  root.updateMatrixWorld(true);
  const n = visibleTriangles(root),
    bounds = new T.Box3().setFromObject(root);
  const stats = batchStaticShip(root, []);
  assert.equal(stats.originals, 12);
  assert.equal(stats.batches, 1);
  assert.equal(visibleTriangles(root), n);
  const batch = root.children.find((o) => o.userData.staticBatch) as T.Mesh;
  assert.ok(batch.geometry.getAttribute('uv'));
  root.updateMatrixWorld(true);
  const after = new T.Box3().setFromObject(batch);
  assert.ok(after.min.distanceTo(bounds.min) < 1e-5);
  assert.ok(after.max.distanceTo(bounds.max) < 1e-5);
  const ray = new T.Raycaster(new T.Vector3(0, 0, 4 * L), new T.Vector3(0, 0, -1));
  assert.ok(
    ray.intersectObject(batch).length > 0,
    'reflected geometry still has outward-facing faces',
  );
  assert.ok(
    ray.intersectObject(originals[0]).length > 0,
    'hidden original remains available to physical picking',
  );
  assert.equal(originals[0].visible, false);
});

test('moving valves and their children remain independently drawable and continue to animate after batching', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  const build = buildAuxiliaryMachinery(g, palette);
  const valve = build.controls.find((c) => c.userData.auxiliaryControl.verb === 'feed')!;
  const before = visibleTriangles(g),
    stats = batchStaticShip(g, build.moving);
  assert.ok(stats.savedDraws > 40);
  assert.equal(visibleTriangles(g), before);
  assert.equal(valve.matrixAutoUpdate, true);
  const s = new Room('GRAPHICS').newShip();
  build.update(s, 0);
  const turn = valve.rotation.z;
  s.auxiliary.feedValves[0] = 0.2;
  build.update(s, 1);
  assert.notEqual(valve.rotation.z, turn);
  g.updateMatrixWorld(true);
  const center = new T.Box3().setFromObject(valve).getCenter(new T.Vector3());
  const roots = nearbyPickRoots(build.pickRoots, center.clone().add(new T.Vector3(0, 0, 1.8)), 3.3);
  assert.ok(roots.length < build.pickRoots.length);
  const hits = new T.Raycaster(
    center.clone().add(new T.Vector3(0, 0, 1.8)),
    new T.Vector3(0, 0, -1),
  ).intersectObjects(roots, true);
  let hit: T.Object3D | null = hits[0]?.object ?? null;
  while (hit && !hit.userData.auxiliaryControl) hit = hit.parent;
  assert.equal(hit?.userData.auxiliaryControl.station, 'feed-valve-1');
});

test('broken hull geometry is deferred until breakup, prepared once and never includes hidden originals twice', () => {
  const g = new T.Group();
  for (let i = 0; i < 6; i++) {
    const p = new T.Mesh(new T.BoxGeometry(1, 1, 1), material);
    p.position.z = -8 + i;
    g.add(p);
  }
  batchStaticShip(g, []);
  const sections = withCanvas(() => new SinkingSections(g, new T.Scene(), palette));
  assert.equal(sections.prepared, false);
  assert.equal(sections.bow.children.filter((o) => o.name === 'static-ship-batch').length, 0);
  sections.update(10);
  assert.equal(sections.prepared, false);
  sections.prepare();
  const count = sections.bow.children.length + sections.stern.children.length;
  assert.equal(sections.bow.children.filter((o) => o.name === 'static-ship-batch').length, 1);
  sections.prepare();
  assert.equal(sections.bow.children.length + sections.stern.children.length, count);
});

test('pendant light hardware actually reaches its specified ceiling or wall', () => {
  const g = new T.Group();
  light(g, 1, 2.7, 3, 10, undefined, 3.75);
  g.updateMatrixWorld(true);
  const stem = g.getObjectByName('lamp-mount-stem')!;
  const bounds = new T.Box3().setFromObject(stem);
  assert.ok(Math.abs(bounds.max.y - 3.75) < 1e-5);
  assert.ok(Math.abs(bounds.min.y - 2.785) < 1e-5);
  assert.ok(g.getObjectByName('lamp-mount-plate'));
  assert.ok(g.getObjectByName('lamp-shade'));
});

test('machinery dials have backing housings and the pump, feeder, engine and steering boards are supported', () => {
  const g = new T.Group();
  const build = buildAuxiliaryMachinery(g, palette);
  let housings = 0;
  g.traverse((o) => {
    if (o.name === 'instrument-housing') housings++;
  });
  assert.equal(housings, 8);
  for (const name of [
    'pump-instrument-board',
    'pump-board-leg',
    'dynamo-board-leg',
    'feedwater-panel',
    'feeder-cabinet',
    'steering-instrument-board',
    'steering-board-leg',
  ])
    assert.ok(g.getObjectByName(name), name);
  const engines = buildEngineRoom(palette).group;
  assert.ok(engines.getObjectByName('engine-instrument-board'));
  assert.ok(build.pickRoots.every((r) => r.parent === build.root));
});

test('new lamp posts do not obstruct the continuous port or starboard promenade', () => {
  for (const x of [-6.25, 6.25])
    for (let z = -20.35; z < 24.2; z += 0.1) assert.ok(canOccupy({ x, z, level: 0 }), `${x}, ${z}`);
});

test('passenger doorway signs have real headers and bookshelf bindings share their four materials', () => {
  const g = new T.Group();
  buildPassengerDetails(g, palette);
  const headers: T.Object3D[] = [],
    bookMaterials = new Set<T.Material>();
  g.traverse((o) => {
    if (o.name === 'passenger-door-header') headers.push(o);
    if (
      o instanceof T.Mesh &&
      !Array.isArray(o.material) &&
      o.material !== material &&
      o.geometry.type === 'BoxGeometry'
    )
      bookMaterials.add(o.material);
  });
  assert.equal(headers.length, 2);
  assert.equal(bookMaterials.size, 5, 'four bindings plus the corridor carpet');
});

function withCanvas<T>(fn: () => T): T {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect() {},
        strokeRect() {},
        fillText() {},
        beginPath() {},
        arc() {},
        stroke() {},
        moveTo() {},
        lineTo() {},
        createRadialGradient: () => ({ addColorStop() {} }),
      }),
    }),
  } as unknown as Document;
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
}

test('bridge, passenger and machinery labels touch supporting faces instead of floating in doorway air', () => {
  withCanvas(() => {
    const g = new T.Group();
    g.scale.set(W, H, L);
    buildOfficerDetails(g, palette);
    buildBridgeDetails(g, palette);
    buildPassengerDetails(g, palette);
    buildAuxiliaryMachinery(g, palette);
    g.updateMatrixWorld(true);
    const labels = new Map<string, T.Object3D>();
    g.traverse((o) => {
      if (o.userData.label) labels.set(o.userData.label, o);
    });
    for (const title of ['CAPTAIN', 'NAVIGATION']) {
      const bounds = new T.Box3().setFromObject(labels.get(title)!);
      assert.ok(Math.abs(bounds.max.z - (-16.3 - 0.075) * L) < 1e-4, title);
    }
    for (const title of ['STATEROOMS', 'DINING SALOON']) {
      const plaque = labels.get(title)!;
      const header = plaque.parent!.children.find((o) => o.name === 'passenger-door-header')!;
      const bounds = new T.Box3().setFromObject(plaque),
        support = new T.Box3().setFromObject(header);
      assert.ok(Math.abs(bounds.min.z - support.max.z) < 1e-4, title);
      assert.ok(
        bounds.min.y > support.min.y && bounds.max.y < support.max.y,
        title + ' vertical support',
      );
    }
    for (const [title, x, z, face] of [
      ['FEED PUMP 1', -6.8, 3.5, 1.3],
      ['DYNAMO 1', -5, 24, 1.9],
      ['LIGHTING', -1.2, 22.5, 0.05],
    ] as const) {
      const b = new T.Box3().setFromObject(labels.get(title)!);
      assert.ok(Math.abs(b.min.z - (z * L + face)) < 1e-4, title);
    }
  });
});

test('boiler picking still hits doors and supplies after static batching and local-root selection', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  const parts = buildBoilerRoom(g, palette);
  const moving = [
    ...parts.doors,
    ...parts.dampers,
    ...parts.gauges,
    ...parts.fires,
    ...parts.ashMounds,
    ...parts.stopWheels,
    ...parts.steamJets,
    ...parts.toolObjects,
  ];
  batchStaticShip(g, moving);
  g.updateMatrixWorld(true);
  for (const door of parts.controls.filter((o) => o.userData.boilerControl.kind === 'door')) {
    const center = new T.Box3().setFromObject(door).getCenter(new T.Vector3());
    const side = -door.parent!.userData.sign;
    const origin = center.clone().add(new T.Vector3(0, 0, side * 1.6));
    const roots = nearbyPickRoots(parts.pickRoots, origin, 4.5);
    assert.ok(roots.length < parts.pickRoots.length);
    const ray = new T.Raycaster(origin, center.clone().sub(origin).normalize(), 0, 4.5);
    const first = ray.intersectObjects(roots, true)[0];
    let object: T.Object3D | null = first?.object ?? null;
    while (object && !object.userData.boilerControl) object = object.parent;
    assert.equal(object?.userData.boilerControl.kind, 'door');
  }
});

test('deferred hull copies omit hidden equipment and players and are freed before a new voyage', () => {
  const g = new T.Group();
  const visible = new T.Mesh(new T.BoxGeometry(), material);
  visible.name = 'visible-equipment';
  g.add(visible);
  const hidden = visible.clone();
  hidden.name = 'hidden-steam-jet';
  hidden.visible = false;
  g.add(hidden);
  const player = new T.Group();
  player.userData.noHullCopy = true;
  const head = visible.clone();
  head.name = 'player-head';
  player.add(head);
  g.add(player);
  const sections = withCanvas(() => new SinkingSections(g, new T.Scene(), palette));
  sections.prepare();
  assert.ok(sections.bow.getObjectByName('visible-equipment'));
  assert.equal(sections.bow.getObjectByName('hidden-steam-jet'), undefined);
  assert.equal(sections.bow.getObjectByName('player-head'), undefined);
  sections.reset();
  assert.equal(sections.prepared, false);
  assert.equal(sections.bow.getObjectByName('visible-equipment'), undefined);
  sections.prepare();
  assert.ok(sections.bow.getObjectByName('visible-equipment'));
});

test('the prepared boiler view can pick the actual slice bar after batching instead of its untagged shaft blocking the rack', () => {
  const r = new Room('RACK', 5),
    p = r.addPlayer('Mate', 's');
  r.start(p.id, { practice: true, demo: 'boilers' });
  const g = new T.Group();
  g.scale.set(W, H, L);
  const parts = buildBoilerRoom(g, palette);
  batchStaticShip(g, [
    ...parts.doors,
    ...parts.dampers,
    ...parts.gauges,
    ...parts.fires,
    ...parts.ashMounds,
    ...parts.stopWheels,
    ...parts.steamJets,
    ...parts.toolObjects,
  ]);
  g.updateMatrixWorld(true);
  const origin = new T.Vector3(p.x * W, LEVEL_Y[p.level] * H + 1.68, p.z * L);
  const direction = new T.Vector3(
    Math.sin(p.yaw) * Math.cos(p.pitch),
    Math.sin(p.pitch),
    -Math.cos(p.yaw) * Math.cos(p.pitch),
  );
  const roots = nearbyPickRoots(parts.pickRoots, origin, 4.5);
  const first = new T.Raycaster(origin, direction, 0, 4.5).intersectObjects(roots, true)[0];
  let hit: T.Object3D | null = first?.object ?? null;
  while (hit && !hit.userData.boilerControl) hit = hit.parent;
  assert.equal(hit?.userData.boilerControl.kind, 'tool');
  assert.equal(hit?.userData.boilerControl.tool, 'slice');
});
