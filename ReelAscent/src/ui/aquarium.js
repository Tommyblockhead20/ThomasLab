import { specimenPreview } from './inventory.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const aquariumPlacement = (specimen, inventoryIds, displays) => {
  if (inventoryIds.has(specimen.specimenId)) return { label: 'In inventory', tankIndex: -1, inventory: true };
  const tankIndex = displays.findIndex((ids) => ids.includes(specimen.specimenId));
  return { label: tankIndex >= 0 ? `Tank ${tankIndex + 1}` : 'Aquarium storage', tankIndex, inventory: false };
};

const specimenCard = (specimen, selectedId, placement) => `<button type="button" class="aquarium-specimen-card ${specimen.specimenId === selectedId ? 'is-selected' : ''}" data-aquarium-select="${escapeHtml(specimen.specimenId)}" data-rarity="${escapeHtml(String(specimen.rarity || 'common').toLowerCase())}" aria-pressed="${specimen.specimenId === selectedId}">
  ${specimenPreview(specimen)}
  <span class="aquarium-specimen-copy"><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • $${Number(specimen.value) || 0}</small><span>${escapeHtml(placement)}</span></span>
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
    this.moveTargetTankIndex = 0;
    this.view = 'collection';
    this.remotePlayerId = null;
    this.renderedRevision = -1;
    this.lastClockSecond = -1;

    this.onKeyDown = (event) => {
      if (event.repeat || ['input', 'textarea', 'select'].includes(event.target?.tagName?.toLowerCase?.())) return;
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
      if (!selection) return;
      this.selectedSpecimenId = selection.dataset.aquariumSelect;
      this.render(true);
    };
    this.onChange = (event) => {
      const target = event.target.closest?.('[data-aquarium-move-target]');
      if (!target) return;
      this.moveTargetTankIndex = Math.max(0, Number(target.value) || 0);
      this.render(true);
    };
    this.onCloseClick = () => this.close();
    this.onOpenRequest = () => this.open();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.addEventListener('click', this.onClick);
    this.screen?.addEventListener('change', this.onChange);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  handleAction(button) {
    const action = button.dataset.aquariumAction;
    let result = { ok: true };
    if (action === 'upgrade') result = this.progression.purchaseAquariumCapacityUpgrade();
    else if (action === 'store') result = this.progression.moveInventorySpecimenToAquarium(button.dataset.specimenId);
    else if (action === 'store-display') {
      result = this.progression.moveInventorySpecimenToAquarium(button.dataset.specimenId);
      if (result.ok) result = this.progression.assignAquariumSpecimenToTank(button.dataset.specimenId, this.selectedTankIndex);
    } else if (action === 'return') result = this.progression.moveAquariumSpecimenToInventory(button.dataset.specimenId);
    else if (action === 'display') result = this.progression.assignAquariumSpecimenToTank(button.dataset.specimenId, this.selectedTankIndex);
    else if (action === 'move') result = this.progression.assignAquariumSpecimenToTank(button.dataset.specimenId, this.moveTargetTankIndex);
    else if (action === 'undisplay') result = this.progression.removeAquariumSpecimenFromDisplay(button.dataset.specimenId, Number(button.dataset.tankIndex) || 0);
    else if (action === 'auto-tank') result = this.progression.autoFillAquariumTank(this.selectedTankIndex);
    else if (action === 'showcase-add') result = this.progression.setAquariumShowcase(button.dataset.specimenId, true);
    else if (action === 'showcase-remove') result = this.progression.setAquariumShowcase(button.dataset.specimenId, false);
    else if (action === 'auto-showcase') result = this.progression.autoFillAquariumShowcase();
    else if (action === 'tank') {
      this.view = 'collection';
      this.remotePlayerId = null;
      this.selectedTankIndex = Math.max(0, Number(button.dataset.tankIndex) || 0);
      this.moveTargetTankIndex = this.selectedTankIndex;
    } else if (action === 'showcase') {
      this.view = 'showcase';
      this.remotePlayerId = null;
    } else if (action === 'remote') {
      this.view = 'remote';
      this.remotePlayerId = button.dataset.playerId || null;
    }
    if (result.ok && ['showcase-add', 'showcase-remove', 'auto-showcase'].includes(action)) this.onShowcaseChanged();
    if (this.status && !['tank', 'showcase', 'remote'].includes(action)) this.status.textContent = result.ok ? 'Aquarium collection updated.' : result.reason;
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
    const remote = this.view === 'remote' ? socials.find((entry) => !entry.isLocal && entry.playerId === this.remotePlayerId) : null;
    if (this.view === 'remote' && !remote) {
      this.view = 'collection';
      this.remotePlayerId = null;
    }
    this.selectedTankIndex = Math.min(this.selectedTankIndex, Math.max(0, economy.tankCount - 1));
    this.moveTargetTankIndex = Math.min(this.moveTargetTankIndex, Math.max(0, economy.tankCount - 1));
    this.count.textContent = `${economy.tankCount} / 10 tanks • ${specimens.length} retained`;
    const remainingSeconds = Math.ceil(Math.max(0, economy.intervalSeconds - economy.bankedActiveSeconds));
    const clock = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
    this.content.innerHTML = `${this.renderSummary(economy, specimens.length, clock)}<div class="aquarium-desktop-layout">${this.renderTankRail(state, displays, economy, socials)}${this.renderSpecimenBrowser(state, displays, socials)}${this.renderDetails(state, displays, socials)}</div>`;
    this.renderedRevision = this.progression.revision;
  }

  renderSummary(economy, retainedCount, clock) {
    const nextTank = economy.nextTier ? `<strong>Tank ${economy.nextTier.tankCount}</strong><span>$${economy.nextTier.price}</span>` : '<strong>All tanks</strong><span>Maximum unlocked</span>';
    return `<section class="aquarium-summary-row" aria-label="Aquarium summary">
      <article><small>TANKS OWNED</small><strong>${economy.tankCount} / 10</strong></article>
      <article><small>DISPLAYED</small><strong>${economy.displayedCount}</strong><span>creatures</span></article>
      <article><small>COLLECTION VALUE</small><strong>$${economy.collectionValue}</strong></article>
      <article><small>VISITOR INCOME</small><strong>$${economy.payout} / 5 min</strong><span>${clock} remaining</span></article>
      <article><small>NEXT TANK</small>${nextTank}</article>
      <article><small>RETAINED</small><strong>${retainedCount} / ${economy.capacity}</strong></article>
    </section>`;
  }

  renderTankRail(state, displays, economy, socials) {
    const tanks = displays.map((ids, index) => `<button type="button" class="aquarium-tank-card ${this.view === 'collection' && index === this.selectedTankIndex ? 'is-selected' : ''}" data-aquarium-action="tank" data-tank-index="${index}" aria-pressed="${this.view === 'collection' && index === this.selectedTankIndex}"><span><strong>Tank ${index + 1}</strong><small>${ids.length} / ${economy.tankCapacity}</small></span><span>${economy.tanks[index]?.payout ? `$${economy.tanks[index].payout} / 5 min` : 'No income yet'}</span></button>`).join('');
    const showcaseCount = this.progression.getAquariumShowcasePresentation().length;
    const remoteCards = socials.filter((entry) => !entry.isLocal).map((entry) => `<button type="button" class="aquarium-tank-card aquarium-visitor-card ${this.view === 'remote' && this.remotePlayerId === entry.playerId ? 'is-selected' : ''}" data-aquarium-action="remote" data-player-id="${escapeHtml(entry.playerId)}" aria-pressed="${this.view === 'remote' && this.remotePlayerId === entry.playerId}"><span><strong>${escapeHtml(entry.displayName || 'Guest')}</strong><small>MULTIPLAYER TANK</small></span><span>${entry.specimens?.length ?? 0} creatures • view only</span></button>`).join('');
    const upgrade = economy.nextTier ? `<button type="button" class="aquarium-buy-tank" data-aquarium-action="upgrade" ${state.money < economy.nextTier.price ? 'disabled' : ''}><strong>UNLOCK TANK ${economy.nextTier.tankCount}</strong><span>$${economy.nextTier.price}</span></button>` : '<div class="aquarium-buy-tank is-max"><strong>ALL TANKS UNLOCKED</strong><span>300-creature capacity</span></div>';
    return `<aside class="aquarium-tank-rail"><header><small>TANK MANAGEMENT</small><strong>Select a display</strong></header><div class="aquarium-tank-list">${tanks}${upgrade}<button type="button" class="aquarium-tank-card aquarium-multiplayer-card ${this.view === 'showcase' ? 'is-selected' : ''}" data-aquarium-action="showcase" aria-pressed="${this.view === 'showcase'}"><span><strong>My Multiplayer Tank</strong><small>${showcaseCount} / 30</small></span><span>Shared with this room</span></button>${remoteCards}</div>${this.view === 'collection' ? `<button type="button" class="aquarium-auto-fill" data-aquarium-action="auto-tank">AUTO-FILL TANK ${this.selectedTankIndex + 1}</button>` : this.view === 'showcase' ? '<button type="button" class="aquarium-auto-fill" data-aquarium-action="auto-showcase">AUTO-FILL TOP VALUE</button>' : ''}</aside>`;
  }

  collectionForView(state, displays, socials) {
    const inventoryIds = new Set((state.inventory ?? []).map((entry) => entry.specimenId));
    if (this.view === 'showcase') {
      const showcaseIds = new Set(this.progression.getAquariumShowcasePresentation().map((entry) => entry.specimenId));
      return { title: 'Multiplayer Tank Collection', subtitle: 'Choose which retained creatures other players can inspect.', items: state.aquarium ?? [], placement: (entry) => showcaseIds.has(entry.specimenId) ? 'In multiplayer tank' : 'Available for multiplayer' };
    }
    if (this.view === 'remote') {
      const remote = socials.find((entry) => !entry.isLocal && entry.playerId === this.remotePlayerId);
      return { title: `${remote?.displayName || 'Guest'}'s Tank`, subtitle: 'Read-only multiplayer display.', items: remote?.specimens ?? [], placement: () => 'Multiplayer tank' };
    }
    return { title: 'Specimen Collection', subtitle: `Browsing all retained and carried creatures • selected display: Tank ${this.selectedTankIndex + 1}`, items: [...(state.aquarium ?? []), ...(state.inventory ?? [])], placement: (entry) => aquariumPlacement(entry, inventoryIds, displays).label };
  }

  renderSpecimenBrowser(state, displays, socials) {
    const collection = this.collectionForView(state, displays, socials);
    if (!collection.items.some((entry) => entry.specimenId === this.selectedSpecimenId)) this.selectedSpecimenId = collection.items[0]?.specimenId ?? null;
    const cards = collection.items.map((entry) => specimenCard(entry, this.selectedSpecimenId, collection.placement(entry))).join('');
    return `<main class="aquarium-specimen-browser"><header><div><small>CREATURES</small><h3>${escapeHtml(collection.title)}</h3><p>${escapeHtml(collection.subtitle)}</p></div><strong>${collection.items.length}</strong></header><div class="aquarium-specimen-grid">${cards || '<p class="shop-empty">No creatures are available here yet.</p>'}</div></main>`;
  }

  renderDetails(state, displays, socials) {
    const collection = this.collectionForView(state, displays, socials);
    const selected = collection.items.find((entry) => entry.specimenId === this.selectedSpecimenId) ?? null;
    if (!selected) return '<aside class="aquarium-detail-panel aquarium-detail-empty"><h3>Creature details</h3><p>Select a specimen from the grid.</p></aside>';
    const inventoryIds = new Set((state.inventory ?? []).map((entry) => entry.specimenId));
    const placement = aquariumPlacement(selected, inventoryIds, displays);
    let actions = '<p class="aquarium-read-only">This multiplayer display is read-only.</p>';
    if (this.view === 'showcase') {
      const showcased = this.progression.getAquariumShowcasePresentation().some((entry) => entry.specimenId === selected.specimenId);
      actions = `<button type="button" data-aquarium-action="${showcased ? 'showcase-remove' : 'showcase-add'}" data-specimen-id="${escapeHtml(selected.specimenId)}">${showcased ? 'REMOVE FROM MULTIPLAYER TANK' : 'DISPLAY IN MULTIPLAYER TANK'}</button>`;
    } else if (this.view === 'collection') {
      if (placement.inventory) {
        actions = `<button type="button" data-aquarium-action="store-display" data-specimen-id="${escapeHtml(selected.specimenId)}">DISPLAY IN SELECTED TANK</button><button type="button" class="is-secondary" data-aquarium-action="store" data-specimen-id="${escapeHtml(selected.specimenId)}">STORE WITHOUT DISPLAYING</button>`;
      } else {
        const displayAction = placement.tankIndex === this.selectedTankIndex ? '<button type="button" disabled>DISPLAYED IN SELECTED TANK</button>' : `<button type="button" data-aquarium-action="display" data-specimen-id="${escapeHtml(selected.specimenId)}">DISPLAY IN SELECTED TANK</button>`;
        const otherTanks = displays.map((_, index) => index).filter((index) => index !== placement.tankIndex);
        if (!otherTanks.includes(this.moveTargetTankIndex)) this.moveTargetTankIndex = otherTanks[0] ?? 0;
        const move = placement.tankIndex >= 0 && otherTanks.length ? `<label class="aquarium-move-control"><span>MOVE TO ANOTHER TANK</span><select data-aquarium-move-target aria-label="Move specimen to another tank">${otherTanks.map((index) => `<option value="${index}" ${index === this.moveTargetTankIndex ? 'selected' : ''}>Tank ${index + 1} • ${displays[index].length} / 30</option>`).join('')}</select></label><button type="button" class="is-secondary" data-aquarium-action="move" data-specimen-id="${escapeHtml(selected.specimenId)}">MOVE TO TANK ${this.moveTargetTankIndex + 1}</button>` : '';
        const remove = placement.tankIndex >= 0 ? `<button type="button" class="is-secondary" data-aquarium-action="undisplay" data-specimen-id="${escapeHtml(selected.specimenId)}" data-tank-index="${placement.tankIndex}">REMOVE FROM TANK</button>` : '';
        actions = `${displayAction}${move}${remove}<button type="button" class="is-danger" data-aquarium-action="return" data-specimen-id="${escapeHtml(selected.specimenId)}">RETURN TO INVENTORY</button>`;
      }
    }
    const placementLabel = this.view === 'collection' ? placement.label : collection.placement(selected);
    return `<aside class="aquarium-detail-panel"><div class="aquarium-detail-preview">${specimenPreview(selected)}</div><small>${escapeHtml(selected.rarity)} • ${escapeHtml(selected.quality)}${selected.shiny ? ' • SHINY' : ''}</small><h3>${escapeHtml(selected.name)}</h3><dl><div><dt>LENGTH</dt><dd>${Number(selected.length || 0).toFixed(1)} in</dd></div><div><dt>BODY</dt><dd>${Number(selected.weight || 0).toFixed(2)} lb</dd></div><div><dt>VALUE</dt><dd>$${Number(selected.value) || 0}</dd></div><div><dt>CAUGHT</dt><dd>${escapeHtml(selected.provenance?.locationLabel || 'Unknown water')}</dd></div></dl><div class="aquarium-current-placement"><span>CURRENT PLACEMENT</span><strong>${escapeHtml(placementLabel)}</strong></div><div class="aquarium-detail-actions">${actions}</div></aside>`;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('aquarium-open');
  }
}
