export function validateWorldLevel(level) {
  const warnings = [];
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
    if (!id) warnings.push({ severity: 'warning', code: 'missing-id', message: 'Authored record has no stable ID.' });
    else if (seen.has(id)) warnings.push({ severity: 'warning', code: 'duplicate-id', message: `Duplicate ID: ${id}` });
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
      warnings.push({ severity: 'warning', code: 'missing-parent', message: `${item.name || item.id} references missing parent ${item.parentId}.` });
    }
  }

  for (const item of level?.objects ?? []) {
    if (item.visible !== false && item.collision === false && item.category === 'parkour') {
      warnings.push({ severity: 'info', code: 'visible-no-collider', message: `${item.name || item.id} is visible parkour geometry with collision disabled.` });
    }
  }
  for (const item of level?.movingPlatforms ?? []) {
    if (!Array.isArray(item.path?.points) || item.path.points.length < 2) {
      warnings.push({ severity: 'warning', code: 'moving-path', message: `${item.name || item.id} needs at least two path points.` });
    }
    if (!(Number(item.path?.speed) > 0)) warnings.push({ severity: 'warning', code: 'moving-speed', message: `${item.name || item.id} has an invalid speed.` });
  }

  for (const water of level?.waters ?? []) {
    const rx = Number(water?.radii?.x);
    const rz = Number(water?.radii?.z);
    if (!(rx > 0) || !(rz > 0)) warnings.push({ severity: 'warning', code: 'water-dimensions', message: `${water.name || water.id || water.identity} has invalid water radii.` });
    if (water.depthMeters != null && !(Number(water.depthMeters) > 0)) warnings.push({ severity: 'warning', code: 'water-depth', message: `${water.name || water.id || water.identity} has invalid depth.` });
  }

  const definitions = new Map((level?.prefabs?.definitions ?? []).map((item) => [item.id, item]));
  for (const definition of definitions.values()) {
    const childIds = new Set();
    for (const child of [...(definition.objects ?? []), ...(definition.movingPlatforms ?? [])]) {
      if (!child.id) warnings.push({ severity: 'warning', code: 'prefab-child-id', message: `${definition.name || definition.id} contains a child without a stable ID.` });
      else if (childIds.has(child.id)) warnings.push({ severity: 'warning', code: 'prefab-child-duplicate', message: `${definition.name || definition.id} has duplicate child ID ${child.id}.` });
      else childIds.add(child.id);
    }
  }
  for (const instance of level?.prefabs?.instances ?? []) {
    if (!definitions.has(instance.prefabId)) warnings.push({ severity: 'warning', code: 'missing-prefab', message: `${instance.name || instance.id} references missing prefab ${instance.prefabId}.` });
  }
  for (const room of level?.rooms ?? []) {
    const definition = definitions.get(room.prefabId);
    if (!definition) warnings.push({ severity: 'warning', code: 'missing-room-prefab', message: `${room.name || room.id} references missing room prefab ${room.prefabId}.` });
    else if (definition.kind !== 'room') warnings.push({ severity: 'info', code: 'room-kind', message: `${room.name || room.id} uses prefab ${room.prefabId}, which is not tagged kind=room.` });
  }

  for (const [category, policy] of Object.entries(level?.sourcePolicy ?? {})) {
    if (policy === 'hybrid') warnings.push({ severity: 'info', code: 'hybrid-source', message: `${category} is HYBRID: verify authored and procedural content do not double-spawn.` });
  }
  return warnings;
}
