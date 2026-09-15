import test from 'node:test';
import assert from 'node:assert/strict';
import { GamepadController, gamepadAxis } from '../src/input/gamepad-controller.js';

test('standard-pad deadzone preserves analog movement without drift', () => {
  assert.equal(gamepadAxis(.15), 0);
  assert.equal(gamepadAxis(-.19), 0);
  assert.equal(gamepadAxis(1), 1);
  assert.equal(gamepadAxis(-1), -1);
  assert.ok(gamepadAxis(.55) > 0 && gamepadAxis(.55) < 1);
});

test('controller connects without a phantom button press and clears input on disconnect', () => {
  const oldDocument = globalThis.document;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
  const pad = { connected: true, mapping: 'standard', index: 0, axes: [0, 0, 0, 0], buttons };
  const pads = [pad];
  globalThis.document = { hidden: false, querySelectorAll: () => [] };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads: () => pads } });
  const input = {
    gamepadAxes: { x: 0, z: 0 }, gamepadGripHeld: false, gamepadCastHeld: false,
    rhythmCapture: false, rhythmLaneInput: { press() {}, release() {} }, rawGripHeld: false
  };
  const game = {
    player: { input }, camera: { yaw: 0, pitch: 0 }, fishing: { active: false, resultActive: false },
    localPause: { active: false }, isGameplayModalOpen: () => false,
    hud: { showToast() {} }, setLocalPause() {}, performFishingResultAction() {}
  };
  try {
    const controller = new GamepadController(game);
    buttons[0].pressed = true;
    controller.poll(.016);
    assert.equal(input.jumpQueued, undefined);
    buttons[0].pressed = false;
    pad.axes[0] = .7;
    pad.axes[1] = -.6;
    controller.poll(.016);
    assert.ok(input.gamepadAxes.x > 0);
    assert.ok(input.gamepadAxes.z > 0);
    buttons[4].pressed = true;
    controller.poll(.016);
    assert.equal(input.gamepadGripHeld, true);
    pads[0] = null;
    controller.poll(.016);
    assert.deepEqual(input.gamepadAxes, { x: 0, z: 0 });
    assert.equal(input.gamepadGripHeld, false);
  } finally {
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  }
});
