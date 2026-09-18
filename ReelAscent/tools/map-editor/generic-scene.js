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
    this.meshHoverRoot = new pc.Entity('Mesh Hover Preview');
    this.pickingDebugRoot = new pc.Entity('Picking Target Debug');
    this.transformGizmoRoot = new pc.Entity('Shared Transform Gizmo');
    this.cutoutPreviewRoot = new pc.Entity('Cutout Preview');
    this.workspaceRoot = new pc.Entity('Prefab Workspace Reference');
    for (const child of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot, this.meshOverlayRoot, this.meshHoverRoot, this.pickingDebugRoot, this.transformGizmoRoot, this.cutoutPreviewRoot]) this.root.addChild(child);
    this.materials = {
      reference: makeMaterial([.45, .48, .47]),
      referenceGlass: makeMaterial([.46, .61, .7], .72),
      platform: makeMaterial([.65, .61, .48]),
      moving: makeMaterial([.28, .63, .82]),
      water: makeMaterial([.08, .54, .7], .68),
      selected: makeMaterial([1, .7, .08], 1, .08),
      selectedSecondary: makeMaterial([.98, .88, .25], 1, .045),
      diagnosticA: makeMaterial([.05, .9, 1], 1, .14),
      diagnosticB: makeMaterial([1, .12, .72], 1, .14),
      meshVertex: makeMaterial([1, .83, .12], 1, .15),
      meshEdge: makeMaterial([1, .48, .08], 1, .12),
      meshFace: makeMaterial([.98, .68, .08], .58, .12),
      meshHover: makeMaterial([.15, .95, 1], .72, .18),
      boundary: makeMaterial([1, .1, .75], 1, .18),
      nonManifold: makeMaterial([1, .08, .08], 1, .2),
      path: makeMaterial([1, .5, .08], .82, .18),
      collision: makeMaterial([1, .12, .12], .15, .12),
      pickingTarget: makeMaterial([.08, 1, .78], .12, .18),
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
    this.materials.gizmoX = makeMaterial([1, .18, .18], 1, .12);
    this.materials.gizmoY = makeMaterial([.18, 1, .3], 1, .12);
    this.materials.gizmoZ = makeMaterial([.2, .48, 1], 1, .12);
    this.materials.cutoutPreview = makeMaterial([.12, .95, 1], .34, .2);
    this.level = null;
    this.world = null;
    this.elapsedSeconds = 0;
    this.entities = new Map();
    this.rebuildRevision = 0;
    this.referenceCollisionBoxes = [];
    this.movingEntities = new Map();
    this.prefabCollisionEntries = [];
    this.prefabMovingEntries = [];
    this.selectedId = null;
    this.selectedIds = new Set();
    this.diagnosticPair = [];
    this.referenceRecord = null;
    this.collisionMode = 'normal';
    this.collisionEntries = [];
    this.workspaceDefinition = null;
    this.basaltReferenceMode = 'both';
    // The exterior must be visible when the level first opens. Interior authors can
    // explicitly enable cutaway after selecting/placing an interior room.
    this.skyscraperInteriorMode = false;
    this.editorHiddenIds = new Set();
    this.meshSelection = { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.meshOverlayOptions = { showBoundary: false, showNonManifold: false };
    this.meshHoverKey = '';
    this.pickingTargetsVisible = false;
    this.libraryMaterials = new Map();
    this.booksVisible = true;
    this.transformGizmo = { center: null, mode: 'move', handles: [] };
    this.root.enabled = false;
  }

  setWorld(world, level) {
    this.world = world;
    this.level = normalizeWorldEditorLevel(level, {
      worldId: world.id, displayName: world.label, runtimeLocationId: world.runtimeLocationId
    });
    this.elapsedSeconds = 0;
    this.selectedId = null;
    this.selectedIds.clear();
    this.libraryMaterials.clear();
    for (const [id, spec] of Object.entries(this.level.librarySceneSource?.materials ?? {})) {
      this.libraryMaterials.set(String(id).toLowerCase(), makeAuthoredMaterial(spec));
    }
    this.rebuild();
  }

  setEnabled(enabled) { this.root.enabled = Boolean(enabled); }

  setSelection(ids = [], activeId = null) {
    this.selectedIds = new Set([...ids].filter((id) => id != null).map(String));
    this.selectedId = activeId == null ? [...this.selectedIds].at(-1) ?? null : String(activeId);
    if (this.selectedId) this.selectedIds.add(this.selectedId);
    this.applySelectionMaterials();
    this.applyCollisionMode();
  }

  setSelected(id) { this.setSelection(id == null ? [] : [id], id); }

  setBooksVisible(visible = true) {
    this.booksVisible = Boolean(visible);
    for (const entity of this.root.find((node) => node._editorBook === true)) entity.enabled = this.booksVisible;
  }

  setCollisionDebug(enabled) { this.setCollisionMode(enabled ? 'overlay' : 'normal'); }

  setCollisionMode(mode = 'normal') {
    this.collisionMode = ['normal', 'overlay', 'collision-only', 'selected'].includes(mode) ? mode : 'normal';
    this.applyCollisionMode();
  }

  setSkyscraperInteriorMode(enabled = true) {
    this.skyscraperInteriorMode = Boolean(enabled);
    this.applyCollisionMode();
  }

  editableTerrainMesh() {
    const terrain = this.level?.terrain;
    const supported = (this.world?.id === 'cave-fishing-island' && terrain?.mode === 'authored-mesh-candidate')
      || (this.world?.id === 'pirate-island' && terrain?.mode === 'authored-triangle-mesh')
      || terrain?.mode === 'production-island-terrain';
    return supported && terrain?.positions?.length && terrain?.indices?.length ? terrain : null;
  }

  editableBasaltTerrain() { return this.editableTerrainMesh(); }

  terrainMeshId() {
    if (this.world?.id === 'pirate-island') return '__pirate-authored-terrain';
    if (this.world?.id === 'library-island') return '__library-production-terrain';
    if (this.level?.terrain?.mode === 'production-island-terrain') return `__${this.world?.id}-production-terrain`;
    return '__basalt-authored-terrain';
  }

  terrainMeshHit(ray) {
    const mesh = this.editableTerrainMesh();
    return mesh ? rayTriangleMeshHit(mesh, ray.origin, ray.direction) : null;
  }

  basaltTerrainHit(ray) {
    return this.terrainMeshHit(ray);
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

  setDiagnosticPair(firstId = null, secondId = null) {
    this.diagnosticPair = [firstId, secondId].filter(Boolean).map(String);
    this.applySelectionMaterials();
  }

  setPickingTargetsVisible(visible = false) {
    this.pickingTargetsVisible = Boolean(visible);
    this.buildPickingTargets();
  }

  buildPickingTargets() {
    destroyChildren(this.pickingDebugRoot);
    this.pickingDebugRoot.enabled = this.pickingTargetsVisible;
    if (!this.pickingTargetsVisible) return;
    for (const [id, entity] of this.entities) {
      entity.syncHierarchy();
      let bounds = null;
      for (const component of entity.findComponents?.('render') ?? []) for (const meshInstance of component.meshInstances ?? []) {
        if (!bounds) bounds = meshInstance.aabb.clone(); else bounds.add(meshInstance.aabb);
      }
      if (!bounds) continue;
      createBox(this.pickingDebugRoot, `Pick target ${id}`,
        { x: bounds.center.x, y: bounds.center.y, z: bounds.center.z },
        { x: bounds.halfExtents.x * 2 + .02, y: bounds.halfExtents.y * 2 + .02, z: bounds.halfExtents.z * 2 + .02 },
        this.materials.pickingTarget);
    }
  }

  setMeshSelection(selection, options = {}) {
    this.meshSelection = selection || { vertices: new Set(), edges: new Set(), faces: new Set() };
    this.meshOverlayOptions = { ...this.meshOverlayOptions, ...options };
    this.buildMeshOverlay();
  }

  setMeshHover(hit = null, mode = 'face') {
    const mesh = this.editableTerrainMesh();
    const face = hit ? Math.floor(hit.triangleOffset / 3) : -1;
    const key = mesh && face >= 0 ? `${mode}:${face}:${hit.triangleOffset}` : '';
    if (key === this.meshHoverKey) return;
    this.meshHoverKey = key;
    destroyChildren(this.meshHoverRoot);
    if (!mesh || face < 0) return;
    const ids = faceVertices(mesh, face);
    if (mode === 'vertex') {
      const id = ids.reduce((best, candidate) => {
        const p = vertex(mesh, candidate);
        const distance = Math.hypot(p[0] - hit.x, p[1] - hit.y, p[2] - hit.z);
        return distance < best.distance ? { id: candidate, distance } : best;
      }, { id: ids[0], distance: Infinity }).id;
      const point = vertex(mesh, id);
      createPrimitive(this.meshHoverRoot, `Hovered vertex ${id}`, 'sphere', { x: point[0], y: point[1], z: point[2] }, { x: .24, y: .24, z: .24 }, this.materials.meshHover);
    } else if (mode === 'edge') {
      const pair = [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]].reduce((best, candidate) => {
        const a = vertex(mesh, candidate[0]), b = vertex(mesh, candidate[1]);
        const distance = Math.hypot((a[0] + b[0]) * .5 - hit.x, (a[1] + b[1]) * .5 - hit.y, (a[2] + b[2]) * .5 - hit.z);
        return distance < best.distance ? { pair: candidate, distance } : best;
      }, { pair: [ids[0], ids[1]], distance: Infinity }).pair;
      const a = vertex(mesh, pair[0]), b = vertex(mesh, pair[1]);
      const segment = createSegment(this.meshHoverRoot, 'Hovered edge', { x: a[0], y: a[1], z: a[2] }, { x: b[0], y: b[1], z: b[2] }, this.materials.meshHover);
      if (segment) segment.setLocalScale(.08, .08, Math.max(.01, segment.getLocalScale().z));
    } else {
      this.buildMeshEntity(`Hovered face ${face}`, ids.flatMap((id) => vertex(mesh, id)), [0, 1, 2], this.materials.meshHover, this.meshHoverRoot);
    }
  }

  buildMeshOverlay() {
    destroyChildren(this.meshOverlayRoot);
    const mesh = this.editableTerrainMesh();
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

  isolateSelection(ids = this.selectedIds) {
    const keep = new Set((typeof ids === 'string' ? [ids] : [...(ids ?? [])]).map(String));
    this.editorHiddenIds.clear();
    for (const key of this.entities.keys()) if (!keep.has(String(key))) this.editorHiddenIds.add(String(key));
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
      const selected = this.selectedIds.has(String(id));
      const active = selected && String(id) === String(this.selectedId);
      const diagnosticIndex = this.diagnosticPair.indexOf(String(id));
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
          mesh.material = active ? this.materials.selected
            : selected ? this.materials.selectedSecondary
            : diagnosticIndex === 0 ? this.materials.diagnosticA
              : diagnosticIndex === 1 ? this.materials.diagnosticB : base;
        }
      }
    }
  }

  rebuild() {
    const rebuildRevision = ++this.rebuildRevision;
    for (const root of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot, this.meshOverlayRoot, this.meshHoverRoot, this.pickingDebugRoot]) destroyChildren(root);
    this.meshHoverKey = '';
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
      this.buildPickingTargets();
      return;
    }
    if (this.world.id === 'skyscraper') {
      this.buildSkyscraperReference(rebuildRevision);
      if (this.level?.terrain?.mode === 'production-island-terrain') this.buildProductionIslandTerrain();
    } else if (this.world.id === 'cave-fishing-island') {
      if (this.level?.terrain?.mode === 'production-island-terrain') this.buildProductionIslandTerrain();
      else this.buildCaveReference();
    }
    else if (this.world.id === 'pirate-island') this.buildPirateReference();
    else if (this.world.id === 'library-island') this.buildLibraryTerrain();
    else if (this.level?.terrain?.mode === 'production-island-terrain') this.buildProductionIslandTerrain();
    this.buildWaters();
    this.buildObjects();
    this.buildMovingPlatforms();
    this.buildPrefabInstances();
    this.buildCollisionDebug();
    this.applySelectionMaterials();
    this.applyEditorVisibility();
    this.applyCollisionMode();
    this.buildMeshOverlay();
    this.buildPickingTargets();
    this.setBooksVisible(this.booksVisible);
  }

  emitEditorStatus(message, detail = {}) {
    window.dispatchEvent(new CustomEvent('reel-ascent:editor-status', { detail: { message, ...detail } }));
  }

  registerSelectable(entity, { id, kind, record, worldId = this.world?.id, meshPartId = null }) {
    if (!entity || id == null) return entity;
    Object.assign(entity, {
      editorSelectable: true,
      editorId: String(id),
      editorKind: kind,
      editorRecord: record,
      editorWorldId: worldId,
      editorMeshPartId: meshPartId
    });
    this.entities.set(String(id), entity);
    return entity;
  }

  buildSkyscraperReference(rebuildRevision = this.rebuildRevision) {
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
    this.emitEditorStatus('Loading Empire State Building reference…', { state: 'loading', worldId: 'skyscraper' });
    this.app.assets.loadFromUrl('/assets/models/empire-state-building.glb', 'container', (error, asset) => {
      if (rebuildRevision !== this.rebuildRevision || this.world?.id !== 'skyscraper') return;
      if (error || !asset?.resource) {
        this.emitEditorStatus(`Empire State Building failed to load: ${error?.message || error || 'container resource unavailable'}`, { state: 'error', worldId: 'skyscraper' });
        return;
      }
      const imported = asset.resource.instantiateRenderEntity();
      // The current GLB exposes an ESB node, but render the complete imported hierarchy
      // as a safe fallback so a harmless exporter node rename can never make the editor blank.
      const building = imported.findByName?.('ESB') || imported;
      const plane = imported.findByName?.('Plane');
      if (plane && plane !== building) plane.enabled = false;
      const renderComponents = building.findComponents?.('render') ?? [];
      if (!renderComponents.some((component) => component.meshInstances?.length)) {
        imported.destroy?.();
        this.emitEditorStatus('Empire State Building failed to load: the GLB contained no render meshes.', { state: 'error', worldId: 'skyscraper' });
        return;
      }
      for (const component of renderComponents) {
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
      for (const component of renderComponents) {
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
        placement.syncHierarchy();
        let finalBounds = null;
        for (const component of renderComponents) for (const meshInstance of component.meshInstances ?? []) {
          if (!finalBounds) finalBounds = meshInstance.aabb.clone(); else finalBounds.add(meshInstance.aabb);
        }
        this.emitEditorStatus('Empire State Building reference loaded.', {
          state: 'ready', worldId: 'skyscraper',
          bounds: finalBounds ? {
            center: { x: finalBounds.center.x, y: finalBounds.center.y, z: finalBounds.center.z },
            halfExtents: { x: finalBounds.halfExtents.x, y: finalBounds.halfExtents.y, z: finalBounds.halfExtents.z }
          } : null
        });
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
      this.registerSelectable(entity, { id: '__basalt-authored-terrain', kind: 'terrain-mesh', record: candidate });
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
    const terrain = this.editableTerrainMesh();
    if (!terrain) {
      this.emitEditorStatus('Pirate Island terrain is unavailable; reload project data to regenerate the authored starter mesh.', { state: 'error', worldId: 'pirate-island' });
      return;
    }
    const entity = this.buildMeshEntity('Pirate Island authored terrain', terrain.positions, terrain.indices, this.materials.pirate, this.referenceRoot);
    this.registerSelectable(entity, { id: '__pirate-authored-terrain', kind: 'terrain-mesh', record: terrain });
    this.emitEditorStatus(`Pirate Island authored terrain ready (${terrain.positions.length / 3} vertices).`, { state: 'ready', worldId: 'pirate-island' });
  }

  buildLibraryTerrain() {
    const terrain = this.editableTerrainMesh();
    if (!terrain) {
      this.emitEditorStatus('Library production island terrain is unavailable.', { state: 'error', worldId: 'library-island' });
      return;
    }
    const entity = this.buildMeshEntity('Library Island production terrain', terrain.positions, terrain.indices, this.materials.library, this.referenceRoot);
    this.registerSelectable(entity, { id: '__library-production-terrain', kind: 'terrain-mesh', record: terrain, meshPartId: 'full-island' });
    this.emitEditorStatus(`Library production island terrain ready (${terrain.positions.length / 3} vertices).`, { state: 'ready', worldId: 'library-island' });
  }

  buildProductionIslandTerrain() {
    const terrain = this.editableTerrainMesh();
    if (!terrain) return;
    const entity = this.buildMeshEntity(`${this.world.label} production terrain`, terrain.positions, terrain.indices, this.materials.pirate, this.referenceRoot);
    this.registerSelectable(entity, { id: this.terrainMeshId(), kind: 'terrain-mesh', record: terrain, meshPartId: 'full-island' });
    this.emitEditorStatus(`${this.world.label} production island terrain ready (${terrain.positions.length / 3} vertices).`, { state: 'ready', worldId: this.world.id });
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
        this.registerSelectable(node, { id, kind: 'water-path-node', record: { ...water, pathNodeIndex: index } });
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
    this.registerSelectable(entity, { id: entity.editorId, kind: entity.editorKind, record: water });
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
    entity._editorBook = item.category === 'books' || /(^|[-_ ])book/i.test(`${item.id || ''} ${item.name || ''}`);
    this.registerSelectable(entity, { id: item.id, kind, record: item });
    return entity;
  }

  buildObjects() { for (const item of this.level.objects ?? []) this.buildObjectRecord(item); }

  buildMovingPlatformRecord(item, kind = 'moving-platform') {
    if (item.visible === false) return null;
    const position = movingPlatformPose(item, this.elapsedSeconds);
    const entity = createBox(this.objectRoot, item.name || item.id, position, item.size, this.materials.moving, item.transform.rotation, {
      editorKind: kind, editorRecord: item, editorId: item.id
    });
    this.registerSelectable(entity, { id: item.id, kind, record: item });
    this.movingEntities.set(item.id, entity);
    const points = item.path?.points ?? [];
    for (let index = 0; index < points.length; index += 1) {
      const waypoint = createSphere(this.pathRoot, `${item.id} waypoint ${index + 1}`, points[index], .22, this.materials.path);
      const waypointId = `__waypoint__:${item.id}:${index}`;
      waypoint.editorKind = 'waypoint';
      waypoint.editorRecord = { platformId: item.id, index, point: points[index], workspace: Boolean(this.workspaceDefinition) };
      waypoint.editorId = waypointId;
      this.registerSelectable(waypoint, { id: waypointId, kind: 'waypoint', record: waypoint.editorRecord });
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
      if (!definition) {
        this.emitEditorStatus(`Prefab source missing: ${instance.prefabId || '(empty id)'} for ${instance.name || instance.id}.`, { state: 'error', worldId: this.world?.id });
        continue;
      }
      const root = new pc.Entity(instance.name || instance.id);
      root.setLocalPosition(instance.transform.position.x, instance.transform.position.y, instance.transform.position.z);
      root.setLocalEulerAngles(instance.transform.rotation.x, instance.transform.rotation.y, instance.transform.rotation.z);
      root.setLocalScale(instance.transform.scale.x, instance.transform.scale.y, instance.transform.scale.z);
      root.editorKind = instance._editorKind;
      root.editorRecord = instance;
      root.editorId = instance.id;
      this.objectRoot.addChild(root);
      this.registerSelectable(root, { id: instance.id, kind: instance._editorKind, record: instance });
      for (const child of definition.objects ?? []) {
        const entity = createPrimitive(root, child.name || child.id,
          child.metadata?.authoredPrimitive || child.type, child.transform.position, child.size,
          this.materialForRecord(child), child.transform.rotation);
        entity._editorBook = child.category === 'books' || /(^|[-_ ])book/i.test(`${child.id || ''} ${child.name || ''}`);
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
      entry.entity.enabled = mode === 'selected' ? this.selectedIds.has(String(entry.id)) : mode !== 'normal';
    }
  }

  entityBounds(id) {
    const entity = this.entities.get(String(id));
    if (!entity) return null;
    entity.syncHierarchy();
    let bounds = null;
    for (const component of entity.findComponents?.('render') ?? []) for (const meshInstance of component.meshInstances ?? []) {
      if (!meshInstance.aabb) continue;
      if (!bounds) bounds = meshInstance.aabb.clone(); else bounds.add(meshInstance.aabb);
    }
    if (!bounds) {
      const position = entity.getPosition();
      bounds = new pc.BoundingBox(position.clone(), new pc.Vec3(.25, .25, .25));
    }
    return bounds;
  }

  selectionBounds(ids = this.selectedIds) {
    let bounds = null;
    for (const id of ids) {
      const item = this.entityBounds(id);
      if (!item) continue;
      if (!bounds) bounds = item.clone(); else bounds.add(item);
    }
    return bounds;
  }

  worldBounds() {
    return this.selectionBounds(this.entities.keys());
  }

  setTransformGizmo(center = null, mode = 'move', visible = true) {
    destroyChildren(this.transformGizmoRoot);
    this.transformGizmo = { center: center ? { ...center } : null, mode, handles: [] };
    this.transformGizmoRoot.enabled = Boolean(visible && center);
    if (!visible || !center) return;
    const length = mode === 'rotate' ? 1.7 : 2.4;
    const thickness = mode === 'scale' ? .2 : .11;
    const definitions = [
      ['x', { x: center.x + length / 2, y: center.y, z: center.z }, { x: length, y: thickness, z: thickness }, this.materials.gizmoX],
      ['y', { x: center.x, y: center.y + length / 2, z: center.z }, { x: thickness, y: length, z: thickness }, this.materials.gizmoY],
      ['z', { x: center.x, y: center.y, z: center.z + length / 2 }, { x: thickness, y: thickness, z: length }, this.materials.gizmoZ]
    ];
    for (const [axis, position, size, material] of definitions) {
      const entity = createBox(this.transformGizmoRoot, `${mode} ${axis.toUpperCase()} handle`, position, size, material);
      this.transformGizmo.handles.push({ axis, entity });
    }
  }

  pickTransformGizmo(ray) {
    let best = null;
    for (const handle of this.transformGizmo.handles ?? []) {
      handle.entity.syncHierarchy();
      const component = handle.entity.render;
      for (const instance of component?.meshInstances ?? []) {
        const distance = rayAabbDistance(ray.origin, ray.direction, instance.aabb.center, instance.aabb.halfExtents);
        if (distance != null && (!best || distance < best.distance)) best = { distance, axis: handle.axis, mode: this.transformGizmo.mode };
      }
    }
    return best;
  }

  setCutoutPreview(record = null, center = null, size = null, thicknessAxis = 'y') {
    destroyChildren(this.cutoutPreviewRoot);
    this.cutoutPreviewRoot.enabled = Boolean(record && center && size);
    if (!record || !center || !size) return;
    const dimensions = { x: .035, y: .035, z: .035 };
    for (const axis of ['x', 'y', 'z']) dimensions[axis] = axis === thicknessAxis
      ? Math.max(.04, finite(record.size?.[axis], .1) + .04)
      : Math.max(.05, finite(size?.[axis], 1));
    createBox(this.cutoutPreviewRoot, 'Opening preview', center, dimensions, this.materials.cutoutPreview, record.transform?.rotation ?? {});
  }

  recordSurfaceHit(id, ray) {
    const bounds = this.entityBounds(id);
    if (!bounds) return null;
    const hit = rayAabbHit(ray.origin, ray.direction, bounds.center, bounds.halfExtents);
    if (!hit) return null;
    const point = ray.origin.clone().add(ray.direction.clone().mulScalar(hit.distance));
    return { ...hit, x: point.x, y: point.y, z: point.z, surfaceId: String(id) };
  }

  entitiesInScreenRect(cameraEntity, rectangle = {}) {
    const minX = Math.min(rectangle.x0, rectangle.x1), maxX = Math.max(rectangle.x0, rectangle.x1);
    const minY = Math.min(rectangle.y0, rectangle.y1), maxY = Math.max(rectangle.y0, rectangle.y1);
    const result = [];
    for (const [id, entity] of this.entities) {
      if (!entity.enabled) continue;
      const bounds = this.entityBounds(id);
      if (!bounds) continue;
      const screen = cameraEntity.camera.worldToScreen(bounds.center);
      if (screen.z >= 0 && screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY) {
        result.push({ id, kind: entity.editorKind, record: entity.editorRecord });
      }
    }
    return result;
  }

  selectableItems() {
    return [...this.entities.entries()].map(([id, entity]) => ({
      id, kind: entity.editorKind, record: entity.editorRecord
    }));
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
    return this.pickAll(ray)[0] ?? null;
  }

  pickAll(ray) {
    const terrainHit = this.terrainMeshHit(ray);
    const hits = terrainHit ? [{
      distance: terrainHit.distance,
      id: this.terrainMeshId(), kind: 'terrain-mesh', record: this.editableTerrainMesh()
    }] : [];
    for (const [id, entity] of this.entities) {
      if (entity.editorKind === 'terrain-mesh') continue; // exact triangle hit above, never a loose terrain AABB proxy
      let entityDistance = null;
      entity.syncHierarchy();
      for (const component of entity.findComponents?.('render') ?? []) {
        for (const meshInstance of component.meshInstances ?? []) {
          const box = meshInstance.aabb;
          if (!box) continue;
          const distance = rayAabbDistance(ray.origin, ray.direction, box.center, box.halfExtents);
          if (distance != null && (entityDistance == null || distance < entityDistance)) entityDistance = distance;
        }
      }
      // Water-path nodes and deliberately empty prefab roots still need a modest pick target.
      if (entityDistance == null) {
        const position = entity.getPosition();
        entityDistance = raySphereDistance(ray.origin, ray.direction, position, .45);
      }
      if (entityDistance != null) hits.push({ distance: entityDistance, id, kind: entity.editorKind, record: entity.editorRecord });
    }
    if (this.world?.id === 'skyscraper' && this.referenceRecord) {
      for (const box of this.referenceCollisionBoxes) {
        const distance = rayAabbDistance(ray.origin, ray.direction, box.center, {
          x: box.size.x / 2, y: box.size.y / 2, z: box.size.z / 2
        });
        if (distance != null) hits.push({ distance, id: this.referenceRecord.id, kind: 'architecture-reference', record: this.referenceRecord });
      }
    }
    return hits.sort((left, right) => left.distance - right.distance);
  }

  surfaceHit(ray) {
    let best = null;
    const terrainHit = this.terrainMeshHit(ray);
    if (terrainHit && (this.world?.id !== 'cave-fishing-island' || this.basaltReferenceMode !== 'procedural')) {
      best = { ...terrainHit, kind: 'authored-terrain', surfaceId: this.terrainMeshId() };
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
    if (String(id) === this.terrainMeshId()) return this.editableTerrainMesh();
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
