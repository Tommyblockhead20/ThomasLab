import { normalizeWorldEditorLevel } from '../../src/world/world-editor-v2-runtime.js';
import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import { buildOceanIslandTerrainData } from '../../src/world/mountain-v2.js';
import { stockLibraryScene } from '../../src/world/library-shelf-stocking.js';

export const LIBRARY_SCENE_SCHEMA = 'reel-ascent-authored-scene-v2';
export const LIBRARY_WORLD_ID = 'library-island';
export const LIBRARY_SCENE_FILENAME = 'library-island-v2.scene.json';
export const LIBRARY_WATER_IDS = Object.freeze([
  'athenaeum-grand-canal',
  'athenaeum-atrium-basin',
  'athenaeum-hidden-archive-pool'
]);

const clone = (value) => value == null ? value : structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const vector = (value, fallback = [0, 0, 0]) => [0, 1, 2].map((index) => finite(value?.[index], fallback[index]));
const objectVector = (value, fallback = [0, 0, 0]) => ({
  x: finite(value?.[0] ?? value?.x, fallback[0]),
  y: finite(value?.[1] ?? value?.y, fallback[1]),
  z: finite(value?.[2] ?? value?.z, fallback[2])
});
const arrayVector = (value, fallback = [0, 0, 0]) => [
  finite(value?.x ?? value?.[0], fallback[0]),
  finite(value?.y ?? value?.[1], fallback[1]),
  finite(value?.z ?? value?.[2], fallback[2])
];

export function isLibraryAuthoredScene(value) {
  return value?.schema === LIBRARY_SCENE_SCHEMA && value?.locationId === 'veiled-athenaeum';
}

export function librarySceneLocalToEditor(value) { return objectVector(value); }
export function libraryEditorToSceneLocal(value) { return arrayVector(value); }

export function libraryProductionTerrain() {
  const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === 'veiled-athenaeum');
  if (!location) return null;
  const source = buildOceanIslandTerrainData(location);
  const floorY = location.elevation + 1.28;
  const yaw = (90 - location.angle) * Math.PI / 180;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const positions = [];
  for (const [worldX, worldY, worldZ] of source.vertices) {
    const dx = worldX - location.worldPosition.x;
    const dz = worldZ - location.worldPosition.z;
    positions.push(dx * cos - dz * sin, worldY - floorY, dx * sin + dz * cos);
  }
  return {
    mode: 'production-island-terrain', format: 'triangle-mesh-v1', coordinateSpace: 'library-root-local',
    positions, indices: source.triangles.flat(),
    parts: [{ name: 'full island terrain / coastline / submerged apron', firstVertex: 0, vertexCount: source.vertices.length, firstTriangle: 0, triangleCount: source.triangles.length }],
    metadata: {
      source: 'buildOceanIslandTerrainData(veiled-athenaeum)', productionAuthoritative: true,
      locationId: location.id, rootFloorY: floorY, rootYawDegrees: 90 - location.angle
    }
  };
}

function architectureGroup(part = {}) {
  const text = `${part.id ?? ''} ${part.name ?? ''}`.toLowerCase();
  if (part.material === 'mist') return 'Atmosphere';
  if (['water', 'waterBright'].includes(part.material)) {
    return /fall|cascade/.test(text) ? 'Waterfalls / Decorative Water' : 'Decorative Water';
  }
  if (['leaf', 'leafLight', 'flower', 'stoneMoss'].includes(part.material)
    || /garden|tree|vine|planter|moss|flower/.test(text)) return 'Landscaping';
  if (/stair|step|landing/.test(text)) return 'Stairs';
  if (/ceiling|roof|soffit/.test(text)) return 'Ceilings';
  if (/floor|slab|deck|platform/.test(text)) return 'Floors';
  if (/shelf|bookcase|archive bay/.test(text)) return 'Shelves';
  if (/chair|bench|table|desk|couch|lectern|cabinet|furniture/.test(text)) return 'Furniture';
  if (/arrival|dock|entry|foyer/.test(text)) return 'Architecture — Arrival / Entrance';
  if (/grand|reading|hall/.test(text)) return 'Grand Reading Areas';
  if (/hidden|secret/.test(text)) return 'Hidden Archive Areas';
  if (/archive|shelf|collection/.test(text)) return 'Archive Areas';
  if (/atrium|waterfall/.test(text)) return 'Waterfall Atrium';
  if (/study|desk|quiet/.test(text)) return 'Study Areas';
  if (/upper|gallery|balcony|terrace/.test(text)) return 'Upper Galleries';
  if (/bridge|canal|walkway/.test(text)) return 'Bridges / Terraces';
  return 'Architecture';
}

function partToObject(part, { sourceKind = 'part', sourceIndex = 0, prefix = '' } = {}) {
  const id = String(part.id || `${prefix || sourceKind}-part-${String(sourceIndex + 1).padStart(3, '0')}`);
  return {
    id,
    name: String(part.name || id),
    type: String(part.type || 'box'),
    category: architectureGroup(part),
    transform: {
      position: objectVector(part.position),
      rotation: objectVector(part.rotation),
      scale: { x: 1, y: 1, z: 1 }
    },
    size: objectVector(part.size, [1, 1, 1]),
    collision: part.solid !== false,
    visible: part.visible !== false,
    metadata: {
      librarySourceKind: sourceKind,
      librarySourceId: part.id || id,
      librarySourceHadId: Boolean(part.id),
      librarySourceIndex: sourceIndex,
      materialKey: part.material || 'stone',
      materialRole: part.material || 'stone',
      authoredPrimitive: part.type || 'box'
    }
  };
}

function helperToObject(item, sourceKind, sourceIndex) {
  const sizes = {
    light: [.45, .45, .45], marker: [.52, .9, .52], bench: [2.05, .82, .5]
  };
  const categories = { light: 'Lights', marker: 'Markers / Interactions', bench: 'Benches' };
  const materialKey = sourceKind === 'light' ? 'warmGlow' : sourceKind === 'bench' ? 'wood' : 'coolGlow';
  return {
    id: String(item.id),
    name: String(item.name || item.label || item.id),
    type: `${sourceKind}-helper`,
    category: categories[sourceKind],
    transform: {
      position: objectVector(item.position),
      rotation: { x: 0, y: finite(item.facingYaw), z: 0 },
      scale: { x: 1, y: 1, z: 1 }
    },
    size: objectVector(sizes[sourceKind], [1, 1, 1]),
    collision: sourceKind === 'bench',
    visible: true,
    metadata: {
      librarySourceKind: sourceKind,
      librarySourceId: item.id,
      librarySourceIndex: sourceIndex,
      materialKey,
      markerKind: item.kind ?? null,
      lightType: item.type ?? null,
      lightColor: clone(item.color ?? null),
      lightIntensity: item.intensity ?? null,
      lightRange: item.range ?? null,
      interactionLabel: item.label ?? null,
      seatKind: item.seatKind ?? null,
      fishingFacing: item.fishingFacing ?? null
    }
  };
}

function waterToEditor(water, index, sourceCollection = 'waters') {
  const surfaceY = finite(water.surfaceLocalY);
  const depth = Math.max(.05, surfaceY - finite(water.floorLocalY, surfaceY - .7));
  let position;
  let radii;
  const metadata = {
    librarySourceKind: 'water', librarySourceId: water.id, librarySourceIndex: index, librarySourceCollection: sourceCollection,
    libraryWaterShape: water.shape || 'ellipse',
    pathLocal: clone(water.pathLocal ?? null), pathWidth: water.pathWidth ?? null,
    fishIds: clone(water.fishIds ?? []), waterType: water.waterType, theme: water.theme,
    closedLoop: water.closedLoop ?? null, flowSpeed: water.flowSpeed ?? null,
    flowDirection: water.flowDirection ?? null, fishable: water.fishable ?? null,
    rideable: water.rideable ?? null
  };
  if (water.shape === 'path' && Array.isArray(water.pathLocal) && water.pathLocal.length) {
    const xs = water.pathLocal.map((point) => finite(point?.[0]));
    const zs = water.pathLocal.map((point) => finite(point?.[1]));
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    position = { x: (minX + maxX) / 2, y: surfaceY, z: (minZ + maxZ) / 2 };
    radii = { x: Math.max(.1, finite(water.pathWidth, 1.25)), z: Math.max(.1, (maxZ - minZ) / 2) };
    metadata.pathOriginalCenter = [position.x, position.z];
    metadata.pathOriginalRadii = [radii.x, radii.z];
  } else {
    position = { x: finite(water.centerLocal?.[0]), y: surfaceY, z: finite(water.centerLocal?.[1]) };
    radii = { x: Math.max(.1, finite(water.radii?.[0], 2.5)), z: Math.max(.1, finite(water.radii?.[1], 2.5)) };
  }
  return {
    id: String(water.id), identity: String(water.id), name: String(water.label || water.id),
    shape: water.shape || 'ellipse', position, radii, depthMeters: depth,
    fishingZoneScale: Math.max(.05, finite(water.fishingZoneScale, 1)),
    swimmable: water.swimmable === true, metadata
  };
}

function prefabDefinitionToEditor(id, prefab) {
  return {
    id, name: prefab.name || id, kind: 'library-authored-prefab', version: prefab.version || 1,
    objects: (prefab.parts ?? []).map((part, index) => partToObject(part, {
      sourceKind: 'prefab-part', sourceIndex: index, prefix: id
    })),
    movingPlatforms: [], waters: [],
    metadata: { librarySourceKind: 'prefab-definition', librarySourceId: id, authoredPrefabMetadata: clone(prefab.metadata ?? {}) }
  };
}

function prefabInstanceToEditor(instance, index) {
  return {
    id: String(instance.id), name: String(instance.name || instance.id), prefabId: String(instance.prefab), linked: true,
    transform: {
      position: objectVector(instance.position), rotation: objectVector(instance.rotation),
      scale: objectVector(instance.scale, [1, 1, 1])
    },
    metadata: { librarySourceKind: 'prefab-instance', librarySourceId: instance.id, librarySourceIndex: index }
  };
}

export function adaptLibrarySceneToEditor(scene) {
  if (!isLibraryAuthoredScene(scene)) throw new Error(`Expected ${LIBRARY_SCENE_SCHEMA} for veiled-athenaeum.`);
  const source = stockLibraryScene(scene, { density: .92 });
  const input = {
    worldId: LIBRARY_WORLD_ID,
    displayName: 'LIBRARY ISLAND / VEILED ATHENAEUM',
    runtimeLocationId: 'veiled-athenaeum',
    sourcePolicy: {
      terrain: 'production-generator', architecture: 'authored-scene', waters: 'authored-scene',
      objects: 'authored-scene', movingPlatforms: 'authored-scene', prefabs: 'authored-scene'
    },
    terrain: libraryProductionTerrain(),
    waters: [
      ...(source.waters ?? []).map((water, index) => waterToEditor(water, index, 'waters')),
      ...(source.rideWaters ?? []).map((water, index) => waterToEditor(water, index, 'rideWaters'))
    ],
    objects: [
      ...(source.parts ?? []).map((part, index) => partToObject(part, { sourceIndex: index })),
      ...(source.lights ?? []).map((item, index) => helperToObject(item, 'light', index)),
      ...(source.markers ?? []).map((item, index) => helperToObject(item, 'marker', index)),
      ...(source.benches ?? []).map((item, index) => helperToObject(item, 'bench', index))
    ],
    movingPlatforms: [],
    prefabs: {
      definitions: Object.entries(source.prefabs ?? {}).map(([id, prefab]) => prefabDefinitionToEditor(id, prefab)),
      instances: (source.instances ?? []).map(prefabInstanceToEditor)
    },
    rooms: [],
    // Keep the untouched authored source for lossless save/export. The editor and
    // production runtime both derive the dense shelf variant from that same source.
    librarySceneSource: clone(scene),
    metadata: {
      libraryAuthoredScene: true, authoredSceneId: source.sceneId, authoredSceneVersion: source.version,
      productionPath: 'src/world/library-island-v2.scene.json'
    }
  };
  return normalizeWorldEditorLevel(input, {
    worldId: LIBRARY_WORLD_ID, displayName: input.displayName, runtimeLocationId: input.runtimeLocationId
  });
}

function objectToPart(object, sourceById = new Map()) {
  const base = clone(sourceById.get(object.metadata?.librarySourceId) ?? {});
  const result = { ...base };
  const generatedSourceId = String(object.metadata?.librarySourceId || '');
  if (object.metadata?.librarySourceHadId || String(object.id) !== generatedSourceId) result.id = String(object.id);
  else delete result.id;
  if (String(object.name || object.id) !== String(base.name || generatedSourceId)) result.name = String(object.name || object.id);
  const type = String(object.metadata?.authoredPrimitive || object.type || base.type || 'box').replace('-helper', '');
  if (type !== String(base.type || 'box')) result.type = type;
  else if (!Object.hasOwn(base, 'type')) delete result.type;
  const position = arrayVector(object.transform?.position);
  if (JSON.stringify(position) !== JSON.stringify(vector(base.position))) result.position = position;
  const size = arrayVector(object.size, [1, 1, 1]);
  if (JSON.stringify(size) !== JSON.stringify(vector(base.size, [1, 1, 1]))) result.size = size;
  const rotation = arrayVector(object.transform?.rotation);
  if (JSON.stringify(rotation) !== JSON.stringify(vector(base.rotation))) result.rotation = rotation;
  else if (!Object.hasOwn(base, 'rotation')) delete result.rotation;
  const material = object.metadata?.materialKey || base.material || 'stone';
  if (material !== base.material) result.material = material;
  if (object.collision === false) result.solid = false;
  else if (base.solid === false) delete result.solid;
  return result;
}

function objectToHelper(object, sourceById, sourceKind) {
  const base = clone(sourceById.get(object.metadata?.librarySourceId) ?? {});
  const result = {
    ...base, id: String(object.id),
    position: arrayVector(object.transform?.position)
  };
  if (object.name) {
    if (sourceKind === 'light') result.name = object.name;
    else result.label = object.name;
  }
  if (sourceKind === 'light') {
    result.type = object.metadata?.lightType || base.type || 'omni';
    result.color = clone(object.metadata?.lightColor ?? base.color ?? [1, 1, 1]);
    result.intensity = finite(object.metadata?.lightIntensity, base.intensity ?? 1);
    result.range = finite(object.metadata?.lightRange, base.range ?? 10);
  } else {
    result.facingYaw = finite(object.transform?.rotation?.y, base.facingYaw ?? 0);
    if (sourceKind === 'marker') result.kind = object.metadata?.markerKind || base.kind || 'interaction';
    if (sourceKind === 'bench') {
      result.seatKind = object.metadata?.seatKind || base.seatKind || 'reading bench';
      if (object.metadata?.fishingFacing) result.fishingFacing = object.metadata.fishingFacing;
    }
  }
  return result;
}

function editorWaterToScene(water, sourceById) {
  const base = clone(sourceById.get(water.metadata?.librarySourceId) ?? {});
  const surface = finite(water.position?.y, base.surfaceLocalY ?? 0);
  const result = {
    ...base, id: String(water.id), label: String(water.name || base.label || water.id),
    surfaceLocalY: surface, floorLocalY: surface - Math.max(.05, finite(water.depthMeters, .7))
  };
  const fishingScale = Math.max(.05, finite(water.fishingZoneScale, 1));
  if (fishingScale !== finite(base.fishingZoneScale, 1)) result.fishingZoneScale = fishingScale;
  else if (!Object.hasOwn(base, 'fishingZoneScale')) delete result.fishingZoneScale;
  if ((water.metadata?.libraryWaterShape || water.shape) === 'path') {
    const original = clone(water.metadata?.pathLocal ?? base.pathLocal ?? []);
    const oldCenter = water.metadata?.pathOriginalCenter ?? [0, 0];
    const oldRadii = water.metadata?.pathOriginalRadii ?? [base.pathWidth || 1, 1];
    const sx = Math.max(.01, finite(water.radii?.x, oldRadii[0])) / Math.max(.01, finite(oldRadii[0], 1));
    const sz = Math.max(.01, finite(water.radii?.z, oldRadii[1])) / Math.max(.01, finite(oldRadii[1], 1));
    result.shape = 'path';
    result.pathWidth = Math.max(.1, finite(water.radii?.x, base.pathWidth || 1.25));
    result.pathLocal = original.map((point) => [
      Math.round((finite(water.position?.x) + (finite(point?.[0]) - finite(oldCenter[0])) * sx) * 1e9) / 1e9,
      Math.round((finite(water.position?.z) + (finite(point?.[1]) - finite(oldCenter[1])) * sz) * 1e9) / 1e9
    ]);
    result.waterType = water.metadata?.waterType || base.waterType;
    if (water.metadata?.closedLoop != null || base.closedLoop != null) result.closedLoop = water.metadata?.closedLoop === true;
    if (water.metadata?.flowSpeed != null || base.flowSpeed != null) result.flowSpeed = Math.max(0, finite(water.metadata?.flowSpeed, base.flowSpeed ?? 0));
    if (water.metadata?.flowDirection != null || base.flowDirection != null) result.flowDirection = water.metadata?.flowDirection === -1 ? -1 : 1;
    if (water.metadata?.fishable != null || base.fishable != null) result.fishable = water.metadata?.fishable !== false;
    if (water.metadata?.rideable != null || base.rideable != null) result.rideable = water.metadata?.rideable === true;
    delete result.centerLocal;
    delete result.radii;
  } else {
    result.shape = 'ellipse';
    result.centerLocal = [finite(water.position?.x), finite(water.position?.z)];
    result.radii = [Math.max(.1, finite(water.radii?.x, 2.5)), Math.max(.1, finite(water.radii?.z, 2.5))];
    delete result.pathLocal;
    delete result.pathWidth;
  }
  return result;
}

export function serializeLibrarySceneFromEditor(level) {
  const source = clone(level?.librarySceneSource);
  if (!isLibraryAuthoredScene(source)) throw new Error('Library editor level is missing its authoritative scene source.');
  const stockedBaseline = stockLibraryScene(source, { density: .92 });
  const sourceMaps = {
    part: new Map((source.parts ?? []).map((item) => [item.id, item])),
    light: new Map((source.lights ?? []).map((item) => [item.id, item])),
    marker: new Map((source.markers ?? []).map((item) => [item.id, item])),
    bench: new Map((source.benches ?? []).map((item) => [item.id, item])),
    water: new Map([...(source.waters ?? []), ...(source.rideWaters ?? [])].map((item) => [item.id, item])),
    instance: new Map((source.instances ?? []).map((item) => [item.id, item]))
  };
  const byKind = (kind) => (level.objects ?? []).filter((item) => item.metadata?.librarySourceKind === kind);
  source.parts = byKind('part').map((item) => objectToPart(item, sourceMaps.part));
  source.lights = byKind('light').map((item) => objectToHelper(item, sourceMaps.light, 'light'));
  source.markers = byKind('marker').map((item) => objectToHelper(item, sourceMaps.marker, 'marker'));
  source.benches = byKind('bench').map((item) => objectToHelper(item, sourceMaps.bench, 'bench'));
  source.waters = (level.waters ?? []).filter((item) => item.metadata?.librarySourceCollection !== 'rideWaters')
    .map((item) => editorWaterToScene(item, sourceMaps.water));
  source.rideWaters = (level.waters ?? []).filter((item) => item.metadata?.librarySourceCollection === 'rideWaters')
    .map((item) => editorWaterToScene(item, sourceMaps.water));
  source.prefabs = Object.fromEntries((level.prefabs?.definitions ?? []).map((definition) => {
    const base = clone(source.prefabs?.[definition.metadata?.librarySourceId || definition.id] ?? {});
    const baselinePrefab = clone(stockedBaseline.prefabs?.[definition.metadata?.librarySourceId || definition.id] ?? base);
    const originalParts = new Map((baselinePrefab.parts ?? []).map((part, index) => [part.id || `${definition.id}-part-${String(index + 1).padStart(3, '0')}`, part]));
    const result = {
      ...base,
      parts: (definition.objects ?? []).map((object) => {
        return objectToPart(object, originalParts);
      })
    };
    if (definition.name && definition.name !== (base.name || definition.id)) result.name = definition.name;
    if (base.version != null || (definition.version ?? 1) !== 1) result.version = definition.version ?? base.version;
    const authoredMetadata = definition.metadata?.authoredPrefabMetadata;
    if (authoredMetadata && JSON.stringify(authoredMetadata) !== JSON.stringify(base.metadata ?? {})) result.metadata = clone(authoredMetadata);
    // Dense default stocking is a derived presentation/runtime layer. If the user
    // has not edited that generated definition, export the original authored
    // prefab exactly so an open/save cycle stays lossless.
    if (JSON.stringify(result) === JSON.stringify(baselinePrefab)) return [definition.id, base];
    return [definition.id, result];
  }));
  source.instances = (level.prefabs?.instances ?? []).map((instance) => {
    const base = clone(sourceMaps.instance.get(instance.metadata?.librarySourceId) ?? {});
    const result = { ...base, id: String(instance.id), prefab: String(instance.prefabId) };
    const position = arrayVector(instance.transform?.position);
    const rotation = arrayVector(instance.transform?.rotation);
    const scale = arrayVector(instance.transform?.scale, [1, 1, 1]);
    if (JSON.stringify(position) !== JSON.stringify(vector(base.position))) result.position = position;
    if (JSON.stringify(rotation) !== JSON.stringify(vector(base.rotation))) result.rotation = rotation;
    else if (!Object.hasOwn(base, 'rotation')) delete result.rotation;
    if (JSON.stringify(scale) !== JSON.stringify(vector(base.scale, [1, 1, 1]))) result.scale = scale;
    else if (!Object.hasOwn(base, 'scale')) delete result.scale;
    return result;
  });
  source.version = Math.max(1, Math.trunc(finite(source.version, 1)));
  return source;
}

export function normalizeLibraryEditorPayload(payload) {
  if (isLibraryAuthoredScene(payload)) return adaptLibrarySceneToEditor(payload);
  if (payload?.metadata?.libraryAuthoredScene && isLibraryAuthoredScene(payload.librarySceneSource)) {
    const normalized = normalizeWorldEditorLevel(payload);
    const adapted = adaptLibrarySceneToEditor(serializeLibrarySceneFromEditor(normalized));
    if (normalized.terrain?.mode === 'production-island-terrain' && normalized.terrain?.positions?.length) {
      adapted.terrain = clone(normalized.terrain);
    }
    return adapted;
  }
  throw new Error('This file is not a Veiled Athenaeum authored scene or compatible editor autosave.');
}

export function validateLibraryAuthoredScene(scene) {
  const issues = [];
  const ids = new Map();
  const addId = (item, group) => {
    const id = String(item?.id || '');
    if (!id) issues.push({ severity: 'error', message: `${group} entry is missing a stable id.` });
    else if (ids.has(id)) issues.push({ severity: 'error', message: `Duplicate stable id ${id} (${ids.get(id)} and ${group}).` });
    else ids.set(id, group);
  };
  if (!isLibraryAuthoredScene(scene)) issues.push({ severity: 'error', message: `Expected ${LIBRARY_SCENE_SCHEMA} targeting veiled-athenaeum.` });
  for (const [group, list] of Object.entries({
    parts: scene?.parts, instances: scene?.instances, waters: scene?.waters, rideWaters: scene?.rideWaters,
    lights: scene?.lights, markers: scene?.markers, benches: scene?.benches
  })) for (const item of list ?? []) addId(item, group);
  const materials = new Set(Object.keys(scene?.materials ?? {}));
  const checkPart = (part, label) => {
    if (!materials.has(part.material)) issues.push({ severity: 'error', message: `${label} references missing material ${part.material}.` });
    if (!vector(part.position).every(Number.isFinite) || !vector(part.size, [1, 1, 1]).every((value) => Number.isFinite(value) && value > 0)) {
      issues.push({ severity: 'error', message: `${label} has a malformed transform or size.` });
    }
    if (!['box', 'sphere', 'cylinder', 'cone', 'capsule'].includes(part.type || 'box')) {
      issues.push({ severity: 'warning', message: `${label} uses unsupported primitive ${part.type}.` });
    }
  };
  for (const part of scene?.parts ?? []) checkPart(part, `Part ${part.id}`);
  for (const [id, prefab] of Object.entries(scene?.prefabs ?? {})) {
    for (const [index, part] of (prefab.parts ?? []).entries()) checkPart(part, `Prefab ${id} part ${index + 1}`);
  }
  const prefabs = new Set(Object.keys(scene?.prefabs ?? {}));
  for (const instance of scene?.instances ?? []) {
    if (!prefabs.has(instance.prefab)) issues.push({ severity: 'error', message: `Prefab instance ${instance.id} references missing definition ${instance.prefab}.` });
    if (!Array.isArray(instance.position) || !vector(instance.position).every(Number.isFinite)) {
      issues.push({ severity: 'error', message: `Prefab instance ${instance.id} has a malformed transform.` });
    }
  }
  const waters = new Set((scene?.waters ?? []).map((item) => item.id));
  for (const id of LIBRARY_WATER_IDS) if (!waters.has(id)) issues.push({ severity: 'error', message: `Canonical fishing water ${id} is missing.` });
  for (const water of [...(scene?.waters ?? []), ...(scene?.rideWaters ?? [])]) {
    if (!(finite(water.surfaceLocalY) > finite(water.floorLocalY))) issues.push({ severity: 'error', message: `Water ${water.id} has invalid depth.` });
    if (water.shape === 'path' && (!(finite(water.pathWidth) > 0) || (water.pathLocal?.length ?? 0) < 2)) {
      issues.push({ severity: 'error', message: `Path water ${water.id} has invalid dimensions.` });
    }
    if (water.shape !== 'path' && (!Array.isArray(water.radii) || water.radii.some((value) => !(finite(value) > 0)))) {
      issues.push({ severity: 'error', message: `Water ${water.id} has invalid radii.` });
    }
  }
  for (const light of scene?.lights ?? []) {
    if (!Array.isArray(light.position) || !vector(light.position).every(Number.isFinite)
      || !Array.isArray(light.color) || light.color.length < 3 || light.color.some((value) => !Number.isFinite(Number(value)))
      || !(finite(light.intensity) >= 0) || !(finite(light.range) > 0)) {
      issues.push({ severity: 'error', message: `Light ${light.id} has invalid position, color, intensity, or range.` });
    }
  }
  for (const item of [...(scene?.markers ?? []), ...(scene?.benches ?? [])]) {
    if (!Array.isArray(item.position) || !vector(item.position).every(Number.isFinite)) {
      issues.push({ severity: 'error', message: `${item.id} has a malformed position.` });
    }
  }
  for (const bench of scene?.benches ?? []) if (bench.fishingFacing && !waters.has(bench.fishingFacing)) {
    issues.push({ severity: 'error', message: `Bench ${bench.id} references missing water ${bench.fishingFacing}.` });
  }
  return issues;
}
