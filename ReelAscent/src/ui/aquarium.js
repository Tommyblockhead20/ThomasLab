import { AQUARIUM_TANK_CAPACITY } from '../progression/aquarium.js';
import { INVENTORY_SORT_OPTIONS, sortInventorySpecimens, specimenPreview } from './inventory.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);
const card = (specimen, selected, label) => `<button type="button" class="aquarium-specimen-card ${specimen.specimenId === selected ? 'is-selected' : ''}" data-aquarium-select="${escapeHtml(specimen.specimenId)}" data-rarity="${escapeHtml(String(specimen.rarity || 'common').toLowerCase())}">${specimenPreview(specimen)}<span class="aquarium-specimen-copy"><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • $${Number(specimen.value) || 0}</small><span>${escapeHtml(label)}</span></span></button>`;

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
    this.moveDestination = 'tank:0';
    this.sortMode = 'recent';
    this.view = 'inventory';
    this.remotePlayerId = null;
    this.renderedRevision = -1;
    this.lastClockSecond = -1;
    this.onKeyDown = (event) => {
      if (event.repeat || ['input', 'textarea', 'select'].includes(event.target?.tagName?.toLowerCase?.())) return;
      if (event.code === 'Escape' && this.isOpen) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); }
    };
    this.onClick = (event) => {
      const action = event.target.closest('[data-aquarium-action]');
      if (action) { event.preventDefault(); this.handleAction(action); return; }
      const selection = event.target.closest('[data-aquarium-select]');
      if (selection) { this.selectedSpecimenId = selection.dataset.aquariumSelect; this.render(true); }
    };
    this.onChange = (event) => {
      const sort = event.target.closest?.('[data-aquarium-sort]');
      if (sort) {
        this.sortMode = INVENTORY_SORT_OPTIONS.some(([value]) => value === sort.value) ? sort.value : 'recent';
        this.render(true);
        return;
      }
      const target = event.target.closest?.('[data-aquarium-destination]');
      if (target) { this.moveDestination = target.value; this.render(true); }
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
    const sourceAction = ['inventory', 'tank', 'showcase', 'remote'].includes(action);
    const selectedIndex = [...(this.content?.querySelectorAll('[data-aquarium-select]') ?? [])]
      .findIndex((entry) => entry.dataset.aquariumSelect === this.selectedSpecimenId);
    let result = { ok: true };
    if (action === 'upgrade') result = this.progression.purchaseAquariumCapacityUpgrade();
    else if (action === 'move-location') result = this.progression.moveAquariumSpecimen(button.dataset.specimenId,
      this.moveDestination === 'inventory' ? { inventory: true } : { tankIndex: Number(this.moveDestination.split(':')[1]) || 0 });
    else if (action === 'auto-tank') result = this.progression.autoFillAquariumTank(this.selectedTankIndex);
    else if (action === 'showcase-add') result = this.progression.setAquariumShowcase(button.dataset.specimenId, true);
    else if (action === 'showcase-remove') result = this.progression.setAquariumShowcase(button.dataset.specimenId, false);
    else if (action === 'auto-showcase') result = this.progression.autoFillAquariumShowcase();
    else if (action === 'inventory') { this.view = 'inventory'; this.remotePlayerId = null; }
    else if (action === 'tank') { this.view = 'tank'; this.remotePlayerId = null; this.selectedTankIndex = Math.max(0, Number(button.dataset.tankIndex) || 0); }
    else if (action === 'showcase') { this.view = 'showcase'; this.remotePlayerId = null; }
    else if (action === 'remote') { this.view = 'remote'; this.remotePlayerId = button.dataset.playerId || null; }
    if (result.ok && ['showcase-add', 'showcase-remove', 'auto-showcase'].includes(action)) this.onShowcaseChanged();
    if (this.status && !['inventory', 'tank', 'showcase', 'remote'].includes(action)) this.status.textContent = result.ok
      ? action === 'auto-tank' ? `Added ${result.count} highest-value creature${result.count === 1 ? '' : 's'} to Tank ${this.selectedTankIndex + 1}.` : 'Aquarium updated.'
      : result.reason;
    if (result.ok) {
      if (!sourceAction && selectedIndex >= 0) this.selectionFallbackIndex = selectedIndex;
      this.render(true, { preserveScroll: !sourceAction });
    }
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() { if (!this.screen) return; document.exitPointerLock?.(); this.isOpen = true; this.screen.hidden = false; if (this.closeButton) this.closeButton.hidden = false; document.body.classList.add('aquarium-open'); this.render(true); this.closeButton?.focus({ preventScroll: true }); }
  close() { if (!this.screen) return; this.isOpen = false; this.screen.hidden = true; if (this.closeButton) this.closeButton.hidden = true; document.body.classList.remove('aquarium-open'); }
  update() {
    const income = this.progression.processAquariumIncome();
    if (income.paid && this.status) this.status.textContent = `Aquarium visitors contributed $${income.paid}.`;
    const economy = this.isOpen ? this.progression.getAquariumEconomy() : null;
    const second = economy ? Math.floor(economy.bankedActiveSeconds) : -1;
    if (this.isOpen && (this.renderedRevision !== this.progression.revision || second !== this.lastClockSecond)) { this.lastClockSecond = second; this.render(true); }
  }

  captureBrowserPosition() {
    const grid = this.content?.querySelector('.aquarium-specimen-grid');
    if (!grid) return null;
    const cards = [...grid.querySelectorAll('[data-aquarium-select]')];
    const anchor = cards.find((entry) => entry.offsetTop + entry.offsetHeight >= grid.scrollTop);
    return {
      top: grid.scrollTop,
      anchorId: anchor?.dataset.aquariumSelect ?? null,
      anchorOffset: anchor ? anchor.offsetTop - grid.scrollTop : 0
    };
  }

  restoreBrowserPosition(position) {
    if (!position) return;
    const grid = this.content?.querySelector('.aquarium-specimen-grid');
    if (!grid) return;
    const anchor = position.anchorId
      ? [...grid.querySelectorAll('[data-aquarium-select]')]
        .find((entry) => entry.dataset.aquariumSelect === position.anchorId)
      : null;
    grid.scrollTop = anchor ? anchor.offsetTop - position.anchorOffset : position.top;
  }

  render(force = false, { preserveScroll = true } = {}) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const browserPosition = preserveScroll ? this.captureBrowserPosition() : null;
    const state = this.progression.getSnapshot();
    const displays = this.progression.getAquariumTankDisplays();
    const economy = this.progression.getAquariumEconomy();
    const socials = this.getSocialShowcases() ?? [];
    if (this.view === 'remote' && !socials.some((entry) => !entry.isLocal && entry.playerId === this.remotePlayerId)) { this.view = 'showcase'; this.remotePlayerId = null; }
    this.selectedTankIndex = Math.min(this.selectedTankIndex, Math.max(0, economy.tankCount - 1));
    this.count.textContent = `${state.aquarium.length} aquarium creatures • ${state.inventory.length} inventory`;
    const remaining = Math.ceil(Math.max(0, economy.intervalSeconds - economy.bankedActiveSeconds));
    const clock = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    this.content.innerHTML = `${this.renderSummary(economy, state, clock)}<div class="aquarium-desktop-layout">${this.renderRail(state, displays, economy, socials)}${this.renderBrowser(state, displays, socials)}${this.renderDetails(state, displays, socials)}</div>`;
    this.restoreBrowserPosition(browserPosition);
    this.renderedRevision = this.progression.revision;
  }

  renderSummary(economy, state, clock) {
    const next = economy.nextTier ? `<strong>Tank ${economy.nextTier.tankCount}</strong><span>$${economy.nextTier.price}</span>` : '<strong>All tanks</strong><span>Maximum unlocked</span>';
    return `<section class="aquarium-summary-row"><article><small>TANKS</small><strong>${economy.tankCount} / 10</strong></article><article><small>AQUARIUM CREATURES</small><strong>${state.aquarium.length}</strong><span>${economy.displayedCount} physically displayed</span></article><article><small>INVENTORY</small><strong>${state.inventory.length}</strong></article><article><small>COLLECTION VALUE</small><strong>$${economy.collectionValue}</strong></article><article><small>VISITOR INCOME</small><strong>$${economy.payout} / 5 min</strong><span>${clock} remaining</span></article><article><small>NEXT TANK</small>${next}</article></section>`;
  }

  renderRail(state, displays, economy, socials) {
    const inventory = `<button type="button" class="aquarium-tank-card ${this.view === 'inventory' ? 'is-selected' : ''}" data-aquarium-action="inventory"><span><strong>Inventory</strong><small>${state.inventory.length} creatures</small></span><span>Carried collection</span></button>`;
    const tanks = displays.map((ids, index) => `<button type="button" class="aquarium-tank-card ${this.view === 'tank' && index === this.selectedTankIndex ? 'is-selected' : ''}" data-aquarium-action="tank" data-tank-index="${index}"><span><strong>Tank ${index + 1}</strong><small>${ids.length} / ${economy.tankCapacity}</small></span><span>${economy.tanks[index]?.payout ? `$${economy.tanks[index].payout} / 5 min` : 'No income yet'}</span></button>`).join('');
    const showcaseCount = this.progression.getAquariumShowcasePresentation().length;
    const remotes = socials.filter((entry) => !entry.isLocal).map((entry) => `<button type="button" class="aquarium-tank-card aquarium-visitor-card ${this.view === 'remote' && this.remotePlayerId === entry.playerId ? 'is-selected' : ''}" data-aquarium-action="remote" data-player-id="${escapeHtml(entry.playerId)}"><span><strong>${escapeHtml(entry.displayName || 'Guest')}</strong><small>MULTIPLAYER TANK</small></span><span>${entry.specimens?.length ?? 0} creatures • view only</span></button>`).join('');
    const upgrade = economy.nextTier ? `<button type="button" class="aquarium-buy-tank" data-aquarium-action="upgrade" ${state.money < economy.nextTier.price ? 'disabled' : ''}><strong>UNLOCK TANK ${economy.nextTier.tankCount}</strong><span>$${economy.nextTier.price}</span></button>` : '<div class="aquarium-buy-tank is-max"><strong>ALL TANKS UNLOCKED</strong><span>300-creature capacity</span></div>';
    const auto = this.view === 'tank' ? `<button type="button" class="aquarium-auto-fill" data-aquarium-action="auto-tank" ${displays[this.selectedTankIndex].length >= AQUARIUM_TANK_CAPACITY ? 'disabled' : ''}>AUTO-FILL OPEN SLOTS</button>` : '';
    return `<aside class="aquarium-tank-rail"><header><small>LOCATIONS</small><strong>Choose one place</strong></header><div class="aquarium-tank-list">${inventory}${tanks}${upgrade}</div>${auto}<header><small>MULTIPLAYER TANK</small><strong>Presentation only</strong></header><div class="aquarium-tank-list"><button type="button" class="aquarium-tank-card aquarium-multiplayer-card ${this.view === 'showcase' ? 'is-selected' : ''}" data-aquarium-action="showcase"><span><strong>My Multiplayer Tank</strong><small>${showcaseCount} / 30</small></span><span>Does not move creatures</span></button>${remotes}</div>${this.view === 'showcase' ? '<button type="button" class="aquarium-auto-fill" data-aquarium-action="auto-showcase">AUTO-FILL TOP VALUE</button>' : ''}</aside>`;
  }

  collection(state, displays, socials) {
    const sorted = (result) => ({ ...result, items: sortInventorySpecimens(result.items, this.sortMode) });
    const byId = new Map((state.aquarium ?? []).map((entry) => [entry.specimenId, entry]));
    if (this.view === 'inventory') return sorted({ title: 'Inventory', subtitle: 'Creatures currently carried.', items: state.inventory ?? [], label: () => 'Inventory' });
    if (this.view === 'tank') return sorted({ title: `Tank ${this.selectedTankIndex + 1}`, subtitle: 'Every listed creature is physically displayed here.', items: (displays[this.selectedTankIndex] ?? []).map((id) => byId.get(id)).filter(Boolean), label: () => `Tank ${this.selectedTankIndex + 1}` });
    if (this.view === 'showcase') { const ids = new Set(this.progression.getAquariumShowcasePresentation().map((entry) => entry.specimenId)); return sorted({ title: 'My Multiplayer Tank', subtitle: 'Presentation only; normal locations stay unchanged.', items: [...state.aquarium, ...state.inventory], label: (entry) => ids.has(entry.specimenId) ? 'Shown to room' : 'Not showcased' }); }
    const remote = socials.find((entry) => !entry.isLocal && entry.playerId === this.remotePlayerId);
    return sorted({ title: `${remote?.displayName || 'Guest'}'s Multiplayer Tank`, subtitle: 'Read-only multiplayer display.', items: remote?.specimens ?? [], label: () => 'Multiplayer tank' });
  }

  renderBrowser(state, displays, socials) {
    const collection = this.collection(state, displays, socials);
    if (!collection.items.some((entry) => entry.specimenId === this.selectedSpecimenId)) {
      const fallback = Math.min(Math.max(0, this.selectionFallbackIndex ?? 0), Math.max(0, collection.items.length - 1));
      this.selectedSpecimenId = collection.items[fallback]?.specimenId ?? null;
    }
    this.selectionFallbackIndex = null;
    const options = INVENTORY_SORT_OPTIONS.map(([value, label]) => `<option value="${value}" ${value === this.sortMode ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
    return `<main class="aquarium-specimen-browser"><header><div><small>CREATURES</small><h3>${escapeHtml(collection.title)}</h3><p>${escapeHtml(collection.subtitle)}</p></div><label class="aquarium-sort-control"><span>SORT</span><select data-aquarium-sort aria-label="Sort Aquarium creatures">${options}</select></label><strong>${collection.items.length}</strong></header><div class="aquarium-specimen-grid">${collection.items.map((entry) => card(entry, this.selectedSpecimenId, collection.label(entry))).join('') || '<p class="shop-empty">No creatures are in this location.</p>'}</div></main>`;
  }

  renderDetails(state, displays, socials) {
    const collection = this.collection(state, displays, socials);
    const selected = collection.items.find((entry) => entry.specimenId === this.selectedSpecimenId);
    if (!selected) return '<aside class="aquarium-detail-panel aquarium-detail-empty"><h3>Creature details</h3><p>Select a specimen from the grid.</p></aside>';
    let actions = '<p class="aquarium-read-only">This multiplayer display is read-only.</p>';
    if (this.view === 'showcase') {
      const shown = this.progression.getAquariumShowcasePresentation().some((entry) => entry.specimenId === selected.specimenId);
      actions = `<button type="button" data-aquarium-action="${shown ? 'showcase-remove' : 'showcase-add'}" data-specimen-id="${escapeHtml(selected.specimenId)}">${shown ? 'REMOVE FROM MULTIPLAYER TANK' : 'SHOW IN MULTIPLAYER TANK'}</button>`;
    } else if (this.view === 'inventory' || this.view === 'tank') {
      const current = this.view === 'inventory' ? 'inventory' : `tank:${this.selectedTankIndex}`;
      const destinations = [];
      if (current !== 'inventory') destinations.push({ value: 'inventory', label: `Inventory • ${state.inventory.length} creatures`, disabled: false });
      displays.forEach((ids, index) => { if (`tank:${index}` !== current) destinations.push({ value: `tank:${index}`, label: `Tank ${index + 1} • ${ids.length} / 30${ids.length >= 30 ? ' • FULL' : ''}`, disabled: ids.length >= 30 }); });
      const valid = destinations.find((entry) => entry.value === this.moveDestination && !entry.disabled) ?? destinations.find((entry) => !entry.disabled);
      this.moveDestination = valid?.value ?? '';
      actions = valid ? `<label class="aquarium-move-control"><span>MOVE TO…</span><select data-aquarium-destination>${destinations.map((entry) => `<option value="${entry.value}" ${entry.value === this.moveDestination ? 'selected' : ''} ${entry.disabled ? 'disabled' : ''}>${entry.label}</option>`).join('')}</select></label><button type="button" data-aquarium-action="move-location" data-specimen-id="${escapeHtml(selected.specimenId)}">MOVE TO ${escapeHtml(valid.label.split(' • ')[0].toUpperCase())}</button>` : '<p class="aquarium-read-only">No destination currently has space.</p>';
    }
    return `<aside class="aquarium-detail-panel"><div class="aquarium-detail-preview">${specimenPreview(selected)}</div><small>${escapeHtml(selected.rarity)} • ${escapeHtml(selected.quality)}${selected.shiny ? ' • SHINY' : ''}</small><h3>${escapeHtml(selected.name)}</h3><dl><div><dt>LENGTH</dt><dd>${Number(selected.length || 0).toFixed(1)} in</dd></div><div><dt>BODY</dt><dd>${Number(selected.weight || 0).toFixed(2)} lb</dd></div><div><dt>VALUE</dt><dd>$${Number(selected.value) || 0}</dd></div><div><dt>CAUGHT</dt><dd>${escapeHtml(selected.provenance?.locationLabel || 'Unknown water')}</dd></div></dl><div class="aquarium-current-placement"><span>CURRENT LOCATION</span><strong>${escapeHtml(collection.label(selected))}</strong></div><div class="aquarium-detail-actions">${actions}</div></aside>`;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-aquarium', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    if (this.closeButton) this.closeButton.hidden = true;
    document.body.classList.remove('aquarium-open');
  }
}
