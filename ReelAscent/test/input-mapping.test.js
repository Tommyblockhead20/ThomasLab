import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FISHING_CAST_CODES,
  FISHING_HOOK_CODES,
  RHYTHM_LANES,
  StaminaResource,
  TOUCH_RHYTHM_LANES,
  touchActionHeld
} from '../src/player/movement.js';
import { TEMPORARY_PLAYTEST_CONTROLS } from '../src/world/run-manager.js';

test('desktop WASD and arrow keys share the four canonical rhythm lanes', () => {
  assert.equal(RHYTHM_LANES.KeyW, RHYTHM_LANES.ArrowUp);
  assert.equal(RHYTHM_LANES.KeyA, RHYTHM_LANES.ArrowLeft);
  assert.equal(RHYTHM_LANES.KeyS, RHYTHM_LANES.ArrowDown);
  assert.equal(RHYTHM_LANES.KeyD, RHYTHM_LANES.ArrowRight);
});

test('mouse-free fishing maps up/W to cast and down/S to hook', () => {
  assert.deepEqual(FISHING_CAST_CODES, ['ArrowUp', 'KeyW']);
  assert.deepEqual(FISHING_HOOK_CODES, ['ArrowDown', 'KeyS']);
});

test('touch direction buttons reuse the same rhythm mapping', () => {
  assert.deepEqual(TOUCH_RHYTHM_LANES, {
    left: 'A',
    up: 'W',
    down: 'S',
    right: 'D'
  });
});

test('independent touch pointers keep other actions held when one finger lifts', () => {
  const pointers = new Map([
    [11, { action: 'up' }],
    [12, { action: 'right' }],
    [13, { action: 'sprint' }],
    [14, { action: 'grip' }]
  ]);
  assert.equal(touchActionHeld(pointers, 'up'), true);
  assert.equal(touchActionHeld(pointers, 'right'), true);
  assert.equal(touchActionHeld(pointers, 'sprint'), true);
  assert.equal(touchActionHeld(pointers, 'grip'), true);
  pointers.delete(11);
  assert.equal(touchActionHeld(pointers, 'up'), false);
  assert.equal(touchActionHeld(pointers, 'right'), true);
  assert.equal(touchActionHeld(pointers, 'sprint'), true);
  assert.equal(touchActionHeld(pointers, 'grip'), true);
});

test('temporary F7, F8, and Home controls stay distinct and F7 uses the shared stamina resource', () => {
  assert.deepEqual(TEMPORARY_PLAYTEST_CONTROLS, {
    unlimitedStamina: 'F7', summitRim: 'F8', returnHome: 'Home'
  });
  assert.equal(new Set(Object.values(TEMPORARY_PLAYTEST_CONTROLS)).size, 3);
  const stamina = new StaminaResource();
  stamina.spend(stamina.config.maximum);
  assert.equal(stamina.value, 0);
  stamina.setUnlimited(true);
  assert.equal(stamina.unlimited, true);
  assert.equal(stamina.value, stamina.config.maximum);
  stamina.spend(stamina.config.maximum);
  assert.equal(stamina.value, stamina.config.maximum);
  stamina.setUnlimited(false);
  assert.equal(stamina.unlimited, false);
});
