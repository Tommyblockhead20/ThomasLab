import {
  AVATAR_TYPES,
  ACCESSORY_COLORS,
  BACK_ACCESSORIES,
  BACKPACK_COLORS,
  BEARD_STYLES,
  BLOB_COLORS,
  DEFAULT_APPEARANCE,
  EYEWEAR,
  FACE_ACCESSORIES,
  HAIR_COLORS,
  HAIR_STYLES,
  HAT_COLORS,
  HEADWEAR,
  MUSTACHE_STYLES,
  PANTS_COLORS,
  SHIRT_COLORS,
  SKIN_TONES,
  normalizeAppearance,
  randomizeAppearance,
} from '../player/appearance.js';
import { AppearancePreview } from './appearance-preview.js';
import {
  GENERIC_COSMETIC_VISUAL_DUPLICATE_GROUPS,
  cosmeticVisualDuplicateGroup
} from '../progression/cosmetics.js';

const BLOCKING_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open',
  'mountain-map-open', 'emote-menu-open', 'trail-badges-open'
]);

const GROUPS = Object.freeze([
  Object.freeze({ key: 'avatarType', label: 'Avatar Type', options: AVATAR_TYPES, section: 'body' }),
  Object.freeze({ key: 'skinTone', label: 'Skin Tone', options: SKIN_TONES, human: true, slider: true, section: 'body', compact: true }),
  Object.freeze({ key: 'shirtColor', label: 'Shirt Color', options: SHIRT_COLORS, human: true, swatches: true, section: 'body', compact: true }),
  Object.freeze({ key: 'pantsColor', label: 'Pants Color', options: PANTS_COLORS, human: true, swatches: true, section: 'body', compact: true }),
  Object.freeze({ key: 'blobColor', label: 'Blob Color', options: BLOB_COLORS, blob: true, swatches: true, section: 'body', compact: true }),
  Object.freeze({ key: 'hairStyle', label: 'Hair Style', options: HAIR_STYLES, human: true, section: 'hair' }),
  Object.freeze({ key: 'hairColor', label: 'Hair / Facial Hair Color', options: HAIR_COLORS, human: true, swatches: true, section: 'hair' }),
  Object.freeze({ key: 'beardStyle', label: 'Beard', options: BEARD_STYLES, human: true, section: 'hair' }),
  Object.freeze({ key: 'mustacheStyle', label: 'Mustache', options: MUSTACHE_STYLES, human: true, section: 'hair' }),
  Object.freeze({ key: 'headwear', label: 'Hats', options: HEADWEAR, cosmetic: true, section: 'face' }),
  Object.freeze({ key: 'eyewear', label: 'Glasses / Goggles', options: EYEWEAR, cosmetic: true, section: 'face' }),
  Object.freeze({ key: 'faceAccessory', label: 'Masks', options: FACE_ACCESSORIES, cosmetic: true, section: 'face', filter: 'face' }),
  Object.freeze({ key: 'hatColor', label: 'Hat Color', options: HAT_COLORS, swatches: true, section: 'face', compact: true }),
  Object.freeze({ key: 'accessoryColor', label: 'Accessory Color', options: ACCESSORY_COLORS, swatches: true, section: 'face', compact: true }),
  Object.freeze({ key: 'faceAccessory', label: 'Neckwear', options: FACE_ACCESSORIES, cosmetic: true, section: 'neck', filter: 'neck' }),
  Object.freeze({ key: 'accessoryColor', label: 'Accessory Color', options: ACCESSORY_COLORS, swatches: true, section: 'neck', compact: true }),
  Object.freeze({ key: 'backAccessory', label: 'Back Gear', options: BACK_ACCESSORIES, cosmetic: true, section: 'back' }),
  Object.freeze({ key: 'accessoryColor', label: 'Accessory Color', options: ACCESSORY_COLORS, swatches: true, section: 'back', compact: true }),
  Object.freeze({ key: 'backpackColor', label: 'Trail Backpack Color', options: BACKPACK_COLORS, human: true, swatches: true, section: 'back', compact: true })
]);

const FACE_ACCESSORY_VISUALS = new Set(['bandana']);
const groupOptions = (group) => group.options.filter((entry) => {
  if (entry.id === 'none' || !group.filter) return true;
  return group.filter === 'face'
    ? FACE_ACCESSORY_VISUALS.has(entry.visual)
    : !FACE_ACCESSORY_VISUALS.has(entry.visual);
});

const colorCss = (color) => color
  ? `rgb(${color.map((value) => Math.round(value * 255)).join(' ')})`
  : '';

const TINT_BY_OPTION = Object.freeze({
  shirtColor: 'shirtTint',
  hatColor: 'hatTint',
  accessoryColor: 'accessoryTint',
  pantsColor: 'pantsTint',
  hairColor: 'hairTint',
  blobColor: 'blobTint'
});

export class AppearanceMenu {
  constructor(progression, player) {
    this.progression = progression;
    this.player = player;
    this.screen = document.querySelector('#appearance-menu');
    this.content = document.querySelector('#appearance-content');
    this.status = document.querySelector('#appearance-status');
    this.closeButton = document.querySelector('#close-appearance');
    this.randomizeButton = document.querySelector('#randomize-appearance');
    this.resetButton = document.querySelector('#reset-appearance');
    this.spinButton = document.querySelector('#toggle-preview-spin');
    this.speedButton = document.querySelector('#toggle-preview-speed');
    this.preview = new AppearancePreview(document.querySelector('#appearance-preview-canvas'), this.progression.getAppearance());
    this.preview.setVisible(false);
    this.isOpen = false;
    this.activeTab = 'body';
    this.previousFocus = null;
    this.renderedRevision = -1;

    this.onOpenRequest = () => this.open();
    this.onCloseClick = () => this.close();
    this.onRandomizeClick = () => {
      const randomized = randomizeAppearance();
      for (const key of ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']) {
        if (!this.progression.getCosmeticAccess(randomized[key], randomized.avatarType).unlocked) {
          randomized[key] = key === 'backAccessory' ? 'backpack' : 'none';
        }
      }
      const appearance = this.progression.setAppearance(randomized);
      this.player.applyAppearance(appearance);
      this.preview.setAppearance(appearance);
      if (this.status) this.status.textContent = 'Random trail look saved • click again for another.';
      this.render(true);
    };
    this.onResetClick = () => {
      const appearance = this.progression.setAppearance({ ...DEFAULT_APPEARANCE });
      this.player.applyAppearance(appearance);
      this.preview.setAppearance(appearance);
      if (this.status) this.status.textContent = 'Classic v1–v7 trail look restored and saved locally.';
      this.render(true);
    };
    this.onSpinClick = () => {
      const spinning = this.preview.setSpinning(!this.preview.spinning);
      if (this.spinButton) {
        this.spinButton.textContent = spinning ? 'PAUSE ROTATION' : 'RESUME ROTATION';
        this.spinButton.setAttribute('aria-pressed', String(!spinning));
      }
    };
    this.onSpeedClick = () => {
      const speed = this.preview.setRotationSpeed(this.preview.rotationSpeed === 1 ? 2 : 1);
      if (this.speedButton) {
        this.speedButton.textContent = `${speed}x`;
        this.speedButton.setAttribute('aria-pressed', String(speed === 2));
      }
    };
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    this.onClick = (event) => {
      const tab = event.target.closest('[data-appearance-tab]');
      if (tab) {
        this.activeTab = ['body', 'hair', 'face', 'neck', 'back'].includes(tab.dataset.appearanceTab) ? tab.dataset.appearanceTab : 'body';
        this.render(true);
        this.screen.querySelector(`[data-appearance-tab="${this.activeTab}"]`)?.focus({ preventScroll: true });
        return;
      }
      const option = event.target.closest('[data-appearance-key][data-appearance-value]');
      if (!option) return;
      const key = option.dataset.appearanceKey;
      const value = option.dataset.appearanceValue;
      if (!GROUPS.some((group) => group.key === key && groupOptions(group).some((entry) => entry.id === value))) return;
      const access = ['headwear', 'eyewear', 'faceAccessory', 'backAccessory'].includes(key)
        ? this.progression.getCosmeticAccess(value, key === 'avatarType' ? value : this.progression.getAppearance().avatarType)
        : null;
      if (access && !access.unlocked) {
        if (this.status) this.status.textContent = access.reason;
        return;
      }
      const patch = { [key]: value };
      if (key === 'avatarType') {
        const current = this.progression.getAppearance();
        for (const cosmeticKey of ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']) {
          if (!this.progression.getCosmeticAccess(current[cosmeticKey], value).compatible) patch[cosmeticKey] = 'none';
        }
      }
      if (TINT_BY_OPTION[key]) patch[TINT_BY_OPTION[key]] = null;
      const appearance = this.progression.setAppearance(patch);
      this.player.applyAppearance(appearance);
      this.preview.setAppearance(appearance);
      if (this.status) this.status.textContent = 'Saved locally • multiplayer appearance updates live.';
      this.render(true);
    };
    this.onChange = (event) => {
      const slider = event.target.closest?.('[data-appearance-skin-slider]');
      if (!slider) return;
      const index = Math.max(0, Math.min(SKIN_TONES.length - 1, Number(slider.value) || 0));
      const appearance = this.progression.setAppearance({ skinTone: SKIN_TONES[index].id });
      this.player.applyAppearance(appearance);
      this.preview.setAppearance(appearance);
      const readout = slider.parentElement?.querySelector('.appearance-tone-readout');
      if (readout) readout.textContent = `${index + 1} / ${SKIN_TONES.length}`;
      if (this.status) this.status.textContent = `Skin tone ${index + 1} of ${SKIN_TONES.length} saved.`;
      if (event.type === 'change') this.render(true);
      else this.renderedRevision = this.progression.revision;
    };
    window.addEventListener('reel-ascent:open-appearance', this.onOpenRequest);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.screen?.addEventListener('change', this.onChange);
    this.screen?.addEventListener('input', this.onChange);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.randomizeButton?.addEventListener('click', this.onRandomizeClick);
    this.resetButton?.addEventListener('click', this.onResetClick);
    this.spinButton?.addEventListener('click', this.onSpinClick);
    this.speedButton?.addEventListener('click', this.onSpeedClick);
  }

  open() {
    if (!this.screen || this.isOpen || BLOCKING_CLASSES.some((name) => document.body.classList.contains(name))) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('appearance-open');
    this.render(true);
    this.preview.setVisible(true);
    this.screen.querySelector('[data-appearance-key]')?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('appearance-open');
    this.preview.setVisible(false);
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
    const duplicateRepresentatives = new Map();
    for (const duplicateGroup of GENERIC_COSMETIC_VISUAL_DUPLICATE_GROUPS) {
      const equipped = ['headwear', 'eyewear', 'faceAccessory', 'backAccessory']
        .map((key) => appearance[key]).find((id) => duplicateGroup.includes(id));
      const unlocked = duplicateGroup.find((id) => this.progression.getCosmeticAccess(id, appearance.avatarType).unlocked);
      const representative = equipped ?? unlocked ?? duplicateGroup[0];
      for (const id of duplicateGroup) duplicateRepresentatives.set(id, representative);
    }
    for (const tab of this.screen.querySelectorAll('[data-appearance-tab]')) {
      tab.setAttribute('aria-pressed', String(tab.dataset.appearanceTab === this.activeTab));
    }
    this.content.dataset.section = this.activeTab;
    const groups = GROUPS.filter((group) => group.section === this.activeTab).map((group) => {
      const fieldset = document.createElement('fieldset');
      fieldset.className = `appearance-group appearance-group-${group.key}`;
      fieldset.classList.toggle('appearance-group-compact', Boolean(group.compact));
      fieldset.hidden = Boolean((group.human && !human) || (group.blob && human));
      const legend = document.createElement('legend');
      legend.textContent = group.label;
      const options = document.createElement('div');
      options.className = 'appearance-options';
      if (group.slider) {
        const selectedIndex = Math.max(0, group.options.findIndex((entry) => entry.id === appearance[group.key]));
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = String(group.options.length - 1);
        slider.step = '1';
        slider.value = String(selectedIndex);
        slider.dataset.appearanceSkinSlider = 'true';
        slider.setAttribute('aria-label', `Skin tone ${selectedIndex + 1} of ${group.options.length}`);
        const strip = document.createElement('div');
        strip.className = 'appearance-tone-strip';
        for (const entry of group.options) {
          const swatch = document.createElement('span');
          swatch.style.backgroundColor = colorCss(entry.color);
          strip.appendChild(swatch);
        }
        const readout = document.createElement('strong');
        readout.className = 'appearance-tone-readout';
        readout.textContent = `${selectedIndex + 1} / ${group.options.length}`;
        options.append(slider, strip, readout);
        fieldset.append(legend, options);
        return fieldset;
      }
      for (const entry of groupOptions(group)) {
        if (group.cosmetic && entry.supports && !entry.supports.includes(appearance.avatarType)) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.appearanceKey = group.key;
        button.dataset.appearanceValue = entry.id;
        button.setAttribute('aria-pressed', String(appearance[group.key] === entry.id));
        const access = group.cosmetic
          ? this.progression.getCosmeticAccess(entry.id, appearance.avatarType)
          : { unlocked: true };
        const duplicateGroup = group.cosmetic ? cosmeticVisualDuplicateGroup(entry.id) : null;
        const redesignPending = Boolean(duplicateGroup
          && duplicateRepresentatives.get(entry.id) !== entry.id);
        button.classList.toggle('is-locked', !access.unlocked && !redesignPending);
        button.classList.toggle('is-redesign-pending', redesignPending);
        button.disabled = Boolean(redesignPending);
        button.setAttribute('aria-disabled', String(!access.unlocked || redesignPending));
        if (group.swatches) {
          const swatch = document.createElement('span');
          swatch.className = 'appearance-swatch';
          swatch.style.backgroundColor = colorCss(entry.color);
          button.appendChild(swatch);
        }
        const label = document.createElement('span');
        label.textContent = entry.label;
        button.appendChild(label);
        if (redesignPending || !access.unlocked) {
          const hint = document.createElement('small');
          hint.textContent = redesignPending ? 'Visual redesign pending' : access.reason;
          button.appendChild(hint);
        }
        options.appendChild(button);
      }
      fieldset.append(legend, options);
      return fieldset;
    });
    this.content.replaceChildren(...groups);
    this.preview.setAppearance(appearance);
    if (this.progression.isCosmeticTestMode?.() && this.status) {
      this.status.textContent = 'COSMETIC TEST MODE — ALL UNLOCKED';
    }
    this.renderedRevision = this.progression.revision;
  }

  destroy() {
    window.removeEventListener('reel-ascent:open-appearance', this.onOpenRequest);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.screen?.removeEventListener('input', this.onChange);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.randomizeButton?.removeEventListener('click', this.onRandomizeClick);
    this.resetButton?.removeEventListener('click', this.onResetClick);
    this.spinButton?.removeEventListener('click', this.onSpinClick);
    this.speedButton?.removeEventListener('click', this.onSpeedClick);
    document.body.classList.remove('appearance-open');
    this.preview.destroy();
  }
}
