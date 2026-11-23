import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { STATIONS, canOccupy } from '../shared/world';
import { FIRING_RACK, COAL_BUNKERS } from '../shared/stokehold';
import { workSeconds, projectCourse, projectTrack } from '../shared/voyage';
import { serviceSeconds, FAULTS } from '../shared/machinery';
import { buildBoilerRoom } from '../src/graphics/interiors';
import { SinkingSections } from '../src/graphics/sinking';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../shared/navigation';
import type { ShipMaterials } from '../src/graphics/materials';
import { tendFire, firebed } from '../shared/firing';
import { boilerAction, boilerHint } from '../shared/boiler-controls';

function room() {
  const r = new Room('V12', 11);
  for (let n = 0; n < 4; n++) r.addPlayer('Mate' + n, 's' + n).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
function near(r: Room, id: string, station: string) {
  const s = STATIONS.find((s) => s.id === station)!;
  Object.assign(r.players.get(id)!, { x: s.x, z: s.z + 0.65, level: s.level });
}
function advance(r: Room, seconds: number) {
  for (let t = 0; t < seconds; t += 0.05) r.tick(0.05);
}
const paint = new T.MeshStandardMaterial();
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
  ].map((k) => [k, paint]),
) as ShipMaterials;

test('inspection is five seconds; servicing is shorter than repair at either skill level', () => {
  for (const role of ['Captain', 'Engineer'] as const) {
    assert.equal(workSeconds(role, 'inspect'), 5);
    assert.ok(serviceSeconds(role) < workSeconds(role, 'repair'));
  }
  assert.equal(serviceSeconds('Captain'), 20);
});
test('a good inspection persists, then a new fault invalidates it', () => {
  const r = room(),
    p = r.players.get(r.host)!;
  near(r, p.id, 'gauge');
  r.action(p.id, { station: 'gauge', verb: 'inspect' });
  advance(r, 5.1);
  assert.equal(r.snapshot(p.id).self.inspections.gauge, 'Operational');
  advance(r, 2);
  assert.equal(r.snapshot(p.id).self.inspections.gauge, 'Operational');
  r.failMachine('gauge');
  assert.equal(r.snapshot(p.id).self.inspections.gauge, undefined);
});
test('an open equipment view blocks natural failure and tampering, but protects no other machine', () => {
  const r = room(),
    [p, q] = [...r.players.values()];
  near(r, p.id, 'gauge');
  near(r, q.id, 'gauge');
  r.viewEquipment(p.id, 'gauge');
  r.rng.next = () => 0;
  r.rng.pick = (() => r.machine('gauge')) as typeof r.rng.pick;
  r.randomEvent();
  assert.equal(r.machine('gauge').fault, null);
  q.saboteur = true;
  assert.throws(() => r.action(q.id, { station: 'gauge', verb: 'sabotage' }), /watching/);
  r.rng.pick = (() => r.machine('engines')) as typeof r.rng.pick;
  r.randomEvent();
  assert.equal(r.machine('engines').fault, FAULTS.engines);
  r.viewEquipment(p.id, null);
  r.rng.pick = (() => r.machine('gauge')) as typeof r.rng.pick;
  r.randomEvent();
  assert.equal(r.machine('gauge').fault, FAULTS.gauge);
});
test('a lost view heartbeat expires and moving away releases protection', () => {
  const r = room(),
    p = r.players.get(r.host)!;
  near(r, p.id, 'gauge');
  r.viewEquipment(p.id, 'gauge');
  r.equipmentViews.get(p.id)!.until = Date.now() - 1;
  assert.equal(r.machineViewed('gauge'), false);
  r.viewEquipment(p.id, 'gauge');
  p.z = 20;
  assert.equal(r.machineViewed('gauge'), false);
});
test('there is one shared tool of each type and it must be returned before swapping', () => {
  const r = room(),
    [p, q] = [...r.players.values()];
  near(r, p.id, FIRING_RACK.id);
  near(r, q.id, FIRING_RACK.id);
  r.action(p.id, { station: FIRING_RACK.id, verb: 'equip', value: 'coal' });
  assert.equal(r.snapshot(q.id).firingTools.coal, p.name);
  r.elapsed += 1;
  assert.throws(
    () => r.action(q.id, { station: FIRING_RACK.id, verb: 'equip', value: 'coal' }),
    /has the shovel/,
  );
  r.elapsed += 1;
  assert.throws(
    () => r.action(p.id, { station: FIRING_RACK.id, verb: 'equip', value: 'slice' }),
    /Put your tool back/,
  );
  r.elapsed += 1;
  r.action(p.id, { station: FIRING_RACK.id, verb: 'return-tool', value: 'coal' });
  r.action(q.id, { station: FIRING_RACK.id, verb: 'equip', value: 'coal' });
  r.disconnect(q.id);
  assert.equal(r.snapshot(p.id).firingTools.coal, null);
});
test('large coal bunkers are usable but the boilers cannot conjure fuel or tools', () => {
  const r = room(),
    p = r.players.get(r.host)!;
  p.inventory.push('Firing tool:coal');
  near(r, p.id, COAL_BUNKERS[0].id);
  r.action(p.id, { station: COAL_BUNKERS[0].id, verb: 'scoop' });
  assert.ok(p.inventory.includes('Coal load'));
  assert.equal(
    boilerAction({ bank: 0, kind: 'coal', station: COAL_BUNKERS[0].id }, r.ship, p.inventory),
    null,
  );
  assert.equal(boilerHint({ bank: 0, kind: 'coal' }, r.ship, p.inventory), 'Shovel loaded');
  r.elapsed += 1;
  near(r, p.id, 'boiler-a');
  assert.throws(() => r.action(p.id, { station: 'boiler-a', verb: 'scoop' }), /unavailable/);
  assert.equal(canOccupy(FIRING_RACK), false);
});
test('an open fire door cools firing and drawing a fire removes coal with the rake', () => {
  const r = room(),
    a = r.newShip(),
    b = r.newShip();
  b.fireDoors.forEach((doors) => doors.fill(true));
  for (let n = 0; n < 15; n++) {
    r.ship = a;
    r.simulateShip(0.5);
    r.ship = b;
    r.simulateShip(0.5);
  }
  assert.ok(a.fireHeat[0] > b.fireHeat[0] + 0.1);
  const coal = firebed(b, 0, 0).coal;
  tendFire(b, 0, 0, 'rake', true, true);
  assert.ok(firebed(b, 0, 0).coal < coal - 0.1);
});
test('a valve fault develops a gradual steam leak and repair lets it subside', () => {
  const r = room();
  r.failMachine('valve');
  const initial = r.ship.steam;
  r.simulateShip(0.05);
  assert.ok(r.ship.steamLeak > 0 && r.ship.steamLeak < 0.002);
  assert.ok(r.ship.steam > initial - 0.2, 'no instantaneous pressure collapse');
  for (let t = 0; t < 50; t += 0.1) {
    r.ship.coal.fill(0.65);
    r.ship.ash.fill(0);
    r.simulateShip(0.1);
  }
  assert.ok(r.ship.steamLeak > 0.8);
  assert.ok(r.ship.steam < initial - 8);
  r.machine('valve').fault = null;
  for (let t = 0; t < 7; t += 0.1) r.simulateShip(0.1);
  assert.ok(r.ship.steamLeak < 0.001);
});
test('chart prediction reuses one trajectory without changing its curve', () => {
  const s = room().newShip();
  s.rudderTarget = 0.6;
  projectTrack(s)
    .slice(1)
    .forEach((p, n) => {
      const exact = projectCourse(s, (n + 1) * 8);
      assert.ok(Math.hypot(p.west - exact.west, p.north - exact.north) < 1e-6);
    });
});
test('boiler detail batching preserves geometry, shared supplies and sinking transforms', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  const parts = buildBoilerRoom(g, palette);
  assert.equal(parts.toolObjects.length, 3);
  assert.equal(
    parts.controls.filter((o) => o.userData.boilerControl.kind === 'coal').length,
    COAL_BUNKERS.length,
  );
  const batches: T.InstancedMesh[] = [];
  g.traverse((o) => {
    if (o instanceof T.InstancedMesh) batches.push(o);
  });
  assert.equal(
    batches.reduce((n, o) => n + o.count, 0),
    748,
  );
  assert.equal(batches.length, 50);
  const before = parts.fuelBeds[0] as T.InstancedMesh;
  const originalDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ createRadialGradient: () => ({ addColorStop() {} }), fillRect() {} }),
    }),
  } as unknown as Document;
  let sections: SinkingSections;
  try {
    sections = new SinkingSections(g, new T.Scene(), {
      ...palette,
      glow: new T.MeshStandardMaterial({ emissive: 0xffffff }),
    });
  } finally {
    globalThis.document = originalDocument;
  }
  sections.prepare();
  const after = sections.bow.children.find((o) => o.name === before.name) as T.InstancedMesh;
  assert.ok(after?.isInstancedMesh);
  assert.equal(after.count, before.count);
  assert.deepEqual(Array.from(after.instanceMatrix.array), Array.from(before.instanceMatrix.array));
});
