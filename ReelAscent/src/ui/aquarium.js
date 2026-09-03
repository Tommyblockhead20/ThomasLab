import { specimenPreview } from './inventory.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

export class AquariumMenu {
  constructor(progression) {
    this.progression = progression;
    this.screen = document.querySelector('#aquarium-menu');
    this.content = document.querySelector('#aquarium-content');
    this.count = document.querySelector('#aquarium-count');
    this.status = document.querySelector('#aquarium-status');
    this.closeButton = document.querySelector('#close-aquarium');
    this.isOpen = false;
    this.selectedSpecimenId = null;
    this.renderedRevision = -1;
    this.lastClockSecond = -1;
    this.onKeyDown = (event) => {
      if (event.repeat || ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.())) return;
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => {
      const selection = event.target.closest('[data-aquarium-select]');
      if (selection && !event.target.closest('[data-aquarium-action]')) {
        this.selectedSpecimenId = selection.dataset.aquariumSelect;
        this.render(true);
        return;
      }
      const action = event.target.closest('[data-aquarium-action]');
      if (!action) return;
      let result;
      if (action.dataset.aquariumAction === 'upgrade') result = this.progression.purchaseAquariumCapacityUpgrade();
      else if (action.dataset.aquariumAction === 'add') result = this.progression.moveInventorySpecimenToAquarium(action.dataset.specimenId);
      else result = this.progression.moveAquariumSpecimenToInventory(action.dataset.specimenId);
      this.status.textContent = result.ok
        ? (result.capacity ? `Aquarium expanded to ${result.capacity} creatures.` : 'Aquarium collection updated.')
        : result.reason;
      if (result.ok) this.render(true);
    };
    this.onCloseClick = () => this.close();
    this.onOpenRequest = () => this.open();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    if (!this.screen) return;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('aquarium-open');
    this.render(true);
    this.closeButton?.focus({ preventScroll: true });
  }
  close() {
    if (!this.screen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('aquarium-open');
  }
  update() {
    const income = this.progression.processAquariumIncome();
    if (income.paid && this.status) this.status.textContent = `Aquarium visitors contributed $${income.paid}.`;
    const economy = this.isOpen ? this.progression.getAquariumEconomy() : null;
    const clockSecond = economy ? Math.floor(economy.bankedActiveSeconds) : -1;
    if (this.isOpen && (this.renderedRevision !== this.progression.revision || clockSecond !== this.lastClockSecond)) {
      this.lastClockSecond = clockSecond;
      this.render(true);
    }
  }
  render(force = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const state = this.progression.getSnapshot();
    const specimens = state.aquarium ?? [];
    const economy = this.progression.getAquariumEconomy();
    this.count.textContent = `${specimens.length} / ${economy.capacity} retained`;
    const allSpecimens = [...specimens, ...state.inventory];
    if (!allSpecimens.some((entry) => entry.specimenId === this.selectedSpecimenId)) {
      this.selectedSpecimenId = specimens.at(-1)?.specimenId ?? state.inventory.at(-1)?.specimenId ?? null;
    }
    const selected = allSpecimens.find((entry) => entry.specimenId === this.selectedSpecimenId) ?? null;
    const inAquarium = Boolean(selected && specimens.some((entry) => entry.specimenId === selected.specimenId));
    const card = (specimen, retained) => `<button type="button" class="aquarium-creature-card ${specimen.specimenId === this.selectedSpecimenId ? 'is-selected' : ''}" data-aquarium-select="${escapeHtml(specimen.specimenId)}" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}">
      ${specimenPreview(specimen)}<span><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)} • ${specimen.length.toFixed(1)} in</small><small>${retained ? 'RETAINED' : 'CARRIED'} • $${specimen.value}</small></span>
    </button>`;
    const displayed = specimens.length ? [...specimens].reverse().map((specimen) => card(specimen, true)).join('') : '<p class="shop-empty">No retained creatures yet.</p>';
    const carried = state.inventory.length ? [...state.inventory].reverse().map((specimen) => card(specimen, false)).join('') : '<p class="shop-empty">No carried specimens available.</p>';
    const remaining = Math.max(0, economy.intervalSeconds - economy.bankedActiveSeconds);
    const remainingSeconds = Math.ceil(remaining);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
    const upgrade = economy.nextTier
      ? `<div><small>NEXT EXPANSION</small><strong>${economy.capacity} → ${economy.nextTier.capacity}</strong><button data-aquarium-action="upgrade" ${state.money < economy.nextTier.price ? 'disabled' : ''}>UPGRADE $${economy.nextTier.price}</button></div>`
      : '<div><small>EXPANSION</small><strong>MAXIMUM</strong><span>300 capacity</span></div>';
    const selectedDetail = selected ? `<div class="aquarium-selected-preview">${specimenPreview(selected)}</div><small>${escapeHtml(selected.rarity)} • ${escapeHtml(selected.quality)}${selected.shiny ? ' • SHINY' : ''}</small><h3>${escapeHtml(selected.name)}</h3><dl><div><dt>LENGTH</dt><dd>${selected.length.toFixed(1)} in • ${escapeHtml(selected.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${selected.weight.toFixed(2)} lb • ${escapeHtml(selected.sizeCategory)}</dd></div><div><dt>VALUE</dt><dd>$${selected.value}</dd></div><div><dt>CAUGHT</dt><dd>${escapeHtml(selected.provenance?.locationLabel || 'Unknown water')}</dd></div></dl><button data-aquarium-action="${inAquarium ? 'remove' : 'add'}" data-specimen-id="${escapeHtml(selected.specimenId)}" ${!inAquarium && specimens.length >= economy.capacity ? 'disabled' : ''}>${inAquarium ? 'RETURN TO INVENTORY' : 'ADD TO AQUARIUM'}</button>` : '<p>Select a retained or carried creature to inspect it.</p>';
    this.content.innerHTML = `<section class="aquarium-summary-bar"><div><small>RETAINED</small><strong>${specimens.length} / ${economy.capacity}</strong></div><div><small>COLLECTION VALUE</small><strong>$${economy.exhibitedValue}</strong></div><div><small>VISITOR INCOME</small><strong>$${economy.payout} / 5 min</strong></div><div><small>NEXT PAYOUT</small><strong>${minutes}:${seconds}</strong><span>$${economy.payout} expected</span></div>${upgrade}</section><div class="aquarium-workspace"><section class="aquarium-collection"><div><h3>RETAINED CREATURES</h3><div class="aquarium-creature-grid">${displayed}</div></div><div><h3>CARRIED SPECIMENS</h3><div class="aquarium-creature-grid">${carried}</div></div></section><aside class="aquarium-selected">${selectedDetail}</aside></div>`;
    this.renderedRevision = this.progression.revision;
  }
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('aquarium-open');
  }
}
