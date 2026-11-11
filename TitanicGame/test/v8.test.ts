import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game';
import { BALANCE, type Role } from '../shared/config';
import { advanceMotion, navigationWarnings } from '../shared/voyage';
import { firebed, setBeds } from '../shared/firing';
import { fogDensity, iceSightSignal } from '../shared/visibility';
import { nm, METRES_PER_NM, KNOT_IN_METRES_PER_SECOND } from '../shared/units';
import { STATIONS } from '../shared/world';

function advance(r: Room, seconds: number) {
  for (let t = 0; t < seconds - 1e-7; t += 0.05) r.tick(0.05);
}
function solo(role: Role = 'Boiler Operator') {
  const r = new Room('V8TEST', 87),
    p = r.addPlayer('Tester', 'one');
  r.start(p.id, { practice: true, paused: true, post: role, assistance: false });
  r.nextEvent = r.nextTelegram = Infinity;
  const act = (station: string, verb: string, value?: unknown) => {
    advance(r, 0.2);
    r.action(p.id, { station, verb, value });
  };
  return { r, p, act };
}
test('navigation uses nautical miles and the schedule/route allowances are halved', () => {
  assert.equal(nm(1852), '1.00 NM');
  assert.equal(KNOT_IN_METRES_PER_SECOND, 1852 / 3600);
  assert.equal(BALANCE.scheduleBudget, 95);
  assert.equal(BALANCE.scheduleUrgent, 60);
  assert.equal(BALANCE.scheduleWarning, 22.5);
  assert.equal(BALANCE.corridorHalfWidth, 225);
  assert.equal(BALANCE.routeWarningOffset, 150);
  assert.equal(BALANCE.routeHardLimit, 450);
  assert.equal(BALANCE.routeGraceSeconds, 90);
  const { r, p } = solo();
  r.practiceAction(p.id, { verb: 'demo', value: 'schedule' });
  advance(r, 22);
  assert.equal(navigationWarnings(r.ship).schedule, null);
  advance(r, 1);
  assert.equal(navigationWarnings(r.ship).schedule, 'caution');
  advance(r, 38);
  assert.equal(navigationWarnings(r.ship).schedule, 'urgent');
  advance(r, 35);
  assert.equal(r.inquiryCause, 'schedule');
});
test('turning depends on speed, keeps yaw momentum, loses speed progressively and has no heading clamp', () => {
  const base = new Room('MOTION', 1);
  const drive = (speed: number, rudder = 1) => {
    const s = base.newShip();
    s.speed = s.throttle = speed;
    s.rudderTarget = rudder;
    for (let t = 0; t < 80; t += 0.05) advanceMotion(s, 0.05);
    return s;
  };
  const slow = drive(10),
    fast = drive(20),
    straight = drive(20, 0),
    stopped = drive(0);
  assert.ok(fast.heading > slow.heading);
  assert.equal(stopped.heading, 270);
  assert.equal(stopped.yawRate, 0);
  assert.ok(fast.heading > 309, 'heading is no longer clamped');
  assert.ok(fast.speed < straight.speed - 1);
  assert.ok(fast.speed > 17);
  const rslow = slow.speed / slow.yawRate,
    rfast = fast.speed / fast.yawRate;
  assert.ok(rslow >= rfast * 0.98, 'slowing does not grant an unrealistically tiny turning circle');
  const heading = fast.heading;
  fast.rudderTarget = 0;
  advanceMotion(fast, 0.5);
  assert.ok(fast.heading > heading);
  assert.ok(fast.yawRate > 0);
  for (let t = 0; t < 35; t += 0.05) advanceMotion(fast, 0.05);
  assert.ok(Math.abs(fast.yawRate) < 0.01);
});
test('lookout elevation improves the same distant ice continuously and binoculars magnify it', () => {
  const range = 750,
    bridge = iceSightSignal(range, 24, false, 1, 20.08),
    nest = iceSightSignal(range, 24, false, 1, 28.13),
    lens = iceSightSignal(range, 24, true, 1, 28.13);
  assert.ok(nest.signal > bridge.signal);
  assert.ok(lens.signal > nest.signal * 3);
  assert.ok(fogDensity(1, 24) > fogDensity(1, 28.13));
  assert.ok(fogDensity(1, 24) < fogDensity(1, 20.08));
});
test('firing tools affect the targeted fire and require an open door; ash and clinker need different tools', () => {
  const { r, p, act } = solo();
  r.practiceAction(p.id, { verb: 'travel', value: 'boiler-a' });
  setBeds(r.ship, 0, [0.2, 0.5, 0.5], [0.6, 0.2, 0.2]);
  r.ship.clinker[0] = [0.7, 0.1, 0.1];
  assert.throws(
    () => r.action(p.id, { station: 'boiler-a', verb: 'tend', value: { zone: 0, tool: 'coal' } }),
    /door/,
  );
  act('boiler-a', 'door', { zone: 0, open: true });
  const before = firebed(r.ship, 0, 0).coal;
  act('boiler-a', 'tend', { zone: 0, tool: 'coal' });
  assert.ok(firebed(r.ship, 0, 0).coal > before + 0.15);
  assert.ok(firebed(r.ship, 0, 1).coal < 0.5);
  advance(r, 0.5);
  const clinker = r.ship.clinker[0][0];
  act('boiler-a', 'tend', { zone: 0, tool: 'rake' });
  assert.ok(firebed(r.ship, 0, 0).ash < 0.4);
  assert.ok(r.ship.clinker[0][0] >= clinker);
  advance(r, 0.5);
  const ash = firebed(r.ship, 0, 0).ash;
  act('boiler-a', 'tend', { zone: 0, tool: 'slice' });
  assert.ok(r.ship.clinker[0][0] < 0.5);
  assert.ok(firebed(r.ship, 0, 0).ash >= ash);
  advance(r, 0.5);
  assert.throws(() => r.action(p.id, { station: 'boiler-a', verb: 'stoke' }), /unavailable/);
});
test('spread firing makes more steam than dumping the same coal into one furnace', () => {
  function fire(pile: boolean) {
    const { r, p, act } = solo();
    r.practiceAction(p.id, { verb: 'travel', value: 'boiler-a' });
    setBeds(r.ship, 0, [0.32, 0.32, 0.32], [0, 0, 0]);
    r.ship.clinker[0].fill(0);
    for (let z = 0; z < 3; z++) act('boiler-a', 'door', { zone: z, open: true });
    for (let n = 0; n < 6; n++) {
      advance(r, 0.5);
      act('boiler-a', 'tend', { zone: pile ? 0 : n % 3, tool: 'coal' });
    }
    for (let z = 0; z < 3; z++) act('boiler-a', 'door', { zone: z, open: false });
    advance(r, 35);
    return r.ship.steam;
  }
  assert.ok(fire(false) > fire(true) + 3);
});
test('untrained crew can fire but use smaller loads and cannot spam strokes', () => {
  const { r, p, act } = solo('Captain');
  r.practiceAction(p.id, { verb: 'travel', value: 'boiler-a' });
  setBeds(r.ship, 0, [0.2, 0.2, 0.2], [0, 0, 0]);
  act('boiler-a', 'door', { zone: 0, open: true });
  const before = firebed(r.ship, 0, 0).coal;
  act('boiler-a', 'tend', { zone: 0, tool: 'coal' });
  assert.ok(firebed(r.ship, 0, 0).coal < before + 0.1);
  advance(r, 0.2);
  assert.throws(
    () => r.action(p.id, { station: 'boiler-a', verb: 'tend', value: { zone: 0, tool: 'coal' } }),
    /stroke/,
  );
});
test('wireless reports contain real broad ice areas and sighting times, hidden before decoding; updates work with held clocks', () => {
  const { r, p, act } = solo('Wireless Operator');
  r.practiceAction(p.id, { verb: 'demo', value: 'wireless' });
  const t = r.telegrams[0],
    ice = r.icebergs.find((i) => i.main)!;
  assert.ok(t.report);
  assert.ok(Math.abs(ice.west - t.report.west) < t.report.radiusWest);
  assert.ok(Math.abs(ice.north - t.report.north) < t.report.radiusNorth);
  assert.match(t.text!, /EXTENT.*NM SIGHTED/);
  assert.ok(!('report' in r.snapshot(p.id).telegrams[0]));
  act('wireless', 'decode', { id: t.id, text: t.text });
  assert.ok(r.snapshot(p.id).telegrams[0].report);
  act('wireless', 'request');
  assert.equal(r.snapshot(p.id).radio?.pending, true);
  advance(r, 8.1);
  assert.equal(r.telegrams.length, 2);
  assert.equal(r.snapshot(p.id).radio?.pending, false);
  assert.equal(r.elapsed, 0);
  assert.throws(() => r.action(p.id, { station: 'wireless', verb: 'request' }), /request/);
});
test('answered ship lines carry private crew messages and read-back reports that the bridge can plot', () => {
  const r = new Room('LINEV8', 9);
  for (let i = 0; i < 4; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  const [a, b, c] = [...r.players.values()],
    wireless = STATIONS.find((s) => s.id === 'wireless-phone')!,
    bridge = STATIONS.find((s) => s.id === 'bridge-phone')!;
  Object.assign(a, { x: wireless.x, z: wireless.z, level: wireless.level });
  Object.assign(b, { x: bridge.x, z: bridge.z, level: bridge.level });
  r.action(a.id, { station: wireless.id, verb: 'call', value: 'bridge' });
  r.action(b.id, { station: bridge.id, verb: 'answer' });
  advance(r, 0.2);
  r.action(a.id, { station: wireless.id, verb: 'message', value: 'ENGINE NEEDS LESS STEAM' });
  assert.match(r.snapshot(b.id).self.lineMessages[0].text, /LESS STEAM/);
  assert.equal(r.snapshot(c.id).self.lineMessages.length, 0);
  assert.ok(!JSON.stringify(r.snapshot(c.id)).includes('ENGINE NEEDS LESS STEAM'));
  const t = r.generateTelegram(true);
  t.decoded = true;
  advance(r, 0.2);
  r.action(a.id, { station: wireless.id, verb: 'relay', value: t.id });
  assert.ok(b.inventory.includes(`Telegram:${t.id}`));
  Object.assign(b, { x: -3.2, z: -17.8, level: 0 });
  advance(r, 0.2);
  r.action(b.id, { station: 'chart', verb: 'deliver' });
  assert.ok(r.snapshot(c.id).delivered[0].report);
});
