import { isBoundActionCode } from '../player/movement.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function measurement(value, digits, unit) {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(digits)}${unit}`;
}

const RARITY_PAGES = [
  { id: 'common', label: 'Common' },
  { id: 'uncommon', label: 'Uncommon' },
  { id: 'rare', label: 'Rare' },
  { id: 'legendary', label: 'Legendary' }
];

const OTHER_MODAL_OPEN = () => [
  'fish-gallery', 'inventory-open', 'multiplayer-open', 'mountain-map-open', 'emote-menu-open', 'appearance-open',
  'trail-badges-open'
].some((name) => document.body.classList.contains(name));

export class FishJournal {
  constructor(saveSystem, species) {
    this.saveSystem = saveSystem;
    this.species = species;
    this.screen = document.querySelector('#fish-journal');
    this.grid = document.querySelector('#journal-grid');
    this.progress = document.querySelector('#journal-progress');
    this.totalFish = document.querySelector('#journal-total-fish');
    this.totalSummits = document.querySelector('#journal-total-summits');
    this.closeButton = document.querySelector('#close-journal');
    this.mobileButton = document.querySelector('#open-journal');
    this.isOpen = false;
    this.renderedRevision = -1;
    this.previousFocus = null;
    this.activeRarity = 'common';
    this.tabs = this.createRarityTabs();

    this.onKeyDown = (event) => {
      if (event.repeat) return;
      if (event.code === 'Escape' && this.isOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
        return;
      }
      if (!isBoundActionCode('journal', event.code) || (!this.isOpen && OTHER_MODAL_OPEN())) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggle();
    };
    this.onCloseClick = () => this.close();
    this.onOpenClick = () => this.open();
    this.onTabClick = (event) => {
      const button = event.target.closest('[data-journal-rarity]');
      if (!button) return;
      this.setRarityPage(button.dataset.journalRarity);
    };
    this.onGridClick = (event) => this.selectCard(event.target.closest('.journal-card:not(.is-unknown)'));
    this.onGridKeyDown = (event) => {
      if (!['Enter', 'Space'].includes(event.code)) return;
      const card = event.target.closest('.journal-card:not(.is-unknown)');
      if (!card) return;
      event.preventDefault();
      this.selectCard(card);
    };
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.mobileButton?.addEventListener('click', this.onOpenClick);
    this.tabs?.addEventListener('click', this.onTabClick);
    this.grid?.addEventListener('click', this.onGridClick);
    this.grid?.addEventListener('keydown', this.onGridKeyDown);
  }

  createRarityTabs() {
    if (!this.grid?.parentElement) return null;
    const existing = this.grid.parentElement.querySelector('.journal-rarity-tabs');
    if (existing) return existing;
    const tabs = document.createElement('nav');
    tabs.className = 'journal-rarity-tabs';
    tabs.setAttribute('aria-label', 'Creature rarity pages');
    tabs.innerHTML = RARITY_PAGES.map(({ id, label }) => (
      `<button type="button" data-journal-rarity="${id}" aria-pressed="${id === this.activeRarity ? 'true' : 'false'}">${label}<small>0 / 70</small></button>`
    )).join('');
    this.grid.before(tabs);
    return tabs;
  }

  toggle() {
    if (this.isOpen) this.close(); else this.open();
  }

  open() {
    if (!this.screen || this.isOpen || OTHER_MODAL_OPEN()) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('journal-open');
    document.exitPointerLock?.();
    this.refresh(true);
    this.closeButton?.focus({ preventScroll: true });
  }

  close() {
    if (!this.screen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('journal-open');
    const focusTarget = this.previousFocus?.isConnected
      ? this.previousFocus
      : document.querySelector('#game-canvas');
    focusTarget?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  setRarityPage(rarity) {
    if (!RARITY_PAGES.some((page) => page.id === rarity) || rarity === this.activeRarity) return;
    this.activeRarity = rarity;
    this.renderedRevision = -1;
    this.refresh(true);
    this.grid?.scrollTo({ top: 0, behavior: 'auto' });
  }

  selectCard(card) {
    if (!card) return;
    const wasSelected = card.classList.contains('is-selected');
    for (const entry of this.grid.querySelectorAll('.journal-card.is-selected')) {
      entry.classList.remove('is-selected');
      entry.setAttribute('aria-expanded', 'false');
      entry.querySelector('.journal-species-detail')?.setAttribute('hidden', '');
    }
    if (wasSelected) return;
    card.classList.add('is-selected');
    card.setAttribute('aria-expanded', 'true');
    card.querySelector('.journal-species-detail')?.removeAttribute('hidden');
  }

  refresh(force = false) {
    if (!force && this.renderedRevision === this.saveSystem.revision) return;
    const save = this.saveSystem.getSnapshot();
    const discovered = this.species.filter((fish) => save.collection[fish.canonicalId ?? fish.id]?.discovered).length;
    this.progress.textContent = `${discovered} / ${this.species.length} discovered`;
    this.totalFish.textContent = String(save.lifetime.fishCaught);
    this.totalSummits.textContent = String(save.lifetime.summitCount);

    for (const { id } of RARITY_PAGES) {
      const pageSpecies = this.species.filter((fish) => String(fish.rarity).toLowerCase() === id);
      const pageDiscovered = pageSpecies.filter((fish) => save.collection[fish.canonicalId ?? fish.id]?.discovered).length;
      const button = this.tabs?.querySelector(`[data-journal-rarity="${id}"]`);
      if (button) {
        button.setAttribute('aria-pressed', id === this.activeRarity ? 'true' : 'false');
        const count = button.querySelector('small');
        if (count) count.textContent = `${pageDiscovered} / ${pageSpecies.length}`;
      }
    }

    const pageSpecies = this.species.filter(
      (fish) => String(fish.rarity).toLowerCase() === this.activeRarity
    );
    this.grid.dataset.rarityPage = this.activeRarity;
    this.grid.innerHTML = pageSpecies.map((fish, index) => {
      const speciesId = fish.canonicalId ?? fish.id;
      const entry = save.collection[speciesId];
      if (!entry?.discovered) {
        return `<article class="journal-card is-unknown" data-species-id="${escapeHtml(speciesId)}">
          <div class="journal-silhouette" aria-hidden="true">◆</div>
          <span class="journal-card-number">${escapeHtml(fish.catalogId ?? String(index + 1).padStart(2, '0'))}</span>
          <strong>???</strong>
          <small>UNDISCOVERED</small>
        </article>`;
      }
      const baselineBpm = Math.round((fish.rhythm.bpm[0] + fish.rhythm.bpm[1]) / 2 + 20);
      return `<article class="journal-card" data-species-id="${escapeHtml(speciesId)}" data-rarity="${escapeHtml(fish.rarity.toLowerCase())}" tabindex="0" role="button" aria-expanded="false" aria-label="View ${escapeHtml(fish.name)} details">
        <div class="journal-card-heading">
          <span>${escapeHtml(entry.rarity || fish.rarityLabel || fish.rarity)}</span>
          <b>${entry.catches} caught</b>
        </div>
        <strong>${escapeHtml(fish.name)}</strong>
        <dl>
          <div><dt>BEST LENGTH</dt><dd>${measurement(entry.bestLength, 1, 'in')} · ${escapeHtml(entry.bestLengthCategory || '—')}</dd></div>
          <div><dt>BEST WEIGHT</dt><dd>${measurement(entry.bestWeight, 2, 'lb')} · ${escapeHtml(entry.bestSizeCategory || '—')}</dd></div>
          <div><dt>BEST QUALITY</dt><dd>${escapeHtml(entry.bestQuality || '—')}</dd></div>
          <div><dt>SHINIES</dt><dd>${entry.shinyCount}</dd></div>
          <div><dt>BASE TEMPO</dt><dd>${baselineBpm} BPM</dd></div>
        </dl>
        <small>${entry.firstLocation ? `First found at ${escapeHtml(entry.firstLocation)}` : 'Location not recorded'}</small>
        <p class="journal-species-detail" hidden>${escapeHtml(fish.flavor)}</p>
      </article>`;
    }).join('');
    this.renderedRevision = this.saveSystem.revision;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    this.mobileButton?.removeEventListener('click', this.onOpenClick);
    this.tabs?.removeEventListener('click', this.onTabClick);
    this.grid?.removeEventListener('click', this.onGridClick);
    this.grid?.removeEventListener('keydown', this.onGridKeyDown);
    document.body.classList.remove('journal-open');
  }
}
