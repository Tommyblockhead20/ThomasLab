import { STAMINA_CONFIG } from '../config.js';
import { isCheatsEnabled } from '../debug/cheat-gate.js';

export const KEY_BINDINGS_STORAGE_KEY = 'reel-ascent-key-bindings-v1';

export const KEY_BINDING_DEFINITIONS = Object.freeze({
  forward: Object.freeze({ label: 'Move Forward / Rhythm Up', defaultCode: 'KeyW', fixedCodes: Object.freeze(['ArrowUp']) }),
  backward: Object.freeze({ label: 'Move Backward / Rhythm Down', defaultCode: 'KeyS', fixedCodes: Object.freeze(['ArrowDown']) }),
  left: Object.freeze({ label: 'Move Left / Rhythm Left', defaultCode: 'KeyA', fixedCodes: Object.freeze(['ArrowLeft']) }),
  right: Object.freeze({ label: 'Move Right / Rhythm Right', defaultCode: 'KeyD', fixedCodes: Object.freeze(['ArrowRight']) }),
  sprint: Object.freeze({ label: 'Sprint', defaultCode: 'ShiftLeft', fixedCodes: Object.freeze(['ShiftRight']) }),
  jump: Object.freeze({ label: 'Jump / Push Off', defaultCode: 'Space', fixedCodes: Object.freeze([]) }),
  slide: Object.freeze({ label: 'Slide', defaultCode: 'KeyC', fixedCodes: Object.freeze([]) }),
  grip: Object.freeze({ label: 'Grip / World Grip-Interact', defaultCode: 'KeyG', fixedCodes: Object.freeze([]) }),
  fish: Object.freeze({ label: 'Fish', defaultCode: 'KeyF', fixedCodes: Object.freeze([]) }),
  interact: Object.freeze({ label: 'World Interact', defaultCode: 'KeyX', fixedCodes: Object.freeze([]) }),
  inventory: Object.freeze({ label: 'Inventory', defaultCode: 'KeyI', fixedCodes: Object.freeze([]) }),
  journal: Object.freeze({ label: 'Creature Journal', defaultCode: 'KeyJ', fixedCodes: Object.freeze([]) }),
  emotes: Object.freeze({ label: 'Emotes', defaultCode: 'KeyE', fixedCodes: Object.freeze([]) }),
  map: Object.freeze({ label: 'Use Map / GPS', defaultCode: 'KeyV', fixedCodes: Object.freeze([]) })
});

export const DEFAULT_KEY_BINDINGS = Object.freeze(Object.fromEntries(
  Object.entries(KEY_BINDING_DEFINITIONS).map(([action, definition]) => [action, definition.defaultCode])
));
// Pause and hidden playtest/debug controls remain intentionally unavailable here.
const RESERVED_BINDING_CODES = new Set([
  'Escape', 'Home', 'F1', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10',
  'KeyB', 'KeyN', 'Digit0', 'Digit7', 'Digit8', 'Digit9'
]);

const bindingStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

export function normalizeKeyBindings(value = {}) {
  const result = { ...DEFAULT_KEY_BINDINGS };
  for (const [action, definition] of Object.entries(KEY_BINDING_DEFINITIONS)) {
    const code = value?.[action];
    if (typeof code === 'string' && code && !RESERVED_BINDING_CODES.has(code)) result[action] = code.slice(0, 40);
    else result[action] = definition.defaultCode;
  }
  return result;
}

export function loadKeyBindings() {
  try {
    const raw = bindingStorage()?.getItem(KEY_BINDINGS_STORAGE_KEY);
    return normalizeKeyBindings(raw ? JSON.parse(raw) : {});
  } catch { return { ...DEFAULT_KEY_BINDINGS }; }
}

export function saveKeyBindings(bindings) {
  const normalized = normalizeKeyBindings(bindings);
  try { bindingStorage()?.setItem(KEY_BINDINGS_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
  globalThis.window?.dispatchEvent?.(new CustomEvent('reel-ascent:key-bindings-changed', { detail: normalized }));
  return normalized;
}

export function resetKeyBindings() { return saveKeyBindings(DEFAULT_KEY_BINDINGS); }

export function setKeyBinding(action, code, bindings = loadKeyBindings()) {
  if (!KEY_BINDING_DEFINITIONS[action]) return { ok: false, reason: 'Unknown action', bindings };
  if (typeof code !== 'string' || !code || RESERVED_BINDING_CODES.has(code)) {
    return { ok: false, reason: 'That key is reserved by the game.', bindings };
  }
  for (const [otherAction, otherCode] of Object.entries(bindings)) {
    const definition = KEY_BINDING_DEFINITIONS[otherAction];
    const occupiedCodes = new Set([otherCode, ...(definition?.fixedCodes ?? [])]);
    if (otherAction !== action && occupiedCodes.has(code)) return {
      ok: false,
      reason: `${formatInputCode(code)} is already used by ${definition?.label ?? otherAction}.`,
      bindings
    };
  }
  return { ok: true, bindings: saveKeyBindings({ ...bindings, [action]: code }) };
}

export function formatInputCode(code = '') {
  if (code === 'Space') return 'Space';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code.replace(/Left$/, ' L').replace(/Right$/, ' R');
}

export function bindingCodes(action, bindings = loadKeyBindings()) {
  const definition = KEY_BINDING_DEFINITIONS[action];
  if (!definition) return [];
  return [...new Set([bindings[action] ?? definition.defaultCode, ...definition.fixedCodes])];
}

export function isBoundActionCode(action, code, bindings = loadKeyBindings()) {
  return bindingCodes(action, bindings).includes(code);
}

const RHYTHM_ACTIONS = Object.freeze({ left: 'A', forward: 'W', backward: 'S', right: 'D' });
export function rhythmLaneForCode(code, bindings = loadKeyBindings()) {
  for (const [action, lane] of Object.entries(RHYTHM_ACTIONS)) if (isBoundActionCode(action, code, bindings)) return lane;
  return null;
}

const RHYTHM_LANES = Object.freeze({
  KeyA: 'A', ArrowLeft: 'A', KeyW: 'W', ArrowUp: 'W', KeyS: 'S', ArrowDown: 'S', KeyD: 'D', ArrowRight: 'D'
});
const TOUCH_RHYTHM_LANES = Object.freeze({ left: 'A', up: 'W', down: 'S', right: 'D' });
const TOUCH_DIRECTIONS = new Set(Object.keys(TOUCH_RHYTHM_LANES));
export const FISHING_CAST_CODES = Object.freeze(['ArrowUp', 'KeyW']);
export const FISHING_HOOK_CODES = Object.freeze(['ArrowDown', 'KeyS']);
export const SLIDE_CODES = Object.freeze(['KeyC']);
export function isSlideInputCode(code) { return isBoundActionCode('slide', code); }
export function isEditableInputTarget(target) {
  const tagName = target?.tagName?.toLowerCase?.();
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName));
}

// A lane may have more than one physical source (for example ArrowRight and D, or two
// touch pointers). Press edges are tracked per source while hold ownership is aggregated
// per lane. Releasing a same-lane tap therefore cannot cancel an older active hold.
export class RhythmLaneInputState {
  constructor() {
    this.activeSources = new Map();
    this.suppressedSources = new Set();
    this.queue = [];
    this.capturing = false;
  }

  press(source, lane, time, repeat = false) {
    if (!lane) return false;
    const wasHeld = this.activeSources.has(source);
    if (!wasHeld) this.activeSources.set(source, lane);
    if (!this.capturing || repeat || wasHeld || this.suppressedSources.has(source)) return false;
    this.queue.push({ lane, time, source });
    return true;
  }

  release(source) {
    this.activeSources.delete(source);
    this.suppressedSources.delete(source);
  }

  beginCapture() {
    this.capturing = true;
    this.queue.length = 0;
    this.suppressedSources = new Set(this.activeSources.keys());
  }

  endCapture() {
    this.capturing = false;
    this.queue.length = 0;
    this.suppressedSources.clear();
  }

  clearActive() {
    this.activeSources.clear();
    this.queue.length = 0;
    this.suppressedSources.clear();
  }

  consume() {
    return this.queue.splice(0);
  }

  isLaneHeld(lane) {
    return [...this.activeSources.entries()].some(([source, sourceLane]) => (
      sourceLane === lane && !this.suppressedSources.has(source)
    ));
  }
}

export function touchActionHeld(pointerMap, action) {
  return [...pointerMap.values()].some((entry) => entry.action === action);
}

export class PlayerInput {
  constructor(canvas) {
    this.canvas = canvas;
    this.bindings = loadKeyBindings();
    this.onBindingsChanged = (event) => {
      this.bindings = normalizeKeyBindings(event.detail ?? loadKeyBindings());
      this.held.clear();
      this.rhythmLaneInput?.clearActive?.();
    };
    globalThis.window?.addEventListener?.('reel-ascent:key-bindings-changed', this.onBindingsChanged);
    this.held = new Set();
    this.jumpQueued = false;
    this.fishingToggleQueued = false;
    this.cancelQueued = false;
    this.forceBiteQueued = false;
    this.debugFishQueued = null;
    this.fishingCastPressed = false;
    this.fishingCastReleased = false;
    this.fishingHookPressed = false;
    this.primarySources = new Set();
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.primarySuppressed = false;
    this.gripInteractionQueued = false;
    this.gripInteractionSuppressed = false;
    this.deliberateClickQueued = false;
    this.fishingActive = false;
    this.mouseGesture = null;
    this.rhythmCapture = false;
    this.rhythmLaneInput = new RhythmLaneInputState();
    this.touchPointers = new Map();
    this.touchActions = new Set();
    this.mobileControls = document.querySelector('#mobile-controls');
    this.forceMobile = new URLSearchParams(window.location.search).get('mobile') === '1';
    const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const finePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches ?? false;
    this.mobileMode = this.forceMobile || (navigator.maxTouchPoints > 0 && coarsePointer && !finePointer);
    this.setMobileMode(this.mobileMode);

    this.onKeyDown = (event) => {
      if (isEditableInputTarget(event.target)) return;
      if (!this.forceMobile) this.setMobileMode(false);
      const wasHeld = this.held.has(event.code);
      const lane = rhythmLaneForCode(event.code, this.bindings);
      this.rhythmLaneInput.press(`key:${event.code}`, lane, performance.now() / 1000, event.repeat);
      if (this.matchesAnyGameplayCode(event.code) || ['KeyB', 'KeyN', 'F10', 'Escape'].includes(event.code)) event.preventDefault();
      if (this.matchesAction('jump', event.code) && !event.repeat) {
        this.jumpQueued = true;
      }
      if (this.matchesAction('fish', event.code) && !event.repeat) {
        this.fishingToggleQueued = true;
      }
      if (this.matchesAction('grip', event.code) && !event.repeat && !wasHeld) {
        this.gripInteractionQueued = true;
      }
      if (this.matchesAction('forward', event.code) && !event.repeat && !wasHeld) {
        this.fishingCastPressed = true;
      }
      if (this.matchesAction('backward', event.code)
        && !this.rhythmCapture && !event.repeat && !wasHeld) {
        this.fishingHookPressed = true;
      }
      if (event.code === 'Escape' && !event.repeat) {
        this.cancelQueued = true;
      }
      if (event.code === 'KeyB' && !event.repeat && isCheatsEnabled()) {
        this.forceBiteQueued = true;
      }
      if (event.code === 'KeyN' && !event.repeat && isCheatsEnabled()) {
        this.debugFishQueued = 'easy';
      }
      if (event.code === 'F10' && !event.repeat && isCheatsEnabled()) {
        this.debugFishQueued = 'hard';
      }
      this.held.add(event.code);
    };

    this.onKeyUp = (event) => {
      if (isEditableInputTarget(event.target)) {
        this.held.delete(event.code);
        this.rhythmLaneInput.release(`key:${event.code}`);
        return;
      }
      if (this.matchesAction('forward', event.code) && this.held.has(event.code)) {
        this.fishingCastReleased = true;
      }
      this.held.delete(event.code);
      if (!this.rawGripHeld) this.gripInteractionSuppressed = false;
      this.rhythmLaneInput.release(`key:${event.code}`);
    };

    this.onMouseDown = (event) => {
      if (event.button !== 0) return;
      if (!this.forceMobile) this.setMobileMode(false);
      // Mouse-primary remains an immediate Grip/fishing press, but it is not a world-UI
      // interaction. World interactions use X/G or the actual prompt button, preventing a
      // camera drag/pointer-lock click from also opening a shop, boat, seat, or aquarium.
      this.mouseGesture = {
        x: event.clientX, y: event.clientY, startedAt: performance.now(), moved: 0,
        pointerLocked: document.pointerLockElement === this.canvas,
        becameGrip: false, cameraDrag: false,
        holdTimer: null
      };
      if (this.mouseGesture.pointerLocked || this.fishingActive) {
        this.mouseGesture.becameGrip = true;
        this.pressPrimary('mouse', false);
      } else {
        const gesture = this.mouseGesture;
        gesture.holdTimer = globalThis.setTimeout(() => {
          if (this.mouseGesture !== gesture || gesture.becameGrip || gesture.cameraDrag) return;
          gesture.becameGrip = true;
          this.pressPrimary('mouse', false);
        }, 140);
      }
    };

    this.onMouseUp = (event) => {
      if (event.button !== 0) return;
      const gesture = this.mouseGesture;
      if (gesture?.holdTimer) globalThis.clearTimeout(gesture.holdTimer);
      if (gesture?.becameGrip) this.releasePrimary('mouse');
      else if (gesture && !gesture.pointerLocked && document.pointerLockElement !== this.canvas
        && !gesture.cameraDrag && gesture.moved <= 6 && performance.now() - gesture.startedAt <= 350) {
        this.deliberateClickQueued = true;
      }
      this.mouseGesture = null;
    };

    this.onMouseMove = (event) => {
      if (!this.mouseGesture) return;
      this.mouseGesture.moved += Math.abs(event.movementX) + Math.abs(event.movementY);
      if (!this.mouseGesture.becameGrip && this.mouseGesture.moved > 6) {
        if (this.mouseGesture.holdTimer) globalThis.clearTimeout(this.mouseGesture.holdTimer);
        // A moving un-pointerlocked gesture belongs exclusively to the orbit camera. Grip
        // is a stationary hold (or a pointer-locked press), so drag cannot do both jobs.
        this.mouseGesture.cameraDrag = true;
      }
    };

    this.onBlur = () => {
      this.held.clear();
      this.rhythmLaneInput.clearActive();
      this.fishingHookPressed = false;
      this.clearTouchActions();
      this.resetPrimary();
    };
    this.onPointerLockChange = () => {
      if (document.pointerLockElement === this.canvas) {
        // Firefox can deliver the click which acquired pointer lock as a gameplay press.
        // That press must never survive long enough to activate an interaction later.
        this.gripInteractionQueued = false;
        this.primaryPressed = false;
        this.primarySuppressed = this.primaryHeld;
        this.gripInteractionSuppressed = this.rawGripHeld;
        this.deliberateClickQueued = false;
      } else {
        this.held.clear();
        this.rhythmLaneInput.clearActive();
        this.fishingHookPressed = false;
        this.clearTouchActions();
        this.resetPrimary();
      }
    };
    this.onVisibilityChange = () => {
      if (document.hidden) {
        this.held.clear();
        this.rhythmLaneInput.clearActive();
        this.fishingHookPressed = false;
        this.clearTouchActions();
        this.resetPrimary();
      }
    };

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.mobileButtons = [...document.querySelectorAll('[data-touch-action]')];
    this.onTouchActionDown = (event) => {
      if ((event.pointerType === 'mouse' && !this.forceMobile) || event.button > 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.setMobileMode(true);
      const action = event.currentTarget.dataset.touchAction;
      const alreadyHeld = this.touchActions.has(action);
      const rhythmPress = this.rhythmCapture && TOUCH_DIRECTIONS.has(action);
      const rhythmSource = `touch:${event.pointerId}`;
      const rhythmLane = TOUCH_RHYTHM_LANES[action];
      this.rhythmLaneInput.press(rhythmSource, rhythmLane, performance.now() / 1000);
      this.touchPointers.set(event.pointerId, { action, rhythmPress, rhythmSource });
      event.currentTarget.setPointerCapture?.(event.pointerId);

      if (rhythmPress) {
        this.touchActions.add(action);
        return;
      }

      this.touchActions.add(action);
      if (action === 'up' && !alreadyHeld) this.fishingCastPressed = true;
      if (action === 'down' && !alreadyHeld) this.fishingHookPressed = true;
      if (action === 'jump' && !alreadyHeld) this.jumpQueued = true;
      if (action === 'fish' && !alreadyHeld) this.fishingToggleQueued = true;
      if (action === 'grip') this.pressPrimary(`touch-${event.pointerId}`, false);
    };
    this.onTouchActionUp = (event) => {
      const pointer = this.touchPointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      event.stopPropagation();
      this.touchPointers.delete(event.pointerId);
      this.rhythmLaneInput.release(pointer.rhythmSource);
      if (pointer.action === 'grip') this.releasePrimary(`touch-${event.pointerId}`);
      const stillHeld = touchActionHeld(this.touchPointers, pointer.action);
      if (!stillHeld) {
        if (pointer.action === 'up') this.fishingCastReleased = true;
        this.touchActions.delete(pointer.action);
      }
    };
    for (const button of this.mobileButtons) {
      button.addEventListener('pointerdown', this.onTouchActionDown);
      button.addEventListener('pointerup', this.onTouchActionUp);
      button.addEventListener('pointercancel', this.onTouchActionUp);
      button.addEventListener('lostpointercapture', this.onTouchActionUp);
    }
  }

  setMobileMode(enabled) {
    this.mobileMode = this.forceMobile || enabled;
    document.body.classList.toggle('mobile-mode', this.mobileMode);
    if (this.mobileControls) this.mobileControls.hidden = !this.mobileMode;
  }

  clearTouchActions() {
    this.touchPointers.clear();
    this.touchActions.clear();
    for (const source of [...this.rhythmLaneInput.activeSources.keys()]) {
      if (source.startsWith('touch:')) this.rhythmLaneInput.release(source);
    }
  }

  pressPrimary(source, queueInteraction = true) {
    if (this.primarySources.has(source)) return;
    if (!this.primaryHeld) {
      this.primaryPressed = true;
      if (queueInteraction) this.gripInteractionQueued = true;
    }
    this.primarySources.add(source);
  }

  releasePrimary(source) {
    if (!this.primarySources.delete(source)) return;
    if (!this.primaryHeld) {
      this.primaryReleased = true;
      this.primarySuppressed = false;
    }
    if (!this.rawGripHeld) this.gripInteractionSuppressed = false;
  }

  get primaryHeld() {
    return this.primarySources.size > 0;
  }

  matchesAction(action, code) {
    return isBoundActionCode(action, code, this.bindings);
  }

  getBinding(action) { return this.bindings[action] ?? KEY_BINDING_DEFINITIONS[action]?.defaultCode ?? ''; }

  matchesAnyGameplayCode(code) {
    return Object.keys(KEY_BINDING_DEFINITIONS).some((action) => this.matchesAction(action, code));
  }

  getMoveAxes() {
    const heldAction = (action) => bindingCodes(action, this.bindings).some((code) => this.held.has(code));
    const left = heldAction('left') || this.touchActions.has('left');
    const right = heldAction('right') || this.touchActions.has('right');
    const forward = heldAction('forward') || this.touchActions.has('up');
    const backward = heldAction('backward') || this.touchActions.has('down');

    return {
      x: Number(right) - Number(left),
      z: Number(forward) - Number(backward)
    };
  }

  get sprintHeld() {
    return bindingCodes('sprint', this.bindings).some((code) => this.held.has(code)) || this.touchActions.has('sprint');
  }

  get slideHeld() {
    return bindingCodes('slide', this.bindings).some((code) => this.held.has(code)) || this.touchActions.has('slide');
  }

  get rawGripHeld() {
    return bindingCodes('grip', this.bindings).some((code) => this.held.has(code)) || this.touchActions.has('grip') || this.primaryHeld;
  }

  get gripHeld() {
    return !this.gripInteractionSuppressed && (bindingCodes('grip', this.bindings).some((code) => this.held.has(code))
      || this.touchActions.has('grip') || (this.primaryHeld && !this.primarySuppressed));
  }

  get fishingCastHeld() {
    return bindingCodes('forward', this.bindings).some((code) => this.held.has(code)) || this.touchActions.has('up');
  }

  consumeJump() {
    const queued = this.jumpQueued;
    this.jumpQueued = false;
    return queued;
  }

  consumeFishingToggle() {
    const queued = this.fishingToggleQueued;
    this.fishingToggleQueued = false;
    return queued;
  }

  consumeFishingCastPressed() {
    const queued = this.fishingCastPressed;
    this.fishingCastPressed = false;
    return queued;
  }

  consumeFishingCastReleased() {
    const queued = this.fishingCastReleased;
    this.fishingCastReleased = false;
    return queued;
  }

  consumeFishingHookPressed() {
    const queued = this.fishingHookPressed;
    this.fishingHookPressed = false;
    return queued;
  }

  consumeCancel() {
    const queued = this.cancelQueued;
    this.cancelQueued = false;
    return queued;
  }

  consumeForceBite() {
    const queued = this.forceBiteQueued;
    this.forceBiteQueued = false;
    return queued;
  }

  consumeDebugFish() {
    const queued = this.debugFishQueued;
    this.debugFishQueued = null;
    return queued;
  }

  consumePrimaryPressed() {
    const queued = this.primaryPressed && !this.primarySuppressed;
    this.primaryPressed = false;
    return queued;
  }

  consumePrimaryReleased() {
    const queued = this.primaryReleased;
    this.primaryReleased = false;
    return queued;
  }

  consumeGripInteraction() {
    const queued = this.gripInteractionQueued;
    this.gripInteractionQueued = false;
    return queued;
  }

  consumeDeliberateClick() {
    const queued = this.deliberateClickQueued;
    this.deliberateClickQueued = false;
    return queued;
  }

  hasDeliberateClick() { return this.deliberateClickQueued; }
  discardDeliberateClick() { this.deliberateClickQueued = false; }
  setFishingActive(active) { this.fishingActive = Boolean(active); }

  suppressGripUntilRelease() {
    this.gripInteractionSuppressed = this.rawGripHeld;
    this.suppressPrimaryUntilRelease();
  }

  discardPrimaryEdges() {
    this.primaryPressed = false;
    this.primaryReleased = false;
  }

  suppressPrimaryUntilRelease() {
    this.primarySuppressed = this.primaryHeld;
    this.discardPrimaryEdges();
  }

  resetPrimary() {
    if (this.mouseGesture?.holdTimer) globalThis.clearTimeout(this.mouseGesture.holdTimer);
    this.primarySources.clear();
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.primarySuppressed = false;
    this.gripInteractionQueued = false;
    this.gripInteractionSuppressed = false;
    this.deliberateClickQueued = false;
    this.mouseGesture = null;
  }

  beginRhythmCapture() {
    this.rhythmCapture = true;
    this.rhythmLaneInput.beginCapture();
  }

  endRhythmCapture() {
    this.rhythmCapture = false;
    this.rhythmLaneInput.endCapture();
  }

  consumeRhythmInputs() {
    return this.rhythmLaneInput.consume();
  }

  isRhythmLaneHeld(lane) {
    return this.rhythmLaneInput.isLaneHeld(lane);
  }

  destroy() {
    this.resetPrimary();
    globalThis.window?.removeEventListener?.('reel-ascent:key-bindings-changed', this.onBindingsChanged);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    for (const button of this.mobileButtons) {
      button.removeEventListener('pointerdown', this.onTouchActionDown);
      button.removeEventListener('pointerup', this.onTouchActionUp);
      button.removeEventListener('pointercancel', this.onTouchActionUp);
      button.removeEventListener('lostpointercapture', this.onTouchActionUp);
    }
    document.body.classList.remove('mobile-mode');
  }
}

export { RHYTHM_LANES, TOUCH_RHYTHM_LANES };

// Sprint and future climbing both draw from this resource.
export class StaminaResource {
  constructor(config = STAMINA_CONFIG) {
    this.config = config;
    this.value = config.maximum;
    this.regenerationDelay = 0;
    this.sprintLocked = false;
    this.unlimited = false;
  }

  update(dt, wantsSprint, isMoving, canRegenerate = true, sprintDrainMultiplier = 1) {
    if (this.unlimited) {
      this.value = this.config.maximum;
      this.regenerationDelay = 0;
      this.sprintLocked = false;
      return wantsSprint && isMoving;
    }
    if (this.sprintLocked && this.value >= this.config.sprintResumeThreshold) {
      this.sprintLocked = false;
    }

    const sprinting = wantsSprint && isMoving && !this.sprintLocked && this.value > 0;

    if (sprinting) {
      this.value = Math.max(0, this.value
        - this.config.sprintDrainPerSecond * Math.max(0, sprintDrainMultiplier) * dt);
      this.regenerationDelay = this.config.regenerationDelay;
      if (this.value === 0) {
        this.sprintLocked = true;
      }
    } else if (this.regenerationDelay > 0) {
      this.regenerationDelay = Math.max(0, this.regenerationDelay - dt);
    } else if (canRegenerate) {
      this.value = Math.min(
        this.config.maximum,
        this.value + this.config.regenerationPerSecond * dt
      );
    }

    return sprinting;
  }

  spend(amount, regenerationDelay = this.config.regenerationDelay) {
    if (this.unlimited) {
      this.value = this.config.maximum;
      return true;
    }
    this.value = Math.max(0, this.value - Math.max(0, amount));
    this.regenerationDelay = Math.max(this.regenerationDelay, regenerationDelay);
    return this.value > 0;
  }

  reset() {
    this.value = this.config.maximum;
    this.regenerationDelay = 0;
    this.sprintLocked = false;
  }

  setUnlimited(enabled) {
    this.unlimited = Boolean(enabled);
    if (this.unlimited) {
      this.value = this.config.maximum;
      this.regenerationDelay = 0;
      this.sprintLocked = false;
    }
    return this.unlimited;
  }

  get normalized() {
    return this.value / this.config.maximum;
  }
}

export function moveToward(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maximumDelta;
}
