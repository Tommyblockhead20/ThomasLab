import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game';
import { naturalFailureChance, firingRate } from '../shared/watch-balance';
import { iceReport, assessReport } from '../shared/radio';
import { STATIONS } from '../shared/world';
import { boilerAction } from '../shared/boiler-controls';
function room(n = 5) {
  const r = new Room('BALANCE', 14);
  for (let i = 0; i < n; i++) r.addPlayer('Mate' + i, 's' + i).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
test('sustained high power affects machinery, ramps up, and responds to lubrication and cooling', () => {
  const r = room(),
    s = r.ship,
    m = r.machine('engines');
  s.throttle = 20;
  const base = naturalFailureChance(m, s, 100);
  s.throttle = 25;
  assert.equal(naturalFailureChance(m, s, 0), base);
  assert.ok(Math.abs(naturalFailureChance(m, s, 45) - base - 0.1) < 1e-8);
  assert.equal(naturalFailureChance(r.machine('compass'), s, 100), 0.16);
  s.auxiliary.lubrication = 0;
  s.auxiliary.vacuum = 0.2;
  assert.ok(naturalFailureChance(m, s, 45) > base + 0.18);
  s.throttle = 22.5;
  assert.ok(naturalFailureChance(m, s, 45) < base + 0.2);
});
test('five and six watches have less repetitive firing and local feed controls share auxiliary valve state', () => {
  const r = room(),
    p = [...r.players.values()][3],
    s = STATIONS.find((s) => s.id === 'boiler-a')!;
  Object.assign(p, { x: s.x, z: s.z, level: s.level });
  const action = boilerAction({ kind: 'feed', bank: 0 }, r.ship, [])!;
  r.action(p.id, action);
  assert.ok(Math.abs(r.ship.auxiliary.feedValves[0] - 0.65) < 1e-8);
  assert.equal(firingRate(5), 0.55);
  assert.equal(firingRate(6), 0.55);
  assert.equal(firingRate(7), 0.65);
  assert.equal(firingRate(9), 1);
});
test('compass develops a variable error gradually, recovers after repair, and never rotates the actual hull', () => {
  const r = room();
  r.failMachine('compass');
  const actual = r.ship.heading;
  r.simulateShip(1);
  assert.ok(Math.abs(r.compassError) > 0 && Math.abs(r.compassError) < 1);
  for (let i = 0; i < 600; i++) r.simulateShip(0.1);
  assert.ok(Math.abs(r.compassError) > 3.9 && Math.abs(r.compassError) <= 8);
  assert.equal(r.ship.heading, actual);
  r.machine('compass').fault = null;
  for (let i = 0; i < 120; i++) r.simulateShip(0.1);
  assert.ok(Math.abs(r.compassError) < 0.03);
});
test('wireless traffic contains addressed reports, other-ship traffic and older repeats without metadata leaking before decoding', () => {
  const r = room();
  for (let i = 0; i < 120; i++) r.generateTelegram();
  assert.ok(r.telegrams.some((t) => !t.report));
  assert.ok(r.telegrams.some((t) => t.report?.replaces));
  assert.ok(r.telegrams.some((t) => t.text?.includes('TO BALTIC')));
  for (const t of r.snapshot(r.host).telegrams) {
    assert.equal(t.text, undefined);
    assert.equal(t.report, undefined);
    assert.equal(t.urgent, false);
  }
});
test('a targeted clarification preserves its reference and reports actual grouped ice with transmitted uncertainty', () => {
  const r = room(),
    p = r.players.get(r.host)!;
  const first = r.generateTelegram(true);
  first.decoded = true;
  const s = STATIONS.find((s) => s.id === 'wireless')!;
  Object.assign(p, { x: s.x - 1, z: s.z, level: 0 });
  r.action(p.id, { station: s.id, verb: 'request', value: first.id });
  assert.equal(r.radioReplyTo, first.id);
  for (let i = 0; i < 162; i++) r.tick(0.05);
  const reply = r.telegrams.at(-1)!;
  assert.equal(reply.report?.replaces, first.id);
  assert.ok(reply.report!.count! >= 1);
  assert.ok(
    r.icebergs.some(
      (i) =>
        Math.abs(i.west - reply.report!.west) < reply.report!.radiusWest &&
        Math.abs(i.north - reply.report!.north) < reply.report!.radiusNorth,
    ),
  );
});
test('report assessment uses only the reported area, observed compass and speed; stopped ships get no invented ETA', () => {
  const r = iceReport(1852, 0, 0);
  const ship = { west: 0, north: 0, indicatedHeading: 270, speed: 20 };
  const a = assessReport(r, ship, 120);
  assert.ok(a.crossesCourse);
  assert.ok(a.minutes! > 1.9 && a.minutes! < 2.1);
  assert.equal(a.ageMinutes, 2);
  assert.equal(assessReport(r, { ...ship, speed: 0 }, 0).minutes, null);
  assert.equal(assessReport(r, { ...ship, indicatedHeading: 0 }, 0).crossesCourse, false);
});
