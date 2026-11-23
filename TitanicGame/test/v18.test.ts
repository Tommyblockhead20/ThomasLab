import assert from 'node:assert/strict';
import test from 'node:test';
import { Room } from '../server/game';
import { STATIONS, travelPoint } from '../shared/world';
import { chartCoordinates, metresFromCoordinates, coordinate } from '../shared/units';

test('ascending either Grand Staircase wing keeps the player on that side until the half landing', () => {
  const room = new Room('STAIRS', 4);
  const player = room.addPlayer('Tester', 'local');
  room.start(player.id, { practice: true, paused: true });
  for (const [side, id] of [
    [1, 'passengers-deck'],
    [-1, 'passengers-deck-port'],
  ] as const) {
    room.practiceAction(player.id, { verb: 'travel', value: id });
    const stair = STATIONS.find((s) => s.id === id)!;
    const other = side > 0 ? 'passengers-deck-port' : 'passengers-deck';
    assert.throws(() => room.action(player.id, { station: other, verb: 'travel' }));
    room.action(player.id, { station: id, verb: 'travel' });
    assert.equal(player.job?.station, id);
    for (const t of [0, 0.1, 0.2]) assert.equal(Math.sign(travelPoint(stair, t).x), side);
    for (let i = 0; i < 74; i++) room.tick(0.05);
    assert.equal(player.level, 0);
  }
});

test('the chart has a stable geographic endpoint and clearing the ice alone cannot finish the passage', () => {
  const room = new Room('CHART', 4);
  const player = room.addPlayer('Tester', 'local');
  room.start(player.id, { practice: true });
  room.nextEvent = room.nextTelegram = Infinity;
  const finishWest = room.snapshot(player.id).finishWest;
  assert.ok(finishWest > Math.max(...room.icebergs.filter((i) => i.main).map((i) => i.west)));
  const fix = chartCoordinates(finishWest, 0);
  assert.ok(Math.abs(metresFromCoordinates(fix.lat, fix.lon).west - finishWest) < 1e-6);
  assert.equal(coordinate(-50.99999, false), '51°00.0′W');
  room.icebergs = [];
  room.mainPassedAt = 0;
  room.elapsed = 36;
  room.ship.west = finishWest - 100;
  room.tick(0.05);
  assert.equal(room.phase, 'voyage');
  assert.equal(room.snapshot(player.id).finishWest, finishWest);
  room.ship.west = finishWest + 100;
  room.tick(0.05);
  assert.equal(room.result?.outcome, 'crew');
});
