import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game';
import { ROLE_ORDER } from '../shared/config';
import { METRES_PER_NM as NM } from '../shared/units';
import { STATIONS, canOccupy, spawnFor, wallsBetween, moveWithCollision } from '../shared/world';
import { BRIDGE, DECK_FITTINGS } from '../shared/layout';
import { readChartMark } from '../shared/chart';

function crew(count = 4, seed = 5) {
  const r = new Room('V9TEST', seed);
  for (let i = 0; i < count; i++) r.addPlayer('Crew' + i, 's' + i).ready = true;
  r.start(r.host);
  r.nextEvent = r.nextTelegram = Infinity;
  return r;
}
function near(r: Room, id: string, station: string) {
  const p = r.players.get(id)!,
    s = STATIONS.find((s) => s.id === station)!;
  Object.assign(p, { x: s.x, z: s.z - 0.6, level: s.level });
  r.elapsed += 0.2;
  return p;
}
const estimate = {
  kind: 'ice',
  points: [{ west: 500, north: 30 }],
  radius: 0,
  label: 'Suspected contact',
  source: 'Lookout',
  confidence: 'medium',
};

test('v9 watches add wireless, lookout, second boiler, helm, second engineer and second wireless in order', () => {
  const expected = [
    'Captain',
    'Deck Officer',
    'Engineer',
    'Boiler Operator',
    'Wireless Operator',
    'Lookout',
    'Second Boiler Operator',
    'Helmsman',
    'Second Engineer',
    'Second Wireless Operator',
  ];
  assert.deepEqual([...ROLE_ORDER], expected);
  for (let count = 4; count <= 10; count++) {
    const r = crew(count);
    assert.deepEqual(
      [...r.players.values()].map((p) => p.role).sort(),
      expected.slice(0, count).sort(),
    );
    for (const p of r.players.values()) assert.ok(canOccupy(spawnFor(p.role!)));
    assert.equal(r.snapshot(r.host).crewSize, count);
  }
});

test('smaller crews consume less coal and collect less ash without removing the penalty for poor firing', () => {
  const a = crew(4),
    b = crew(7);
  for (let n = 0; n < 1200; n++) {
    a.simulateShip(0.05);
    b.simulateShip(0.05);
  }
  assert.ok(a.ship.coal[0] > b.ship.coal[0]);
  assert.ok(a.ship.ash[0] < b.ship.ash[0]);
  a.ship.fires.fill(0);
  for (let n = 0; n < 1200; n++) a.simulateShip(0.05);
  assert.ok(a.ship.steam < 5);
  assert.ok(a.ship.speed < 15);
});

test('shared estimates start empty, require physical chart access, and can be moved or erased by another crewmate', () => {
  const r = crew(),
    [a, b] = [...r.players.values()];
  assert.deepEqual(r.snapshot(a.id).chartMarks, []);
  Object.assign(a, { x: 0, z: 12, level: -1 });
  assert.throws(
    () => r.action(a.id, { station: 'chart', verb: 'mark', value: estimate }),
    /closer/,
  );
  near(r, a.id, 'chart');
  r.action(a.id, { station: 'chart', verb: 'mark', value: estimate });
  const m = r.snapshot(b.id).chartMarks[0];
  assert.equal(m.label, estimate.label);
  assert.equal(m.by, a.name);
  // A player's suspicion need not match the true ice field.
  assert.deepEqual(m.points, estimate.points);
  near(r, b.id, 'chart');
  r.action(b.id, { station: 'chart', verb: 'move', value: { id: m.id, west: 50, north: -20 } });
  assert.deepEqual(r.snapshot(a.id).chartMarks[0].points, [{ west: 550, north: 10 }]);
  r.elapsed += 0.2;
  r.action(b.id, { station: 'chart', verb: 'erase', value: m.id });
  assert.equal(r.chartMarks.length, 0);
});

test('chart rejects malformed, oversized or non-finite drawing payloads and copies only allowed coordinates', () => {
  for (const v of [
    null,
    { ...estimate, points: [] },
    { ...estimate, points: Array(65).fill({ west: 0, north: 0 }) },
    { ...estimate, points: [{ west: Infinity, north: 0 }] },
    { ...estimate, radius: NaN },
    { ...estimate, confidence: 'certain' },
    { ...estimate, points: [{ west: NM * 11, north: 0 }] },
  ])
    assert.throws(() => readChartMark(v, { west: 0, north: 0 }));
  const a = readChartMark(
    { ...estimate, points: [{ west: 4, north: 7, main: true }] },
    { west: 0, north: 0 },
  );
  assert.deepEqual(a.points, [{ west: 4, north: 7 }]);
});

test('filing a decoded report does not automatically reveal or plot actual iceberg positions', () => {
  const r = crew(),
    p = near(r, r.host, 'chart'),
    t = r.generateTelegram(true);
  t.decoded = true;
  p.inventory.push('Telegram:' + t.id);
  r.action(p.id, { station: 'chart', verb: 'deliver' });
  assert.ok(r.snapshot(p.id).delivered.length);
  assert.equal(r.snapshot(p.id).chartMarks.length, 0);
});

test('captain heading orders and helm read-back share state without taking away steering access', () => {
  const r = crew(),
    p = near(r, r.host, 'command');
  r.action(p.id, { station: 'command', verb: 'heading', value: 285 });
  assert.equal(r.command.heading, 285);
  assert.equal(r.command.acknowledgedBy, null);
  near(r, p.id, 'wheel');
  r.action(p.id, { station: 'wheel', verb: 'acknowledge' });
  assert.equal(r.command.acknowledgedBy, p.name);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'wheel', verb: 'rudder', value: 0.4 });
  assert.equal(r.ship.rudderTarget, 0.4);
});

test('bridge partition, real doorway and deck fittings agree with walking collision', () => {
  assert.equal(canOccupy({ x: 1, z: -20, level: 0 }), false);
  const start = { x: 0.5, z: -18.775, level: 0 as const },
    end = moveWithCollision(start, 1, 0);
  assert.ok(end.x > 1.4, 'both work areas connect through the doorway');
  assert.ok(wallsBetween({ x: 3.4, z: -20, level: 0 }, { x: -3.2, z: -20, level: 0 }) > 0);
  assert.ok(
    BRIDGE.phone.x > 1 && BRIDGE.telegraph.x > 1 && BRIDGE.chart.x < 1 && BRIDGE.wheel.x < 1,
  );
  for (const f of DECK_FITTINGS) assert.equal(canOccupy(f), false);
});

test('lookout records a personal estimate with bearing, position and time, without measuring hidden ice', () => {
  const r = crew(),
    p = near(r, r.host, 'bell');
  p.yaw = Math.PI / 6;
  r.action(p.id, {
    station: 'bell',
    verb: 'observe',
    value: { range: 0.45, note: 'Bearing steady' },
  });
  assert.match(p.notes.at(-1)!, /300°/);
  assert.match(p.notes.at(-1)!, /0.45 NM estimated/);
  const other = [...r.players.values()].find((q) => q.id !== p.id)!;
  assert.ok(!r.snapshot(other.id).self.notes.some((n) => n.includes('Bearing steady')));
});

test('two wireless desks allow separate reports but cannot transcribe the same slip simultaneously', () => {
  const r = crew(10),
    [a, b] = [...r.players.values()];
  a.role = b.role = 'Wireless Operator';
  const t = r.generateTelegram(true),
    u = r.generateTelegram(true);
  near(r, a.id, 'wireless');
  r.action(a.id, { station: 'wireless', verb: 'assist', value: { id: t.id } });
  near(r, b.id, 'wireless-copy');
  b.z = -8.55;
  assert.throws(
    () => r.action(b.id, { station: 'wireless-copy', verb: 'assist', value: { id: t.id } }),
    /colleague/,
  );
  r.elapsed += 0.2;
  r.action(b.id, { station: 'wireless-copy', verb: 'assist', value: { id: u.id } });
  assert.equal(a.jobValue, t.id);
  assert.equal(b.jobValue, u.id);
});

test('seeded voyages contain two to four fixed encounters and do not win after only the first', () => {
  for (const seed of [1, 3, 5]) {
    const r = crew(4, seed),
      main = r.icebergs.filter((i) => i.main);
    assert.ok(main.length >= 2 && main.length <= 4);
    for (let n = 1; n < main.length; n++) assert.ok(main[n].west - main[n - 1].west > 1250);
    const before = r.icebergs.map((i) => [i.id, i.west, i.north]);
    r.ship.heading = 280;
    r.ship.rudderTarget = 1;
    for (let n = 0; n < 100; n++) r.tick(0.05);
    assert.deepEqual(
      r.icebergs.map((i) => [i.id, i.west, i.north]),
      before,
    );
    r.ship.west = main[0].west + 250;
    r.ship.north = 0;
    r.checkIcebergs();
    assert.equal(r.mainPassedAt, null);
  }
});

test('maintained ships can navigate every seeded encounter and fixed obstacle, then complete the safe run', () => {
  for (const seed of [1, 5, 8]) {
    const r = crew(8, seed);
    for (let t = 0; t < 900 && r.phase === 'voyage'; t += 0.05) {
      r.ship.coal.fill(0.65);
      r.ship.ash.fill(0);
      r.ship.clinker.forEach((a) => a.fill(0));
      r.machines.forEach((m) => (m.condition = 100));
      r.ship.order = r.ship.throttle = 25;
      const next = r.icebergs.filter((i) => i.main && !i.passed).sort((a, b) => a.west - b.west)[0];
      const north = next && next.west - r.ship.west < 1050 ? (next.north >= 0 ? -125 : 125) : 0;
      const heading = 270 + (Math.atan2(north - r.ship.north, 380) * 180) / Math.PI;
      r.ship.rudderTarget = Math.max(
        -1,
        Math.min(1, (heading - r.ship.heading) * 0.12 - r.ship.yawRate * 1.4),
      );
      r.tick(0.05);
    }
    assert.equal(r.result?.outcome, 'crew', 'seed ' + seed);
    assert.equal(r.icebergs.filter((i) => i.hit).length, 0);
    assert.ok(r.icebergs.filter((i) => i.main).every((i) => i.passed));
  }
});

test('routine engineering service restores condition but cannot erase an active fault', () => {
  const r = crew(),
    p = near(r, r.host, 'engines');
  p.role = 'Engineer';
  const m = r.machines.find((m) => m.id === 'engines')!;
  m.condition = 80;
  assert.throws(() => r.action(p.id, { station: 'engines', verb: 'repair' }), /No active fault/);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'engines', verb: 'service' });
  assert.equal(p.job?.duration, 12);
  r.completeJob(p, p.job!);
  p.job = null;
  assert.equal(m.condition, 98);
  m.condition = 70;
  m.fault = 'Bearing vibration';
  r.elapsed += 0.2;
  assert.throws(() => r.action(p.id, { station: 'engines', verb: 'service' }), /Repair/);
  assert.ok(m.fault);
});
