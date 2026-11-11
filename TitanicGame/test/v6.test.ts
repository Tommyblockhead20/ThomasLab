import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import type { Position } from '../shared/types';
import { BOILERS, SHAFT, machineryRoute, LEVEL_Y } from '../shared/layout';
import { STATIONS, WALLS, canOccupy, travelPoint } from '../shared/world';
import { boilerIndex, steamPsi } from '../shared/plant';
import { reconcileCrew } from '../shared/crew-camera';
import { buildStairways, buildBoilerRoom, buildPassengerDetails } from '../src/graphics/interiors';
import { buildTallShell, buildMachineryCeiling } from '../src/graphics/liner';
import type { ShipMaterials } from '../src/graphics/materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../shared/navigation';
function advance(r: Room, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) r.tick(0.05);
}
function solo() {
  const r = new Room('V6TEST', 2468),
    p = r.addPlayer('Fireman', 'solo');
  r.start(p.id, { practice: true, post: 'Boiler Operator', assistance: false, paused: true });
  r.nextEvent = r.nextTelegram = Infinity;
  return { r, p };
}
const material = new T.MeshStandardMaterial();
const palette = Object.fromEntries(
  [
    'wood',
    'darkWood',
    'brass',
    'ivory',
    'black',
    'red',
    'steel',
    'deck',
    'floor',
    'roof',
    'rope',
    'glow',
    'glass',
    'ice',
  ].map((k) => [k, material]),
) as ShipMaterials;

test('all four physical boilers have independent, reachable dampers, fuel and ash work', () => {
  const { r, p } = solo();
  assert.equal(STATIONS.filter((s) => s.kind === 'boiler').length, 4);
  for (const b of BOILERS) {
    assert.equal(boilerIndex(b.id), b.index);
    r.practiceAction(p.id, { verb: 'travel', value: b.id });
    advance(r, 0.2);
    assert.ok(canOccupy(p));
    r.action(p.id, { station: b.id, verb: 'fire', value: 0 });
    assert.equal(r.ship.fires[b.index], 0);
    r.ship.coal[b.index] = 0.1;
    r.ship.ash[b.index] = 0.8;
    advance(r, 0.2);
    r.action(p.id, { station: b.id, verb: 'door', value: { zone: 0, open: true } });
    advance(r, 0.2);
    const fuel = r.ship.coal[b.index];
    r.action(p.id, { station: b.id, verb: 'tend', value: { zone: 0, tool: 'coal' } });
    assert.ok(r.ship.coal[b.index] > fuel + 0.05);
    advance(r, 0.6);
    r.action(p.id, { station: b.id, verb: 'tend', value: { zone: 0, tool: 'rake' } });
    assert.ok(r.ship.ash[b.index] < 0.73);
  }
});
test('closing every damper kills fire and pressure, slows engines, and still works with voyage paused', () => {
  const { r, p } = solo(),
    west = r.ship.west;
  for (const b of BOILERS) {
    r.practiceAction(p.id, { verb: 'travel', value: b.id });
    advance(r, 0.2);
    r.action(p.id, { station: b.id, verb: 'fire', value: 0 });
  }
  advance(r, 90);
  assert.equal(r.elapsed, 0);
  assert.equal(r.ship.west, west);
  assert.equal(r.ship.delay, 0);
  assert.ok(r.ship.fireHeat.every((h) => h < 0.001));
  assert.ok(steamPsi(r.ship.steam) < 1);
  assert.ok(r.ship.speed < 1.5);
  for (const b of BOILERS) {
    r.practiceAction(p.id, { verb: 'travel', value: b.id });
    advance(r, 0.2);
    r.action(p.id, { station: b.id, verb: 'fire', value: 0.9 });
  }
  advance(r, 45);
  assert.ok(steamPsi(r.ship.steam) > 200);
  assert.ok(r.ship.speed > 12);
});
test('neglected firing consumes coal and accumulates ash that reduces steam output', () => {
  const { r } = solo();
  r.crewSize = 7; // Normal tending rate; small crews are intentionally easier.
  advance(r, 220);
  assert.ok(r.ship.coal.every((c) => c < 0.45));
  assert.ok(r.ship.ash.every((a) => a > 0.25));
  const dirty = r.ship.steam;
  r.ship.coal.fill(0.65);
  r.ship.ash.fill(0);
  r.ship.clinker.forEach((a) => a.fill(0));
  advance(r, 25);
  assert.ok(r.ship.steam > dirty + 12);
});
test('stopped camera holds its location over repeated small corrections, but large corrections remain authoritative', () => {
  const camera = { x: 1, z: 4, level: 0 as const };
  let current: Position = { ...camera };
  for (let i = 0; i < 50; i++)
    current = reconcileCrew(current, { x: 1 + 0.1 * Math.exp(-i / 10), z: 4.07, level: 0 });
  assert.deepEqual(current, camera);
  assert.deepEqual(reconcileCrew(current, { x: 4, z: 4, level: 0 }), { x: 4, z: 4, level: 0 });
  assert.deepEqual(reconcileCrew(current, { x: 1, z: 4, level: -1 }), { x: 1, z: 4, level: -1 });
});
test('machinery flights alternate separated lanes and the entire route has headroom inside a closed casing', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildStairways(g, palette);
  buildTallShell(g, palette);
  buildMachineryCeiling(g, palette);
  g.updateMatrixWorld(true);
  const treadBounds: T.Box3[] = [];
  g.traverse((o) => {
    if (o.name === 'stair-tread' || o.name === 'stair-landing')
      treadBounds.push(new T.Box3().setFromObject(o));
  });
  const route = STATIONS.find((s) => s.id === 'deck-engine')!;
  const decks = ['boat-deck', 'b-deck', 'passenger-ceiling', 'machinery-ceiling'].map(
    (name) => g.getObjectByName(name)!,
  );
  const flights = machineryRoute
    .slice(1)
    .map((b, i) => ({ a: machineryRoute[i], b }))
    .filter(({ a, b }) => Math.abs(a.y - b.y) > 0.1);
  assert.equal(flights.length, 6);
  assert.equal(new Set(flights.map((f) => f.a.x)).size, 2);
  for (let i = 0; i <= 600; i++) {
    const p = travelPoint(route, i / 600),
      head = new T.Vector3(p.x * W, p.y * H + 1.72, p.z * L);
    assert.ok(
      !treadBounds.some((b) => b.containsPoint(head)),
      `head intersects another flight at ${i / 600}`,
    );
    if (p.y < -0.1 && p.y > -18.5) {
      const ray = new T.Raycaster(
        new T.Vector3(head.x, p.y * H + 0.1, head.z),
        new T.Vector3(0, 1, 0),
        0,
        1.85,
      );
      assert.equal(
        ray.intersectObjects(decks).length,
        0,
        'floor cuts preserve headroom at ' + i / 600,
      );
    }
    if (p.z > 6.8 && p.y < -0.1 && p.y > -18.8) {
      assert.ok(p.x > SHAFT.x - SHAFT.w / 2 + 0.3 && p.x < SHAFT.x + SHAFT.w / 2 - 0.3);
      assert.ok(p.z < SHAFT.z + SHAFT.d / 2 - 0.25);
    }
  }
  assert.ok(g.getObjectByName('stair-casing-port'));
  assert.ok(g.getObjectByName('stair-casing-front'));
});
test('passenger staterooms are sealed behind a continuous corridor facade', () => {
  for (const side of [-1, 1])
    for (const z of [-18.7, -16.2, -13.7, -11.2, -8.7]) {
      assert.ok(canOccupy({ x: side * 1.1, z, level: -2 }));
      assert.equal(canOccupy({ x: side * 3, z, level: -2 }), false);
    }
  assert.ok(WALLS.some((w) => w.level === -2 && w.x === 1.7 && !w.prop));
  assert.ok(canOccupy(STATIONS.find((s) => s.id === 'deck-passengers')!.destination!));
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildPassengerDetails(g, palette);
  g.updateMatrixWorld(true);
  const door = g.getObjectByName('closed-cabin-door')!,
    size = new T.Box3().setFromObject(door).getSize(new T.Vector3());
  assert.ok(Math.abs(size.z - 1.05) < 0.001, 'sideways doors keep their metre scale');
  assert.ok(Math.abs(size.y - 2.1) < 0.001);
});
test('rendered stokehold contains four full-size double-ended boilers and matches their firing stations', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  const room = buildBoilerRoom(g, palette);
  g.updateMatrixWorld(true);
  assert.equal(room.fires.length, 24);
  assert.equal(room.lights.length, 8);
  assert.equal(room.dampers.length, 4);
  for (const b of BOILERS) {
    const shell = g.getObjectByName(b.id + '-shell')!,
      barrel = shell.getObjectByName('scotch-boiler')!;
    const bounds = new T.Box3().setFromObject(barrel),
      size = bounds.getSize(new T.Vector3());
    assert.ok(Math.abs(size.x - 4.8) < 0.01);
    assert.ok(Math.abs(size.z - 6.1) < 0.01);
    assert.ok(Math.abs(bounds.max.z - b.stationZ * L) < 0.2);
    assert.ok(bounds.min.y >= LEVEL_Y[-1] * H - 0.01);
  }
});
