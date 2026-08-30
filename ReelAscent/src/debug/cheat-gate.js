const HOLD_DURATION_MS = 3000;

export class CheatGate extends EventTarget {
  constructor(holdDurationMs = HOLD_DURATION_MS) {
    super();
    this.enabled = false;
    this.startedAt = 0;
    this.timer = null;
    this.progressTimer = null;
    this.hideTimer = null;
    this.installed = false;
    this.holdDurationMs = holdDurationMs;
  }

  install() {
    if (this.installed || typeof window === 'undefined') return this;
    this.installed = true;
    this.indicator = document.querySelector('#cheat-activation');
    this.onKeyDown = (event) => {
      if (event.code !== 'F1' || event.repeat || this.enabled) return;
      event.preventDefault();
      this.startedAt = performance.now();
      this.show('HOLD F1 • 0%', 0);
      this.timer = globalThis.setTimeout(() => this.enable(), this.holdDurationMs);
      this.progressTimer = globalThis.setInterval(() => {
        const progress = Math.min(1, (performance.now() - this.startedAt) / this.holdDurationMs);
        this.show(`HOLD F1 • ${Math.floor(progress * 100)}%`, progress);
      }, 50);
    };
    this.onKeyUp = (event) => {
      if (event.code !== 'F1' || this.enabled) return;
      event.preventDefault();
      this.cancel();
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
    globalThis.clearInterval(this.progressTimer);
    globalThis.clearTimeout(this.hideTimer);
    this.timer = null;
    this.progressTimer = null;
    this.startedAt = 0;
    if (this.indicator) this.indicator.hidden = true;
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    globalThis.clearTimeout(this.timer);
    globalThis.clearInterval(this.progressTimer);
    this.timer = null;
    this.progressTimer = null;
    this.show('CHEATS ENABLED', 1);
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
