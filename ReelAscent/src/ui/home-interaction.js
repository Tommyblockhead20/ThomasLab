const MODAL_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open',
  'mountain-map-open', 'emote-menu-open', 'appearance-open'
]);

export class HomeInteractionController {
  constructor(world, player, progression, hud) {
    this.world = world;
    this.player = player;
    this.progression = progression;
    this.hud = hud;
    this.prompt = document.querySelector('#home-interaction-prompt');
    this.label = document.querySelector('#home-interaction-label');
    this.button = document.querySelector('#home-interaction-action');
    this.current = null;
    this.pendingSeat = null;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable || event.repeat || event.code !== 'KeyX' || !this.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.interact();
    };
    this.onClick = () => this.interact();
    window.addEventListener('keydown', this.onKeyDown, true);
    this.button?.addEventListener('click', this.onClick);
  }

  modalOpen() {
    return MODAL_CLASSES.some((name) => document.body.classList.contains(name));
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
    this.current = this.modalOpen() || this.player.fishing?.active
      ? null
      : this.world.getNearestHomeInteraction?.(this.player.getPosition()) ?? null;
    if (!this.prompt) return;
    this.prompt.hidden = !this.current;
    if (this.current && this.label) this.label.textContent = this.current.label;
  }

  interact() {
    const interaction = this.current;
    if (!interaction || this.modalOpen()) return false;
    if (interaction.action === 'appearance') {
      this.player.cancelEmote();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-appearance'));
      return true;
    }
    if (interaction.action === 'aquarium') {
      this.player.cancelEmote();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-aquarium'));
      return true;
    }
    if (interaction.action === 'rest') {
      if (!this.player.grounded || this.player.movementState !== 'grounded') {
        this.hud.showToast?.('Stand beside the bed or chair to rest.');
        return false;
      }
      this.player.cancelEmote();
      this.player.stamina.reset();
      this.player.startEmote('sit');
      this.hud.showToast?.('Rested at the cabin • stamina restored.');
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
      this.player.teleport(interaction.seatPosition, interaction.facingYaw);
      this.pendingSeat = { expiresAt: performance.now() + 1800 };
      this.hud.showToast?.('Seated facing Crooked Peak Tarn • press F to fish.');
      return true;
    }
    return false;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.button?.removeEventListener('click', this.onClick);
    if (this.prompt) this.prompt.hidden = true;
    this.pendingSeat = null;
  }
}
