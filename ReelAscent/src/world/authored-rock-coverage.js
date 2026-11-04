// Surface-area sampling covers cliffs that cannot be represented by one height per X/Z.
export function authoredRockCandidates(mesh, { spacing = 6.2, minimumY = 14, maximumY = 298, center = { x: 260, z: 0 }, existing = [], exclude = () => false } = {}) {
  if (!mesh?.positions?.length || !mesh?.indices?.length) return [];
  const cells = new Map(), cellSize = spacing;
  const key = (x, y, z) => `${x}:${y}:${z}`;
  const register = (p, radius) => {
    const cell = key(Math.floor(p.x / cellSize), Math.floor(p.y / cellSize), Math.floor(p.z / cellSize));
    const bucket = cells.get(cell) ?? []; bucket.push({ ...p, radius }); cells.set(cell, bucket);
  };
  for (const rock of existing) register(rock.position, Math.min(4.5, (rock.boundingRadius ?? 2) * .65));
  const clearanceAt = p => {
    const c = [p.x, p.y, p.z].map(v => Math.floor(v / cellSize)); let clearance = Infinity;
    for (let x = -2; x <= 2; x += 1) for (let y = -2; y <= 2; y += 1) for (let z = -2; z <= 2; z += 1) {
      for (const rock of cells.get(key(c[0] + x, c[1] + y, c[2] + z)) ?? []) clearance = Math.min(clearance, Math.hypot(p.x - rock.x, p.y - rock.y, p.z - rock.z) - rock.radius);
    }
    return clearance;
  };
  const seeds = [], areaStep = spacing * spacing * .45; let accumulated = 0, ordinal = 0;
  const positions = mesh.positions, at = index => positions.slice(index * 3, index * 3 + 3);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = at(mesh.indices[i]), b = at(mesh.indices[i + 1]), c = at(mesh.indices[i + 2]);
    const ab = b.map((v, k) => v - a[k]), ac = c.map((v, k) => v - a[k]);
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]], length = Math.hypot(...cross);
    if (length < .01) continue;
    const normal = { x: cross[0] / length, y: cross[1] / length, z: cross[2] / length };
    if (normal.y < -.08 || normal.y > .965 || Math.max(a[1], b[1], c[1]) < minimumY || Math.min(a[1], b[1], c[1]) > maximumY) continue;
    accumulated += length * .5;
    while (accumulated >= areaStep) {
      accumulated -= areaStep; ordinal += 1;
      const u = Math.sqrt((ordinal * .61803398875) % 1), v = (ordinal * .754877666) % 1;
      const p = Object.fromEntries(['x', 'y', 'z'].map((axis, k) => [axis, a[k] * (1 - u) + b[k] * u * (1 - v) + c[k] * u * v]));
      if (p.y < minimumY || p.y > maximumY || Math.hypot(p.x - center.x, p.z - center.z) < 8 || exclude(p)) continue;
      const radialLength = Math.hypot(p.x - center.x, p.z - center.z) || 1;
      if (normal.y < .3 && (normal.x * (p.x - center.x) + normal.z * (p.z - center.z)) / radialLength < .05) continue;
      const clearance = clearanceAt(p);
      if (clearance > spacing * .65) seeds.push({ point: p, normal, ordinal, clearance, triangleIndex: i / 3 });
    }
  }
  // Widest holes receive the first rocks; the local spacing test then fills each face.
  seeds.sort((a, b) => Math.min(50, b.clearance) - Math.min(50, a.clearance) || a.ordinal - b.ordinal);
  const selected = [];
  for (const seed of seeds) if (clearanceAt(seed.point) > spacing * .65) { selected.push(seed); register(seed.point, spacing * .35); }
  return selected;
}
