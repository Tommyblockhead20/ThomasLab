export const WORLD_CENTER = Object.freeze({ x: 260, z: 0 });
export const WORLD_MAP_RADIUS = 356;

const radians = (degrees) => degrees * Math.PI / 180;

function islandLocation({
  id, displayName, type, angle, radius, radii, elevation, theme, functions = [],
  mapClass = type
}) {
  const direction = { x: Math.cos(radians(angle)), z: Math.sin(radians(angle)) };
  const center = {
    x: WORLD_CENTER.x + direction.x * radius,
    y: elevation,
    z: WORLD_CENTER.z + direction.z * radius
  };
  const shorelineRadius = Math.min(radii.x, radii.z);
  const towardMain = { x: -direction.x, z: -direction.z };
  const dockCenterDistance = shorelineRadius + 4.25;
  return Object.freeze({
    id,
    displayName,
    type,
    worldPosition: Object.freeze(center),
    radii: Object.freeze({ ...radii }),
    elevation,
    theme,
    functions: Object.freeze([...functions]),
    loadGroup: 'ocean-world',
    alwaysLoaded: true,
    mapRepresentation: Object.freeze({ className: mapClass, label: displayName }),
    destination: Object.freeze({ enabled: true, order: 1 }),
    dock: Object.freeze({
      id: `${id}-dock`,
      worldPosition: Object.freeze({
        x: center.x + towardMain.x * dockCenterDistance,
        y: .12,
        z: center.z + towardMain.z * dockCenterDistance
      }),
      arrivalPosition: Object.freeze({
        x: center.x + towardMain.x * Math.max(3.2, shorelineRadius - 2.4),
        y: elevation + 1.08,
        z: center.z + towardMain.z * Math.max(3.2, shorelineRadius - 2.4)
      }),
      facingYaw: 90 - angle,
      length: 12.5
    })
  });
}

export const SMALL_ISLAND_LOCATIONS = Object.freeze([
  islandLocation({
    id: 'home-island', displayName: 'Cabin / Home Island', type: 'home-island',
    angle: 318, radius: 272, radii: { x: 22, z: 18 }, elevation: .72,
    theme: 'cozy-woodland', functions: ['appearance', 'achievements', 'trophies', 'rest']
  }),
  islandLocation({
    id: 'shop-island', displayName: 'Shop Island', type: 'shop-island',
    angle: 45, radius: 284, radii: { x: 19, z: 15 }, elevation: .62,
    theme: 'developed-outpost', functions: ['buy', 'sell', 'gear', 'maps']
  }),
  islandLocation({
    id: 'aquarium-island', displayName: 'Aquarium Island', type: 'aquarium-island',
    angle: 103, radius: 278, radii: { x: 23, z: 18 }, elevation: .7,
    theme: 'landscaped-attraction', functions: ['aquarium-inspect', 'aquarium-manage']
  }),
  islandLocation({
    id: 'cave-fishing-island', displayName: 'Cave Fishing Island', type: 'cave-island',
    angle: 164, radius: 300, radii: { x: 20, z: 16 }, elevation: .82,
    theme: 'rocky-cave', functions: ['cave-fishing']
  }),
  islandLocation({
    id: 'normal-fishing-island', displayName: 'Reedwater Island', type: 'fishing-island',
    angle: 344, radius: 300, radii: { x: 19, z: 16 }, elevation: .66,
    theme: 'natural-reed-pond', functions: ['outdoor-fishing']
  }),
  islandLocation({
    id: 'cold-island', displayName: 'Frosthook Island', type: 'cold-island',
    angle: 230, radius: 286, radii: { x: 22, z: 18 }, elevation: .76,
    theme: 'polar', functions: ['cold-fishing']
  })
]);

export const MAIN_WORLD_LOCATION = Object.freeze({
  id: 'main-mountain',
  displayName: 'Main Mountain',
  type: 'main-island',
  worldPosition: Object.freeze({ x: WORLD_CENTER.x, y: 0, z: WORLD_CENTER.z }),
  radii: Object.freeze({ x: 208, z: 208 }),
  theme: 'crooked-peak',
  functions: Object.freeze(['climbing', 'watershed', 'summit']),
  loadGroup: 'ocean-world',
  alwaysLoaded: true,
  mapRepresentation: Object.freeze({ className: 'main-island', label: 'Crooked Peak' }),
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

export function closestWorldLocation(point) {
  if (!point) return MAIN_WORLD_LOCATION;
  return WORLD_LOCATIONS.reduce((best, location) => {
    const distance = Math.hypot(point.x - location.worldPosition.x, point.z - location.worldPosition.z);
    return !best || distance < best.distance ? { location, distance } : best;
  }, null)?.location ?? MAIN_WORLD_LOCATION;
}
