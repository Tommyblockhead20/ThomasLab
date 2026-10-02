// Basalt Hollow's v23 replacement landmass is deliberately data-only so production and
// World Editor V2 consume identical positions/indices instead of maintaining two caves.
export const BASALT_HOLLOW_TERRAIN_SOURCE = 'shared-clean-basalt-v23';

export function buildCleanBasaltTerrainLocal() {
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
  // The original replacement was a complete height surface, but it was still an open,
  // one-sided sheet. Looking under the shoreline (or through transparent water at a grazing
  // angle) could therefore expose the skybox. Duplicate the perimeter at a buried floor,
  // stitch real side faces, and cap the bottom so the shared runtime/editor core is watertight.
  const perimeter = [];
  for (let column = 0; column < columns; column += 1) perimeter.push(column);
  for (let row = 1; row < rows; row += 1) perimeter.push(row * columns + columns - 1);
  for (let column = columns - 2; column >= 0; column -= 1) perimeter.push((rows - 1) * columns + column);
  for (let row = rows - 2; row > 0; row -= 1) perimeter.push(row * columns);
  const bottomY = -3.25;
  const bottomPerimeter = perimeter.map((topId) => {
    const id = positions.length / 3;
    positions.push(positions[topId * 3], bottomY, positions[topId * 3 + 2]);
    return id;
  });
  const sideFirstTriangle = indices.length / 3;
  for (let index = 0; index < perimeter.length; index += 1) {
    const next = (index + 1) % perimeter.length;
    const topA = perimeter[index], topB = perimeter[next];
    const bottomA = bottomPerimeter[index], bottomB = bottomPerimeter[next];
    indices.push(topA, topB, bottomB, topA, bottomB, bottomA);
  }
  const bottomCenter = positions.length / 3;
  positions.push(0, bottomY, 0);
  const bottomFirstTriangle = indices.length / 3;
  for (let index = 0; index < bottomPerimeter.length; index += 1) {
    const next = (index + 1) % bottomPerimeter.length;
    indices.push(bottomCenter, bottomPerimeter[index], bottomPerimeter[next]);
  }
  const topTriangleCount = (rows - 1) * (columns - 1) * 2;
  return {
    positions,
    indices,
    parts: [
      {
        name: 'shared clean Basalt Hollow top surface',
        firstVertex: 0,
        vertexCount: columns * rows,
        firstTriangle: 0,
        triangleCount: topTriangleCount
      },
      {
        name: 'sealed Basalt Hollow shoreline walls',
        firstVertex: columns * rows,
        vertexCount: bottomPerimeter.length,
        firstTriangle: sideFirstTriangle,
        triangleCount: bottomPerimeter.length * 2
      },
      {
        name: 'sealed Basalt Hollow bottom cap',
        firstVertex: bottomCenter,
        vertexCount: 1,
        firstTriangle: bottomFirstTriangle,
        triangleCount: bottomPerimeter.length
      }
    ]
  };
}

export function buildCleanBasaltTerrainWorld(location) {
  const local = buildCleanBasaltTerrainLocal();
  const vertices = [];
  for (let index = 0; index < local.positions.length; index += 3) {
    vertices.push([
      location.worldPosition.x + local.positions[index],
      local.positions[index + 1],
      location.worldPosition.z + local.positions[index + 2]
    ]);
  }
  const triangles = [];
  for (let index = 0; index < local.indices.length; index += 3) {
    triangles.push([local.indices[index], local.indices[index + 1], local.indices[index + 2]]);
  }
  return { vertices, triangles, parts: local.parts };
}
