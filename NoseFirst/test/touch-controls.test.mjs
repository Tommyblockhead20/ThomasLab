import test from 'node:test';
import assert from 'node:assert/strict';
import { wireTouchHold } from '../touch-controls.js';

function gesture(element, type, changed, active) {
  const event = new Event(type, { cancelable: true });
  event.changedTouches = changed.map(identifier => ({ identifier }));
  event.touches = active.map(identifier => ({ identifier }));
  element.dispatchEvent(event);
}

test('a second finger cannot retrigger an action or end a still-held sniff', () => {
  const element = new EventTarget();
  let starts = 0, ends = 0;
  wireTouchHold(element, { start: () => starts++, end: () => ends++ });
  gesture(element, 'touchstart', [1], [1]);
  gesture(element, 'touchstart', [2], [1, 2]);
  gesture(element, 'touchend', [2], [1]);
  assert.deepEqual([starts, ends], [1, 0]);
  gesture(element, 'touchend', [1], []);
  assert.deepEqual([starts, ends], [1, 1]);
});

test('cancelled and interrupted gestures allow the next touch to work', () => {
  const element = new EventTarget();
  let starts = 0, ends = 0;
  wireTouchHold(element, { start: () => starts++, end: () => ends++ });
  gesture(element, 'touchstart', [1], [1]);
  gesture(element, 'touchcancel', [1], []);
  gesture(element, 'touchstart', [2], [2]);
  // The browser lost touchend during a focus/visibility change.
  gesture(element, 'touchstart', [3], [3]);
  gesture(element, 'touchend', [2], [3]);
  gesture(element, 'touchend', [3], []);
  assert.deepEqual([starts, ends], [3, 2]);
});
