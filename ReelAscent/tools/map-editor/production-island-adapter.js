import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import { buildOceanIslandTerrainData, OCEAN_SURFACE_Y } from '../../src/world/mountain-v2.js';
import { normalizeWorldEditorLevel } from './world-level-format.js';

const ISLAND_EDITOR_IDS = Object.freeze([
  'home-island', 'shop-island', 'aquarium-island', 'cave-fishing-island',
  'normal-fishing-island', 'cold-island', 'skyreach-foundation'
]);

export function productionIslandEditorIds() { return [...ISLAND_EDITOR_IDS]; }

export function makeProductionIslandEditorLevel(worldOrId) {
  const worldId = typeof worldOrId === 'string' ? worldOrId : worldOrId?.id;
  const locationId = typeof worldOrId === 'string' ? worldOrId : (worldOrId?.runtimeLocationId || worldOrId?.id);
  const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === locationId);
  if (!location || !ISLAND_EDITOR_IDS.includes(location.id)) throw new Error(`No production-island editor adapter for ${locationId}.`);
  const data = buildOceanIslandTerrainData(location);
  const positions = data.vertices.flatMap(([x, y, z]) => [x - location.worldPosition.x, y, z - location.worldPosition.z]);
  const dock = location.dock;
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
      terrain: 'production-generator', architecture: 'procedural-reference', waters: 'procedural-reference',
      objects: 'production-reference', movingPlatforms: 'authored', prefabs: 'authored'
    },
    terrain: {
      mode: 'production-island-terrain', format: 'triangle-mesh-v1', coordinateSpace: 'island-local',
      positions, indices: data.triangles.flat(),
      parts: [{ name: 'production island terrain / coast / submerged apron', firstVertex: 0, vertexCount: data.vertices.length, firstTriangle: 0, triangleCount: data.triangles.length }],
      metadata: { source: `buildOceanIslandTerrainData(${location.id})`, productionAuthoritative: true, oceanSurfaceY: OCEAN_SURFACE_Y }
    },
    waters: [], objects: dockObject ? [dockObject] : [], movingPlatforms: [],
    prefabs: { definitions: [], instances: [] }, rooms: [],
    metadata: {
      productionIslandAdapter: true, theme: location.theme, functions: [...location.functions],
      globalOrigin: { ...location.worldPosition }, note: 'Terrain is exact production generator output. Procedural decorations remain runtime references until authored adapters are added.'
    }
  }, { worldId, displayName: typeof worldOrId === 'string' ? location.displayName : (worldOrId?.label || location.displayName), runtimeLocationId: location.id });
}

export function ensureProductionIslandTerrain(level, worldOrId) {
  if (level?.terrain?.positions?.length && level?.terrain?.indices?.length) return level;
  const generated = makeProductionIslandEditorLevel(worldOrId);
  level.terrain = generated.terrain;
  level.sourcePolicy = { ...level.sourcePolicy, terrain: 'production-generator' };
  level.metadata = {
    ...level.metadata,
    productionIslandAdapter: true,
    productionIslandTerrainSource: generated.terrain.metadata.source,
    globalOrigin: generated.metadata.globalOrigin
  };
  const dock = generated.objects.find((item) => item.metadata?.productionReference);
  if (dock && !(level.objects ?? []).some((item) => item.id === dock.id)) level.objects.push(dock);
  return level;
}
