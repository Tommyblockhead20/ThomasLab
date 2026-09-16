import { CAMERA_CONFIG } from '../config.js';
import {
  KEY_BINDING_DEFINITIONS,
  loadGamepadBindings,
  loadKeyBindings,
  normalizeGamepadBindings
} from '../player/movement.js';

// Standard Gamepad layout. A connected pad is opt-in by presence alone; keyboard and
// touch retain their own independent input sources.
const BUTTON = Object.freeze({ A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, START: 9,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 });
const DIRECTION = Object.freeze({ [BUTTON.UP]: 'W', [BUTTON.DOWN]: 'S', [BUTTON.LEFT]: 'A', [BUTTON.RIGHT]: 'D' });
const RESULT = Object.freeze({ [BUTTON.UP]: 'recast', [BUTTON.DOWN]: 'stay', [BUTTON.LEFT]: 'down', [BUTTON.RIGHT]: 'up' });

export function gamepadAxis(value, deadzone = .19) {
  const raw = Math.max(-1, Math.min(1, Number(value) || 0));
  const size = Math.abs(raw);
  return size <= deadzone ? 0 : Math.sign(raw) * (size - deadzone) / (1 - deadzone);
}

function pressed(pad, index) {
  const button = pad?.buttons?.[index];
  return Boolean(button?.pressed || (button?.value ?? 0) >= .55);
}

function visibleDialog() {
  const dialogs = [...document.querySelectorAll('[role="dialog"]:not([hidden])')];
  return dialogs.reverse().find((dialog) => dialog.getClientRects().length && getComputedStyle(dialog).visibility !== 'hidden') ?? null;
}

function focusables(dialog) {
  return [...dialog.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [role="button"]')]
    .filter((element) => !element.closest('[hidden]') && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
}

export class GamepadController {
  constructor(game) {
    this.game = game;
    this.padIndex = null;
    this.previous = [];
    this.navigationReadyAt = 0;
    this.lastDialog = null;
    this.bindings = loadGamepadBindings();
    this.onBindingsChanged = (event) => { this.bindings = normalizeGamepadBindings(event.detail ?? loadGamepadBindings()); };
    globalThis.window?.addEventListener?.('reel-ascent:gamepad-bindings-changed', this.onBindingsChanged);
  }

  clear() {
    const input = this.game.player.input;
    input.gamepadAxes = { x: 0, z: 0 };
    input.gamepadSprintHeld = false;
    input.gamepadSlideHeld = false;
    input.gamepadGripHeld = false;
    if (input.gamepadCastHeld) input.fishingCastReleased = true;
    input.gamepadCastHeld = false;
    for (const index of Object.keys(DIRECTION)) input.rhythmLaneInput.release(`gamepad:${index}`);
    if (this.previous[BUTTON.UP] && this.game.fishing.resultRecastCharging) {
      this.game.performFishingResultAction('recast', 'end', 'gamepad');
    }
    this.previous = [];
    this.padIndex = null;
    this.lastDialog = null;
  }

  poll(dt) {
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    const pad = (this.padIndex !== null ? pads[this.padIndex] : null)
      ?? [...pads].find((candidate) => candidate?.connected && candidate.mapping === 'standard');
    if (!pad?.connected || pad.mapping !== 'standard' || document.hidden) {
      if (this.padIndex !== null) this.clear();
      return;
    }
    if (this.padIndex !== pad.index) {
      this.clear();
      this.padIndex = pad.index;
      this.previous = Array.from({ length: 16 }, (_, index) => pressed(pad, index));
      this.game.hud.showToast?.('Controller connected • left stick move, right stick look, Start pause', 3);
      return;
    }

    const down = (index) => pressed(pad, index);
    const rising = (index) => down(index) && !this.previous[index];
    const falling = (index) => !down(index) && this.previous[index];
    const input = this.game.player.input;
    const meaningfulAxis = (pad.axes ?? []).some((value) => Math.abs(Number(value) || 0) > .35);
    if (meaningfulAxis || this.previous.some((wasDown, index) => !wasDown && down(index))) input.noteInputDevice?.('gamepad');
    const dialog = visibleDialog();
    const menuOpen = Boolean(dialog || this.game.localPause.active || this.game.isGameplayModalOpen());
    let stateChanged = false;

    // Recast leaves the result substate as soon as charging begins, so its release
    // must be observed independently of the currently displayed fishing substate.
    if (falling(BUTTON.UP) && this.game.fishing.resultRecastCharging) {
      this.game.performFishingResultAction('recast', 'end', 'gamepad');
    }

    const boundActionForButton = (index) => Object.entries(this.bindings)
      .find(([action, button]) => button === index && !['forward', 'backward', 'left', 'right'].includes(action))?.[0] ?? null;
    if (this.game.pauseMenu?.awaitingBinding?.device === 'gamepad') {
      const bindingIndex = Array.from({ length: Math.min(16, pad.buttons.length) }, (_, index) => index).find(rising);
      if (bindingIndex !== undefined) this.game.pauseMenu.captureGamepadBinding(bindingIndex);
      this.releaseGameplay(input);
      this.previous = Array.from({ length: 16 }, (_, index) => down(index));
      return;
    }

    if (rising(BUTTON.START) && !boundActionForButton(BUTTON.START)) {
      if (this.game.localPause.active) { this.game.setLocalPause(false); stateChanged = true; }
      else if (!menuOpen && !this.game.fishing.active) { this.game.setLocalPause(true); stateChanged = true; }
    }
    if (rising(BUTTON.B) && (menuOpen || !boundActionForButton(BUTTON.B))) {
      // Route cancellation through each owner's existing Escape handler so fishing,
      // benches, dialogs and Pause all retain their established cleanup path.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
      stateChanged = true;
    }

    if (stateChanged) {
      this.releaseGameplay(input);
      this.previous = Array.from({ length: 16 }, (_, index) => down(index));
      return;
    }

    if (menuOpen) {
      this.releaseGameplay(input);
      if (dialog) this.navigateDialog(dialog, pad, rising);
    } else if (this.game.fishing.resultActive) {
      this.releaseGameplay(input);
      for (const [indexText, action] of Object.entries(RESULT)) {
        const index = Number(indexText);
        if (rising(index)) this.game.performFishingResultAction(action, action === 'recast' ? 'start' : 'trigger', 'gamepad');
      }
    } else {
      input.gamepadAxes = { x: gamepadAxis(pad.axes?.[0]), z: -gamepadAxis(pad.axes?.[1]) };
      const actionDown = (action) => Number.isInteger(this.bindings[action]) && down(this.bindings[action]);
      const actionRising = (action) => Number.isInteger(this.bindings[action]) && rising(this.bindings[action]);
      input.gamepadSprintHeld = actionDown('sprint');
      input.gamepadSlideHeld = actionDown('slide');
      input.gamepadGripHeld = actionDown('grip');
      if (!input.gamepadGripHeld && !input.rawGripHeld) input.gripInteractionSuppressed = false;
      input.gamepadCastHeld = down(BUTTON.RT) && this.game.fishing.active && !input.rhythmCapture;
      if (input.gamepadCastHeld && rising(BUTTON.RT)) input.fishingCastPressed = true;
      if (falling(BUTTON.RT)) input.fishingCastReleased = true;
      if (actionRising('jump')) {
        if (this.game.fishing.active && !input.rhythmCapture) input.fishingHookPressed = true;
        else if (!input.rhythmCapture) input.jumpQueued = true;
      }
      if (actionRising('interact') && !input.rhythmCapture) input.mobileInteractionQueued = true;
      if (actionRising('fish') && !input.rhythmCapture) input.fishingToggleQueued = true;
      for (const action of ['inventory', 'journal', 'emotes', 'map']) {
        if (!actionRising(action) || input.rhythmCapture) continue;
        const code = loadKeyBindings()[action] ?? KEY_BINDING_DEFINITIONS[action]?.defaultCode;
        if (!code) continue;
        window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key: code, bubbles: true }));
      }
      for (const [indexText, lane] of Object.entries(DIRECTION)) {
        const index = Number(indexText);
        if (rising(index)) input.rhythmLaneInput.press(`gamepad:${index}`, lane, performance.now() / 1000);
        if (falling(index)) input.rhythmLaneInput.release(`gamepad:${index}`);
      }
      const lookX = gamepadAxis(pad.axes?.[2]);
      const lookY = gamepadAxis(pad.axes?.[3]);
      this.game.camera.yaw -= lookX * dt * 170;
      this.game.camera.pitch = Math.max(CAMERA_CONFIG.minPitch,
        Math.min(CAMERA_CONFIG.maxPitch, this.game.camera.pitch - lookY * dt * 115));
    }

    this.previous = Array.from({ length: 16 }, (_, index) => down(index));
  }

  releaseGameplay(input) {
    input.gamepadAxes = { x: 0, z: 0 };
    input.gamepadSprintHeld = false;
    input.gamepadSlideHeld = false;
    input.gamepadGripHeld = false;
    if (input.gamepadCastHeld) input.fishingCastReleased = true;
    input.gamepadCastHeld = false;
    for (const index of Object.keys(DIRECTION)) input.rhythmLaneInput.release(`gamepad:${index}`);
  }

  navigateDialog(dialog, pad, rising) {
    const items = focusables(dialog);
    if (!items.length) return;
    const tabs = [...dialog.querySelectorAll('[data-pause-tab], [data-collection-tab], [data-shop-tab], [data-appearance-tab], [role="tab"]')]
      .filter((element) => items.includes(element));
    if (tabs.length && (rising(BUTTON.LB) || rising(BUTTON.RB))) {
      const selected = tabs.findIndex((tab) => tab.getAttribute('aria-pressed') === 'true' || tab.getAttribute('aria-selected') === 'true');
      const step = rising(BUTTON.RB) ? 1 : -1;
      const tab = tabs[(selected + step + tabs.length) % tabs.length];
      tab.focus();
      tab.click();
      return;
    }
    if (this.lastDialog !== dialog) {
      this.lastDialog = dialog;
      this.navigationReadyAt = 0;
    }
    const now = performance.now();
    const vertical = gamepadAxis(pad.axes?.[1], .45);
    const horizontal = gamepadAxis(pad.axes?.[0], .45);
    const active = document.activeElement;
    const horizontalAdjust = rising(BUTTON.RIGHT) || horizontal > .5 ? 1
      : rising(BUTTON.LEFT) || horizontal < -.5 ? -1 : 0;
    if (horizontalAdjust && now >= this.navigationReadyAt && active?.matches?.('input[type="range"]')) {
      const step = Number(active.step) || 1;
      const minimum = Number(active.min) || 0;
      const maximum = Number(active.max) || 100;
      active.value = String(Math.max(minimum, Math.min(maximum, Number(active.value) + horizontalAdjust * step)));
      active.dispatchEvent(new Event('input', { bubbles: true }));
      active.dispatchEvent(new Event('change', { bubbles: true }));
      this.navigationReadyAt = now + 120;
      return;
    }
    if (horizontalAdjust && now >= this.navigationReadyAt && active?.matches?.('select')) {
      const options = [...active.options].filter((option) => !option.disabled);
      const selected = Math.max(0, options.findIndex((option) => option.value === active.value));
      active.value = options[(selected + horizontalAdjust + options.length) % options.length]?.value ?? active.value;
      active.dispatchEvent(new Event('change', { bubbles: true }));
      this.navigationReadyAt = now + 160;
      return;
    }
    const direction = rising(BUTTON.DOWN) || vertical > .5 ? 1
      : rising(BUTTON.UP) || vertical < -.5 ? -1
        : rising(BUTTON.RIGHT) || horizontal > .5 ? 1
          : rising(BUTTON.LEFT) || horizontal < -.5 ? -1 : 0;
    if (direction && now >= this.navigationReadyAt) {
      const activeIndex = items.indexOf(document.activeElement);
      items[(activeIndex + direction + items.length) % items.length].focus({ preventScroll: false });
      this.navigationReadyAt = now + 180;
    }
    if (rising(BUTTON.A)) {
      const focused = items.includes(document.activeElement) ? document.activeElement : items[0];
      if (focused !== document.activeElement) focused.focus();
      else if (focused.matches('select')) {
        const options = [...focused.options].filter((option) => !option.disabled);
        const selected = Math.max(0, options.findIndex((option) => option.value === focused.value));
        focused.value = options[(selected + 1) % options.length]?.value ?? focused.value;
        focused.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (focused.matches('button, [href], [role="button"], input[type="checkbox"], input[type="radio"]')) focused.click();
    }
  }

  destroy() {
    globalThis.window?.removeEventListener?.('reel-ascent:gamepad-bindings-changed', this.onBindingsChanged);
    this.clear();
  }
}
