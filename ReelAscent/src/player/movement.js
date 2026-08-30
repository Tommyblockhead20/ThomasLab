import { STAMINA_CONFIG } from '../config.js';

const MOVEMENT_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'KeyC',
  'Space',
  'KeyG',
  'KeyF',
  'KeyB',
  'KeyN',
  'F10',
  'Escape'
]);

const RHYTHM_LANES = Object.freeze({
  KeyA: 'A',
  ArrowLeft: 'A',
  KeyW: 'W',
  ArrowUp: 'W',
  KeyS: 'S',
  ArrowDown: 'S',
  KeyD: 'D',
  ArrowRight: 'D'
});

const TOUCH_RHYTHM_LANES = Object.freeze({
  left: 'A',
  up: 'W',
  down: 'S',
  right: 'D'
});

const TOUCH_DIRECTIONS = new Set(Object.keys(TOUCH_RHYTHM_LANES));
export const FISHING_CAST_CODES = Object.freeze(['ArrowUp', 'KeyW']);
export const FISHING_HOOK_CODES = Object.freeze(['ArrowDown', 'KeyS']);
export const SLIDE_CODES = Object.freeze(['KeyC']);

export function isSlideInputCode(code) {
  return SLIDE_CODES.includes(code);
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
      if (!this.forceMobile) this.setMobileMode(false);
      const wasHeld = this.held.has(event.code);
      const lane = RHYTHM_LANES[event.code];
      this.rhythmLaneInput.press(`key:${event.code}`, lane, performance.now() / 1000, event.repeat);
      if (MOVEMENT_KEYS.has(event.code)) {
        event.preventDefault();
      }
      if (event.code === 'Space' && !event.repeat) {
        this.jumpQueued = true;
      }
      if (event.code === 'KeyF' && !event.repeat) {
        this.fishingToggleQueued = true;
      }
      if (event.code === 'KeyG' && !event.repeat && !wasHeld) {
        this.gripInteractionQueued = true;
      }
      if (FISHING_CAST_CODES.includes(event.code) && !event.repeat && !wasHeld) {
        this.fishingCastPressed = true;
      }
      if (FISHING_HOOK_CODES.includes(event.code)
        && !this.rhythmCapture && !event.repeat && !wasHeld) {
        this.fishingHookPressed = true;
      }
      if (event.code === 'Escape' && !event.repeat) {
        this.cancelQueued = true;
      }
      if (event.code === 'KeyB' && !event.repeat) {
        this.forceBiteQueued = true;
      }
      if (event.code === 'KeyN' && !event.repeat) {
        this.debugFishQueued = 'easy';
      }
      if (event.code === 'F10' && !event.repeat) {
        this.debugFishQueued = 'hard';
      }
      this.held.add(event.code);
    };

    this.onKeyUp = (event) => {
      if (FISHING_CAST_CODES.includes(event.code) && this.held.has(event.code)) {
        this.fishingCastReleased = true;
      }
      this.held.delete(event.code);
      if (!this.rawGripHeld) this.gripInteractionSuppressed = false;
      this.rhythmLaneInput.release(`key:${event.code}`);
    };

    this.onMouseDown = (event) => {
      if (event.button !== 0) return;
      if (!this.forceMobile) this.setMobileMode(false);
      this.pressPrimary('mouse');
    };

    this.onMouseUp = (event) => {
      if (event.button !== 0) return;
      this.releasePrimary('mouse');
    };

    this.onBlur = () => {
      this.held.clear();
      this.rhythmLaneInput.clearActive();
      this.fishingHookPressed = false;
      this.clearTouchActions();
      this.resetPrimary();
    };
    this.onPointerLockChange = () => {
      if (document.pointerLockElement !== this.canvas) {
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
      if (action === 'grip') this.pressPrimary(`touch-${event.pointerId}`);
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

  pressPrimary(source) {
    if (this.primarySources.has(source)) return;
    if (!this.primaryHeld) {
      this.primaryPressed = true;
      this.gripInteractionQueued = true;
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

  getMoveAxes() {
    const left = this.held.has('KeyA') || this.held.has('ArrowLeft') || this.touchActions.has('left');
    const right = this.held.has('KeyD') || this.held.has('ArrowRight') || this.touchActions.has('right');
    const forward = this.held.has('KeyW') || this.held.has('ArrowUp') || this.touchActions.has('up');
    const backward = this.held.has('KeyS') || this.held.has('ArrowDown') || this.touchActions.has('down');

    return {
      x: Number(right) - Number(left),
      z: Number(forward) - Number(backward)
    };
  }

  get sprintHeld() {
    return this.held.has('ShiftLeft') || this.held.has('ShiftRight') || this.touchActions.has('sprint');
  }

  get slideHeld() {
    return SLIDE_CODES.some((code) => this.held.has(code))
      || this.touchActions.has('slide');
  }

  get rawGripHeld() {
    return this.held.has('KeyG')
      || this.touchActions.has('grip')
      || this.primaryHeld;
  }

  get gripHeld() {
    return !this.gripInteractionSuppressed && (this.held.has('KeyG')
      || this.touchActions.has('grip')
      || (this.primaryHeld && !this.primarySuppressed));
  }

  get fishingCastHeld() {
    return this.held.has('ArrowUp') || this.held.has('KeyW') || this.touchActions.has('up');
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
    this.primarySources.clear();
    this.primaryPressed = false;
    this.primaryReleased = false;
    this.primarySuppressed = false;
    this.gripInteractionQueued = false;
    this.gripInteractionSuppressed = false;
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
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('mouseup', this.onMouseUp);
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
        - this.config.sprintDrainPerSecond * Math.max(.1, sprintDrainMultiplier) * dt);
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
