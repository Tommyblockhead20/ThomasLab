import * as pc from 'playcanvas';

export const WORLD_EDITOR_LEVEL_SCHEMA = 2;
export const WORLD_EDITOR_LEVEL_KIND = 'reel-ascent-world-level';

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => value == null ? value : structuredClone(value);

export function normalizeTransform(value = {}) {
  const position = value.position ?? {};
  const rotation = value.rotation ?? {};
  const scale = value.scale ?? {};
  return {
    position: { x: finite(position.x), y: finite(position.y), z: finite(position.z) },
    rotation: { x: finite(rotation.x), y: finite(rotation.y), z: finite(rotation.z) },
    scale: {
      x: Math.max(.001, finite(scale.x, 1)),
      y: Math.max(.001, finite(scale.y, 1)),
      z: Math.max(.001, finite(scale.z, 1))
    }
  };
}

function normalizeObject(item = {}, index = 0) {
  const id = String(item.id || `OBJECT-${index + 1}`);
  const transform = normalizeTransform(item.transform ?? item);
  return {
    id,
    name: String(item.name || id),
    type: String(item.type || 'box'),
    category: String(item.category || 'decor'),
    parentId: item.parentId ? String(item.parentId) : null,
    prefabInstanceId: item.prefabInstanceId ? String(item.prefabInstanceId) : null,
    transform,
    size: {
      x: Math.max(.05, finite(item.size?.x, transform.scale.x)),
      y: Math.max(.05, finite(item.size?.y, transform.scale.y)),
      z: Math.max(.05, finite(item.size?.z, transform.scale.z))
    },
    collision: item.collision !== false,
    climbMaterial: item.climbMaterial == null ? null : String(item.climbMaterial),
    visible: item.visible !== false,
    metadata: item.metadata && typeof item.metadata === 'object' ? clone(item.metadata) : {}
  };
}

function normalizePathPoint(point = {}) {
  return { x: finite(point.x), y: finite(point.y), z: finite(point.z) };
}

export function normalizeMovingPlatform(item = {}, index = 0) {
  const id = String(item.id || `MOVING-PLATFORM-${index + 1}`);
  const transform = normalizeTransform(item.transform ?? item);
  const points = Array.isArray(item.path?.points) ? item.path.points.map(normalizePathPoint) : [];
  if (points.length === 0) points.push(clone(transform.position));
  if (points.length === 1) points.push({ ...points[0], y: points[0].y + 4 });
  return {
    id,
    name: String(item.name || id),
    type: 'moving-platform',
    category: String(item.category || 'moving-platforms'),
    parentId: item.parentId ? String(item.parentId) : null,
    prefabInstanceId: item.prefabInstanceId ? String(item.prefabInstanceId) : null,
    transform,
    size: {
      x: Math.max(.1, finite(item.size?.x, 3)),
      y: Math.max(.1, finite(item.size?.y, .45)),
      z: Math.max(.1, finite(item.size?.z, 3))
    },
    collision: item.collision !== false,
    climbMaterial: item.climbMaterial == null ? 'normal' : String(item.climbMaterial),
    path: {
      points,
      speed: Math.max(.05, finite(item.path?.speed, 2.5)),
      pauseSeconds: Math.max(0, finite(item.path?.pauseSeconds, .5)),
      mode: ['loop', 'ping-pong', 'once'].includes(item.path?.mode) ? item.path.mode : 'ping-pong',
      phaseSeconds: finite(item.path?.phaseSeconds, 0)
    },
    visible: item.visible !== false,
    metadata: item.metadata && typeof item.metadata === 'object' ? clone(item.metadata) : {}
  };
}

function normalizePrefabDefinition(definition = {}, index = 0) {
  const id = String(definition.id || `PREFAB-${index + 1}`);
  return {
    id,
    name: String(definition.name || id),
    kind: String(definition.kind || 'assembly'),
    version: Math.max(1, Math.trunc(finite(definition.version, 1))),
    objects: Array.isArray(definition.objects) ? definition.objects.map(normalizeObject) : [],
    movingPlatforms: Array.isArray(definition.movingPlatforms) ? definition.movingPlatforms.map(normalizeMovingPlatform) : [],
    waters: Array.isArray(definition.waters) ? clone(definition.waters) : [],
    metadata: definition.metadata && typeof definition.metadata === 'object' ? clone(definition.metadata) : {}
  };
}

function normalizePrefabInstance(instance = {}, index = 0) {
  const id = String(instance.id || `PREFAB-INSTANCE-${index + 1}`);
  return {
    id,
    name: String(instance.name || id),
    prefabId: String(instance.prefabId || ''),
    linked: instance.linked !== false,
    transform: normalizeTransform(instance.transform),
    metadata: instance.metadata && typeof instance.metadata === 'object' ? clone(instance.metadata) : {}
  };
}

function normalizeRoom(room = {}, index = 0) {
  const id = String(room.id || `ROOM-${index + 1}`);
  return {
    id,
    name: String(room.name || id),
    prefabId: String(room.prefabId || ''),
    linked: room.linked !== false,
    transform: normalizeTransform(room.transform),
    metadata: room.metadata && typeof room.metadata === 'object' ? clone(room.metadata) : {}
  };
}

export function makeWorldEditorLevel({ worldId, displayName = worldId, runtimeLocationId = null } = {}) {
  return {
    schema: WORLD_EDITOR_LEVEL_SCHEMA,
    kind: WORLD_EDITOR_LEVEL_KIND,
    worldId: String(worldId || 'unknown'),
    displayName: String(displayName || worldId || 'World'),
    runtimeLocationId: runtimeLocationId ? String(runtimeLocationId) : null,
    updatedAt: new Date().toISOString(),
    sourcePolicy: {
      terrain: 'procedural',
      architecture: 'procedural',
      waters: 'procedural',
      objects: 'authored',
      movingPlatforms: 'authored',
      prefabs: 'authored'
    },
    terrain: null,
    waters: [],
    objects: [],
    movingPlatforms: [],
    prefabs: { definitions: [], instances: [] },
    rooms: [],
    metadata: {}
  };
}

export function normalizeWorldEditorLevel(input, defaults = {}) {
  const base = makeWorldEditorLevel(defaults);
  const source = input && typeof input === 'object' ? input : {};
  const prefabs = source.prefabs && typeof source.prefabs === 'object' ? source.prefabs : {};
  const level = {
    ...base,
    ...source,
    schema: WORLD_EDITOR_LEVEL_SCHEMA,
    kind: WORLD_EDITOR_LEVEL_KIND,
    worldId: String(source.worldId || defaults.worldId || base.worldId),
    displayName: String(source.displayName || defaults.displayName || base.displayName),
    runtimeLocationId: source.runtimeLocationId ?? defaults.runtimeLocationId ?? null,
    sourcePolicy: { ...base.sourcePolicy, ...(source.sourcePolicy ?? {}) },
    terrain: source.terrain && typeof source.terrain === 'object' ? clone(source.terrain) : null,
    waters: Array.isArray(source.waters) ? clone(source.waters) : [],
    objects: Array.isArray(source.objects) ? source.objects.map(normalizeObject) : [],
    movingPlatforms: Array.isArray(source.movingPlatforms) ? source.movingPlatforms.map(normalizeMovingPlatform) : [],
    prefabs: {
      definitions: Array.isArray(prefabs.definitions) ? prefabs.definitions.map(normalizePrefabDefinition) : [],
      instances: Array.isArray(prefabs.instances) ? prefabs.instances.map(normalizePrefabInstance) : []
    },
    rooms: Array.isArray(source.rooms) ? source.rooms.map(normalizeRoom) : [],
    metadata: source.metadata && typeof source.metadata === 'object' ? clone(source.metadata) : {}
  };
  return level;
}

export function wrapLegacyStoneveilPatch(patch) {
  const level = makeWorldEditorLevel({
    worldId: 'stoneveil-peak', displayName: 'Stoneveil Peak', runtimeLocationId: 'main-mountain'
  });
  level.sourcePolicy = {
    terrain: patch?.terrain?.bakedMesh ? 'authored' : 'hybrid',
    architecture: 'procedural',
    waters: Object.keys(patch?.fishingOverrides ?? {}).length ? 'hybrid' : 'procedural',
    objects: (patch?.placedObjects?.length || Object.keys(patch?.objectOverrides ?? {}).length) ? 'hybrid' : 'procedural',
    movingPlatforms: 'authored',
    prefabs: 'authored'
  };
  level.terrain = {
    mode: patch?.terrain?.bakedMesh ? 'authored-triangle-mesh' : 'legacy-heightfield',
    format: patch?.terrain?.bakedMesh?.format ?? null,
    legacyPatchSchema: Number(patch?.schema) || 1
  };
  level.metadata = {
    compatibility: {
      format: 'map-editor-patch-v1',
      runtimePath: 'src/world/map-editor-patch.json',
      note: 'Legacy patch remains the production-safe Stoneveil source until the runtime import is intentionally switched.'
    }
  };
  level.legacyStoneveilPatch = clone(patch);
  level.updatedAt = patch?.updatedAt ?? level.updatedAt;
  return level;
}

export function unwrapLegacyStoneveilPatch(levelOrPatch) {
  if (levelOrPatch?.kind === WORLD_EDITOR_LEVEL_KIND && levelOrPatch?.worldId === 'stoneveil-peak') {
    return clone(levelOrPatch.legacyStoneveilPatch ?? null);
  }
  return clone(levelOrPatch);
}

function pointDistance(a, b) {
  return Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0), (b.z ?? 0) - (a.z ?? 0));
}

function pathSegments(points) {
  const segments = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = pointDistance(points[index], points[index + 1]);
    if (length > .0001) segments.push({ a: points[index], b: points[index + 1], length });
  }
  return segments;
}

function pointOnSegments(segments, distance) {
  if (!segments.length) return { x: 0, y: 0, z: 0 };
  let remaining = Math.max(0, distance);
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const t = clamp(remaining / segment.length, 0, 1);
      return {
        x: segment.a.x + (segment.b.x - segment.a.x) * t,
        y: segment.a.y + (segment.b.y - segment.a.y) * t,
        z: segment.a.z + (segment.b.z - segment.a.z) * t
      };
    }
    remaining -= segment.length;
  }
  return clone(segments.at(-1).b);
}

export function movingPlatformPose(definition, elapsedSeconds = 0) {
  const platform = normalizeMovingPlatform(definition);
  const points = platform.path.points;
  const forward = pathSegments(points);
  const forwardLength = forward.reduce((sum, segment) => sum + segment.length, 0);
  if (forwardLength <= .0001) return clone(points[0]);
  const speed = platform.path.speed;
  const travelSeconds = forwardLength / speed;
  const pause = platform.path.pauseSeconds;
  let time = Math.max(0, finite(elapsedSeconds) + platform.path.phaseSeconds);

  if (platform.path.mode === 'once') {
    return pointOnSegments(forward, Math.min(forwardLength, Math.max(0, time - pause) * speed));
  }

  if (platform.path.mode === 'loop') {
    const cycle = Math.max(.001, travelSeconds + pause);
    const phase = time % cycle;
    if (phase >= travelSeconds) return clone(points.at(-1));
    return pointOnSegments(forward, phase * speed);
  }

  const cycle = Math.max(.001, travelSeconds * 2 + pause * 2);
  time %= cycle;
  if (time < travelSeconds) return pointOnSegments(forward, time * speed);
  time -= travelSeconds;
  if (time < pause) return clone(points.at(-1));
  time -= pause;
  if (time < travelSeconds) return pointOnSegments(forward, forwardLength - time * speed);
  return clone(points[0]);
}

function materialForObject(world, item) {
  if (item.category === 'moving-platforms') return world.materials?.metal ?? world.materials?.cabinTrim ?? world.materials?.rock;
  if (item.category === 'parkour') return world.materials?.decoStone ?? world.materials?.rock ?? world.materials?.alpine;
  return world.materials?.wood ?? world.materials?.rock ?? world.materials?.alpine;
}

function registerClimb(world, entity, climbMaterial, label) {
  if (!climbMaterial || !entity?.physicsCollider) return;
  if (typeof world.registerClimbSurface === 'function') {
    world.registerClimbSurface(entity, entity.physicsCollider, climbMaterial, label);
    return;
  }
  if (!world.climbSurfaces) return;
  world.climbSurfaces.set(entity.physicsCollider.handle, {
    collider: entity.physicsCollider, entity, label, type: climbMaterial,
    material: { id: climbMaterial, grippable: climbMaterial !== 'ungrippable', staminaMultiplier: 1 },
    staminaMultiplier: 1
  });
}

function addStaticObject(world, root, item) {
  if (item.visible === false) return null;
  const rootScale = root.getScale?.() ?? { x: 1, y: 1, z: 1 };
  const colliderSize = {
    x: item.size.x * Math.abs(rootScale.x || 1),
    y: item.size.y * Math.abs(rootScale.y || 1),
    z: item.size.z * Math.abs(rootScale.z || 1)
  };
  const entity = world.addStructureBox(
    root,
    `WorldEditor ${item.name}`,
    item.transform.position,
    colliderSize,
    materialForObject(world, item),
    item.transform.rotation,
    item.collision
  );
  // addStructureBox uses the size both for render and collider. Restore the authored local
  // visual size after giving Rapier the composed parent-scale extents.
  entity.setLocalScale(item.size.x, item.size.y, item.size.z);
  entity.worldEditorId = item.id;
  entity.worldEditorRecord = item;
  registerClimb(world, entity, item.climbMaterial, item.name);
  return entity;
}

function addMovingPlatform(world, root, item) {
  if (item.visible === false) return null;
  const entity = new pc.Entity(`WorldEditor ${item.name}`);
  entity.addComponent('render', {
    type: 'box', material: materialForObject(world, item), castShadows: true, receiveShadows: true
  });
  entity.setLocalScale(item.size.x, item.size.y, item.size.z);
  entity.setLocalEulerAngles(item.transform.rotation.x, item.transform.rotation.y, item.transform.rotation.z);
  root.addChild(entity);
  const initialLocal = movingPlatformPose(item, 0);
  entity.setLocalPosition(initialLocal.x, initialLocal.y, initialLocal.z);
  entity.syncHierarchy();
  const worldPosition = entity.getPosition();
  const worldRotation = entity.getRotation();
  const bodyDesc = world.RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
    .setRotation({ x: worldRotation.x, y: worldRotation.y, z: worldRotation.z, w: worldRotation.w });
  const body = world.physicsWorld.createRigidBody(bodyDesc);
  const rootScale = root.getScale?.() ?? { x: 1, y: 1, z: 1 };
  const colliderDesc = world.RAPIER.ColliderDesc.cuboid(
    item.size.x * Math.abs(rootScale.x || 1) / 2,
    item.size.y * Math.abs(rootScale.y || 1) / 2,
    item.size.z * Math.abs(rootScale.z || 1) / 2
  ).setFriction(.94).setRestitution(0);
  const collider = world.physicsWorld.createCollider(colliderDesc, body);
  entity.physicsBody = body;
  entity.physicsCollider = collider;
  entity.worldEditorId = item.id;
  entity.worldEditorRecord = item;
  registerClimb(world, entity, item.climbMaterial, item.name);
  return { entity, body, collider, definition: item, previousWorldPosition: worldPosition.clone() };
}

function instanceChildRecord(instance, child) {
  const copy = clone(child);
  copy.id = `${instance.id}/${child.id}`;
  copy.name = `${instance.name}: ${child.name || child.id}`;
  copy.prefabInstanceId = instance.id;
  return copy;
}

function attachPrefabLikeInstance(world, root, definition, instance, state) {
  const instanceRoot = new pc.Entity(`WorldEditor ${definition.kind} ${instance.name}`);
  instanceRoot.setLocalPosition(
    instance.transform.position.x, instance.transform.position.y, instance.transform.position.z
  );
  instanceRoot.setLocalEulerAngles(
    instance.transform.rotation.x, instance.transform.rotation.y, instance.transform.rotation.z
  );
  instanceRoot.setLocalScale(
    instance.transform.scale.x, instance.transform.scale.y, instance.transform.scale.z
  );
  instanceRoot.worldEditorId = instance.id;
  instanceRoot.worldEditorPrefabId = definition.id;
  root.addChild(instanceRoot);
  state.prefabRoots.push(instanceRoot);

  for (const child of definition.objects ?? []) {
    const entity = addStaticObject(world, instanceRoot, instanceChildRecord(instance, child));
    if (entity) state.staticEntities.push(entity);
  }
  for (const child of definition.movingPlatforms ?? []) {
    const platform = addMovingPlatform(world, instanceRoot, instanceChildRecord(instance, child));
    if (platform) state.movingPlatforms.push(platform);
  }
  // Waters/interactables are intentionally retained in the prefab schema even though the
  // milestone-1 production bridge only instantiates collision/parkour geometry. Keeping them
  // local to the prefab definition avoids a future room-coordinate migration.
  return instanceRoot;
}

export function attachWorldEditorLevelToStructure(world, root, levelInput) {
  const level = normalizeWorldEditorLevel(levelInput);
  if (!world || !root || !world.RAPIER || !world.physicsWorld) return null;
  const state = { level, root, staticEntities: [], movingPlatforms: [], prefabRoots: [], elapsedSeconds: 0 };
  for (const item of level.objects) {
    const entity = addStaticObject(world, root, item);
    if (entity) state.staticEntities.push(entity);
  }
  for (const item of level.movingPlatforms) {
    const platform = addMovingPlatform(world, root, item);
    if (platform) state.movingPlatforms.push(platform);
  }
  const definitions = new Map(level.prefabs.definitions.map((definition) => [definition.id, definition]));
  for (const instance of level.prefabs.instances) {
    const definition = definitions.get(instance.prefabId);
    if (definition) attachPrefabLikeInstance(world, root, definition, instance, state);
  }
  for (const room of level.rooms) {
    const definition = definitions.get(room.prefabId);
    if (definition) attachPrefabLikeInstance(world, root, definition, room, state);
  }
  world.worldEditorV2States ??= [];
  world.worldEditorV2States.push(state);
  return state;
}

export function updateWorldEditorKinematics(world, dt = 1 / 60) {
  const states = world?.worldEditorV2States ?? [];
  for (const state of states) {
    state.elapsedSeconds += Math.max(0, finite(dt, 1 / 60));
    for (const platform of state.movingPlatforms) {
      const local = movingPlatformPose(platform.definition, state.elapsedSeconds);
      platform.entity.setLocalPosition(local.x, local.y, local.z);
      platform.entity.syncHierarchy();
      const next = platform.entity.getPosition();
      const rotation = platform.entity.getRotation();
      platform.body.setNextKinematicTranslation({ x: next.x, y: next.y, z: next.z });
      platform.body.setNextKinematicRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
      if (world.movingSurfaceMotion && platform.collider) {
        world.movingSurfaceMotion.set(platform.collider.handle, {
          x: next.x - platform.previousWorldPosition.x,
          y: next.y - platform.previousWorldPosition.y,
          z: next.z - platform.previousWorldPosition.z
        });
      }
      platform.previousWorldPosition.copy(next);
    }
  }
}
