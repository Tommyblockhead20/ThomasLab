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
      candidates: document.querySelector('#performance-candidates'),
      inputSummary: document.querySelector('#performance-input-summary'),
      inputLog: document.querySelector('#performance-input-log'),
      inputRows: document.querySelector('#performance-input-rows')
    };
    this.isOpen = false;
    this.lastRenderAt = 0;
    this.lastInputCount = -1;

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
    const attempt = debug.rhythmAttempt;
    const inputs = attempt?.inputLog ?? [];
    this.fields.inputSummary.textContent = attempt
      ? `${inputs.length} PRESS${inputs.length === 1 ? '' : 'ES'} • ${attempt.requiresCleanPerformance ? 'CLEAN REQUIRED' : 'STANDARD'}`
      : 'NO ATTEMPT';
    this.fields.inputRows.innerHTML = inputs.length
      ? inputs.map((input) => {
          const expected = input.expectedLanes?.length ? input.expectedLanes.map((lane) => this.laneLabel(lane)).join('+') : '—';
          const delta = Number.isFinite(input.signedMs) ? `${input.signedMs > 0 ? '+' : ''}${input.signedMs}` : '—';
          const status = input.counted ? 'COUNTED' : `IGNORED • ${input.reason ?? input.judgment.toLowerCase()}`;
          const chartTime = `${displayNumber(input.inputTime, 3)} / ${displayNumber(input.expectedHitTime, 3)}`;
          return `<tr class="${input.mistake ? 'is-mistake' : 'is-counted'}"><td>${input.serial}</td><td>${this.laneLabel(input.lane)}</td><td>${expected}</td><td>${delta}</td><td>${input.judgment}</td><td>${status}${input.mistake ? ' • MISTAKE' : ''}</td><td>${chartTime}</td></tr>`;
        }).join('')
      : '<tr><td colspan="7">No inputs in this attempt.</td></tr>';
    if (inputs.length !== this.lastInputCount) {
      this.lastInputCount = inputs.length;
      if (this.fields.inputLog) this.fields.inputLog.scrollTop = this.fields.inputLog.scrollHeight;
    }
    if (force) this.screen.dataset.rendered = 'true';
  }

  laneLabel(lane) {
    return ({ A: 'LEFT', W: 'UP', S: 'DOWN', D: 'RIGHT' })[lane] ?? lane ?? '—';
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('fishing-debug-open');
  }
}
