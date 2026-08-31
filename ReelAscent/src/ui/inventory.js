import { resolveSpecies } from '../fishing/fish-data.js';
import { EQUIPMENT_CATALOG } from '../progression/equipment.js';
import { MAP_ITEM_BY_ID } from '../world/world-locations.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[character]);

const OTHER_MODAL_OPEN = () => [
  'fish-gallery', 'journal-open', 'multiplayer-open', 'mountain-map-open', 'emote-menu-open',
  'appearance-open', 'shop-open', 'aquarium-open', 'boat-travel-open', 'pause-open'
].some((className) => document.body.classList.contains(className));

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

const CATEGORY_LABELS = Object.freeze({
  rod: 'Rod', reel: 'Reel', line: 'Line', lure: 'Lure', guide: 'Ecology Guide',
  boots: 'Boots', gloves: 'Gloves', climbing: 'Climbing Equipment'
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
    this.isOpen = false;
    this.activeTab = 'catches';
    this.renderedRevision = -1;
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
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.mobileButton?.addEventListener('click', this.onOpenClick);
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
    const equipButton = event.target.closest('[data-inventory-equip]');
    if (equipButton) {
      const result = this.progression.equip(equipButton.dataset.inventoryEquip);
      this.status.textContent = result.ok ? `${result.item.name} equipped.` : result.reason;
      this.render(true, true);
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
    this.activeTab = ['catches', 'gear'].includes(tab) ? tab : 'catches';
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
    if (!['catches', 'gear'].includes(tab) || tab === this.activeTab) return;
    this.activeTab = tab;
    this.render(true);
  }
  update() {
    if (this.isOpen && this.renderedRevision !== this.progression.revision) this.render();
  }

  render(force = false, preserveStatus = false) {
    if (!this.isOpen || !this.content || (!force && this.renderedRevision === this.progression.revision)) return;
    const state = this.progression.getSnapshot();
    this.balance.textContent = `$${state.money}`;
    this.title.textContent = 'Inventory';
    for (const button of this.tabs?.querySelectorAll('[data-collection-tab]') ?? []) {
      button.setAttribute('aria-pressed', String(button.dataset.collectionTab === this.activeTab));
    }
    if (!preserveStatus) this.status.textContent = this.activeTab === 'catches'
      ? 'Every landed catch stays here until you sell it at Shop Island or move it at Aquarium Island.'
      : 'Equip owned gear here. Buying and selling stay at Shop Island.';
    this.content.className = `inventory-content inventory-${this.activeTab}`;
    this.content.innerHTML = this.activeTab === 'catches' ? this.renderCatches(state) : this.renderGear(state);
    this.renderedRevision = this.progression.revision;
  }

  renderCatches(state) {
    const specimens = [...(state.inventory ?? [])].reverse().map((specimen) => (
      `<article class="inventory-card" data-rarity="${escapeHtml(specimen.rarity.toLowerCase())}" data-held="${state.heldSpecimenId === specimen.specimenId}">${specimenPreview(specimen)}<div class="inventory-card-heading"><strong>${escapeHtml(specimen.name)}${specimen.shiny ? ' ✦' : ''}</strong><small>${escapeHtml(specimen.rarity)} • ${escapeHtml(specimen.quality)}</small></div><dl><div><dt>LENGTH</dt><dd>${specimen.length.toFixed(1)} in • ${escapeHtml(specimen.lengthCategory)}</dd></div><div><dt>BODY</dt><dd>${specimen.weight.toFixed(2)} lb • ${escapeHtml(specimen.sizeCategory)}</dd></div><div><dt>VALUE</dt><dd>$${specimen.value}</dd></div><div><dt>FOUND</dt><dd>${escapeHtml(specimen.provenance.locationLabel || 'Unknown water')}</dd></div></dl><div class="inventory-actions"><button type="button" data-inventory-action="hold" data-specimen-id="${escapeHtml(specimen.specimenId)}">${state.heldSpecimenId === specimen.specimenId ? 'PUT AWAY' : 'HOLD IN HAND'}</button></div></article>`
    )).join('');
    return specimens || '<p class="shop-empty">No carried catches yet.</p>';
  }

  renderGear(state) {
    const maps = (state.ownedItems ?? []).map((id) => MAP_ITEM_BY_ID.get(id)).filter(Boolean).map((item) => (
      `<article class="inventory-card inventory-item-card" data-held="${state.heldItemId === item.id}"><div class="inventory-item-icon">${item.mode === 'gps' ? '⌖' : '⌁'}</div><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div><button type="button" data-world-item-action="${item.id}">${item.mode === 'gps' ? 'USE GPS MAP' : 'HOLD / READ MAP'}</button></article>`
    )).join('');
    const equipment = Object.entries(CATEGORY_LABELS).map(([category, label]) => {
      const owned = EQUIPMENT_CATALOG.filter((item) => item.category === category && state.ownedEquipment.includes(item.id));
      if (!owned.length) return '';
      const cards = owned.map((item) => {
        const equipped = state.equipped[category] === item.id;
        return `<article class="inventory-card gear-card ${equipped ? 'is-equipped' : ''}"><div class="inventory-card-heading"><strong>${escapeHtml(item.name)}</strong><small>${equipped ? 'EQUIPPED' : 'OWNED'}</small></div><p>${escapeHtml(item.effect)}</p><button type="button" data-inventory-equip="${item.id}" ${equipped ? 'disabled' : ''}>${equipped ? 'EQUIPPED' : 'EQUIP'}</button></article>`;
      }).join('');
      return `<section class="inventory-gear-group"><h3>${label}</h3><div class="inventory-gear-row">${cards}</div></section>`;
    }).join('');
    return `${maps ? `<section class="inventory-gear-group"><h3>Maps</h3><div class="inventory-gear-row">${maps}</div></section>` : ''}${equipment}`
      || '<p class="shop-empty">No gear yet. Visit Shop Island.</p>';
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.mobileButton?.removeEventListener('click', this.onOpenClick);
    document.body.classList.remove('inventory-open');
  }
}
