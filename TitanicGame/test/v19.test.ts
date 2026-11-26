import assert from 'node:assert/strict';
import test from 'node:test';
import { Room } from '../server/game';
import { STATIONS } from '../shared/world';

test('shared chart undo removes only the latest addition by that player, rejects stale undo and allows targeted erase', () => {
  const room = new Room('CHARTUNDO', 21);
  const crew = Array.from({ length: 4 }, (_, i) => room.addPlayer('Mate ' + i, 'socket' + i));
  for (const p of crew) p.ready = true;
  room.start(crew[0].id);
  const [first, second] = crew;
  second.name = first.name;
  const chart = STATIONS.find((s) => s.id === 'chart')!;
  for (const p of [first, second]) Object.assign(p, { x: chart.x, z: chart.z, level: chart.level });
  const add = (p: typeof first, kind: 'ice' | 'route') => {
    room.elapsed += 1;
    room.action(p.id, {
      station: chart.id,
      verb: 'mark',
      value: {
        kind,
        points: [
          { west: 200, north: 0 },
          { west: 400, north: 40 },
        ],
        radius: 0,
        label: '',
        source: 'Lookout',
        confidence: 'medium',
      },
    });
    return room.snapshot(p.id).chartUndoId!;
  };
  const original = add(first, 'ice');
  const target = add(first, 'route');
  const colleague = add(second, 'ice');
  room.elapsed += 1;
  assert.throws(
    () => room.action(first.id, { station: chart.id, verb: 'undo', value: original }),
    /chart changed/i,
  );
  room.elapsed += 1;
  room.action(first.id, { station: chart.id, verb: 'undo', value: target });
  assert.deepEqual(
    room.chartMarks.map((m) => m.id),
    [original, colleague],
  );
  assert.equal(room.snapshot(first.id).chartUndoId, original);
  room.elapsed += 1;
  room.action(second.id, { station: chart.id, verb: 'erase', value: original });
  assert.equal(room.snapshot(first.id).chartUndoId, undefined);
  assert.equal(room.snapshot(second.id).chartUndoId, colleague);
});
