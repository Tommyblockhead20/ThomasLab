import { specimenPreview } from './inventory.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const specimenCard = (specimen, selectedId, subtitle, action = '') => `<button type="button" class="aquarium-creature-card ${specimen.specimenId === selectedId ? 'is-selected' : ''}" data-aquarium-select="${escapeHtml(specimen.specimenId)}" data-rarity="${escapeHtml(String(specimen.rarity || 'common').toLowerCase())}">
  ${specimenPreview(specimen)}<span><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)} • ${Number(specimen.length || 0).toFixed(1)} in</small><small>${escapeHtml(subtitle)} • $${Number(specimen.value) || 0}</small>${action}</span>
</button>`;

export class AquariumMenu {
  constructor(progression, options = {}) {
    this.progression = progression;
    this.getSocialShowcases = options.getSocialShowcases ?? (() => []);
    this.onShowcaseChanged = options.onShowcaseChanged ?? (() => {});
    this.screen = document.querySelector('#aquarium-menu');
    this.content = document.querySelector('#aquarium-content');
    this.count = document.querySelector('#aquarium-count');
    this.status = document.querySelector('#aquarium-status');
    this.closeButton = document.querySelector('#close-aquarium');
    this.isOpen = false;
    this.selectedSpecimenId = null;
    this.selectedTankIndex = 0;
    this.view = 'collection';
    this.remotePlayerId = null;
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
      const action = event.target.closest('[data-aquarium-action]');
      if (action) {
        event.preventDefault();
        this.handleAction(action);
        return;
      }
      const selection = event.target.closest('[data-aquarium-select]');
      if (selection) {
        this.selectedSpecimenId = selection.dataset.aquariumSelect;
        this.render(true);
      }
    };
    this.onCloseClick = () => this.close();
    this.onOpenRequest = () => this.open();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  handleAction(button) {
    const action = button.dataset.aquariumAction;
    let result = { ok: true };
    if (action === 'upgrade') result = this.progression.purchaseAquariumCapacityUpgrade();
    else if (action === 'store') result = this.progression.moveInventorySpecimenToAquarium(button.dataset.specimenId);
    else if (action === 'return') result = this.progression.moveAquariumSpecimenToInventory(button.dataset.specimenId);
    else if (action === 'display') result = this.progression.assignAquariumSpecimenToTank(button.dataset.specimenId, this.selectedTankIndex);
    else if (action === 'undisplay') result = this.progression.removeAquariumSpecimenFromDisplay(button.dataset.specimenId, this.selectedTankIndex);
    else if (action === 'auto-tank') result = this.progression.autoFillAquariumTank(this.selectedTankIndex);
    else if (action === 'showcase-add') result = this.progression.setAquariumShowcase(button.dataset.specimenId, true);
    else if (action === 'showcase-remove') result = this.progression.setAquariumShowcase(button.dataset.specimenId, false);
    else if (action === 'auto-showcase') result = this.progression.autoFillAquariumShowcase();
    else if (action === 'tank') this.selectedTankIndex = Math.max(0, Number(button.dataset.tankIndex) || 0);
    else if (action === 'view') {
      this.view = button.dataset.view;
      this.remotePlayerId = button.dataset.playerId || null;
    }
    if (result.ok && ['showcase-add', 'showcase-remove', 'auto-showcase'].includes(action)) this.onShowcaseChanged();
    if (this.status && !['tank', 'view'].includes(action)) this.status.textContent = result.ok ? 'Aquarium collection updated.' : result.reason;
    if (result.ok) this.render(true);
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
    const displays = this.progression.getAquariumTankDisplays();
    const economy = this.progression.getAquariumEconomy();
    const socials = this.getSocialShowcases() ?? [];
    if (this.view === 'remote' && !socials.some((entry) => !entry.isLocal && entry.playerId === this.remotePlayerId)) {
      this.view = 'showcase';
      this.remotePlayerId = null;
    }
    this.selectedTankIndex = Math.min(this.selectedTankIndex, Math.max(0, economy.tankCount - 1));
    this.count.textContent = `${economy.tankCount} / 10 tanks • ${specimens.length} retained`;

    const ids = new Set(displays[this.selectedTankIndex] ?? []);
    const tankSpecimens = specimens.filter((entry) => ids.has(entry.specimenId));
    const available = specimens.filter((entry) => !ids.has(entry.specimenId));
    const allSpecimens = [...specimens, ...state.inventory];
    if (!allSpecimens.some((entry) => entry.specimenId === this.selectedSpecimenId)) this.selectedSpecimenId = allSpecimens[0]?.specimenId ?? null;
    const selected = allSpecimens.find((entry) => entry.specimenId === this.selectedSpecimenId) ?? null;
    const remainingSeconds = Math.ceil(Math.max(0, economy.intervalSeconds - economy.bankedActiveSeconds));
    const clock = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
    const upgrade = economy.nextTier
      ? `<div><small>NEXT TANK</small><strong>Tank ${economy.nextTier.tankCount}</strong><button data-aquarium-action="upgrade" ${state.money < economy.nextTier.price ? 'disabled' : ''}>BUY $${economy.nextTier.price}</button></div>`
      : '<div><small>EXPANSION</small><strong>MAXIMUM</strong><span>10 tanks • 300 creatures</span></div>';
    const summary = `<section class="aquarium-summary-bar"><div><small>TANKS</small><strong>${economy.tankCount} / 10</strong><span>${economy.displayedCount} displayed</span></div><div><small>CREATURES</small><strong>${specimens.length} / ${economy.capacity}</strong></div><div><small>COLLECTION VALUE</small><strong>$${economy.collectionValue}</strong><span>$${economy.exhibitedValue} displayed</span></div><div><small>VISITOR INCOME</small><strong>$${economy.payout} / 5 min</strong><span>${clock} remaining</span></div>${upgrade}</section>`;
    const tabs = `<nav class="aquarium-view-tabs"><button data-aquarium-action="view" data-view="collection" class="${this.view === 'collection' ? 'is-active' : ''}">MY TANKS</button><button data-aquarium-action="view" data-view="showcase" class="${this.view === 'showcase' ? 'is-active' : ''}">MY MULTIPLAYER TANK</button>${socials.filter((entry) => !entry.isLocal).map((entry) => `<button data-aquarium-action="view" data-view="remote" data-player-id="${escapeHtml(entry.playerId)}" class="${this.view === 'remote' && this.remotePlayerId === entry.playerId ? 'is-active' : ''}">${escapeHtml(entry.displayName || 'Guest')}</button>`).join('')}</nav>`;
    this.content.innerHTML = `${summary}${tabs}${this.view === 'collection' ? this.renderCollection(state, tankSpecimens, available, selected, ids, economy) : this.renderShowcase(state, specimens, socials)}`;
    this.renderedRevision = this.progression.revision;
  }

  renderCollection(state, tankSpecimens, available, selected, displayedIds, economy) {
    const displays = this.progression.getAquariumTankDisplays();
    const tankButtons = displays.map((ids, index) => `<button data-aquarium-action="tank" data-tank-index="${index}" class="${index === this.selectedTankIndex ? 'is-active' : ''}">TANK ${index + 1}<small>${ids.length} / 30 • $${economy.tanks[index]?.payout ?? 0} / 5 min</small></button>`).join('');
    const cards = (items, subtitle) => items.length ? items.map((entry) => specimenCard(entry, this.selectedSpecimenId, subtitle)).join('') : '<p class="shop-empty">Nothing here yet.</p>';
    const selectedStored = selected && state.aquarium.some((entry) => entry.specimenId === selected.specimenId);
    const selectedDisplayed = selected && displayedIds.has(selected.specimenId);
    const detailAction = selected ? (selectedStored
      ? `<div class="aquarium-detail-actions"><button data-aquarium-action="${selectedDisplayed ? 'undisplay' : 'display'}" data-specimen-id="${escapeHtml(selected.specimenId)}">${selectedDisplayed ? 'REMOVE FROM THIS DISPLAY' : `DISPLAY IN TANK ${this.selectedTankIndex + 1}`}</button><button data-aquarium-action="return" data-specimen-id="${escapeHtml(selected.specimenId)}">RETURN TO INVENTORY</button></div>`
      : `<button data-aquarium-action="store" data-specimen-id="${escapeHtml(selected.specimenId)}">STORE IN AQUARIUM</button>`) : '';
    return `<div class="aquarium-tank-selector">${tankButtons}<button data-aquarium-action="auto-tank">AUTO-FILL TANK ${this.selectedTankIndex + 1}</button></div><div class="aquarium-workspace"><section class="aquarium-collection"><div><h3>DISPLAYED IN TANK ${this.selectedTankIndex + 1}</h3><div class="aquarium-creature-grid">${cards(tankSpecimens, 'DISPLAYED')}</div></div><div><h3>STORED & AVAILABLE</h3><div class="aquarium-creature-grid">${cards(available, 'STORED')}</div></div><div><h3>CARRIED INVENTORY</h3><div class="aquarium-creature-grid">${cards(state.inventory, 'CARRIED')}</div></div></section>${this.renderDetail(selected, detailAction)}</div>`;
  }

  renderShowcase(state, specimens, socials) {
    const remote = this.view === 'remote' ? socials.find((entry) => entry.playerId === this.remotePlayerId) : null;
    const showcase = remote?.specimens ?? this.progression.getAquariumShowcasePresentation();
    const showcaseIds = new Set(showcase.map((entry) => entry.specimenId));
    const available = remote ? [] : specimens.filter((entry) => !showcaseIds.has(entry.specimenId));
    if (showcase.length && !showcase.some((entry) => entry.specimenId === this.selectedSpecimenId)) this.selectedSpecimenId = showcase[0].specimenId;
    const selected = showcase.find((entry) => entry.specimenId === this.selectedSpecimenId) ?? null;
    const cards = showcase.length ? showcase.map((entry) => specimenCard(entry, this.selectedSpecimenId, remote ? 'READ-ONLY DISPLAY' : 'MULTIPLAYER DISPLAY', remote ? '' : `<small><span data-aquarium-action="showcase-remove" data-specimen-id="${escapeHtml(entry.specimenId)}">REMOVE</span></small>`)).join('') : '<p class="shop-empty">This multiplayer tank is empty.</p>';
    const detail = selected
      ? this.renderDetail(selected, remote ? '<p>Read-only visitor inspection.</p>' : '')
      : `<aside class="aquarium-selected"><h3>${remote ? 'VISITOR VIEW' : 'SHOWCASE RULES'}</h3><p>${remote ? 'This tank belongs to another connected player and cannot be edited.' : 'Your 30 highest-value stored specimens are selected automatically until you make a manual change. This is presentation-only and never changes income or ownership.'}</p></aside>`;
    return `<div class="aquarium-workspace aquarium-showcase-workspace"><section class="aquarium-collection"><div class="aquarium-section-heading"><div><h3>${escapeHtml(remote?.displayName || 'MY MULTIPLAYER TANK')}</h3><small>${showcase.length} / 30 creatures${remote ? ' • read only' : ' • other players see this at Aquarium Island'}</small></div>${remote ? '' : '<button data-aquarium-action="auto-showcase">AUTO-FILL TOP VALUE</button>'}</div><div class="aquarium-creature-grid">${cards}</div>${remote ? '' : `<div><h3>STORED & AVAILABLE</h3><div class="aquarium-creature-grid">${available.length ? available.map((entry) => specimenCard(entry, this.selectedSpecimenId, 'STORED', `<small><span data-aquarium-action="showcase-add" data-specimen-id="${escapeHtml(entry.specimenId)}">ADD</span></small>`)).join('') : '<p class="shop-empty">All stored specimens are already selected, or there are none.</p>'}</div></div>`}</section>${detail}</div>`;
  }

  renderDetail(selected, actionMarkup) {
    if (!selected) return '<aside class="aquarium-selected"><p>Select a creature to inspect it.</p></aside>';
    return `<aside class="aquarium-selected"><div class="aquarium-selected-preview">${specimenPreview(selected)}</div><small>${escapeHtml(selected.rarity)} • ${escapeHtml(selected.quality)}${selected.shiny ? ' • SHINY' : ''}</small><h3>${escapeHtml(selected.name)}</h3><dl><div><dt>LENGTH</dt><dd>${Number(selected.length || 0).toFixed(1)} in</dd></div><div><dt>BODY</dt><dd>${Number(selected.weight || 0).toFixed(2)} lb</dd></div><div><dt>VALUE</dt><dd>$${Number(selected.value) || 0}</dd></div><div><dt>CAUGHT</dt><dd>${escapeHtml(selected.provenance?.locationLabel || 'Unknown water')}</dd></div></dl>${actionMarkup}</aside>`;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('aquarium-open');
  }
}
