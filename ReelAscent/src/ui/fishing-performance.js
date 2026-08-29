export const FISHING_DEBUG_TOGGLE_CODE = 'F6';

const displayNumber = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : '—';

export class FishingPerformanceMenu {
  constructor(fishing) {
    this.fishing = fishing;
    this.screen = document.querySelector('#fishing-performance');
    this.closeButton = document.querySelector('#close-performance');
    this.fields = {
      state: document.querySelector('#performance-state'),
      zone: document.querySelector('#performance-zone'),
      water: document.querySelector('#performance-water'),
      theme: document.querySelector('#performance-theme'),
      eligible: document.querySelector('#performance-eligible'),
      cast: document.querySelector('#performance-cast'),
      selected: document.querySelector('#performance-selected'),
      modifiers: document.querySelector('#performance-modifiers'),
      failure: document.querySelector('#performance-failure'),
      candidates: document.querySelector('#performance-candidates')
    };
    this.isOpen = false;
    this.lastRenderAt = 0;

    this.onKeyDown = (event) => {
      if (event.code !== FISHING_DEBUG_TOGGLE_CODE || event.repeat) return;
      event.preventDefault();
      this.toggle();
    };
    this.onCloseClick = () => this.close();
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() {
    if (this.isOpen) this.close(); else this.open();
  }

  open() {
    if (!this.screen) return;
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('fishing-debug-open');
    this.render(true);
  }

  close() {
    if (!this.screen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('fishing-debug-open');
  }

  update(_legacyPerformanceState, now = performance.now()) {
    if (!this.isOpen || now - this.lastRenderAt < 180) return;
    this.render();
  }

  render(force = false) {
    if (!this.isOpen || !this.screen) return;
    this.lastRenderAt = performance.now();
    const debug = this.fishing.getFishingDebugState();
    const zone = debug.zone;
    this.fields.state.textContent = String(debug.state ?? 'inactive').toUpperCase();
    this.fields.zone.textContent = zone?.label ?? 'NONE IN CAST RANGE';
    this.fields.water.textContent = zone ? `${zone.tier ?? '—'} / ${zone.waterType ?? '—'}` : '—';
    this.fields.theme.textContent = zone?.theme ?? '—';
    this.fields.eligible.textContent = String(zone?.candidateCount ?? 0);
    this.fields.cast.textContent = debug.castValid ? 'WATER' : debug.state === 'inactive' ? 'NOT CAST' : 'DRY / PENDING';

    const selected = debug.selected;
    this.fields.selected.textContent = selected
      ? `${selected.name} • ${selected.rarity}${selected.shiny ? ' • SHINY' : ''} • ${displayNumber(selected.length, 1)} in • ${displayNumber(selected.weight)} lb`
      : 'No generated creature';

    const modifiers = zone?.modifiers ?? null;
    this.fields.modifiers.textContent = modifiers
      ? `bite ×${displayNumber(modifiers.biteRate ?? 1)} • size ×${displayNumber(modifiers.size ?? 1)} • rarity +${displayNumber(modifiers.rarityBias ?? 0)} • trophy ×${displayNumber(modifiers.trophyChance ?? 1)}${debug.catchGroundLift ? ` • held lift ${displayNumber(debug.catchGroundLift)} m` : ''}`
      : 'No active ecology modifiers';
    this.fields.failure.textContent = `LAST FAILURE: ${debug.failure ?? 'NONE'}`;

    this.fields.candidates.innerHTML = debug.candidates.length
      ? debug.candidates.map((candidate) => (
          `<li><span>${candidate.name} <i>${candidate.rarity}</i></span><b>${(candidate.probability * 100).toFixed(1)}%</b></li>`
        )).join('')
      : '<li><span>No water in cast range</span><b>—</b></li>';
    if (force) this.screen.dataset.rendered = 'true';
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('fishing-debug-open');
  }
}
