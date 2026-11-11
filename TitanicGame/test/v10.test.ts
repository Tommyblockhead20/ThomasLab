import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { stepPlant, steamDemand, steamPsi } from '../shared/plant';
import { inquirySeat } from '../shared/inquiry';
import {
  PLAN_WALLS,
  BOAT_DECK_FRONT,
  BOAT_DECK_BACK,
  DECK_OPENINGS,
  LEVEL_Y,
} from '../shared/layout';
import { STATIONS } from '../shared/world';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';
import { buildTallShell } from '../src/graphics/liner';
import { buildStairways } from '../src/graphics/interiors';
import { buildInquiryRoom } from '../src/graphics/inquiry';
import type { ShipMaterials } from '../src/graphics/materials';

function room() {
  const r = new Room('V10TEST', 7);
  for (let i = 0; i < 4; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
const paint = new T.MeshStandardMaterial();
const m = Object.fromEntries(
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
  ].map((k) => [k, paint]),
) as ShipMaterials;

test('25 knots increases actual firing demand, fuel turnover and steam draw without responding to an unexecuted order', () => {
  const r = room(),
    a = r.newShip(),
    b = r.newShip(),
    order = r.newShip();
  a.throttle = 20;
  b.throttle = 25;
  order.order = 25;
  const fuel = a.coal[0];
  stepPlant(a, 1);
  stepPlant(b, 1);
  stepPlant(order, 1);
  assert.ok(fuel - b.coal[0] > (fuel - a.coal[0]) * 1.2);
  assert.ok(b.ash[0] > a.ash[0]);
  assert.ok(b.clinker[0][0] > a.clinker[0][0]);
  assert.ok(steamDemand(25) > steamDemand(20) * 1.7);
  assert.deepEqual(order.coal, a.coal);
  assert.equal(order.steam, a.steam);
  for (let i = 0; i < 30; i++) {
    a.coal.fill(0.65);
    b.coal.fill(0.65);
    a.ash.fill(0);
    b.ash.fill(0);
    a.clinker.forEach((v) => v.fill(0));
    b.clinker.forEach((v) => v.fill(0));
    stepPlant(a, 1);
    stepPlant(b, 1);
  }
  assert.ok(steamPsi(a.steam) - steamPsi(b.steam) > 25);
  b.fires.fill(0.73);
  for (let i = 0; i < 25; i++) stepPlant(b, 1);
  assert.ok(steamPsi(b.steam) > 190, 'an adequately fired plant can meet full-power demand');
});

test('high power wears propulsion faster and turns the same marginal event into a natural fault', () => {
  const a = room(),
    b = room();
  a.ship.throttle = a.ship.speed = 20;
  b.ship.throttle = b.ship.speed = 25;
  a.simulateShip(1);
  b.simulateShip(1);
  assert.ok(b.machine('engines').condition < a.machine('engines').condition);
  assert.ok(b.machine('valve').condition < a.machine('valve').condition);
  for (const r of [a, b]) {
    r.machines.forEach((m) => (m.condition = 100));
    r.rng.next = () => 0.2;
  }
  a.randomEvent();
  b.randomEvent();
  assert.equal(a.machine('engines').fault, null);
  assert.ok(b.machine('engines').fault);
});

test('route and schedule recalls gather the un-evacuated crew in a company inquiry, with voting and shared voice', () => {
  for (const cause of ['route', 'schedule'] as const) {
    const r = room();
    r.beginInquiry(cause);
    assert.equal(r.phase, 'inquiry');
    assert.equal(r.sinkingElapsed, null);
    assert.equal(r.ship.hull, 100);
    const crew = [...r.players.values()];
    crew.forEach((p, i) => {
      assert.equal(p.evacuated, false);
      assert.equal(p.x, inquirySeat(i).x);
      assert.equal(p.z, inquirySeat(i).z);
      assert.equal(p.job, null);
      assert.equal(r.voicePaths(p).length, 3);
      assert.equal(r.snapshot(p.id).phaseRemaining, 120);
    });
    const sab = crew.find((p) => p.saboteur)!;
    for (const p of crew) r.vote(p.id, sab.id);
    assert.equal(r.phase, 'ended');
    assert.equal(r.result?.cause, cause);
    assert.equal(r.result?.outcome, 'draw');
    assert.ok(!r.result?.description.includes('bottom'));
    r.returnToLobby(r.host);
    assert.equal(r.phase, 'lobby');
    for (const p of r.players.values()) p.ready = true;
    r.start(r.host);
    assert.ok([...r.players.values()].every((p) => p.yaw === 0 && p.pitch === 0));
    assert.ok([...r.players.values()].every((p) => !p.evacuated));
  }
});

test('real sinking still evacuates into launches; inquiry timeout preserves the recall cause', () => {
  const r = room();
  r.beginSinking();
  for (let t = 0; t < 41; t += 0.05) r.tick(0.05);
  assert.equal(r.phase, 'lifeboat');
  assert.ok([...r.players.values()].every((p) => p.evacuated));
  const q = room();
  q.beginInquiry('schedule');
  q.tick(120.1);
  assert.equal(q.phase, 'ended');
  assert.equal(q.result?.cause, 'schedule');
  assert.match(q.result!.description, /company dismissed/);
});

test('forecastle and aft flights start at the actual deck edge, without invalid edge-touching floor holes', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildTallShell(g, m);
  buildStairways(g, m);
  g.updateMatrixWorld(true);
  assert.ok(!DECK_OPENINGS.some((o) => o.id === 'fore' || o.id === 'aft'));
  for (const [id, boundary, side] of [
    ['deck-forecastle', BOAT_DECK_FRONT, -1],
    ['deck-poop', BOAT_DECK_BACK, 1],
  ] as const) {
    const s = STATIONS.find((s) => s.id === id)!;
    assert.equal(s.route![1].z, boundary);
    const structure = g.getObjectByName(id + '-structure')!;
    if (id === 'deck-forecastle') {
      assert.ok(structure.getObjectByName('external-stair-landing'));
      assert.ok(structure.getObjectByName('stair-support-column'));
    }
    let count = 0;
    structure.traverse((o) => {
      if (o.name !== 'stair-tread') return;
      count++;
      const bounds = new T.Box3().setFromObject(o);
      if (side < 0) assert.ok(bounds.max.z <= boundary * L + 1e-6);
      else assert.ok(bounds.min.z >= boundary * L - 1e-6);
    });
    assert.ok(count > 25);
    const deck = g.getObjectByName('boat-deck')!;
    const ray = new T.Raycaster(
      new T.Vector3(s.x * W, 2, (boundary - side * 0.1) * L),
      new T.Vector3(0, -1, 0),
    );
    assert.equal(ray.intersectObject(deck).length, 1, 'continuous upper landing');
    const bulkhead = g.children.find(
      (o) => o.name === 'closed-end-bulkhead' && Math.sign(o.position.z) === side,
    )!;
    const b = new T.Box3().setFromObject(bulkhead);
    assert.ok(b.min.y <= LEVEL_Y[2] * H);
    assert.ok(Math.abs(b.max.y) < 1e-6);
  }
});

test('structural wall runs have no duplicate coplanar overlapping intervals', () => {
  const walls = PLAN_WALLS.filter((w) => !w.prop);
  for (let i = 0; i < walls.length; i++)
    for (let j = i + 1; j < walls.length; j++) {
      const a = walls[i],
        b = walls[j],
        horizontal = a.w > a.d;
      if (a.level !== b.level || !!a.windows !== !!b.windows || b.w > b.d !== horizontal) continue;
      const fixed = horizontal ? 'z' : 'x',
        v = horizontal ? 'x' : 'z',
        n = horizontal ? 'w' : 'd',
        thick = horizontal ? 'd' : 'w';
      if (Math.abs(a[fixed] - b[fixed]) > 1e-6 || Math.abs(a[thick] - b[thick]) > 1e-6) continue;
      const overlap =
        Math.min(a[v] + a[n] / 2, b[v] + b[n] / 2) - Math.max(a[v] - a[n] / 2, b[v] - b[n] / 2);
      assert.ok(overlap <= 1e-6, JSON.stringify({ a, b }));
    }
});

test('the inquiry has its own enclosed room, ten places and an opaque floor rather than a launch', () => {
  const solo = new Room('HEARING10', 11);
  const p = solo.addPlayer('Tester', 'one');
  solo.start(p.id, { practice: true });
  solo.practiceAction(p.id, { verb: 'inquiry' });
  assert.equal(solo.phase, 'inquiry');
  assert.equal(p.evacuated, false);
  const g = buildInquiryRoom(m);
  g.updateMatrixWorld(true);
  assert.ok(g.getObjectByName('inquiry-table'));
  assert.ok(g.getObjectByName('company-desk'));
  assert.ok(g.getObjectByName('inquiry-ceiling'));
  let seats = 0;
  g.traverse((o) => {
    if (o.name === 'inquiry-chair-seat') seats++;
  });
  assert.equal(seats, 10);
  const ray = new T.Raycaster(new T.Vector3(0, 14, 6), new T.Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(g.getObjectByName('inquiry-floor')!).length > 0);
});
import { SinkingSections } from '../src/graphics/sinking';
test('company hearing visibility cannot be overwritten by the normal sinking renderer', () => {
  const source = new T.Group(),
    bow = new T.Group(),
    stern = new T.Group(),
    debris = new T.Group();
  const foam = new T.Points(
    new T.BufferGeometry().setAttribute('position', new T.BufferAttribute(new Float32Array(9), 3)),
    new T.PointsMaterial(),
  );
  const sections = Object.assign(Object.create(SinkingSections.prototype), {
    source,
    bow,
    stern,
    debris,
    foam,
    lights: new Map(),
    materials: m,
  }) as SinkingSections;
  for (const age of [null, 90, 130]) {
    sections.update(age, 1, true);
    for (const mesh of [source, bow, stern, debris, foam]) assert.equal(mesh.visible, false);
  }
  sections.update(null);
  assert.equal(source.visible, true);
  sections.update(90);
  assert.equal(source.visible, false);
  assert.equal(bow.visible, true);
  assert.equal(stern.visible, true);
});
