import { resolveSpecies } from '../fishing/fish-data.js';
import { EQUIPMENT_CATALOG } from '../progression/equipment.js';
import { MAP_ITEM_BY_ID } from '../world/world-locations.js';
import { isBoundActionCode } from '../player/movement.js';

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

const SPECIMEN_PREVIEW_CACHE = new Map();

function specimenPreview(specimen) {
  const species = resolveSpecies(specimen.speciesId);
  const [primary, accent] = species?.visual?.colors ?? [[.45, .62, .55], [.82, .72, .38]];
  const archetype = species?.visual?.archetype ?? 'panfish';
  const key = `${species?.id ?? specimen.speciesId}:${archetype}:${specimen.shiny ? 1 : 0}`;
  let drawing = SPECIMEN_PREVIEW_CACHE.get(key);
  const p = colorCss(primary);
  const a = colorCss(accent);
  const sparkle = specimen.shiny ? '<path d="M78 11v10M73 16h10" class="specimen-sparkle" />' : '';
  if (!drawing) {
    if (['ray', 'skate', 'flatfish'].includes(archetype)) drawing = `<path d="M13 28Q39 2 72 23L90 28 72 33Q39 54 13 28Z" fill="${p}"/><path d="M72 28H94" stroke="${a}" stroke-width="3"/><circle cx="63" cy="22" r="2" fill="#102d30"/>`;
    else if (['shark', 'dogfish'].includes(archetype)) drawing = `<path d="M15 28 3 16v24z" fill="${a}"/><ellipse cx="49" cy="28" rx="32" ry="12" fill="${p}"/><path d="M44 17 53 4l7 15M42 38l10 12 7-13" fill="${a}"/><path d="m72 24 15 4-15 4" fill="${p}"/><circle cx="71" cy="23" r="2" fill="#102d30"/>`;
    else if (['octopus', 'squid', 'cuttlefish', 'jellyfish', 'anemone', 'lusca', 'softbody'].includes(archetype)) drawing = `<ellipse cx="49" cy="20" rx="21" ry="16" fill="${p}"/><path d="M31 31q-8 17 3 20M39 33q-5 14 2 20M48 34v19M57 33q5 14-2 20M65 31q8 17-3 20" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/><circle cx="42" cy="18" r="2"/><circle cx="56" cy="18" r="2"/>`;
    else if (['crab', 'lobster', 'crayfish', 'shrimp', 'insect', 'arachnid', 'horseshoe'].includes(archetype)) drawing = `<ellipse cx="49" cy="28" rx="22" ry="13" fill="${p}"/><circle cx="22" cy="20" r="8" fill="${a}"/><circle cx="76" cy="20" r="8" fill="${a}"/><path d="M31 35 17 47M40 38 34 52M58 38l6 14M67 35l14 12" stroke="${a}" stroke-width="4"/><circle cx="43" cy="23" r="2"/><circle cx="55" cy="23" r="2"/>`;
    else if (['clam', 'oyster', 'mussel', 'scallop', 'bivalve', 'nautilus', 'snail'].includes(archetype)) drawing = `<path d="M19 38Q26 7 49 7t30 31Q49 52 19 38Z" fill="${p}" stroke="${a}" stroke-width="3"/><path d="M49 9v35M35 13l8 32M63 13l-8 32" stroke="${a}" stroke-width="2" opacity=".75"/>`;
    else if (['turtle', 'frog', 'salamander'].includes(archetype)) drawing = `<ellipse cx="47" cy="28" rx="23" ry="15" fill="${p}"/><circle cx="73" cy="27" r="9" fill="${a}"/><path d="M31 18 17 10M31 38 16 47M60 18 69 8M60 38l10 10" stroke="${a}" stroke-width="6" stroke-linecap="round"/><circle cx="77" cy="24" r="2"/>`;
    else if (['starfish', 'urchin'].includes(archetype)) drawing = archetype === 'starfish'
      ? `<path d="m49 4 8 17 20-5-13 15 13 17-21-7-8 13-7-14-22 7 14-17-13-15 21 6Z" fill="${p}" stroke="${a}" stroke-width="2"/>`
      : `<circle cx="49" cy="28" r="17" fill="${p}"/><path d="M49 3v50M24 28h50M31 10l36 36M67 10 31 46M39 5l20 46M20 18l58 20" stroke="${a}" stroke-width="2"/>`;
    else if (['cetacean', 'pinniped', 'sirenian', 'otter', 'beaver', 'rodent', 'platypus', 'mammal'].includes(archetype)) drawing = `<ellipse cx="47" cy="29" rx="30" ry="14" fill="${p}"/><circle cx="76" cy="25" r="10" fill="${a}"/><path d="M18 28 4 17v22zM44 40l10 10 9-13" fill="${a}"/><circle cx="79" cy="22" r="2"/>`;
    else if (archetype === 'wisp') drawing = `<circle cx="62" cy="23" r="14" fill="${p}"/><circle cx="43" cy="30" r="10" fill="${a}"/><circle cx="28" cy="36" r="7" fill="${p}"/><path d="M14 43Q34 23 54 31" fill="none" stroke="${a}" stroke-width="4"/>`;
    else if (['serpent', 'dragon', 'plesiosaur', 'waterhorse', 'eel', 'lamprey'].includes(archetype)) drawing = `<path d="M7 36Q23 9 44 31T81 24" fill="none" stroke="${p}" stroke-width="13" stroke-linecap="round"/><ellipse cx="82" cy="24" rx="10" ry="8" fill="${a}"/><circle cx="85" cy="21" r="2"/>`;
    else {
      const bodyRx = ['slender', 'eel'].includes(archetype) ? 30 : 23;
      drawing = `<path d="M18 28 4 17v22z" fill="${a}"/><ellipse cx="48" cy="28" rx="${bodyRx}" ry="15" fill="${p}"/><path d="M38 15 51 4l11 13M40 41l12 10 10-12" fill="${a}"/><circle cx="${48 + bodyRx - 8}" cy="23" r="2.4" fill="#102d30"/>`;
    }
    drawing += sparkle;
    SPECIMEN_PREVIEW_CACHE.set(key, drawing);
  }
  return `<svg class="inventory-specimen-preview" viewBox="0 0 96 56" role="img" aria-label="${escapeHtml(specimen.name)} ${escapeHtml(archetype)} specimen preview">${drawing}</svg>`;
}

const CATEGORY_LABELS = Object.freeze({
  rod: 'Rod', reel: 'Reel', line: 'Line', lure: 'Lure', guide: 'Ecology Guide',
  boots: 'Boots', gloves: 'Gloves', climbingTool: 'Climbing Tool', chalk: 'Chalk Bag', harness: 'Harness / Pack'
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
      if (isBoundActionCode('inventory', event.code)) {
        if (!this.isOpen && OTHER_MODAL_OPEN()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.toggle();
      } else if (isBoundActionCode('map', event.code) && !this.isOpen && !OTHER_MODAL_OPEN()) {
        const state = this.progression.getSnapshot();
        const item = MAP_ITEM_BY_ID.get(state.heldItemId)
          ?? (state.ownedItems ?? []).map((id) => MAP_ITEM_BY_ID.get(id)).find((entry) => entry?.mode === 'gps')
          ?? (state.ownedItems ?? []).map((id) => MAP_ITEM_BY_ID.get(id)).find(Boolean);
        if (!item) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent('reel-ascent:open-map', { detail: { mode: item.mode } }));
      } else if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
      }
    };
    this.onClick = (event) => this.handleClick(event);
    this.onChange = (event) => {
      const select = event.target.closest?.('[data-inventory-equip-select]');
      if (!select) return;
      const result = this.progression.equip(select.value);
      this.status.textContent = result.ok ? `${result.item.name} equipped in ${CATEGORY_LABELS[result.item.category]}.` : result.reason;
      this.render(true, true);
    };
    this.onCloseClick = () => this.close();
    this.onOpenClick = () => { if (!OTHER_MODAL_OPEN()) this.open(); };
    window.addEventListener('keydown', this.onKeyDown, true);
    this.screen?.addEventListener('click', this.onClick);
    this.screen?.addEventListener('change', this.onChange);
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
    const mapOpenButton = event.target.closest('[data-world-map-open]');
    if (mapOpenButton) {
      const item = MAP_ITEM_BY_ID.get(mapOpenButton.dataset.worldMapOpen);
      if (!item) return;
      this.close();
      window.dispatchEvent(new CustomEvent('reel-ascent:open-map', { detail: { mode: item.mode } }));
      return;
    }
    const itemButton = event.target.closest('[data-world-item-action]');
    if (itemButton) {
      const item = MAP_ITEM_BY_ID.get(itemButton.dataset.worldItemAction);
      const currentlyHeld = this.progression.getSnapshot().heldItemId === item?.id;
      const result = this.progression.setHeldWorldItem(currentlyHeld ? null : item?.id);
      this.status.textContent = result.ok && item
        ? (currentlyHeld ? `${item.name} put away.` : `${item.name} equipped in the one Hand slot; local minimap enabled.`)
        : result.reason;
      return this.render(true, true);
    }
    const handEquipmentButton = event.target.closest('[data-hand-equipment]');
    if (handEquipmentButton) {
      const itemId = handEquipmentButton.dataset.handEquipment;
      const currentlyHeld = this.progression.getSnapshot().heldItemId === itemId;
      const result = this.progression.setHeldEquipmentItem(currentlyHeld ? null : itemId);
      this.status.textContent = result.ok
        ? (currentlyHeld ? 'Ice Axe put away; its terrain bonus is inactive.' : 'Ice Axe equipped in the one Hand slot.')
        : result.reason;
      return this.render(true, true);
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
      ? "Every landed catch stays here until you sell it at Outfitter's Reach or move it to Glasswater Isle."
      : "Equip owned gear here. Buying and selling stay at Outfitter's Reach.";
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
      `<article class="inventory-card inventory-item-card" data-held="${state.heldItemId === item.id}"><div class="inventory-item-icon">${item.mode === 'gps' ? '⌖' : '⌁'}</div><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div><div class="inventory-item-actions"><button type="button" data-world-map-open="${item.id}">OPEN FULL MAP</button><button type="button" data-world-item-action="${item.id}">${state.heldItemId === item.id ? 'PUT AWAY' : 'EQUIP IN HAND'}</button></div></article>`
    )).join('');
    const equipment = Object.entries(CATEGORY_LABELS).map(([category, label]) => {
      const owned = EQUIPMENT_CATALOG.filter((item) => item.category === category && state.ownedEquipment.includes(item.id));
      if (!owned.length) return '';
      const equipped = owned.find((item) => item.id === state.equipped[category]) ?? owned[0];
      const options = owned.map((item) => `<option value="${item.id}" ${item.id === equipped.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
      const worn = ['boots', 'gloves', 'chalk', 'harness'].includes(category) ? 'WORN' : 'EQUIPPED';
      return `<section class="inventory-gear-group inventory-equipment-slot"><h3>${label}<small>${worn}</small></h3><label><span>${escapeHtml(equipped.name)}</span><select data-inventory-equip-select="${category}" aria-label="Equip ${escapeHtml(label)}">${options}</select><p>${escapeHtml(equipped.effect)}</p></label></section>`;
    }).join('');
    const heldSpecimen = (state.inventory ?? []).find((entry) => entry.specimenId === state.heldSpecimenId);
    const heldMap = MAP_ITEM_BY_ID.get(state.heldItemId);
    const equippedHandTool = EQUIPMENT_CATALOG.find((item) => item.usesHand && item.id === state.equipped.climbingTool);
    const heldTool = EQUIPMENT_CATALOG.find((item) => item.usesHand && item.id === state.heldItemId);
    const handLabel = heldSpecimen?.name ?? heldMap?.name ?? heldTool?.name ?? 'Empty';
    const handDetail = heldSpecimen
      ? `${heldSpecimen.length.toFixed(1)} in specimen`
      : heldMap ? 'Hand map • corner minimap active'
        : heldTool ? 'Handheld climbing tool • terrain bonus active'
          : 'Equip one specimen, map, or handheld tool';
    const toolAction = equippedHandTool
      ? `<button type="button" data-hand-equipment="${equippedHandTool.id}">${heldTool ? 'PUT TOOL AWAY' : 'EQUIP TOOL IN HAND'}</button>`
      : '';
    const hand = `<section class="inventory-gear-group inventory-hand-group"><h3>Hand • exactly one slot</h3><div class="inventory-hand-slot"><strong>${escapeHtml(handLabel)}</strong><small>${escapeHtml(handDetail)}</small>${toolAction}</div></section>`;
    return `${hand}${maps ? `<section class="inventory-gear-group"><h3>Maps</h3><div class="inventory-gear-row">${maps}</div></section>` : ''}${equipment}`
      || "<p class=\"shop-empty\">No gear yet. Visit Outfitter's Reach.</p>";
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.screen?.removeEventListener('click', this.onClick);
    this.screen?.removeEventListener('change', this.onChange);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.mobileButton?.removeEventListener('click', this.onOpenClick);
    document.body.classList.remove('inventory-open');
  }
}
