export function tankRimBoxes(config) {
  const width = config.tankWidth, depth = config.tankDepth, thickness = .34, y = config.waterlineY + .16;
  return [
    { name: 'front rim', position: { x: 0, y, z: depth / 2 }, size: { x: width + thickness, y: .32, z: thickness } },
    { name: 'rear rim', position: { x: 0, y, z: -depth / 2 }, size: { x: width + thickness, y: .32, z: thickness } },
    { name: 'left rim', position: { x: -width / 2, y, z: 0 }, size: { x: thickness, y: .32, z: depth - thickness } },
    { name: 'right rim', position: { x: width / 2, y, z: 0 }, size: { x: thickness, y: .32, z: depth - thickness } }
  ];
}
export function unitSurfacePlane(axis = 'xy') {
  const positions = axis === 'xy' ? [-.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0]
    : axis === 'yz' ? [0, -.5, -.5, 0, -.5, .5, 0, .5, .5, 0, .5, -.5]
      : [-.5, 0, -.5, -.5, 0, .5, .5, 0, .5, .5, 0, -.5];
  return { positions, indices: [0, 1, 2, 0, 2, 3], uvs: [0, 0, 1, 0, 1, 1, 0, 1] };
}

// Clip the real terrain triangles to the path footprint. Each resulting face has the
// terrain's exact slope plus one consistent clearance, with no stacked path boxes.
export function aquariumPathSurface(terrain, location, { startZ, endZ, floorY, width = 3.2, clearance = .055 }) {
  const angle = location.angle * Math.PI / 180, sin = Math.sin(angle), cos = Math.cos(angle);
  const toLocal = p => { const dx = p[0] - location.worldPosition.x, dz = p[2] - location.worldPosition.z; return [dx * sin - dz * cos, p[1] - floorY + clearance, dx * cos + dz * sin]; };
  const positions = [], indices = [], uvs = [];
  const boundaries = [[0, -width / 2, 1], [0, width / 2, -1], [2, startZ, 1], [2, endZ, -1]];
  for (const triangle of terrain.triangles ?? []) {
    let polygon = triangle.map(i => toLocal(terrain.vertices[i]));
    for (const [axis, value, sign] of boundaries) {
      const clipped = [];
      for (let i = 0; i < polygon.length; i += 1) {
        const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = (a[axis] - value) * sign, db = (b[axis] - value) * sign;
        if (da >= 0) clipped.push(a);
        if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); clipped.push(a.map((v, k) => v + (b[k] - v) * t)); }
      }
      polygon = clipped;
      if (polygon.length < 3) break;
    }
    if (polygon.length < 3) continue;
    const offset = positions.length / 3;
    for (const p of polygon) { positions.push(...p); uvs.push(p[0] * .36, p[2] * .36); }
    for (let i = 1; i < polygon.length - 1; i += 1) indices.push(offset, offset + i, offset + i + 1);
  }
  return { positions, indices, uvs };
}

export function normalizedSurfaceRecord(data) {
  const min = [0, 1, 2].map(axis => Math.min(...data.positions.filter((_, i) => i % 3 === axis)));
  const max = [0, 1, 2].map(axis => Math.max(...data.positions.filter((_, i) => i % 3 === axis)));
  const extent = max.map((v, i) => Math.max(.04, v - min[i])), center = max.map((v, i) => (v + min[i]) / 2);
  return { position: Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, center[i]])), size: Object.fromEntries(['x', 'y', 'z'].map((k, i) => [k, extent[i]])), mesh: { ...data, positions: data.positions.map((v, i) => (v - center[i % 3]) / extent[i % 3]) } };
}
