import { Quat, Vec3 } from 'playcanvas';
import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import {
  buildOceanIslandTerrainData,
  DOCK_DECK_LOWERING,
  HOME_CABIN_CONFIG,
  OCEAN_SURFACE_Y,
  PUBLIC_AQUARIUM_CONFIG,
  triangleSurfaceHeightAt
} from '../../src/world/mountain-v2.js';
import { normalizeWorldEditorLevel } from './world-level-format.js';

const ISLAND_EDITOR_IDS = Object.freeze([
  'home-island', 'shop-island', 'aquarium-island', 'cave-fishing-island',
  'normal-fishing-island', 'cold-island', 'skyreach-foundation'
]);

export function productionIslandEditorIds() { return [...ISLAND_EDITOR_IDS]; }

function cleanCaveEditorTerrain() {
  const columns = 33;
  const rows = 29;
  const width = 48;
  const depth = 40;
  const positions = [];
  const indices = [];
  for (let row = 0; row < rows; row += 1) {
    const z = -depth / 2 + row / (rows - 1) * depth;
    for (let column = 0; column < columns; column += 1) {
      const x = -width / 2 + column / (columns - 1) * width;
      const edge = Math.hypot(x / 24, z / 20);
      const basin = Math.hypot(x / 5.15, z / 4.25);
      const irregular = Math.sin(x * .42) * .12 + Math.cos(z * .37) * .1 + Math.sin((x + z) * .21) * .08;
      let y = 1.02 + irregular;
      if (basin < 1) y = -.95 + irregular * .12;
      else if (basin < 1.42) {
        const t = (basin - 1) / .42;
        y = -.95 + (1.02 + irregular + .95) * (t * t * (3 - 2 * t));
      }
      if (edge > .82) {
        const t = Math.min(1, (edge - .82) / .18);
        y += (-1.35 - y) * (t * t * (3 - 2 * t));
      }
      positions.push(x, y, z);
    }
  }
  for (let row = 0; row < rows - 1; row += 1) for (let column = 0; column < columns - 1; column += 1) {
    const a = row * columns + column;
    const b = a + 1;
    const c = a + columns;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  return {
    mode: 'authored-triangle-mesh', format: 'triangle-mesh-v1', coordinateSpace: 'island-local',
    positions, indices,
    parts: [{ name: 'clean editable cave-island landmass', firstVertex: 0, vertexCount: positions.length / 3, firstTriangle: 0, triangleCount: indices.length / 3 }],
    metadata: { source: 'v23-clean-cave-editor-baseline', productionAuthoritative: false, oceanSurfaceY: OCEAN_SURFACE_Y }
  };
}

export function makeCleanCaveEditorLevel(worldOrId = 'cave-fishing-island') {
  const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === 'cave-fishing-island');
  const worldId = typeof worldOrId === 'string' ? worldOrId : worldOrId?.id;
  return normalizeWorldEditorLevel({
    schema: 2, kind: 'reel-ascent-world-level', worldId,
    displayName: typeof worldOrId === 'string' ? 'Cave Fishing Island / Basalt Grotto' : worldOrId.label,
    runtimeLocationId: location.id, updatedAt: null,
    sourcePolicy: { terrain: 'authored', architecture: 'authored', waters: 'authored', objects: 'authored', movingPlatforms: 'authored', prefabs: 'authored' },
    terrain: cleanCaveEditorTerrain(),
    waters: [{
      id: 'basalt-grotto', identity: 'basalt-grotto', name: 'Basalt Grotto', shape: 'ellipse',
      position: { x: 0, y: .22, z: 0 }, radii: { x: 4.608, z: 3.744 }, depthMeters: 1.15,
      color: '#269eb8', fishingZoneScale: 1, swimmable: false,
      metadata: { canonicalWater: true, stableRuntimeId: 'basalt-grotto' }
    }],
    objects: [], movingPlatforms: [], prefabs: { definitions: [], instances: [] }, rooms: [],
    metadata: {
      cleanCaveBaselineV23: true, coordinateSpace: 'cave-island-local',
      globalOrigin: { ...location.worldPosition },
      note: 'Clean fine-grained Cave Island authoring baseline. Runtime Cave access remains separately unavailable.'
    }
  }, { worldId, displayName: 'Cave Fishing Island / Basalt Grotto', runtimeLocationId: location.id });
}

const transform = (position, rotation = {}) => ({
  position: { x: position.x, y: position.y, z: position.z },
  rotation: { x: rotation.x ?? 0, y: rotation.y ?? 0, z: rotation.z ?? 0 },
  scale: { x: 1, y: 1, z: 1 }
});

function addBox(objects, prefix, name, position, size, materialKey, rotation = {}, collision = true, category = 'Production Architecture', type = 'box') {
  const sequence = String(objects.length + 1).padStart(3, '0');
  objects.push({
    id: `${prefix}-${sequence}`, name, type, category,
    transform: transform(position, rotation), size: { ...size }, collision, visible: true,
    metadata: { productionReference: true, source: 'mountain-v2.js active structure builder', materialKey, authoredPrimitive: type }
  });
}

function homeCabinDefinition() {
  const objects = [];
  const add = (name, position, size, material = 'wood', rotation = {}, collision = true, category = 'Hearthward Cabin', type = 'box') => (
    addBox(objects, 'HOME-CABIN', name, position, size, material, rotation, collision, category, type)
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
  for (const side of [-1, 1]) add(`Trail cabin porch ${side < 0 ? 'left' : 'right'} handrail`,
    { x: side * 3.25, y: .78, z: 4.43 }, { x: .16, y: .16, z: 1.35 }, 'trim', {}, false);
  add('Trail cabin front window', { x: 2.55, y: 1.9, z: config.depth * .5 + .18 }, { x: 1.55, y: 1.25, z: .05 }, 'glass', {}, false);
  add('Trail cabin side window', { x: -config.width * .5 - .18, y: 1.9, z: -.6 }, { x: .05, y: 1.3, z: 1.65 }, 'glass', {}, false);
  for (const x of [1.735, 2.55, 3.365]) add(`Trail cabin front window frame ${x}`,
    { x, y: 1.9, z: config.depth * .5 + .22 }, { x: .07, y: 1.42, z: .07 }, 'trim', {}, false);
  for (const y of [1.25, 1.9, 2.55]) add(`Trail cabin front window crossbar ${y}`,
    { x: 2.55, y, z: config.depth * .5 + .22 }, { x: 1.68, y: .07, z: .07 }, 'trim', {}, false);
  for (const z of [-1.46, -.6, .26]) add(`Trail cabin side window frame ${z}`,
    { x: -config.width * .5 - .22, y: 1.9, z }, { x: .07, y: 1.44, z: .07 }, 'trim', {}, false);
  for (const y of [1.23, 1.9, 2.57]) add(`Trail cabin side window crossbar ${y}`,
    { x: -config.width * .5 - .22, y, z: -.6 }, { x: .07, y: .07, z: 1.78 }, 'trim', {}, false);
  for (const [index, x] of [-3.35, -1.75, 1.75, 3.35].entries()) add(`Trail cabin floor board ${index + 1}`,
    { x, y: .012, z: 0 }, { x: .035, y: .025, z: config.depth - .18 }, 'trim', {}, false);
  add('Trail cabin bed frame', { x: -2.65, y: .32, z: -1.55 }, { x: 2.05, y: .55, z: 3.15 }, 'wood');
  add('Trail cabin table top', { x: 2.15, y: 1.02, z: -.25 }, { x: 2.15, y: .18, z: 1.32 }, 'wood');
  add('Trail cabin wardrobe', { x: -3.55, y: 1.28, z: 1.05 }, { x: 1.05, y: 2.55, z: 1.65 }, 'wall');
  add('Trail cabin stone hearth', { x: 2.95, y: .15, z: -2.7 }, { x: 1.75, y: .3, z: 1.1 }, 'stone');
  add('Trail cabin fireplace back', { x: 2.95, y: 1.18, z: -3.05 }, { x: 1.6, y: 2.05, z: .45 }, 'stone');
  add('Trail cabin stone chimney', { x: 3.55, y: 4.15, z: -2.45 }, { x: .82, y: 5.5, z: .82 }, 'stone');
  add('Trail cabin chimney cap', { x: 3.55, y: 6.93, z: -2.45 }, { x: 1.05, y: .18, z: 1.05 }, 'stone');
  add('Trail cabin bedroll', { x: -2.65, y: .65, z: -1.55 }, { x: 1.85, y: .24, z: 2.9 }, 'fabric');
  add('Trail cabin pillow', { x: -2.65, y: .86, z: -2.45 }, { x: 1.42, y: .24, z: .58 }, 'fixture', {}, false);
  add('Trail cabin table pedestal', { x: 2.15, y: .5, z: -.25 }, { x: .55, y: 1, z: .55 }, 'wood');
  add('Trail cabin chair seat', { x: 2.15, y: .58, z: 1.45 }, { x: 1.05, y: .22, z: 1.05 }, 'wood');
  add('Trail cabin chair back', { x: 2.15, y: 1.25, z: 1.91 }, { x: 1.05, y: 1.38, z: .18 }, 'wood');
  add('Trail cabin wardrobe mirror', { x: -2.99, y: 1.5, z: 1.05 }, { x: .045, y: 1.55, z: .88 }, 'glass', {}, false);
  add('Trail cabin wardrobe handle', { x: -2.94, y: 1.28, z: .73 }, { x: .06, y: .12, z: .08 }, 'accent', {}, false);
  for (let shelf = 0; shelf < 2; shelf += 1) add(`Trail cabin trophy shelf ${shelf + 1}`,
    { x: 2.45, y: 1.48 + shelf * .72, z: -3.12 }, { x: 2.85, y: .12, z: .48 }, 'trim');
  add('Trail Badges wall board', { x: .65, y: 2.72, z: -3.16 }, { x: 2.45, y: 1.05, z: .12 }, 'wood', {}, false);
  for (let index = 0; index < 10; index += 1) add(`Trail Badge board medallion ${index + 1}`,
    { x: -.25 + index % 5 * .45, y: 2.48 + Math.floor(index / 5) * .45, z: -3.08 },
    { x: .26, y: .07, z: .26 }, index % 3 ? 'accent' : 'water', { x: 90 }, false, 'Hearthward Cabin', 'cylinder');
  for (let index = 0; index < 4; index += 1) addBox(objects, 'HOME-CABIN', `Trail cabin progress trophy placeholder ${index + 1}`,
    { x: 1.55 + index * .62, y: 1.83 + (index % 2) * .72, z: -3 },
    { x: .64, y: .96 + (index % 2) * .32, z: .44 }, index === 1 ? 'water' : index === 2 ? 'glass' : 'accent',
    { x: index === 1 ? 0 : 90, y: index * 23 }, false, 'Hearthward Cabin / Progress', index === 1 ? 'sphere' : 'cone');
  add('Trail cabin gear rack', { x: -.85, y: 1.75, z: -3.13 }, { x: 1.9, y: .14, z: .16 }, 'trim', {}, false);
  for (const [index, x] of [-1.45, -.82, -.18].entries()) add(`Trail cabin hanging gear ${index + 1}`,
    { x, y: 1.12, z: -3 }, { x: .11, y: 1.15, z: .11 }, index === 1 ? 'glass' : 'stone',
    { z: index % 2 ? 8 : -8 }, false, 'Hearthward Cabin', 'cylinder');
  add('Trail cabin fireplace opening', { x: 2.95, y: .72, z: -2.79 }, { x: .92, y: .82, z: .08 }, 'dark', {}, false);
  add('Trail cabin fireplace glow', { x: 2.95, y: .5, z: -2.72 }, { x: .55, y: .35, z: .1 }, 'light', {}, false);
  add('Trail cabin woven rug', { x: 0, y: .035, z: -.15 }, { x: 2.25, y: .035, z: 3.25 }, 'fabric', {}, false);
  for (const z of [-2.65, 0, 2.65]) for (const side of [-1, 1]) add(`Trail cabin exposed rafter ${z} ${side}`,
    { x: side * 2.02, y: 4, z }, { x: 4.55, y: .12, z: .16 }, 'trim', { z: -side * 25 }, false);
  add('Trail cabin hanging lantern', { x: 0, y: 3.1, z: .2 }, { x: .34, y: .55, z: .34 }, 'light', {}, false);
  add('Trail cabin Stoneveil Peak sign', { x: -2.15, y: 2.05, z: 5.03 }, { x: 2.35, y: .7, z: .11 }, 'accent', { z: -2 }, false);
  Object.assign(objects.at(-1).metadata, { editableSign: true, signText: 'STONEVEIL PEAK' });
  for (const side of [-1, 1]) {
    add(`Trail cabin front window ${side < 0 ? 'left' : 'right'} shutter`, { x: 2.55 + side * 1.02, y: 1.9, z: config.depth * .5 + .25 }, { x: .34, y: 1.48, z: .08 }, 'trim', { z: side * 3 }, false);
    add(`Trail cabin roof ${side < 0 ? 'west' : 'east'} fascia`, { x: side * 3.95, y: 3.62, z: 0 }, { x: .16, y: .28, z: 7.6 }, 'trim', { z: -side * 25 }, false);
    add(`Trail cabin porch planter ${side}`, { x: side * 2.65, y: .26, z: 5.12 }, { x: .82, y: .52, z: .72 }, 'wood', {}, false);
    add(`Trail cabin porch planter foliage ${side}`, { x: side * 2.65, y: .68, z: 5.12 }, { x: .7, y: .46, z: .62 }, 'plant', { z: side * 5 }, false, 'Hearthward Cabin', 'sphere');
  }
  add('Trail cabin kitchen wall shelf', { x: .2, y: 2.15, z: -3.12 }, { x: 1.45, y: .1, z: .42 }, 'trim', {}, false);
  for (let index = 0; index < 3; index += 1) add(`Trail cabin shelf mug ${index + 1}`,
    { x: -.25 + index * .42, y: 2.34, z: -2.98 }, { x: .22, y: .3, z: .22 }, index === 1 ? 'accent' : 'water', {}, false);
  add('Trail cabin porch welcome mat', { x: 0, y: .035, z: 3.78 }, { x: 1.45, y: .035, z: .72 }, 'fabric', {}, false);
  add('Trail cabin field map frame', { x: 4.05, y: 2.05, z: .3 }, { x: .08, y: 1.45, z: 1.85 }, 'trim', {}, false);
  add('Trail cabin field map print', { x: 4, y: 2.05, z: .3 }, { x: .035, y: 1.2, z: 1.55 }, 'accent', {}, false);
  add('Trail cabin storage chest', { x: -3.05, y: .48, z: 2.25 }, { x: 1.65, y: .9, z: 1.05 }, 'wood');
  add('Trail cabin storage chest lid', { x: -3.05, y: .98, z: 2.25 }, { x: 1.78, y: .16, z: 1.14 }, 'trim', {}, false);
  for (const side of [-1, 0, 1]) add(`Trail cabin coat hook ${side}`,
    { x: -1.1 + side * .42, y: 2.18, z: -3.24 }, { x: .08, y: .28, z: .18 }, 'dark', { x: -18 }, false);
  add('Hearthward pond bench seat', { x: 7.8, y: .48, z: 4.55 }, { x: 2.2, y: .18, z: .72 }, 'wood');
  add('Hearthward pond bench back', { x: 7.8, y: 1.02, z: 4.08 }, { x: 2.2, y: .82, z: .14 }, 'trim', { x: 7 });
  for (const x of [7.02, 8.58]) add(`Hearthward pond bench leg ${x}`, { x, y: .2, z: 4.55 }, { x: .2, y: .4, z: .42 }, 'trim');
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI * 2 / 12;
    const x = 7.8 + Math.cos(angle) * (4.45 + (index % 2) * .25);
    const z = 8.25 + Math.sin(angle) * (3.45 + (index % 3) * .16);
    add(`Hearthward pond reed ${index + 1}`, { x, y: .27 + (index % 3) * .06, z }, { x: .24, y: .72 + (index % 3) * .12, z: .24 }, 'plant', { z: index % 2 ? 7 : -7 }, false, 'Hearthward Pond', 'cone');
    if (index % 3 === 0) add(`Hearthward pond flower ${index + 1}`, { x: x + .25, y: .28, z: z - .18 }, { x: .32, y: .24, z: .32 }, 'accent', {}, false, 'Hearthward Pond', 'sphere');
  }
  for (let index = 0; index < 5; index += 1) {
    const angle = (index * 73 + 18) * Math.PI / 180;
    addBox(objects, 'HOME-CABIN', `Hearthward pond modest shoreline rock ${index + 1}`,
      { x: 7.8 + Math.cos(angle) * 4.48, y: -.08, z: 8.25 + Math.sin(angle) * 3.53 },
      { x: .84 + index % 2 * .24, y: .48, z: .72 }, 'stone',
      { x: index * 7, y: index * 39, z: index % 2 ? 5 : -4 }, false, 'Hearthward Pond', 'sphere');
  }
  for (const item of objects.filter((entry) => /Hearthward pond bench/.test(entry.name))) {
    item.category = 'Hearthward Seating / Benches';
    Object.assign(item.metadata, { componentName: 'Hearthward Pond Bench', benchId: 'hearthward-pond-bench' });
  }
  return {
    id: 'PREFAB-PRODUCTION-HEARTHWARD-CABIN', name: 'Hearthward Cabin — complete production reference', kind: 'building', version: 3,
    objects, movingPlatforms: [],
    waters: [{ id: 'hearthward-pond', name: 'Hearthward Tutorial Pond', identity: 'hearthward-pond', position: { x: 7.8, y: -.2, z: 8.25 }, radii: { x: 4.1, z: 3.15 }, depthMeters: .5, metadata: { productionReference: true } }],
    metadata: { productionReference: true, sourceBuilder: 'buildHomeCabin', completeProductionReference: true }
  };
}

function shopDefinition() {
  const objects = [];
  const add = (name, position, size, material = 'wood', rotation = {}, collision = true, category = "Outfitter's Reach", type = 'box') => (
    addBox(objects, 'SHOP-OUTPOST', name, position, size, material, rotation, collision, category, type)
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
  const addNpc = (prefix, localX, coatMaterial, hatMaterial) => {
    add(`${prefix} boots`, { x: localX, y: .28, z: -.9 }, { x: .72, y: .55, z: .55 }, 'dark', {}, false);
    add(`${prefix} body`, { x: localX, y: 1.22, z: -.9 }, { x: 1.05, y: 1.45, z: .65 }, coatMaterial, {}, false);
    add(`${prefix} head`, { x: localX, y: 2.25, z: -.9 }, { x: .68, y: .68, z: .62 }, 'accent', {}, false);
    add(`${prefix} hat brim`, { x: localX, y: 2.63, z: -.86 }, { x: 1.02, y: .1, z: .78 }, hatMaterial, {}, false);
    add(`${prefix} hat crown`, { x: localX, y: 2.82, z: -.92 }, { x: .67, y: .34, z: .58 }, hatMaterial, {}, false);
    for (const side of [-1, 1]) add(`${prefix} eye ${side}`, { x: localX + side * .15, y: 2.32, z: -.575 }, { x: .075, y: .09, z: .045 }, 'dark', {}, false);
    add(`${prefix} nose`, { x: localX, y: 2.18, z: -.54 }, { x: .09, y: .14, z: .09 }, 'accent', {}, false);
  };
  addNpc('Outfitter clerk', -2.2, 'fabric', 'accent');
  addNpc('Old Man fish buyer', 2.2, 'water', 'dark');
  add('OUTFITTER BUY GEAR counter sign', { x: -2.2, y: 1.74, z: 1.94 }, { x: 2.85, y: .58, z: .1 }, 'accent', {}, false);
  Object.assign(objects.at(-1).metadata, { editableSign: true, signText: 'BUY GEAR' });
  add('FISH MARKET SELL CATCHES counter sign', { x: 2.2, y: 1.74, z: 1.94 }, { x: 2.85, y: .58, z: .1 }, 'water', {}, false);
  Object.assign(objects.at(-1).metadata, { editableSign: true, signText: 'SELL CATCHES' });
  add("Outfitter's Reach hanging sign", { x: 0, y: 3.45, z: 3.62 }, { x: 4.7, y: .78, z: .12 }, 'accent', {}, false);
  Object.assign(objects.at(-1).metadata, { editableSign: true, signText: "OUTFITTER'S REACH" });
  for (const side of [-1, 1]) {
    add(`Outfitter sign rope ${side}`, { x: side * 1.7, y: 3.9, z: 3.58 }, { x: .06, y: .88, z: .06 }, 'wood', {}, false);
    add(`Outfitter lantern hook ${side}`, { x: side * 4.45, y: 3.18, z: 2.7 }, { x: .08, y: .42, z: .08 }, 'dark', {}, false);
  }
  add('Outfitter gear rack rail', { x: -4.25, y: 2.15, z: -2.85 }, { x: .2, y: 2.8, z: .2 }, 'trim', {}, false);
  for (let index = 0; index < 5; index += 1) add(`Outfitter hanging rod ${index + 1}`,
    { x: -4.02 + index * .34, y: 2, z: -2.78 }, { x: .07, y: 2.4 - index * .13, z: .07 },
    index % 2 ? 'accent' : 'dark', { z: -5 + index * 2 }, false);
  for (let index = 0; index < 4; index += 1) add(`Fish buyer barrel ${index + 1}`,
    { x: 3.55 + index % 2 * .82, y: .58, z: -2.35 + Math.floor(index / 2) * .9 },
    { x: .7, y: 1.15, z: .7 }, 'wood', { y: index * 17 }, false);
  for (let index = 0; index < 4; index += 1) add(`Fish buyer barrel band ${index + 1}`,
    { x: 3.55 + index % 2 * .82, y: .58, z: -2.35 + Math.floor(index / 2) * .9 },
    { x: .76, y: .12, z: .76 }, 'dark', { y: index * 17 }, false);
  for (let index = 0; index < 5; index += 1) add(`Outfitter compact cargo ${index + 1}`,
    { x: -3.65 + index % 2 * 1.05, y: .39 + Math.floor(index / 4) * .75, z: -2.35 + Math.floor(index / 2) % 2 * 1.08 },
    { x: .92, y: .78, z: .92 }, 'wood', { y: index * 13 }, false);
  add('Outfitter display boots', { x: -2.75, y: 1.93, z: 1.18 }, { x: .62, y: .38, z: .72 }, 'dark', {}, false);
  add('Outfitter display chalk bag', { x: -2.05, y: 1.98, z: 1.2 }, { x: .38, y: .48, z: .35 }, 'fixture', {}, false);
  add('Outfitter display folded map', { x: -1.45, y: 1.79, z: 1.18 }, { x: .72, y: .035, z: .55 }, 'accent', { y: 8 }, false);
  add('Outfitter display ice axe handle', { x: -2.2, y: 2.15, z: 1.1 }, { x: .08, y: 1.25, z: .08 }, 'dark', { z: -56 }, false);
  add('Outfitter display ice axe head', { x: -1.9, y: 2.42, z: 1.1 }, { x: .65, y: .08, z: .1 }, 'glass', { z: -12 }, false);
  add('Fish Market balance scale post', { x: 2.7, y: 2.08, z: 1.2 }, { x: .08, y: .72, z: .08 }, 'metal', {}, false);
  add('Fish Market balance scale beam', { x: 2.7, y: 2.4, z: 1.2 }, { x: 1.15, y: .07, z: .08 }, 'metal', {}, false);
  addBox(objects, 'SHOP-OUTPOST', 'Fish Market sardine display', { x: 1.62, y: 2.06, z: 1.1 },
    { x: .95, y: .24, z: .3 }, 'water', {}, false, "Outfitter's Reach / Canonical Displays", 'sphere');
  addBox(objects, 'SHOP-OUTPOST', 'Fish Market blue crab display body', { x: 2.08, y: 2.06, z: 1.1 },
    { x: .58, y: .18, z: .45 }, 'accent', { y: 25 }, false, "Outfitter's Reach / Canonical Displays", 'sphere');
  for (const side of [-1, 1]) add(`Fish Market blue crab claw ${side}`,
    { x: 2.08 + side * .42, y: 2.08, z: 1.1 }, { x: .24, y: .12, z: .32 }, 'accent', { y: side * 28 }, false);
  return {
    id: 'PREFAB-PRODUCTION-OUTFITTER-SHOP', name: "Outfitter's Reach Shop — complete production reference", kind: 'building', version: 3,
    objects, movingPlatforms: [], waters: [],
    metadata: { productionReference: true, sourceBuilder: 'buildShopOutpost', completeProductionReference: true, includesNpcs: ['Outfitter clerk', 'Old Man fish buyer'] }
  };
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
  Object.assign(objects.at(-1).metadata, { editableSign: true, signText: 'GLASSWATER AQUARIUM' });
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
  for (const x of [-config.width * .29, 0, config.width * .29]) {
    for (const z of [-2.35, 2.35]) {
      const benchId = `aquarium-visitor-bench-${x}:${z}`;
      add(`Glasswater Aquarium visitor bench ${x}:${z}`, { x, y: .52, z },
        { x: 3.8, y: .22, z: .72 }, 'wood', {}, true, 'Glasswater Seating / Benches');
      Object.assign(objects.at(-1).metadata, { componentName: 'Glasswater Aquarium Visitor Bench', benchId });
      for (const offset of [-1.35, 1.35]) {
        add(`Glasswater Aquarium visitor bench leg ${x + offset}:${z}`,
          { x: x + offset, y: .27, z }, { x: .24, y: .32, z: .46 }, 'trim', {}, true, 'Glasswater Seating / Benches');
        Object.assign(objects.at(-1).metadata, { componentName: 'Glasswater Aquarium Visitor Bench', benchId });
      }
    }
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
    rootTransform: transform({ x: 0, y: floorY, z: 0 }, { y: 90 - location.angle })
  };
}

function composeProductionStructure(structure) {
  if (!structure) return { objects: [], waters: [] };
  const root = structure.rootTransform;
  const rootRotation = new Quat().setFromEulerAngles(root.rotation.x, root.rotation.y, root.rotation.z);
  const objects = (structure.definition.objects ?? []).map((item) => {
    const localPosition = new Vec3(item.transform.position.x, item.transform.position.y, item.transform.position.z);
    const rotatedPosition = rootRotation.transformVector(localPosition, new Vec3());
    const localRotation = new Quat().setFromEulerAngles(
      item.transform.rotation.x, item.transform.rotation.y, item.transform.rotation.z
    );
    const composedRotation = new Quat().mul2(rootRotation, localRotation).getEulerAngles();
    return {
      ...item,
      transform: transform({
        x: root.position.x + rotatedPosition.x,
        y: root.position.y + rotatedPosition.y,
        z: root.position.z + rotatedPosition.z
      }, { x: composedRotation.x, y: composedRotation.y, z: composedRotation.z }),
      metadata: {
        ...item.metadata,
        productionReference: true,
        sourcePrefabId: structure.definition.id,
        sourceBuilder: structure.definition.metadata.sourceBuilder,
        productionLocalTransform: item.transform
      }
    };
  });
  const waters = (structure.definition.waters ?? []).map((water) => {
    const local = water.position ?? { x: 0, y: 0, z: 0 };
    const rotated = rootRotation.transformVector(new Vec3(local.x, local.y, local.z), new Vec3());
    return {
      ...water,
      position: { x: root.position.x + rotated.x, y: root.position.y + rotated.y, z: root.position.z + rotated.z },
      rotation: { x: 0, y: root.rotation.y, z: 0 },
      metadata: { ...water.metadata, productionReference: true, sourcePrefabId: structure.definition.id }
    };
  });
  return { objects, waters };
}

const SHORE_BENCHES = Object.freeze({
  'shop-island': Object.freeze({ radial: 7.6, tangent: 8.8, towardCenter: false }),
  'aquarium-island': Object.freeze({ radial: 56, tangent: 24, towardCenter: false }),
  'cave-fishing-island': Object.freeze({ radial: 6.2, tangent: 8.3, towardCenter: false }),
  'normal-fishing-island': Object.freeze({ radial: -9.4, tangent: -1.4, towardCenter: false }),
  'cold-island': Object.freeze({ radial: 8.6, tangent: 1.8, towardCenter: true })
});

function addProductionShoreBench(objects, location, data) {
  const config = SHORE_BENCHES[location.id];
  if (!config) return;
  const angleRadians = location.angle * Math.PI / 180;
  const yaw = 90 - location.angle + (config.towardCenter ? 0 : 180);
  const localPoint = (radialDelta = 0, tangentDelta = 0) => ({
    x: Math.cos(angleRadians) * (config.radial + radialDelta) - Math.sin(angleRadians) * (config.tangent + tangentDelta),
    z: Math.sin(angleRadians) * (config.radial + radialDelta) + Math.cos(angleRadians) * (config.tangent + tangentDelta)
  });
  const globalPoint = (point) => ({ x: location.worldPosition.x + point.x, z: location.worldPosition.z + point.z });
  const center = localPoint();
  const yawRadians = yaw * Math.PI / 180;
  const legs = [-1, 1].map((side) => {
    const point = {
      x: center.x + Math.cos(yawRadians) * side * .88,
      z: center.z - Math.sin(yawRadians) * side * .88
    };
    const global = globalPoint(point);
    return {
      ...point, side,
      groundY: triangleSurfaceHeightAt(data.vertices, data.triangles, global.x, global.z, location.elevation + .08)
    };
  });
  const seatCenterY = Math.max(...legs.map((leg) => leg.groundY)) + .46;
  const benchId = `${location.id}-shore-bench`;
  const category = `${location.displayName} Seating / Benches`;
  const addBenchPart = (name, position, size, material, rotation = {}) => {
    addBox(objects, `${location.id.toUpperCase()}-BENCH`, name, position, size, material, rotation, true, category);
    Object.assign(objects.at(-1).metadata, {
      sourceBuilder: 'buildAuthoredIslandBench', componentName: `${location.displayName} Shore Bench`,
      benchId, facingYaw: yaw, facesToward: config.towardCenter ? 'pond' : 'ocean'
    });
  };
  const name = `${location.displayName} shore rest bench`;
  addBenchPart(`${name} seat`, { ...center, y: seatCenterY }, { x: 2.35, y: .18, z: .74 }, 'wood', { y: yaw });
  addBenchPart(`${name} back`, { ...localPoint(config.towardCenter ? .34 : -.34), y: seatCenterY + .47 },
    { x: 2.35, y: .78, z: .15 }, 'wood', { x: -7, y: yaw });
  for (const leg of legs) {
    const topY = seatCenterY - .05;
    const bottomY = leg.groundY - .04;
    addBenchPart(`${name} ${leg.side < 0 ? 'left' : 'right'} leg`,
      { x: leg.x, y: (topY + bottomY) * .5, z: leg.z },
      { x: .18, y: Math.max(.08, topY - bottomY), z: .42 }, 'wood', { y: yaw });
  }
}

function addMangroveFishingLog(objects, location) {
  if (location.id !== 'normal-fishing-island') return;
  const category = 'Mangrove Island Seating / Benches';
  const benchId = 'mangrove-lagoon-fishing-log';
  const addLogPart = (name, position, size, material, rotation, collision = true, type = 'cylinder') => {
    addBox(objects, 'MANGROVE-FISHING-LOG', name, position, size, material, rotation, collision, category, type);
    Object.assign(objects.at(-1).metadata, {
      sourceBuilder: 'buildOceanIsland', componentName: 'Mangrove Lagoon Fishing Log', benchId,
      facingYaw: 90, facesToward: 'amber-reed-pond'
    });
  };
  const logCenterY = location.elevation + .32;
  addLogPart('Mangrove Lagoon sit-and-fish log', { x: 9.25, y: logCenterY, z: 0 },
    { x: .72, y: 4.4, z: .72 }, 'wood', { x: 90 });
  for (const end of [-1, 1]) addLogPart(`Mangrove Lagoon log end ${end < 0 ? 'south' : 'north'}`,
    { x: 9.25, y: logCenterY, z: end * 2.18 }, { x: .62, y: .035, z: .62 }, 'trim', { x: 90 }, false);
}

function productionLandscapeReferences(location, data) {
  const objects = [];
  if (location.id === 'home-island') {
    const angle = HOME_CABIN_CONFIG.angle * Math.PI / 180;
    const localToIsland = (localX, localZ) => ({
      x: Math.sin(angle) * localX + Math.cos(angle) * localZ,
      z: -Math.cos(angle) * localX + Math.sin(angle) * localZ
    });
    const pond = localToIsland(7.8, 8.25);
    for (let index = 0; index < 9; index += 1) {
      const theta = (index * 41 + 14) * Math.PI / 180;
      let x = Math.cos(theta) * (10 + index % 3 * 2.2);
      let z = Math.sin(theta) * (7 + index % 2 * 2.4);
      const pondDistance = Math.hypot(x - pond.x, z - pond.z);
      if (pondDistance < 6.2) {
        const scale = 6.2 / Math.max(.01, pondDistance);
        x = pond.x + (x - pond.x) * scale;
        z = pond.z + (z - pond.z) * scale;
      }
      const size = .55 + index % 3 * .1;
      addBox(objects, 'HOME-LANDSCAPE', `Hearthward cozy tree ${index + 1} climbable trunk`,
        { x, y: location.elevation + .18 + 1.3 * size, z }, { x: .58 * size, y: 2.6 * size, z: .58 * size },
        'wood', {}, true, 'Hearthward Landscaping', 'cylinder');
      addBox(objects, 'HOME-LANDSCAPE', `Hearthward cozy tree ${index + 1} crown`,
        { x, y: location.elevation + .18 + 3.45 * size, z },
        { x: 2.1 * size, y: (index % 2 ? 1.7 : 3.4) * size, z: 2.1 * size },
        'plant', {}, false, 'Hearthward Landscaping', index % 2 ? 'sphere' : 'cone');
    }
  } else if (location.id === 'shop-island') {
    for (let index = 0; index < 6; index += 1) addBox(objects, 'SHOP-LANDSCAPE', `Shop cargo crate ${index + 1}`,
      { x: -8 + (index % 3) * 2.1, y: location.elevation + .66, z: -4 + Math.floor(index / 3) * 2 },
      { x: 1.45, y: .95, z: 1.45 }, 'wood', { y: index * 11 }, true, "Outfitter's Reach Landscaping");
  } else if (location.id === 'aquarium-island') {
    for (let index = 0; index < 18; index += 1) {
      const theta = index * Math.PI * 2 / 18;
      addBox(objects, 'AQUARIUM-LANDSCAPE', `Aquarium garden flower ${index + 1}`,
        { x: Math.cos(theta) * 16, y: location.elevation + .42, z: Math.sin(theta) * 11 },
        { x: .44, y: .64, z: .44 }, index % 2 ? 'accent' : 'plant', {}, false, 'Glasswater Landscaping', 'sphere');
    }
  }
  addProductionShoreBench(objects, location, data);
  addMangroveFishingLog(objects, location);
  return objects;
}

export function makeProductionIslandEditorLevel(worldOrId) {
  const worldId = typeof worldOrId === 'string' ? worldOrId : worldOrId?.id;
  const locationId = typeof worldOrId === 'string' ? worldOrId : (worldOrId?.runtimeLocationId || worldOrId?.id);
  const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === locationId);
  if (!location || !ISLAND_EDITOR_IDS.includes(location.id)) throw new Error(`No production-island editor adapter for ${locationId}.`);
  if (location.id === 'cave-fishing-island') return makeCleanCaveEditorLevel(worldOrId);
  const data = buildOceanIslandTerrainData(location);
  const positions = data.vertices.flatMap(([x, y, z]) => [x - location.worldPosition.x, y, z - location.worldPosition.z]);
  const dock = location.dock;
  const structure = structureReference(location);
  const composedStructure = composeProductionStructure(structure);
  const dockObjects = [];
  if (dock?.length > 0) dockObjects.push({
    id: `${location.id}-production-dock-reference`, name: `${location.displayName} production dock`,
    type: 'box', category: 'Dock / Arrival',
    transform: {
      position: {
        x: dock.worldPosition.x - location.worldPosition.x,
        y: dock.worldPosition.y - DOCK_DECK_LOWERING,
        z: dock.worldPosition.z - location.worldPosition.z
      },
      rotation: { x: 0, y: dock.facingYaw, z: 0 }, scale: { x: 1, y: 1, z: 1 }
    },
    size: { x: 3.4, y: .28, z: dock.length }, collision: true, visible: true,
    metadata: { productionReference: true, source: 'world-locations.js dock', materialKey: 'wood', authoredPrimitive: 'box' }
  });
  if (dock?.length > 0) {
    const theta = location.angle * Math.PI / 180;
    for (const side of [-1, 1]) for (const end of [-1, 1]) dockObjects.push({
      id: `${location.id}-production-dock-pile-${side}-${end}`,
      name: `${location.displayName} dock pile ${side}:${end}`, type: 'cylinder', category: 'Dock / Arrival',
      transform: transform({
        x: dock.worldPosition.x - location.worldPosition.x - Math.sin(theta) * side * 1.65 + Math.cos(theta) * end * dock.length * .38,
        y: OCEAN_SURFACE_Y - .18,
        z: dock.worldPosition.z - location.worldPosition.z + Math.cos(theta) * side * 1.65 + Math.sin(theta) * end * dock.length * .38
      }),
      size: { x: .28, y: 2.3, z: .28 }, collision: true, visible: true,
      metadata: { productionReference: true, source: 'buildTravelDocks', materialKey: 'wood', authoredPrimitive: 'cylinder' }
    });
  }
  const landscapeObjects = productionLandscapeReferences(location, data);
  return normalizeWorldEditorLevel({
    schema: 2, kind: 'reel-ascent-world-level', worldId,
    displayName: typeof worldOrId === 'string' ? location.displayName : (worldOrId?.label || location.displayName), runtimeLocationId: location.id, updatedAt: null,
    sourcePolicy: {
      terrain: 'production-generator', architecture: structure ? 'production-reference' : 'procedural-reference', waters: composedStructure.waters.length ? 'production-reference' : 'procedural-reference',
      objects: 'production-reference', movingPlatforms: 'authored', prefabs: 'authored'
    },
    terrain: {
      mode: 'production-island-terrain', format: 'triangle-mesh-v1', coordinateSpace: 'island-local',
      positions, indices: data.triangles.flat(),
      parts: [{ name: 'production island terrain / coast / submerged apron', firstVertex: 0, vertexCount: data.vertices.length, firstTriangle: 0, triangleCount: data.triangles.length }],
      metadata: { source: `buildOceanIslandTerrainData(${location.id})`, productionAuthoritative: true, oceanSurfaceY: OCEAN_SURFACE_Y }
    },
    waters: composedStructure.waters, objects: [...dockObjects, ...landscapeObjects, ...composedStructure.objects], movingPlatforms: [],
    prefabs: { definitions: [], instances: [] }, rooms: [],
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
  const productionObjects = generated.objects.filter((item) => item.metadata?.productionReference);
  level.objects ??= [];
  for (const item of productionObjects) {
    const index = level.objects.findIndex((entry) => entry.id === item.id);
    if (index < 0) level.objects.push(item);
  }
  level.prefabs ??= { definitions: [], instances: [] };
  const generatedProductionIds = new Set(productionObjects.map((item) => item.id));
  level.objects = level.objects.filter((item) => !item.metadata?.productionReference || generatedProductionIds.has(item.id));
  level.waters ??= [];
  const generatedProductionWaterIds = new Set((generated.waters ?? []).map((item) => String(item.id || item.identity)));
  level.waters = level.waters.filter((item) => !item.metadata?.productionReference || generatedProductionWaterIds.has(String(item.id || item.identity)));
  for (const water of generated.waters ?? []) {
    const id = String(water.id || water.identity);
    const index = level.waters.findIndex((item) => String(item.id || item.identity) === id);
    if (index < 0) level.waters.push(water);
  }
  level.prefabs.definitions = level.prefabs.definitions.filter((item) => !item.metadata?.productionReference);
  level.prefabs.instances = level.prefabs.instances.filter((item) => !item.metadata?.productionReference);
  for (const definition of generated.prefabs?.definitions ?? []) {
    const index = level.prefabs.definitions.findIndex((item) => item.id === definition.id);
    if (index < 0) level.prefabs.definitions.push(definition);
    else if (level.prefabs.definitions[index].metadata?.productionReference) level.prefabs.definitions[index] = definition;
  }
  for (const instance of generated.prefabs?.instances ?? []) {
    const index = level.prefabs.instances.findIndex((item) => item.id === instance.id);
    if (index < 0) level.prefabs.instances.push(instance);
    else if (level.prefabs.instances[index].metadata?.productionReference) level.prefabs.instances[index] = instance;
  }
  if (generated.objects.some((item) => item.metadata?.sourceBuilder)) level.sourcePolicy = {
    ...level.sourcePolicy, architecture: 'production-reference', objects: 'production-reference',
    waters: generated.waters.length ? 'production-reference' : level.sourcePolicy?.waters,
    prefabs: 'authored'
  };
  return level;
}
