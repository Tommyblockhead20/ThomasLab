import { EQUIPMENT_CATALOG } from '../progression/equipment.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const CATEGORY_LABELS = Object.freeze({
  rod: 'RODS', reel: 'REELS', line: 'LINES', lure: 'LURES', guide: 'ECOLOGY GUIDES', traversal: 'TRAVERSAL'
});

const OTHER_MODAL_OPEN = () => ['fish-gallery', 'journal-open', 'multiplayer-open', 'mountain-map-open', 'emote-menu-open', 'appearance-open']
  .some((className) => document.body.classList.contains(className));

function downloadProgressJson(text, prefix = 'reel-ascent-progress') {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  link.href = url;
  link.download = `${prefix}-${timestamp}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const TAB_COPY = Object.freeze({
  inventory: 'Every successful catch waits here until you sell it or send it to Aquarium.',
  gear: 'Purchase gear and equip one item in each category.',
  aquarium: 'Exact specimens you chose to retain are visible swimming in the shoreline aquarium pavilion.'
});

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
    this.transferText = document.querySelector('#progress-transfer-text');
    this.transferFile = document.querySelector('#progress-transfer-file');
    this.transferStatus = document.querySelector('#progress-transfer-status');
    this.isOpen = false;
    this.activeTab = 'inventory';
    this.renderedRevision = -1;
    this.previousFocus = null;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
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

    this.onClick = (event) => {
      if (event.target.closest('[data-inventory-map]')) {
        this.close();
        window.dispatchEvent(new CustomEvent('reel-ascent:open-map'));
        return;
      }
      if (event.target.closest('[data-inventory-appearance]')) {
        this.close();
        window.dispatchEvent(new CustomEvent('reel-ascent:open-appearance'));
        return;
      }
      const transferAction = event.target.closest('[data-progress-action]')?.dataset.progressAction;
      if (transferAction) {
        void this.handleProgressTransfer(transferAction);
        return;
      }
      const tab = event.target.closest('[data-collection-tab]');
      if (tab) {
        this.setTab(tab.dataset.collectionTab);
        return;
      }

      const inventoryAction = event.target.closest('[data-inventory-action]');
      if (inventoryAction) {
        const specimenId = inventoryAction.dataset.specimenId;
        const action = inventoryAction.dataset.inventoryAction;
        if (!['sell', 'aquarium', 'hold'].includes(action)) return;
        const result = action === 'sell'
          ? this.progression.sellInventorySpecimen(specimenId)
          : action === 'aquarium'
            ? this.progression.moveInventorySpecimenToAquarium(specimenId)
            : this.progression.setHeldInventorySpecimen(specimenId);
        this.player?.showInventorySpecimen(this.progression.getHeldInventorySpecimen());
        if (this.status) this.status.textContent = result.ok
          ? action === 'sell'
            ? `${result.specimen.name} sold for $${result.amount}.`
            : action === 'aquarium'
              ? `${result.specimen.name} sent to the shoreline Aquarium.`
              : result.specimen
                ? `${result.specimen.name} is now displayed in your hand. Close Inventory to see it.`
                : 'Inventory fish put away.'
          : result.reason;
        this.render(true, true);
        return;
      }

      const shopAction = event.target.closest('[data-shop-action]');
      if (shopAction) {
        const id = shopAction.dataset.itemId;
        const result = shopAction.dataset.shopAction === 'buy'
          ? this.progression.purchase(id)
          : this.progression.equip(id);
        if (this.status) this.status.textContent = result.ok
          ? `${result.item.name} ${shopAction.dataset.shopAction === 'buy' ? 'purchased' : 'equipped'}.`
          : result.reason;
        this.render(true, true);
      }
    };

    this.onCloseClick = () => this.close();
    this.onOpenClick = () => { if (!OTHER_MODAL_OPEN()) this.open(); };
    this.onOpenAquarium = () => { if (!OTHER_MODAL_OPEN()) this.open('aquarium'); };
    this.onTransferFile = async () => {
      const file = this.transferFile?.files?.[0];
      if (!file || !this.transferText) return;
      try {
        this.transferText.value = await file.text();
        const result = this.progression.previewProgressImport(this.transferText.value);
        this.transferStatus.textContent = `Ready: ${result.summary.discovered} discovered, $${result.summary.money}.`;
      } catch (error) {
        this.transferStatus.textContent = error instanceof Error ? error.message : 'Could not read progress file.';
      }
      this.transferFile.value = '';
    };
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-aquarium', this.onOpenAquarium);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.mobileButton?.addEventListener('click', this.onOpenClick);
    this.transferFile?.addEventListener('change', this.onTransferFile);
  }

  async handleProgressTransfer(action) {
    if (action === 'file') {
      this.transferFile?.click();
      return;
    }
    if (action === 'download') {
      const text = this.progression.exportProgress();
      if (this.transferText) this.transferText.value = text;
      downloadProgressJson(text);
      if (this.transferStatus) this.transferStatus.textContent = 'Progress JSON downloaded. Keep it somewhere safe.';
      return;
    }
    if (action !== 'import' || !this.transferText) return;
    try {
      const preview = this.progression.previewProgressImport(this.transferText.value);
      const accepted = globalThis.confirm?.(
        `Replace this browser's durable progress with ${preview.summary.discovered} discoveries, ${preview.summary.inventory + preview.summary.aquarium} specimens, and $${preview.summary.money}?`
      );
      if (!accepted) return;
      downloadProgressJson(this.progression.exportProgress(), 'reel-ascent-backup-before-import');
      this.progression.importProgress(this.transferText.value);
      if (this.transferStatus) this.transferStatus.textContent = 'Backup downloaded. Progress imported; reloading the game…';
      globalThis.setTimeout(() => globalThis.location?.reload(), 180);
    } catch (error) {
      if (this.transferStatus) this.transferStatus.textContent = error instanceof Error ? error.message : 'Progress import failed.';
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
    this.activeTab = ['inventory', 'gear', 'aquarium'].includes(tab) ? tab : 'inventory';
    this.render(true);
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('inventory-open');
    const target = this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas');
    target?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  setTab(tab) {
    if (!['inventory', 'gear', 'aquarium'].includes(tab) || tab === this.activeTab) return;
    this.activeTab = tab;
    this.render(true);
  }

  update() {
    if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render();
  }

  render(force = false, preserveStatus = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const state = this.progression.getSnapshot();
    if (this.balance) this.balance.textContent = `$${state.money}`;
    if (this.title) this.title.textContent = ({ inventory: 'Inventory', gear: 'Gear Shop', aquarium: 'Aquarium' })[this.activeTab];
    for (const button of this.tabs?.querySelectorAll('[data-collection-tab]') ?? []) {
      button.setAttribute('aria-pressed', String(button.dataset.collectionTab === this.activeTab));
    }
    if (this.status && !preserveStatus) this.status.textContent = TAB_COPY[this.activeTab];
    this.content.className = this.activeTab === 'inventory'
      ? 'inventory-content'
      : this.activeTab === 'aquarium'
        ? 'aquarium-content'
        : 'shop-content';
    this.content.innerHTML = this.activeTab === 'inventory'
      ? this.renderInventory(state)
      : this.activeTab === 'aquarium'
        ? this.renderAquarium(state)
        : this.renderEquipment(state);
    this.renderedRevision = this.progression.revision;
  }

  renderInventory(state) {
    const specimens = state.inventory ?? [];
    return specimens.length ? [...specimens].reverse().map((specimen) => (
      `<article class="inventory-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}" data-held="${state.heldSpecimenId === specimen.specimenId}">
        <div class="inventory-card-heading"><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div>
        <dl>
          <div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div>
          <div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div>
          <div><dt>VALUE</dt><dd>$${specimen.value}</dd></div>
          <div><dt>FOUND</dt><dd>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')}</dd></div>
        </dl>
        <small>${new Date(specimen.provenance.caughtAt).toLocaleString()}${Number.isFinite(specimen.provenance.elevation) ? ` • ${Math.round(specimen.provenance.elevation)} ft` : ''}</small>
        <div class="inventory-actions">
          <button type="button" data-inventory-action="hold" data-specimen-id="${escapeHtml(specimen.specimenId)}">${state.heldSpecimenId === specimen.specimenId ? 'PUT AWAY' : 'HOLD IN HAND'}</button>
          <button type="button" data-inventory-action="sell" data-specimen-id="${escapeHtml(specimen.specimenId)}">SELL — $${specimen.value}</button>
          <button type="button" data-inventory-action="aquarium" data-specimen-id="${escapeHtml(specimen.specimenId)}">SEND TO AQUARIUM</button>
        </div>
      </article>`
    )).join('') : '<p class="shop-empty">Nothing waiting here yet. Every successful catch is added to Inventory automatically.</p>';
  }

  renderEquipment(state) {
    return Object.entries(CATEGORY_LABELS).map(([category, label]) => {
      const cards = EQUIPMENT_CATALOG.filter((entry) => entry.category === category).map((entry) => {
        const owned = state.ownedEquipment.includes(entry.id);
        const equipped = state.equipped[category] === entry.id;
        const action = equipped
          ? '<button type="button" disabled>EQUIPPED</button>'
          : owned
            ? `<button type="button" data-shop-action="equip" data-item-id="${entry.id}">EQUIP</button>`
            : `<button type="button" data-shop-action="buy" data-item-id="${entry.id}" ${!this.progression.canAfford(entry.price) ? 'disabled' : ''}>BUY $${entry.price}</button>`;
        return `<article class="shop-card ${equipped ? 'is-equipped' : ''}">
          <div><strong>${escapeHtml(entry.name)}</strong><small>${owned ? (equipped ? 'EQUIPPED' : 'OWNED') : `$${entry.price}`}</small></div>
          <p>${escapeHtml(entry.effect)}</p>${action}
        </article>`;
      }).join('');
      return `<section class="shop-category"><h3>${label}</h3><div class="shop-card-row">${cards}</div></section>`;
    }).join('');
  }

  renderAquarium(state) {
    const specimens = state.aquarium ?? [];
    return specimens.length ? [...specimens].reverse().map((specimen) => (
      `<article class="aquarium-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}">
        <div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div>
        <dl><div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div></dl>
        <small>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')} • ${new Date(specimen.provenance.caughtAt).toLocaleDateString()}</small>
      </article>`
    )).join('') : '<p class="shop-empty">Send exact specimens here from the Inventory tab.</p>';
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-aquarium', this.onOpenAquarium);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.mobileButton?.removeEventListener('click', this.onOpenClick);
    this.transferFile?.removeEventListener('change', this.onTransferFile);
    document.body.classList.remove('inventory-open');
  }
}
