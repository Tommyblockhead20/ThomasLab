import test from 'node:test';
import assert from 'node:assert/strict';
import { Room, Random } from '../server/game';
import { BALANCE, ROLE_ORDER } from '../shared/config';
import { canOccupy, distance, moveWithCollision, STATIONS, wallsBetween } from '../shared/world';
import type { Level, Position } from '../shared/types';
import { encodeMorse } from '../shared/morse';
import { cabinetAligned, turnCabinet } from '../shared/cabinet';
import { workSeconds } from '../shared/voyage';
import { HULL_BOW, NAVIGATION_RATE } from '../shared/navigation';

function voyage(count = 4, seed = 1234) {
  const r = new Room('TESTAA', seed);
  for (let i = 0; i < count; i++) {
    const p = r.addPlayer(`Crew ${i}`, `socket-${i}`);
    p.ready = true;
  }
  r.start(r.host);
  return r;
}
function advance(r: Room, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) r.tick(0.05);
}

test('roles scale from 4–10, exactly one secret traveler and no secret fields leak', () => {
  for (let count = 4; count <= 10; count++) {
    const r = voyage(count);
    assert.equal([...r.players.values()].filter((p) => p.saboteur).length, 1);
    assert.deepEqual(
      [...r.players.values()].map((p) => p.role).sort(),
      ROLE_ORDER.slice(0, count).sort(),
    );
    for (const p of r.players.values()) {
      const s = r.snapshot(p.id);
      assert.equal(s.self.saboteur, p.saboteur);
      assert.equal(s.phaseRemaining, null);
      const serialized = JSON.stringify(s);
      assert.ok(!serialized.includes('token'));
      assert.ok(!serialized.includes('encounterAt'));
      assert.ok(!serialized.includes('hazardNorth'));
      assert.ok(!serialized.includes('mainResolved'));
      assert.equal(s.result, null);
      for (const other of s.players) {
        assert.ok(!('saboteur' in other));
        assert.ok(!('role' in other));
        assert.ok(!('input' in other));
      }
    }
  }
});
test('seeded events reproduce timings, hazards, roles and cabinet puzzles', () => {
  const a = voyage(6, 73),
    b = voyage(6, 73);
  assert.equal(a.encounterAt, b.encounterAt);
  assert.equal(a.hazardNorth, b.hazardNorth);
  assert.deepEqual(a.puzzle, b.puzzle);
  assert.deepEqual(
    [...a.players.values()].map((p) => p.role),
    [...b.players.values()].map((p) => p.role),
  );
  const random = new Random(1);
  assert.ok(random.next() >= 0 && random.next() < 1);
});
test('clients cannot teleport, move through walls, remotely operate or forge sabotage', () => {
  const r = voyage(),
    p = [...r.players.values()].find((p) => !p.saboteur)!;
  assert.throws(() => r.action(p.id, { station: 'engines', verb: 'throttle', value: 0 }), /closer/);
  Object.assign(p, { x: -2.8, z: -19.5, level: 0 });
  assert.throws(() => r.action(p.id, { station: 'wheel', verb: 'sabotage' }), /unavailable/);
  r.elapsed += 0.2;
  assert.throws(() => r.action(p.id, { station: 'wheel', verb: 'rudder', value: NaN }), /Invalid/);
  r.setInput(p, { forward: 999, right: 999, yaw: 0, pitch: 0, seq: 1, sprint: true });
  const start = { ...p };
  r.tick(0.05);
  assert.ok(distance(p, start) < 0.36);
  r.setInput(p, {
    x: 9999,
    z: 9999,
    forward: 0,
    right: 0,
    yaw: 0,
    pitch: 0,
    seq: 2,
    sprint: false,
  });
  assert.ok(p.x < 20);
  const before = p.lastSeq;
  r.setInput(p, { forward: 1, right: 0, yaw: 0, pitch: 0, seq: 1, sprint: false });
  assert.equal(p.lastSeq, before);
  assert.equal(canOccupy({ x: 10.1, z: 0, level: 0 }), false);
  const pos = { x: -0.25, z: -8.7, level: 0 as const };
  const moved = moveWithCollision(pos, 0.5, 0);
  assert.equal(moved.x, pos.x);
});
test('tampering takes time, consumes a charge, hides action label, and can be countered', () => {
  const r = voyage(),
    sab = [...r.players.values()].find((p) => p.saboteur)!,
    crew = [...r.players.values()].find((p) => !p.saboteur)!;
  Object.assign(sab, { x: 6, z: 25.6, level: -1 });
  r.action(sab.id, { station: 'steering', verb: 'sabotage' });
  assert.equal(r.machine('steering').fault, null);
  assert.equal(r.snapshot(crew.id).players.find((p) => p.id === sab.id)!.job!.kind, 'maintenance');
  advance(r, 8.1);
  assert.ok(r.machine('steering').fault);
  assert.equal(sab.charges, 3);
  assert.ok(sab.cooldown > 0);
  Object.assign(crew, { x: 6, z: 25.6, level: -1 });
  r.action(crew.id, { station: 'steering', verb: 'inspect' });
  advance(r, workSeconds(crew.role, 'inspect') + 0.1);
  assert.match(crew.notes.at(-1)!, /tool|seal|screw/);
  r.action(crew.id, { station: 'steering', verb: 'repair' });
  advance(r, workSeconds(crew.role, 'repair') + 0.1);
  assert.equal(r.machine('steering').fault, null);
  assert.equal(r.machine('steering').condition > 99, true);
  const other = [...r.players.values()].find((p) => p.id !== crew.id && p.id !== sab.id)!;
  const serialized = JSON.stringify(r.snapshot(other.id));
  assert.ok(!serialized.includes('secretly tampered'));
  assert.ok(!serialized.includes('Fresh tool marks'));
});
test('proximity respects walls and decks; held, answered phones bridge departments', () => {
  const r = voyage(),
    [a, b] = [...r.players.values()];
  Object.assign(a, { x: 0, z: -20, level: 0 });
  Object.assign(b, { x: 1, z: -20, level: 0 });
  assert.ok(r.voicePaths(a).some((v) => v.id === b.id));
  Object.assign(b, { x: 1, z: -20, level: -1 });
  assert.ok(!r.voicePaths(a).some((v) => v.id === b.id));
  Object.assign(a, { x: -1, z: -8.7, level: 0 });
  Object.assign(b, { x: 1, z: -8.7, level: 0 });
  assert.ok(wallsBetween(a, b) > 0);
  const bridge = STATIONS.find((s) => s.id === 'bridge-phone')!,
    nest = STATIONS.find((s) => s.id === 'nest-phone')!;
  Object.assign(a, { x: bridge.x, z: bridge.z, level: bridge.level });
  Object.assign(b, { x: nest.x, z: nest.z, level: nest.level });
  r.action(a.id, { station: bridge.id, verb: 'call', value: 'nest' });
  assert.ok(!r.voicePaths(a).some((v) => v.id === b.id));
  r.action(b.id, { station: nest.id, verb: 'answer' });
  assert.ok(r.voicePaths(a).find((v) => v.id === b.id)?.phone);
  b.x = nest.x + 3;
  advance(r, 0.1);
  assert.equal(r.phones.length, 0);
  assert.ok(!r.voicePaths(a).some((v) => v.id === b.id));
  r.phase = 'lifeboat';
  assert.ok(r.voicePaths(a).some((v) => v.id === b.id));
});
test('wireless does not expose plaintext before decoding and telegram delivery requires walking', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  Object.assign(p, { x: -2.6, z: -7.4, level: 0 });
  r.generateTelegram();
  const telegram = r.telegrams[0];
  const s = r.snapshot(p.id);
  assert.equal(s.telegrams[0].text, undefined);
  assert.equal(s.telegrams[0].urgent, false);
  assert.ok(telegram.code.includes('.'));
  assert.throws(
    () =>
      r.action(p.id, {
        station: 'wireless',
        verb: 'decode',
        value: { id: telegram.id, text: 'I AM WRONG' },
      }),
    /match/,
  );
  r.elapsed += 0.2;
  r.action(p.id, {
    station: 'wireless',
    verb: 'decode',
    value: { id: telegram.id, text: telegram.text },
  });
  assert.equal(r.snapshot(p.id).telegrams[0].text, telegram.text);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'wireless', verb: 'carry', value: { id: telegram.id } });
  assert.ok(p.inventory.includes(`Telegram:${telegram.id}`));
  Object.assign(p, { x: -3.2, z: -17.8, level: 0 });
  r.elapsed += 0.2;
  r.action(p.id, { station: 'chart', verb: 'deliver' });
  assert.equal(r.snapshot(p.id).delivered.length, 1);
  assert.equal(encodeMorse('SOS'), '... --- ...');
});
test('cabinet requires real coupled-dial turns before binoculars can be taken', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  Object.assign(p, { x: 4.4, z: -9.6, level: 0 });
  assert.throws(
    () => r.action(p.id, { station: 'cabinet', verb: 'unlock', value: [0, 0, 0] }),
    /dial/,
  );
  r.elapsed += 0.2;
  // Sending the visible dial values is not a solution, unlike the old lock.
  assert.throws(
    () => r.action(p.id, { station: 'cabinet', verb: 'unlock', value: r.puzzle }),
    /misaligned/,
  );
  const queue = [{ dials: r.puzzle, path: [] as number[] }],
    seen = new Set([r.puzzle.join('')]);
  let path: number[] = [];
  for (let at = 0; at < queue.length; at++) {
    const current = queue[at];
    if (cabinetAligned(current.dials)) {
      path = current.path;
      break;
    }
    for (let dial = 0; dial < 3; dial++) {
      const next = turnCabinet(current.dials, dial),
        key = next.join('');
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ dials: next, path: [...current.path, dial] });
      }
    }
  }
  assert.ok(path.length >= 5 && path.length <= 9);
  for (const dial of path) {
    r.elapsed += 0.2;
    r.action(p.id, { station: 'cabinet', verb: 'turn', value: dial });
  }
  assert.deepEqual(r.snapshot(p.id).self.puzzle, [0, 0, 0]);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'cabinet', verb: 'unlock' });
  advance(r, 3.1);
  assert.equal(r.cabinetOpen, true);
  r.action(p.id, { station: 'cabinet', verb: 'take' });
  assert.equal(p.binoculars, true);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'cabinet', verb: 'return' });
  assert.equal(r.binocularOwner, null);
});

test('cabinet turns are validated, require proximity, and the key remains an alternative', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  assert.throws(() => r.action(p.id, { station: 'cabinet', verb: 'turn', value: 0 }), /closer/);
  Object.assign(p, { x: 4.4, z: -9.6, level: 0 });
  for (const value of [-1, 3, NaN, '1', 1.5]) {
    r.elapsed += 0.2;
    assert.throws(() => r.action(p.id, { station: 'cabinet', verb: 'turn', value }), /dial/);
  }
  Object.assign(p, r.keyPosition);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'key', verb: 'take' });
  assert.ok(p.inventory.includes('Cabinet key'));
  Object.assign(p, { x: 4.4, z: -9.6, level: 0 });
  r.elapsed += 0.2;
  r.action(p.id, { station: 'cabinet', verb: 'unlock' });
  assert.ok(r.cabinetOpen);
});
test('cabinet latch work excludes dial changes by other crewmates', () => {
  const r = voyage(),
    [a, b] = [...r.players.values()];
  Object.assign(a, { x: 4.4, z: -9.6, level: 0 });
  Object.assign(b, { x: 4.4, z: -9.6, level: 0 });
  r.puzzle = [0, 0, 0];
  r.action(a.id, { station: 'cabinet', verb: 'unlock' });
  assert.throws(
    () => r.action(b.id, { station: 'cabinet', verb: 'turn', value: 0 }),
    /already working/,
  );
  advance(r, 3.1);
  assert.equal(r.cabinetOpen, true);
});

test('repeated ship signals have distinct notice versions', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  Object.assign(p, { x: 0.5, z: -31.08, level: 1 });
  r.action(p.id, { station: 'bell', verb: 'ring' });
  const first = r.snapshot(p.id);
  r.elapsed += 0.2;
  r.action(p.id, { station: 'bell', verb: 'ring' });
  const second = r.snapshot(p.id);
  assert.equal(first.notice, second.notice);
  assert.ok(second.noticeVersion > first.noticeVersion);
});

test('station jobs cancel when player leaves or disconnects', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  Object.assign(p, { x: 6, z: 25.6, level: -1 });
  r.machine('steering').fault = 'Drive assembly sticking';
  r.action(p.id, { station: 'steering', verb: 'repair' });
  p.x = 0;
  advance(r, 0.1);
  assert.equal(p.job, null);
});
test('actual geometry causes collisions; slow contact can survive, full speed can sink', () => {
  const r = voyage();
  r.ship.speed = 22;
  r.addIce(130, 0, 40, true);
  r.checkIcebergs();
  assert.equal(r.ship.compartments.filter((n) => n > 0).length, 5);
  advance(r, 60);
  assert.ok(['sinking', 'lifeboat'].includes(r.phase));
  const slow = voyage();
  slow.ship.speed = 7;
  slow.addIce(130, 0, 40, true);
  slow.checkIcebergs();
  assert.ok(slow.ship.compartments.filter((n) => n > 0).length <= 3);
  slow.mainPassedAt = 0;
  slow.mainResolved = true;
  advance(slow, 90);
  assert.equal(slow.result?.outcome, 'crew');
});
test('an earlier safe route is preserved; open-water geometry survives', () => {
  const r = voyage();
  r.ship.north = r.hazardNorth + 180;
  r.resolveEncounter();
  const ice = r.icebergs[0];
  assert.ok(Math.abs(ice.north - r.ship.north) > 150);
  r.icebergs = r.icebergs.filter((i) => i.main);
  r.nextEvent = Infinity;
  r.nextTelegram = Infinity;
  for (let t = 0; t < r.encounterAt + 500; t += 0.05) {
    r.ship.coal.fill(0.7);
    r.ship.ash.fill(0);
    r.ship.clinker.forEach((a) => a.fill(0));
    r.tick(0.05);
  }
  assert.equal(r.result?.outcome, 'crew');
});
test('lifeboat majority, ties, abstentions and timeout resolve the correct winner', () => {
  for (const outcome of ['draw', 'saboteur', 'tie', 'timeout']) {
    const r = voyage();
    r.phase = 'lifeboat';
    const ps = [...r.players.values()],
      sab = ps.find((p) => p.saboteur)!,
      innocent = ps.find((p) => !p.saboteur)!;
    if (outcome === 'timeout') r.resolveVote();
    else if (outcome === 'tie') {
      for (let i = 0; i < ps.length; i++) r.vote(ps[i].id, i % 2 ? sab.id : innocent.id);
    } else for (const p of ps) r.vote(p.id, outcome === 'draw' ? sab.id : innocent.id);
    assert.equal(r.result?.outcome, outcome === 'draw' ? 'draw' : 'saboteur');
    assert.equal(r.result?.saboteur, sab.id);
    assert.ok(r.result!.roles.every((p) => p.role));
  }
});
test('schedule recall opens an inquiry and restart cleans role state', () => {
  const r = voyage();
  r.ship.delay = BALANCE.scheduleBudget + 0.1;
  r.tick(0.05);
  assert.equal(r.phase, 'inquiry');
  assert.equal(r.inquiryCause, 'schedule');
  assert.equal(r.result, null);
  r.resolveVote();
  assert.equal(r.snapshot(r.host).result?.outcome, 'saboteur');
  r.returnToLobby(r.host);
  assert.equal(r.phase, 'lobby');
  assert.equal(r.result, null);
  assert.equal(r.phones.length, 0);
  assert.ok([...r.players.values()].every((p) => !p.saboteur && !p.ready && !p.role));
});
test('host departure migrates authority and reconnect requires the private pass', () => {
  const r = voyage(),
    host = r.players.get(r.host)!;
  r.disconnect(host.id);
  assert.notEqual(r.host, host.id);
  assert.throws(() => r.reconnect(host.id, 'wrong', 'new'), /expired/);
  const returned = r.reconnect(host.id, host.token, 'new');
  assert.equal(returned.role, host.role);
  assert.equal(returned.connected, true);
  assert.throws(() => r.reconnect(host.id, host.token, 'duplicate'), /already connected/);
});

test('controlled evasion clears with 26 seconds of warning while an 18-second reaction strikes ice', () => {
  for (const lead of [50, 42, 34, 26, 18]) {
    const r = voyage(4, 101);
    r.nextEvent = r.nextTelegram = Infinity;
    r.mainResolved = true;
    r.icebergs = [];
    r.ship.speed = 21;
    r.addIce(HULL_BOW + 46 + 21 * 0.514444 * NAVIGATION_RATE * lead, 0, 46, true);
    r.ship.rudderTarget = 1;
    let counter = false,
      amidships = false;
    for (let t = 0; t < 180 && r.phase === 'voyage'; t += 0.05) {
      r.ship.coal.fill(0.7);
      r.ship.ash.fill(0);
      r.ship.clinker.forEach((a) => a.fill(0));
      if (!counter && r.ship.heading >= 285) {
        r.ship.rudderTarget = -1;
        counter = true;
      }
      if (counter && !amidships && r.ship.heading <= 270) {
        r.ship.rudderTarget = 0;
        amidships = true;
      }
      r.tick(0.05);
    }
    assert.equal(r.icebergs[0].hit, lead === 18, 'lead ' + lead);
    if (lead !== 18) assert.equal(r.result?.outcome, 'crew', 'controlled return at ' + lead);
    else assert.ok(r.ship.hull < 100);
  }
});

test('instrument tampering changes readings without moving the actual world', () => {
  const r = voyage();
  r.machine('compass').fault = 'Misaligned';
  r.machine('gauge').fault = 'Misreading';
  advance(r, 0.1);
  const s = r.snapshot([...r.players.keys()][0]);
  assert.equal(s.ship.heading, 270);
  assert.equal(s.ship.indicatedHeading, 276);
  assert.equal(s.ship.indicatedSteam - s.ship.steam, 18);
});

test('a disconnected binocular owner cannot permanently remove observation equipment', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  r.cabinetOpen = true;
  Object.assign(p, { x: 4.4, z: -9.6, level: 0 });
  r.action(p.id, { station: 'cabinet', verb: 'take' });
  assert.equal(r.binocularOwner, p.id);
  r.disconnect(p.id);
  assert.equal(r.binocularOwner, null);
  assert.equal(r.cabinetOpen, true);
});

test('refresh reconnect accepts a fresh movement sequence, and replay resets interaction timers', () => {
  const r = voyage(),
    p = [...r.players.values()][0];
  p.lastSeq = 5000;
  r.disconnect(p.id);
  r.reconnect(p.id, p.token, 'replacement');
  r.setInput(p, { forward: 1, right: 0, yaw: 0, pitch: 0, sprint: false, zoom: 0, seq: 1 });
  assert.equal(p.lastSeq, 1);
  p.lastAction = 400;
  r.finish('crew');
  r.returnToLobby(r.host);
  for (const other of r.players.values()) other.ready = true;
  r.start(r.host);
  Object.assign(p, { x: -2.8, z: -19.5, level: 0 });
  assert.doesNotThrow(() => r.action(p.id, { station: 'wheel', verb: 'rudder', value: 0 }));
});
