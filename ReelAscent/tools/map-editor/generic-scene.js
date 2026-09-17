import * as pc from 'playcanvas';
import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import { SKYREACH_TOWER_CONFIG, skyreachHollowCollisionBoxes } from '../../src/world/mountain-v2.js';
import { movingPlatformPose, normalizeWorldEditorLevel } from '../../src/world/world-editor-v2-runtime.js';
import { edgeKey, faceVertices, meshDiagnostics, vertex } from './mesh-authoring.js';

const clone = (value) => value == null ? value : structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function rayTriangleMeshHit(mesh, origin, direction) {
  if (!mesh?.positions?.length || !mesh?.indices?.length) return null;
  const p = mesh.positions;
  const idx = mesh.indices;
  let best = null;
  for (let offset = 0; offset < idx.length; offset += 3) {
    const ia = idx[offset] * 3, ib = idx[offset + 1] * 3, ic = idx[offset + 2] * 3;
    const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
    const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
    const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const px = direction.y * e2z - direction.z * e2y;
    const py = direction.z * e2x - direction.x * e2z;
    const pz = direction.x * e2y - direction.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-8) continue;
    const inv = 1 / det;
    const tx = origin.x - ax, ty = origin.y - ay, tz = origin.z - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y;
    const qy = tz * e1x - tx * e1z;
    const qz = tx * e1y - ty * e1x;
    const v = (direction.x * qx + direction.y * qy + direction.z * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t < 0 || (best && t >= best.distance)) continue;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    // Orient the hit normal toward the ray origin. Basalt production pieces are captured
    // from several independently generated meshes whose winding is not guaranteed to be
    // globally consistent. This keeps Indent reliably pushing away from the camera and
    // Pull Core reliably pulling toward it instead of randomly reversing between parts.
    if (nx * direction.x + ny * direction.y + nz * direction.z > 0) {
      nx = -nx; ny = -ny; nz = -nz;
    }
    best = {
      distance: t,
      x: origin.x + direction.x * t,
      y: origin.y + direction.y * t,
      z: origin.z + direction.z * t,
      normal: { x: nx, y: ny, z: nz },
      triangleOffset: offset
    };
  }
  return best;
}

function meshAdjacency(mesh) {
  const count = Math.floor((mesh?.positions?.length || 0) / 3);
  const adjacency = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < (mesh?.indices?.length || 0); i += 3) {
    const a = mesh.indices[i], b = mesh.indices[i + 1], c = mesh.indices[i + 2];
    if (adjacency[a] && adjacency[b] && adjacency[c]) {
      adjacency[a].add(b); adjacency[a].add(c);
      adjacency[b].add(a); adjacency[b].add(c);
      adjacency[c].add(a); adjacency[c].add(b);
    }
  }
  return adjacency;
}

function nearestTriangleVertex(mesh, hit) {
  const ids = [
    mesh.indices[hit.triangleOffset],
    mesh.indices[hit.triangleOffset + 1],
    mesh.indices[hit.triangleOffset + 2]
  ];
  let best = ids[0], bestDistance = Infinity;
  for (const id of ids) {
    const o = id * 3;
    const d = Math.hypot(mesh.positions[o] - hit.x, mesh.positions[o + 1] - hit.y, mesh.positions[o + 2] - hit.z);
    if (d < bestDistance) { bestDistance = d; best = id; }
  }
  return best;
}

export function sculptTriangleMesh(mesh, hit, mode, radius, strength) {
  if (!mesh?.positions?.length || !mesh?.indices?.length || !hit || !Number.isInteger(hit.triangleOffset)) return 0;
  const p = mesh.positions;
  const adjacency = meshAdjacency(mesh);
  const seed = nearestTriangleVertex(mesh, hit);
  const maxDistance = Math.max(.2, Number(radius) || 3);
  const distances = new Map([[seed, 0]]);
  const queue = [[0, seed]];
  while (queue.length) {
    queue.sort((a, b) => b[0] - a[0]);
    const [distance, index] = queue.pop();
    if (distance !== distances.get(index) || distance > maxDistance) continue;
    const o = index * 3;
    for (const next of adjacency[index] ?? []) {
      const no = next * 3;
      const edge = Math.hypot(p[no] - p[o], p[no + 1] - p[o + 1], p[no + 2] - p[o + 2]);
      const nextDistance = distance + edge;
      if (nextDistance <= maxDistance && nextDistance < (distances.get(next) ?? Infinity)) {
        distances.set(next, nextDistance);
        queue.push([nextDistance, next]);
      }
    }
  }
  const source = p.slice();
  const amount = Number(strength) || 1;
  let changed = 0;
  for (const [index, distance] of distances) {
    const t = Math.max(0, 1 - distance / maxDistance);
    const weight = t * t * (3 - 2 * t);
    if (weight <= 0) continue;
    const o = index * 3;
    if (mode === 'smooth') {
      const neighbors = [...(adjacency[index] ?? [])];
      if (neighbors.length < 2) continue;
      let ax = 0, ay = 0, az = 0;
      for (const next of neighbors) {
        const no = next * 3;
        ax += source[no]; ay += source[no + 1]; az += source[no + 2];
      }
      ax /= neighbors.length; ay /= neighbors.length; az /= neighbors.length;
      const blend = Math.min(.55, Math.max(.02, amount * .08)) * weight;
      p[o] += (ax - p[o]) * blend;
      p[o + 1] += (ay - p[o + 1]) * blend;
      p[o + 2] += (az - p[o + 2]) * blend;
    } else if (mode === 'raise' || mode === 'lower') {
      p[o + 1] += (mode === 'raise' ? amount : -amount) * weight;
    } else {
      const sign = mode === 'indent' ? -1 : 1;
      p[o] += hit.normal.x * amount * sign * weight;
      p[o + 1] += hit.normal.y * amount * sign * weight;
      p[o + 2] += hit.normal.z * amount * sign * weight;
    }
    changed += 1;
  }
  mesh.editedAt = new Date().toISOString();
  return changed;
}

function makeMaterial(rgb, opacity = 1, emissive = 0) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(...rgb);
  if (emissive) material.emissive = new pc.Color(rgb[0] * emissive, rgb[1] * emissive, rgb[2] * emissive);
  material.opacity = opacity;
  if (opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function makeAuthoredMaterial(spec = {}) {
  const rgb = spec.diffuse ?? [.5, .5, .5];
  const material = makeMaterial(rgb, spec.opacity ?? 1);
  const emissive = spec.emissive ?? [0, 0, 0];
  material.emissive = new pc.Color(emissive[0] ?? 0, emissive[1] ?? 0, emissive[2] ?? 0);
  material.emissiveIntensity = spec.emissiveIntensity ?? 1;
  material.gloss = spec.gloss ?? .12;
  material.metalness = spec.metalness ?? 0;
  if (spec.doubleSided) {
    material.cull = pc.CULLFACE_NONE;
    material.twoSidedLighting = true;
  }
  material.update();
  return material;
}

function destroyChildren(root) {
  for (const child of [...root.children]) {
    for (const mesh of child._editorOwnedMeshes ?? []) { try { mesh.destroy(); } catch {} }
    child.destroy();
  }
}

function raySphereDistance(origin, direction, center, radius) {
  const oc = origin.clone().sub(center);
  const b = oc.dot(direction);
  const c = oc.dot(oc) - radius * radius;
  const h = b * b - c;
  if (h < 0) return null;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : null;
}

function rayAabbDistance(origin, direction, center, half) {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis], d = direction[axis];
    const min = center[axis] - half[axis], max = center[axis] + half[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return null;
      continue;
    }
    let a = (min - o) / d;
    let b = (max - o) / d;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmax < tmin) return null;
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

function rayAabbHit(origin, direction, center, half) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let hitAxis = 'y';
  let hitSign = 1;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis], d = direction[axis];
    const min = center[axis] - half[axis], max = center[axis] + half[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return null;
      continue;
    }
    let a = (min - o) / d;
    let b = (max - o) / d;
    let sign = -1;
    if (a > b) { [a, b] = [b, a]; sign = 1; }
    if (a > tmin) { tmin = a; hitAxis = axis; hitSign = sign; }
    tmax = Math.min(tmax, b);
    if (tmax < tmin) return null;
  }
  if (tmax < 0) return null;
  const distance = tmin >= 0 ? tmin : tmax;
  const normal = { x: 0, y: 0, z: 0 };
  normal[hitAxis] = tmin >= 0 ? hitSign : -hitSign;
  return { distance, normal };
}

function createBox(parent, name, position, size, material, rotation = {}, solidRecord = null) {
  const entity = new pc.Entity(name);
  entity._editorBaseMaterial = material;
  entity.addComponent('render', { type: 'box', material, castShadows: true, receiveShadows: true });
  parent.addChild(entity);
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(size.x, size.y, size.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  if (solidRecord) Object.assign(entity, solidRecord);
  return entity;
}

function createSphere(parent, name, position, radius, material) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type: 'sphere', material, castShadows: false, receiveShadows: false });
  parent.addChild(entity);
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(radius, radius, radius);
  return entity;
}

function createPrimitive(parent, name, type, position, size, material, rotation = {}, record = null) {
  const primitive = ['box', 'sphere', 'cylinder', 'cone', 'capsule'].includes(type) ? type : 'box';
  if (primitive === 'box') return createBox(parent, name, position, size, material, rotation, record);
  const entity = new pc.Entity(name);
  entity._editorBaseMaterial = material;
  entity.addComponent('render', {
    type: primitive, material, castShadows: material?.opacity >= 1, receiveShadows: material?.opacity >= 1
  });
  parent.addChild(entity);
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(size.x, size.y, size.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  if (record) Object.assign(entity, record);
  return entity;
}

function createSegment(parent, name, a, b, material) {
  const va = new pc.Vec3(a.x, a.y, a.z);
  const vb = new pc.Vec3(b.x, b.y, b.z);
  const midpoint = va.clone().add(vb).mulScalar(.5);
  const length = va.distance(vb);
  if (length < .001) return null;
  const entity = createBox(parent, name, midpoint, { x: .08, y: .08, z: length }, material, {}, null);
  entity.lookAt(vb);
  return entity;
}

function libraryBenchCollisionBoxes(item) {
  const p = item.transform?.position ?? { x: 0, y: 0, z: 0 };
  const yaw = finite(item.transform?.rotation?.y);
  const rad = yaw * Math.PI / 180;
  return [
    { center: { ...p }, size: { x: 2.05, y: .18, z: .5 }, rotation: { x: 0, y: yaw, z: 0 } },
    {
      center: { x: p.x - Math.sin(rad) * .28, y: p.y + .48, z: p.z - Math.cos(rad) * .28 },
      size: { x: 2.05, y: .82, z: .18 }, rotation: { x: 0, y: yaw, z: 0 }
    }
  ];
}

function caveReferenceMesh(location) {
  // Milestone-1 reference: keep the current island footprint and the same open-mouth concept
  // visible without claiming that this is an authored replacement for buildOceanIsland().
  const segments = 48;
  const rings = [1.18, 1, .68, .2];
  const heights = [-1.55, -.08, location.elevation + .06, location.elevation + .18];
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < rings.length; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const theta = segment / segments * Math.PI * 2;
      positions.push(
        Math.cos(theta) * location.radii.x * rings[ring],
        heights[ring],
        Math.sin(theta) * location.radii.z * rings[ring]
      );
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const centerDegrees = segment / segments * 360;
      const delta = Math.abs(centerDegrees - location.angle) % 360;
      const mouthDelta = Math.min(delta, 360 - delta);
      if (ring >= 1 && mouthDelta < 16) continue;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, indices };
}

export class GenericWorldScene {
  constructor(app, parent) {
    this.app = app;
    this.root = new pc.Entity('World Editor V2 Generic Scene');
    parent.addChild(this.root);
    this.referenceRoot = new pc.Entity('Reference Geometry');
    this.waterRoot = new pc.Entity('Authored Waters');
    this.objectRoot = new pc.Entity('Authored Objects');
    this.pathRoot = new pc.Entity('Moving Platform Paths');
    this.collisionRoot = new pc.Entity('Collision Debug');
    this.meshOverlayRoot = new pc.Entity('Mesh Topology Overlay');
    this.workspaceRoot = new pc.Entity('Prefab Workspace Reference');
    for (const child of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot, this.meshOverlayRoot]) this.root.addChild(child);
    this.materials = {
      reference: makeMaterial([.45, .48, .47]),
      referenceGlass: makeMaterial([.46, .61, .7], .72),
      platform: makeMaterial([.65, .61, .48]),
      moving: makeMaterial([.28, .63, .82]),
      water: makeMaterial([.08, .54, .7], .68),
      selected: makeMaterial([1, .7, .08], 1, .08),
      meshVertex: makeMaterial([1, .83, .12], 1, .15),
      meshEdge: makeMaterial([1, .48, .08], 1, .12),
      meshFace: makeMaterial([.98, .68, .08], .58, .12),
      boundary: makeMaterial([1, .1, .75], 1, .18),
      nonManifold: makeMaterial([1, .08, .08], 1, .2),
      path: makeMaterial([1, .5, .08], .82, .18),
      collision: makeMaterial([1, .12, .12], .15, .12),
      pirate: makeMaterial([.27, .42, .28]),
      library: makeMaterial([.30, .27, .38]),
      workspaceGrid: makeMaterial([.34, .38, .31], .28),
      roomWall: makeMaterial([.63, .66, .65]),
      roomCeiling: makeMaterial([.72, .73, .69]),
      roomFloor: makeMaterial([.25, .29, .28]),
      roomWood: makeMaterial([.43, .28, .17]),
      roomMetal: makeMaterial([.31, .36, .38]),
      roomGlass: makeMaterial([.42, .68, .75], .48),
      roomFabric: makeMaterial([.34, .22, .24]),
      roomAccent: makeMaterial([.73, .56, .22], 1, .05),
      roomFixture: makeMaterial([.82, .84, .79]),
      roomDark: makeMaterial([.12, .14, .15]),
      roomPlant: makeMaterial([.19, .42, .24]),
      roomTile: makeMaterial([.47, .56, .55]),
      roomPartition: makeMaterial([.54, .57, .56]),
      roomLight: makeMaterial([.95, .88, .56], 1, .35),
      casinoFelt: makeMaterial([.08, .36, .22]),
      casinoRed: makeMaterial([.44, .08, .09]),
      casinoPurple: makeMaterial([.31, .12, .45], 1, .08),
      skyreachFacade: makeMaterial([.27, .31, .34], 1, .03),
      skyreachAccent: makeMaterial([.72, .56, .23], 1, .12)
    };
    this.level = null;
    this.world = null;
    this.elapsedSeconds = 0;
    this.entities = new Map();
    this.referenceCollisionBoxes = [];
    this.movingEntities = new Map();
    this.prefabCollisionEntries = [];
    this.prefabMovingEntries = [];
    this.selectedId = null;
    this.referenceRecord = null;
    this.collisionMode = 'normal';
    this.collisionEntries = [];
    this.workspaceDefinition = null;
    this.basaltReferenceMode = 'both';
    this.skyscraperInteriorMode = true;
    this.editorHiddenIds = new Set();
    this.meshSelection = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.meshOverlayOptions = { showBoundary: false, showNonManifold: false };
    this.libraryMaterials = new Map();
    this.root.enabled = false;
  }

  setWorld(world, level) {
    this.world = world;
    this.level = normalizeWorldEditorLevel(level, {
      worldId: world.id, displayName: world.label, runtimeLocationId: world.runtimeLocationId
    });
    this.elapsedSeconds = 0;
    this.selectedId = null;
    this.libraryMaterials.clear();
    for (const [id, spec] of Object.entries(this.level.librarySceneSource?.materials ?? {})) {
      this.libraryMaterials.set(String(id).toLowerCase(), makeAuthoredMaterial(spec));
    }
    this.rebuild();
  }

  setEnabled(enabled) { this.root.enabled = Boolean(enabled); }

  setCollisionDebug(enabled) { this.setCollisionMode(enabled ? 'overlay' : 'normal'); }

  setCollisionMode(mode = 'normal') {
    this.collisionMode = ['normal', 'overlay', 'collision-only', 'selected'].includes(mode) ? mode : 'normal';
    this.applyCollisionMode();
  }

  setSkyscraperInteriorMode(enabled = true) {
    this.skyscraperInteriorMode = Boolean(enabled);
    this.applyCollisionMode();
  }

  editableBasaltTerrain() {
    return this.world?.id === 'cave-fishing-island' && this.level?.terrain?.mode === 'authored-mesh-candidate'
      ? this.level.terrain : null;
  }

  basaltTerrainHit(ray) {
    const mesh = this.editableBasaltTerrain();
    return mesh ? rayTriangleMeshHit(mesh, ray.origin, ray.direction) : null;
  }

  setBasaltReferenceMode(mode = 'both') {
    this.basaltReferenceMode = ['procedural', 'authored', 'both'].includes(mode) ? mode : 'both';
    if (this.world?.id === 'cave-fishing-island' && !this.workspaceDefinition) this.rebuild();
  }

  setPrefabWorkspace(definition = null) {
    this.workspaceDefinition = definition || null;
    this.selectedId = null;
    this.rebuild();
  }

  clearPrefabWorkspace() { this.setPrefabWorkspace(null); }

  setSelected(id) {
    this.selectedId = id ? String(id) : null;
    this.applySelectionMaterials();
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  setMeshSelection(selection, options = {}) {
    this.meshSelection = selection || { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.meshOverlayOptions = { ...this.meshOverlayOptions, ...options };
    this.buildMeshOverlay();
  }

  buildMeshOverlay() {
    destroyChildren(this.meshOverlayRoot);
    const mesh = this.editableBasaltTerrain();
    if (!mesh) return;
    const selection = this.meshSelection;
    const makeEdge = (key, material, radius = .035) => {
      const [a, b] = String(key).split(':').map(Number);
      const av = vertex(mesh, a), bv = vertex(mesh, b);
      const segment = createSegment(this.meshOverlayRoot, `Mesh edge ${key}`, { x: av[0], y: av[1], z: av[2] }, { x: bv[0], y: bv[1], z: bv[2] }, material);
      if (segment) segment.setLocalScale(radius, radius, Math.max(.01, segment.getLocalScale().z));
    };
    for (const id of selection.vertices ?? []) {
      const point = vertex(mesh, id);
      createPrimitive(this.meshOverlayRoot, `Mesh vertex ${id}`, 'sphere', { x: point[0], y: point[1], z: point[2] }, { x: .18, y: .18, z: .18 }, this.materials.meshVertex);
    }
    for (const key of selection.edges ?? []) makeEdge(key, this.materials.meshEdge, .06);
    for (const face of selection.faces ?? []) {
      const ids = faceVertices(mesh, face);
      const positions = ids.flatMap((id) => vertex(mesh, id));
      this.buildMeshEntity(`Selected face ${face}`, positions, [0, 1, 2], this.materials.meshFace, this.meshOverlayRoot);
    }
    const diagnostics = meshDiagnostics(mesh);
    if (this.meshOverlayOptions.showBoundary) for (const key of diagnostics.boundaryEdges) makeEdge(key, this.materials.boundary, .045);
    if (this.meshOverlayOptions.showNonManifold) for (const key of diagnostics.nonManifoldEdges) makeEdge(key, this.materials.nonManifold, .065);
  }

  setEditorHidden(id, hidden = true) {
    const key = String(id);
    if (hidden) this.editorHiddenIds.add(key); else this.editorHiddenIds.delete(key);
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  isEditorHidden(id) { return this.editorHiddenIds.has(String(id)); }

  isolateSelection(id = this.selectedId) {
    this.editorHiddenIds.clear();
    for (const key of this.entities.keys()) if (String(key) !== String(id)) this.editorHiddenIds.add(String(key));
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  showAll() {
    this.editorHiddenIds.clear();
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  applyEditorVisibility() {
    for (const [id, entity] of this.entities) entity.enabled = !this.editorHiddenIds.has(String(id));
  }

  materialForRecord(record, fallback = this.materials.platform) {
    const key = String(record?.metadata?.materialKey || '').toLowerCase();
    if (this.libraryMaterials.has(key)) return this.libraryMaterials.get(key);
    const map = {
      wall: this.materials.roomWall, ceiling: this.materials.roomCeiling, floor: this.materials.roomFloor,
      wood: this.materials.roomWood, metal: this.materials.roomMetal, glass: this.materials.roomGlass,
      fabric: this.materials.roomFabric, accent: this.materials.roomAccent, fixture: this.materials.roomFixture,
      dark: this.materials.roomDark, plant: this.materials.roomPlant, tile: this.materials.roomTile,
      partition: this.materials.roomPartition, light: this.materials.roomLight, stone: this.materials.roomFloor,
      trim: this.materials.roomAccent, 'casino-felt': this.materials.casinoFelt,
      'casino-red': this.materials.casinoRed, 'casino-purple': this.materials.casinoPurple
    };
    return map[key] || fallback;
  }

  applySelectionMaterials() {
    for (const [id, entity] of this.entities) {
      const selected = id === this.selectedId;
      const stack = [entity];
      while (stack.length) {
        const node = stack.pop();
        stack.push(...(node.children ?? []));
        for (const mesh of node.render?.meshInstances ?? []) {
          const base = node._editorBaseMaterial
            || (entity.editorKind === 'water-v2' ? this.materials.water
              : entity.editorKind === 'waypoint' ? this.materials.path
                : (node.editorKind === 'moving-platform' || entity.editorKind === 'moving-platform')
                  ? this.materials.moving : this.materials.platform);
          mesh.material = selected ? this.materials.selected : base;
        }
      }
    }
  }

  rebuild() {
    for (const root of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot, this.meshOverlayRoot]) destroyChildren(root);
    this.entities.clear();
    this.movingEntities.clear();
    this.prefabCollisionEntries = [];
    this.prefabMovingEntries = [];
    this.referenceCollisionBoxes = [];
    this.collisionEntries = [];
    this.referenceRecord = null;
    if (!this.level || !this.world) return;
    if (this.workspaceDefinition) {
      this.buildPrefabWorkspace();
      this.buildCollisionDebug();
      this.applySelectionMaterials();
      this.applyEditorVisibility();
      this.applyCollisionMode();
      return;
    }
    if (this.world.id === 'skyscraper') this.buildSkyscraperReference();
    else if (this.world.id === 'cave-fishing-island') this.buildCaveReference();
    else if (this.world.id === 'pirate-island') this.buildPirateReference();
    // Library Island's authored objects below are the production scene. Never layer the
    // retired work-pad/silhouette reference beneath the canonical scene.
    this.buildWaters();
    this.buildObjects();
    this.buildMovingPlatforms();
    this.buildPrefabInstances();
    this.buildCollisionDebug();
    this.applySelectionMaterials();
    this.applyEditorVisibility();
    this.applyCollisionMode();
    this.buildMeshOverlay();
  }

  buildSkyscraperReference() {
    this.referenceRecord = {
      id: '__architecture__',
      name: 'Empire State Building',
      type: 'architecture-reference',
      position: { x: 0, y: 190, z: 0 },
      asset: '/assets/models/empire-state-building.glb',
      attribution: 'SonnySee — CC BY 3.0',
      collision: 'hollow perimeter collision shell derived from the 13 setback layers'
    };
    for (const box of skyreachHollowCollisionBoxes(SKYREACH_TOWER_CONFIG)) {
      this.referenceCollisionBoxes.push({
        center: clone(box.center),
        size: clone(box.size),
        kind: 'building-shell',
        id: box.id
      });
    }
    this.app.assets.loadFromUrl('/assets/models/empire-state-building.glb', 'container', (error, asset) => {
      if (error || !asset?.resource || this.world?.id !== 'skyscraper') return;
      const imported = asset.resource.instantiateRenderEntity();
      const building = imported.findByName?.('ESB');
      if (!building) { imported.destroy?.(); return; }
      const plane = imported.findByName?.('Plane');
      if (plane && plane !== building) plane.enabled = false;
      for (const component of building.findComponents?.('render') ?? []) {
        for (const meshInstance of component.meshInstances ?? []) {
          const sourceName = String(meshInstance.material?.name || '').toLowerCase();
          meshInstance.material = sourceName.includes('light') ? this.materials.skyreachAccent : this.materials.skyreachFacade;
        }
      }
      const placement = new pc.Entity('ESB reference — SonnySee CC BY 3.0');
      placement.addChild(imported);
      this.referenceRoot.addChild(placement);
      placement.setLocalScale(
        SKYREACH_TOWER_CONFIG.visualHorizontalScaleX,
        SKYREACH_TOWER_CONFIG.visualVerticalScale,
        SKYREACH_TOWER_CONFIG.visualHorizontalScaleZ
      );
      placement.syncHierarchy();
      let bounds = null;
      for (const component of building.findComponents?.('render') ?? []) {
        for (const meshInstance of component.meshInstances ?? []) {
          if (!bounds) bounds = meshInstance.aabb.clone(); else bounds.add(meshInstance.aabb);
        }
      }
      if (bounds) {
        const minimum = bounds.getMin();
        const position = placement.getPosition();
        placement.setPosition(
          position.x - bounds.center.x,
          position.y - minimum.y - SKYREACH_TOWER_CONFIG.visualGroundEmbed,
          position.z - bounds.center.z
        );
      }
    });
  }

  buildCaveReference() {
    const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === 'cave-fishing-island');
    if (!location) return;
    const candidate = this.level?.terrain?.mode === 'authored-mesh-candidate' ? this.level.terrain : null;
    if (this.basaltReferenceMode !== 'authored') {
      const data = caveReferenceMesh(location);
      this.buildMeshEntity('Basalt Hollow procedural reference', data.positions, data.indices, this.materials.reference, this.referenceRoot);
    }
    if (candidate?.positions?.length && candidate?.indices?.length && this.basaltReferenceMode !== 'procedural') {
      const entity = this.buildMeshEntity('Basalt Hollow frozen production candidate', candidate.positions, candidate.indices, this.materials.referenceGlass, this.referenceRoot);
      Object.assign(entity, { editorKind: 'terrain-mesh', editorRecord: candidate, editorId: '__basalt-authored-terrain' });
      this.entities.set(entity.editorId, entity);
    }
    // Until candidate promotion, walkthrough collision intentionally remains the conservative
    // procedural reference. The candidate is visual comparison data, not a silent production switch.
    this.referenceCollisionBoxes.push({
      center: { x: 0, y: location.elevation - .05, z: 0 },
      size: { x: location.radii.x * 1.75, y: .3, z: location.radii.z * 1.75 },
      kind: 'island-reference', id: '__basalt-reference-floor'
    });
  }

  buildMeshEntity(name, positions, indices, material, parent) {
    const geometry = new pc.Geometry();
    geometry.positions = [...positions];
    geometry.indices = [...indices];
    geometry.calculateNormals();
    const mesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry);
    const entity = new pc.Entity(name);
    entity._editorOwnedMeshes = [mesh];
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, material, entity)];
    parent.addChild(entity);
    return entity;
  }

  buildPrefabWorkspace() {
    const definition = this.workspaceDefinition;
    createBox(this.workspaceRoot, 'Prefab local origin floor', { x: 0, y: -.03, z: 0 }, { x: 24, y: .06, z: 24 }, this.materials.workspaceGrid);
    this.referenceCollisionBoxes.push({ center: { x: 0, y: -.03, z: 0 }, size: { x: 24, y: .06, z: 24 }, kind: 'workspace-floor', id: '__workspace-floor' });
    for (const water of definition.waters ?? []) this.buildWaterRecord(water);
    for (const item of definition.objects ?? []) this.buildObjectRecord(item, 'prefab-child-object');
    for (const item of definition.movingPlatforms ?? []) this.buildMovingPlatformRecord(item, 'prefab-child-moving');
  }

  buildPirateReference() {
    createBox(this.referenceRoot, 'Pirate Island placeholder work pad', { x: 0, y: -.2, z: 0 }, { x: 44, y: .4, z: 36 }, this.materials.pirate);
    this.referenceCollisionBoxes.push({ center: { x: 0, y: -.2, z: 0 }, size: { x: 44, y: .4, z: 36 }, kind: 'placeholder' });
  }

  buildLibraryReference() {
    const location = SMALL_ISLAND_LOCATIONS.find((item) => item.id === 'veiled-athenaeum');
    if (!location) return;
    this.referenceRecord = {
      id: '__architecture__', name: 'The Veiled Athenaeum — production reference', type: 'architecture-reference',
      position: { x: 0, y: location.elevation, z: 0 }, collision: 'current procedural island / silhouette reference'
    };
    createBox(this.referenceRoot, 'Athenaeum island work pad', { x: 0, y: location.elevation - .18, z: 0 },
      { x: location.radii.x * 1.8, y: .36, z: location.radii.z * 1.8 }, this.materials.library);
    createBox(this.referenceRoot, 'Athenaeum obscured foundation', { x: 0, y: location.elevation + .22, z: 0 },
      { x: 12.8, y: .44, z: 10.2 }, this.materials.reference, { y: 8 });
    createBox(this.referenceRoot, 'Athenaeum distant silhouette', { x: 0, y: location.elevation + 2.45, z: .3 },
      { x: 9.2, y: 4.2, z: 6.9 }, this.materials.roomDark, { y: 8 });
    createBox(this.referenceRoot, 'Athenaeum softened roofline', { x: 0, y: location.elevation + 4.82, z: .3 },
      { x: 10.6, y: .48, z: 8.1 }, this.materials.roomWood, { x: 2, y: 8, z: -2 });
    this.referenceCollisionBoxes.push(
      { center: { x: 0, y: location.elevation - .18, z: 0 }, size: { x: location.radii.x * 1.8, y: .36, z: location.radii.z * 1.8 }, kind: 'island-reference', id: '__athenaeum-island' },
      { center: { x: 0, y: location.elevation + .22, z: 0 }, size: { x: 12.8, y: .44, z: 10.2 }, kind: 'architecture-reference', id: '__athenaeum-foundation' },
      { center: { x: 0, y: location.elevation + 2.45, z: .3 }, size: { x: 9.2, y: 4.2, z: 6.9 }, kind: 'architecture-reference', id: '__athenaeum-silhouette' }
    );
  }

  buildWaterRecord(water) {
    const radii = water.radii ?? { x: 4, z: 4 };
    const position = water.position ?? { x: 0, y: 0, z: 0 };
    const entity = new pc.Entity(water.name || water.id || 'Water');
    if (water.shape === 'path' && Array.isArray(water.metadata?.pathLocal)) {
      const oldCenter = water.metadata.pathOriginalCenter ?? [finite(position.x), finite(position.z)];
      const oldRadii = water.metadata.pathOriginalRadii ?? [finite(radii.x, 1.25), finite(radii.z, 1)];
      const sx = Math.max(.01, finite(radii.x, oldRadii[0])) / Math.max(.01, finite(oldRadii[0], 1));
      const sz = Math.max(.01, finite(radii.z, oldRadii[1])) / Math.max(.01, finite(oldRadii[1], 1));
      const points = water.metadata.pathLocal.map((point) => ({
        x: finite(position.x) + (finite(point?.[0]) - finite(oldCenter[0])) * sx,
        y: finite(position.y) - .035,
        z: finite(position.z) + (finite(point?.[1]) - finite(oldCenter[1])) * sz
      }));
      for (let index = 1; index < points.length; index += 1) {
        const segment = createSegment(entity, `${water.name || water.id} segment ${index}`, points[index - 1], points[index], this.materials.water);
        if (segment) segment.setLocalScale(Math.max(.1, finite(radii.x, 1.25) * 2), .07,
          Math.max(.1, segment.getLocalScale().z));
      }
      points.forEach((point, index) => {
        const id = `__waterpath__:${water.id || water.identity}:${index}`;
        const node = createSphere(this.waterRoot, `${water.name || water.id} path node ${index + 1}`, point, .18, this.materials.path);
        Object.assign(node, { editorKind: 'water-path-node', editorId: id, editorRecord: { ...water, pathNodeIndex: index } });
        this.entities.set(id, node);
      });
    } else {
      entity.addComponent('render', { type: 'cylinder', material: this.materials.water, castShadows: false, receiveShadows: true });
      entity.setLocalPosition(finite(position.x), finite(position.y) - .035, finite(position.z));
      entity.setLocalScale(Math.max(.1, finite(radii.x, 4) * 2), .07, Math.max(.1, finite(radii.z, 4) * 2));
    }
    entity.editorKind = this.workspaceDefinition ? 'prefab-child-water' : 'water-v2';
    entity.editorRecord = water;
    entity.editorId = String(water.id || water.identity || 'water');
    this.waterRoot.addChild(entity);
    this.entities.set(entity.editorId, entity);
    return entity;
  }

  buildWaters() { for (const water of this.level.waters ?? []) this.buildWaterRecord(water); }

  buildObjectRecord(item, kind = 'world-object') {
    if (item.visible === false) return null;
    const sourceKind = item.metadata?.librarySourceKind;
    let entity;
    if (sourceKind === 'bench') {
      entity = new pc.Entity(item.name || item.id);
      entity.setLocalPosition(item.transform.position.x, item.transform.position.y, item.transform.position.z);
      entity.setLocalEulerAngles(0, item.transform.rotation.y ?? 0, 0);
      const material = this.materialForRecord(item);
      createBox(entity, `${item.name} seat`, { x: 0, y: 0, z: 0 }, { x: 2.05, y: .18, z: .5 }, material);
      createBox(entity, `${item.name} back`, { x: 0, y: .48, z: -.28 }, { x: 2.05, y: .82, z: .18 }, material);
      this.objectRoot.addChild(entity);
      Object.assign(entity, { editorKind: kind, editorRecord: item, editorId: item.id });
    } else if (sourceKind === 'light' || sourceKind === 'marker') {
      const primitive = sourceKind === 'light' ? 'sphere' : 'cone';
      entity = createPrimitive(this.objectRoot, item.name || item.id, primitive,
        item.transform.position, item.size, this.materialForRecord(item), item.transform.rotation,
        { editorKind: kind, editorRecord: item, editorId: item.id });
    } else {
      entity = createPrimitive(this.objectRoot, item.name || item.id,
        item.metadata?.authoredPrimitive || item.type, item.transform.position, item.size,
        this.materialForRecord(item), item.transform.rotation,
        { editorKind: kind, editorRecord: item, editorId: item.id });
    }
    this.entities.set(item.id, entity);
    return entity;
  }

  buildObjects() { for (const item of this.level.objects ?? []) this.buildObjectRecord(item); }

  buildMovingPlatformRecord(item, kind = 'moving-platform') {
    if (item.visible === false) return null;
    const position = movingPlatformPose(item, this.elapsedSeconds);
    const entity = createBox(this.objectRoot, item.name || item.id, position, item.size, this.materials.moving, item.transform.rotation, {
      editorKind: kind, editorRecord: item, editorId: item.id
    });
    this.entities.set(item.id, entity);
    this.movingEntities.set(item.id, entity);
    const points = item.path?.points ?? [];
    for (let index = 0; index < points.length; index += 1) {
      const waypoint = createSphere(this.pathRoot, `${item.id} waypoint ${index + 1}`, points[index], .22, this.materials.path);
      const waypointId = `__waypoint__:${item.id}:${index}`;
      waypoint.editorKind = 'waypoint';
      waypoint.editorRecord = { platformId: item.id, index, point: points[index], workspace: Boolean(this.workspaceDefinition) };
      waypoint.editorId = waypointId;
      this.entities.set(waypointId, waypoint);
      if (index) createSegment(this.pathRoot, `${item.id} path ${index}`, points[index - 1], points[index], this.materials.path);
    }
    return entity;
  }

  buildMovingPlatforms() { for (const item of this.level.movingPlatforms ?? []) this.buildMovingPlatformRecord(item); }

  buildPrefabInstances() {
    const definitions = new Map((this.level.prefabs?.definitions ?? []).map((item) => [item.id, item]));
    const instances = [
      ...(this.level.prefabs?.instances ?? []).map((item) => ({ ...item, _editorKind: 'prefab-instance' })),
      ...(this.level.rooms ?? []).map((item) => ({ ...item, _editorKind: 'room' }))
    ];
    for (const instance of instances) {
      const definition = definitions.get(instance.prefabId);
      if (!definition) continue;
      const root = new pc.Entity(instance.name || instance.id);
      root.setLocalPosition(instance.transform.position.x, instance.transform.position.y, instance.transform.position.z);
      root.setLocalEulerAngles(instance.transform.rotation.x, instance.transform.rotation.y, instance.transform.rotation.z);
      root.setLocalScale(instance.transform.scale.x, instance.transform.scale.y, instance.transform.scale.z);
      root.editorKind = instance._editorKind;
      root.editorRecord = instance;
      root.editorId = instance.id;
      this.objectRoot.addChild(root);
      this.entities.set(instance.id, root);
      for (const child of definition.objects ?? []) {
        const entity = createPrimitive(root, child.name || child.id,
          child.metadata?.authoredPrimitive || child.type, child.transform.position, child.size,
          this.materialForRecord(child), child.transform.rotation);
        if (child.collision !== false && child.visible !== false) this.prefabCollisionEntries.push({ entity, record: child, instance });
      }
      for (const child of definition.movingPlatforms ?? []) {
        const local = movingPlatformPose(child, this.elapsedSeconds);
        const entity = createBox(root, child.name || child.id, local, child.size, this.materials.moving, child.transform.rotation);
        this.prefabMovingEntries.push({ entity, definition: child, instance });
        if (child.collision !== false && child.visible !== false) this.prefabCollisionEntries.push({ entity, record: child, instance, moving: true });
      }
      for (const sourceWater of definition.waters ?? []) {
        const water = sourceWater;
        const radii = water.radii ?? { x: 1, z: 1 };
        const position = water.position ?? { x: 0, y: 0, z: 0 };
        const entity = new pc.Entity(`${instance.name || instance.id}: ${water.name || water.id}`);
        entity.addComponent('render', { type: 'cylinder', material: this.materials.water, castShadows: false, receiveShadows: true });
        entity.setLocalPosition(finite(position.x), finite(position.y) - .035, finite(position.z));
        entity.setLocalScale(Math.max(.1, finite(radii.x, 1) * 2), .07, Math.max(.1, finite(radii.z, 1) * 2));
        entity.editorKind = 'prefab-instance-water';
        entity.editorRecord = water;
        entity.editorId = `${instance.id}/${water.id || water.identity || 'water'}`;
        root.addChild(entity);
      }
    }
  }

  buildCollisionDebug() {
    const addDebugBox = (id, name, center, size, rotation = {}) => {
      const entity = createBox(this.collisionRoot, name, center, size, this.materials.collision, rotation);
      entity.editorCollisionTargetId = id;
      this.collisionEntries.push({ id: String(id), entity });
      return entity;
    };
    for (const [index, box] of this.referenceCollisionBoxes.entries()) {
      addDebugBox(this.referenceRecord?.id ?? box.id ?? `__reference-${index}`, `Reference collider ${index + 1}`, box.center, box.size);
    }
    const sourceObjects = this.workspaceDefinition
      ? [...(this.workspaceDefinition.objects ?? []), ...(this.workspaceDefinition.movingPlatforms ?? [])]
      : [...(this.level.objects ?? []), ...(this.level.movingPlatforms ?? [])];
    for (const item of sourceObjects) {
      if (item.collision === false || item.visible === false) continue;
      if (item.metadata?.librarySourceKind === 'bench') {
        for (const [index, box] of libraryBenchCollisionBoxes(item).entries()) {
          addDebugBox(item.id, `${item.id} ${index ? 'back' : 'seat'} collider`, box.center, box.size, box.rotation);
        }
        continue;
      }
      const moving = item.type === 'moving-platform' || item.path?.points;
      const position = moving ? movingPlatformPose(item, this.elapsedSeconds) : item.transform.position;
      addDebugBox(item.id, `${item.id} collider`, position, item.size, item.transform?.rotation ?? {});
    }
    if (!this.workspaceDefinition) {
      for (const entry of this.prefabCollisionEntries) {
        entry.entity.syncHierarchy();
        const position = entry.entity.getPosition();
        const scale = entry.entity.getScale();
        const rotation = entry.entity.getEulerAngles();
        addDebugBox(entry.instance.id, `${entry.instance.id}/${entry.record.id} collider`,
          { x: position.x, y: position.y, z: position.z },
          { x: Math.abs(scale.x), y: Math.abs(scale.y), z: Math.abs(scale.z) },
          { x: rotation.x, y: rotation.y, z: rotation.z });
      }
    }
    this.applyCollisionMode();
  }

  applyCollisionMode() {
    if (!this.collisionRoot) return;
    const mode = this.collisionMode || 'normal';
    this.collisionRoot.enabled = mode !== 'normal';
    const hideVisuals = mode === 'collision-only';
    const hideSkyscraperFacade = this.world?.id === 'skyscraper' && this.skyscraperInteriorMode && !this.workspaceDefinition;
    this.referenceRoot.enabled = !hideVisuals && !hideSkyscraperFacade;
    this.workspaceRoot.enabled = !hideVisuals;
    this.waterRoot.enabled = !hideVisuals;
    this.objectRoot.enabled = !hideVisuals;
    this.pathRoot.enabled = !hideVisuals;
    for (const entry of this.collisionEntries) {
      entry.entity.enabled = mode === 'selected' ? entry.id === String(this.selectedId) : mode !== 'normal';
    }
  }

  update(dt) {
    if (!this.root.enabled || !this.level) return;
    this.elapsedSeconds += Math.max(0, Number(dt) || 0);
    for (const item of this.level.movingPlatforms ?? []) {
      const entity = this.movingEntities.get(item.id);
      if (!entity) continue;
      const point = movingPlatformPose(item, this.elapsedSeconds);
      entity.setLocalPosition(point.x, point.y, point.z);
    }
    for (const item of this.prefabMovingEntries) {
      const point = movingPlatformPose(item.definition, this.elapsedSeconds);
      item.entity.setLocalPosition(point.x, point.y, point.z);
    }
  }

  pick(ray) {
    let best = null;
    for (const [id, entity] of this.entities) {
      const position = entity.getPosition();
      const scale = entity.getLocalScale();
      const radius = Math.max(.45, Math.hypot(scale.x, scale.y, scale.z) * .55);
      const distance = raySphereDistance(ray.origin, ray.direction, position, radius);
      if (distance != null && (!best || distance < best.distance)) {
        best = { distance, id, kind: entity.editorKind, record: entity.editorRecord };
      }
    }
    if (this.world?.id === 'skyscraper' && this.referenceRecord) {
      for (const box of this.referenceCollisionBoxes) {
        const distance = rayAabbDistance(ray.origin, ray.direction, box.center, {
          x: box.size.x / 2, y: box.size.y / 2, z: box.size.z / 2
        });
        if (distance != null && (!best || distance < best.distance)) {
          best = { distance, id: this.referenceRecord.id, kind: 'architecture-reference', record: this.referenceRecord };
        }
      }
    }
    return best;
  }

  surfaceHit(ray) {
    let best = null;
    const basaltHit = this.basaltTerrainHit(ray);
    if (basaltHit && this.basaltReferenceMode !== 'procedural') {
      best = { ...basaltHit, kind: 'authored-terrain', surfaceId: '__basalt-authored-terrain' };
    }
    for (const box of this.referenceCollisionBoxes) {
      const hit = rayAabbHit(ray.origin, ray.direction, box.center, {
        x: box.size.x / 2, y: box.size.y / 2, z: box.size.z / 2
      });
      if (hit && (!best || hit.distance < best.distance)) {
        const point = ray.origin.clone().add(ray.direction.clone().mulScalar(hit.distance));
        best = { distance: hit.distance, x: point.x, y: point.y, z: point.z, kind: box.kind, normal: hit.normal, surfaceId: box.id ?? null };
      }
    }
    // A fallback editing plane keeps empty/minimal scenes placeable.
    if (Math.abs(ray.direction.y) > 1e-6) {
      const distance = -ray.origin.y / ray.direction.y;
      if (distance >= 0 && (!best || distance < best.distance)) {
        const point = ray.origin.clone().add(ray.direction.clone().mulScalar(distance));
        best = { distance, x: point.x, y: 0, z: point.z, kind: 'ground-plane', normal: { x: 0, y: 1, z: 0 }, surfaceId: '__ground-plane' };
      }
    }
    return best;
  }

  getWalkthroughBoxes() {
    const boxes = this.referenceCollisionBoxes.map((box) => ({ ...clone(box), moving: false }));
    for (const item of this.level.objects ?? []) {
      if (item.visible === false || item.collision === false) continue;
      if (item.metadata?.librarySourceKind === 'bench') {
        for (const [index, box] of libraryBenchCollisionBoxes(item).entries()) {
          boxes.push({ ...box, id: `${item.id}/${index ? 'back' : 'seat'}`, moving: false });
        }
        continue;
      }
      boxes.push({ center: clone(item.transform.position), size: clone(item.size), rotation: clone(item.transform.rotation), id: item.id, moving: false });
    }
    for (const item of this.level.movingPlatforms ?? []) {
      if (item.visible === false || item.collision === false) continue;
      boxes.push({ center: movingPlatformPose(item, this.elapsedSeconds), size: clone(item.size), rotation: clone(item.transform.rotation), id: item.id, moving: true, definition: item });
    }
    for (const entry of this.prefabCollisionEntries) {
      entry.entity.syncHierarchy();
      const position = entry.entity.getPosition();
      const scale = entry.entity.getScale();
      const rotation = entry.entity.getEulerAngles();
      boxes.push({
        center: { x: position.x, y: position.y, z: position.z },
        size: { x: Math.abs(scale.x), y: Math.abs(scale.y), z: Math.abs(scale.z) },
        rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
        id: `${entry.instance.id}/${entry.record.id}`,
        moving: false
      });
    }
    return boxes;
  }

  selectedRecord(id) {
    if (id === this.referenceRecord?.id) return this.referenceRecord;
    if (id === '__basalt-authored-terrain') return this.editableBasaltTerrain();
    if (String(id).startsWith('__waterpath__:')) return this.entities.get(String(id))?.editorRecord ?? null;
    if (String(id).startsWith('__waypoint__:')) return this.entities.get(String(id))?.editorRecord ?? null;
    if (this.workspaceDefinition) {
      return (this.workspaceDefinition.objects ?? []).find((item) => item.id === id)
        ?? (this.workspaceDefinition.movingPlatforms ?? []).find((item) => item.id === id)
        ?? (this.workspaceDefinition.waters ?? []).find((item) => String(item.id || item.identity) === String(id))
        ?? null;
    }
    return (this.level.objects ?? []).find((item) => item.id === id)
      ?? (this.level.movingPlatforms ?? []).find((item) => item.id === id)
      ?? (this.level.waters ?? []).find((item) => String(item.id || item.identity) === String(id))
      ?? (this.level.prefabs?.instances ?? []).find((item) => item.id === id)
      ?? (this.level.rooms ?? []).find((item) => item.id === id)
      ?? null;
  }
}
