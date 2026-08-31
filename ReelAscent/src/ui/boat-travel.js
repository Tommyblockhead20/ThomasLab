import { WORLD_CENTER, WORLD_LOCATIONS, WORLD_MAP_RADIUS } from '../world/world-locations.js';

export class BoatTravelMenu {
  constructor(onTravel) {
    this.onTravel = onTravel;
    this.screen = document.querySelector('#boat-travel');
    this.map = document.querySelector('#boat-travel-map');
    this.title = document.querySelector('#boat-travel-selection');
    this.confirmButton = document.querySelector('#confirm-boat-travel');
    this.closeButton = document.querySelector('#close-boat-travel');
    this.transition = document.querySelector('#boat-travel-transition');
    this.currentId = 'main-mountain';
    this.selectedId = null;
    this.isOpen = false;
    this.onClick = (event) => {
      const marker = event.target.closest('[data-travel-destination]');
      if (marker) this.select(marker.dataset.travelDestination);
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
    this.confirmButton?.addEventListener('click', this.onConfirm);
    this.closeButton?.addEventListener('click', this.onClose);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.render();
  }

  render() {
    if (!this.map) return;
    this.map.replaceChildren(...WORLD_LOCATIONS.map((location) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.travelDestination = location.id;
      button.className = `boat-map-island boat-map-${location.type}`;
      const x = 50 + (location.worldPosition.x - WORLD_CENTER.x) / WORLD_MAP_RADIUS * 42;
      const y = 50 + (location.worldPosition.z - WORLD_CENTER.z) / WORLD_MAP_RADIUS * 42;
      button.style.left = `${x}%`;
      button.style.top = `${y}%`;
      const footprint = document.createElement('span');
      footprint.className = 'boat-map-footprint';
      if (location.type === 'main-island') {
        footprint.textContent = '⛰';
      } else if (location.outline?.length) {
        const xs = location.outline.map((point) => point.x);
        const zs = location.outline.map((point) => point.z);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
        footprint.style.clipPath = `polygon(${location.outline.map((point) => `${((point.x - minX) / Math.max(.001, maxX - minX) * 100).toFixed(1)}% ${((point.z - minZ) / Math.max(.001, maxZ - minZ) * 100).toFixed(1)}%`).join(',')})`;
        footprint.dataset.theme = location.type;
      }
      const label = document.createElement('b');
      label.textContent = location.displayName;
      button.append(footprint, label);
      button.title = location.displayName;
      return button;
    }));
  }

  open(currentId = 'main-mountain') {
    if (!this.screen || this.isOpen) return;
    document.exitPointerLock?.();
    this.currentId = currentId;
    this.selectedId = null;
    this.isOpen = true;
    this.screen.hidden = false;
    document.body.classList.add('boat-travel-open');
    this.title.textContent = 'Choose an island on the chart';
    this.confirmButton.disabled = true;
    for (const marker of this.map?.querySelectorAll('[data-travel-destination]') ?? []) {
      marker.classList.toggle('is-current', marker.dataset.travelDestination === currentId);
      marker.classList.remove('is-selected');
    }
    this.closeButton?.focus({ preventScroll: true });
  }

  select(id) {
    const location = WORLD_LOCATIONS.find((entry) => entry.id === id);
    if (!location) return;
    this.selectedId = id;
    this.title.textContent = location.displayName;
    this.confirmButton.disabled = false;
    for (const marker of this.map?.querySelectorAll('[data-travel-destination]') ?? []) {
      marker.classList.toggle('is-selected', marker.dataset.travelDestination === id);
    }
  }

  async travel() {
    if (!this.selectedId || !this.onTravel) return;
    const destination = WORLD_LOCATIONS.find((entry) => entry.id === this.selectedId);
    this.confirmButton.disabled = true;
    this.closeButton.disabled = true;
    if (this.transition) {
      this.transition.hidden = false;
      this.transition.querySelector('strong').textContent = `Sailing to ${destination.displayName}…`;
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 720));
    this.onTravel(this.selectedId);
    await new Promise((resolve) => globalThis.setTimeout(resolve, 380));
    if (this.transition) this.transition.hidden = true;
    this.closeButton.disabled = false;
    this.close();
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
    this.confirmButton?.removeEventListener('click', this.onConfirm);
    this.closeButton?.removeEventListener('click', this.onClose);
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.body.classList.remove('boat-travel-open');
  }
}
