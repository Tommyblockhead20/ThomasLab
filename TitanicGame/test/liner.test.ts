import test from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/game';
import { BALANCE, ROLE_ORDER } from '../shared/config';
import {
  canOccupy,
  distance,
  LEVEL_Y,
  moveWithCollision,
  spawnFor,
  STATIONS,
  travelPoint,
  WALLS,
  wallsBetween,
} from '../shared/world';
import {
  SHIP_WIDTH_SCALE as W,
  SHIP_LENGTH_SCALE as L,
  SHIP_HEIGHT_SCALE as H,
  SEA_LEVEL,
} from '../shared/navigation';
import type { Position } from '../shared/types';

function solo() {
  const r = new Room('LINER1', 1234),
    p = r.addPlayer('Captain', 'local');
  r.start(p.id, { practice: true });
  return { r, p };
}
function advance(r: Room, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) r.tick(0.05);
}

test('all assignments and both ends of each stair or ladder have legal standing space', () => {
  assert.ok(Math.abs(-SEA_LEVEL - 18.4) < 0.01);
  assert.ok(Math.abs(LEVEL_Y[-2] * H + 2.9) < 0.02);
  for (const role of ROLE_ORDER) assert.ok(canOccupy(spawnFor(role)), role);
  const { r, p } = solo();
  for (const s of STATIONS.filter((s) => s.destination)) {
    assert.ok(canOccupy(s.destination!), s.id + ' exit');
    const first = travelPoint(s, 0),
      last = travelPoint(s, 1);
    assert.equal(first.y, LEVEL_Y[s.level], s.id);
    assert.deepEqual(last, {
      x: s.destination!.x,
      y: LEVEL_Y[s.destination!.level],
      z: s.destination!.z,
    });
    assert.ok(Math.abs(travelPoint(s, 0.5).y - first.y) > 0.5, s.id + ' continuous climb');
    r.practiceAction(p.id, { verb: 'travel', value: s.id });
    r.action(p.id, { station: s.id, verb: 'travel' });
    assert.equal(p.job!.duration, s.travelSeconds);
    advance(r, s.travelSeconds! + 0.1);
    assert.equal(p.job, null);
    assert.equal(distance(p, s.destination!), 0, s.id);
    assert.ok(canOccupy(p), s.id);
  }
});

test('five floors connect through walkable rooms, promenades and companionway landings', () => {
  const starts: Position[] = [
    { x: 0, z: -18, level: 0 },
    STATIONS.find((s) => s.id === 'deck-passengers')!.destination!,
    { x: 0, z: 10, level: -1 },
    { x: 0.5, z: -31.08, level: 1 },
    STATIONS.find((s) => s.id === 'deck-forecastle')!.destination!,
    STATIONS.find((s) => s.id === 'deck-poop')!.destination!,
  ];
  for (const start of starts) {
    const dx = start.level === 1 ? 0.05 : 0.25,
      dz = start.level === 1 ? 0.025 : 0.125;
    const points: Position[] = [start],
      indices = [[0, 0]],
      seen = new Set(['0,0']);
    for (let i = 0; i < points.length; i++) {
      for (const [a, b] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ix = indices[i][0] + a,
          iz = indices[i][1] + b,
          key = ix + ',' + iz;
        if (seen.has(key)) continue;
        const n = { x: start.x + ix * dx, z: start.z + iz * dz, level: start.level };
        if (!canOccupy(n)) continue;
        const reached = moveWithCollision(points[i], a * dx, b * dz);
        if (distance(reached, n) > 0.001) continue;
        seen.add(key);
        indices.push([ix, iz]);
        points.push(n);
      }
    }
    for (const s of STATIONS.filter(
      (s) => s.level === start.level && (s.level !== 2 || s.z < 0 === start.z < 0),
    )) {
      assert.ok(
        points.some((p) => distance(p, s) < BALANCE.interactDistance && wallsBetween(p, s) === 0),
        s.id + ' on ' + start.level,
      );
    }
  }
});

test('visible furniture, boats, davit feet, machinery and casings block walking even on large input steps', () => {
  for (const w of WALLS.filter((w) => w.prop)) {
    assert.equal(canOccupy({ x: w.x, z: w.z, level: w.level }), false, JSON.stringify(w));
    const p = { x: w.x - w.w / 2 - 0.3 / W, z: w.z, level: w.level };
    if (!canOccupy(p)) continue;
    const moved = moveWithCollision(p, w.w + 0.6 / W, 0);
    assert.ok(moved.x < w.x - w.w / 2, JSON.stringify(w));
  }
});

test('Ice ahead places the main hazard over a minute away at cruise without changing zoom visibility', () => {
  const { r, p } = solo();
  r.nextEvent = Infinity;
  r.nextTelegram = Infinity;
  r.practiceAction(p.id, { verb: 'ice' });
  const ids = r.snapshot(p.id).icebergs.map((i) => i.id);
  p.input.zoom = 2;
  p.binoculars = true;
  assert.deepEqual(
    r.snapshot(p.id).icebergs.map((i) => i.id),
    ids,
  );
  let age = 0;
  while (!r.icebergs.find((i) => i.main)!.hit && age < 90) {
    r.tick(0.05);
    age += 0.05;
  }
  assert.ok(age >= 60 && age <= 80, 'contact after ' + age.toFixed(1) + ' seconds');
});

test('a crossing that ends before evacuation keeps the secret and tamper attribution out of public results', () => {
  for (const outcome of ['crew', 'dismissed'] as const) {
    const r = new Room('SECRE1', 42);
    for (let i = 0; i < 4; i++) r.addPlayer('Crew ' + i, 's' + i).ready = true;
    r.start(r.host);
    const sab = [...r.players.values()].find((p) => p.saboteur)!,
      crew = [...r.players.values()].find((p) => !p.saboteur)!;
    r.log(sab.name + ' secretly tampered with steering.');
    r.finish(outcome);
    const result = r.snapshot(crew.id).result!;
    assert.equal(result.revealed, false);
    assert.equal(result.saboteur, '');
    assert.ok(result.roles.every((p) => !p.saboteur));
    assert.ok(!JSON.stringify(result).includes('secretly tampered'));
  }
});
