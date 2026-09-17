import * as pc from 'playcanvas';
import SCENE from './library-island-v2.scene.json' with { type: 'json' };
import { PLAYER_FOOT_OFFSET } from '../config.js';
import { attachZoneEcology, ECOLOGY_TARGETS } from '../fishing/fish-ecology.js';
import { FishingZone } from '../fishing/fishing-zone.js';

const finiteVec = (value, length = 3) => Array.isArray(value)
  && value.length >= length
  && value.slice(0, length).every((entry) => Number.isFinite(Number(entry)));
const slug = (value) => String(value ?? '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

function makeMaterial(spec = {}) {
  const material = new pc.StandardMaterial();
  const diffuse = spec.diffuse ?? [.5, .5, .5];
  material.diffuse = new pc.Color(diffuse[0], diffuse[1], diffuse[2], spec.opacity ?? 1);
  const emissive = spec.emissive ?? [0, 0, 0];
  material.emissive = new pc.Color(emissive[0], emissive[1], emissive[2]);
  material.emissiveIntensity = spec.emissiveIntensity ?? 1;
  material.gloss = spec.gloss ?? .12;
  material.metalness = spec.metalness ?? 0;
  material.opacity = spec.opacity ?? 1;
  if (material.opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  if (spec.doubleSided) {
    material.cull = pc.CULLFACE_NONE;
    material.twoSidedLighting = true;
  }
  material.update();
  return material;
}

function sceneMaterials(world) {
  if (world.veiledAthenaeumMaterials) return world.veiledAthenaeumMaterials;
  const result = {};
  for (const [id, spec] of Object.entries(SCENE.materials ?? {})) result[id] = makeMaterial(spec);
  world.veiledAthenaeumMaterials = result;
  return result;
}

function localToWorld(root, local = [0, 0, 0]) {
  const point = root.getWorldTransform().transformPoint(new pc.Vec3(
    Number(local[0]) || 0, Number(local[1]) || 0, Number(local[2]) || 0
  ));
  return { x: point.x, y: point.y, z: point.z };
}

function addScenePrimitive(world, parent, id, name, type, position, size, material, rotation = [0, 0, 0], solid = false) {
  const entity = new pc.Entity(name);
  entity.addComponent('render', {
    type,
    material,
    castShadows: material?.opacity >= 1,
    receiveShadows: material?.opacity >= 1
  });
  parent.addChild(entity);
  entity.setLocalPosition(position[0], position[1], position[2]);
  entity.setLocalScale(size[0], size[1], size[2]);
  entity.setLocalEulerAngles(rotation[0] ?? 0, rotation[1] ?? 0, rotation[2] ?? 0);
  entity.mapObjectId = id;
  if (solid) {
    const worldPosition = entity.getPosition();
    const quaternion = entity.getRotation();
    // Decorative rounded pieces use a conservative cuboid collider. Structural floors,
    // walls, bridges, stairs, and railings remain authored boxes with exact box collision.
    const collider = world.RAPIER.ColliderDesc.cuboid(size[0] / 2, size[1] / 2, size[2] / 2)
      .setTranslation(worldPosition.x, worldPosition.y, worldPosition.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(.9).setRestitution(0);
    entity.physicsCollider = world.physicsWorld.createCollider(collider);
  }
  return entity;
}

function addPart(world, parent, part, materials, stablePrefix, instanceScale = [1, 1, 1], counters) {
  const rawPosition = finiteVec(part.position) ? part.position : [0, 0, 0];
  const rawSize = finiteVec(part.size) ? part.size : [1, 1, 1];
  const position = rawPosition.map((value, index) => Number(value) * (instanceScale[index] ?? 1));
  const size = rawSize.map((value, index) => Math.max(.01, Number(value) * Math.abs(instanceScale[index] ?? 1)));
  const rotation = finiteVec(part.rotation) ? part.rotation : [0, 0, 0];
  const material = materials[part.material] ?? world.materials?.decoStone;
  const partId = part.id ? `${stablePrefix}-${slug(part.id)}` : `${stablePrefix}-${slug(part.name || part.type)}`;
  const name = `Veiled Athenaeum ${part.name || part.id || part.type}`;
  let entity = null;
  if ((part.type ?? 'box') === 'box') {
    entity = world.addStructureBox(parent, name,
      { x: position[0], y: position[1], z: position[2] },
      { x: size[0], y: size[1], z: size[2] }, material,
      { x: rotation[0] ?? 0, y: rotation[1] ?? 0, z: rotation[2] ?? 0 }, part.solid !== false);
    entity.mapObjectId = partId;
  } else {
    const primitiveType = ['sphere', 'cylinder', 'cone', 'capsule'].includes(part.type) ? part.type : 'sphere';
    entity = addScenePrimitive(world, parent, partId, name, primitiveType,
      position, size, material, rotation, part.solid === true);
  }
  counters.render += 1;
  if (entity?.physicsCollider) counters.colliders += 1;
  return entity;
}

function addPrefabInstance(world, root, instance, materials, counters) {
  const prefab = SCENE.prefabs?.[instance.prefab];
  if (!prefab?.parts?.length) return null;
  const holder = new pc.Entity(`Veiled Athenaeum prefab ${instance.id}`);
  holder.mapObjectId = `LIBRARY-PREFAB-${slug(instance.id)}`;
  root.addChild(holder);
  const position = finiteVec(instance.position) ? instance.position : [0, 0, 0];
  const rotation = finiteVec(instance.rotation) ? instance.rotation : [0, 0, 0];
  const scale = finiteVec(instance.scale) ? instance.scale : [1, 1, 1];
  holder.setLocalPosition(position[0], position[1], position[2]);
  holder.setLocalEulerAngles(rotation[0], rotation[1], rotation[2]);
  for (const part of prefab.parts) addPart(
    world, holder, part, materials, `LIBRARY-${slug(instance.id)}`, scale, counters
  );
  return holder;
}

function addLight(root, light, counters) {
  const entity = new pc.Entity(`Veiled Athenaeum ${light.name || light.id}`);
  const color = light.color ?? [1, 1, 1];
  entity.addComponent('light', {
    type: light.type ?? 'omni',
    color: new pc.Color(color[0], color[1], color[2]),
    intensity: light.intensity ?? 1,
    range: light.range ?? 10,
    castShadows: false
  });
  const position = finiteVec(light.position) ? light.position : [0, 2, 0];
  entity.setLocalPosition(position[0], position[1], position[2]);
  entity.mapObjectId = `LIBRARY-LIGHT-${slug(light.id)}`;
  root.addChild(entity);
  counters.lights += 1;
  return entity;
}

function addFishingWater(world, root, water) {
  const fishingScale = Math.max(.05, Number(water.fishingZoneScale) || 1);
  const surfaceY = localToWorld(root, [0, Number(water.surfaceLocalY) || 0, 0]).y;
  const floorY = localToWorld(root, [0, Number(water.floorLocalY) || -.7, 0]).y;
  let center;
  let pathPoints = [];
  if (water.shape === 'path') {
    pathPoints = (water.pathLocal ?? []).filter((point) => finiteVec(point, 2)).map((point) => {
      const worldPoint = localToWorld(root, [point[0], water.surfaceLocalY ?? 0, point[1]]);
      return { x: worldPoint.x, z: worldPoint.z };
    });
    if (pathPoints.length < 2) return null;
    center = pathPoints[Math.floor(pathPoints.length / 2)];
  } else {
    const local = finiteVec(water.centerLocal, 2) ? water.centerLocal : [0, 0];
    const worldPoint = localToWorld(root, [local[0], water.surfaceLocalY ?? 0, local[1]]);
    center = { x: worldPoint.x, z: worldPoint.z };
  }
  const radii = finiteVec(water.radii, 2)
    ? { x: Number(water.radii[0]) * fishingScale, z: Number(water.radii[1]) * fishingScale }
    : { x: 2.5, z: 2.5 };
  const zone = new FishingZone({
    id: water.id,
    label: water.label,
    center,
    radii,
    shape: water.shape === 'path' ? 'path' : 'ellipse',
    pathPoints,
    pathWidth: water.shape === 'path' ? (Number(water.pathWidth) || 1.25) * fishingScale : 0,
    surfaceY,
    floorY,
    fishIds: Array.isArray(water.fishIds) ? water.fishIds : [],
    depth: water.depth ?? 'shallow',
    modifiers: {
      biteRate: water.modifiers?.biteRate ?? .94,
      size: water.modifiers?.size ?? 1,
      rarityBias: water.modifiers?.rarityBias ?? .15,
      trophyChance: water.modifiers?.trophyChance ?? 1,
      maximumSpeciesProbability: water.modifiers?.maximumSpeciesProbability
        ?? ECOLOGY_TARGETS.maximumSpeciesShare
    }
  });
  zone.tier = water.tier ?? 'lower';
  zone.waterType = water.waterType ?? 'pond';
  zone.theme = water.theme ?? 'fernwood';
  zone.authoredFishIds = Array.isArray(water.fishIds) ? [...water.fishIds] : [];
  if (Array.isArray(water.ecologyThemes)) zone.ecologyThemes = [...water.ecologyThemes];
  zone.probabilityGroup = water.probabilityGroup ?? water.id;
  zone.cave = Boolean(water.cave);
  zone.physicalZone = water.label;
  const authored = attachZoneEcology(zone);
  world.fishingZones.push(authored);
  return authored;
}

function addBench(world, root, bench, materials, counters, rootYaw) {
  const position = finiteVec(bench.position) ? bench.position : [0, .42, 0];
  const yaw = Number(bench.facingYaw) || 0;
  const seat = world.addStructureBox(root, `Veiled Athenaeum ${bench.id} seat`,
    { x: position[0], y: position[1], z: position[2] },
    { x: 2.05, y: .18, z: .5 }, materials.wood, { y: yaw }, true);
  seat.mapObjectId = `LIBRARY-BENCH-${slug(bench.id)}`;
  const rad = yaw * Math.PI / 180;
  const backX = position[0] - Math.sin(rad) * .28;
  const backZ = position[2] - Math.cos(rad) * .28;
  const back = world.addStructureBox(root, `Veiled Athenaeum ${bench.id} back`,
    { x: backX, y: position[1] + .48, z: backZ },
    { x: 2.05, y: .82, z: .18 }, materials.wood, { y: yaw }, true);
  back.mapObjectId = `LIBRARY-BENCH-${slug(bench.id)}-BACK`;
  counters.render += 2;
  counters.colliders += 2;
  const interactionPoint = localToWorld(root, [position[0], 0, position[2]]);
  const seatPoint = localToWorld(root, [position[0], position[1] + .12, position[2]]);
  const exit = finiteVec(bench.exit) ? bench.exit : [position[0], .05, position[2] + 1.2];
  const exitPoint = localToWorld(root, exit);
  world.homeInteractions.push({
    id: bench.id,
    label: bench.label ?? 'SIT',
    action: 'bench',
    seatKind: bench.seatKind ?? 'reading bench',
    position: interactionPoint,
    seatPosition: { ...seatPoint, y: seatPoint.y + PLAYER_FOOT_OFFSET },
    exitPosition: { ...exitPoint, y: exitPoint.y + PLAYER_FOOT_OFFSET },
    facingYaw: rootYaw + yaw,
    fishingFacing: bench.fishingFacing,
    fishingLabel: bench.fishingLabel,
    range: bench.range ?? 2.35
  });
}

export function validateVeiledAthenaeumScene(scene = SCENE) {
  const errors = [];
  const ids = new Set();
  const claim = (id, label) => {
    if (!id) errors.push(`${label} is missing an id.`);
    else if (ids.has(id)) errors.push(`Duplicate stable id: ${id}`);
    else ids.add(id);
  };
  if (scene.schema !== 'reel-ascent-authored-scene-v2') errors.push(`Unsupported scene schema: ${scene.schema}`);
  if (scene.locationId !== 'veiled-athenaeum') errors.push(`Scene targets ${scene.locationId}, expected veiled-athenaeum.`);
  for (const part of scene.parts ?? []) claim(part.id, 'scene part');
  for (const item of scene.instances ?? []) claim(item.id, 'prefab instance');
  for (const water of scene.waters ?? []) claim(water.id, 'water');
  for (const marker of scene.markers ?? []) claim(marker.id, 'marker');
  for (const bench of scene.benches ?? []) claim(bench.id, 'bench');
  const renderEstimate = (scene.parts?.length ?? 0)
    + (scene.instances ?? []).reduce((sum, item) => sum + (scene.prefabs?.[item.prefab]?.parts?.length ?? 0), 0)
    + (scene.benches?.length ?? 0) * 2;
  if (renderEstimate > (scene.performance?.maximumAuthoredRenderEntities ?? 420)) {
    errors.push(`Estimated render entities ${renderEstimate} exceed budget.`);
  }
  if ((scene.lights?.length ?? 0) > (scene.performance?.maximumAuthoredLights ?? 10)) errors.push('Too many authored lights.');
  const mistCount = (scene.parts ?? []).filter((part) => part.material === 'mist').length;
  if (mistCount > (scene.performance?.maximumMistVolumes ?? 12)) errors.push('Too many mist volumes.');
  const waterIds = new Set((scene.waters ?? []).map((water) => water.id));
  for (const bench of scene.benches ?? []) if (bench.fishingFacing && !waterIds.has(bench.fishingFacing)) {
    errors.push(`Bench ${bench.id} references unknown fishing water ${bench.fishingFacing}.`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors), renderEstimate, mistCount });
}

export function buildVeiledAthenaeumV2(world, location) {
  const validation = validateVeiledAthenaeumScene();
  if (!validation.ok || location?.id !== SCENE.locationId) return null;
  const floorY = location.elevation + (Number(SCENE.floorOffset) || 1.28);
  const root = world.createStructureRoot('The Veiled Athenaeum V2 authored scene',
    location.angle, location.radius, floorY, location.id);
  root.mapObjectId = 'LIBRARY-VEILED-ATHENAEUM-V2';
  const materials = sceneMaterials(world);
  const counters = { render: 0, colliders: 0, lights: 0 };
  for (const part of SCENE.parts ?? []) addPart(world, root, part, materials, 'LIBRARY-SCENE', [1, 1, 1], counters);
  for (const instance of SCENE.instances ?? []) addPrefabInstance(world, root, instance, materials, counters);
  for (const light of SCENE.lights ?? []) addLight(root, light, counters);
  const rootYaw = 90 - location.angle;
  for (const bench of SCENE.benches ?? []) addBench(world, root, bench, materials, counters, rootYaw);

  const fishingZones = [];
  for (const water of SCENE.waters ?? []) {
    const zone = addFishingWater(world, root, water);
    if (zone) fishingZones.push(zone);
  }
  const markers = (SCENE.markers ?? []).map((marker) => ({
    id: marker.id,
    kind: marker.kind,
    label: marker.label,
    position: localToWorld(root, marker.position),
    facingYaw: rootYaw + (Number(marker.facingYaw) || 0)
  }));
  world.veiledAthenaeumRoot = root;
  world.libraryIslandMarkers = markers;
  world.libraryIslandFishingZones = fishingZones;
  world.veiledAthenaeumSceneReport = Object.freeze({
    sceneId: SCENE.sceneId,
    version: SCENE.version,
    renderEntities: counters.render,
    colliders: counters.colliders,
    lights: counters.lights,
    fishingWaterIds: Object.freeze(fishingZones.map((zone) => zone.id)),
    markerIds: Object.freeze(markers.map((marker) => marker.id)),
    validation
  });
  return world.veiledAthenaeumSceneReport;
}

export { SCENE as VEILED_ATHENAEUM_SCENE };
