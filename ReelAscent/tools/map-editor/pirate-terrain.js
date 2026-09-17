const round = (value) => Math.round(value * 10000) / 10000;

/**
 * Deterministic authored starting mesh for Pirate Island. The returned arrays are
 * ordinary editable World Editor topology; the generator only avoids checking a
 * wall of opaque numbers into the source level.
 */
export function createPirateIslandTerrain() {
  const segments = 24;
  const positions = [];
  const indices = [];
  const radiusAt = (theta, baseX, baseZ) => {
    const coast = 1 + .12 * Math.sin(theta * 3 + .35) + .075 * Math.sin(theta * 7 - .8) + .035 * Math.cos(theta * 11);
    return { x: baseX * coast, z: baseZ * (1 + (coast - 1) * .72) };
  };
  const rings = [
    { x: 27.5, z: 22.5, y: -1.15 },
    { x: 24.5, z: 19.8, y: .08 },
    { x: 17.0, z: 13.3, y: 1.35 }
  ];
  for (const ring of rings) {
    for (let index = 0; index < segments; index += 1) {
      const theta = index / segments * Math.PI * 2;
      const radius = radiusAt(theta, ring.x, ring.z);
      positions.push(round(Math.cos(theta) * radius.x), ring.y, round(Math.sin(theta) * radius.z));
    }
  }
  positions.push(0, 3.15, -.75);
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const a = ring * segments + index;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + index;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const center = rings.length * segments;
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    indices.push((rings.length - 1) * segments + index, center, (rings.length - 1) * segments + next);
  }
  return {
    mode: 'authored-triangle-mesh',
    format: 'pirate-island-v4',
    editable: true,
    positions,
    indices,
    parts: [
      { id: 'pirate-rock-skirt', name: 'Rock shoreline skirt', firstTriangle: 0, triangleCount: segments * 2 },
      { id: 'pirate-beach-ring', name: 'Beach and low coast', firstTriangle: segments * 2, triangleCount: segments * 2 },
      { id: 'pirate-raised-interior', name: 'Raised island interior', firstTriangle: segments * 4, triangleCount: segments }
    ],
    metadata: { authoredBy: 'world-editor-v4', coastline: 'irregular', replacementFor: 'rectangular-placeholder' }
  };
}

export function ensurePirateIslandTerrain(level) {
  if (!level || level.worldId !== 'pirate-island') return level;
  if (!level.terrain?.positions?.length || !level.terrain?.indices?.length) level.terrain = createPirateIslandTerrain();
  level.sourcePolicy = { ...level.sourcePolicy, terrain: 'authored' };
  level.metadata = { ...level.metadata, status: 'authored-starter-scene', pirateTerrainVersion: 4 };
  return level;
}
