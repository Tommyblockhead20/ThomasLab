import { WORLD_CENTER, WORLD_LOCATIONS, WORLD_MAP_DISPLAY_RADIUS, compressWorldMapPosition } from '../world/world-locations.js';

export const BOAT_MAP_CLOUD_STATES = Object.freeze(new Set(['locked-cloud', 'known-unavailable']));
export const boatMapDestinationUsesClouds = state => BOAT_MAP_CLOUD_STATES.has(String(state ?? ''));
export function boatMapLockSummary(access = {}) {
  const reason = String(access.reason ?? '');
  if (access.state === 'known-unavailable') return 'Coming in a future update';
  if (access.state === 'locked-purchase') return 'Bluewater Boat · $2,000 at the Outfitter';
  const progress = reason.match(/Discover (\d+) Trail Badges or catch (\d+) unique species/i);
  return progress ? `${progress[1]} Trail Badges or ${progress[2]} species` : reason.replace(/[.]$/, '');
}
const DESCRIPTIONS = {
  'main-mountain': ['Climb & explore', 'Rocky shores, forest lakes, hidden caves, and the summit tarn.'],
  'home-island': ['Your island home', 'Return to your cabin, change your look, or fish the quiet pond.'],
  'shop-island': ['Gear & fish market', 'Upgrade your kit and sell your latest catches.'],
  'aquarium-island': ['Your living collection', 'Arrange your tanks and watch your catches swim.'],
  'cave-fishing-island': ['Cave freshwater', 'A sheltered pool inside the island’s basalt hollow.'],
  'normal-fishing-island': ['Mangrove lagoon', 'Tangled roots, warm brackish water, and unusual wildlife.'],
  'cold-island': ['Frozen frontier', 'An icy lake and cold ocean beyond the snowy shore.'],
  'veiled-athenaeum': ['A place of old stories', 'Explore the library island and its strange, quiet waters.'],
  'skyreach-foundation': ['Under construction', 'This destination is charted. Its adventures are still being built.'],
  'bluewater-reach': ['Offshore fishing', 'Sail beyond the coast in search of larger ocean creatures.']
};
const ICONS = { 'main-island': '▲', 'home-island': '⌂', 'developed-island': '⚑', 'aquarium-island': '◈', 'cave-island': '◒', 'fishing-island': '♧', 'cold-island': '❄', 'mythical-library-island': '✦', 'large-island-foundation': '▱', 'open-water-boat': '⛵' };
const element = (tag, className, text) => { const e = document.createElement(tag); e.className = className; if (text != null) e.textContent = text; return e; };

export class BoatTravelMenu {
  constructor(onTravel, { getDestinationAccess = () => ({ state: 'available', revealed: true, playable: true }), ownsBoat = () => true } = {}) {
    Object.assign(this, { onTravel, getDestinationAccess, ownsBoat, currentId: 'main-mountain', selectedId: null, isOpen: false, travelInProgress: false });
    this.screen = document.querySelector('#boat-travel'); this.map = document.querySelector('#boat-travel-map'); this.list = document.querySelector('#boat-travel-list');
    this.title = document.querySelector('#boat-travel-selection'); this.detail = document.querySelector('#boat-travel-detail');
    this.confirmButton = document.querySelector('#confirm-boat-travel'); this.closeButton = document.querySelector('#close-boat-travel');
    this.transition = document.querySelector('#boat-travel-transition'); this.viewButton = document.querySelector('#boat-travel-view');
    this.onClick = event => { const marker = event.target.closest('[data-travel-destination]'); if (marker) this.select(marker.dataset.travelDestination); };
    this.onDoubleClick = event => { const marker = event.target.closest('[data-travel-destination]'); if (marker && this.select(marker.dataset.travelDestination)) { event.preventDefault(); void this.travel(); } };
    this.onConfirm = () => void this.travel(); this.onClose = () => this.close();
    this.onView = () => { const chart = this.screen.dataset.view !== 'chart'; this.screen.dataset.view = chart ? 'chart' : 'destinations'; this.viewButton.textContent = chart ? 'DESTINATIONS' : 'VIEW CHART'; this.viewButton.setAttribute('aria-pressed', String(chart)); };
    this.onKeyDown = event => { if (event.code === 'Escape' && this.isOpen && !this.travelInProgress) { event.preventDefault(); event.stopImmediatePropagation(); this.close(); } };
    this.map?.addEventListener('click', this.onClick); this.map?.addEventListener('dblclick', this.onDoubleClick); this.list?.addEventListener('click', this.onClick);
    this.confirmButton?.addEventListener('click', this.onConfirm); this.closeButton?.addEventListener('click', this.onClose); this.viewButton?.addEventListener('click', this.onView);
    window.addEventListener('keydown', this.onKeyDown, true); this.render();
  }
  markerAccess(location) { return this.getDestinationAccess(location.id) ?? {}; }
  render() {
    if (!this.map) return;
    this.map.replaceChildren(element('span', 'boat-map-chart-title', 'THE STONEVEIL ISLES'), element('span', 'boat-map-compass', 'N\n✧'));
    const markers = [], rows = [];
    for (const location of WORLD_LOCATIONS) {
      const access = this.markerAccess(location), hidden = access.revealed === false, name = hidden ? 'Uncharted Waters' : location.displayName;
      const current = location.id === this.currentId, selected = location.id === this.selectedId;
      const marker = element('button', `boat-map-island boat-map-${location.type} is-${access.state ?? 'available'}`);
      marker.type = 'button'; marker.dataset.travelDestination = location.id; marker.setAttribute('aria-label', name);
      const p = compressWorldMapPosition(location.worldPosition);
      marker.style.left = `${50 + (p.x - WORLD_CENTER.x) / WORLD_MAP_DISPLAY_RADIUS * 41}%`;
      marker.style.top = `${50 + (p.z - WORLD_CENTER.z) / WORLD_MAP_DISPLAY_RADIUS * 39}%`;
      const footprint = element('span', 'boat-map-footprint', ['main-island', 'open-water-boat'].includes(location.type) ? ICONS[location.type] : '');
      if (location.outline?.length && !['main-island', 'open-water-boat'].includes(location.type)) {
        const xs = location.outline.map(p => p.x), zs = location.outline.map(p => p.z), minX = Math.min(...xs), minZ = Math.min(...zs);
        footprint.style.clipPath = `polygon(${location.outline.map(p => `${(p.x - minX) / (Math.max(...xs) - minX) * 100}% ${(p.z - minZ) / (Math.max(...zs) - minZ) * 100}%`).join(',')})`;
      }
      marker.append(footprint, element('b', '', name));
      if (boatMapDestinationUsesClouds(access.state)) {
        const clouds = element('span', 'boat-map-clouds'); clouds.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 5; i += 1) clouds.append(element('i', ''));
        marker.append(clouds, element('small', 'boat-map-lock', access.state === 'known-unavailable' ? 'UNDER CONSTRUCTION' : 'LOCKED'));
      } else if (access.state === 'locked-purchase') marker.append(element('small', 'boat-map-lock', 'BOAT REQUIRED'));
      if (current) marker.append(element('small', 'boat-map-you', 'YOU ARE HERE'));
      const row = element('button', 'boat-travel-list-item'); row.type = 'button'; row.dataset.travelDestination = location.id;
      const copy = element('span', 'boat-destination-copy'); copy.append(element('strong', '', name), element('small', '', current ? 'You are here' : access.playable ? DESCRIPTIONS[location.id]?.[0] ?? 'Ready to explore' : boatMapLockSummary(access)));
      row.append(element('span', 'boat-destination-icon', hidden ? '?' : ICONS[location.type] ?? '⌂'), copy, element('span', 'boat-destination-state', current ? 'HERE' : access.playable ? '↗' : 'LOCKED'));
      for (const button of [marker, row]) { button.classList.toggle('is-current', current); button.classList.toggle('is-selected', selected); button.classList.toggle('is-unavailable', !access.playable); button.setAttribute('aria-pressed', String(selected)); }
      markers.push(marker); rows.push(row);
    }
    this.map.append(...markers); this.list?.replaceChildren(...rows); this.renderSelection();
  }
  renderSelection() {
    const location = WORLD_LOCATIONS.find(l => l.id === this.selectedId);
    if (!location) { if (this.title) this.title.textContent = 'Choose your next stop'; if (this.detail) this.detail.textContent = 'Pick an island to see what awaits.'; this.confirmButton.textContent = 'SET SAIL'; this.confirmButton.disabled = true; return; }
    const access = this.markerAccess(location), current = location.id === this.currentId;
    this.title.textContent = access.revealed === false ? 'Uncharted Waters' : location.displayName;
    if (this.detail) this.detail.textContent = access.playable ? DESCRIPTIONS[location.id]?.[1] ?? 'A new shore to explore.' : boatMapLockSummary(access);
    this.confirmButton.disabled = current || !access.playable || this.travelInProgress;
    this.confirmButton.textContent = current ? 'YOU ARE HERE' : access.playable ? 'SET SAIL  →' : access.state === 'known-unavailable' ? 'COMING SOON' : 'LOCKED';
  }
  open(currentId = 'main-mountain') {
    if (!this.screen || this.isOpen) return;
    document.exitPointerLock?.(); Object.assign(this, { currentId, selectedId: null, travelInProgress: false, isOpen: true });
    this.screen.dataset.view = 'destinations'; if (this.viewButton) { this.viewButton.textContent = 'VIEW CHART'; this.viewButton.setAttribute('aria-pressed', 'false'); }
    this.render(); this.screen.hidden = false; document.body.classList.add('boat-travel-open'); this.closeButton?.focus({ preventScroll: true });
  }
  select(id) {
    if (this.travelInProgress || !WORLD_LOCATIONS.some(l => l.id === id)) return false;
    this.selectedId = id; this.renderSelection();
    for (const marker of this.screen.querySelectorAll('[data-travel-destination]')) { const selected = marker.dataset.travelDestination === id; marker.classList.toggle('is-selected', selected); marker.setAttribute('aria-pressed', String(selected)); }
    return true;
  }
  async travel() {
    const destination = WORLD_LOCATIONS.find(l => l.id === this.selectedId);
    if (!destination || !this.onTravel || this.travelInProgress || destination.id === this.currentId || !this.markerAccess(destination).playable) return;
    this.travelInProgress = true; this.confirmButton.disabled = true; this.closeButton.disabled = true;
    try {
      if (this.transition) { this.transition.hidden = false; this.transition.querySelector('strong').textContent = `Sailing to ${destination.displayName}…`; }
      await new Promise(resolve => globalThis.setTimeout(resolve, 450)); await this.onTravel(destination.id);
      await new Promise(resolve => globalThis.setTimeout(resolve, 250)); this.close();
    } finally { this.travelInProgress = false; if (this.transition) this.transition.hidden = true; this.closeButton.disabled = false; this.renderSelection(); }
  }
  close() { if (!this.screen || !this.isOpen) return; this.isOpen = false; this.screen.hidden = true; document.body.classList.remove('boat-travel-open'); document.querySelector('#game-canvas')?.focus({ preventScroll: true }); }
  destroy() {
    this.map?.removeEventListener('click', this.onClick); this.map?.removeEventListener('dblclick', this.onDoubleClick); this.list?.removeEventListener('click', this.onClick);
    this.confirmButton?.removeEventListener('click', this.onConfirm); this.closeButton?.removeEventListener('click', this.onClose); this.viewButton?.removeEventListener('click', this.onView); window.removeEventListener('keydown', this.onKeyDown, true); document.body.classList.remove('boat-travel-open');
  }
}
