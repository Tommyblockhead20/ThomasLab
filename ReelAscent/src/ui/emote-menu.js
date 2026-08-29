import { EMOTE_DEFINITIONS } from '../multiplayer/emotes.js';

const BLOCKING_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open', 'mountain-map-open', 'appearance-open'
]);

export class EmoteMenu {
  constructor(onSelect, canOpen = () => true) {
    this.onSelect = onSelect;
    this.canOpen = canOpen;
    this.screen = document.querySelector('#emote-menu');
    this.closeButton = document.querySelector('#close-emote-menu');
    this.isOpen = false;
    this.previousFocus = null;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable || event.repeat) return;
      if (event.code === 'KeyE') {
        if (!this.isOpen && (BLOCKING_CLASSES.some((name) => document.body.classList.contains(name)) || !this.canOpen())) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
      } else if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => {
      const id = event.target.closest('[data-emote-id]')?.dataset.emoteId;
      if (!EMOTE_DEFINITIONS.some((emote) => emote.id === id)) return;
      this.onSelect(id);
      this.close();
    };
    this.onCloseClick = () => this.close();
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    if (!this.screen || this.isOpen || !this.canOpen()) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('emote-menu-open');
    this.screen.querySelector('[data-emote-id]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('emote-menu-open');
    const target = this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas');
    target?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('emote-menu-open');
  }
}
