import * as T from 'three';

const structural =
  /^(wainscot|waist-rail|window-lintel|header|plaster|cornice|mullion-\d+|panel-post-\d+|doorway-header|doorway-cornice|open-door-jamb|open-door-lintel|closed-cabin-door|door-jamb|door-lintel|door-panel|passenger-dado|passenger-wall|passenger-door-header|riveted-bulkhead|watertight-door-header|stair-casing-.+|stair-door-header|closed-end-bulkhead|end-deck-band|end-window-frame|end-window-recess|bookcase-.+|promenade-.+|b-deck-side-wall|machinery-crossbeam|passenger-waist-rail|stair-support-.+|stair-tread|stair-mounting-plate|stair-landing|external-stair-landing)$/;
type Axis = 'x' | 'y' | 'z';
type Rect = { u0: number; u1: number; v0: number; v1: number };
const epsilon = 0.00001;

function subtract(a: Rect, b: Rect): Rect[] {
  const u0 = Math.max(a.u0, b.u0),
    u1 = Math.min(a.u1, b.u1);
  const v0 = Math.max(a.v0, b.v0),
    v1 = Math.min(a.v1, b.v1);
  if (u1 - u0 < epsilon || v1 - v0 < epsilon) return [a];
  return [
    { ...a, u1: u0 },
    { ...a, u0: u1 },
    { u0, u1, v0: a.v0, v1: v0 },
    { u0, u1, v0: v1, v1: a.v1 },
  ].filter((r) => r.u1 - r.u0 > epsilon && r.v1 - r.v0 > epsilon);
}

// Expose the boundary of adjoining architectural solids. Cutting faces at
// real joins removes corner overlap and internal faces without depth offsets,
// while preserving each board's material, UV scale and original transform.
// Moving equipment and non-axis-aligned fittings are deliberately excluded.
export function joinArchitecturalBoxes(root: T.Group) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const boxes: { mesh: T.Mesh; matrix: T.Matrix4; inverse: T.Matrix4; bounds: T.Box3 }[] = [];
  root.traverse((object) => {
    if (
      !(object instanceof T.Mesh) ||
      object.geometry.type !== 'BoxGeometry' ||
      !structural.test(object.name) ||
      Array.isArray(object.material) ||
      object.material.transparent ||
      !object.visible
    )
      return;
    const matrix = new T.Matrix4().multiplyMatrices(rootInverse, object.matrixWorld);
    // A right-angle rotation preserves axis alignment, arbitrary tilts do not.
    for (let axis = 0; axis < 3; axis++) {
      const column = new T.Vector3().setFromMatrixColumn(matrix, axis).normalize();
      if (Math.max(Math.abs(column.x), Math.abs(column.y), Math.abs(column.z)) < 0.999999) return;
    }
    object.geometry.computeBoundingBox();
    boxes.push({
      mesh: object,
      matrix,
      inverse: matrix.clone().invert(),
      bounds: object.geometry.boundingBox!.clone().applyMatrix4(matrix),
    });
  });
  let trimmedFaces = 0;
  for (const [index, item] of boxes.entries()) {
    const source = item.mesh.geometry;
    const p = source.getAttribute('position'),
      n = source.getAttribute('normal'),
      uv = source.getAttribute('uv');
    const vertices: number[] = [],
      normals: number[] = [],
      uvs: number[] = [];
    for (let k = 0; k < p.count; k += 4) {
      const corners = Array.from({ length: 4 }, (_, j) =>
        new T.Vector3().fromBufferAttribute(p, k + j).applyMatrix4(item.matrix),
      );
      const normal = new T.Vector3().fromBufferAttribute(n, k).transformDirection(item.matrix);
      const axis = (['x', 'y', 'z'] as Axis[]).find((a) => Math.abs(normal[a]) > 0.999999)!;
      const [u, v] = (['x', 'y', 'z'] as Axis[]).filter((a) => a !== axis);
      const plane = corners[0][axis],
        sign = Math.sign(normal[axis]);
      const faceBounds = new T.Box3().setFromPoints(corners);
      let rectangles: Rect[] = [
        {
          u0: faceBounds.min[u],
          u1: faceBounds.max[u],
          v0: faceBounds.min[v],
          v1: faceBounds.max[v],
        },
      ];
      for (const [otherIndex, other] of boxes.entries()) {
        if (otherIndex === index) continue;
        const b = other.bounds;
        if (plane < b.min[axis] - epsilon || plane > b.max[axis] + epsilon) continue;
        const inside = plane > b.min[axis] + epsilon && plane < b.max[axis] - epsilon;
        const outsideTouches = Math.abs(plane - (sign > 0 ? b.min[axis] : b.max[axis])) < epsilon;
        const sameBoundary = Math.abs(plane - (sign > 0 ? b.max[axis] : b.min[axis])) < epsilon;
        if (!inside && !outsideTouches && !(sameBoundary && otherIndex > index)) continue;
        rectangles = rectangles.flatMap((r) =>
          subtract(r, { u0: b.min[u], u1: b.max[u], v0: b.min[v], v1: b.max[v] }),
        );
        if (!rectangles.length) break;
      }
      const originalArea =
        (faceBounds.max[u] - faceBounds.min[u]) * (faceBounds.max[v] - faceBounds.min[v]);
      const area = rectangles.reduce((sum, r) => sum + (r.u1 - r.u0) * (r.v1 - r.v0), 0);
      if (originalArea - area > epsilon) trimmedFaces++;
      const edge1 = corners[1].clone().sub(corners[0]),
        edge2 = corners[2].clone().sub(corners[0]);
      for (const r of rectangles) {
        const points = [
          [r.u0, r.v0],
          [r.u1, r.v0],
          [r.u0, r.v1],
          [r.u1, r.v1],
        ].map(([a, b]) => {
          const point = new T.Vector3();
          point[axis] = plane;
          point[u] = a;
          point[v] = b;
          return point;
        });
        // Preserve local winding even for reflected authoring groups.
        const local = points.map((q) => q.clone().applyMatrix4(item.inverse));
        const localNormal = new T.Vector3().fromBufferAttribute(n, k);
        const forward =
          local[1].clone().sub(local[0]).cross(local[2].clone().sub(local[0])).dot(localNormal) > 0;
        for (const j of forward ? [0, 1, 2, 2, 1, 3] : [0, 2, 1, 2, 3, 1]) {
          const delta = points[j].clone().sub(corners[0]);
          const a = delta.dot(edge1) / edge1.lengthSq(),
            b = delta.dot(edge2) / edge2.lengthSq();
          vertices.push(...local[j].toArray());
          normals.push(...localNormal.toArray());
          uvs.push(
            uv.getX(k) + a * (uv.getX(k + 1) - uv.getX(k)) + b * (uv.getX(k + 2) - uv.getX(k)),
            uv.getY(k) + a * (uv.getY(k + 1) - uv.getY(k)) + b * (uv.getY(k + 2) - uv.getY(k)),
          );
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    geometry.computeBoundingSphere();
    item.mesh.geometry = geometry;
    if (!vertices.length) item.mesh.visible = false;
    item.mesh.userData.architectureJoined = true;
  }
  return { solids: boxes.length, trimmedFaces };
}
