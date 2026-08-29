const BLOCKING_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open', 'emote-menu-open', 'appearance-open'
]);

export class MountainMapMenu {
  constructor() {
    this.screen = document.querySelector('#mountain-map');
    this.closeButton = document.querySelector('#close-mountain-map');
    this.isOpen = false;
    this.previousFocus = null;
    this.onOpenRequest = () => this.open();
    this.onCloseClick = () => this.close();
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener('reel-ascent:open-map', this.onOpenRequest);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  open() {
    if (!this.screen || this.isOpen || BLOCKING_CLASSES.some((name) => document.body.classList.contains(name))) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('mountain-map-open');
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('mountain-map-open');
    const target = this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas');
    target?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  destroy() {
    window.removeEventListener('reel-ascent:open-map', this.onOpenRequest);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('mountain-map-open');
  }
}
