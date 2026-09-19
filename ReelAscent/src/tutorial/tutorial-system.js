import { formatGamepadBinding, formatInputCode, loadGamepadBindings, loadKeyBindings } from '../player/movement.js';

export const TUTORIAL_COPY = Object.freeze({
  fishing: (bindings) => `FISHING — Press ${formatInputCode(bindings.fish)} near water to cast. When something bites, follow the prompts.`,
  climbing: (bindings) => `CLIMBING — Hold ${formatInputCode(bindings.grip)} near rock, then move while gripping to climb.`,
  dock: () => 'BOAT TRAVEL — Use a dock or boat chart to travel between destinations.'
});

export class TutorialSystem {
  constructor(saveSystem, hud, getInputDevice = () => 'keyboard') {
    this.saveSystem = saveSystem;
    this.hud = hud;
    this.cooldown = 0;
    this.getInputDevice = getInputDevice;
  }

  update(dt, contextualAction) {
    this.cooldown = Math.max(0, this.cooldown - Math.max(0, Number(dt) || 0));
    if (this.cooldown > 0 || !contextualAction) return null;
    let kind = null;
    if (contextualAction.kind === 'fish') kind = 'fishing';
    else if (contextualAction.kind === 'grip') kind = 'climbing';
    else if (contextualAction.kind === 'interact'
      && /dock|boat|helm|travel/i.test(`${contextualAction.id} ${contextualAction.label}`)) kind = 'dock';
    if (!kind || this.saveSystem.hasSeenTutorial(kind)) return null;
    const controller = this.getInputDevice() === 'gamepad';
    const bindings = loadKeyBindings();
    const message = kind === 'fishing' && controller
      ? `FISHING — Press ${formatGamepadBinding(loadGamepadBindings().fish)} near water to cast. Use RT or D-Pad Up to cast and D-Pad Down to hook.`
      : kind === 'climbing' && controller
        ? `CLIMBING — Hold ${formatGamepadBinding(loadGamepadBindings().grip)} near rock, then move while gripping to climb.`
        : TUTORIAL_COPY[kind](bindings);
    if (!this.saveSystem.markTutorialSeen(kind)) return null;
    this.hud.showToast?.(message, 6);
    this.cooldown = 1.25;
    return kind;
  }
}
