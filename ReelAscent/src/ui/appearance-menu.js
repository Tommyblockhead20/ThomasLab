import {
  ACCESSORIES,
  AVATAR_TYPES,
  HAIR_COLORS,
  HAIR_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  normalizeAppearance
} from '../player/appearance.js';

const BLOCKING_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open',
  'mountain-map-open', 'emote-menu-open'
]);

const GROUPS = Object.freeze([
  Object.freeze({ key: 'avatarType', label: 'Avatar Type', options: AVATAR_TYPES }),
  Object.freeze({ key: 'skinTone', label: 'Skin Tone', options: SKIN_TONES, human: true, swatches: true }),
  Object.freeze({ key: 'shirtColor', label: 'Shirt / Top', options: SHIRT_COLORS, human: true, swatches: true }),
  Object.freeze({ key: 'pantsColor', label: 'Pants / Bottom', options: PANTS_COLORS, human: true, swatches: true }),
  Object.freeze({ key: 'hairStyle', label: 'Hair Style', options: HAIR_STYLES, human: true }),
  Object.freeze({ key: 'hairColor', label: 'Hair Color', options: HAIR_COLORS, human: true, swatches: true }),
  Object.freeze({ key: 'accessory', label: 'Accessory', options: ACCESSORIES, human: true })
]);

const colorCss = (color) => color
  ? `rgb(${color.map((value) => Math.round(value * 255)).join(' ')})`
  : '';

export class AppearanceMenu {
  constructor(progression, player) {
    this.progression = progression;
    this.player = player;
    this.screen = document.querySelector('#appearance-menu');
    this.content = document.querySelector('#appearance-content');
    this.status = document.querySelector('#appearance-status');
    this.closeButton = document.querySelector('#close-appearance');
    this.isOpen = false;
    this.previousFocus = null;
    this.renderedRevision = -1;

    this.onOpenRequest = () => this.open();
    this.onCloseClick = () => this.close();
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    this.onClick = (event) => {
      const option = event.target.closest('[data-appearance-key][data-appearance-value]');
      if (!option) return;
      const key = option.dataset.appearanceKey;
      const value = option.dataset.appearanceValue;
      if (!GROUPS.some((group) => group.key === key && group.options.some((entry) => entry.id === value))) return;
      const appearance = this.progression.setAppearance({ [key]: value });
      this.player.applyAppearance(appearance);
      if (this.status) this.status.textContent = 'Saved locally • multiplayer appearance updates live.';
      this.render(true);
    };

    window.addEventListener('reel-ascent:open-appearance', this.onOpenRequest);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  open() {
    if (!this.screen || this.isOpen || BLOCKING_CLASSES.some((name) => document.body.classList.contains(name))) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('appearance-open');
    this.render(true);
    this.screen.querySelector('[data-appearance-key]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('appearance-open');
    const target = this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas');
    target?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  update() {
    if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render();
  }

  render(force = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const appearance = normalizeAppearance(this.progression.getAppearance());
    const human = appearance.avatarType === 'human';
    this.content.replaceChildren(...GROUPS.map((group) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = 'appearance-group';
      fieldset.hidden = Boolean(group.human && !human);
      const legend = document.createElement('legend');
      legend.textContent = group.label;
      const options = document.createElement('div');
      options.className = 'appearance-options';
      for (const entry of group.options) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.appearanceKey = group.key;
        button.dataset.appearanceValue = entry.id;
        button.setAttribute('aria-pressed', String(appearance[group.key] === entry.id));
        if (group.swatches) {
          const swatch = document.createElement('span');
          swatch.className = 'appearance-swatch';
          swatch.style.backgroundColor = colorCss(entry.color);
          button.appendChild(swatch);
        }
        const label = document.createElement('span');
        label.textContent = entry.label;
        button.appendChild(label);
        options.appendChild(button);
      }
      fieldset.append(legend, options);
      return fieldset;
    }));
    this.renderedRevision = this.progression.revision;
  }

  destroy() {
    window.removeEventListener('reel-ascent:open-appearance', this.onOpenRequest);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('appearance-open');
  }
}
