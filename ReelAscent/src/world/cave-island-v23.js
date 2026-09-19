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
  return {
    positions,
    indices,
    parts: [{
      name: 'shared clean Basalt Hollow landmass',
      firstVertex: 0,
      vertexCount: positions.length / 3,
      firstTriangle: 0,
      triangleCount: indices.length / 3
    }]
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
