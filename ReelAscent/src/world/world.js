import * as pc from 'playcanvas';
import { COLORS } from '../config.js';
import { FishingZone } from '../fishing/fishing-zone.js';
import { getClimbMaterial } from '../player/climbing-materials.js';

function color(values, alpha = 1) {
  return new pc.Color(values[0], values[1], values[2], alpha);
}

function createMaterial(values, options = {}) {
  const material = new pc.StandardMaterial();
  material.diffuse = color(values, options.opacity ?? 1);
  material.emissive = color(options.emissive ?? [0, 0, 0]);
  material.emissiveIntensity = options.emissiveIntensity ?? 1;
  material.gloss = options.gloss ?? 0.18;
  material.metalness = options.metalness ?? 0;
  material.opacity = options.opacity ?? 1;
  if (material.opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

function playCanvasQuat(rotation) {
  const value = new pc.Quat();
  value.setFromEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
  return value;
}

export class TestWorld {
  constructor(app, RAPIER, physicsWorld) {
    this.app = app;
    this.RAPIER = RAPIER;
    this.physicsWorld = physicsWorld;
    this.root = new pc.Entity('Milestone 3.5 Mechanics Playground');
    this.app.root.addChild(this.root);
    this.courseRoot = new pc.Entity('Retained Milestone 3.5 developer course');
    this.root.addChild(this.courseRoot);
    this.buildTarget = this.courseRoot;
    this.elapsed = 0;
    this.climbSurfaces = new Map();
    this.fishingZones = [];

    this.materials = {
      grass: createMaterial(COLORS.grass, { gloss: 0.08 }),
      grassLight: createMaterial(COLORS.grassLight, { gloss: 0.08 }),
      earth: createMaterial(COLORS.earth, { gloss: 0.05 }),
      rock: createMaterial(COLORS.rock, { gloss: 0.14 }),
      rockLight: createMaterial(COLORS.rockLight, { gloss: 0.14 }),
      roughRock: createMaterial([0.57, 0.5, 0.4], { gloss: 0.04 }),
      normalRock: createMaterial([0.58, 0.6, 0.55], { gloss: 0.13 }),
      smoothRock: createMaterial([0.31, 0.45, 0.5], {
        gloss: 0.68,
        emissive: [0.01, 0.035, 0.045]
      }),
      ice: createMaterial([0.62, 0.83, 0.88], {
        opacity: 0.86,
        gloss: 0.92,
        emissive: [0.035, 0.09, 0.11]
      }),
      unclimbable: createMaterial([0.43, 0.45, 0.43], { gloss: 0.1 }),
      wood: createMaterial(COLORS.wood, { gloss: 0.08 }),
      woodLight: createMaterial([0.64, 0.43, 0.23], { gloss: 0.08 }),
      water: createMaterial(COLORS.water, {
        opacity: 0.7,
        emissive: [0.03, 0.12, 0.13],
        gloss: 0.75
      }),
      waterEdge: createMaterial([0.74, 0.73, 0.49], { gloss: 0.05 }),
      foliage: createMaterial(COLORS.foliage, { gloss: 0.05 }),
      foliageLight: createMaterial(COLORS.foliageLight, { gloss: 0.05 }),
      flowers: createMaterial([0.96, 0.73, 0.33], { gloss: 0.15 })
    };

    this.buildTerrain();
    this.buildMovementCourse();
    this.buildClimbingCourse();
    this.buildPondAndBridge();
    this.buildScenery();
  }

  createPrimitive(name, type, position, scale, material, rotation = {}, options = {}) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', {
      type,
      material,
      castShadows: options.castShadows ?? true,
      receiveShadows: options.receiveShadows ?? true
    });
    entity.setPosition(position.x, position.y, position.z);
    entity.setLocalScale(scale.x, scale.y, scale.z);
    entity.setEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    this.buildTarget.addChild(entity);
    return entity;
  }

  addBox(name, position, size, material, rotation = {}, solid = true) {
    const entity = this.createPrimitive(name, 'box', position, size, material, rotation);
    if (!solid) return entity;

    const quaternion = playCanvasQuat(rotation);
    const collider = this.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(0.9)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(collider);
    return entity;
  }

  addClimbableBox(name, position, size, material, rotation = {}, surfaceType = 'normal') {
    const entity = this.addBox(name, position, size, material, rotation);
    const climbMaterial = getClimbMaterial(surfaceType);
    if (!climbMaterial.grippable) return entity;
    this.climbSurfaces.set(entity.physicsCollider.handle, {
      collider: entity.physicsCollider,
      entity,
      label: name,
      type: climbMaterial.id,
      material: climbMaterial,
      staminaMultiplier: climbMaterial.staminaMultiplier
    });
    return entity;
  }

  getClimbSurface(collider) {
    return collider ? this.climbSurfaces.get(collider.handle) ?? null : null;
  }

  getNearestFishingZone(point, maximumDistance = 3.2) {
    let nearest = null;
    let nearestDistance = maximumDistance;
    for (const zone of this.fishingZones) {
      if (Math.abs(point.y - zone.surfaceY) > 3.5) continue;
      const distance = zone.distanceToWater(point);
      if (distance <= nearestDistance) {
        nearest = zone;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  getCastableFishingZone(point, maximumCastDistance) {
    let nearest = null;
    let nearestDistance = maximumCastDistance;
    for (const zone of this.fishingZones) {
      if (!zone.canCastFrom(point, maximumCastDistance)) continue;
      const distance = zone.distanceToWater(point);
      if (distance <= nearestDistance) {
        nearest = zone;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  getFishingZoneForCast(point, direction, minimumCastDistance, maximumCastDistance) {
    const horizontalLength = Math.hypot(direction?.x ?? 0, direction?.z ?? 0);
    if (horizontalLength < .001) return null;
    const dx = direction.x / horizontalLength;
    const dz = direction.z / horizontalLength;
    for (let distance = minimumCastDistance; distance <= maximumCastDistance + .001; distance += .55) {
      const target = { x: point.x + dx * distance, y: point.y, z: point.z + dz * distance };
      const zone = this.findFishingZoneAt(target);
      if (zone && Math.abs(point.y - zone.surfaceY) <= 3.5) return zone;
    }
    return null;
  }

  findFishingZoneAt(point) {
    return this.fishingZones.find((zone) => zone.containsWaterFootprint(point)) ?? null;
  }

  addBoulder(name, position, scale, material = this.materials.rock) {
    const rotation = {
      x: (position.x * 17) % 32,
      y: (position.z * 23) % 180,
      z: (position.z * 11) % 28
    };
    const entity = this.createPrimitive(name, 'sphere', position, scale, material, rotation);
    const radius = Math.max(scale.x, scale.y, scale.z) * 0.45;
    const collider = this.RAPIER.ColliderDesc.ball(radius)
      .setTranslation(position.x, position.y, position.z)
      .setFriction(0.9)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(collider);
    return entity;
  }

  addCylinder(name, position, scale, material, rotation = {}, solid = true) {
    const entity = this.createPrimitive(name, 'cylinder', position, scale, material, rotation);
    if (!solid) return entity;

    const quaternion = playCanvasQuat(rotation);
    const halfHeight = scale.y * 0.5;
    const radius = Math.max(scale.x, scale.z) * 0.5;
    const collider = this.RAPIER.ColliderDesc.cylinder(halfHeight, radius)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(0.8);
    entity.physicsCollider = this.physicsWorld.createCollider(collider);
    return entity;
  }

  buildTerrain() {
    this.addBox(
      'Main meadow',
      { x: 0, y: -0.65, z: 0 },
      { x: 54, y: 1.3, z: 54 },
      this.materials.grass
    );

    this.addBox(
      'North rise',
      { x: 0, y: 0.15, z: -25 },
      { x: 44, y: 1.6, z: 8 },
      this.materials.grassLight,
      { x: 0, y: 0, z: 0 }
    );

    this.addBox(
      'Gentle practice slope',
      { x: -4, y: 1.05, z: -10 },
      { x: 9, y: 1, z: 5.5 },
      this.materials.grassLight,
      { x: 0, y: 0, z: -14 }
    );

    this.addBox(
      'Gentle slope landing',
      { x: 0.2, y: 1.65, z: -10 },
      { x: 4.5, y: 1, z: 5.5 },
      this.materials.grassLight
    );

    this.addBox(
      'Too-steep slope',
      { x: 15, y: 2.25, z: 8 },
      { x: 7, y: 1.1, z: 4.5 },
      this.materials.rockLight,
      { x: 0, y: 0, z: -54 }
    );
  }

  buildMovementCourse() {
    this.addClimbableBox(
      'Easy grip wall',
      { x: -14, y: 1.5, z: 7 },
      { x: 4, y: 3, z: 0.9 },
      this.materials.roughRock,
      {},
      'rough'
    );

    const ledges = [
      { x: -18, y: 0.45, z: -5, sx: 4.5, sy: 0.9, sz: 5 },
      { x: -14.5, y: 1.05, z: -5, sx: 2.8, sy: 2.1, sz: 4.5 },
      { x: -11.8, y: 1.7, z: -5, sx: 2.5, sy: 3.4, sz: 4 }
    ];
    for (const [index, ledge] of ledges.entries()) {
      this.addBox(
        `Short ledge ${index + 1}`,
        { x: ledge.x, y: ledge.y, z: ledge.z },
        { x: ledge.sx, y: ledge.sy, z: ledge.sz },
        index % 2 ? this.materials.earth : this.materials.rock
      );
    }

    for (let index = 0; index < 7; index += 1) {
      const height = 0.28 + index * 0.28;
      this.addBox(
        `Trail stair ${index + 1}`,
        { x: -8 + index * 1.05, y: height / 2, z: 16 },
        { x: 1.15, y: height, z: 3.2 },
        index % 2 ? this.materials.rockLight : this.materials.rock
      );
    }

    this.addBox(
      'Small cliff base',
      { x: 9, y: 1.8, z: 19 },
      { x: 10, y: 3.6, z: 6 },
      this.materials.earth
    );
    this.addBox(
      'Small cliff turf',
      { x: 9, y: 3.75, z: 19 },
      { x: 10.4, y: 0.3, z: 6.4 },
      this.materials.grassLight
    );

    const boulders = [
      [-16, 1.05, 2, 2.2, 2.1, 2.4],
      [-10, 0.7, 7, 1.5, 1.4, 1.8],
      [3, 0.95, 7, 2, 1.9, 1.7],
      [8, 0.6, -3, 1.3, 1.2, 1.5],
      [20, 1.15, -17, 2.3, 2.2, 2.7],
      [-19, 1.4, -18, 2.7, 2.8, 2.3]
    ];
    boulders.forEach(([x, y, z, sx, sy, sz], index) => {
      this.addBoulder(
        `Boulder ${index + 1}`,
        { x, y, z },
        { x: sx, y: sy, z: sz },
        index % 2 ? this.materials.rockLight : this.materials.rock
      );
    });
  }

  buildClimbingCourse() {
    this.addClimbableBox(
      'Tall normal wall',
      { x: -7, y: 3, z: 5 },
      { x: 4, y: 6, z: 1 },
      this.materials.normalRock,
      {},
      'normal'
    );

    this.addClimbableBox(
      'Rest ledge lower wall',
      { x: 0, y: 2, z: 5 },
      { x: 4, y: 4, z: 1 },
      this.materials.roughRock,
      {},
      'rough'
    );
    this.addBox(
      'Rest ledge shelf',
      { x: 0, y: 4.17, z: 5.7 },
      { x: 4.5, y: 0.34, z: 1.8 },
      this.materials.grassLight
    );
    this.addClimbableBox(
      'Rest ledge upper wall',
      { x: 0, y: 6.45, z: 5 },
      { x: 4, y: 4.3, z: 1 },
      this.materials.normalRock,
      {},
      'normal'
    );

    this.addClimbableBox(
      'Smooth angled practice face',
      { x: 7, y: 2.4, z: 5 },
      { x: 4, y: 4.8, z: 0.95 },
      this.materials.smoothRock,
      { x: -16, y: 0, z: 0 },
      'smooth'
    );

    this.addClimbableBox(
      'Ice practice face',
      { x: 14, y: 3, z: 5 },
      { x: 4, y: 6, z: 1 },
      this.materials.ice,
      {},
      'ice'
    );

    this.addClimbableBox(
      'Modest overhang',
      { x: 21, y: 3, z: 5 },
      { x: 4, y: 6, z: 1 },
      this.materials.normalRock,
      { x: 12, y: 0, z: 0 },
      'normal'
    );

    this.addClimbableBox(
      'Push-off wall west',
      { x: -2, y: 2.5, z: -3 },
      { x: 1, y: 5, z: 4 },
      this.materials.roughRock,
      {},
      'rough'
    );
    this.addClimbableBox(
      'Push-off wall east',
      { x: 2, y: 2.5, z: -3 },
      { x: 1, y: 5, z: 4 },
      this.materials.normalRock,
      {},
      'normal'
    );

    this.addClimbableBox(
      'Long sideways traverse',
      { x: 0, y: 2.25, z: -18.5 },
      { x: 11.5, y: 4.5, z: 0.9 },
      this.materials.smoothRock,
      {},
      'smooth'
    );
    this.addBox(
      'Traverse rest shelf',
      { x: 5.35, y: 4.62, z: -17.9 },
      { x: 2.2, y: 0.28, z: 1.5 },
      this.materials.grassLight
    );

    const transferSequence = [
      { x: 6, z: -2, rotation: 0, material: 'rough' },
      { x: 10, z: -2.35, rotation: 16, material: 'normal' },
      { x: 14, z: -1.8, rotation: -18, material: 'smooth' }
    ];
    transferSequence.forEach((piece, index) => {
      this.addClimbableBox(
        `Three-face transfer ${index + 1}`,
        { x: piece.x, y: 2.55 + index * 0.35, z: piece.z },
        { x: 1.2, y: 5.1, z: 3 },
        this.materials[`${piece.material}Rock`],
        { x: 0, y: piece.rotation, z: 0 },
        piece.material
      );
    });
    this.addClimbableBox(
      'Angled directional jump face',
      { x: 18, y: 3.2, z: -2.6 },
      { x: 1.3, y: 6.4, z: 3.2 },
      this.materials.normalRock,
      { x: 0, y: 28, z: 0 },
      'normal'
    );

    const irregularPieces = [
      {
        name: 'Irregular face lower',
        position: { x: -18, y: 1.5, z: -11 },
        size: { x: 3.8, y: 3, z: 1.15 },
        rotation: { x: -5, y: -8, z: 0 }
      },
      {
        name: 'Irregular face middle',
        position: { x: -17.55, y: 4.15, z: -11.15 },
        size: { x: 3.5, y: 3, z: 1.15 },
        rotation: { x: 3, y: 10, z: -4 }
      },
      {
        name: 'Irregular face summit',
        position: { x: -18.05, y: 6.65, z: -11.35 },
        size: { x: 3.2, y: 2.4, z: 1.2 },
        rotation: { x: -7, y: -7, z: 3 }
      }
    ];
    irregularPieces.forEach((piece, index) => {
      this.addClimbableBox(
        piece.name,
        piece.position,
        piece.size,
        index % 2 ? this.materials.normalRock : this.materials.roughRock,
        piece.rotation,
        index % 2 ? 'normal' : 'rough'
      );
    });

    this.addClimbableBox(
      'Narrow summit pillar',
      { x: -8, y: 4, z: -13 },
      { x: 2.4, y: 8, z: 1.4 },
      this.materials.smoothRock,
      {},
      'smooth'
    );
    this.addBox(
      'Narrow summit cap',
      { x: -8, y: 8.12, z: -13 },
      { x: 2.7, y: 0.24, z: 1.7 },
      this.materials.grassLight
    );

    this.addBox(
      'Unclimbable timber wall',
      { x: 21, y: 2, z: 13 },
      { x: 4, y: 4, z: 1 },
      this.materials.unclimbable
    );
    this.createPrimitive(
      'Unclimbable wall stripe',
      'box',
      { x: 21, y: 2, z: 13.52 },
      { x: 3.25, y: 0.28, z: 0.05 },
      this.materials.flowers,
      {},
      { castShadows: false }
    );

    this.addBox(
      'Impossible direct route',
      { x: 18, y: 4, z: -20 },
      { x: 4.2, y: 8, z: 1 },
      this.materials.unclimbable
    );
    for (let index = 0; index < 4; index += 1) {
      this.addClimbableBox(
        `Alternate rough route ${index + 1}`,
        { x: 13.4 + index * 1.15, y: 1.25 + index * 1.7, z: -19.2 - index * 0.22 },
        { x: 1.35, y: 2.5, z: 1.4 },
        index < 3 ? this.materials.roughRock : this.materials.normalRock,
        { x: index % 2 ? -5 : 4, y: index * 7, z: 0 },
        index < 3 ? 'rough' : 'normal'
      );
    }

    for (let index = 0; index < 4; index += 1) {
      this.createPrimitive(
        `Rough rock grip facet ${index + 1}`,
        'sphere',
        { x: -15.25 + index * 0.82, y: 0.65 + (index % 2) * 0.85, z: 7.49 },
        { x: 0.32, y: 0.2, z: 0.12 },
        this.materials.rockLight,
        { x: index * 19, y: 0, z: index % 2 ? 18 : -12 },
        { castShadows: false }
      );
    }
    for (let index = 0; index < 3; index += 1) {
      this.createPrimitive(
        `Ice face shard ${index + 1}`,
        'cone',
        { x: 12.9 + index * 1.05, y: 1.1 + index * 0.85, z: 5.54 },
        { x: 0.28, y: 0.62, z: 0.12 },
        this.materials.ice,
        { x: 0, y: 0, z: index % 2 ? 18 : -14 },
        { castShadows: false }
      );
    }
  }

  buildPondAndBridge() {
    const pond = { x: 13, y: 0.045, z: -12 };
    this.fishingZones.push(new FishingZone({
      id: 'mirror-pond',
      label: 'Mirror Pond',
      center: { x: pond.x, z: pond.z },
      radii: { x: 5.6, z: 4.35 },
      surfaceY: 0.09,
      fishIds: [
        'bluegill', 'yellow-perch', 'pumpkinseed', 'golden-shiner',
        'smallmouth-bass', 'rainbow-trout', 'largemouth-bass',
        'common-carp', 'channel-catfish'
      ],
      modifiers: { biteRate: 1, size: 1 },
      exclusions: [
        { x: 13, z: -12, width: 13.8, depth: 2.25 },
        { x: 13, z: -8.2, width: 3.5, depth: 2.8 }
      ]
    }));
    this.water = this.addCylinder(
      'Shallow pond water',
      pond,
      { x: 11.5, y: 0.035, z: 9 },
      this.materials.water,
      {},
      false
    );
    this.water.render.castShadows = false;

    const shoreline = [
      [7.2, -16.3, 1.7, 0.55],
      [10.2, -16.6, 1.25, 0.45],
      [15.7, -16.3, 1.5, 0.55],
      [18.7, -14.7, 1.6, 0.5],
      [18.8, -9.5, 1.3, 0.45],
      [15.7, -7.8, 1.4, 0.48],
      [9.2, -7.8, 1.5, 0.5],
      [7.1, -10, 1.2, 0.42]
    ];
    shoreline.forEach(([x, z, sx, sy], index) => {
      this.addBoulder(
        `Shore stone ${index + 1}`,
        { x, y: sy * 0.55, z },
        { x: sx, y: sy, z: sx * 0.9 },
        this.materials.waterEdge
      );
    });

    for (let index = 0; index < 12; index += 1) {
      const x = 6.7 + index * 1.14;
      this.addBox(
        `Bridge plank ${index + 1}`,
        { x, y: 0.42 + (index % 2) * 0.025, z: -12 },
        { x: 1.02, y: 0.2, z: 2.15 },
        index % 3 ? this.materials.woodLight : this.materials.wood,
        { x: 0, y: 0, z: (index % 3 - 1) * 1.2 }
      );
    }

    this.addBox(
      'Bridge north rail',
      { x: 13, y: 0.93, z: -13.03 },
      { x: 13.8, y: 0.14, z: 0.14 },
      this.materials.wood
    );
    this.addBox(
      'Bridge south rail',
      { x: 13, y: 0.93, z: -10.97 },
      { x: 13.8, y: 0.14, z: 0.14 },
      this.materials.wood
    );

    for (let index = 0; index < 5; index += 1) {
      this.addBox(
        `Fishing dock plank ${index + 1}`,
        { x: 11.8 + index * 0.6, y: 0.32 + (index % 2) * 0.012, z: -8.2 },
        { x: 0.55, y: 0.18, z: 2.65 },
        index % 2 ? this.materials.wood : this.materials.woodLight
      );
    }
    this.addCylinder(
      'Fishing dock post west',
      { x: 11.65, y: 0.5, z: -9.25 },
      { x: 0.18, y: 0.5, z: 0.18 },
      this.materials.wood
    );
    this.addCylinder(
      'Fishing dock post east',
      { x: 14.35, y: 0.5, z: -9.25 },
      { x: 0.18, y: 0.5, z: 0.18 },
      this.materials.wood
    );
  }

  buildScenery() {
    const trees = [
      [-23, -21, 1.05],
      [-16, -22, 1.25],
      [-9, -23, 0.9],
      [4, -23, 1.15],
      [23, -22, 1.25],
      [23, -5, 1.1],
      [-23, 8, 1],
      [-19, 18, 1.2],
      [19, 20, 0.95]
    ];
    trees.forEach(([x, z, size], index) => this.addTree(x, z, size, index));

    const tufts = [
      [-13, 10],
      [-5, 4],
      [1, 13],
      [6, -18],
      [20, 1],
      [-18, -12],
      [2, -4]
    ];
    tufts.forEach(([x, z], index) => {
      const flower = this.createPrimitive(
        `Trail flower ${index + 1}`,
        'sphere',
        { x, y: 0.2, z },
        { x: 0.22, y: 0.34, z: 0.22 },
        this.materials.flowers,
        {},
        { castShadows: false }
      );
      flower.setEulerAngles(0, index * 37, index % 2 ? 12 : -10);
    });
  }

  addTree(x, z, size, index) {
    this.addCylinder(
      `Pine trunk ${index + 1}`,
      { x, y: 1.15 * size, z },
      { x: 0.62 * size, y: 1.15 * size, z: 0.62 * size },
      this.materials.wood
    );
    this.createPrimitive(
      `Pine crown ${index + 1}`,
      'cone',
      { x, y: 3.35 * size, z },
      { x: 2.5 * size, y: 3 * size, z: 2.5 * size },
      index % 2 ? this.materials.foliageLight : this.materials.foliage,
      { x: 0, y: index * 31, z: 0 }
    );
  }

  update(dt) {
    this.elapsed += dt;
    const pulse = 1 + Math.sin(this.elapsed * 0.85) * 0.004;
    this.water.setLocalScale(11.5 * pulse, 0.035, 9 * pulse);
    this.water.rotateLocal(0, dt * 0.7, 0);
  }
}
