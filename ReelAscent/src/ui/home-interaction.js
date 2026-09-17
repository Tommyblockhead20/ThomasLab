import { formatGamepadBinding, formatInputCode, loadGamepadBindings } from '../player/movement.js';

const MODAL_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open',
  'mountain-map-open', 'emote-menu-open', 'appearance-open', 'shop-open',
  'aquarium-open', 'boat-travel-open', 'trail-badges-open', 'pause-open'
]);

export class HomeInteractionController {
  constructor(world, player, progression, hud, camera = null) {
    this.world = world;
    this.player = player;
    this.progression = progression;
    this.hud = hud;
    this.camera = camera;
    this.prompt = document.querySelector('#home-interaction-prompt');
    this.eyebrow = this.prompt?.querySelector('.eyebrow') ?? null;
    this.label = document.querySelector('#home-interaction-label');
    this.button = document.querySelector('#home-interaction-action');
    this.current = null;
    this.pendingSeat = null;
    this.pendingSeatRequest = null;
    this.multiplayer = null;
    this.promptAllowed = true;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable || event.repeat || !this.player.input.matchesAction?.('interact', event.code)) return;
      this.refreshCurrent();
      if (!this.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.interact();
    };
    this.onClick = () => {
      // Re-check the player's live position so a prompt from the previous frame can never
      // open a location UI after a teleport, fall, or fast movement away from its trigger.
      this.refreshCurrent();
      this.interact();
    };
    window.addEventListener('keydown', this.onKeyDown, true);
    this.button?.addEventListener('click', this.onClick);
  }

  modalOpen() {
    return MODAL_CLASSES.some((name) => document.body.classList.contains(name));
  }

  setMultiplayer(client) {
    this.multiplayer = client;
    this.onBenchRoomState = () => {
      const seat = this.player.benchSeat;
      if (!seat || !this.isSharedSeat(this.world.homeInteractions?.find((entry) => entry.id === seat.id))) return;
      const occupants = client.room.benchSeats.get(seat.id) ?? [];
      if (client.state === 'in_room' && !occupants.includes(client.playerId)) this.player.clearBenchSeat();
      else if (occupants.includes(client.playerId)) this.player.setBenchSeatOccupancy(occupants, client.playerId);
    };
    this.onBenchConnectionState = () => {
      if (client.state === 'reconnecting' && this.player.benchSeat) this.player.clearBenchSeat();
    };
    client.addEventListener('roomstate', this.onBenchRoomState);
    client.addEventListener('statechange', this.onBenchConnectionState);
  }

  isSharedSeat(interaction) {
    return interaction?.action === 'bench' || /bench|fishing log/i.test(interaction?.seatKind ?? '');
  }

  enterSeat(interaction, rest = false) {
    if (this.pendingSeatRequest) return true;
    const shared = this.isSharedSeat(interaction) && this.multiplayer?.state === 'in_room';
    const enter = () => {
      if (this.modalOpen() || this.player.benchSeat) return false;
      const position = this.player.getPosition();
      if (Math.hypot(position.x - interaction.position.x,
        position.y - (interaction.position.y + .9), position.z - interaction.position.z) > (interaction.range ?? 3) + 1) return false;
      this.player.cancelEmote();
      if (rest) this.player.stamina.reset();
      this.player.setBenchSeat(interaction);
      if (shared) this.player.setBenchSeatOccupancy(this.multiplayer.room.benchSeats.get(interaction.id) ?? [this.multiplayer.playerId], this.multiplayer.playerId);
      this.camera?.setYaw?.(interaction.facingYaw);
      this.pendingSeat = { expiresAt: performance.now() + 1800 };
      this.hud.showToast?.(rest
        ? `Rested on the ${interaction.seatKind ?? 'seat'} • stamina restored • use ${this.actionLabel('interact')} or the prompt to stand.`
        : `Seated facing ${interaction.fishingLabel ?? 'the water'} • ${this.actionLabel('fish')} to fish • use the prompt to get up.`);
      return true;
    };
    if (!shared) return enter();
    this.pendingSeatRequest = interaction.id;
    this.multiplayer.requestBenchSeat(interaction.id, this.world.activeLocationId).then((granted) => {
      this.pendingSeatRequest = null;
      if (!granted || this.multiplayer.state !== 'in_room') {
        this.hud.showToast?.('Seat unavailable • this bench may already have two players.');
        return;
      }
      if (!enter()) this.multiplayer.releaseBenchSeat();
    });
    return true;
  }

  refreshCurrent() {
    const seatedInteraction = this.player.benchSeat
      ? this.world.homeInteractions?.find((interaction) => interaction.id === this.player.benchSeat.id) ?? null
      : null;
    this.current = this.modalOpen()
      ? null
      : seatedInteraction ?? (this.player.fishing?.active
        ? null
        : this.world.getNearestHomeInteraction?.(this.player.getPosition()) ?? null);
    return { seatedInteraction, current: this.current };
  }

  captureInteractionInput() {
    // Never steal a Grip edge from active climbing. Outside climbing, consume the one-frame
    // interaction edge unconditionally: a press made out of range must not be banked and
    // replayed when the player later walks into a trigger.
    if (['climbing', 'mantling'].includes(this.player.movementState)) {
      this.player.input.consumeMobileInteraction?.();
      return false;
    }
    const gripPressed = this.player.input.consumeGripInteraction?.();
    const clickPressed = this.player.input.consumeDeliberateClick?.();
    const mobilePressed = this.player.input.consumeMobileInteraction?.();
    // A seated player exits only through X/Interact, Jump, explicit Sit cancellation, or
    // clicking the visible prompt. Fishing/rhythm/camera mouse input never reaches this
    // generic world-interaction path.
    if (this.player.benchSeat && this.player.fishing?.active) return false;
    this.refreshCurrent();
    if (!this.current || (!gripPressed && !clickPressed && !mobilePressed)) return false;
    const handled = this.interact();
    if (handled) this.player.input.suppressGripUntilRelease?.();
    return handled;
  }

  update() {
    if (this.player.benchSeat) {
      const dynamic = this.world.homeInteractions?.find((interaction) => interaction.id === this.player.benchSeat.id && interaction.dynamicSeat);
      if (dynamic?.seatPosition) {
        this.player.benchSeat.seatPosition = { ...dynamic.seatPosition };
        this.player.benchSeat.basePosition = { ...dynamic.seatPosition };
        this.player.benchSeat.exitPosition = dynamic.exitPosition ? { ...dynamic.exitPosition } : this.player.benchSeat.exitPosition;
        this.player.benchSeat.facingYaw = dynamic.facingYaw;
      }
    }
    if (this.pendingSeat) {
      if (performance.now() > this.pendingSeat.expiresAt) {
        this.pendingSeat = null;
      } else if (this.player.grounded && this.player.movementState === 'grounded') {
        this.player.startEmote('sit');
        this.pendingSeat = null;
      }
    }
    const { seatedInteraction } = this.refreshCurrent();
    if (!this.prompt) return;
    this.prompt.hidden = !this.current || !this.promptAllowed;
    if (this.button) {
      const caps = this.button.querySelectorAll('kbd');
      if (caps[0]) caps[0].textContent = this.actionLabel('interact');
      if (caps[1]) caps[1].textContent = this.actionLabel('grip');
    }
    if (this.current && this.label) {
      if (this.eyebrow) this.eyebrow.textContent = ({
        boat: 'ISLAND FERRY', board: 'BOAT LADDER', shop: "OUTFITTER'S REACH", aquarium: 'GLASSWATER ISLE', appearance: 'HEARTHWARD ISLE', elevator: 'SKYREACH ELEVATOR'
      })[this.current.action] ?? 'WORLD INTERACTION';
      this.label.textContent = seatedInteraction
        ? (this.player.fishing?.active ? 'STOP FISHING & GET UP' : 'CLICK TO GET UP')
        : (this.isInteractionLocked(this.current) ? this.current.lockedLabel : this.current.label);
    }
  }

  actionLabel(action) {
    if (this.player.input.activeInputDevice === 'gamepad') return formatGamepadBinding(loadGamepadBindings()[action]);
    return formatInputCode(this.player.input.getBinding?.(action) ?? ({ interact: 'KeyX', grip: 'KeyG', fish: 'KeyF' })[action] ?? action);
  }

  isInteractionLocked(interaction) {
    return Boolean(interaction?.requiredMilestone
      && !this.progression?.saveSystem?.hasWorldMilestone?.(interaction.requiredMilestone));
  }

  setPromptAllowed(allowed) {
    this.promptAllowed = Boolean(allowed);
    if (this.prompt) this.prompt.hidden = !this.promptAllowed || !this.current;
  }

  interact() {
    const interaction = this.current;
    if (!interaction || this.modalOpen()) return false;
    if (this.player.benchSeat) {
      this.pendingSeat = null;
      this.player.clearBenchSeat();
      this.hud.showToast?.('Stood up safely.');
      return true;
    }
    if (interaction.action === 'appearance') {
      this.player.cancelEmote();
      this.dismissPrompt();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-appearance'));
      return true;
    }
    if (interaction.action === 'aquarium') {
      this.player.cancelEmote();
      this.dismissPrompt();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-aquarium'));
      return true;
    }
    if (interaction.action === 'shop') {
      this.player.cancelEmote();
      this.dismissPrompt();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-shop', {
        detail: { mode: interaction.shopMode ?? 'buy' }
      }));
      return true;
    }
    if (interaction.action === 'boat') {
      this.player.cancelEmote();
      this.dismissPrompt();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-boat', {
        detail: { currentLocationId: interaction.destinationId }
      }));
      return true;
    }
    if (interaction.action === 'board' && interaction.boardingPosition) {
      if (this.player.fishing?.active) this.player.exitFishing();
      this.player.cancelEmote();
      this.player.clearBenchSeat?.();
      this.player.teleport(interaction.boardingPosition, interaction.facingYaw);
      this.camera?.setYaw?.(interaction.facingYaw);
      this.dismissPrompt();
      this.hud.showToast?.('Boarded Bluewater Reach safely.');
      return true;
    }
    if (interaction.action === 'elevator' && interaction.destinationPosition) {
      if (this.isInteractionLocked(interaction)) {
        this.hud.showToast?.(interaction.lockedLabel || 'Elevator shortcut locked.');
        return false;
      }
      this.player.exitFishing?.();
      this.player.cancelEmote();
      this.player.clearBenchSeat?.();
      this.player.teleport(interaction.destinationPosition, interaction.facingYaw);
      this.camera?.setYaw?.(interaction.facingYaw);
      this.dismissPrompt();
      this.hud.showToast?.(interaction.label.replace(/^RIDE TO /, 'Arrived at '));
      return true;
    }
    if (interaction.action === 'rest' && interaction.seatPosition) {
      if (!this.player.grounded || this.player.movementState !== 'grounded') {
        this.hud.showToast?.('Stand beside the bed or chair to rest.');
        return false;
      }
      return this.enterSeat(interaction, true);
    }
    if (interaction.action === 'trophies') {
      this.player.cancelEmote();
      this.dismissPrompt();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-trail-badges'));
      return true;
    }
    if (interaction.action === 'bench') {
      if (!this.player.grounded || !['grounded', 'sliding'].includes(this.player.movementState)) {
        this.hud.showToast?.('Stand beside the seat to sit.');
        return false;
      }
      return this.enterSeat(interaction);
    }
    return false;
  }

  dismissPrompt() {
    this.current = null;
    if (this.prompt) this.prompt.hidden = true;
  }

  destroy() {
    this.multiplayer?.removeEventListener('roomstate', this.onBenchRoomState);
    this.multiplayer?.removeEventListener('statechange', this.onBenchConnectionState);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.button?.removeEventListener('click', this.onClick);
    if (this.prompt) this.prompt.hidden = true;
    this.pendingSeat = null;
  }
}
