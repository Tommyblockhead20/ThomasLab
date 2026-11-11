import test from 'node:test';
import assert from 'node:assert/strict';
import { cabinetAligned, makeCabinet, turnCabinet } from '../shared/cabinet';

test('every possible cabinet start is solvable and needs five to nine turns', () => {
  // Reverse shortest-path distances test the full generated set, including
  // states that cannot occur with this coupled mechanism.
  const distance = new Map([['000', 0]]),
    queue = [[0, 0, 0]];
  for (let at = 0; at < queue.length; at++)
    for (let dial = 0; dial < 3; dial++) {
      const previous = queue[at].map(
          (v, i) => (v + (i === dial || i === (dial + 1) % 3 ? 5 : 0)) % 6,
        ),
        key = previous.join('');
      if (!distance.has(key)) {
        distance.set(key, distance.get(queue[at].join(''))! + 1);
        queue.push(previous);
      }
    }
  for (let i = 0; i < 1000; i++) {
    const start = makeCabinet(() => i / 1000),
      steps = distance.get(start.join(''));
    assert.ok(steps !== undefined && steps >= 5 && steps <= 9);
    assert.equal(cabinetAligned(start), false);
    assert.ok(start.every((value) => Number.isInteger(value) && value >= 0 && value < 6));
  }
  const start = makeCabinet(() => 0);
  start[0] = 99;
  assert.notEqual(makeCabinet(() => 0)[0], 99);
});
test('one dial moves its neighbor and six turns return both to their starting positions', () => {
  const initial = [2, 4, 1];
  assert.deepEqual(turnCabinet(initial, 0), [3, 5, 1]);
  assert.deepEqual(turnCabinet(initial, 2), [3, 4, 2]);
  for (let dial = 0; dial < 3; dial++) {
    let state = initial;
    for (let i = 0; i < 6; i++) state = turnCabinet(state, dial);
    assert.deepEqual(state, initial);
  }
  assert.equal(cabinetAligned([]), false);
  assert.equal(cabinetAligned([0, 0, 0]), true);
});
