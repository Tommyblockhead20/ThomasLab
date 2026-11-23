import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Rendering batches leave original, hidden meshes in their model hierarchy for
// accurate physical-part ray tests. Animated controls keep their own drawables.
export function batchStaticShip(root: T.Group, moving: T.Object3D[]) {
  const dynamic = new Set<T.Object3D>();
  for (const object of moving) object.traverse((child) => dynamic.add(child));
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<string, { mesh: T.Mesh; geometry: T.BufferGeometry }[]>();
  const matrix = new T.Matrix4();
  const bounds = new T.Box3();
  let originals = 0,
    batches = 0;
  root.traverse((object) => {
    if (object !== root && !dynamic.has(object)) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    }
    if (
      !(object instanceof T.Mesh) ||
      object instanceof T.InstancedMesh ||
      dynamic.has(object) ||
      !object.visible ||
      Array.isArray(object.material)
    )
      return;
    if (
      object.material.transparent ||
      object.material.opacity < 1 ||
      object.geometry.morphAttributes.position
    )
      return;
    matrix.multiplyMatrices(inverse, object.matrixWorld);
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(matrix);
    // Reflected authoring groups need winding corrected before their transform
    // is baked. Keep all vertex attributes, including UVs, in the same order.
    if (matrix.determinant() < 0)
      for (const attribute of Object.values(geometry.attributes)) {
        const a = attribute as T.BufferAttribute;
        for (let n = 0; n < a.count; n += 3)
          for (let c = 0; c < a.itemSize; c++) {
            const k = (n + 1) * a.itemSize + c,
              j = (n + 2) * a.itemSize + c;
            const value = a.array[k];
            a.array[k] = a.array[j];
            a.array[j] = value;
          }
      }
    geometry.computeBoundingBox();
    bounds.copy(geometry.boundingBox!);
    const center = bounds.getCenter(new T.Vector3());
    const attributes = Object.entries(geometry.attributes)
      .map(([k, value]) => {
        const a = value as T.BufferAttribute;
        return `${k}:${a.itemSize}:${a.normalized}`;
      })
      .sort()
      .join(',');
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${object.renderOrder}:${Math.floor(center.y / 6)}:${Math.floor(center.z / 14)}:${attributes}`;
    const group = groups.get(key) ?? [];
    group.push({ mesh: object, geometry });
    groups.set(key, group);
  });
  for (const parts of groups.values()) {
    if (parts.length >= 3) {
      const merged = mergeGeometries(
        parts.map((p) => p.geometry),
        false,
      );
      if (merged) {
        const first = parts[0].mesh;
        const batch = new T.Mesh(merged, first.material);
        batch.name = 'static-ship-batch';
        batch.castShadow = first.castShadow;
        batch.receiveShadow = first.receiveShadow;
        batch.renderOrder = first.renderOrder;
        batch.userData.staticBatch = true;
        merged.computeBoundingSphere();
        for (const { mesh } of parts) {
          mesh.visible = false;
          mesh.userData.renderBatched = true;
          originals++;
        }
        root.add(batch);
        batches++;
      }
    }
    for (const p of parts) p.geometry.dispose();
  }
  return { originals, batches, savedDraws: originals - batches };
}

// Pick only nearby equipment roots; keep housings as occluders so a handle on
// the far side of a machine never becomes usable through solid metal.
export function nearbyPickRoots(roots: T.Object3D[], camera: T.Vector3, range: number) {
  const point = new T.Vector3();
  return roots.filter(
    (root) => root.getWorldPosition(point).distanceToSquared(camera) < (range + 5) ** 2,
  );
}
