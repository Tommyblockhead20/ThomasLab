import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { JOB_DEMOS, type DemoId } from '../shared/demos';
import { NEST, lookoutSpawn, NEST_ENTRY, NEST_EXIT } from '../shared/lookout';
import { canOccupy, STATIONS, distance, wallsBetween, travelPoint } from '../shared/world';
import { BOAT_DECK_BACK, FUNNEL_POSITIONS, DECK_OPENINGS, passengerRoute } from '../shared/layout';
import { navigationWarnings } from '../shared/voyage';
import { buildStairways } from '../src/graphics/interiors';
import { buildDeckhouseRoofs } from '../src/graphics/liner';
import { buildTelephone, buildTelegraph } from '../src/graphics/bridge';
import type { ShipMaterials } from '../src/graphics/materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';

function advance(r: Room, seconds: number) {
  for (let t = 0; t < seconds - 1e-7; t += 0.05) r.tick(0.05);
}
function demo(id: DemoId) {
  const r = new Room('V7DEMO', 97),
    p = r.addPlayer('Test Crew', 'one');
  r.start(p.id, { practice: true, demo: id });
  return { r, p };
}

test('normal solo starts live; a stopped ship warns at 23 seconds and recalls at 95', () => {
  const r = new Room('LIVEV7', 5),
    p = r.addPlayer('Captain', 'one');
  r.start(p.id, { practice: true });
  r.icebergs = [];
  r.mainResolved = true;
  r.nextEvent = r.nextTelegram = Infinity;
  assert.equal(r.practiceSettings.paused, false);
  r.ship.speed = r.ship.throttle = r.ship.order = 0;
  advance(r, 22);
  assert.equal(navigationWarnings(r.ship).schedule, null);
  advance(r, 1);
  assert.equal(navigationWarnings(r.ship).schedule, 'caution');
  assert.match(r.notice, /behind schedule/);
  advance(r, 38);
  assert.equal(navigationWarnings(r.ship).schedule, 'urgent');
  assert.match(r.notice, /allowance/);
  advance(r, 35);
  assert.equal(r.phase, 'inquiry');
  assert.equal(r.inquiryCause, 'schedule');
});

test('each prepared job starts at legal, usable equipment, without setup or unrelated random events', () => {
  for (const d of JOB_DEMOS) {
    const { r, p } = demo(d.id),
      s = STATIONS.find((s) => s.id === d.station)!;
    assert.ok(canOccupy(p), d.id);
    assert.ok(distance(p, s) < 3.3, d.id);
    assert.equal(wallsBetween(p, s), 0, d.id);
    assert.equal(p.role, d.role);
    assert.equal(r.snapshot(p.id).demo?.id, d.id);
    assert.equal(p.saboteur, false);
    assert.equal(r.practiceSettings.paused, !d.live);
    assert.equal(r.nextEvent, Infinity);
    if (d.id === 'lookout') assert.ok(p.binoculars);
    if (d.id === 'schedule') assert.equal(r.icebergs.length, 0);
    r.practiceAction(p.id, { verb: 'restart' });
    assert.equal(r.snapshot(p.id).demo?.id, d.id);
    assert.equal(r.ship.delay, 0);
  }
});

test('job demos complete through the normal department actions and retry resets their state', () => {
  for (const d of JOB_DEMOS) {
    const { r, p } = demo(d.id);
    const act = (station: string, verb: string, value?: unknown) => {
      advance(r, 0.2);
      r.action(p.id, { station, verb, value });
    };
    if (d.id === 'captain') act('telegraph', 'order', 25);
    if (d.id === 'navigation') {
      act('chart', 'deliver');
      act('chart', 'mark', {
        kind: 'area',
        points: [r.telegrams[0].report!],
        radius: 200,
        label: 'Reported ice',
        source: 'Wireless',
        confidence: 'low',
      });
    }
    if (d.id === 'lookout') {
      act('bell', 'observe', { range: 0, note: 'Bearing steady' });
      act('bell', 'ring');
    }
    if (d.id === 'helmsman') {
      act('wheel', 'rudder', 1);
      while (r.ship.heading < 278) advance(r, 0.1);
      act('wheel', 'rudder', 0);
    }
    if (d.id === 'boilers') {
      for (let zone = 0; zone < 3; zone++) act('boiler-a', 'door', { zone, open: true });
      const stroke = (zone: number, tool: string) => {
        advance(r, 0.5);
        act('boiler-a', 'tend', { zone, tool });
      };
      stroke(0, 'coal');
      stroke(0, 'coal');
      stroke(2, 'coal');
      stroke(0, 'slice');
      stroke(0, 'slice');
      stroke(0, 'rake');
      stroke(0, 'rake');
      for (let zone = 0; zone < 3; zone++) act('boiler-a', 'door', { zone, open: false });
      act('boiler-a', 'fire', 0.64);
      advance(r, 25);
    }
    if (d.id === 'engineer') {
      act('engines', 'repair');
      advance(r, 9.1);
      act('engines', 'throttle', 25);
    }
    if (d.id === 'wireless') {
      act('wireless', 'assist', { id: r.telegrams[0].id });
      advance(r, 14.1);
    }
    if (d.id === 'schedule') advance(r, 46);
    assert.equal(r.snapshot(p.id).demo?.complete, true, d.id);
    r.practiceAction(p.id, { verb: 'restart' });
    assert.equal(r.snapshot(p.id).demo?.complete, false, d.id);
    assert.equal(p.job, null);
    assert.equal(r.phones.length, 0);
    assert.equal(r.ship.delay, 0);
  }
});

test('demos remain private to solo and explicit held clocks leave schedule and positions fixed', () => {
  const { r, p } = demo('boilers'),
    west = r.ship.west;
  advance(r, 60);
  assert.equal(r.elapsed, 0);
  assert.equal(r.ship.delay, 0);
  assert.equal(r.ship.west, west);
  r.practiceAction(p.id, { verb: 'demo', value: 'schedule' });
  assert.equal(r.practiceSettings.paused, false);
  advance(r, 46);
  assert.equal(navigationWarnings(r.ship).schedule, 'caution');
  const multi = new Room('MULTI7', 3);
  for (let i = 0; i < 4; i++) multi.addPlayer('Crew' + i, 's' + i).ready = true;
  multi.start(multi.host, { demo: 'engineer', practice: true });
  assert.equal(multi.activeDemo, null);
  assert.throws(
    () => multi.practiceAction(multi.host, { verb: 'demo', value: 'captain' }),
    /single-player/,
  );
});

test('passenger vestibule is separate from wireless, both sides connect outside, and the after deck has an entrance', () => {
  for (const side of [-1, 1]) {
    for (let x = side * 1.5; Math.abs(x) < 6.3; x += side * 0.1)
      assert.ok(canOccupy({ x, z: -5.45, level: 0 }));
    for (let x = side * 0.2; Math.abs(x) < 6.3; x += side * 0.1)
      assert.ok(canOccupy({ x, z: 14.5, level: 0 }));
  }
  assert.ok(wallsBetween({ x: 0, z: -5.8, level: 0 }, { x: 0, z: -7.1, level: 0 }) >= 2);
  assert.ok(passengerRoute[0].z > -6.3);
  assert.ok(STATIONS.some((s) => s.id === 'deck-aft-passengers'));
  assert.equal(STATIONS.filter((s) => s.id === 'deck-engine').length, 1);
  assert.ok(FUNNEL_POSITIONS.at(-1)! + 1.3 < BOAT_DECK_BACK);
  assert.ok(
    STATIONS.find((s) => s.id === 'deck-forecastle')!.x > 6.55 + 0.5,
    'external stairs stay outside the bridge',
  );
});

test('lookouts have two forward positions and the ladder ends through the rear of the basket', () => {
  for (const second of [false, true]) {
    const p = lookoutSpawn(second);
    assert.ok(canOccupy(p));
    assert.ok(p.z < NEST.z - 0.2 / L);
  }
  assert.equal(canOccupy({ x: 0, z: NEST.z, level: 1 }), false, 'mast remains solid when walking');
  const up = STATIONS.find((s) => s.id === 'deck-nest')!;
  assert.equal(distance(up, NEST_ENTRY), 0);
  assert.equal(distance(up.destination!, NEST_EXIT), 0);
  const path = travelPoint(up, 0.5);
  assert.ok(
    Math.abs(path.x) < 0.01 && Math.abs(path.z - NEST.z) < 0.01,
    'climb stays inside hollow mast',
  );
});

test('wooden decks provide external landings and final treads; machinery U turns use one slab per height', () => {
  const material = new T.MeshStandardMaterial();
  const m = Object.fromEntries(
    ['wood', 'darkWood', 'ivory', 'steel', 'brass', 'black', 'glass', 'roof', 'rope'].map((k) => [
      k,
      material,
    ]),
  ) as ShipMaterials;
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildStairways(g, m);
  g.updateMatrixWorld(true);
  for (const id of ['deck-forecastle', 'deck-poop', 'deck-passengers', 'deck-aft-passengers']) {
    const group = g.getObjectByName(id + '-structure')!;
    assert.ok(group.getObjectByName('stair-stringer'));
    assert.equal(
      group.getObjectByName('stair-landing'),
      undefined,
      id + ' reuses the wooden floor',
    );
    const route = STATIONS.find((s) => s.id === id)!.route!,
      ground = route.at(-1)!.y * H;
    group.traverse((o) => {
      if (o.name === 'stair-tread') assert.ok(new T.Box3().setFromObject(o).max.y > ground + 0.02);
    });
  }
  const machinery = g.getObjectByName('deck-engine-structure')!,
    heights = new Set<number>();
  let slabs = 0;
  machinery.traverse((o) => {
    if (o.name === 'stair-landing') {
      slabs++;
      assert.ok(!heights.has(o.userData.floorHeight));
      heights.add(o.userData.floorHeight);
    }
  });
  assert.equal(slabs, 6);
});

test('the passenger skylight meets its roof frame and opens through the ceiling', () => {
  const material = new T.MeshStandardMaterial({ side: T.DoubleSide });
  const m = Object.fromEntries(
    ['wood', 'darkWood', 'ivory', 'steel', 'brass', 'black', 'glass', 'roof', 'rope'].map((k) => [
      k,
      material,
    ]),
  ) as ShipMaterials;
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildStairways(g, m);
  buildDeckhouseRoofs(g, m);
  g.updateMatrixWorld(true);
  const roofs: T.Object3D[] = [];
  g.traverse((o) => {
    if (o.name === 'deckhouse-roof') roofs.push(o);
  });
  const ray = new T.Raycaster(new T.Vector3(0, 1, -4.65 * L), new T.Vector3(0, 1, 0));
  assert.equal(ray.intersectObjects(roofs).length, 0, 'the dome has a real ceiling aperture');
  ray.ray.origin.x = 2;
  assert.ok(ray.intersectObjects(roofs).length > 0, 'surrounding roof stays solid');
  const bounds = new T.Box3().setFromObject(g.getObjectByName('entrance-skylight')!);
  assert.ok(Math.abs(bounds.min.y - 3.41 * H) < 0.001, 'dome rests on the roof');
});

test('bridge fittings keep their human dimensions after the ship is scaled', () => {
  const material = new T.MeshStandardMaterial();
  const m = Object.fromEntries(
    ['wood', 'darkWood', 'ivory', 'steel', 'brass', 'black'].map((k) => [k, material]),
  ) as ShipMaterials;
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildTelegraph(g, m);
  buildTelephone(g, STATIONS.find((s) => s.id === 'bridge-phone')!, m);
  g.updateMatrixWorld(true);
  for (const name of ['bridge-telegraph', 'bridge-phone-fixture']) {
    const b = new T.Box3().setFromObject(g.getObjectByName(name)!),
      size = b.getSize(new T.Vector3());
    assert.ok(size.y < 1.9 && size.x < 0.9 && size.z < 0.6, name);
    assert.ok(Math.abs(b.min.y) < 0.001, name + ' meets deck');
  }
  const { r, p } = demo('captain');
  r.action(p.id, { station: 'telegraph', verb: 'order', value: 25 });
  assert.equal(r.snapshot(p.id).demo?.complete, true);
  advance(r, 0.2);
  r.action(p.id, { station: 'telegraph', verb: 'order', value: 0 });
  assert.equal(r.snapshot(p.id).demo?.complete, true, 'completion persists until retry');
  r.practiceAction(p.id, { verb: 'travel', value: 'chart' });
  assert.equal(r.snapshot(p.id).demo, null, 'free exploration leaves the prepared demo');
});
