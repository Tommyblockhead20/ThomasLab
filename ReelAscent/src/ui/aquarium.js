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
    this.renderedRevision = -1;
    this.onKeyDown = (event) => {
      if (event.repeat || ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.())) return;
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => {
      const action = event.target.closest('[data-aquarium-action]');
      if (!action) return;
      let result;
      if (action.dataset.aquariumAction === 'upgrade') result = this.progression.purchaseAquariumCapacityUpgrade();
      else if (action.dataset.aquariumAction === 'add') result = this.progression.moveInventorySpecimenToAquarium(action.dataset.specimenId);
      else result = this.progression.moveAquariumSpecimenToInventory(action.dataset.specimenId);
      this.status.textContent = result.ok
        ? (result.capacity ? `Aquarium expanded to ${result.capacity} fish.` : 'Aquarium collection updated.')
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
    if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render();
  }
  render(force = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const state = this.progression.getSnapshot();
    const specimens = state.aquarium ?? [];
    const economy = this.progression.getAquariumEconomy();
    this.count.textContent = `${specimens.length} / ${economy.capacity} retained`;
    const displayed = specimens.length ? [...specimens].reverse().map((specimen) => (
      `<article class="aquarium-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}">
        <div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div>
        <dl><div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div></dl>
        <small>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')} • ${new Date(specimen.provenance.caughtAt).toLocaleDateString()}</small><button data-aquarium-action="remove" data-specimen-id="${escapeHtml(specimen.specimenId)}">RETURN TO INVENTORY</button>
      </article>`
    )).join('') : '<p class="shop-empty">No specimens displayed yet.</p>';
    const carried = state.inventory.length ? [...state.inventory].reverse().map((specimen) => (
      `<article class="aquarium-card"><div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)}</small></div><button data-aquarium-action="add" data-specimen-id="${escapeHtml(specimen.specimenId)}" ${specimens.length >= economy.capacity ? 'disabled' : ''}>ADD TO AQUARIUM</button></article>`
    )).join('') : '<p class="shop-empty">No carried specimens available.</p>';
    const nextUpgrade = economy.nextTier
      ? `<button data-aquarium-action="upgrade" ${state.money < economy.nextTier.price ? 'disabled' : ''}>EXPAND TO ${economy.nextTier.capacity} • $${economy.nextTier.price}</button>`
      : '<strong>MAXIMUM 300-FISH CAPACITY</strong>';
    const remaining = Math.max(0, economy.intervalSeconds - economy.bankedActiveSeconds);
    this.content.innerHTML = `<section class="aquarium-economy"><div><small>DISPLAY VALUE</small><strong>$${economy.exhibitedValue}</strong></div><div><small>VISITOR INCOME</small><strong>$${economy.payout} / 5 active min</strong></div><div><small>NEXT PAYOUT</small><strong>${Math.ceil(remaining)}s active play</strong></div><div>${nextUpgrade}</div></section><section><h3>SWIMMING DISPLAY</h3><div class="aquarium-card-grid">${displayed}</div></section><section><h3>CARRIED SPECIMENS</h3><div class="aquarium-card-grid">${carried}</div></section>`;
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
