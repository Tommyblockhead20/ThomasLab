import { EQUIPMENT_CATALOG } from '../progression/equipment.js';
import { MAP_ITEMS } from '../world/world-locations.js';
import { SHOP_COSMETICS } from '../progression/cosmetics.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const CATEGORY_LABELS = Object.freeze({
  rod: 'RODS', reel: 'REELS', line: 'LINES', lure: 'LURES', bobber: 'BOBBERS', guide: 'ECOLOGY GUIDES',
  boots: 'BOOTS', gloves: 'GLOVES', climbingTool: 'CLIMBING TOOLS', chalk: 'CHALK BAGS', harness: 'HARNESSES & PACKS'
});

export class ShopMenu {
  constructor(progression) {
    this.progression = progression;
    this.screen = document.querySelector('#progression-shop');
    this.closeButton = document.querySelector('#close-shop');
    this.eyebrow = this.screen?.querySelector('.eyebrow');
    this.title = document.querySelector('#shop-title');
    this.money = document.querySelector('#shop-money');
    this.tabs = document.querySelector('#shop-tabs');
    this.content = document.querySelector('#shop-content');
    this.status = document.querySelector('#shop-status');
    this.isOpen = false;
    this.activeMode = 'buy';
    this.renderedRevision = -1;

    this.onKeyDown = (event) => {
      const editable = ['input', 'textarea'].includes(event.target?.tagName?.toLowerCase?.()) || event.target?.isContentEditable;
      if (editable || event.repeat) return;
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => {
      const tab = event.target.closest('[data-shop-tab]');
      if (tab) {
        this.activeMode = tab.dataset.shopTab === 'sell' ? 'sell' : 'buy';
        this.updateModeHeading();
        this.status.textContent = this.activeMode === 'sell'
          ? 'Choose a specimen to sell, or sell the whole catch bag.'
          : 'Purchase maps and gear, then equip one item in each category.';
        this.render(true);
        return;
      }
      const sellAll = event.target.closest('[data-shop-sell-all]');
      if (sellAll) {
        const state = this.progression.getSnapshot();
        const count = state.inventory.length;
        const amount = state.inventory.reduce((total, specimen) => total + specimen.value, 0);
        if (!count) return;
        if (!globalThis.confirm?.(`Sell ${count} carried specimen${count === 1 ? '' : 's'} for $${amount}?`)) return;
        const result = this.progression.sellAllInventorySpecimens();
        this.status.textContent = result.ok ? `${result.count} carried specimens sold for $${result.amount}.` : result.reason;
        this.render(true);
        return;
      }
      const specimen = event.target.closest('[data-shop-sell]');
      if (specimen) {
        const result = this.progression.sellInventorySpecimen(specimen.dataset.shopSell);
        this.status.textContent = result.ok ? `${result.specimen.name} sold for $${result.amount}.` : result.reason;
        this.render(true);
        return;
      }
      const worldItem = event.target.closest('[data-world-shop]');
      if (worldItem) {
        const result = this.progression.purchaseWorldItem(worldItem.dataset.worldShop);
        this.status.textContent = result.ok ? `${result.item.name} added to Inventory.` : result.reason;
        this.render(true);
        return;
      }
      const cosmeticButton = event.target.closest('[data-cosmetic-shop]');
      if (cosmeticButton) {
        const result = this.progression.purchaseCosmetic(cosmeticButton.dataset.cosmeticShop);
        this.status.textContent = result.ok ? `${result.cosmetic.label} added to your Wardrobe.` : result.reason;
        this.render(true);
        return;
      }
      const action = event.target.closest('[data-shop-action]');
      if (!action) return;
      const id = action.dataset.itemId;
      const result = action.dataset.shopAction === 'buy'
        ? this.progression.purchase(id)
        : this.progression.equip(id);
      this.status.textContent = result.ok
        ? `${result.item.name} ${action.dataset.shopAction === 'buy' ? 'purchased' : 'equipped'}.`
        : result.reason;
      this.render(true);
    };
    this.onCloseClick = () => this.close();
    this.onOpenRequest = (event) => this.open(event.detail?.mode ?? 'buy');
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-shop', this.onOpenRequest);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() {
    if (this.isOpen) this.close(); else this.open();
  }

  open(mode = 'buy') {
    if (!this.screen) return;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.activeMode = mode === 'sell' ? 'sell' : 'buy';
    this.screen.hidden = false;
    document.body.classList.add('shop-open');
    this.updateModeHeading();
    this.status.textContent = this.activeMode === 'sell'
      ? 'Choose a specimen to sell, or sell the whole catch bag.'
      : 'Purchase maps and gear, then equip one item in each category.';
    this.render(true);
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('shop-open');
  }

  update() {
    if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render();
  }

  updateModeHeading() {
    const selling = this.activeMode === 'sell';
    if (this.eyebrow) this.eyebrow.textContent = selling
      ? "OUTFITTER'S REACH • FISH BUYER"
      : "OUTFITTER'S REACH • GEAR COUNTER";
    if (this.title) this.title.textContent = selling
      ? 'Fishmonger & Specimen Sales'
      : 'Outfitter Gear & Maps';
  }

  render(force = false) {
    if (!this.isOpen || !this.content) return;
    if (!force && this.renderedRevision === this.progression.revision) return;
    const state = this.progression.getSnapshot();
    this.money.textContent = `$${state.money}`;
    for (const tab of this.tabs?.querySelectorAll('[data-shop-tab]') ?? []) {
      tab.setAttribute('aria-pressed', String(tab.dataset.shopTab === this.activeMode));
    }
    this.content.innerHTML = this.activeMode === 'sell'
      ? this.renderSales(state)
      : `${this.renderCosmetics(state)}${this.renderWorldItems(state)}${this.renderEquipment(state)}`;
    this.renderedRevision = this.progression.revision;
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

  renderWorldItems(state) {
    const cards = MAP_ITEMS.map((item) => {
      const owned = state.ownedItems.includes(item.id);
      return `<article class="shop-card ${owned ? 'is-equipped' : ''}"><div><strong>${escapeHtml(item.name)}</strong><small>${owned ? 'OWNED' : `$${item.price}`}</small></div><p>${escapeHtml(item.description)}</p><button type="button" data-world-shop="${item.id}" ${owned || !this.progression.canAfford(item.price) ? 'disabled' : ''}>${owned ? 'IN INVENTORY' : `BUY $${item.price}`}</button></article>`;
    }).join('');
    return `<section class="shop-category"><h3>MAPS</h3><div class="shop-card-row">${cards}</div></section>`;
  }

  renderCosmetics(state) {
    const owned = new Set(state.ownedCosmetics ?? []);
    const cards = SHOP_COSMETICS.map((cosmetic) => {
      const isOwned = owned.has(cosmetic.id);
      return `<article class="shop-card ${isOwned ? 'is-equipped' : ''}"><div><strong>${escapeHtml(cosmetic.label)}</strong><small>${isOwned ? 'OWNED' : `$${cosmetic.source.price}`}</small></div><p>${escapeHtml(cosmetic.slot.replace(/([A-Z])/g, ' $1'))} • ${cosmetic.supports.join(' + ')}</p><button type="button" data-cosmetic-shop="${cosmetic.id}" ${isOwned || !this.progression.canAfford(cosmetic.source.price) ? 'disabled' : ''}>${isOwned ? 'IN WARDROBE' : `BUY $${cosmetic.source.price}`}</button></article>`;
    }).join('');
    return `<section class="shop-category"><h3>WARDROBE COSMETICS</h3><p class="shop-note">Early and mid-trail fashion. Purchased looks belong to this save slot.</p><div class="shop-card-row">${cards}</div></section>`;
  }

  renderSales(state) {
    const total = state.inventory.reduce((sum, specimen) => sum + specimen.value, 0);
    const cards = [...state.inventory].reverse().map((specimen) => (
      `<article class="shop-card"><div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)}</small></div><p>${specimen.length.toFixed(1)} in • ${specimen.weight.toFixed(2)} lb</p><button type="button" data-shop-sell="${escapeHtml(specimen.specimenId)}">SELL $${specimen.value}</button></article>`
    )).join('');
    return `<section class="shop-category"><div class="shop-category-heading"><h3>SELL CARRIED SPECIMENS</h3><button type="button" data-shop-sell-all ${state.inventory.length ? '' : 'disabled'}>SELL ALL ${state.inventory.length} • $${total}</button></div><div class="shop-card-row">${cards || '<p class="shop-empty">No carried specimens to sell.</p>'}</div></section>`;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-shop', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('shop-open');
  }
}
