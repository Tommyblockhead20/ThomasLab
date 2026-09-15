import * as pc from 'playcanvas';
import { MAIN_WORLD_LOCATION } from './world-locations.js';

export const MAP_EDITOR_SCHEMA = 1;
const METERS_PER_FOOT = 0.3048;
const FEET_PER_METER = 1 / METERS_PER_FOOT;
const DEFAULT_PROFILE = Object.freeze([
  { sourceFt: 0, targetFt: 0 },
  { sourceFt: 150, targetFt: 150 },
  { sourceFt: 300, targetFt: 300 },
  { sourceFt: 450, targetFt: 450 },
  { sourceFt: 600, targetFt: 600 },
  { sourceFt: 750, targetFt: 750 },
  { sourceFt: 900, targetFt: 900 },
  { sourceFt: 1000, targetFt: 1000 }
]);

const centerFallback = () => ({
  x: Number(MAIN_WORLD_LOCATION?.worldPosition?.x) || 0,
  z: Number(MAIN_WORLD_LOCATION?.worldPosition?.z) || 0
});
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => value == null ? value : structuredClone(value);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstepRange(edge0, edge1, value) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function profilePoints(patch) {
  const source = Array.isArray(patch?.terrain?.profile) && patch.terrain.profile.length >= 2
    ? patch.terrain.profile : DEFAULT_PROFILE;
  return source
    .map((point) => ({ sourceFt: finite(point?.sourceFt, NaN), targetFt: finite(point?.targetFt, NaN) }))
    .filter((point) => Number.isFinite(point.sourceFt) && Number.isFinite(point.targetFt))
    .sort((a, b) => a.sourceFt - b.sourceFt);
}

export function applyMapEditorProfileHeight(heightMeters, patch) {
  if (!Number.isFinite(heightMeters)) return heightMeters;
  const points = profilePoints(patch);
  if (points.length < 2) return heightMeters;
  const sourceFt = heightMeters * FEET_PER_METER;
  if (sourceFt <= points[0].sourceFt) {
    return (sourceFt + points[0].targetFt - points[0].sourceFt) * METERS_PER_FOOT;
  }
  const last = points.at(-1);
  if (sourceFt >= last.sourceFt) {
    // Editor v1 intentionally keeps the summit itself authored by the game. The profile
    // endpoint should normally remain 1000 -> 1000; outside the authored range use only
    // the endpoint offset rather than extrapolating a potentially wild slope.
    return (sourceFt + last.targetFt - last.sourceFt) * METERS_PER_FOOT;
  }
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (sourceFt < a.sourceFt || sourceFt > b.sourceFt) continue;
    const t = (sourceFt - a.sourceFt) / Math.max(0.0001, b.sourceFt - a.sourceFt);
    return (a.targetFt + (b.targetFt - a.targetFt) * t) * METERS_PER_FOOT;
  }
  return heightMeters;
}

function smoothFalloff(distance, radius) {
  if (!(radius > 0) || distance >= radius) return 0;
  const t = Math.max(0, Math.min(1, 1 - distance / radius));
  return t * t * (3 - 2 * t);
}

export function applyMapEditorHeight(baseHeight, angle, radius, center = centerFallback(), patch) {
  let height = applyMapEditorProfileHeight(baseHeight, patch);
  const radians = finite(angle) * Math.PI / 180;
  const x = finite(center?.x) + Math.cos(radians) * finite(radius);
  const z = finite(center?.z) + Math.sin(radians) * finite(radius);
  for (const stroke of patch?.terrain?.strokes ?? []) {
    const sx = finite(stroke?.x, NaN);
    const sz = finite(stroke?.z, NaN);
    const brushRadius = Math.max(0.01, finite(stroke?.radius));
    if (!Number.isFinite(sx) || !Number.isFinite(sz)) continue;
    height += finite(stroke?.deltaMeters) * smoothFalloff(Math.hypot(x - sx, z - sz), brushRadius);
  }
  // Smooth core dents preserve topology/collision. Unlike cuts, they never delete triangles.
  for (const dent of patch?.terrain?.dents ?? []) {
    const dx = finite(dent?.x, NaN);
    const dz = finite(dent?.z, NaN);
    const brushRadius = Math.max(0.01, finite(dent?.radius));
    const depth = Math.max(0, finite(dent?.depthMeters));
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || depth <= 0) continue;
    height -= depth * smoothFalloff(Math.hypot(x - dx, z - dz), brushRadius);
  }
  return height;
}

function manualPointIsCut(worldX, worldZ, patch) {
  for (const cut of patch?.terrain?.cuts ?? []) {
    const x = finite(cut?.x, NaN);
    const z = finite(cut?.z, NaN);
    const radius = Math.max(0, finite(cut?.radius));
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (Math.hypot(worldX - x, worldZ - z) <= radius) return true;
  }
  return false;
}

function tunnelFrameFromPatch(tunnel) {
  const entrance = tunnel?.entrance ?? {};
  const target = tunnel?.target ?? {};
  const ex = finite(entrance.x);
  const ez = finite(entrance.z);
  const tx = finite(target.x);
  const tz = finite(target.z);
  const dx = tx - ex;
  const dz = tz - ez;
  const horizontal = Math.max(.001, Math.hypot(dx, dz));
  const inward = { x: dx / horizontal, z: dz / horizontal };
  const right = { x: inward.z, z: -inward.x };
  const width = Math.max(2.2, finite(tunnel?.width, 3.6));
  const height = Math.max(2.5, finite(tunnel?.height, width * .86));
  const halfWidth = width * .5;
  const openingDepth = Math.max(.9, Math.min(1.8, width * .34));
  const mouthDepth = Math.max(1.15, Math.min(2.4, width * .48));
  return { ex, ez, tx, tz, horizontal, inward, right, width, height, halfWidth, openingDepth, mouthDepth };
}

function tunnelPortalContainsWorldPoint(worldPoint, tunnel) {
  const frame = tunnelFrameFromPatch(tunnel);
  const relX = worldPoint[0] - frame.ex;
  const relZ = worldPoint[2] - frame.ez;
  const inward = relX * frame.inward.x + relZ * frame.inward.z;
  const lateral = relX * frame.right.x + relZ * frame.right.z;
  return Math.abs(inward) <= frame.openingDepth && Math.abs(lateral) <= frame.halfWidth * .92;
}

function pointInTriangleXZ(point, a, b, c) {
  const sign = (p1, p2, p3) => ((p1[0] - p3[0]) * (p2[2] - p3[2]) - (p2[0] - p3[0]) * (p1[2] - p3[2]));
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNegative && hasPositive);
}

function triangleIntersectsTunnelPortal(worldA, worldB, worldC, patch) {
  if (!(patch?.tunnels?.length)) return false;
  const centroid = [
    (worldA[0] + worldB[0] + worldC[0]) / 3,
    (worldA[1] + worldB[1] + worldC[1]) / 3,
    (worldA[2] + worldB[2] + worldC[2]) / 3
  ];
  const edgeMidpoints = [
    [(worldA[0] + worldB[0]) * .5, 0, (worldA[2] + worldB[2]) * .5],
    [(worldB[0] + worldC[0]) * .5, 0, (worldB[2] + worldC[2]) * .5],
    [(worldC[0] + worldA[0]) * .5, 0, (worldC[2] + worldA[2]) * .5]
  ];
  return patch.tunnels.some((tunnel) => {
    if ([worldA, worldB, worldC, centroid, ...edgeMidpoints].some((sample) => tunnelPortalContainsWorldPoint(sample, tunnel))) return true;
    const frame = tunnelFrameFromPatch(tunnel);
    return pointInTriangleXZ([frame.ex, 0, frame.ez], worldA, worldB, worldC);
  });
}

export function terrainTriangleIsCut(a, b, c, center = centerFallback(), patch) {
  const cx = finite(center?.x);
  const cz = finite(center?.z);
  const worldA = [finite(a?.[0]) + cx, finite(a?.[1]), finite(a?.[2]) + cz];
  const worldB = [finite(b?.[0]) + cx, finite(b?.[1]), finite(b?.[2]) + cz];
  const worldC = [finite(c?.[0]) + cx, finite(c?.[1]), finite(c?.[2]) + cz];
  const centroid = [
    (worldA[0] + worldB[0] + worldC[0]) / 3,
    (worldA[1] + worldB[1] + worldC[1]) / 3,
    (worldA[2] + worldB[2] + worldC[2]) / 3
  ];
  if ([worldA, worldB, worldC, centroid].some((point) => manualPointIsCut(point[0], point[2], patch))) return true;
  return triangleIntersectsTunnelPortal(worldA, worldB, worldC, patch);
}

export function applyMapEditorCoreDeformation(world, caveDeformed, sourceVertex, center = centerFallback(), patch) {
  // v1.7 intentionally does not reshape the entire height-field around tunnel mouths.
  // That produced canyon-like cuts and made editor rebuilds much slower. The overhang
  // is now a tiny local replacement mesh, so existing v1.6 hooks can safely remain.
  return caveDeformed;
}

export function applyFishingLayoutPatch(layout, patch) {
  const overrides = patch?.fishingOverrides ?? {};
  return (layout ?? []).map((location) => {
    const override = overrides[location?.id];
    if (!override || typeof override !== 'object' || location?.offshore) return { ...location };
    const next = { ...location };
    if (Number.isFinite(Number(override.angle))) next.angle = Number(override.angle);
    if (Number.isFinite(Number(override.radius))) next.radius = Number(override.radius);
    if (Array.isArray(override.radii) && override.radii.length >= 2) {
      next.radii = [
        Math.max(.2, finite(override.radii[0], location.radii?.[0] ?? 4)),
        Math.max(.2, finite(override.radii[1], location.radii?.[1] ?? 4))
      ];
    }
    // Explicit water level survives the 3D-core freeze. This lets the editor tune the
    // actual water surface against the baked basin rather than re-running heightfield logic.
    if (Number.isFinite(Number(override.waterY))) next.waterY = Number(override.waterY);
    return next;
  });
}

function removeCollider(world, entity) {
  const collider = entity?.physicsCollider;
  if (!collider) return;
  try { world?.climbSurfaces?.delete?.(collider.handle); } catch {}
  try {
    if (typeof world?.physicsWorld?.removeCollider === 'function') world.physicsWorld.removeCollider(collider, true);
    else collider.setEnabled?.(false);
  } catch {
    try { collider.setEnabled?.(false); } catch {}
  }
  entity.physicsCollider = null;
}

function transformCollider(entity, position, rotation) {
  const collider = entity?.physicsCollider;
  if (!collider) return;
  try { collider.setTranslation?.({ x: position.x, y: position.y, z: position.z }, true); } catch {
    try { collider.setTranslation?.(position); } catch {}
  }
  try {
    const q = new pc.Quat().setFromEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    collider.setRotation?.({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
  } catch {}
}

function entityStableId(entity) {
  return entity?.rockId || entity?.mapObjectId || entity?.debugId || entity?.mapDebugId || null;
}

function walkEntities(root, output = []) {
  if (!root) return output;
  output.push(root);
  for (const child of root.children ?? []) walkEntities(child, output);
  return output;
}

function applyExistingObjectEdits(world, patch) {
  const hidden = new Set((patch?.hiddenObjectIds ?? []).map(String));
  const overrides = patch?.objectOverrides ?? {};
  if (!hidden.size && !Object.keys(overrides).length) return;
  const byId = new Map();
  for (const rock of world?.rockPlacements ?? []) {
    const id = String(rock?.rockId || entityStableId(rock?.entity) || '');
    if (id) byId.set(id, rock.entity);
  }
  for (const entity of walkEntities(world?.root)) {
    const id = entityStableId(entity);
    if (id) byId.set(String(id), entity);
  }

  for (const [id, entity] of byId) {
    if (!entity) continue;
    if (hidden.has(id)) {
      entity.enabled = false;
      removeCollider(world, entity);
      continue;
    }
    const override = overrides[id];
    if (!override || typeof override !== 'object') continue;
    const currentPosition = entity.getPosition?.() ?? { x: 0, y: 0, z: 0 };
    const currentRotation = entity.getEulerAngles?.() ?? { x: 0, y: 0, z: 0 };
    const position = {
      x: finite(override.position?.x, currentPosition.x),
      y: finite(override.position?.y, currentPosition.y),
      z: finite(override.position?.z, currentPosition.z)
    };
    const rotation = {
      x: finite(override.rotation?.x, currentRotation.x),
      y: finite(override.rotation?.y, currentRotation.y),
      z: finite(override.rotation?.z, currentRotation.z)
    };
    entity.setPosition?.(position.x, position.y, position.z);
    entity.setEulerAngles?.(rotation.x, rotation.y, rotation.z);
    transformCollider(entity, position, rotation);
    // Scale on a generated solid cannot safely mutate its Rapier hull in place. Keep
    // existing collision/visual scale consistent; to resize a generated rock, hide it and
    // place a new editor rock of the desired form/size instead.
  }
}

function terrainAnchoredPosition(world, item, center = centerFallback()) {
  const source = item?.position ?? {};
  const position = { x: finite(source.x), y: finite(source.y), z: finite(source.z) };
  if (item?.anchorMode !== 'terrain') return position;
  const dx = position.x - finite(center.x);
  const dz = position.z - finite(center.z);
  const radius = Math.hypot(dx, dz);
  let angle = Math.atan2(dz, dx) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  const y = world?.terrainY?.(angle, radius);
  if (Number.isFinite(y)) position.y = y + finite(item?.heightOffset);
  return position;
}

function createPrimitive(parent, name, type, material, position, scale, rotation = { x: 0, y: 0, z: 0 }) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type, castShadows: false, receiveShadows: true });
  for (const instance of entity.render?.meshInstances ?? []) instance.material = material;
  entity.setLocalPosition(position.x, position.y, position.z);
  entity.setLocalScale(scale.x, scale.y, scale.z);
  entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  parent.addChild(entity);
  return entity;
}

function editorMaterial(world, key, fallback = 'rock') {
  return world?.materials?.[key] ?? world?.materials?.[fallback] ?? world?.materials?.normalRock;
}

function addPlant(world, item, position) {
  const root = new pc.Entity(item.name || item.id || 'Editor plant');
  root.mapObjectId = item.id;
  root.setPosition(position.x, position.y, position.z);
  root.setEulerAngles(item.rotation?.x ?? 0, item.rotation?.y ?? 0, item.rotation?.z ?? 0);
  root.setLocalScale(item.scale?.x ?? 1, item.scale?.y ?? 1, item.scale?.z ?? 1);
  (world.buildTarget ?? world.root).addChild(root);
  const leaf = editorMaterial(world, 'shrubLight', 'forestFloor');
  const darkLeaf = editorMaterial(world, 'shrubDark', 'forestFloor');
  const grass = editorMaterial(world, 'dryGrass', 'forestFloor');
  const trunk = editorMaterial(world, 'wood', 'cabinWall');
  const kind = item.plantKind || 'grass';
  if (['pine', 'broadleaf', 'dead-tree'].includes(kind)) {
    createPrimitive(root, `${kind} trunk`, 'cylinder', trunk, { x: 0, y: .9, z: 0 }, { x: .22, y: 1.8, z: .22 });
    if (kind === 'pine') createPrimitive(root, 'pine crown', 'cone', darkLeaf, { x: 0, y: 2.2, z: 0 }, { x: 1.05, y: 2.8, z: 1.05 });
    else if (kind === 'broadleaf') createPrimitive(root, 'broadleaf crown', 'sphere', leaf, { x: 0, y: 2.25, z: 0 }, { x: 1.4, y: 1.1, z: 1.4 });
    else createPrimitive(root, 'dead branch', 'cylinder', trunk, { x: .45, y: 1.7, z: 0 }, { x: .08, y: 1.1, z: .08 }, { x: 0, y: 0, z: 58 });
    return root;
  }
  if (kind === 'reed' || kind === 'cattail') {
    for (let index = -2; index <= 2; index += 1) {
      createPrimitive(root, `${kind} ${index}`, 'cylinder', grass,
        { x: index * .18, y: .7 + (index % 2) * .08, z: (index % 2) * .12 },
        { x: .04, y: 1.4, z: .04 });
      if (kind === 'cattail') createPrimitive(root, 'cattail head', 'cylinder', trunk,
        { x: index * .18, y: 1.48, z: (index % 2) * .12 }, { x: .07, y: .24, z: .07 });
    }
    return root;
  }
  const size = kind === 'tall-grass' ? 1.4 : kind === 'shrub' ? 1.15 : kind === 'alpine-scrub' ? .72 : .9;
  createPrimitive(root, kind, kind === 'shrub' || kind === 'alpine-scrub' ? 'sphere' : 'cone',
    kind === 'alpine-scrub' ? darkLeaf : leaf,
    { x: 0, y: .45 * size, z: 0 }, { x: .8 * size, y: .9 * size, z: .8 * size });
  return root;
}

function addDecor(world, item, position) {
  const root = new pc.Entity(item.name || item.id || 'Editor decor');
  root.mapObjectId = item.id;
  root.setPosition(position.x, position.y, position.z);
  root.setEulerAngles(item.rotation?.x ?? 0, item.rotation?.y ?? 0, item.rotation?.z ?? 0);
  root.setLocalScale(item.scale?.x ?? 1, item.scale?.y ?? 1, item.scale?.z ?? 1);
  (world.buildTarget ?? world.root).addChild(root);
  const wood = editorMaterial(world, 'wood', 'cabinWall');
  const warm = editorMaterial(world, 'cabinWarm', 'cabinTrim');
  const kind = item.decorKind || 'crate';
  if (kind === 'bench') {
    createPrimitive(root, 'seat', 'box', wood, { x: 0, y: .55, z: 0 }, { x: 2.2, y: .18, z: .55 });
    createPrimitive(root, 'back', 'box', wood, { x: 0, y: 1.0, z: .22 }, { x: 2.2, y: .75, z: .16 });
    for (const x of [-.8, .8]) createPrimitive(root, 'leg', 'box', wood, { x, y: .25, z: 0 }, { x: .16, y: .5, z: .16 });
  } else if (kind === 'log') {
    createPrimitive(root, 'log', 'cylinder', wood, { x: 0, y: .45, z: 0 }, { x: .5, y: 2.5, z: .5 }, { x: 0, y: 0, z: 90 });
  } else if (kind === 'sign') {
    createPrimitive(root, 'post', 'cylinder', wood, { x: 0, y: .9, z: 0 }, { x: .12, y: 1.8, z: .12 });
    createPrimitive(root, 'sign', 'box', wood, { x: 0, y: 1.55, z: 0 }, { x: 1.25, y: .5, z: .1 });
  } else if (kind === 'lantern') {
    createPrimitive(root, 'post', 'cylinder', wood, { x: 0, y: 1, z: 0 }, { x: .1, y: 2, z: .1 });
    createPrimitive(root, 'lamp', 'sphere', warm, { x: 0, y: 2, z: 0 }, { x: .24, y: .28, z: .24 });
  } else {
    createPrimitive(root, 'crate', 'box', wood, { x: 0, y: .5, z: 0 }, { x: 1, y: 1, z: 1 });
  }
  return root;
}

function resolveTunnelEntrance(world, tunnel, center = centerFallback()) {
  const source = tunnel?.entrance ?? {};
  const x = finite(source.x);
  const z = finite(source.z);
  let y = finite(source.y);
  if (tunnel?.anchorEntranceToTerrain !== false && typeof world?.terrainY === 'function') {
    const dx = x - finite(center.x);
    const dz = z - finite(center.z);
    const radius = Math.hypot(dx, dz);
    let angle = Math.atan2(dz, dx) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    const terrainY = world.terrainY(angle, radius);
    if (Number.isFinite(terrainY)) y = terrainY + finite(tunnel?.entranceHeightOffset, -.28);
  }
  return { x, y, z };
}

function resolveTunnelFrame(world, tunnel, center = centerFallback()) {
  const entrance = resolveTunnelEntrance(world, tunnel, center);
  const target = {
    x: finite(tunnel?.target?.x),
    y: finite(tunnel?.target?.y),
    z: finite(tunnel?.target?.z)
  };
  const baseFrame = tunnelFrameFromPatch({ ...tunnel, entrance, target });
  const start = {
    x: entrance.x + baseFrame.inward.x * baseFrame.mouthDepth,
    y: entrance.y - .12,
    z: entrance.z + baseFrame.inward.z * baseFrame.mouthDepth
  };
  return { ...baseFrame, entrance, target, start };
}

function tunnelProfile(tunnel, start, target, t) {
  const width = Math.max(1.8, finite(tunnel?.width, 5));
  const height = Math.max(2.1, finite(tunnel?.height, 4));
  const chamberFlare = Math.max(1, finite(tunnel?.chamberFlare, 1.18));
  const flare = 1 + (chamberFlare - 1) * Math.max(0, Math.min(1, (t - .64) / .36));
  const floor = {
    x: start.x + (target.x - start.x) * t,
    y: start.y + (target.y - start.y) * t,
    z: start.z + (target.z - start.z) * t
  };
  const wobble = Math.sin(t * Math.PI * 3.1) * Math.sin(t * Math.PI) * .12;
  floor.y += wobble;
  return { floor, halfWidth: width * .5 * flare, height: height * (1 + (flare - 1) * .45) };
}

function addTunnelMesh(world, name, vertices, triangles, material, friction = .94) {
  if (!vertices.length || !triangles.length) return null;
  const geometry = new pc.Geometry();
  geometry.positions = [];
  geometry.indices = [];
  for (const triangle of triangles) {
    for (const vertexIndex of triangle) {
      geometry.positions.push(...vertices[vertexIndex]);
      geometry.indices.push(geometry.indices.length);
    }
  }
  geometry.calculateNormals();
  const mesh = pc.Mesh.fromGeometry(world.app.graphicsDevice, geometry);
  const entity = new pc.Entity(name);
  entity.addComponent('render');
  entity.render.meshInstances = [new pc.MeshInstance(mesh, material, entity)];
  entity.render.castShadows = false;
  (world.buildTarget ?? world.root).addChild(entity);
  try {
    const collider = world.RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices.flat()),
      new Uint32Array(triangles.flat())
    ).setFriction(friction).setRestitution(0);
    entity.physicsCollider = world.physicsWorld.createCollider(collider);
  } catch {}
  return entity;
}

function addEditorTunnel(world, tunnel, center = centerFallback()) {
  if (!tunnel?.entrance || !tunnel?.target) return [];
  const frame = resolveTunnelFrame(world, tunnel, center);
  const { entrance, start, target } = frame;
  const dx = target.x - start.x;
  const dz = target.z - start.z;
  const horizontal = Math.max(.001, Math.hypot(dx, dz));
  const right = { x: dz / horizontal, z: -dx / horizontal };
  const inward = { x: dx / horizontal, z: dz / horizontal };
  const width = Math.max(2.2, finite(tunnel?.width, 3.6));
  const height = Math.max(2.5, finite(tunnel?.height, width * .86));

  // Small local mouth replacement. It covers the coarse terrain triangles removed for
  // the doorway, while its inner arch is physically recessed to create a real overhang.
  const collarVertices = [];
  const collarTriangles = [];
  const archSides = 12;
  const outerHalf = width * .92;
  const outerHeight = height * 1.18;
  const innerHalf = width * .5;
  const innerHeight = height;
  const outerCenter = {
    x: entrance.x - inward.x * .18,
    y: entrance.y - .10,
    z: entrance.z - inward.z * .18
  };
  for (let ring = 0; ring < 2; ring += 1) {
    const c = ring === 0 ? outerCenter : start;
    const half = ring === 0 ? outerHalf : innerHalf;
    const h = ring === 0 ? outerHeight : innerHeight;
    for (let side = 0; side <= archSides; side += 1) {
      const phase = side / archSides * Math.PI;
      const lateral = Math.cos(phase) * half;
      const shoulder = Math.pow(Math.sin(phase), .80);
      collarVertices.push([
        c.x + right.x * lateral,
        c.y + shoulder * h,
        c.z + right.z * lateral
      ]);
    }
  }
  const stride = archSides + 1;
  for (let side = 0; side < archSides; side += 1) {
    const a = side, b = side + 1, c = stride + side, d = c + 1;
    collarTriangles.push([a, c, b], [b, c, d]);
  }
  collarTriangles.push([0, stride, archSides], [archSides, stride, stride + archSides]);

  const stations = Math.max(7, Math.min(28, Math.round(horizontal / 3.0) + 2));
  const sides = 10;
  const shellVertices = [];
  const shellTriangles = [];
  for (let station = 0; station < stations; station += 1) {
    const t = station / Math.max(1, stations - 1);
    const profile = tunnelProfile({ ...tunnel, width, height, chamberFlare: finite(tunnel?.chamberFlare, 1.10) }, start, target, t);
    for (let side = 0; side <= sides; side += 1) {
      const phase = side / sides * Math.PI;
      const lateral = Math.cos(phase) * profile.halfWidth;
      const shoulder = Math.pow(Math.sin(phase), .82);
      shellVertices.push([
        profile.floor.x + right.x * lateral,
        profile.floor.y + shoulder * profile.height,
        profile.floor.z + right.z * lateral
      ]);
    }
  }
  for (let station = 0; station < stations - 1; station += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = station * (sides + 1) + side, b = a + 1;
      const c = (station + 1) * (sides + 1) + side, d = c + 1;
      shellTriangles.push([a, c, b], [b, c, d]);
    }
  }

  const floorVertices = [];
  const floorTriangles = [];
  const floorColumns = 5;
  for (let station = 0; station < stations; station += 1) {
    const t = station / Math.max(1, stations - 1);
    const profile = tunnelProfile({ ...tunnel, width, height, chamberFlare: finite(tunnel?.chamberFlare, 1.10) }, start, target, t);
    for (let column = 0; column < floorColumns; column += 1) {
      const side = -1 + column / Math.max(1, floorColumns - 1) * 2;
      floorVertices.push([
        profile.floor.x + right.x * side * profile.halfWidth,
        profile.floor.y - (1 - Math.abs(side)) * .08,
        profile.floor.z + right.z * side * profile.halfWidth
      ]);
    }
  }
  for (let station = 0; station < stations - 1; station += 1) {
    for (let column = 0; column < floorColumns - 1; column += 1) {
      const a = station * floorColumns + column, b = a + 1;
      const c = (station + 1) * floorColumns + column, d = c + 1;
      floorTriangles.push([a, c, b], [b, c, d]);
    }
  }

  const wallMaterial = editorMaterial(world, 'caveWall', 'cave');
  const floorMaterial = editorMaterial(world, 'cave', 'deepRock');
  const collar = addTunnelMesh(world, `${tunnel.name || tunnel.id} recessed mouth`, collarVertices, collarTriangles, wallMaterial, .96);
  const shell = addTunnelMesh(world, `${tunnel.name || tunnel.id} shell`, shellVertices, shellTriangles, wallMaterial, .92);
  const floor = addTunnelMesh(world, `${tunnel.name || tunnel.id} floor`, floorVertices, floorTriangles, floorMaterial, .96);
  for (const entity of [collar, shell, floor]) if (entity) entity.mapObjectId = tunnel.id;
  return [collar, shell, floor].filter(Boolean);
}

function addEditorTunnels(world, patch, center = centerFallback()) {
  const created = [];
  for (const tunnel of patch?.tunnels ?? []) created.push(...addEditorTunnel(world, tunnel, center));
  return created;
}

function findEntityByName(root, name) {
  if (!root) return null;
  if (root.name === name) return root;
  for (const child of root.children ?? []) {
    const found = findEntityByName(child, name);
    if (found) return found;
  }
  return null;
}

function parseHexColor(value) {
  const text = String(value || '').trim();
  let hex = text;
  if (/^#[0-9a-f]{3}$/i.test(hex)) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  return new pc.Color(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  );
}

function applyWaterVisualOverrides(world, patch) {
  const overrides = patch?.fishingOverrides ?? {};
  const changed = [];
  for (const override of Object.values(overrides)) {
    const color = parseHexColor(override?.color);
    const label = String(override?.label || '').trim();
    if (!color || !label) continue;
    const entity = findEntityByName(world?.root, `${label} water`);
    if (!entity?.render?.meshInstances?.length) continue;
    for (const instance of entity.render.meshInstances) {
      const source = instance.material;
      const material = source?.clone?.() ?? source;
      if (!material) continue;
      try {
        material.diffuse = color.clone?.() ?? color;
        // Keep the authored water's transparency/gloss, and tint its tiny emissive term so
        // the chosen color remains legible under the game's lighting.
        if (material.emissive) material.emissive = new pc.Color(color.r * .12, color.g * .12, color.b * .12);
        material.update?.();
      } catch {}
      instance.material = material;
    }
    changed.push(entity);
  }
  return changed;
}


function calculateAreaWeightedNormals(positions, indices) {
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const o of [a, b, c]) { normals[o] += nx; normals[o + 1] += ny; normals[o + 2] += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length; normals[i + 1] /= length; normals[i + 2] /= length;
  }
  return normals;
}

function validBakedTerrainMesh(patch) {
  const mesh = patch?.terrain?.bakedMesh;
  if (!mesh || !Array.isArray(mesh.positions) || !Array.isArray(mesh.indices)) return null;
  if (mesh.positions.length < 9 || mesh.positions.length % 3 || mesh.indices.length < 3 || mesh.indices.length % 3) return null;
  const vertexCount = mesh.positions.length / 3;
  if (mesh.indices.some((index) => !Number.isInteger(Number(index)) || Number(index) < 0 || Number(index) >= vertexCount)) return null;
  return mesh;
}

function addBakedTerrainMesh(world, patch, center = centerFallback()) {
  const baked = validBakedTerrainMesh(patch);
  if (!baked || !world?.app?.graphicsDevice || !world?.RAPIER || !world?.physicsWorld) return null;

  // The ordinary mountain collider combines the core and ocean-floor shelf. Disable only
  // that mountain-body entity/collider, then restore the shelf collider separately below.
  const original = findEntityByName(world.buildTarget ?? world.root, 'Continuous irregular mountain body');
  if (original) {
    removeCollider(world, original);
    original.enabled = false;
  }

  const positions = baked.positions.map(Number);
  const indices = baked.indices.map((value) => Math.trunc(Number(value)));
  const geometry = new pc.Geometry();
  geometry.positions = positions;
  geometry.indices = indices;
  geometry.normals = calculateAreaWeightedNormals(positions, indices);
  const mesh = pc.Mesh.fromGeometry(world.app.graphicsDevice, geometry);
  const entity = new pc.Entity('Map Editor baked 3D mountain core');
  entity.addComponent('render');
  const material = world.materials?.alpine ?? world.materials?.rock;
  if (material) {
    // Folded cave surfaces can be viewed from either side while sculpting has changed
    // their orientation. Use a clone so the rest of the world keeps its normal culling.
    const meshMaterial = material.clone?.() ?? material;
    try { meshMaterial.cull = pc.CULLFACE_NONE; meshMaterial.update?.(); } catch {}
    entity.render.meshInstances = [new pc.MeshInstance(mesh, meshMaterial, entity)];
  }
  entity.render.castShadows = false;
  (world.buildTarget ?? world.root).addChild(entity);

  const colliderDesc = world.RAPIER.ColliderDesc.trimesh(
    new Float32Array(positions),
    new Uint32Array(indices)
  ).setFriction(.94).setRestitution(0);
  entity.physicsCollider = world.physicsWorld.createCollider(colliderDesc);
  entity.mapObjectId = 'EDITOR-BAKED-TERRAIN';

  // The old collider also carried the wading/ocean floor. Recreate that collision only.
  const floor = world.oceanFloorSurface;
  if (floor?.vertices?.length && floor?.triangles?.length) {
    const floorEntity = new pc.Entity('Map Editor restored ocean-floor collision');
    (world.buildTarget ?? world.root).addChild(floorEntity);
    const floorDesc = world.RAPIER.ColliderDesc.trimesh(
      new Float32Array(floor.vertices.flat()),
      new Uint32Array(floor.triangles.flat())
    )
      .setTranslation(finite(center?.x), 0, finite(center?.z))
      .setFriction(.94)
      .setRestitution(0);
    floorEntity.physicsCollider = world.physicsWorld.createCollider(floorDesc);
    floorEntity.mapObjectId = 'EDITOR-RESTORED-OCEAN-FLOOR';
    entity.editorOceanFloorColliderEntity = floorEntity;
  }

  // Expose the baked mesh as the visible terrain source for diagnostics. Procedural rocks
  // were already created before this replacement; once their layout is curated, the rock
  // bake can become the next runtime optimization.
  world.mapEditorBakedTerrain = entity;
  return entity;
}

function addPlacedObjects(world, patch, center = centerFallback()) {
  const created = [];
  for (const item of patch?.placedObjects ?? []) {
    if (!item?.id || !item?.position) continue;
    const position = terrainAnchoredPosition(world, item, center);
    if (item.type === 'rock') {
      const materialType = item.climbMaterial || 'normal';
      const material = world.materialForClimb?.(materialType) ?? editorMaterial(world, 'rock');
      const rock = world.addNaturalRock?.(
        item.name || item.id,
        position,
        { x: finite(item.scale?.x, 3), y: finite(item.scale?.y, 2.5), z: finite(item.scale?.z, 3) },
        material,
        { x: finite(item.rotation?.x), y: finite(item.rotation?.y), z: finite(item.rotation?.z) },
        {
          formKind: item.formKind || 'chunk',
          climbMaterial: materialType,
          allowRockOverlap: true,
          allowDeepEmbed: true,
          supportKind: 'map-editor'
        }
      );
      if (rock) {
        rock.mapObjectId = item.id;
        created.push(rock);
      }
    } else if (item.type === 'plant') created.push(addPlant(world, item, position));
    else if (item.type === 'decor') created.push(addDecor(world, item, position));
  }
  return created;
}

export function applyWorldObjectPatch(world, patch, center = centerFallback()) {
  if (!world || !patch) return [];
  const bakedTerrain = addBakedTerrainMesh(world, patch, center);
  applyExistingObjectEdits(world, patch);
  const waterVisuals = applyWaterVisualOverrides(world, patch);
  const created = [
    ...(bakedTerrain ? [bakedTerrain] : []),
    ...(bakedTerrain ? [] : addEditorTunnels(world, patch, center)),
    ...addPlacedObjects(world, patch, center)
  ];
  world.mapEditorPatchObjects = created;
  world.mapEditorWaterVisuals = waterVisuals;
  return created;
}

function plainVec(value) {
  if (!value) return null;
  return { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
}

export function createMapEditorRuntimeSnapshot(world) {
  const rocks = (world?.rockPlacements ?? []).map((rock) => {
    const entity = rock?.entity;
    const euler = entity?.getEulerAngles?.();
    return {
      id: rock?.rockId || entityStableId(entity),
      rockId: rock?.rockId || entityStableId(entity),
      name: rock?.name || entity?.name,
      position: plainVec(entity?.getPosition?.() ?? rock?.position),
      size: clone(rock?.size) ?? plainVec(entity?.getLocalScale?.()),
      rotation: plainVec(euler),
      climbMaterial: rock?.climbMaterial ?? null,
      grippable: Boolean(rock?.grippable)
    };
  }).filter((rock) => rock.rockId && rock.position);

  const objects = [];
  const seen = new Set(rocks.map((rock) => String(rock.rockId)));
  for (const entity of walkEntities(world?.root)) {
    const id = entityStableId(entity);
    if (!id || seen.has(String(id))) continue;
    seen.add(String(id));
    const position = plainVec(entity.getPosition?.());
    if (!position) continue;
    objects.push({
      id: String(id),
      mapObjectId: String(id),
      name: entity.name,
      position,
      scale: plainVec(entity.getLocalScale?.()),
      rotation: plainVec(entity.getEulerAngles?.())
    });
  }
  return {
    schema: 1,
    generatedAt: new Date().toISOString(),
    locationId: MAIN_WORLD_LOCATION?.id ?? 'main-mountain',
    rocks,
    objects
  };
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function installMapEditorBridge(world, patch) {
  if (typeof window === 'undefined') return null;
  const bridge = {
    version: 1.9,
    world,
    patch,
    getSnapshot: () => createMapEditorRuntimeSnapshot(world),
    downloadSnapshot: () => downloadJson('reel-ascent-runtime-map-snapshot.json', createMapEditorRuntimeSnapshot(world)),
    help: 'Open /tools/map-editor/. v1.10 adds true vertical Raise/Lower in frozen 3D mode, local connected-surface smoothing, and clearer independent water surface/depth/color controls.'
  };
  window.__REEL_ASCENT_MAP_EDITOR__ = bridge;
  return bridge;
}
