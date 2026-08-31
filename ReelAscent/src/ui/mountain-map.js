import {
  WORLD_MAP_DISPLAY_RADIUS,
  compressWorldMapPosition
} from '../world/world-locations.js';

const BLOCKING_CLASSES = Object.freeze([
  'fish-gallery', 'journal-open', 'inventory-open', 'multiplayer-open', 'emote-menu-open',
  'appearance-open', 'shop-open', 'aquarium-open', 'boat-travel-open', 'pause-open'
]);

export class MountainMapMenu {
  constructor(mapData, { getLocalPlayer = () => null, getRemotePlayers = () => [] } = {}) {
    this.screen = document.querySelector('#mountain-map');
    this.closeButton = document.querySelector('#close-mountain-map');
    this.svg = this.screen?.querySelector('.mountain-map-graphic') ?? null;
    this.legend = this.screen?.querySelector('[data-mountain-map-legend]') ?? null;
    this.mapData = mapData;
    this.getLocalPlayer = getLocalPlayer;
    this.getRemotePlayers = getRemotePlayers;
    this.mode = 'paper';
    this.lastGpsRender = 0;
    this.isOpen = false;
    this.previousFocus = null;
    this.onOpenRequest = (event) => this.open(event.detail?.mode ?? 'paper');
    this.onCloseClick = () => this.close();
    this.onKeyDown = (event) => {
      if (event.code !== 'Escape' || !this.isOpen) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    };
    window.addEventListener('reel-ascent:open-map', this.onOpenRequest);
    window.addEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.addEventListener('click', this.onCloseClick);
    this.renderMap();
  }

  project(point) {
    const mapped = compressWorldMapPosition(point);
    const scale = 220 / Math.max(1, WORLD_MAP_DISPLAY_RADIUS);
    return {
      x: 260 + (mapped.x - this.mapData.center.x) * scale,
      y: 260 + (mapped.z - this.mapData.center.z) * scale,
      scale
    };
  }

  createSvg(name, attributes = {}, text = '') {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    if (text) node.textContent = text;
    return node;
  }

  polygon(points) {
    return points.map((point) => {
      const projected = this.project(point);
      return `${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
    }).join(' ');
  }

  islandPolygon(location) {
    const center = this.project(location.position);
    const markerMagnification = 2.2;
    return location.outline.map((point) => (
      `${(center.x + (point.x - location.position.x) * center.scale * markerMagnification).toFixed(1)},${(center.y + (point.z - location.position.z) * center.scale * markerMagnification).toFixed(1)}`
    )).join(' ');
  }

  biomeWedge(biome) {
    const points = [{ ...this.mapData.center }];
    let end = biome.endAngle;
    if (end <= biome.startAngle) end += 360;
    for (let angle = biome.startAngle; angle <= end; angle += 3) {
      const radians = angle * Math.PI / 180;
      points.push({
        x: this.mapData.center.x + Math.cos(radians) * 245,
        z: this.mapData.center.z + Math.sin(radians) * 245
      });
    }
    return this.polygon(points);
  }

  addMarker(group, item, className, label = item.label, glyph = '') {
    const point = this.project(item.position);
    const marker = this.createSvg('g', { class: className, transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})` });
    marker.appendChild(this.createSvg('circle', { r: 4.4 }));
    if (glyph) marker.appendChild(this.createSvg('text', { x: 0, y: 2.2, class: 'map-marker-glyph' }, glyph));
    if (label) marker.appendChild(this.createSvg('text', { x: 7, y: -6 }, label));
    const title = this.createSvg('title', {}, label);
    marker.prepend(title);
    group.appendChild(marker);
  }

  renderMap() {
    if (!this.svg || !this.mapData) return;
    const svg = this.svg;
    svg.replaceChildren();
    svg.appendChild(this.createSvg('rect', { width: 520, height: 520, rx: 18, class: 'map-paper' }));
    const { scale } = this.project(this.mapData.center);
    const outerMountain = this.mapData.contours[0];

    const defs = this.createSvg('defs');
    const clip = this.createSvg('clipPath', { id: 'actual-mountain-outline' });
    clip.appendChild(this.createSvg('polygon', { points: this.polygon(outerMountain.points) }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    const ocean = this.mapData.waters.find((water) => water.tier === 'ocean');
    svg.appendChild(this.createSvg('circle', {
      cx: 260, cy: 260, r: (Math.min(ocean.outerRadius, WORLD_MAP_DISPLAY_RADIUS) * scale).toFixed(1), class: 'map-ocean'
    }));
    svg.appendChild(this.createSvg('circle', {
      cx: 260, cy: 260, r: (ocean.innerRadius * scale).toFixed(1), class: 'map-shore'
    }));

    const islandGroup = this.createSvg('g', { class: 'map-islands' });
    for (const location of this.mapData.locations.filter((entry) => entry.type !== 'main-island')) {
      const point = this.project(location.position);
      const marker = this.createSvg('g', { class: `map-island map-island-${location.type}` });
      const footprint = location.outline?.length >= 3
        ? this.createSvg('polygon', { points: this.islandPolygon(location) })
        : this.createSvg('ellipse', {
            cx: point.x.toFixed(1), cy: point.y.toFixed(1),
            rx: Math.max(5, location.radii.x * scale).toFixed(1),
            ry: Math.max(4, location.radii.z * scale).toFixed(1)
          });
      marker.append(
        footprint,
        this.createSvg('text', { x: point.x.toFixed(1), y: (point.y - Math.max(13, location.radii.z * scale * 2.2 + 4)).toFixed(1) }, location.label)
      );
      islandGroup.appendChild(marker);
    }
    svg.appendChild(islandGroup);

    const elevationColors = ['map-elevation-coast', 'map-elevation-lower', 'map-elevation-middle', 'map-elevation-alpine', 'map-elevation-summit'];
    this.mapData.contours.forEach((area, index) => {
      svg.appendChild(this.createSvg('polygon', {
        points: this.polygon(area.points),
        class: `map-elevation ${elevationColors[index]}`
      }));
    });

    const biomeGroup = this.createSvg('g', { class: 'map-biomes', 'clip-path': 'url(#actual-mountain-outline)' });
    for (const biome of this.mapData.biomes) {
      biomeGroup.appendChild(this.createSvg('polygon', {
        points: this.biomeWedge(biome), class: `map-biome map-biome-${biome.id}`
      }));
    }
    svg.appendChild(biomeGroup);

    const contourGroup = this.createSvg('g', { class: 'map-contours' });
    for (const area of this.mapData.contours) {
      contourGroup.appendChild(this.createSvg('polygon', { points: this.polygon(area.points) }));
    }
    svg.appendChild(contourGroup);

    const cascade = this.createSvg('polyline', {
      class: 'map-cascade', points: this.polygon(this.mapData.cascade)
    });
    cascade.appendChild(this.createSvg('title', {}, 'Fallglass Cascade'));
    svg.appendChild(cascade);

    const waterGroup = this.createSvg('g', { class: 'map-waters' });
    for (const water of this.mapData.waters.filter((entry) => entry.tier !== 'ocean')) {
      const point = this.project(water.center);
      const marker = this.createSvg('g', { transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})` });
      marker.append(
        this.createSvg('ellipse', { rx: Math.max(3.5, water.radii[0] * point.scale).toFixed(1), ry: Math.max(3, water.radii[1] * point.scale).toFixed(1) }),
        this.createSvg('text', { x: 0, y: 2.3 }, water.index),
        this.createSvg('title', {}, `${water.index}. ${water.label}`)
      );
      waterGroup.appendChild(marker);
    }
    svg.appendChild(waterGroup);

    const markerGroup = this.createSvg('g', { class: 'map-landmarks' });
    for (const dock of this.mapData.docks) this.addMarker(markerGroup, dock, 'map-start', '', 'S');
    for (const cave of this.mapData.caves) this.addMarker(markerGroup, cave, 'map-cave', '', 'C');
    // Rest ledges remain real traversal geometry and still shape the five elevation bands,
    // but individual 500/550/600-ft pins made the overview noisy and are intentionally omitted.
    // Split Boulder has authored world geometry; the dormant Tilted Slab route does not.
    const wantedLandmarks = new Set(['waterfall-basin', 'summit-crown', 'summit-tarn', 'split-boulder']);
    for (const landmark of this.mapData.landmarks.filter((entry) => wantedLandmarks.has(entry.id))) {
      this.addMarker(markerGroup, landmark, 'map-landmark', landmark.id === 'split-boulder' ? '' : landmark.label, '◆');
    }
    svg.appendChild(markerGroup);

    const compass = this.createSvg('g', { class: 'map-compass', transform: 'translate(474 48)' });
    compass.append(
      this.createSvg('path', { d: 'M0 -19 L6 0 L0 19 L-6 0 Z' }),
      this.createSvg('text', { x: -4, y: -24 }, 'N')
    );
    svg.appendChild(compass);
    this.gpsGroup = this.createSvg('g', { class: 'map-gps-players' });
    svg.appendChild(this.gpsGroup);
    this.renderGpsPlayers();
    this.renderLegend();
  }

  renderGpsPlayers() {
    if (!this.gpsGroup) return;
    this.gpsGroup.replaceChildren();
    if (this.mode !== 'gps') return;
    const players = [this.getLocalPlayer(), ...this.getRemotePlayers()].filter((entry) => entry?.position);
    players.forEach((player, index) => {
      const point = this.project(player.position);
      const marker = this.createSvg('g', {
        class: `map-player ${index === 0 ? 'is-local' : 'is-remote'}`,
        transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`
      });
      marker.append(
        this.createSvg('circle', { r: index === 0 ? 5.5 : 4.5 }),
        this.createSvg('text', { x: 7, y: -5 }, String(player.id ?? 'PLAYER').slice(0, 10))
      );
      this.gpsGroup.appendChild(marker);
    });
  }

  renderLegend() {
    if (!this.legend) return;
    const intro = document.createElement('p');
    intro.textContent = this.mode === 'gps'
      ? 'GPS Map • live player positions projected through the same world coordinates as every marker.'
      : 'Paper Map • built from live world descriptors and terrain contours; player positions are intentionally omitted.';
    const elevationTitle = document.createElement('h3');
    elevationTitle.textContent = 'Five elevation areas';
    const elevations = document.createElement('ol');
    elevations.className = 'map-legend-list';
    for (const area of this.mapData.contours) {
      const li = document.createElement('li');
      li.textContent = `${area.label} • ${Math.max(0, Math.round(area.minimumHeight * 3.28084))}–${Math.round(area.maximumHeight * 3.28084)} ft`;
      elevations.appendChild(li);
    }
    const biomeTitle = document.createElement('h3');
    biomeTitle.textContent = 'Biome sectors';
    const biomes = document.createElement('p');
    biomes.className = 'map-biome-key';
    biomes.textContent = this.mapData.biomes.map((biome) => biome.label).join(' • ');
    const symbolTitle = document.createElement('h3');
    symbolTitle.textContent = 'Symbols';
    const symbols = document.createElement('p');
    symbols.textContent = 'S — Boat Arrival / Spawn Point • C — Cave Entrance • ◆ — Landmark';
    const waterTitle = document.createElement('h3');
    waterTitle.textContent = `All ${this.mapData.waters.length} fishing waters`;
    const waters = document.createElement('ol');
    waters.className = 'map-water-list';
    for (const water of this.mapData.waters) {
      const li = document.createElement('li');
      li.value = water.index;
      li.textContent = `${water.label}${water.cave ? ' • cave entrance marked C' : ''}`;
      waters.appendChild(li);
    }
    this.legend.replaceChildren(intro, elevationTitle, elevations, biomeTitle, biomes, symbolTitle, symbols, waterTitle, waters);
  }

  open(mode = 'paper') {
    if (!this.screen || this.isOpen || BLOCKING_CLASSES.some((name) => document.body.classList.contains(name))) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.exitPointerLock?.();
    this.isOpen = true;
    this.mode = mode === 'gps' ? 'gps' : 'paper';
    const eyebrow = this.screen.querySelector('.eyebrow');
    const title = this.screen.querySelector('#mountain-map-title');
    if (eyebrow) eyebrow.textContent = this.mode === 'gps' ? 'RUGGED RECEIVER • LIVE GPS' : 'FOLD-OUT PAPER MAP • NO GPS';
    if (title) title.textContent = this.mode === 'gps' ? 'Crooked Peak GPS Map' : 'Crooked Peak Paper Map';
    this.renderMap();
    this.screen.hidden = false;
    document.body.classList.add('mountain-map-open');
    this.closeButton?.focus({ preventScroll: true });
  }

  update(now = performance.now()) {
    if (!this.isOpen || this.mode !== 'gps' || now - this.lastGpsRender < 180) return;
    this.lastGpsRender = now;
    this.renderGpsPlayers();
  }

  close() {
    if (!this.screen || !this.isOpen) return;
    this.isOpen = false;
    this.screen.hidden = true;
    document.body.classList.remove('mountain-map-open');
    const target = this.previousFocus?.isConnected ? this.previousFocus : document.querySelector('#game-canvas');
    target?.focus({ preventScroll: true });
    this.previousFocus = null;
  }

  destroy() {
    window.removeEventListener('reel-ascent:open-map', this.onOpenRequest);
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.closeButton?.removeEventListener('click', this.onCloseClick);
    document.body.classList.remove('mountain-map-open');
  }
}
