const HOLD_DURATION_MS = 3000;

export class CheatGate extends EventTarget {
  constructor(holdDurationMs = HOLD_DURATION_MS) {
    super();
    this.enabled = false;
    this.startedAt = 0;
    this.timer = null;
    this.hideTimer = null;
    this.installed = false;
    this.holdDurationMs = holdDurationMs;
  }

  install() {
    if (this.installed || typeof window === 'undefined') return this;
    this.installed = true;
    this.indicator = document.querySelector('#cheat-activation');
    this.onKeyDown = (event) => {
      const activation = event.code === 'F1' || (event.code === 'KeyC'
        && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey);
      if (!activation) return;
      if (event.code === 'KeyC' && (event.target?.isContentEditable
        || event.target?.matches?.('input, textarea, select, [contenteditable]'))) return;
      // F1 repeats during a long hold. Letting its repeated events reach the browser
      // can open Help, blur the game, and cancel the unlock just before completion.
      event.preventDefault();
      if (event.repeat || this.enabled || this.timer) return;
      this.activationCode = event.code;
      this.startedAt = performance.now();
      this.show('HOLD TO ENABLE CHEATS', 0);
      this.timer = globalThis.setTimeout(() => this.enable(), this.holdDurationMs);
    };
    this.onKeyUp = (event) => {
      if (event.code !== this.activationCode) return;
      event.preventDefault();
      if (!this.enabled) this.cancel();
    };
    this.onBlur = () => { if (!this.enabled) this.cancel(); };
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('blur', this.onBlur);
    return this;
  }

  show(label, progress = 0) {
    if (!this.indicator) return;
    this.indicator.hidden = false;
    this.indicator.textContent = label;
    this.indicator.style.setProperty('--cheat-progress', `${Math.round(progress * 100)}%`);
  }

  cancel() {
    globalThis.clearTimeout(this.timer);
    globalThis.clearTimeout(this.hideTimer);
    this.timer = null;
    this.startedAt = 0;
    this.activationCode = null;
    if (this.indicator) this.indicator.hidden = true;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    globalThis.clearTimeout(this.timer);
    this.timer = null;
    this.show('CHEATS ENABLED • F10 ITEMS • SHIFT+F9 ISLANDS', 1);
    this.hideTimer = globalThis.setTimeout(() => { if (this.indicator) this.indicator.hidden = true; }, 1800);
    this.dispatchEvent(new Event('enabled'));
  }

  destroy() {
    this.cancel();
    if (!this.installed) return;
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('blur', this.onBlur);
    this.installed = false;
  }
}

export const cheatGate = new CheatGate();
export const isCheatsEnabled = () => cheatGate.enabled;
