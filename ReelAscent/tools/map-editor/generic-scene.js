import * as pc from 'playcanvas';
import { SMALL_ISLAND_LOCATIONS } from '../../src/world/world-locations.js';
import { SKYREACH_TOWER_CONFIG } from '../../src/world/mountain-v2.js';
import { movingPlatformPose, normalizeWorldEditorLevel } from '../../src/world/world-editor-v2-runtime.js';

const clone = (value) => value == null ? value : structuredClone(value);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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
    this.workspaceRoot = new pc.Entity('Prefab Workspace Reference');
    for (const child of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot]) this.root.addChild(child);
    this.materials = {
      reference: makeMaterial([.45, .48, .47]),
      referenceGlass: makeMaterial([.46, .61, .7], .72),
      platform: makeMaterial([.65, .61, .48]),
      moving: makeMaterial([.28, .63, .82]),
      water: makeMaterial([.08, .54, .7], .68),
      selected: makeMaterial([1, .7, .08], 1, .08),
      path: makeMaterial([1, .5, .08], .82, .18),
      collision: makeMaterial([1, .12, .12], .15, .12),
      pirate: makeMaterial([.27, .42, .28]),
      workspaceGrid: makeMaterial([.34, .38, .31], .28)
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
    this.editorHiddenIds = new Set();
    this.root.enabled = false;
  }

  setWorld(world, level) {
    this.world = world;
    this.level = normalizeWorldEditorLevel(level, {
      worldId: world.id, displayName: world.label, runtimeLocationId: world.runtimeLocationId
    });
    this.elapsedSeconds = 0;
    this.selectedId = null;
    this.rebuild();
  }

  setEnabled(enabled) { this.root.enabled = Boolean(enabled); }

  setCollisionDebug(enabled) { this.setCollisionMode(enabled ? 'overlay' : 'normal'); }

  setCollisionMode(mode = 'normal') {
    this.collisionMode = ['normal', 'overlay', 'collision-only', 'selected'].includes(mode) ? mode : 'normal';
    this.applyCollisionMode();
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

  setEditorHidden(id, hidden = true) {
    const key = String(id);
    if (hidden) this.editorHiddenIds.add(key); else this.editorHiddenIds.delete(key);
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  isEditorHidden(id) { return this.editorHiddenIds.has(String(id)); }

  applyEditorVisibility() {
    for (const [id, entity] of this.entities) entity.enabled = !this.editorHiddenIds.has(String(id));
  }

  applySelectionMaterials() {
    for (const [id, entity] of this.entities) {
      const selected = id === this.selectedId;
      const stack = [entity];
      while (stack.length) {
        const node = stack.pop();
        stack.push(...(node.children ?? []));
        for (const mesh of node.render?.meshInstances ?? []) {
          const base = entity.editorKind === 'water-v2'
            ? this.materials.water
            : entity.editorKind === 'waypoint' ? this.materials.path
              : (node.editorKind === 'moving-platform' || entity.editorKind === 'moving-platform')
                ? this.materials.moving : this.materials.platform;
          mesh.material = selected ? this.materials.selected : base;
        }
      }
    }
  }

  rebuild() {
    for (const root of [this.referenceRoot, this.workspaceRoot, this.waterRoot, this.objectRoot, this.pathRoot, this.collisionRoot]) destroyChildren(root);
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
    this.buildWaters();
    this.buildObjects();
    this.buildMovingPlatforms();
    this.buildPrefabInstances();
    this.buildCollisionDebug();
    this.applySelectionMaterials();
    this.applyEditorVisibility();
    this.applyCollisionMode();
  }

  buildSkyscraperReference() {
    this.referenceRecord = {
      id: '__architecture__',
      name: 'Empire State Building',
      type: 'architecture-reference',
      position: { x: 0, y: 190, z: 0 },
      asset: '/assets/models/empire-state-building.glb',
      attribution: 'SonnySee — CC BY 3.0',
      collision: '13-volume runtime proxy'
    };
    for (const layer of SKYREACH_TOWER_CONFIG.collisionLayers) {
      this.referenceCollisionBoxes.push({
        center: { x: 0, y: (layer.bottom + layer.top) / 2, z: 0 },
        size: { x: layer.width, y: layer.top - layer.bottom, z: layer.depth },
        kind: 'building', id: `__esb-collider-${this.referenceCollisionBoxes.length + 1}`
      });
    }
    this.app.assets.loadFromUrl('/assets/models/empire-state-building.glb', 'container', (error, asset) => {
      if (error || !asset?.resource || this.world?.id !== 'skyscraper') return;
      const imported = asset.resource.instantiateRenderEntity();
      const building = imported.findByName?.('ESB');
      if (!building) { imported.destroy?.(); return; }
      const plane = imported.findByName?.('Plane');
      if (plane && plane !== building) plane.enabled = false;
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
      this.buildMeshEntity('Basalt Hollow frozen production candidate', candidate.positions, candidate.indices, this.materials.referenceGlass, this.referenceRoot);
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

  buildWaterRecord(water) {
    const radii = water.radii ?? { x: 4, z: 4 };
    const position = water.position ?? { x: 0, y: 0, z: 0 };
    const entity = new pc.Entity(water.name || water.id || 'Water');
    entity.addComponent('render', { type: 'cylinder', material: this.materials.water, castShadows: false, receiveShadows: true });
    entity.setLocalPosition(finite(position.x), finite(position.y) - .035, finite(position.z));
    entity.setLocalScale(Math.max(.1, finite(radii.x, 4) * 2), .07, Math.max(.1, finite(radii.z, 4) * 2));
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
    const entity = createBox(this.objectRoot, item.name || item.id, item.transform.position, item.size, this.materials.platform, item.transform.rotation, {
      editorKind: kind, editorRecord: item, editorId: item.id
    });
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
        const entity = createBox(root, child.name || child.id, child.transform.position, child.size, this.materials.platform, child.transform.rotation);
        if (child.collision !== false && child.visible !== false) this.prefabCollisionEntries.push({ entity, record: child, instance });
      }
      for (const child of definition.movingPlatforms ?? []) {
        const local = movingPlatformPose(child, this.elapsedSeconds);
        const entity = createBox(root, child.name || child.id, local, child.size, this.materials.moving, child.transform.rotation);
        this.prefabMovingEntries.push({ entity, definition: child, instance });
        if (child.collision !== false && child.visible !== false) this.prefabCollisionEntries.push({ entity, record: child, instance, moving: true });
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
    this.referenceRoot.enabled = !hideVisuals;
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
