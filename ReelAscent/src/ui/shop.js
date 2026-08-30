import { EQUIPMENT_CATALOG } from '../progression/equipment.js';
import { MAP_ITEMS } from '../world/world-locations.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const CATEGORY_LABELS = Object.freeze({
  rod: 'RODS', reel: 'REELS', line: 'LINES', lure: 'LURES', guide: 'ECOLOGY GUIDES', traversal: 'TRAVERSAL'
});

export class ShopMenu {
  constructor(progression) {
    this.progression = progression;
    this.screen = document.querySelector('#progression-shop');
    this.closeButton = document.querySelector('#close-shop');
    this.money = document.querySelector('#shop-money');
    this.tabs = document.querySelector('#shop-tabs');
    this.content = document.querySelector('#shop-content');
    this.status = document.querySelector('#shop-status');
    this.isOpen = false;
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
    this.onOpenRequest = () => this.open();
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('reel-ascent:open-shop', this.onOpenRequest);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
  }

  toggle() {
    if (this.isOpen) this.close(); else this.open();
  }

  open() {
    if (!this.screen) return;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('shop-open');
    this.status.textContent = 'Purchase gear and equip one item in each category.';
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

  render(force = false) {
    if (!this.isOpen || !this.content) return;
    if (!force && this.renderedRevision === this.progression.revision) return;
    const state = this.progression.getSnapshot();
    this.money.textContent = `$${state.money}`;
    this.content.innerHTML = `${this.renderWorldItems(state)}${this.renderSales(state)}${this.renderEquipment(state)}`;
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

  renderSales(state) {
    const cards = [...state.inventory].reverse().map((specimen) => (
      `<article class="shop-card"><div><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)}</small></div><p>${specimen.length.toFixed(1)} in • ${specimen.weight.toFixed(2)} lb</p><button type="button" data-shop-sell="${escapeHtml(specimen.specimenId)}">SELL $${specimen.value}</button></article>`
    )).join('');
    return `<section class="shop-category"><h3>SELL CARRIED SPECIMENS</h3><div class="shop-card-row">${cards || '<p class="shop-empty">No carried specimens to sell.</p>'}</div></section>`;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('reel-ascent:open-shop', this.onOpenRequest);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('shop-open');
  }
}
