import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game';
import { canOccupy, distance, STATIONS, wallsBetween } from '../shared/world';
import { BALANCE } from '../shared/config';

function solo() {
  const r = new Room('SOLOAA', 1234);
  const p = r.addPlayer('Test Captain', 'test-socket');
  r.start(p.id, { practice: true, post: 'Engineer', paused: true });
  return { r, p };
}
function advance(r: Room, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) r.tick(0.05);
}

test('single player selects a real post, has no hidden opponent and starts paused', () => {
  const { r, p } = solo();
  assert.equal(r.players.size, 1);
  assert.equal(p.role, 'Engineer');
  assert.equal(p.saboteur, false);
  assert.equal(p.level, -1);
  assert.equal(r.ship.fires.length, 4, 'all four physical boilers are available for solo testing');
  assert.equal(r.practiceSettings.paused, true);
  const west = r.ship.west;
  advance(r, 120);
  assert.equal(r.elapsed, 0);
  assert.equal(r.ship.west, west);
  r.practiceAction(p.id, { verb: 'pause', value: false });
  advance(r, 2);
  assert.ok(r.elapsed > 1.9);
  assert.ok(r.ship.west > west);
});

test('paused solo mode still accepts movement, repeated interactions and timed sabotage/repair', () => {
  const { r, p } = solo();
  r.setInput(p, { forward: 1, right: 0, yaw: 0, pitch: 0, sprint: false, zoom: 0, seq: 1 });
  const before = p.z;
  r.tick(0.05);
  assert.ok(p.z < before);
  r.practiceAction(p.id, { verb: 'travel', value: 'wheel' });
  r.action(p.id, { station: 'wheel', verb: 'rudder', value: 0.5 });
  advance(r, 0.2);
  r.action(p.id, { station: 'wheel', verb: 'rudder', value: 0 });
  advance(r, 0.2);
  r.action(p.id, { station: 'wheel', verb: 'sabotage' });
  advance(r, 8.1);
  assert.ok(r.machine('steering').fault);
  assert.equal(p.charges, 3);
  r.action(p.id, { station: 'wheel', verb: 'repair' });
  advance(r, 9.1);
  assert.equal(r.machine('steering').fault, null);
  assert.equal(r.elapsed, 0);
  r.practiceAction(p.id, { verb: 'tools', value: false });
  advance(r, 0.2);
  assert.throws(() => r.action(p.id, { station: 'wheel', verb: 'sabotage' }), /unavailable/);
});

test('single-player quick travel reaches every station in legal standing space and updates camera relocation', () => {
  const { r, p } = solo();
  let relocation = p.relocation;
  for (const s of STATIONS) {
    assert.doesNotThrow(() => r.practiceAction(p.id, { verb: 'travel', value: s.id }), s.id);
    assert.equal(canOccupy(p), true, s.name);
    assert.ok(distance(p, s) < 3.3, s.name);
    assert.equal(wallsBetween(p, s), 0, s.name);
    assert.ok(p.relocation > relocation);
    relocation = p.relocation;
  }
  r.practiceAction(p.id, { verb: 'post', value: 'Lookout' });
  assert.equal(p.level, 1);
  assert.equal(p.role, 'Lookout');
  assert.equal(r.snapshot(p.id).self.relocation, p.relocation);
});

test('solo ice uses actual simulation and sinking reaches the lifeboat, result and a clean restart', () => {
  const { r, p } = solo();
  r.practiceAction(p.id, { verb: 'ice' });
  assert.equal(r.icebergs.length, 25);
  assert.equal(r.icebergs.filter((i) => i.main).length, 1);
  assert.equal(r.mainResolved, true);
  assert.equal(r.practiceSettings.paused, false);
  assert.equal(r.phase, 'voyage');
  const west = r.ship.west;
  advance(r, 1);
  assert.ok(r.ship.west > west);
  r.practiceAction(p.id, { verb: 'sinking' });
  r.tick(0.05);
  assert.equal(r.phase, 'sinking');
  r.tick(BALANCE.evacuationSeconds + 1);
  assert.equal(r.phase, 'lifeboat');
  r.vote(p.id, p.id);
  assert.equal(r.phase, 'ended');
  assert.equal(r.result?.title, 'Test voyage complete.');
  assert.equal(r.result?.saboteur, '');
  r.practiceAction(p.id, { verb: 'restart' });
  assert.equal(r.phase, 'voyage');
  assert.equal(r.ship.hull, 100);
  assert.equal(r.result, null);
  assert.equal(p.role, 'Engineer');
  assert.equal(r.players.size, 1);
});

test('practice tools cannot be used to cheat in a multiplayer room', () => {
  const room = new Room('PUBLIC', 41);
  for (let i = 0; i < 4; i++) room.addPlayer(`Crew ${i}`, `socket${i}`).ready = true;
  room.start(room.host, { practice: true, tools: true, paused: true });
  assert.equal(room.practice, false);
  assert.equal(room.snapshot(room.host).practiceSettings, null);
  for (const verb of [
    'pause',
    'sinking',
    'schedule',
    'route',
    'travel',
    'restore',
    'restart',
  ] as const)
    assert.throws(() => room.practiceAction(room.host, { verb, value: true }), /single-player/);
  const p = [...room.players.values()].find((p) => !p.saboteur)!;
  Object.assign(p, { x: -2.8, z: -19.5, level: 0 });
  assert.throws(() => room.action(p.id, { station: 'wheel', verb: 'sabotage' }), /unavailable/);
});

test('solo assistance can be disabled to test manual engineering and restore clears test damage', () => {
  const { r, p } = solo();
  r.practiceAction(p.id, { verb: 'pause', value: false });
  r.ship.order = 12;
  r.ship.throttle = 21;
  advance(r, 0.1);
  assert.equal(r.ship.throttle, 12);
  r.practiceAction(p.id, { verb: 'assistance', value: false });
  r.ship.order = 24;
  advance(r, 0.1);
  assert.equal(r.ship.throttle, 12);
  r.ship.hull = 14;
  r.ship.compartments[0] = 0.5;
  p.charges = 0;
  p.cooldown = 30;
  r.machine('engines').fault = 'Test fault';
  r.practiceAction(p.id, { verb: 'restore' });
  assert.equal(r.ship.hull, 100);
  assert.ok(r.ship.compartments.every((n) => n === 0));
  assert.equal(r.machine('engines').fault, null);
  assert.equal(p.charges, 4);
  assert.equal(p.cooldown, 0);
});
