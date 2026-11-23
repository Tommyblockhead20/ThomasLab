import { passageExitView } from '../shared/crew-camera';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { ROLE_ORDER } from '../shared/config';
import { STATIONS, canOccupy, wallsBetween, roomAt, spawnFor, travelPoint } from '../shared/world';
import {
  auxiliaryAction,
  auxiliaryEngineEfficiency,
  auxiliarySteeringEfficiency,
  newAuxiliaries,
  stepAuxiliaries,
  wirelessPowered,
} from '../shared/auxiliary';
import { buildAuxiliaryMachinery } from '../src/graphics/auxiliary';
import { buildMachineryCeiling, buildTallShell } from '../src/graphics/liner';
import type { AuxiliaryControl } from '../shared/auxiliary';
import type { ShipMaterials } from '../src/graphics/materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
} from '../shared/navigation';

function crew(count = 7) {
  const r = new Room('V13', 5);
  for (let n = 0; n < count; n++) r.addPlayer('Mate' + n, 's' + n).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
function advance(r: Room, seconds: number, maintain = false) {
  for (let t = 0; t < seconds; t += 0.05) {
    if (maintain) {
      r.ship.coal.fill(0.65);
      r.ship.ash.fill(0);
      r.ship.clinker.forEach((c) => c.fill(0));
    }
    r.simulateShip(0.05);
  }
}
function near(r: Room, id: string, station: string) {
  const s = STATIONS.find((s) => s.id === station)!;
  const p = r.players.get(id)!;
  for (const dz of [0.6, 0.45, -0.6, 0.3]) {
    const at = { x: s.x, z: s.z + dz, level: s.level };
    if (canOccupy(at) && !wallsBetween(at, s)) {
      Object.assign(p, at);
      r.elapsed += 0.2;
      return p;
    }
  }
  throw new Error('No approach: ' + station);
}
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

test('lookout stays sixth, auxiliaries arrive seventh, and extra boiler tending arrives ninth', () => {
  assert.equal(ROLE_ORDER[5], 'Lookout');
  assert.equal(ROLE_ORDER[6], 'Auxiliary Engineer');
  assert.equal(ROLE_ORDER[8], 'Second Boiler Operator');
  for (const count of [4, 6, 7, 9, 10]) {
    const r = crew(count);
    assert.equal(
      [...r.players.values()].some((p) => p.role === 'Auxiliary Engineer'),
      count >= 7,
    );
    for (const p of r.players.values()) assert.ok(canOccupy(spawnFor(p.role!)), p.role!);
  }
});
test('cruise machinery remains stable long enough for rounds; executed high speed increases feedwater demand', () => {
  const normal = crew(4),
    fast = crew(4);
  fast.ship.throttle = 25;
  advance(normal, 100, true);
  advance(fast, 100, true);
  assert.ok(normal.ship.auxiliary.boilerWater.every((v) => v > 0.55 && v < 0.7));
  assert.ok(normal.ship.speed > 19);
  assert.ok(fast.ship.auxiliary.boilerWater[0] < normal.ship.auxiliary.boilerWater[0] - 0.1);
  assert.ok(normal.ship.auxiliary.voltage > 95);
});
test('pump failures develop in delivery before water and steam fall; standby feed restores flow without magical repair', () => {
  const r = crew();
  const a = r.ship.auxiliary;
  const before = a.boilerWater[0];
  r.failMachine('feedwater', true);
  advance(r, 2, true);
  assert.ok(a.boilerWater[0] > before - 0.01);
  advance(r, 70, true);
  const poor = a.feedFlow;
  assert.ok(a.boilerWater[0] < before - 0.07);
  a.feedPumps[1] = true;
  a.feedPumps[0] = false;
  a.feedValves.fill(0.9);
  advance(r, 40, true);
  assert.ok(a.feedFlow > poor * 2);
  assert.ok(a.boilerWater[0] > before - 0.07);
  assert.ok(r.machine('feedwater').fault, 'a workaround does not erase the fault');
});
test('underfeeding and overfeeding have recoverable consequences instead of exploding the boiler', () => {
  const low = crew(),
    high = crew(),
    normal = crew();
  low.ship.auxiliary.boilerWater.fill(0.06);
  high.ship.auxiliary.boilerWater.fill(1);
  low.ship.auxiliary.feedValves.fill(0);
  high.ship.auxiliary.feedValves.fill(0);
  advance(low, 40, true);
  advance(high, 40, true);
  advance(normal, 40, true);
  assert.ok(low.ship.steam < normal.ship.steam * 0.5);
  assert.ok(high.ship.steam < normal.ship.steam);
  assert.equal(low.ship.hull, 100);
  assert.equal(high.ship.hull, 100);
});
test('strainer cleaning requires a stopped pump, takes specialist time, and never completes on a restarted pump', () => {
  const r = crew(),
    p = near(r, r.host, 'feed-pump-1');
  p.role = 'Auxiliary Engineer';
  r.ship.auxiliary.strainers[0] = 0.8;
  assert.throws(() => r.action(p.id, { station: 'feed-pump-1', verb: 'clean-strainer' }), /Stop/);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'feed-pump-1', verb: 'pump', value: false });
  r.elapsed += 0.2;
  r.action(p.id, { station: 'feed-pump-1', verb: 'clean-strainer' });
  assert.equal(p.job!.duration, 5);
  r.ship.auxiliary.feedPumps[0] = true;
  r.completeJob(p, p.job!);
  p.job = null;
  assert.equal(r.ship.auxiliary.strainers[0], 0.8);
  r.ship.auxiliary.feedPumps[0] = false;
  p.role = 'Captain';
  r.elapsed += 0.2;
  r.action(p.id, { station: 'feed-pump-1', verb: 'clean-strainer' });
  assert.equal(p.job!.duration, 15);
  r.completeJob(p, p.job!);
  assert.equal(r.ship.auxiliary.strainers[0], 0);
});
test('condenser cooling and air leaks affect engine power even with healthy steam pressure', () => {
  const good = crew(),
    bad = crew();
  bad.ship.auxiliary.coolingValves.fill(0);
  advance(good, 80, true);
  advance(bad, 80, true);
  assert.ok(bad.ship.auxiliary.vacuum < 0.05);
  assert.ok(bad.ship.speed < good.ship.speed - 5);
  assert.ok(bad.ship.steam > 60);
  assert.ok(auxiliaryEngineEfficiency(bad.ship.auxiliary) < 0.6);
});
test('steam drives feed pumps even with all generators stopped; wireless reserve eventually runs out', () => {
  const r = crew();
  const a = r.ship.auxiliary;
  a.generators.fill(false);
  advance(r, 30, true);
  assert.ok(a.voltage < 5);
  assert.ok(a.feedFlow > 0.8);
  assert.ok(wirelessPowered(a));
  advance(r, 100, true);
  assert.equal(a.wirelessBattery, 0);
  assert.equal(wirelessPowered(a), false);
  a.generators[1] = true;
  advance(r, 25, true);
  assert.ok(a.voltage > 95);
  assert.ok(wirelessPowered(a));
});
test('a weak dynamo can be covered by the spare, and isolated feeders remain isolated after voltage recovers', () => {
  const r = crew(),
    a = r.ship.auxiliary;
  r.failMachine('dynamos');
  advance(r, 25, true);
  assert.ok(a.voltage < 50);
  a.circuits.wireless = false;
  a.generators[1] = true;
  advance(r, 25, true);
  assert.ok(a.voltage > 95);
  assert.equal(a.circuits.wireless, false);
  assert.ok(r.machine('dynamos').fault);
});
test('bearing oil neglect causes gradual heat and power loss, and lubrication needs cooling time', () => {
  const r = crew(),
    a = r.ship.auxiliary;
  a.lubrication = 0;
  advance(r, 80, true);
  assert.ok(a.bearingHeat > 0.8);
  const hot = a.bearingHeat;
  a.lubrication = 1;
  advance(r, 1, true);
  assert.ok(a.bearingHeat > 0.7);
  advance(r, 70, true);
  assert.ok(a.bearingHeat < hot - 0.4);
});
test('wheel cannot sabotage steering remotely; aft changeover bypasses a bound engine while preserving the fault', () => {
  const r = crew(),
    p = near(r, r.host, 'wheel');
  p.saboteur = true;
  assert.equal(STATIONS.find((s) => s.id === 'wheel')!.machine, undefined);
  assert.throws(() => r.action(p.id, { station: 'wheel', verb: 'sabotage' }), /unavailable/);
  near(r, p.id, 'steering');
  r.action(p.id, { station: 'steering', verb: 'sabotage' });
  r.completeJob(p, p.job!);
  p.job = null;
  assert.equal(auxiliarySteeringEfficiency(r.ship.auxiliary, true), 0.24);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'steering', verb: 'steering-set', value: 1 });
  assert.equal(auxiliarySteeringEfficiency(r.ship.auxiliary, true), 1);
  assert.ok(r.machine('steering').fault);
  assert.equal(roomAt(p), 'steering');
});
test('auxiliary controls enforce physical range, finite values, validated station indexes and shared access', () => {
  const r = crew(),
    p = r.players.get(r.host)!;
  assert.throws(
    () => r.action(p.id, { station: 'dynamo-1', verb: 'generator', value: false }),
    /closer/,
  );
  near(r, p.id, 'feed-valve-1');
  p.role = 'Lookout';
  r.action(p.id, { station: 'feed-valve-1', verb: 'feed', value: 0.8 });
  assert.equal(r.ship.auxiliary.feedValves[0], 0.8);
  r.elapsed += 0.2;
  assert.throws(
    () => r.action(p.id, { station: 'feed-valve-1', verb: 'feed', value: NaN }),
    /Invalid/,
  );
  r.elapsed += 0.2;
  assert.throws(
    () => r.action(p.id, { station: 'feed-valve-1', verb: 'pump', value: false }),
    /unavailable/,
  );
});
test('bridge orders remain orders in multiplayer, while the engine stand executes them', () => {
  const r = crew(),
    p = near(r, r.host, 'telegraph');
  r.action(p.id, { station: 'telegraph', verb: 'order', value: 10 });
  advance(r, 5, true);
  assert.equal(r.ship.throttle, 20);
  near(r, p.id, 'engines');
  r.action(p.id, { station: 'engines', verb: 'execute' });
  assert.equal(r.ship.throttle, 10);
  assert.ok(r.ship.speed > 18);
});
test('new physical controls have accessible standing space, distinct rooms and actual raycast targets', () => {
  const root = new T.Group();
  root.scale.set(W, H, L);
  const build = buildAuxiliaryMachinery(root, palette);
  root.updateMatrixWorld(true);
  const r = crew();
  let reached = 0;
  for (const control of build.controls) {
    const c = control.userData.auxiliaryControl as AuxiliaryControl;
    assert.ok(
      STATIONS.some((s) => s.id === c.station),
      c.station,
    );
    const target = new T.Box3().setFromObject(control).getCenter(new T.Vector3());
    const ray = new T.Raycaster(
      target.clone().add(new T.Vector3(0, 0, 1.8)),
      new T.Vector3(0, 0, -1),
      0,
      2.2,
    );
    const hit = ray.intersectObjects(build.root.children, true)[0];
    let object: T.Object3D | null = hit?.object ?? null;
    while (object && !object.userData.auxiliaryControl) object = object.parent;
    assert.equal(object?.userData.auxiliaryControl.station, c.station, c.station + ':' + c.verb);
    assert.equal(object?.userData.auxiliaryControl.verb, c.verb, c.station + ':' + c.verb);
    const eye = target.clone().add(new T.Vector3(0, 0, 1.8));
    const station = STATIONS.find((s) => s.id === c.station)!;
    assert.ok(
      canOccupy({ x: eye.x / W, z: eye.z / L, level: station.level }),
      c.station + ' approach',
    );
    reached++;
  }
  assert.ok(reached >= 20);
  build.update(r.ship, 2);
  assert.equal(roomAt(STATIONS.find((s) => s.id === 'dynamo-1')!), 'dynamo');
  assert.equal(roomAt(STATIONS.find((s) => s.id === 'feed-pump-1')!), 'auxiliary');
});
test('aft ladder passes through real ceiling and deck holes with its camera clear of the rungs and casing', () => {
  const g = new T.Group();
  g.scale.set(W, H, L);
  buildTallShell(g, palette);
  buildMachineryCeiling(g, palette);
  const build = buildAuxiliaryMachinery(g, palette);
  g.updateMatrixWorld(true);
  const ladder = STATIONS.find((s) => s.id === 'engine-steering')!;
  for (let n = 2; n < 99; n++) {
    const p = travelPoint(ladder, n / 100),
      eye = new T.Vector3(p.x * W, p.y * H + 1.65, p.z * L);
    const ray = new T.Raycaster(eye, new T.Vector3(0, 1, 0), 0, 0.2);
    assert.equal(ray.intersectObjects(g.children, true).length, 0, 'headroom at ' + n);
  }
  assert.ok(build.root.children.length > 0);
});

test('aft climb exits into clear room space and turns the camera toward its machinery', () => {
  const r = crew(),
    p = near(r, r.host, 'engine-steering');
  const passage = STATIONS.find((s) => s.id === 'engine-steering')!;
  r.action(p.id, { station: passage.id, verb: 'travel' });
  r.completeJob(p, p.job!);
  p.job = null;
  assert.equal(p.level, 2);
  assert.ok(canOccupy(p));
  assert.equal(roomAt(p), 'steering');
  assert.equal(p.yaw, 2.8);
  assert.equal(p.input.yaw, p.yaw);
  assert.ok(p.x > -1, 'exit steps away from the ladder casing');
});

test('client landing orientation honors the passage exit rather than overwriting it with the last sideways step', () => {
  const exit = passageExitView(2.8, Math.PI / 2, 0.2, 0.1, 0.1);
  assert.deepEqual(exit, { yaw: 2.8, pitch: 0 });
  assert.deepEqual(passageExitView(undefined, 0.5, 0.2, 0.1, 0.1), {
    yaw: 0.6,
    pitch: 0.30000000000000004,
  });
  const p = STATIONS.find((s) => s.id === 'engine-steering')!.destination!;
  const steering = STATIONS.find((s) => s.id === 'steering')!;
  const dx = (steering.x - p.x) * W,
    dz = (steering.z - p.z) * L;
  assert.ok((Math.sin(exit.yaw) * dx - Math.cos(exit.yaw) * dz) / Math.hypot(dx, dz) > 0.99);
});
