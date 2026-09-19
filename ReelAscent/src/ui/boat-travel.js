import {
  WORLD_CENTER,
  WORLD_LOCATIONS,
  WORLD_MAP_DISPLAY_RADIUS,
  compressWorldMapPosition
} from '../world/world-locations.js';

export class BoatTravelMenu {
  constructor(onTravel, {
    getDestinationAccess = () => ({ state: 'available', revealed: true, playable: true }),
    ownsBoat = () => true
  } = {}) {
    this.onTravel = onTravel;
    this.getDestinationAccess = getDestinationAccess;
    this.ownsBoat = ownsBoat;
    this.screen = document.querySelector('#boat-travel');
    this.map = document.querySelector('#boat-travel-map');
    this.title = document.querySelector('#boat-travel-selection');
    this.confirmButton = document.querySelector('#confirm-boat-travel');
    this.closeButton = document.querySelector('#close-boat-travel');
    this.transition = document.querySelector('#boat-travel-transition');
    this.currentId = 'main-mountain';
    this.selectedId = null;
    this.isOpen = false;
    this.travelInProgress = false;
    this.onClick = (event) => {
      const marker = event.target.closest('[data-travel-destination]');
      if (marker) this.select(marker.dataset.travelDestination);
    };
    this.onDoubleClick = (event) => {
      const marker = event.target.closest('[data-travel-destination]');
      if (!marker || !this.select(marker.dataset.travelDestination)) return;
      event.preventDefault();
      void this.travel();
    };
    this.onConfirm = () => void this.travel();
    this.onClose = () => this.close();
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen || this.transition?.hidden === false) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    this.map?.addEventListener('click', this.onClick);
    this.map?.addEventListener('dblclick', this.onDoubleClick);
    this.confirmButton?.addEventListener('click', this.onConfirm);
    this.closeButton?.addEventListener('click', this.onClose);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  isCourtesyFerry(id) {
    return (this.currentId === 'home-island' && id === 'shop-island')
      || (this.currentId === 'shop-island' && id === 'home-island');
  }

  markerAccess(location) {
    const access = this.getDestinationAccess(location.id) ?? {};
    const boatAllowed = this.ownsBoat() || this.isCourtesyFerry(location.id);
    return {
      ...access,
      playable: access.playable !== false && boatAllowed,
      reason: access.playable === false
        ? access.reason
        : boatAllowed ? '' : 'Purchase the $2000 Trail Boat at Outfitter\'s Reach.'
    };
  }

  render() {
    if (!this.map) return;
    this.map.replaceChildren(...WORLD_LOCATIONS.map((location) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.travelDestination = location.id;
      button.className = `boat-map-island boat-map-${location.type}`;
      const access = this.markerAccess(location);
      button.disabled = !access.playable;
      button.classList.add(`is-${access.state ?? 'available'}`);
      const mapped = compressWorldMapPosition(location.worldPosition);
      const x = 50 + (mapped.x - WORLD_CENTER.x) / WORLD_MAP_DISPLAY_RADIUS * 42;
      const y = 50 + (mapped.z - WORLD_CENTER.z) / WORLD_MAP_DISPLAY_RADIUS * 42;
      button.style.left = `${x}%`;
      button.style.top = `${y}%`;
      const footprint = document.createElement('span');
      footprint.className = 'boat-map-footprint';
      if (location.type === 'main-island') {
        footprint.textContent = '⛰';
      } else if (location.type === 'open-water-boat') {
        footprint.textContent = '⛵';
      } else if (location.outline?.length) {
        const xs = location.outline.map((point) => point.x);
        const zs = location.outline.map((point) => point.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        footprint.style.clipPath = `polygon(${location.outline.map((point) => `${((point.x - minX) / Math.max(.001, maxX - minX) * 100).toFixed(1)}% ${((point.z - minZ) / Math.max(.001, maxZ - minZ) * 100).toFixed(1)}%`).join(',')})`;
        footprint.dataset.theme = location.type;
      }
      const label = document.createElement('b');
      label.textContent = access.revealed === false ? 'Uncharted Waters' : location.displayName;
      button.append(footprint, label);
      const lockMessage = access.reason || '';
      if (lockMessage) {
        const lock = document.createElement('small');
        lock.className = 'boat-map-lock';
        lock.textContent = `${access.state === 'known-unavailable' ? 'UNAVAILABLE' : 'LOCKED'} • ${lockMessage}`;
        button.appendChild(lock);
        button.setAttribute('aria-description', lockMessage);
      }
      button.title = lockMessage ? `${access.revealed === false ? 'Uncharted Waters' : location.displayName} — ${lockMessage}` : location.displayName;
      return button;
    }));
  }

  open(currentId = 'main-mountain') {
    if (!this.screen || this.isOpen) return;
    document.exitPointerLock?.();
    this.currentId = currentId;
    this.selectedId = null;
    this.travelInProgress = false;
    this.isOpen = true;
    this.render();
    this.screen.hidden = false;
    document.body.classList.add('boat-travel-open');
    this.title.textContent = 'Choose a destination on the chart';
    this.confirmButton.disabled = true;
    for (const marker of this.map?.querySelectorAll('[data-travel-destination]') ?? []) {
      const isCurrent = marker.dataset.travelDestination === currentId;
      marker.classList.toggle('is-current', isCurrent);
      marker.disabled = isCurrent || marker.disabled;
      marker.classList.remove('is-selected');
    }
    this.closeButton?.focus({ preventScroll: true });
  }

  select(id) {
    const location = WORLD_LOCATIONS.find((entry) => entry.id === id);
    if (!location || id === this.currentId || !this.markerAccess(location).playable || this.travelInProgress) return false;
    this.selectedId = id;
    this.title.textContent = location.displayName;
    this.confirmButton.disabled = false;
    for (const marker of this.map?.querySelectorAll('[data-travel-destination]') ?? []) {
      marker.classList.toggle('is-selected', marker.dataset.travelDestination === id);
    }
    return true;
  }

  async travel() {
    if (!this.selectedId || !this.onTravel || this.travelInProgress) return;
    const destination = WORLD_LOCATIONS.find((entry) => entry.id === this.selectedId);
    if (!destination || destination.id === this.currentId || !this.markerAccess(destination).playable) return;
    this.travelInProgress = true;
    this.confirmButton.disabled = true;
    this.closeButton.disabled = true;
    try {
      if (this.transition) {
        this.transition.hidden = false;
        this.transition.querySelector('strong').textContent = `Sailing to ${destination.displayName}…`;
      }
      await new Promise((resolve) => globalThis.setTimeout(resolve, 720));
      await this.onTravel(this.selectedId);
      await new Promise((resolve) => globalThis.setTimeout(resolve, 380));
      if (this.transition) this.transition.hidden = true;
      this.closeButton.disabled = false;
      this.close();
    } finally {
      this.travelInProgress = false;
      if (this.transition) this.transition.hidden = true;
      this.closeButton.disabled = false;
    }
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('boat-travel-open');
    document.querySelector('#game-canvas')?.focus({ preventScroll: true });
  }

  destroy() {
    this.map?.removeEventListener('click', this.onClick);
    this.map?.removeEventListener('dblclick', this.onDoubleClick);
    this.confirmButton?.removeEventListener('click', this.onConfirm);
    this.closeButton?.removeEventListener('click', this.onClose);
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.body.classList.remove('boat-travel-open');
  }
}
