import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Room } from '../server/game';
import { BALANCE, ROLE_ORDER } from '../shared/config';
import { canOccupy, STATIONS, BOAT_DECK_FRONT, BOAT_DECK_BACK } from '../shared/world';
import { HULL_BOW, SEA_LEVEL, SHIP_LENGTH_SCALE as L } from '../shared/navigation';
import { navigationWarnings, projectCourse, workSeconds } from '../shared/voyage';
import { BREAK_Z, sinkingPose } from '../shared/sinking';
import { distanceAtWarning, iceSightSignal } from '../shared/visibility';
import { cutGeometry } from '../src/graphics/sinking';

function room(solo = false) {
  const r = new Room('CROSS1', 1234);
  for (let i = 0; i < (solo ? 1 : 4); i++) r.addPlayer('Crew ' + i, 's' + i).ready = true;
  r.start(r.host, { practice: solo, paused: solo });
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
function advance(r: Room, seconds: number) {
  for (let t = 0; t < seconds - 1e-8; t += 0.05) r.tick(Math.min(0.05, seconds - t));
}
function emptySea(r: Room) {
  r.icebergs = [];
  r.mainResolved = true;
}

test('both outside promenades remain clear from the bridge wings past all four funnel islands', () => {
  for (const x of [-6.25, 6.25])
    for (let z = BOAT_DECK_FRONT + 0.7; z < BOAT_DECK_BACK - 0.3; z += 0.1)
      assert.ok(canOccupy({ x, z, level: 0 }), `lane ${x}, ${z}`);
});
test('every crew assignment can operate another department, with meaningful specialist work times', () => {
  const r = room(true),
    p = r.players.get(r.host)!;
  const wheel = STATIONS.find((s) => s.id === 'wheel')!,
    engine = STATIONS.find((s) => s.id === 'engines')!,
    boiler = STATIONS.find((s) => s.id === 'boiler-a')!;
  for (const role of ROLE_ORDER) {
    p.role = role;
    Object.assign(p, { x: wheel.x, z: wheel.z + 0.6, level: wheel.level });
    r.elapsed += 0.2;
    r.action(p.id, { station: wheel.id, verb: 'rudder', value: 0.3 });
    assert.equal(r.ship.rudderTarget, 0.3);
    Object.assign(p, { x: engine.x, z: engine.z + 0.6, level: engine.level });
    r.elapsed += 0.2;
    r.action(p.id, { station: engine.id, verb: 'throttle', value: 999 });
    assert.equal(r.ship.throttle, 25);
    r.elapsed += 0.2;
    r.machine('engines').fault = 'Bearing vibration';
    r.action(p.id, { station: engine.id, verb: 'repair' });
    assert.equal(p.job!.duration, role.includes('Engineer') ? 9 : 30);
    advance(r, p.job!.duration + 0.1);
    assert.equal(p.job, null);
    Object.assign(p, { x: boiler.x, z: boiler.z + 0.6, level: boiler.level });
    r.elapsed += 0.2;
    r.ship.coal[0] = 0.2;
    r.ship.bedBalance[0].fill(0);
    r.action(p.id, { station: boiler.id, verb: 'door', value: { zone: 0, open: true } });
    advance(r, 0.2);
    const fuel = r.ship.coal[0];
    r.action(p.id, { station: boiler.id, verb: 'tend', value: { zone: 0, tool: 'coal' } });
    assert.ok(r.ship.coal[0] > fuel + (role.includes('Boiler') ? 0.05 : 0.025));
  }
  assert.ok(workSeconds('Wireless Operator', 'decode') < workSeconds('Captain', 'decode'));
  assert.equal(r.newShip().order, 20);
  assert.equal(r.newShip().throttle, 20);
});
test('parked running ships get persistent schedule warnings, recall and an inquiry; 25 knots recovers delay', () => {
  const r = room();
  emptySea(r);
  r.ship.speed = r.ship.throttle = r.ship.order = 0;
  advance(r, 46);
  assert.equal(navigationWarnings(r.ship).schedule, 'caution');
  assert.equal(r.phase, 'voyage');
  advance(r, 75);
  assert.equal(navigationWarnings(r.ship).schedule, 'urgent');
  advance(r, 70);
  assert.equal(r.phase, 'inquiry');
  assert.equal(r.inquiryCause, 'schedule');
  assert.equal(r.sinkingElapsed, null);
  assert.equal(r.result, null);
  r.resolveVote();
  assert.equal(r.result!.revealed, true);
  assert.equal(r.result!.cause, 'schedule');
  const catchup = room();
  emptySea(catchup);
  catchup.ship.delay = 90;
  catchup.ship.speed = catchup.ship.throttle = 25;
  catchup.ship.fires = [0.85, 0.85];
  advance(catchup, 120);
  assert.ok(catchup.ship.delay < 65);
  assert.equal(catchup.phase, 'voyage');
});
test('route warnings allow a return, but persistent or extreme deviations recall the crossing for a vote', () => {
  const r = room();
  emptySea(r);
  r.ship.speed = r.ship.throttle = 20;
  r.ship.north = BALANCE.corridorHalfWidth + 10;
  advance(r, 40);
  assert.equal(navigationWarnings(r.ship).route, 'urgent');
  assert.ok(r.ship.offRouteTime > 39);
  assert.equal(r.phase, 'voyage');
  r.ship.north = BALANCE.corridorHalfWidth - 50;
  r.tick(0.05);
  assert.equal(r.ship.offRouteTime, 0);
  assert.equal(navigationWarnings(r.ship).route, 'caution');
  r.ship.north = BALANCE.corridorHalfWidth + 10;
  advance(r, BALANCE.routeGraceSeconds + 1);
  assert.equal(r.phase, 'inquiry');
  assert.equal(r.inquiryCause, 'route');
  assert.equal(r.sinkingElapsed, null);
  const sab = [...r.players.values()].find((p) => p.saboteur)!;
  for (const p of r.players.values()) r.vote(p.id, sab.id);
  assert.equal(r.result!.outcome, 'draw');
  assert.equal(r.result!.cause, 'route');
  const extreme = room();
  emptySea(extreme);
  extreme.ship.north = BALANCE.routeHardLimit + 1;
  extreme.tick(0.05);
  assert.equal(extreme.inquiryCause, 'route');
});
test('major contact gives the ten-second order, thirty-second boarding window and continued sinking during voting', () => {
  const r = room();
  emptySea(r);
  r.ship.speed = 20;
  r.addIce(HULL_BOW + 45, 0, 46, true);
  r.checkIcebergs();
  assert.equal(r.phase, 'sinking');
  assert.equal(r.sinkingElapsed, 0);
  assert.equal(r.ship.order, 0);
  const p = r.players.get(r.host)!,
    start = p.x;
  r.setInput(p, { forward: 0, right: 1, yaw: 0, pitch: 0, seq: 1, sprint: false, zoom: 0 });
  advance(r, 0.15);
  assert.ok(p.x > start);
  r.setInput(p, { forward: 0, right: 0, yaw: 0, pitch: 0, seq: 2, sprint: false, zoom: 0 });
  advance(r, 9.8);
  assert.notEqual(r.notice, 'Get to the lifeboats');
  advance(r, 0.1);
  assert.equal(r.notice, 'Get to the lifeboats');
  const boat = STATIONS.find((s) => s.kind === 'lifeboat')!;
  Object.assign(p, { x: 6.25 * Math.sign(boat.x), z: boat.z, level: 0 });
  r.action(p.id, { station: boat.id, verb: 'board' });
  assert.equal(p.evacuated, true);
  assert.equal(r.phase, 'sinking');
  advance(r, 30);
  assert.equal(r.phase, 'lifeboat');
  assert.ok([...r.players.values()].every((p) => p.evacuated));
  assert.ok(r.sinkingElapsed! < 41);
  advance(r, 46);
  assert.equal(r.phase, 'lifeboat');
  assert.ok(sinkingPose(r.sinkingElapsed!).broken);
  const age = r.sinkingElapsed!;
  r.resolveVote();
  r.tick(12);
  assert.ok(r.sinkingElapsed! > age + 11.9, 'the background does not freeze when votes finish');
});
test('the first route warning leaves enough turning room to return before recall', () => {
  const r = room();
  emptySea(r);
  r.ship.rudderTarget = 1;
  while (r.ship.north < BALANCE.routeWarningOffset) {
    r.machines.find((m) => m.id === 'engines')!.condition = 100; // Maintained propulsion isolates route recovery.
    r.ship.coal.fill(0.7);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    r.tick(0.05);
  }
  r.ship.rudderTarget = -1;
  let outside = false,
    returned = false;
  for (let i = 0; i < 20 * 200; i++) {
    r.machines.find((m) => m.id === 'engines')!.condition = 100; // Maintained propulsion isolates route recovery.
    r.ship.coal.fill(0.7);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    r.tick(0.05);
    if (r.ship.north > BALANCE.corridorHalfWidth) outside = true;
    else if (outside) {
      returned = true;
      break;
    }
  }
  assert.ok(returned);
  assert.equal(r.phase, 'voyage');
  assert.ok(r.ship.offRouteTime < BALANCE.routeGraceSeconds);
});
test('new hazards anticipate held turns once and remain fixed after subsequent course changes', () => {
  const r = room(true),
    p = r.players.get(r.host)!;
  r.ship.rudderTarget = 1;
  const projected = projectCourse(r.ship, 70);
  r.practiceAction(p.id, { verb: 'ice' });
  r.icebergs = r.icebergs.filter((i) => i.main);
  const ice = r.icebergs[0],
    position = { west: ice.west, north: ice.north };
  assert.ok(projected.north > 50);
  assert.ok(ice.north > 50);
  advance(r, 75);
  assert.equal(ice.hit, true);
  assert.deepEqual({ west: ice.west, north: ice.north }, position);
  const avoid = room(true),
    other = avoid.players.get(avoid.host)!;
  avoid.ship.rudderTarget = 1;
  avoid.practiceAction(other.id, { verb: 'ice' });
  avoid.icebergs = avoid.icebergs.filter((i) => i.main);
  const before = { west: avoid.icebergs[0].west, north: avoid.icebergs[0].north };
  avoid.ship.rudderTarget = -1;
  advance(avoid, 90);
  assert.equal(avoid.icebergs[0].hit, false);
  assert.deepEqual({ west: avoid.icebergs[0].west, north: avoid.icebergs[0].north }, before);
});
test('clear-weather sight calibration resolves typical ice near 30 seconds at the wheel and 45 with lookout binoculars', () => {
  const threshold = 4.8;
  function earliest(ahead: number, zoom: boolean) {
    for (let seconds = 70; seconds >= 10; seconds -= 0.1)
      if (iceSightSignal(distanceAtWarning(seconds, ahead), 24, zoom).signal >= threshold)
        return seconds;
    return 0;
  }
  assert.ok(Math.abs(earliest(19.2 * L, false) - 30) < 3);
  assert.ok(Math.abs(earliest(31 * L, true) - 45) < 3);
  const point = new T.Vector3(210, 20, -650),
    range = point.length();
  for (const yaw of [0, 0.4, 0.8, 1.3])
    assert.ok(
      Math.abs(
        point
          .clone()
          .applyAxisAngle(new T.Vector3(0, 1, 0), yaw)
          .length() - range,
      ) < 1e-8,
      'radial extinction is unchanged at the edge of the screen',
    );
});
test('breakup is continuous, the stern settles before rising, and both hull sections finally submerge', () => {
  const a = sinkingPose(85 - 1e-5),
    b = sinkingPose(85);
  for (const key of ['heave', 'pitch', 'z'] as const)
    assert.ok(Math.abs(a.stern[key] - b.stern[key]) < 1e-4, key);
  assert.ok(Math.abs(sinkingPose(98).stern.pitch) < Math.abs(b.stern.pitch));
  assert.ok(Math.abs(sinkingPose(119).stern.pitch) > 0.8);
  for (const p of [sinkingPose(145).bow, sinkingPose(145).stern])
    assert.ok(
      p.heave + Math.abs(Math.sin(p.pitch)) * 34 * L + Math.abs(Math.cos(p.pitch)) * 32 < SEA_LEVEL,
    );
});
test('split hull triangles preserve surface area and UVs without overlap or holes along the cut', () => {
  const original = new T.BoxGeometry(2, 2, 2).translate(0, 0, BREAK_Z),
    bow = cutGeometry(original, false),
    stern = cutGeometry(original, true);
  let area = 0;
  for (const [geometry, side] of [
    [bow, -1],
    [stern, 1],
  ] as const) {
    const p = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv');
    assert.equal(p.count, uv.count);
    for (let i = 0; i < p.count; i++) assert.ok((p.getZ(i) - BREAK_Z) * side >= -1e-6);
    for (let i = 0; i < p.count; i += 3) {
      const a = new T.Vector3().fromBufferAttribute(p, i),
        b = new T.Vector3().fromBufferAttribute(p, i + 1),
        c = new T.Vector3().fromBufferAttribute(p, i + 2);
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
  }
  assert.ok(Math.abs(area - 24) < 1e-6);
});
test('solo recall scenarios isolate their warning and restoration clears it', () => {
  const r = room(true),
    p = r.players.get(r.host)!;
  r.practiceAction(p.id, { verb: 'schedule' });
  r.tick(0.05);
  assert.equal(navigationWarnings(r.ship).schedule, 'urgent');
  assert.equal(navigationWarnings(r.ship).route, null);
  r.practiceAction(p.id, { verb: 'route' });
  r.tick(0.05);
  assert.equal(navigationWarnings(r.ship).schedule, null);
  assert.equal(navigationWarnings(r.ship).route, 'urgent');
  r.practiceAction(p.id, { verb: 'restore' });
  r.tick(0.05);
  assert.equal(navigationWarnings(r.ship).route, null);
  assert.equal(navigationWarnings(r.ship).schedule, null);
});
