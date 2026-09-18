import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import {
  buildOceanIslandTerrainData,
  HOME_CABIN_CONFIG,
  OCEAN_SURFACE_Y,
  PUBLIC_AQUARIUM_CONFIG
} from '../../src/world/mountain-v2.js';
import { normalizeWorldEditorLevel } from './world-level-format.js';

const ISLAND_EDITOR_IDS = Object.freeze([
  'home-island', 'shop-island', 'aquarium-island', 'cave-fishing-island',
  'normal-fishing-island', 'cold-island', 'skyreach-foundation'
]);

export function productionIslandEditorIds() { return [...ISLAND_EDITOR_IDS]; }

const transform = (position, rotation = {}) => ({
  position: { x: position.x, y: position.y, z: position.z },
  rotation: { x: rotation.x ?? 0, y: rotation.y ?? 0, z: rotation.z ?? 0 },
  scale: { x: 1, y: 1, z: 1 }
});

function addBox(objects, prefix, name, position, size, materialKey, rotation = {}, collision = true, category = 'Production Architecture') {
  const sequence = String(objects.length + 1).padStart(3, '0');
  objects.push({
    id: `${prefix}-${sequence}`, name, type: 'box', category,
    transform: transform(position, rotation), size: { ...size }, collision, visible: true,
    metadata: { productionReference: true, source: 'mountain-v2.js active structure builder', materialKey }
  });
}

function homeCabinDefinition() {
  const objects = [];
  const add = (name, position, size, material = 'wood', rotation = {}, collision = true) => (
    addBox(objects, 'HOME-CABIN', name, position, size, material, rotation, collision, 'Hearthward Cabin')
  );
  const config = HOME_CABIN_CONFIG;
  add('Trail cabin stable floor', { x: 0, y: -.16, z: 0 }, { x: config.width, y: .32, z: config.depth });
  add('Trail cabin back wall', { x: 0, y: config.wallHeight * .5, z: -config.depth * .5 }, { x: config.width, y: config.wallHeight, z: .3 }, 'wall');
  add('Trail cabin right wall', { x: config.width * .5, y: config.wallHeight * .5, z: 0 }, { x: .3, y: config.wallHeight, z: config.depth }, 'wall');
  add('Trail cabin left wall rear section', { x: -config.width * .5, y: config.wallHeight * .5, z: -2.4125 }, { x: .3, y: config.wallHeight, z: 1.975 }, 'wall');
  add('Trail cabin left wall front section', { x: -config.width * .5, y: config.wallHeight * .5, z: 1.8125 }, { x: .3, y: config.wallHeight, z: 3.175 }, 'wall');
  add('Trail cabin left window sill wall', { x: -config.width * .5, y: .625, z: -.6 }, { x: .3, y: 1.25, z: 1.65 }, 'wall');
  add('Trail cabin left window header wall', { x: -config.width * .5, y: 3, z: -.6 }, { x: .3, y: .9, z: 1.65 }, 'wall');
  const doorWidth = 1.55;
  const frontSegmentWidth = (config.width - doorWidth) * .5;
  add('Trail cabin front wall left of door', { x: -(doorWidth * .5 + frontSegmentWidth * .5), y: config.wallHeight * .5, z: config.depth * .5 }, { x: frontSegmentWidth, y: config.wallHeight, z: .3 }, 'wall');
  add('Trail cabin front wall inner window pier', { x: 1.275, y: config.wallHeight * .5, z: config.depth * .5 }, { x: 1, y: config.wallHeight, z: .3 }, 'wall');
  add('Trail cabin front wall outer window pier', { x: 3.7625, y: config.wallHeight * .5, z: config.depth * .5 }, { x: .875, y: config.wallHeight, z: .3 }, 'wall');
  add('Trail cabin front window sill wall', { x: 2.55, y: .6375, z: config.depth * .5 }, { x: 1.55, y: 1.275, z: .3 }, 'wall');
  add('Trail cabin front window header wall', { x: 2.55, y: 2.9875, z: config.depth * .5 }, { x: 1.55, y: .925, z: .3 }, 'wall');
  add('Trail cabin front wall above doorway', { x: 0, y: 3.085, z: config.depth * .5 }, { x: doorWidth, y: .73, z: .3 }, 'wall');
  const gables = [
    { y: 3.585, width: 8.05 }, { y: 3.855, width: 6.85 }, { y: 4.125, width: 5.65 },
    { y: 4.395, width: 4.45 }, { y: 4.665, width: 3.2 }
  ];
  for (const [index, course] of gables.entries()) for (const side of [-1, 1]) add(
    `Trail cabin ${side > 0 ? 'front' : 'rear'} gable course ${index + 1}`,
    { x: 0, y: course.y, z: side * config.depth * .5 }, { x: course.width, y: .27, z: .3 }, 'wall'
  );
  for (const side of [-1, 1]) add(`Trail cabin ${side < 0 ? 'west' : 'east'} roof pitch`,
    { x: side * 2.16, y: 4.05, z: 0 }, { x: 4.85, y: .24, z: 7.65 }, 'dark', { z: -side * 25 });
  add('Trail cabin roof ridge', { x: 0, y: 4.98, z: 0 }, { x: .24, y: .2, z: 7.75 }, 'trim');
  add('Trail cabin porch', { x: 0, y: -.12, z: 4.45 }, { x: 7.2, y: .24, z: 2.1 }, 'wood');
  add('Trail cabin upper step', { x: 0, y: -.28, z: 5.72 }, { x: 3.2, y: .24, z: .72 }, 'trim');
  add('Trail cabin lower step', { x: 0, y: -.43, z: 6.35 }, { x: 3.65, y: .22, z: .65 }, 'trim');
  for (const side of [-1, 1]) add(`Trail cabin porch ${side < 0 ? 'left' : 'right'} post`,
    { x: side * 3.25, y: 1.55, z: 4.95 }, { x: .22, y: 3.1, z: .22 }, 'trim');
  add('Trail cabin porch awning', { x: 0, y: 3.22, z: 4.55 }, { x: 7.25, y: .18, z: 2.55 }, 'dark', { x: 7 });
  add('Trail cabin front window', { x: 2.55, y: 1.9, z: config.depth * .5 + .18 }, { x: 1.55, y: 1.25, z: .05 }, 'glass', {}, false);
  add('Trail cabin side window', { x: -config.width * .5 - .18, y: 1.9, z: -.6 }, { x: .05, y: 1.3, z: 1.65 }, 'glass', {}, false);
  add('Trail cabin bed frame', { x: -2.65, y: .32, z: -1.55 }, { x: 2.05, y: .55, z: 3.15 }, 'wood');
  add('Trail cabin table top', { x: 2.15, y: 1.02, z: -.25 }, { x: 2.15, y: .18, z: 1.32 }, 'wood');
  add('Trail cabin wardrobe', { x: -3.55, y: 1.28, z: 1.05 }, { x: 1.05, y: 2.55, z: 1.65 }, 'wall');
  add('Trail cabin stone hearth', { x: 2.95, y: .15, z: -2.7 }, { x: 1.75, y: .3, z: 1.1 }, 'stone');
  add('Trail cabin fireplace back', { x: 2.95, y: 1.18, z: -3.05 }, { x: 1.6, y: 2.05, z: .45 }, 'stone');
  add('Trail cabin stone chimney', { x: 3.55, y: 4.15, z: -2.45 }, { x: .82, y: 5.5, z: .82 }, 'stone');
  return { id: 'PREFAB-PRODUCTION-HEARTHWARD-CABIN', name: 'Hearthward Cabin — production reference', kind: 'building', version: 1, objects, movingPlatforms: [], waters: [], metadata: { productionReference: true, sourceBuilder: 'buildHomeCabin' } };
}

function shopDefinition() {
  const objects = [];
  const add = (name, position, size, material = 'wood', rotation = {}, collision = true) => (
    addBox(objects, 'SHOP-OUTPOST', name, position, size, material, rotation, collision, "Outfitter's Reach")
  );
  add('Outfitter floor', { x: 0, y: -.12, z: 0 }, { x: 10.5, y: .28, z: 7.4 });
  add('Outfitter back wall', { x: 0, y: 2, z: -3.5 }, { x: 10.5, y: 4, z: .28 }, 'wall');
  for (const side of [-1, 1]) {
    add(`Outfitter side wall ${side}`, { x: side * 5.1, y: 2, z: 0 }, { x: .28, y: 4, z: 7.2 }, 'wall');
    add(`Outfitter roof pitch ${side}`, { x: side * 2.7, y: 4.6, z: 0 }, { x: 5.8, y: .25, z: 8.2 }, 'dark', { z: -side * 21 });
    add(`Outfitter lantern ${side}`, { x: side * 4.45, y: 2.75, z: 2.7 }, { x: .32, y: .58, z: .32 }, 'light', {}, false);
  }
  add('Outfitter gear counter', { x: -2.2, y: .85, z: 1.4 }, { x: 3.35, y: 1.7, z: 1 }, 'trim');
  add('Fishmonger sales counter', { x: 2.2, y: .85, z: 1.4 }, { x: 3.35, y: 1.7, z: 1 }, 'wood');
  add("Outfitter's Reach hanging sign", { x: 0, y: 3.45, z: 3.62 }, { x: 4.7, y: .78, z: .12 }, 'accent', {}, false);
  add('Outfitter gear rack rail', { x: -4.25, y: 2.15, z: -2.85 }, { x: .2, y: 2.8, z: .2 }, 'trim', {}, false);
  for (let index = 0; index < 4; index += 1) add(`Fish buyer barrel ${index + 1}`,
    { x: 3.55 + index % 2 * .82, y: .58, z: -2.35 + Math.floor(index / 2) * .9 },
    { x: .7, y: 1.15, z: .7 }, 'wood', { y: index * 17 }, false);
  return { id: 'PREFAB-PRODUCTION-OUTFITTER-SHOP', name: "Outfitter's Reach Shop — production reference", kind: 'building', version: 1, objects, movingPlatforms: [], waters: [], metadata: { productionReference: true, sourceBuilder: 'buildShopOutpost' } };
}

function aquariumDefinition() {
  const objects = [];
  const add = (name, position, size, material = 'stone', rotation = {}, collision = true, category = 'Glasswater Aquarium') => (
    addBox(objects, 'AQUARIUM', name, position, size, material, rotation, collision, category)
  );
  const config = PUBLIC_AQUARIUM_CONFIG;
  add('Glasswater Aquarium broad stone foundation', { x: 0, y: -.24, z: 0 }, { x: config.width + 8, y: .48, z: config.depth + 10 });
  add('Glasswater Aquarium public promenade', { x: 0, y: .04, z: 0 }, { x: config.width + 2, y: .18, z: config.depth + 3 }, 'wood');
  add('Glasswater Aquarium central aisle', { x: 0, y: .16, z: 0 }, { x: config.width - 3, y: .12, z: 4.4 }, 'trim');
  for (const side of [-1, 1]) add(`Glasswater Aquarium ${side < 0 ? 'west' : 'east'} wing canopy`,
    { x: 0, y: config.waterlineY + 2.35, z: side * 10.1 }, { x: config.width + 1, y: .3, z: 18.2 }, 'dark', { x: side * 2 });
  const postXs = [-.46, -.28, -.1, .1, .28, .46].map((ratio) => ratio * config.width);
  for (const x of postXs) for (const z of [-20.2, 20.2]) add(`Glasswater Aquarium hall post ${x}:${z}`,
    { x, y: 5.45, z }, { x: .38, y: 10.9, z: .38 }, 'trim');
  add('Glasswater Aquarium central clerestory roof', { x: 0, y: config.waterlineY + 3.05, z: 0 }, { x: config.width + 2, y: .32, z: 5.8 }, 'dark', { z: 1.5 });
  add('Glasswater Aquarium clerestory ridge', { x: 0, y: config.waterlineY + 3.42, z: 0 }, { x: config.width + 2.6, y: .22, z: .32 }, 'trim', {}, false);
  for (let rib = -4; rib <= 4; rib += 1) add(`Glasswater Aquarium roof rib ${rib + 5}`,
    { x: rib * config.width / 10, y: config.waterlineY + 2.72, z: 0 }, { x: .24, y: .24, z: config.depth - 1 }, 'trim', {}, false);
  add('Glasswater Aquarium entrance step', { x: 0, y: -.38, z: config.depth * .5 + 2.2 }, { x: 13, y: .3, z: 2.2 }, 'trim');
  add('Glasswater Aquarium rear approach step', { x: 0, y: -.38, z: -config.depth * .5 - 2.2 }, { x: 13, y: .3, z: 2.2 }, 'trim');
  add('Glasswater Aquarium collection sign', { x: 0, y: config.waterlineY + 1.15, z: config.depth * .5 + 1.1 }, { x: 8.8, y: 1.15, z: .18 }, 'accent', {}, false);
  const glassCenterY = config.waterFloorY + config.tankHeight * .5;
  for (let index = 0; index < 10; index += 1) {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const centerX = (column - 2) * config.tankSpacingX;
    const centerZ = row === 0 ? -config.tankRowZ : config.tankRowZ;
    const at = (position) => ({ x: centerX + position.x, y: position.y, z: centerZ + position.z });
    const category = `Aquarium Tank ${index + 1}`;
    add(`${category} stone plinth`, at({ x: 0, y: .48, z: 0 }), { x: config.tankWidth + .55, y: .96, z: config.tankDepth + .55 }, 'stone', {}, true, category);
    add(`${category} front viewing glass`, at({ x: 0, y: glassCenterY, z: config.tankDepth * .5 }), { x: config.tankWidth, y: config.tankHeight, z: config.glassThickness }, 'glass', {}, true, category);
    add(`${category} rear viewing glass`, at({ x: 0, y: glassCenterY, z: -config.tankDepth * .5 }), { x: config.tankWidth, y: config.tankHeight, z: config.glassThickness }, 'glass', {}, true, category);
    add(`${category} left glass`, at({ x: -config.tankWidth * .5, y: glassCenterY, z: 0 }), { x: config.glassThickness, y: config.tankHeight, z: config.tankDepth }, 'glass', {}, true, category);
    add(`${category} right glass`, at({ x: config.tankWidth * .5, y: glassCenterY, z: 0 }), { x: config.glassThickness, y: config.tankHeight, z: config.tankDepth }, 'glass', {}, true, category);
    add(`${category} upper exhibit frame`, at({ x: 0, y: config.waterlineY + .16, z: 0 }), { x: config.tankWidth + .55, y: .32, z: config.tankDepth + .55 }, 'trim', {}, true, category);
    add(`${category} bounded water volume`, at({ x: 0, y: (config.waterFloorY + config.waterlineY) * .5, z: 0 }),
      { x: config.tankWidth - config.glassThickness * 2, y: config.waterlineY - config.waterFloorY, z: config.tankDepth - config.glassThickness * 2 }, 'water', {}, false, category);
  }
  return { id: 'PREFAB-PRODUCTION-GLASSWATER-AQUARIUM', name: 'Glasswater Aquarium — production reference', kind: 'building', version: 1, objects, movingPlatforms: [], waters: [], metadata: { productionReference: true, sourceBuilder: 'buildPublicAquarium', includesAllTankSlots: true } };
}

function structureReference(location) {
  const definition = location.id === 'home-island' ? homeCabinDefinition()
    : location.id === 'shop-island' ? shopDefinition()
      : location.id === 'aquarium-island' ? aquariumDefinition() : null;
  if (!definition) return null;
  const floorY = location.id === 'home-island' ? HOME_CABIN_CONFIG.floorY
    : location.id === 'aquarium-island' ? PUBLIC_AQUARIUM_CONFIG.floorY
      : location.elevation + .2;
  return {
    definition,
    instance: {
      id: `${definition.id}-INSTANCE`, name: definition.name, prefabId: definition.id, linked: true,
      transform: transform({ x: 0, y: floorY, z: 0 }, { y: 90 - location.angle }),
      metadata: { productionReference: true, sourceBuilder: definition.metadata.sourceBuilder }
    }
  };
}

export function makeProductionIslandEditorLevel(worldOrId) {
  const worldId = typeof worldOrId === 'string' ? worldOrId : worldOrId?.id;
  const locationId = typeof worldOrId === 'string' ? worldOrId : (worldOrId?.runtimeLocationId || worldOrId?.id);
  const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === locationId);
  if (!location || !ISLAND_EDITOR_IDS.includes(location.id)) throw new Error(`No production-island editor adapter for ${locationId}.`);
  const data = buildOceanIslandTerrainData(location);
  const positions = data.vertices.flatMap(([x, y, z]) => [x - location.worldPosition.x, y, z - location.worldPosition.z]);
  const dock = location.dock;
  const structure = structureReference(location);
  const dockObject = dock?.length > 0 ? {
    id: `${location.id}-production-dock-reference`, name: `${location.displayName} production dock`,
    type: 'box', category: 'Dock / Arrival',
    transform: {
      position: {
        x: dock.worldPosition.x - location.worldPosition.x,
        y: dock.worldPosition.y,
        z: dock.worldPosition.z - location.worldPosition.z
      },
      rotation: { x: 0, y: dock.facingYaw, z: 0 }, scale: { x: 1, y: 1, z: 1 }
    },
    size: { x: 2.8, y: .28, z: dock.length }, collision: true, visible: true,
    metadata: { productionReference: true, source: 'world-locations.js dock', materialKey: 'wood', authoredPrimitive: 'box' }
  } : null;
  return normalizeWorldEditorLevel({
    schema: 2, kind: 'reel-ascent-world-level', worldId,
    displayName: typeof worldOrId === 'string' ? location.displayName : (worldOrId?.label || location.displayName), runtimeLocationId: location.id, updatedAt: null,
    sourcePolicy: {
      terrain: 'production-generator', architecture: structure ? 'production-reference' : 'procedural-reference', waters: 'procedural-reference',
      objects: 'production-reference', movingPlatforms: 'authored', prefabs: structure ? 'production-reference' : 'authored'
    },
    terrain: {
      mode: 'production-island-terrain', format: 'triangle-mesh-v1', coordinateSpace: 'island-local',
      positions, indices: data.triangles.flat(),
      parts: [{ name: 'production island terrain / coast / submerged apron', firstVertex: 0, vertexCount: data.vertices.length, firstTriangle: 0, triangleCount: data.triangles.length }],
      metadata: { source: `buildOceanIslandTerrainData(${location.id})`, productionAuthoritative: true, oceanSurfaceY: OCEAN_SURFACE_Y }
    },
    waters: [], objects: dockObject ? [dockObject] : [], movingPlatforms: [],
    prefabs: {
      definitions: structure ? [structure.definition] : [],
      instances: structure ? [structure.instance] : []
    }, rooms: [],
    metadata: {
      productionIslandAdapter: true, theme: location.theme, functions: [...location.functions],
      globalOrigin: { ...location.worldPosition }, note: 'Terrain is exact production generator output. Procedural decorations remain runtime references until authored adapters are added.'
    }
  }, { worldId, displayName: typeof worldOrId === 'string' ? location.displayName : (worldOrId?.label || location.displayName), runtimeLocationId: location.id });
}

export function ensureProductionIslandTerrain(level, worldOrId) {
  const generated = makeProductionIslandEditorLevel(worldOrId);
  const hasTerrain = level?.terrain?.positions?.length && level?.terrain?.indices?.length;
  if (!hasTerrain) level.terrain = generated.terrain;
  level.sourcePolicy = { ...level.sourcePolicy, terrain: hasTerrain ? level.sourcePolicy?.terrain : 'production-generator' };
  level.metadata = {
    ...level.metadata,
    productionIslandAdapter: true,
    productionIslandTerrainSource: level.terrain?.metadata?.source || generated.terrain.metadata.source,
    globalOrigin: generated.metadata.globalOrigin
  };
  const dock = generated.objects.find((item) => item.metadata?.productionReference);
  level.objects ??= [];
  if (dock && !level.objects.some((item) => item.id === dock.id)) level.objects.push(dock);
  level.prefabs ??= { definitions: [], instances: [] };
  for (const definition of generated.prefabs?.definitions ?? []) {
    if (!level.prefabs.definitions.some((item) => item.id === definition.id)) level.prefabs.definitions.push(definition);
  }
  for (const instance of generated.prefabs?.instances ?? []) {
    if (!level.prefabs.instances.some((item) => item.id === instance.id)) level.prefabs.instances.push(instance);
  }
  if ((generated.prefabs?.instances?.length ?? 0) > 0) level.sourcePolicy = {
    ...level.sourcePolicy, architecture: 'production-reference', prefabs: 'production-reference'
  };
  return level;
}
