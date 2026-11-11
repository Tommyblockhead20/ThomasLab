import * as THREE from 'three';
import type { Wall } from '../../shared/world';
import type { ShipMaterials } from './materials';

type Palette = Pick<ShipMaterials, 'darkWood' | 'ivory' | 'brass' | 'glass' | 'steel'>;

function piece(
  group: THREE.Group,
  name: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  material: THREE.Material,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

// Walls are assembled as adjoining height bands, never a decorative copy over
// the same opaque faces. Glass is one sheet with depth writes disabled.
export function buildCabinWall(wall: Wall, y: number, palette: Palette) {
  const group = new THREE.Group();
  group.name = `wall-${wall.level}-${wall.x}-${wall.z}`;
  const horizontal = wall.w > wall.d,
    length = Math.max(wall.w, wall.d),
    thickness = Math.min(wall.w, wall.d);
  const add = (name: string, bottom: number, top: number, material: THREE.Material, extra = 0) =>
    piece(
      group,
      name,
      wall.x,
      y + (bottom + top) / 2,
      wall.z,
      horizontal ? length : thickness + extra,
      top - bottom,
      horizontal ? thickness + extra : length,
      material,
    );
  if (wall.level === -1) {
    add('engine-wall', 0, 3.3, palette.steel);
    return group;
  }
  const windows = wall.windows ?? false;
  add('wainscot', 0, 1.02, palette.darkWood);
  add('waist-rail', 1.02, 1.085, palette.brass, 0.045);
  if (windows) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(length - 0.08, 1.75), palette.glass);
    pane.name = 'window-sheet';
    pane.position.set(wall.x, y + 1.96, wall.z);
    if (!horizontal) pane.rotation.y = Math.PI / 2;
    pane.renderOrder = 2;
    group.add(pane);
    const count = Math.ceil(length / 1.7);
    for (let i = 0; i <= count; i++) {
      const at = (i / count - 0.5) * (length - 0.07);
      piece(
        group,
        `mullion-${i}`,
        wall.x + (horizontal ? at : 0),
        y + 1.96,
        wall.z + (horizontal ? 0 : at),
        horizontal ? 0.065 : thickness,
        1.75,
        horizontal ? thickness : 0.065,
        palette.ivory,
      );
    }
    add('window-lintel', 2.835, 2.9, palette.brass, 0.035);
    add('header', 2.9, 3.16, palette.ivory);
  } else {
    add('plaster', 1.085, 3.16, palette.ivory);
    const count = Math.max(1, Math.floor(length / 1.7));
    // Narrow inset door/panel frames sit proud of the wall, with a real gap.
    for (let i = 1; i < count; i++) {
      const at = (i / count - 0.5) * length;
      piece(
        group,
        `panel-post-${i}`,
        wall.x + (horizontal ? at : 0),
        y + 0.51,
        wall.z + (horizontal ? 0 : at),
        horizontal ? 0.035 : thickness + 0.055,
        0.92,
        horizontal ? thickness + 0.055 : 0.035,
        palette.brass,
      );
    }
  }
  add('cornice', 3.16, 3.25, palette.darkWood, 0.085);
  return group;
}

const railPosts = new WeakMap<THREE.Object3D, Set<string>>();
export function buildRailing(
  parent: THREE.Object3D,
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  y: number,
  material: THREE.Material,
) {
  let posts = railPosts.get(parent);
  if (!posts) {
    posts = new Set();
    railPosts.set(parent, posts);
  }
  const length = Math.hypot(x2 - x1, z2 - z1),
    count = Math.ceil(length / 2.4);
  for (let i = 0; i <= count; i++) {
    const t = i / count,
      x = x1 + (x2 - x1) * t,
      z = z1 + (z2 - z1) * t;
    const key = `${Math.round(x * 10000)},${Math.round(y * 10000)},${Math.round(z * 10000)}`;
    if (posts.has(key)) continue;
    posts.add(key);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.12, 8), material);
    post.name = 'railing-post';
    post.position.set(x, y + 0.56, z);
    parent.add(post);
  }
  for (const height of [0.36, 0.72, 1.1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, length, 8), material);
    rail.name = 'railing-bar';
    rail.position.set((x1 + x2) / 2, y + height, (z1 + z2) / 2);
    rail.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(x2 - x1, 0, z2 - z1).normalize(),
    );
    parent.add(rail);
  }
}

export function hullBand(
  outline: THREE.Shape,
  top: number,
  bottom: number,
  bottomScale = { x: 1, z: 1 },
) {
  const contour = outline.getPoints(48),
    vertices: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let i = 0; i < contour.length; i++) {
    const p = contour[i];
    vertices.push(-p.x, top, p.y, -p.x * bottomScale.x, bottom, p.y * bottomScale.z);
    uv.push((i / contour.length) * 8, 1, (i / contour.length) * 8, 0);
    if (i < contour.length - 1) {
      const n = i * 2;
      indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
