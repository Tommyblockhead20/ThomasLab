import { serializeLibrarySceneFromEditor, validateLibraryAuthoredScene } from './library-scene-adapter.js';

function issue(severity, code, message, { objectId = null, objectType = null, worldId = null } = {}) {
  return { severity, code, message, objectId, objectType, worldId };
}

export function validateWorldLevel(level) {
  const warnings = [];
  const worldId = level?.worldId ?? null;
  if (worldId === 'library-island' && level?.metadata?.libraryAuthoredScene) {
    try {
      for (const item of validateLibraryAuthoredScene(serializeLibrarySceneFromEditor(level))) {
        warnings.push(issue(item.severity, 'library-authored-scene', item.message, { worldId }));
      }
    } catch (error) {
      warnings.push(issue('error', 'library-adapter', error?.message || String(error), { worldId }));
    }
  }
  const seen = new Map();
  const records = [
    ...(level?.objects ?? []),
    ...(level?.movingPlatforms ?? []),
    ...(level?.waters ?? []),
    ...(level?.prefabs?.definitions ?? []),
    ...(level?.prefabs?.instances ?? []),
    ...(level?.rooms ?? [])
  ];
  for (const record of records) {
    const id = record?.id ?? record?.identity;
    if (!id) warnings.push(issue('error', 'missing-id', 'Authored record has no stable ID.', { worldId }));
    else if (seen.has(id)) warnings.push(issue('error', 'duplicate-id', `Duplicate ID: ${id}`, { objectId: id, worldId }));
    else seen.set(id, record);
  }

  const objectIds = new Set([
    ...(level?.objects ?? []).map((item) => item.id),
    ...(level?.movingPlatforms ?? []).map((item) => item.id),
    ...(level?.prefabs?.instances ?? []).map((item) => item.id),
    ...(level?.rooms ?? []).map((item) => item.id)
  ].filter(Boolean));
  for (const item of [...(level?.objects ?? []), ...(level?.movingPlatforms ?? [])]) {
    if (item.parentId && !objectIds.has(item.parentId)) {
      warnings.push(issue('warning', 'missing-parent', `${item.name || item.id} references missing parent ${item.parentId}.`, { objectId: item.id, objectType: item.type, worldId }));
    }
  }

  for (const item of level?.objects ?? []) {
    if (item.visible !== false && item.collision === false && item.category === 'parkour') {
      warnings.push(issue('info', 'visible-no-collider', `${item.name || item.id} is visible parkour geometry with collision disabled.`, { objectId: item.id, objectType: item.type, worldId }));
    }
    const p = item.transform?.position;
    if (p && [p.x, p.y, p.z].some((value) => !Number.isFinite(Number(value)))) {
      warnings.push(issue('error', 'invalid-transform', `${item.name || item.id} has a non-finite position.`, { objectId: item.id, objectType: item.type, worldId }));
    }
  }
  for (const item of level?.movingPlatforms ?? []) {
    if (!Array.isArray(item.path?.points) || item.path.points.length < 2) {
      warnings.push(issue('error', 'moving-path', `${item.name || item.id} needs at least two path points.`, { objectId: item.id, objectType: 'moving-platform', worldId }));
    }
    if (!(Number(item.path?.speed) > 0)) warnings.push(issue('error', 'moving-speed', `${item.name || item.id} has an invalid speed.`, { objectId: item.id, objectType: 'moving-platform', worldId }));
  }

  for (const water of level?.waters ?? []) {
    const id = String(water.id || water.identity || 'water');
    const rx = Number(water?.radii?.x);
    const rz = Number(water?.radii?.z);
    if (!(rx > 0) || !(rz > 0)) warnings.push(issue('error', 'water-dimensions', `${water.name || id} has invalid water radii.`, { objectId: id, objectType: 'water', worldId }));
    if (water.depthMeters != null && !(Number(water.depthMeters) > 0)) warnings.push(issue('error', 'water-depth', `${water.name || id} has invalid depth.`, { objectId: id, objectType: 'water', worldId }));
    if (water.fishingZoneScale != null && !(Number(water.fishingZoneScale) > 0)) warnings.push(issue('error', 'water-fishing-scale', `${water.name || id} has an invalid fishing-zone scale.`, { objectId: id, objectType: 'water', worldId }));
  }

  const definitions = new Map((level?.prefabs?.definitions ?? []).map((item) => [item.id, item]));
  for (const definition of definitions.values()) {
    const childIds = new Set();
    for (const child of [...(definition.objects ?? []), ...(definition.movingPlatforms ?? []), ...(definition.waters ?? [])]) {
      const childId = child.id ?? child.identity;
      if (!childId) warnings.push(issue('error', 'prefab-child-id', `${definition.name || definition.id} contains a child without a stable ID.`, { objectId: definition.id, objectType: 'prefab-definition', worldId }));
      else if (childIds.has(childId)) warnings.push(issue('error', 'prefab-child-duplicate', `${definition.name || definition.id} has duplicate child ID ${childId}.`, { objectId: definition.id, objectType: 'prefab-definition', worldId }));
      else childIds.add(childId);
    }
  }
  for (const instance of level?.prefabs?.instances ?? []) {
    if (!definitions.has(instance.prefabId)) warnings.push(issue('error', 'missing-prefab', `${instance.name || instance.id} references missing prefab ${instance.prefabId}.`, { objectId: instance.id, objectType: 'prefab-instance', worldId }));
  }
  for (const room of level?.rooms ?? []) {
    const definition = definitions.get(room.prefabId);
    if (!definition) warnings.push(issue('error', 'missing-room-prefab', `${room.name || room.id} references missing room prefab ${room.prefabId}.`, { objectId: room.id, objectType: 'room', worldId }));
    else if (definition.kind !== 'room') warnings.push(issue('info', 'room-kind', `${room.name || room.id} uses prefab ${room.prefabId}, which is not tagged kind=room.`, { objectId: room.id, objectType: 'room', worldId }));
  }

  for (const [category, policy] of Object.entries(level?.sourcePolicy ?? {})) {
    if (policy === 'hybrid') warnings.push(issue('info', 'hybrid-source', `${category} is HYBRID: verify authored and procedural content do not double-spawn.`, { worldId }));
    if (policy === 'authored-candidate') warnings.push(issue('info', 'candidate-source', `${category} has an AUTHORED CANDIDATE; production still uses the reference path until validation/promotion.`, { worldId }));
  }
  if (level?.worldId === 'cave-fishing-island' && level?.terrain?.mode === 'authored-mesh-candidate') {
    const vertexCount = Math.floor((level.terrain.positions?.length ?? 0) / 3);
    const triangleCount = Math.floor((level.terrain.indices?.length ?? 0) / 3);
    if (!vertexCount || !triangleCount) warnings.push(issue('error', 'basalt-candidate-empty', 'Basalt frozen terrain candidate is empty.', { worldId }));
    else warnings.push(issue('info', 'basalt-candidate', `Basalt frozen candidate contains ${vertexCount.toLocaleString()} vertices / ${triangleCount.toLocaleString()} triangles and is comparison-only.`, { worldId }));
  }
  return warnings;
}
