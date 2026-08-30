import { resolveSpecies } from '../fishing/fish-data.js';
import { MAP_ITEM_BY_ID } from '../world/world-locations.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const OTHER_MODAL_OPEN = () => [
  'fish-gallery', 'journal-open', 'multiplayer-open', 'mountain-map-open', 'emote-menu-open',
  'appearance-open', 'shop-open', 'aquarium-open', 'boat-travel-open'
].some((className) => document.body.classList.contains(className));

function downloadProgressJson(text, prefix = 'reel-ascent-progress') {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function colorCss(color = [.45, .62, .55]) {
  return `rgb(${color.map((channel) => Math.round(channel * 255)).join(' ')})`;
}

function specimenPreview(specimen) {
  const species = resolveSpecies(specimen.speciesId);
  const [primary, accent] = species?.visual?.colors ?? [[.45, .62, .55], [.82, .72, .38]];
  const longBody = ['slender', 'eel', 'serpent'].includes(species?.visual?.archetype);
  const bodyRx = longBody ? 30 : 23;
  const sparkle = specimen.shiny ? '<path d="M78 11v10M73 16h10" class="specimen-sparkle" />' : '';
  return `<svg class="inventory-specimen-preview" viewBox="0 0 96 56" role="img" aria-label="${escapeHtml(specimen.name)} specimen preview">
    <path d="M18 28 4 17v22z" fill="${colorCss(accent)}" />
    <ellipse cx="48" cy="28" rx="${bodyRx}" ry="15" fill="${colorCss(primary)}" />
    <path d="M38 15 51 4l11 13M40 41l12 10 10-12" fill="${colorCss(accent)}" />
    <circle cx="${48 + bodyRx - 8}" cy="23" r="2.4" fill="#102d30" />
    <path d="M${48 + bodyRx - 4} 31q7 4 10-1" fill="none" stroke="${colorCss(accent)}" stroke-width="2" />${sparkle}
  </svg>`;
}

export class InventoryMenu {
  constructor(progression, player = null) {
    this.progression = progression;
    this.player = player;
    this.screen = document.querySelector('#inventory-menu');
    this.content = document.querySelector('#inventory-content');
    this.status = document.querySelector('#inventory-status');
    this.balance = document.querySelector('#collection-balance');
    this.tabs = document.querySelector('#collection-tabs');
    this.title = document.querySelector('#inventory-title');
    this.closeButton = document.querySelector('#close-inventory');
    this.mobileButton = document.querySelector('#open-inventory');
    this.transferPanel = document.querySelector('#progress-transfer');
    this.transferText = document.querySelector('#progress-transfer-text');
    this.transferFile = document.querySelector('#progress-transfer-file');
    this.transferStatus = document.querySelector('#progress-transfer-status');
    this.importSlot = document.querySelector('#progress-import-slot');
    this.isOpen = false;
    this.activeTab = 'inventory';
    this.renderedRevision = -1;
    this.renderedSaveRevision = -1;
    this.previousFocus = null;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea', 'select'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable || event.repeat) return;
      if (event.code === 'KeyI') {
        if (!this.isOpen && OTHER_MODAL_OPEN()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
      } else if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => this.handleClick(event);
    this.onCloseClick = () => this.close();
    this.onOpenClick = () => { if (!OTHER_MODAL_OPEN()) this.open(); };
    this.onTransferFile = async () => {
      const file = this.transferFile?.files?.[0];
      if (!file || !this.transferText) return;
      try {
        this.transferText.value = await file.text();
        const result = this.progression.previewProgressImport(this.transferText.value);
        this.transferStatus.textContent = `Ready: ${result.summary.discovered} discovered, $${result.summary.money}. Choose a destination slot.`;
      } catch (error) {
        this.transferStatus.textContent = error instanceof Error ? error.message : 'Could not read progress file.';
      }
      this.transferFile.value = '';
    };
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.mobileButton?.addEventListener('click', this.onOpenClick);
    this.transferFile?.addEventListener('change', this.onTransferFile);
  }

  handleClick(event) {
    const tab = event.target.closest('[data-collection-tab]');
    if (tab) return this.setTab(tab.dataset.collectionTab);
    const specimenButton = event.target.closest('[data-inventory-action="hold"]');
    if (specimenButton) {
      const result = this.progression.setHeldInventorySpecimen(specimenButton.dataset.specimenId);
      this.player?.showInventorySpecimen(this.progression.getHeldInventorySpecimen());
      this.status.textContent = result.specimen ? `${result.specimen.name} is now displayed in your hand.` : 'Held specimen put away.';
      return this.render(true, true);
    }
    const itemButton = event.target.closest('[data-world-item-action]');
    if (itemButton) {
      const item = MAP_ITEM_BY_ID.get(itemButton.dataset.worldItemAction);
      const result = this.progression.setHeldWorldItem(item?.id);
      if (result.ok && item) {
        this.close();
        window.dispatchEvent(new CustomEvent('reel-ascent:open-map', { detail: { mode: item.mode } }));
      }
      return;
    }
    const slotAction = event.target.closest('[data-slot-action]');
    if (slotAction) return this.handleSlotAction(slotAction.dataset.slotAction, slotAction.dataset.slotId);
    const transferAction = event.target.closest('[data-progress-action]')?.dataset.progressAction;
    if (transferAction) void this.handleProgressTransfer(transferAction);
  }

  handleSlotAction(action, slotId) {
    const saves = this.progression.saveSystem;
    if (action === 'create') {
      if (saves.createSlot(slotId)) this.render(true);
      return;
    }
    if (action === 'select') {
      if (!globalThis.confirm?.('Load this save slot? The page will reload and leave any current multiplayer room.')) return;
      if (saves.selectSlot(slotId)) globalThis.location?.reload();
      return;
    }
    const summary = saves.getSlotSummaries().find((slot) => slot.id === slotId);
    const phrase = `RESET ${summary?.label?.toUpperCase() ?? 'SAVE SLOT'}`;
    if (globalThis.prompt?.(`This permanently clears only ${summary?.label}. Type ${phrase} to confirm.`) !== phrase) return;
    const ok = action === 'delete' ? saves.deleteSlot(slotId) : saves.resetSlot(slotId);
    if (!ok) return;
    if (summary?.active) globalThis.location?.reload();
    else this.render(true);
  }

  async handleProgressTransfer(action) {
    if (action === 'file') return this.transferFile?.click();
    if (action === 'download') {
      const text = this.progression.exportProgress();
      if (this.transferText) this.transferText.value = text;
      downloadProgressJson(text);
      if (this.transferStatus) this.transferStatus.textContent = 'Current save downloaded as versioned JSON.';
      return;
    }
    if (action !== 'import' || !this.transferText) return;
    try {
      const preview = this.progression.previewProgressImport(this.transferText.value);
      const slotId = this.importSlot?.value ?? this.progression.saveSystem.activeSlotId;
      const summary = this.progression.saveSystem.getSlotSummaries().find((slot) => slot.id === slotId);
      if (!globalThis.confirm?.(`Overwrite ${summary?.label ?? slotId} with ${preview.summary.discovered} discoveries and $${preview.summary.money}?`)) return;
      downloadProgressJson(this.progression.exportProgress(), 'reel-ascent-backup-before-import');
      this.progression.importProgressToSlot(this.transferText.value, slotId);
      this.transferStatus.textContent = 'Backup downloaded. Import complete.';
      if (summary?.active) globalThis.setTimeout(() => globalThis.location?.reload(), 180);
      else this.render(true, true);
    } catch (error) {
      this.transferStatus.textContent = error instanceof Error ? error.message : 'Progress import failed.';
    }
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open(tab = this.activeTab) {
    if (!this.screen || this.isOpen) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('inventory-open');
    this.activeTab = ['inventory', 'save-data'].includes(tab) ? tab : 'inventory';
    this.render(true);
    this.closeButton?.focus({ preventScroll: true });
  }
  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('inventory-open');
    (this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas'))?.focus({ preventScroll: true });
    this.previousFocus = null;
  }
  setTab(tab) {
    if (!['inventory', 'save-data'].includes(tab) || tab === this.activeTab) return;
    this.activeTab = tab;
    this.render(true);
  }
  update() {
    if (this.isOpen && (this.renderedRevision !== this.progression.revision
      || this.renderedSaveRevision !== this.progression.saveSystem.revision)) this.render();
  }

  render(force = false, preserveStatus = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision
      && this.renderedSaveRevision === this.progression.saveSystem.revision)) return;
    const state = this.progression.getSnapshot();
    this.balance.textContent = `$${state.money}`;
    this.title.textContent = this.activeTab === 'inventory' ? 'Inventory' : 'Save / Data';
    for (const button of this.tabs?.querySelectorAll('[data-collection-tab]') ?? []) {
      button.setAttribute('aria-pressed', String(button.dataset.collectionTab === this.activeTab));
    }
    if (!preserveStatus) this.status.textContent = this.activeTab === 'inventory'
      ? 'Owned items and carried specimens. Commerce and aquarium management happen at their islands.'
      : 'Manage four independent local saves. Changing slots reloads the game cleanly.';
    this.transferPanel.hidden = this.activeTab !== 'save-data';
    this.content.className = this.activeTab === 'inventory' ? 'inventory-content' : 'save-data-content';
    this.content.innerHTML = this.activeTab === 'inventory' ? this.renderInventory(state) : this.renderSaveSlots();
    this.refreshImportSlots();
    this.renderedRevision = this.progression.revision;
    this.renderedSaveRevision = this.progression.saveSystem.revision;
  }

  renderInventory(state) {
    const items = (state.ownedItems ?? []).map((id) => MAP_ITEM_BY_ID.get(id)).filter(Boolean).map((item) => (
      `<article class="inventory-card inventory-item-card" data-held="${state.heldItemId === item.id}"><div class="inventory-item-icon">${item.mode === 'gps' ? '⌖' : '⌁'}</div><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div><button type="button" data-world-item-action="${item.id}">${item.mode === 'gps' ? 'USE GPS MAP' : 'HOLD / READ MAP'}</button></article>`
    )).join('');
    const specimens = [...(state.inventory ?? [])].reverse().map((specimen) => (
      `<article class="inventory-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}" data-held="${state.heldSpecimenId === specimen.specimenId}">${specimenPreview(specimen)}<div class="inventory-card-heading"><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div><dl><div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div><div><dt>VALUE</dt><dd>$${specimen.value}</dd></div><div><dt>FOUND</dt><dd>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')}</dd></div></dl><div class="inventory-actions"><button type="button" data-inventory-action="hold" data-specimen-id="${escapeHtml(specimen.specimenId)}">${state.heldSpecimenId === specimen.specimenId ? 'PUT AWAY' : 'HOLD IN HAND'}</button></div></article>`
    )).join('');
    return items + specimens || '<p class="shop-empty">Nothing carried yet. Successful catches appear here automatically; maps are sold at Shop Island.</p>';
  }

  renderSaveSlots() {
    return this.progression.saveSystem.getSlotSummaries().map((slot) => {
      const date = slot.updatedAt ? new Date(slot.updatedAt).toLocaleString() : 'Unused';
      if (slot.empty) return `<article class="save-slot-card"><header><strong>${slot.label}</strong><span>EMPTY</span></header><button data-slot-action="create" data-slot-id="${slot.id}">CREATE SAVE</button></article>`;
      return `<article class="save-slot-card ${slot.active ? 'is-active' : ''}"><header><strong>${slot.label}</strong><span>${slot.active ? 'CURRENT' : 'LOCAL SAVE'}</span></header><dl><div><dt>LAST PLAYED</dt><dd>${escapeHtml(date)}</dd></div><div><dt>MONEY</dt><dd>$${slot.money}</dd></div><div><dt>JOURNAL</dt><dd>${slot.discovered} discovered</dd></div><div><dt>LIFETIME</dt><dd>${slot.fishCaught} fish • ${slot.summits} summits</dd></div></dl><div class="save-slot-actions">${slot.active ? '' : `<button data-slot-action="select" data-slot-id="${slot.id}">LOAD</button>`}<button data-slot-action="${slot.active ? 'reset' : 'delete'}" data-slot-id="${slot.id}">${slot.active ? 'RESET CURRENT SAVE' : 'DELETE'}</button></div></article>`;
    }).join('');
  }

  refreshImportSlots() {
    if (!this.importSlot) return;
    const selected = this.importSlot.value || this.progression.saveSystem.activeSlotId;
    this.importSlot.replaceChildren(...this.progression.saveSystem.getSlotSummaries().map((slot) => {
      const option = document.createElement('option');
      option.value = slot.id;
      option.textContent = `${slot.label}${slot.empty ? ' (empty)' : slot.active ? ' (current)' : ''}`;
      option.selected = slot.id === selected;
      return option;
    }));
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.mobileButton?.removeEventListener('click', this.onOpenClick);
    this.transferFile?.removeEventListener('change', this.onTransferFile);
    document.body.classList.remove('inventory-open');
  }
}
