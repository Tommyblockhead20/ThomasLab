import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { stepPlant, steamPsi } from '../shared/plant';
import { boilerAction, visibleClinker } from '../shared/boiler-controls';
import { STATIONS } from '../shared/world';
import { buildBoilerRoom } from '../src/graphics/interiors';
import type { ShipMaterials } from '../src/graphics/materials';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_HEIGHT_SCALE as H,
  SHIP_LENGTH_SCALE as L,
} from '../shared/navigation';
import { LEVEL_Y } from '../shared/layout';

function room() {
  const r = new Room('V11', 14),
    p = r.addPlayer('Test', 's');
  r.start(p.id, { practice: true, post: 'Boiler Operator', paused: true, assistance: false });
  r.practiceAction(p.id, { verb: 'travel', value: 'boiler-a' });
  return { r, p };
}
function maintain(ship: ReturnType<Room['newShip']>) {
  ship.coal.fill(0.65);
  ship.ash.fill(0);
  ship.clinker.forEach((a) => a.fill(0));
}
test('boiler pressures respond independently and isolated shells cannot power the header', () => {
  const { r } = room(),
    s = r.ship;
  s.fires[0] = 0;
  s.boilerConnected[0] = false;
  for (let n = 0; n < 50; n++) {
    maintain(s);
    stepPlant(s, 1);
  }
  assert.ok(steamPsi(s.boilerPressure[0]) < 3);
  assert.ok(steamPsi(s.boilerPressure[1]) > 190);
  assert.ok(s.steam < s.boilerPressure[1]);
  s.boilerConnected.fill(false);
  for (let n = 0; n < 30; n++) stepPlant(s, 1);
  assert.ok(s.steam < 0.01);
  assert.ok(s.boilerPressure[1] > 65, 'closed stop valves do not extinguish fires');
});
test('safety valves open, manual easing expires, and reducing draught cools the shell', () => {
  const { r, p } = room(),
    s = r.ship;
  s.boilerPressure[0] = 85;
  stepPlant(s, 0.05);
  assert.equal(s.safetyLifted[0], true);
  const before = s.boilerPressure[0];
  r.action(p.id, { station: 'boiler-a', verb: 'ease' });
  s.fires[0] = 0;
  for (let n = 0; n < 70; n++) stepPlant(s, 0.1);
  assert.equal(s.reliefUntil[0], 0);
  assert.ok(s.boilerPressure[0] < before - 10);
  assert.equal(s.safetyLifted[0], false);
});
test('the main steam valve actually reduces engine supply and revolutions', () => {
  const { r } = room(),
    s = r.ship;
  s.mainSteamValve = 0;
  for (let n = 0; n < 40; n++) stepPlant(s, 0.5);
  assert.ok(s.steam < 0.1);
  assert.ok(s.engineRevs < 2);
  assert.ok(s.boilerPressure.every((p) => p > 65));
});
test('connected boilers exchange steam, while shut stop valves preserve a separate pressure', () => {
  const { r } = room(),
    s = r.ship;
  s.boilerPressure = [20, 76, 76, 76];
  s.boilerConnected[3] = false;
  const before = s.boilerPressure[0];
  stepPlant(s, 1);
  assert.ok(s.boilerPressure[0] > before + 10, 'open branches equalise through the header');
  assert.ok(s.boilerPressure[3] > s.boilerPressure[0] + 10);
});
test('rear fire access is usable and remote boiler operation is rejected', () => {
  const { r, p } = room(),
    s = STATIONS.find((s) => s.id === 'boiler-a')!;
  p.z = s.z - 6.4 / L - 0.45;
  p.x = s.x;
  r.action(p.id, { station: s.id, verb: 'door', value: { zone: 1, open: true } });
  assert.equal(r.ship.fireDoors[0][1], true);
  r.tick(1);
  p.z = 16;
  assert.throws(() => r.action(p.id, { station: s.id, verb: 'ease' }), /closer/);
});
test('physical shovelling requires a tool and a fresh load, while slice strokes clear visible clinker', () => {
  const { r, p } = room();
  const act = (verb: string, value?: unknown) => {
    r.tick(1);
    r.action(p.id, { station: 'boiler-a', verb, value });
  };
  act('door', { zone: 0, open: true });
  assert.throws(() => act('tend', { zone: 0, tool: 'coal', physical: true }), /tool/);
  act('equip', 'coal');
  assert.throws(() => act('tend', { zone: 0, tool: 'coal', physical: true }), /Fill/);
  act('scoop');
  act('tend', { zone: 0, tool: 'coal', physical: true });
  assert.ok(!p.inventory.includes('Coal load'));
  act('equip', 'slice');
  r.ship.clinker[0][0] = 0.75;
  for (let n = 0; n < 3; n++) act('tend', { zone: 0, tool: 'slice', physical: true });
  assert.equal(visibleClinker(r.ship.clinker[0][0]), 0);
  assert.equal(visibleClinker(0.001), 0, 'trace accumulation does not draw an everlasting lump');
});
test('execute answers the current bridge order independently of stale manual controls', () => {
  const { r, p } = room(),
    s = STATIONS.find((s) => s.id === 'engines')!;
  Object.assign(p, { x: s.x, z: s.z + 0.6, level: s.level });
  r.ship.order = 25;
  r.ship.throttle = 10;
  r.action(p.id, { station: s.id, verb: 'execute', value: 10 });
  assert.equal(r.ship.throttle, 25);
  assert.match(r.notice, /answering/);
  r.tick(1);
  r.ship.order = 0;
  r.action(p.id, { station: s.id, verb: 'execute' });
  assert.equal(r.ship.throttle, 0);
});
test('standard first ice is three to six minutes away at passage speeds, with an earlier experienced setting', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const a = new Room('A', seed),
      p = a.addPlayer('Test', 's');
    a.start(p.id, { practice: true });
    assert.ok(a.encounterAt >= 225 && a.encounterAt <= 360);
    const b = new Room('B', seed),
      q = b.addPlayer('Test', 's');
    b.start(q.id, { practice: true, difficulty: 'experienced' });
    assert.ok(b.encounterAt >= 110 && b.encounterAt <= 180);
    assert.ok(b.encounterAt < a.encounterAt);
  }
});
test('physical model targets exist on every boiler and an aimed front door wins over the shell', () => {
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
  const g = new T.Group();
  g.scale.set(W, H, L);
  const b = buildBoilerRoom(g, m);
  g.updateMatrixWorld(true);
  for (let bank = 0; bank < 4; bank++) {
    for (const kind of [
      'door',
      'fire',
      'ash',
      'tool',
      'coal',
      'draught',
      'stop',
      'relief',
      'gauge',
    ])
      assert.ok(
        b.controls.some(
          (o) => o.userData.boilerControl.bank === bank && o.userData.boilerControl.kind === kind,
        ),
        `${bank}:${kind}`,
      );
  }
  const s = STATIONS.find((s) => s.id === 'boiler-a')!;
  const origin = new T.Vector3(s.x * W, LEVEL_Y[-1] * H + 1.7, s.z * L + 2);
  const target = new T.Vector3(s.x * W, LEVEL_Y[-1] * H + 1.25, s.z * L);
  const hits = new T.Raycaster(origin, target.sub(origin).normalize(), 0, 4).intersectObjects(
    [...b.controls, ...b.occluders],
    true,
  );
  let o: T.Object3D | null = hits[0]?.object;
  while (o && !o.userData.boilerControl) o = o.parent;
  assert.equal(o?.userData.boilerControl.kind, 'door');
  assert.equal(o?.userData.boilerControl.bank, 0);
  assert.equal(boilerAction({ bank: 0, kind: 'stop' }, room().r.ship, [])?.value, false);
});
