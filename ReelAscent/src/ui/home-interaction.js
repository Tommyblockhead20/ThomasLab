import { formatInputCode } from '../player/movement.js';

const MODAL_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open',
  'mountain-map-open', 'emote-menu-open', 'appearance-open', 'shop-open',
  'aquarium-open', 'boat-travel-open', 'pause-open'
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
    if (['climbing', 'mantling'].includes(this.player.movementState)) return false;
    const pressed = this.player.input.consumeGripInteraction?.();
    this.refreshCurrent();
    if (!this.current || !pressed) return false;
    const handled = this.interact();
    if (handled) this.player.input.suppressGripUntilRelease?.();
    return handled;
  }

  update() {
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
      if (caps[0]) caps[0].textContent = formatInputCode(this.player.input.getBinding?.('interact') ?? 'KeyX');
      if (caps[1]) caps[1].textContent = formatInputCode(this.player.input.getBinding?.('grip') ?? 'KeyG');
    }
    if (this.current && this.label) {
      if (this.eyebrow) this.eyebrow.textContent = ({
        boat: 'ISLAND FERRY', shop: "OUTFITTER'S REACH", aquarium: 'GLASSWATER ISLE', appearance: 'HEARTHWARD ISLE'
      })[this.current.action] ?? 'WORLD INTERACTION';
      this.label.textContent = seatedInteraction
        ? (this.player.fishing?.active ? 'STOP FISHING & GET UP' : 'CLICK TO GET UP')
        : this.current.label;
    }
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
    if (interaction.action === 'rest' && interaction.seatPosition) {
      if (!this.player.grounded || this.player.movementState !== 'grounded') {
        this.hud.showToast?.('Stand beside the bed or chair to rest.');
        return false;
      }
      this.player.cancelEmote();
      this.player.stamina.reset();
      this.player.setBenchSeat(interaction);
      this.camera?.setYaw?.(interaction.facingYaw);
      this.pendingSeat = { expiresAt: performance.now() + 1800 };
      this.hud.showToast?.(`Rested on the ${interaction.seatKind ?? 'seat'} • stamina restored • move or interact to stand.`);
      return true;
    }
    if (interaction.action === 'trophies') {
      const progress = this.world.homeProgressSummary ?? {};
      this.hud.showToast?.(
        `Cabin display • ${progress.discovered ?? 0} species • ${progress.aquarium ?? 0} kept • ${progress.summits ?? 0} summits`
      );
      return true;
    }
    if (interaction.action === 'bench') {
      if (!this.player.grounded || !['grounded', 'sliding'].includes(this.player.movementState)) {
        this.hud.showToast?.('Stand beside the summit bench to sit.');
        return false;
      }
      this.player.cancelEmote();
      this.player.setBenchSeat(interaction);
      this.camera?.setYaw?.(interaction.facingYaw);
      this.pendingSeat = { expiresAt: performance.now() + 1800 };
      this.hud.showToast?.('Seated facing Stoneveil Tarn • press F to fish • click the prompt to get up.');
      return true;
    }
    return false;
  }

  dismissPrompt() {
    this.current = null;
    if (this.prompt) this.prompt.hidden = true;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.button?.removeEventListener('click', this.onClick);
    if (this.prompt) this.prompt.hidden = true;
    this.pendingSeat = null;
  }
}
