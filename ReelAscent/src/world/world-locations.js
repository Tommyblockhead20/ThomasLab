export const WORLD_CENTER = Object.freeze({ x: 260, z: 0 });
// v9: the six satellite islands are intentionally 3–6× farther from Mountain than v8.
// This value is a GLOBAL chart extent; loaded areas may later use local frames without
// changing any destination's stable position on maps/GPS/multiplayer.
export const WORLD_MAP_RADIUS = 1700;
export const WORLD_MAP_DISTANCE_SCALE = .58;
export const WORLD_MAP_DISPLAY_RADIUS = WORLD_MAP_RADIUS * WORLD_MAP_DISTANCE_SCALE * 1.04;
export const WORLD_MAP_COMPRESSION_START_RADIUS = 360;

// Cartography-only transform. Simulation, saves, travel, multiplayer, and load groups keep
// the full global coordinates; every map and GPS marker uses this same compressed view.
export function compressWorldMapPosition(point = WORLD_CENTER) {
  const dx = (Number(point.x) || 0) - WORLD_CENTER.x;
  const dz = (Number(point.z) || 0) - WORLD_CENTER.z;
  const scale = Math.hypot(dx, dz) > WORLD_MAP_COMPRESSION_START_RADIUS
    ? WORLD_MAP_DISTANCE_SCALE
    : 1;
  return { x: WORLD_CENTER.x + dx * scale, z: WORLD_CENTER.z + dz * scale };
}

const radians = (degrees) => degrees * Math.PI / 180;
const freezePoints = (points) => Object.freeze(points.map(([x, z]) => Object.freeze({ x, z })));
const outlineFromScales = (scales) => freezePoints(scales.map((scale, index) => {
  const theta = index * Math.PI * 2 / scales.length;
  return [Math.cos(theta) * scale, Math.sin(theta) * scale];
}));

// Normalized, evenly-spaced shoreline silhouettes. mountain-v2.js consumes these same
// footprints for the rendered terrain, so the boat/GPS map can depict the REAL simple shape
// instead of inventing unrelated ovals.
export const ISLAND_OUTLINES = Object.freeze({
  'home-island': outlineFromScales([1.02, .94, 1.08, 1.03, .92, 1.1, 1.04, .96, 1.07, 1.01, .93, 1.08]),
  'shop-island': outlineFromScales([1.12, 1.02, .91, .96, 1.08, 1.12, .94, .89, 1.05, 1.12, 1.02, .95]),
  'aquarium-island': outlineFromScales([1.07, 1.01, .96, 1.03, 1.08, 1.01, .95, 1.02, 1.08, 1.01, .96, 1.02]),
  'cave-fishing-island': outlineFromScales([1.19, .93, 1.11, .86, 1.23, .91, 1.09, .84, 1.18, .96, 1.13, .88]),
  'normal-fishing-island': outlineFromScales([1.13, 1.04, .92, .88, .98, 1.11, 1.17, 1.03, .91, .95, 1.08, 1.15]),
  'cold-island': outlineFromScales([1.22, .88, 1.17, .91, 1.25, .87, 1.13, .9, 1.23, .89, 1.16, .9])
});

function ellipseRadiusAlong(radii, direction) {
  return 1 / Math.hypot(direction.x / radii.x, direction.z / radii.z);
}

function outlineScaleAt(locationId, angleDegrees) {
  const outline = ISLAND_OUTLINES[locationId];
  if (!outline?.length) return 1;
  const normalized = ((angleDegrees % 360) + 360) % 360;
  const position = normalized / 360 * outline.length;
  const indexA = Math.floor(position) % outline.length;
  const indexB = (indexA + 1) % outline.length;
  const t = position - Math.floor(position);
  const radiusA = Math.hypot(outline[indexA].x, outline[indexA].z);
  const radiusB = Math.hypot(outline[indexB].x, outline[indexB].z);
  return radiusA + (radiusB - radiusA) * t;
}

function islandLocation({
  id, displayName, type, angle, radius, radii, elevation, theme, functions = [],
  mapClass = type, dockLength = 12.5, dockSide = 'mountain'
}) {
  const direction = { x: Math.cos(radians(angle)), z: Math.sin(radians(angle)) };
  const center = {
    x: WORLD_CENTER.x + direction.x * radius,
    y: elevation,
    z: WORLD_CENTER.z + direction.z * radius
  };
  const towardMountain = { x: -direction.x, z: -direction.z };
  const dockDirection = dockSide === 'outward' ? direction : towardMountain;
  const dockBearing = dockSide === 'outward' ? angle : angle + 180;
  const shorelineDistance = ellipseRadiusAlong(radii, dockDirection) * outlineScaleAt(id, dockBearing);
  const dockCenterDistance = shorelineDistance + dockLength * .34;
  const arrivalDistance = Math.max(2.8, shorelineDistance - 3.1);
  return Object.freeze({
    id,
    displayName,
    type,
    angle,
    radius,
    worldPosition: Object.freeze(center),
    radii: Object.freeze({ ...radii }),
    outline: ISLAND_OUTLINES[id] ?? freezePoints([]),
    elevation,
    theme,
    functions: Object.freeze([...functions]),
    // Metadata only for now: the renderer can independently activate this group while every
    // map/network system continues to use GLOBAL coordinates.
    loadGroup: id,
    alwaysLoaded: false,
    coordinateSpace: 'global-world',
    mapRepresentation: Object.freeze({ className: mapClass, label: displayName }),
    destination: Object.freeze({ enabled: true, order: 1 }),
    dock: Object.freeze({
      id: `${id}-dock`,
      worldPosition: Object.freeze({
        x: center.x + dockDirection.x * dockCenterDistance,
        y: .12,
        z: center.z + dockDirection.z * dockCenterDistance
      }),
      arrivalPosition: Object.freeze({
        x: center.x + dockDirection.x * arrivalDistance,
        y: elevation + 1.08,
        z: center.z + dockDirection.z * arrivalDistance
      }),
      facingYaw: 90 - angle,
      length: dockLength,
      safe: true
    })
  });
}

export const SMALL_ISLAND_LOCATIONS = Object.freeze([
  islandLocation({
    id: 'home-island', displayName: 'Hearthward Isle', type: 'home-island',
    angle: 222, radius: 980, radii: { x: 22, z: 18 }, elevation: .72,
    theme: 'cozy-woodland', functions: ['appearance', 'achievements', 'trophies', 'rest'],
    // The cabin front faces away from Mountain. Arrive on that same side for a short,
    // obvious walk from boat to porch instead of approaching the rear wall.
    dockSide: 'outward'
  }),
  islandLocation({
    id: 'shop-island', displayName: "Outfitter's Reach", type: 'shop-island',
    angle: 35, radius: 1120, radii: { x: 19, z: 15 }, elevation: .62,
    theme: 'developed-outpost', functions: ['buy', 'sell', 'gear', 'maps']
  }),
  islandLocation({
    id: 'aquarium-island', displayName: 'Glasswater Isle', type: 'aquarium-island',
    angle: 95, radius: 1320, radii: { x: 23, z: 18 }, elevation: .7,
    theme: 'landscaped-attraction', functions: ['aquarium-inspect', 'aquarium-manage']
  }),
  islandLocation({
    id: 'cave-fishing-island', displayName: 'Basalt Hollow', type: 'cave-island',
    angle: 150, radius: 1460, radii: { x: 20, z: 16 }, elevation: .82,
    theme: 'rocky-cave', functions: ['cave-fishing']
  }),
  islandLocation({
    id: 'normal-fishing-island', displayName: 'Mangrove Cay', type: 'fishing-island',
    angle: 330, radius: 1460, radii: { x: 19, z: 16 }, elevation: .66,
    theme: 'warm-mangrove-lagoon', functions: ['outdoor-fishing']
  }),
  islandLocation({
    id: 'cold-island', displayName: 'Frosthook', type: 'cold-island',
    // Negative Z is chart-up in the existing boat/map projection, so 270° is directly NORTH.
    angle: 270, radius: 1540, radii: { x: 22, z: 18 }, elevation: .76,
    theme: 'polar', functions: ['cold-fishing']
  })
]);

export const MAIN_WORLD_LOCATION = Object.freeze({
  // Keep the durable id for old saves/server messages; only the destination name changes.
  id: 'main-mountain',
  displayName: 'Stoneveil Peak',
  type: 'main-island',
  worldPosition: Object.freeze({ x: WORLD_CENTER.x, y: 0, z: WORLD_CENTER.z }),
  radii: Object.freeze({ x: 208, z: 208 }),
  outline: null,
  theme: 'stoneveil-peak',
  functions: Object.freeze(['climbing', 'watershed', 'summit']),
  loadGroup: 'main-mountain',
  alwaysLoaded: false,
  coordinateSpace: 'global-world',
  mapRepresentation: Object.freeze({ className: 'main-island', label: 'Stoneveil Peak' }),
  destination: Object.freeze({ enabled: true, order: 0 })
});

export const WORLD_LOCATIONS = Object.freeze([
  MAIN_WORLD_LOCATION,
  ...SMALL_ISLAND_LOCATIONS.map((location, index) => Object.freeze({
    ...location,
    destination: Object.freeze({ ...location.destination, order: index + 1 })
  }))
]);

export const WORLD_LOCATION_BY_ID = new Map(WORLD_LOCATIONS.map((location) => [location.id, location]));

export const MAP_ITEMS = Object.freeze([
  Object.freeze({
    id: 'paper-map', name: 'Paper Map', price: 75, mode: 'paper',
    description: 'A fold-out world map with waters, caves, islands, docks, biomes, and landmarks.'
  }),
  Object.freeze({
    id: 'gps-map', name: 'GPS Map', price: 900, mode: 'gps',
    description: 'A rugged receiver map that adds live local and multiplayer positions.'
  })
]);

export const MAP_ITEM_BY_ID = new Map(MAP_ITEMS.map((item) => [item.id, item]));

export function getWorldLocation(id) {
  return WORLD_LOCATION_BY_ID.get(id) ?? null;
}

export function localToGlobalWorldPosition(locationId, position = {}) {
  const location = getWorldLocation(locationId) ?? MAIN_WORLD_LOCATION;
  return {
    x: (Number(position.x) || 0) + location.worldPosition.x,
    y: (Number(position.y) || 0) + location.worldPosition.y,
    z: (Number(position.z) || 0) + location.worldPosition.z
  };
}

export function globalToLocalAreaPosition(locationId, position = {}) {
  const location = getWorldLocation(locationId) ?? MAIN_WORLD_LOCATION;
  return {
    x: (Number(position.x) || 0) - location.worldPosition.x,
    y: (Number(position.y) || 0) - location.worldPosition.y,
    z: (Number(position.z) || 0) - location.worldPosition.z
  };
}

export function resolveGlobalWorldPosition(locationId, position = {}, coordinateSpace = 'global-world') {
  return coordinateSpace === 'local-area'
    ? localToGlobalWorldPosition(locationId, position)
    : { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 };
}

export function getLocationGlobalOutline(locationOrId) {
  const location = typeof locationOrId === 'string' ? getWorldLocation(locationOrId) : locationOrId;
  if (!location?.outline?.length) return [];
  return location.outline.map((point) => ({
    x: location.worldPosition.x + point.x * location.radii.x,
    z: location.worldPosition.z + point.z * location.radii.z
  }));
}

export function closestWorldLocation(point) {
  if (!point) return MAIN_WORLD_LOCATION;
  return WORLD_LOCATIONS.reduce((best, location) => {
    const distance = Math.hypot(point.x - location.worldPosition.x, point.z - location.worldPosition.z);
    return !best || distance < best.distance ? { location, distance } : best;
  }, null)?.location ?? MAIN_WORLD_LOCATION;
}
