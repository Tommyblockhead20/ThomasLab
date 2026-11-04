// Closed low-poly surfaces shared by creatures and clothing. Coordinates are local.
export function sweptTube(points, sides = 12) {
  const positions = [], indices = [], uvs = [];
  for (let ring = 0; ring < points.length; ring += 1) {
    const p = points[ring], a = points[Math.max(0, ring - 1)], b = points[Math.min(points.length - 1, ring + 1)];
    const tangent = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const length = Math.hypot(...tangent) || 1;
    const t = tangent.map(v => v / length);
    const reference = Math.abs(t[1]) > .92 ? [1, 0, 0] : [0, 1, 0];
    const n = [t[1] * reference[2] - t[2] * reference[1], t[2] * reference[0] - t[0] * reference[2], t[0] * reference[1] - t[1] * reference[0]];
    const nl = Math.hypot(...n) || 1;
    for (let axis = 0; axis < 3; axis += 1) n[axis] /= nl;
    const v = [t[1] * n[2] - t[2] * n[1], t[2] * n[0] - t[0] * n[2], t[0] * n[1] - t[1] * n[0]];
    for (let side = 0; side <= sides; side += 1) {
      const angle = side / sides * Math.PI * 2;
      positions.push(...p.slice(0, 3).map((value, axis) => value + n[axis] * Math.cos(angle) * p[3] + v[axis] * Math.sin(angle) * (p[4] ?? p[3])));
      uvs.push(ring / (points.length - 1), side / sides);
    }
  }
  for (let r = 0; r < points.length - 1; r += 1) for (let s = 0; s < sides; s += 1) {
    const a = r * (sides + 1) + s, b = a + sides + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  for (const ring of [0, points.length - 1]) {
    const center = positions.length / 3;
    positions.push(...points[ring].slice(0, 3)); uvs.push(ring / (points.length - 1), .5);
    for (let s = 0; s < sides; s += 1) {
      const a = ring * (sides + 1) + s;
      indices.push(center, ring === 0 ? a + 1 : a, ring === 0 ? a : a + 1);
    }
  }
  return { positions, indices, uvs };
}

export function sculptedPanel(points, thickness = .025) {
  const positions = [], indices = [], uvs = [], count = points.length;
  for (const offset of [-thickness / 2, thickness / 2]) for (const p of points) {
    positions.push(p[0], p[1], p[2] + offset); uvs.push(p[0], p[1]);
  }
  for (let i = 1; i < count - 1; i += 1) indices.push(0, i + 1, i, count, count + i, count + i + 1);
  for (let i = 0; i < count; i += 1) { const j = (i + 1) % count; indices.push(i, j, count + i, j, count + j, count + i); }
  return { positions, indices, uvs };
}

export function revolvedSurface(profile, segments = 32, warp = null) {
  const positions = [], indices = [], uvs = [];
  for (let row = 0; row < profile.length; row += 1) for (let s = 0; s <= segments; s += 1) {
    const angle = s / segments * Math.PI * 2, [y, radius] = profile[row];
    positions.push(Math.cos(angle) * radius, y + (warp?.(angle, radius, row) ?? 0), Math.sin(angle) * radius);
    uvs.push(s / segments, row / (profile.length - 1));
  }
  for (let row = 0; row < profile.length - 1; row += 1) for (let s = 0; s < segments; s += 1) {
    const a = row * (segments + 1) + s, b = a + segments + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { positions, indices, uvs };
}
