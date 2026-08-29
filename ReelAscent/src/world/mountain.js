import * as pc from 'playcanvas';
import { PLAYER_FOOT_OFFSET } from '../config.js';
import { FishingZone } from '../fishing/fishing-zone.js';
import { getClimbMaterial } from '../player/climbing-materials.js';
import { TestWorld } from './world.js';

export const MOUNTAIN_CENTER = Object.freeze({ x: 260, z: 0 });
export const SUMMIT_HEIGHT = 142;
export const COASTAL_SHELF_RADIUS = 198;
export const MOUNTAIN_FAILURE_RADIUS = 210;

export const MOUNTAIN_BANDS = Object.freeze([
  Object.freeze({ id: 'lower', radius: 142, bottom: 0, top: 22, routeCount: 12 }),
  Object.freeze({ id: 'middle', radius: 108, bottom: 22, top: 52, routeCount: 10 }),
  Object.freeze({ id: 'upper', radius: 76, bottom: 52, top: 87, routeCount: 8 }),
  Object.freeze({ id: 'alpine', radius: 47, bottom: 87, top: 120, routeCount: 6 }),
  Object.freeze({ id: 'summit', radius: 23, bottom: 120, top: 142, routeCount: 4 })
]);

export const MOUNTAIN_MASS_PROFILES = Object.freeze([
  Object.freeze({
    id: 'lower', bottom: -.15, top: 22, bottomRadius: 160, topRadius: 142,
    segments: 31, offsetX: 0, offsetZ: 0, seed: 2,
    notches: Object.freeze([{ angle: 126, span: 14, radius: 145 }, { angle: 180, span: 15, radius: 146 }])
  }),
  Object.freeze({
    id: 'middle', bottom: 21.85, top: 52, bottomRadius: 140, topRadius: 108,
    segments: 27, offsetX: -3, offsetZ: 4, seed: 5,
    notches: Object.freeze([{ angle: 242, span: 15, radius: 106 }, { angle: 336, span: 15, radius: 106 }])
  }),
  Object.freeze({
    id: 'upper', bottom: 51.85, top: 87, bottomRadius: 106, topRadius: 76,
    segments: 23, offsetX: 4, offsetZ: -2, seed: 8,
    notches: Object.freeze([{ angle: 78, span: 16, radius: 78 }, { angle: 205, span: 15, radius: 78 }])
  }),
  Object.freeze({
    id: 'alpine', bottom: 86.85, top: 120, bottomRadius: 74, topRadius: 47,
    segments: 19, offsetX: -3, offsetZ: -2, seed: 11,
    notches: Object.freeze([{ angle: 278, span: 17, radius: 47 }, { angle: 322, span: 16, radius: 47 }])
  }),
  Object.freeze({
    id: 'summit', bottom: 119.85, top: 142, bottomRadius: 45, topRadius: 23,
    segments: 15, offsetX: 2, offsetZ: 1, seed: 14,
    notches: Object.freeze([{ angle: 85, span: 18, radius: 26 }])
  })
]);

export const TERRAIN_ANGLE_PROFILE = Object.freeze({
  walkable: Object.freeze([25, 35]),
  scramble: Object.freeze([40, 55]),
  climb: Object.freeze([55, 75]),
  steep: Object.freeze([75, 88]),
  vertical: Object.freeze([88, 90]),
  overhangCount: 0
});

export const ROCK_FIELD_FORMATION_COUNT = MOUNTAIN_BANDS.reduce((total, band) => total + band.routeCount * 2, 0);

const SECTORS = Object.freeze([
  'Sandy Beach', 'Rocky Coast', 'Forest Inlet',
  'Waterfall Basin', 'Cliffside Shore', 'Sheltered Cove'
]);

function radialPoint(angle, radius, y, tangentOffset = 0) {
  const radians = angle * Math.PI / 180;
  const radialX = Math.cos(radians);
  const radialZ = Math.sin(radians);
  return {
    x: MOUNTAIN_CENTER.x + radialX * radius - radialZ * tangentOffset,
    y,
    z: MOUNTAIN_CENTER.z + radialZ * radius + radialX * tangentOffset
  };
}

const inwardYaw = (angle) => 90 - angle;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

function stableNameHash(value) {
  return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}

function angularDistance(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

function applyTerrainNotches(profile, angle, radius) {
  let result = radius;
  for (const notch of profile.notches ?? []) {
    const distance = angularDistance(angle, notch.angle);
    if (distance >= notch.span) continue;
    const blend = distance / notch.span;
    const eased = blend * blend * (3 - 2 * blend);
    result = Math.min(result, notch.radius + (radius - notch.radius) * eased);
  }
  return result;
}

function profileRadiusAt(profile, angle, heightFraction) {
  const base = profile.bottomRadius
    + (profile.topRadius - profile.bottomRadius) * clamp(heightFraction, 0, 1);
  return applyTerrainNotches(profile, angle, base);
}

function profileHeightAtRadius(profile, angle, radius) {
  const bottomRadius = applyTerrainNotches(profile, angle, profile.bottomRadius);
  const topRadius = applyTerrainNotches(profile, angle, profile.topRadius);
  const fraction = (bottomRadius - radius) / Math.max(.01, bottomRadius - topRadius);
  return profile.bottom + (profile.top - profile.bottom) * clamp(fraction, 0, 1);
}

export const START_LOCATIONS = Object.freeze([
  { id: 'sandy-beach', label: 'Sandy Beach', sector: SECTORS[0], angle: 0, position: radialPoint(0, 168, 1.35), facingYaw: inwardYaw(0) },
  { id: 'rocky-coast', label: 'Rocky Coast', sector: SECTORS[1], angle: 60, position: radialPoint(60, 168, 1.35), facingYaw: inwardYaw(60) },
  { id: 'forest-inlet', label: 'Forest Inlet', sector: SECTORS[2], angle: 120, position: radialPoint(120, 167, 1.35), facingYaw: inwardYaw(120) },
  { id: 'waterfall-basin', label: 'Waterfall Basin', sector: SECTORS[3], angle: 180, position: radialPoint(180, 168, 1.35), facingYaw: inwardYaw(180) },
  { id: 'cliffside-shore', label: 'Cliffside Shore', sector: SECTORS[4], angle: 240, position: radialPoint(240, 167, 1.35), facingYaw: inwardYaw(240) },
  { id: 'sheltered-cove', label: 'Sheltered Cove', sector: SECTORS[5], angle: 300, position: radialPoint(300, 168, 1.35), facingYaw: inwardYaw(300) }
]);

const routeSet = (band, angles, outerRadius, innerRadius, bottom, top, types) => angles.map((angle, index) => Object.freeze({
  id: `${band}-${index + 1}`,
  band,
  angle,
  outerRadius,
  innerRadius,
  bottom,
  top,
  style: ['scramble', 'traverse', 'parkour', 'ridge', 'wet-line', 'transfer'][index % 6],
  materials: types[index % types.length]
}));

export const ROUTE_NETWORKS = Object.freeze([
  ...routeSet('lower', [0, 28, 58, 88, 118, 148, 178, 208, 238, 268, 302, 332], 166, 142, 0, 22,
    [['rough', 'normal'], ['normal', 'rough'], ['smooth', 'normal']]),
  ...routeSet('middle', [12, 48, 84, 120, 156, 192, 228, 264, 300, 336], 140, 108, 22, 52,
    [['rough', 'normal'], ['normal', 'smooth'], ['smooth', 'rough']]),
  ...routeSet('upper', [18, 63, 108, 153, 198, 243, 288, 333], 106, 76, 52, 87,
    [['normal', 'rough'], ['smooth', 'normal'], ['rough', 'smooth']]),
  ...routeSet('alpine', [8, 68, 128, 188, 248, 308], 74, 47, 87, 120,
    [['ice', 'rough'], ['normal', 'ice'], ['rough', 'normal']]),
  ...routeSet('summit', [22, 112, 202, 292], 45, 23, 120, 142,
    [['rough', 'ice'], ['ice', 'normal']])
]);

export const INTENTIONAL_OVERHANGS = Object.freeze([]);

export const MOUNTAIN_FISHING_LOCATIONS = Object.freeze([
  { id: 'sunwash-tidepool', label: 'Sunwash Tidepool', angle: 4, radius: 184, y: .09, radii: [6, 4.8], depth: 'shallow', fish: ['sardine', 'anchovy', 'tidepool-sculpin', 'striped-mullet'], size: .94, rarityBias: 0, trophyChance: .9 },
  { id: 'blackstone-inlet', label: 'Blackstone Inlet', angle: 61, radius: 183, y: .1, radii: [7, 5.3], depth: 'deep', fish: ['mackerel', 'rockfish', 'sea-bass', 'flounder'], size: 1, rarityBias: .08, trophyChance: 1 },
  { id: 'fernwater-pond', label: 'Fernwater Pond', angle: 126, radius: 156, y: .1, radii: [7.3, 5.8], depth: 'shallow', fish: ['bluegill', 'pumpkinseed', 'golden-shiner', 'largemouth-bass', 'common-carp'], size: 1, rarityBias: .06, trophyChance: 1 },
  { id: 'fallglass-basin', label: 'Fallglass Basin', angle: 180, radius: 157, y: .1, radii: [8, 6.2], depth: 'deep', fish: ['creek-chub', 'longnose-dace', 'white-sucker', 'rainbow-trout', 'smallmouth-bass'], size: 1.02, rarityBias: .1, trophyChance: 1.02 },
  { id: 'gull-crag-pond', label: 'Gull Crag Pond', angle: 242, radius: 122, y: 22.1, radii: [6.5, 5.1], depth: 'shallow', fish: ['yellow-perch', 'black-crappie', 'freshwater-drum', 'channel-catfish'], size: 1.04, rarityBias: .24, trophyChance: 1.08 },
  { id: 'red-river-bend', label: 'Red River Bend', angle: 336, radius: 122, y: 22.1, radii: [6.6, 4.8], depth: 'shallow', fish: ['longnose-dace', 'white-sucker', 'smallmouth-bass', 'rainbow-trout'], size: 1.04, rarityBias: .18, trophyChance: 1.08 },
  { id: 'echo-cave-pool', label: 'Echo Cave Pool', angle: 205, radius: 91, y: 52.1, radii: [5.7, 4.5], depth: 'shallow', fish: ['stone-loach', 'cave-tetra', 'blind-cave-eel', 'burbot'], size: 1.08, rarityBias: .42, trophyChance: 1.16 },
  { id: 'cloudstep-lake', label: 'Cloudstep Lake', angle: 78, radius: 91, y: 52.1, radii: [7, 5.4], depth: 'deep', fish: ['rainbow-trout', 'brook-trout', 'mountain-whitefish', 'cutthroat-trout'], size: 1.08, rarityBias: .4, trophyChance: 1.16 },
  { id: 'hidden-ridge-pool', label: 'Hidden Ridge Pool', angle: 278, radius: 61, y: 87.1, radii: [5.6, 4.3], depth: 'shallow', fish: ['brook-trout', 'cutthroat-trout', 'mountain-whitefish', 'burbot'], size: 1.1, rarityBias: .58, trophyChance: 1.24 },
  { id: 'blue-ice-melt', label: 'Blue-Ice Melt', angle: 322, radius: 60, y: 87.1, radii: [5.8, 4.6], depth: 'shallow', fish: ['brook-trout', 'mountain-whitefish', 'cutthroat-trout', 'alpine-char'], size: 1.12, rarityBias: .66, trophyChance: 1.3 },
  { id: 'high-cirque-tarn', label: 'High Cirque Tarn', angle: 85, radius: 35, y: 120.1, radii: [4.6, 3.7], depth: 'shallow', fish: ['mountain-whitefish', 'cutthroat-trout', 'alpine-char', 'burbot'], size: 1.15, rarityBias: .82, trophyChance: 1.42 },
  { id: 'crooked-peak-tarn', label: 'Crooked Peak Tarn', angle: 0, radius: 6, y: 142.1, radii: [3.7, 3.1], depth: 'shallow', fish: ['rainbow-trout', 'cutthroat-trout', 'alpine-char', 'channel-catfish'], size: 1.18, rarityBias: 1, trophyChance: 1.55 }
]);

function makeMaterial(values, options = {}) {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(values[0], values[1], values[2], options.opacity ?? 1);
  material.emissive = new pc.Color(...(options.emissive ?? [0, 0, 0]));
  material.emissiveIntensity = options.emissiveIntensity ?? 1;
  material.gloss = options.gloss ?? .12;
  material.opacity = options.opacity ?? 1;
  if (material.opacity < 1) {
    material.blendType = pc.BLEND_NORMAL;
    material.depthWrite = false;
  }
  material.update();
  return material;
}

export class MountainWorld extends TestWorld {
  constructor(app, RAPIER, physicsWorld) {
    super(app, RAPIER, physicsWorld);
    this.root.name = 'Milestone 5.0 irregular mountain, route landmarks, and retained mechanics course';
    this.courseRoot.enabled = false;
    this.buildTarget = this.root;
    this.mountainWaters = [];
    this.summitRadius = 19;
    this.materials.sand = makeMaterial([.8, .7, .47], { gloss: .04 });
    this.materials.coast = makeMaterial([.48, .52, .51], { gloss: .18 });
    this.materials.forestFloor = makeMaterial([.39, .53, .34], { gloss: .05 });
    this.materials.wetRock = makeMaterial([.36, .48, .49], { gloss: .78 });
    this.materials.alpine = makeMaterial([.56, .6, .55], { gloss: .1 });
    this.materials.snow = makeMaterial([.9, .92, .88], { gloss: .26 });
    this.materials.deepRock = makeMaterial([.47, .49, .47], { gloss: .07 });
    this.materials.cave = makeMaterial([.22, .25, .25], { gloss: .02 });
    this.materials.shallowWater = makeMaterial([.25, .68, .69], { opacity: .66, gloss: .82, emissive: [.03, .13, .12] });
    this.materials.deepWater = makeMaterial([.12, .38, .48], { opacity: .78, gloss: .9, emissive: [.015, .07, .1] });
    this.materials.waterfall = makeMaterial([.62, .86, .88], { opacity: .76, gloss: .9, emissive: [.04, .13, .14] });
    this.materials.holdRough = makeMaterial([.67, .52, .34], { gloss: .04 });
    this.materials.holdNormal = makeMaterial([.62, .66, .57], { gloss: .14 });
    this.materials.holdSmooth = makeMaterial([.16, .29, .31], { gloss: .9 });
    this.materials.holdIce = makeMaterial([.55, .8, .9], { gloss: .98, emissive: [.03, .08, .1] });
    this.materials.rockCrack = makeMaterial([.19, .21, .2], { gloss: .025 });
    this.rockMaterialVariants = new Map();
    this.fracturedRockForms = [0, 1, 2].map((seed) => this.createFracturedRockForm(seed));

    this.buildMountainMass();
    this.buildStartsAndSectors();
    ROUTE_NETWORKS.forEach((route) => this.addRouteNetwork(route));
    this.buildLateralLinks();
    this.buildRockFields();
    this.buildLandmarks();
    this.buildFishingLocations();
  }

  point(angle, radius, y, tangentOffset = 0) {
    return radialPoint(angle, radius, y, tangentOffset);
  }

  createFracturedRockForm(seed) {
    const vertices = [];
    for (let ring = 0; ring < 2; ring += 1) {
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        const variation = 1 + ((((index * 7 + ring * 5 + seed * 3) % 9) - 4) * .025);
        const radius = (ring ? .47 : .5) * variation;
        const yVariation = (((index * 5 + seed * 2) % 7) - 3) * .012;
        vertices.push([
          Math.cos(angle) * radius,
          (ring ? .39 : -.39) + yVariation,
          Math.sin(angle) * radius * (.92 + ((index + seed) % 3) * .035)
        ]);
      }
    }
    vertices.push([-.08 + seed * .035, -.5, .05 - seed * .025]);
    vertices.push([.07 - seed * .025, .5, -.04 + seed * .03]);
    const triangles = [];
    for (let index = 0; index < 8; index += 1) {
      const next = (index + 1) % 8;
      triangles.push([index, next, 8 + next], [index, 8 + next, 8 + index]);
      triangles.push([16, next, index], [17, 8 + index, 8 + next]);
    }
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
    return {
      mesh: pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry),
      hull: vertices
    };
  }

  addTerrainMass(name, profile, material) {
    const vertices = [
      [0, profile.top, 0],
      [0, profile.bottom, 0]
    ];
    // Subdivide each band vertically into a few irregular rings. This creates readable
    // rock facets on formerly enormous flat triangles with one mesh/collider and no textures.
    const verticalSegments = 4;
    const ringStarts = [];
    for (let ring = 0; ring <= verticalSegments; ring += 1) {
      const fraction = ring / verticalSegments;
      const ringY = profile.top + (profile.bottom - profile.top) * fraction;
      const baseRadius = profile.topRadius + (profile.bottomRadius - profile.topRadius) * fraction;
      ringStarts.push(vertices.length);
      for (let index = 0; index < profile.segments; index += 1) {
        const angle = index * Math.PI * 2 / profile.segments;
        const angleDegrees = angle * 180 / Math.PI;
        const broad = Math.sin(angle * (2 + ring % 3) + profile.seed * (.7 + ring * .09)) * .018;
        const chipped = ((((index * (5 + ring * 2) + profile.seed * 3) % 13) - 6) * .0035);
        const radius = applyTerrainNotches(profile, angleDegrees, baseRadius * (1 + broad + chipped));
        const verticalChip = ring === 0 || ring === verticalSegments
          ? 0
          : (((index * 7 + ring * 11 + profile.seed) % 9) - 4) * .055;
        vertices.push([Math.cos(angle) * radius, ringY + verticalChip, Math.sin(angle) * radius]);
      }
    }

    const triangles = [];
    for (let index = 0; index < profile.segments; index += 1) {
      const next = (index + 1) % profile.segments;
      const top = ringStarts[0] + index;
      const topNext = ringStarts[0] + next;
      triangles.push([0, topNext, top]);
      for (let ring = 0; ring < verticalSegments; ring += 1) {
        const upper = ringStarts[ring] + index;
        const upperNext = ringStarts[ring] + next;
        const lower = ringStarts[ring + 1] + index;
        const lowerNext = ringStarts[ring + 1] + next;
        if ((index + ring) % 2) triangles.push([upper, upperNext, lower], [upperNext, lowerNext, lower]);
        else triangles.push([upper, upperNext, lowerNext], [upper, lowerNext, lower]);
      }
      const bottom = ringStarts.at(-1) + index;
      const bottomNext = ringStarts.at(-1) + next;
      triangles.push([1, bottom, bottomNext]);
    }

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
    const mesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry);
    const entity = new pc.Entity(name);
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, this.getRockMaterial(material, name), entity)];
    entity.render.castShadows = false;
    entity.setPosition(MOUNTAIN_CENTER.x + profile.offsetX, 0, MOUNTAIN_CENTER.z + profile.offsetZ);
    this.buildTarget.addChild(entity);

    const collider = this.RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices.flat()),
      new Uint32Array(triangles.flat())
    )
      .setTranslation(MOUNTAIN_CENTER.x + profile.offsetX, 0, MOUNTAIN_CENTER.z + profile.offsetZ)
      .setFriction(.92)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(collider);
    return entity;
  }

  getRockMaterial(baseMaterial, name) {
    let variants = this.rockMaterialVariants.get(baseMaterial);
    if (!variants) {
      // Several deterministic albedo/hue variants keep broad procedural faces readable
      // without adding texture downloads or extra draw calls per rock.
      variants = [.92, .98, 1.04, 1.1, 1.16].map((factor, index) => makeMaterial([
        clamp(baseMaterial.diffuse.r * factor + (index >= 3 ? .018 : 0), 0, 1),
        clamp(baseMaterial.diffuse.g * factor + (index === 1 ? .012 : 0), 0, 1),
        clamp(baseMaterial.diffuse.b * factor - (index === 0 ? .012 : 0), 0, 1)
      ], {
        gloss: clamp(baseMaterial.gloss * (.76 + index * .12), 0, 1),
        opacity: baseMaterial.opacity,
        emissive: [baseMaterial.emissive.r, baseMaterial.emissive.g, baseMaterial.emissive.b]
      }));
      this.rockMaterialVariants.set(baseMaterial, variants);
    }
    return variants[stableNameHash(name) % variants.length];
  }

  addNaturalRock(name, position, size, material, rotation = {}, options = {}) {
    const form = this.fracturedRockForms[stableNameHash(name) % this.fracturedRockForms.length];
    const entity = new pc.Entity(name);
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(form.mesh, this.getRockMaterial(material, name), entity)];
    entity.render.castShadows = options.castShadows ?? false;
    entity.setPosition(position.x, position.y, position.z);
    entity.setLocalScale(size.x, size.y, size.z);
    entity.setEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    this.buildTarget.addChild(entity);
    if (options.solid === false) return entity;

    const points = new Float32Array(form.hull.flatMap((vertex) => [
      vertex[0] * size.x,
      vertex[1] * size.y,
      vertex[2] * size.z
    ]));
    const colliderDesc = this.RAPIER.ColliderDesc.convexHull(points);
    if (!colliderDesc) return entity;
    const quaternion = new pc.Quat().setFromEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    colliderDesc
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(.9)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(colliderDesc);
    if (options.climbMaterial) {
      const climbMaterial = getClimbMaterial(options.climbMaterial);
      this.climbSurfaces.set(entity.physicsCollider.handle, {
        collider: entity.physicsCollider,
        entity,
        label: name,
        type: climbMaterial.id,
        material: climbMaterial,
        staminaMultiplier: climbMaterial.staminaMultiplier
      });
    }
    return entity;
  }

  addRockMass(name, angle, radius, y, size, material, options = {}) {
    const position = this.point(angle, radius, y, options.tangentOffset ?? 0);
    const rotation = {
      x: options.pitch ?? 0,
      y: inwardYaw(angle) + (options.yawOffset ?? 0),
      z: options.roll ?? 0
    };
    return this.addNaturalRock(name, position, size, material, rotation, options);
  }

  addRadialBox(name, angle, radius, y, size, material, options = {}) {
    const position = this.point(angle, radius, y, options.tangentOffset ?? 0);
    const rotation = { x: options.tilt ?? 0, y: inwardYaw(angle), z: options.roll ?? 0 };
    if (options.primitive) return this.addBox(name, position, size, material, rotation, options.solid ?? true);
    return this.addNaturalRock(name, position, size, material, rotation, options);
  }

  addMountainBoulder(name, position, scale, material = this.materials.rock, options = {}) {
    const rotation = {
      x: (position.x * 17) % 32,
      y: (position.z * 23) % 180,
      z: (position.z * 11) % 28
    };
    return this.addNaturalRock(name, position, scale, material, rotation, options);
  }

  materialForClimb(type) {
    if (type === 'rough') return this.materials.roughRock;
    if (type === 'smooth') return this.materials.smoothRock;
    if (type === 'ice') return this.materials.ice;
    return this.materials.normalRock;
  }

  holdMaterial(type) {
    return this.materials[`hold${type[0].toUpperCase()}${type.slice(1)}`] ?? this.materials.holdNormal;
  }

  addClimbFace(name, angle, radius, bottom, height, width, type, tangentOffset = 0, tilt = 0) {
    const face = this.addRadialBox(name, angle, radius, bottom + height / 2, { x: width, y: height, z: 1.25 }, this.materialForClimb(type), {
      climbMaterial: type, tangentOffset, tilt
    });
    const counts = { rough: 4, normal: 3, smooth: 2, ice: 4 };
    const count = counts[type] ?? 4;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 2);
      const side = index % 2 ? 1 : -1;
      const holdY = bottom + height * (.2 + (row + .25) / (Math.ceil(count / 2) + .5) * .65);
      const holdWidth = type === 'rough' ? .7 : type === 'normal' ? .46 : type === 'ice' ? .34 : .5;
      const hold = this.addRadialBox(`${name} ${type} hold ${index + 1}`, angle, radius + .78, holdY,
        { x: holdWidth, y: type === 'ice' ? .62 : .28, z: type === 'smooth' ? .12 : .3 },
        this.holdMaterial(type), { tangentOffset: tangentOffset + side * width * (.18 + row * .07), roll: type === 'ice' ? side * 24 : side * 6, solid: false });
      hold.render.castShadows = false;
    }
    this.addRadialBox(`${name} visible crack`, angle, radius + .8, bottom + height * .52,
      { x: .18, y: Math.min(2.2, height * .3), z: .08 }, this.materials.rockCrack,
      { tangentOffset: tangentOffset - width * .12, roll: 12, solid: false });
    return face;
  }

  addRouteNetwork(route) {
    const rise = route.top - route.bottom;
    const span = route.outerRadius - route.innerRadius;
    const [lowerType, upperType] = route.materials;
    const tangent = ((route.angle / 28) % 3 - 1) * 1.3;

    // Every network opens with a broad 25–35° slab before splitting into scrambles and faces.
    for (let piece = -1; piece <= 1; piece += 1) {
      const approachMaterial = piece === 0
        ? (route.band === 'lower' ? this.materials.roughRock : this.materials.alpine)
        : piece < 0 ? this.materials.normalRock : this.materials.rockLight;
      this.addRockMass(`${route.id} fractured approach slab ${piece + 2}`, route.angle,
        route.outerRadius - 6.2 - Math.abs(piece) * .35,
        route.bottom + 1.75 + (piece + 1) * .12,
        { x: 4.15, y: 1.85 + (piece === 0 ? .28 : 0), z: 10.2 - Math.abs(piece) * .55 },
        approachMaterial,
        {
          pitch: (route.style === 'ridge' ? 27 : 23) + piece * 2,
          tangentOffset: tangent + piece * 3.15,
          roll: piece * 5 + (route.style === 'traverse' ? 3 : -1),
          climbMaterial: route.band === 'alpine' || route.band === 'summit' ? 'normal' : 'rough'
        });
    }

    if (route.style === 'parkour' || route.style === 'scramble') {
      for (let index = 0; index < 3; index += 1) {
        const point = this.point(route.angle, route.outerRadius - 12.5 - index * 2.7,
          route.bottom + 2.1 + index * .8, tangent + (index - 1) * 2.2);
        this.addMountainBoulder(`${route.id} boulder ${index + 1}`, point,
          { x: 2.5 + index * .35, y: 1.8 + (index % 2) * .75, z: 2.2 + (2 - index) * .35 },
          index % 2 ? this.materials.rockLight : this.materials.deepRock);
      }
    }

    const lowerRadius = route.outerRadius - span * .48;
    const lowerBottom = route.bottom + Math.min(2.1, rise * .12);
    const lowerHeight = rise * .34;
    this.addClimbFace(`${route.id} lower ${lowerType} face`, route.angle, lowerRadius,
      lowerBottom, lowerHeight, route.style === 'transfer' ? 4.8 : 6.8, lowerType, tangent,
      route.style === 'wet-line' ? -7 : route.style === 'scramble' ? -18 : -11);
    const restY = lowerBottom + lowerHeight + .18;
    this.addRadialBox(`${route.id} diagonal traverse`, route.angle, lowerRadius + .7, restY,
      { x: route.style === 'traverse' ? 13.5 : 9.2, y: .42, z: 2.8 },
      lowerType === 'smooth' ? this.materials.wetRock : this.materials.roughRock,
      { tangentOffset: tangent + (route.style === 'traverse' ? 2.8 : 0), roll: route.style === 'traverse' ? 7 : -4 });

    const ridgeLength = Math.max(5, span * .28);
    this.addRadialBox(`${route.id} broken ridge`, route.angle, lowerRadius - ridgeLength / 2,
      restY + rise * .09, { x: 5.2, y: 1.05, z: ridgeLength },
      route.band === 'alpine' || route.band === 'summit' ? this.materials.snow : this.materials.rockLight,
      { tilt: 11, tangentOffset: tangent - 1.1, roll: 4 });

    const upperRadius = route.innerRadius + .9;
    const upperBottom = route.bottom + rise * .55;
    const upperHeight = rise * .38;
    this.addClimbFace(`${route.id} upper ${upperType} face`, route.angle, upperRadius,
      upperBottom, upperHeight, route.style === 'transfer' ? 4.6 : 6.4, upperType,
      tangent + (route.style === 'transfer' ? -2.8 : .5), route.style === 'wet-line' ? -5 : -9);
    this.addRadialBox(`${route.id} mantle shelf`, route.angle, route.innerRadius + 1.4, route.top + .18,
      { x: 8.2, y: .42, z: 3.6 },
      route.band === 'alpine' || route.band === 'summit' ? this.materials.snow : this.materials.roughRock,
      { tangentOffset: tangent + .5, roll: route.angle % 2 ? 3 : -3 });
  }

  buildMountainMass() {
    this.ocean = this.addCylinder('Outer ocean', { x: MOUNTAIN_CENTER.x, y: -.74, z: MOUNTAIN_CENTER.z },
      { x: 500, y: .12, z: 500 }, this.materials.deepWater, {}, false);
    this.ocean.render.castShadows = false;
    this.mountainWaters.push({ entity: this.ocean, base: { x: 500, y: .12, z: 500 }, rate: .18 });
    this.addTerrainMass('Irregular coastal shelf', {
      bottom: -1.75, top: -.5, bottomRadius: 207, topRadius: 199, segments: 37,
      offsetX: 1, offsetZ: -2, seed: 19
    }, this.materials.coast);
    this.addTerrainMass('Irregular island shoreline', {
      bottom: -1.05, top: 0, bottomRadius: 191, topRadius: 179, segments: 35,
      offsetX: -1, offsetZ: 1, seed: 23
    }, this.materials.sand);
    const massMaterials = [
      this.materials.roughRock,
      this.materials.normalRock,
      this.materials.alpine,
      this.materials.alpine,
      this.materials.snow
    ];
    MOUNTAIN_MASS_PROFILES.forEach((profile, index) => {
      this.addTerrainMass(`${profile.id} irregular mountain mass`, profile, massMaterials[index]);
    });
    this.buildNaturalRockShell();
    // Every mass widens toward its base and overlaps the terrace below, preventing ring gaps and overhangs.
  }

  buildNaturalRockShell() {
    const materialCycles = [
      ['rough', 'normal', 'normal'],
      ['normal', 'rough', 'smooth'],
      ['normal', 'rough', 'smooth'],
      ['normal', 'ice', 'rough'],
      ['rough', 'ice', 'normal']
    ];
    for (const [bandIndex, profile] of MOUNTAIN_MASS_PROFILES.entries()) {
      const count = MOUNTAIN_BANDS[bandIndex].routeCount * 2;
      const rise = profile.top - profile.bottom;
      for (let index = 0; index < count; index += 1) {
        const angle = index * 360 / count + 7 + bandIndex * 5;
        const fraction = .18 + ((index * 7 + bandIndex * 3) % 6) * .125;
        const slopeRadius = profileRadiusAt(profile, angle, fraction);
        const materialType = materialCycles[bandIndex][index % materialCycles[bandIndex].length];
        const sizeY = 3.6 + (index % 4) * 1.05 + bandIndex * .28;
        this.addRockMass(`${profile.id} embedded slope rock ${index + 1}`, angle,
          slopeRadius + ((index * 11) % 5 - 2) * .75,
          profile.bottom + rise * fraction + sizeY * .12,
          {
            x: 6.2 + (index % 3) * 1.35,
            y: sizeY,
            z: 5.4 + (index % 4) * .9
          },
          this.materialForClimb(materialType), {
            pitch: -11 - (index % 3) * 4,
            roll: ((index * 13) % 19) - 9,
            yawOffset: ((index * 17) % 17) - 8,
            climbMaterial: materialType
          });
      }
    }
  }

  buildStartsAndSectors() {
    for (const [index, start] of START_LOCATIONS.entries()) {
      const floor = [this.materials.sand, this.materials.coast, this.materials.forestFloor,
        this.materials.wetRock, this.materials.deepRock, this.materials.sand][index];
      // The pad top sits eight centimeters above the island, eliminating the former coplanar flicker.
      this.addRadialBox(`${start.label} safe landing`, start.angle, 168, -.06,
        { x: 18, y: .28, z: 11 }, floor);
      this.addRadialBox(`${start.label} inward marker`, start.angle, 164.5, .3,
        { x: 1.6, y: .5, z: 1.6 }, this.materials.flowers, { tangentOffset: -5.5 });
      for (let stone = 0; stone < 4; stone += 1) {
        this.addMountainBoulder(`${start.label} boundary boulder ${stone + 1}`,
          this.point(start.angle, 190 + (stone % 2), .45 + stone * .12, (stone - 1.5) * 5.2),
          { x: 1.8 + stone * .2, y: 1.1 + (stone % 2) * .5, z: 2 },
          index % 2 ? this.materials.coast : this.materials.waterEdge);
      }
    }
    for (let index = 0; index < 22; index += 1) {
      const angle = 92 + index * 4.8;
      const radius = 151 + (index % 4) * 2.7;
      const groundY = profileHeightAtRadius(MOUNTAIN_MASS_PROFILES[0], angle, radius);
      const point = this.point(angle, radius, groundY);
      this.addMountainTree(point.x, point.z, groundY, .75 + (index % 4) * .1, `Forest pine ${index + 1}`);
    }
    for (let index = 0; index < 32; index += 1) {
      const angle = 28 + index * 3.2;
      const radius = 153 + (index % 5) * 2.4;
      const groundY = profileHeightAtRadius(MOUNTAIN_MASS_PROFILES[0], angle, radius);
      const point = this.point(angle, radius, groundY + .6);
      this.addMountainBoulder(`Rocky coast stone ${index + 1}`, point,
        { x: 1.2 + (index % 3) * .5, y: .9 + (index % 2) * .5, z: 1.4 + (index % 4) * .3 },
        index % 3 ? this.materials.coast : this.materials.rockLight);
    }
  }

  buildLateralLinks() {
    const traverses = [
      { profile: MOUNTAIN_MASS_PROFILES[0], y: 12, count: 12, material: this.materials.roughRock },
      { profile: MOUNTAIN_MASS_PROFILES[1], y: 38, count: 10, material: this.materials.normalRock },
      { profile: MOUNTAIN_MASS_PROFILES[2], y: 70, count: 8, material: this.materials.alpine },
      { profile: MOUNTAIN_MASS_PROFILES[3], y: 104, count: 6, material: this.materials.snow }
    ];
    for (const traverse of traverses) {
      const fraction = (traverse.y - traverse.profile.bottom)
        / (traverse.profile.top - traverse.profile.bottom);
      for (let index = 0; index < traverse.count; index += 1) {
        const angle = index * 360 / traverse.count + 15;
        const radius = profileRadiusAt(traverse.profile, angle, fraction) + 1.1;
        this.addRadialBox(`lateral network ${traverse.y}-${index + 1}`, angle, radius, traverse.y + (index % 2) * 1.1,
          { x: 9 + (index % 3) * 2, y: .34, z: 2.3 }, traverse.material,
          { roll: index % 2 ? 7 : -6, tangentOffset: (index % 3 - 1) * 2 });
      }
    }
    // Short smooth wedges communicate a blocked direct line without becoming giant wall columns.
    for (const [index, angle] of [99, 221, 343].entries()) {
      const profile = MOUNTAIN_MASS_PROFILES[1];
      const fraction = (37 - profile.bottom) / (profile.top - profile.bottom);
      const radius = profileRadiusAt(profile, angle, fraction) + .9;
      this.addRadialBox(`ungrippable slab ${index + 1}`, angle, radius, 37,
        { x: 9.5, y: 14, z: 3.1 }, this.materials.unclimbable, { tilt: index % 2 ? -16 : -21, roll: index % 2 ? 5 : -4 });
    }
  }

  buildRockFields() {
    for (const [bandIndex, band] of MOUNTAIN_BANDS.entries()) {
      for (let index = 0; index < band.routeCount; index += 1) {
        const angle = (index + .47) * 360 / band.routeCount + bandIndex * 4;
        const primaryHeight = 1.55 + (index % 3) * .55 + bandIndex * .08;
        const primary = this.point(angle, band.radius - 7.5 - (index % 2) * 2.1,
          band.top + primaryHeight * .39, (index % 3 - 1) * 1.2);
        this.addMountainBoulder(`${band.id} terrace field rock ${index + 1}a`, primary, {
          x: 2.8 + (index % 4) * .48,
          y: primaryHeight,
          z: 2.2 + ((index + 2) % 3) * .6
        }, index % 3 ? this.materials.rockLight : this.materials.deepRock);

        const companionHeight = .7 + (index % 2) * .28;
        const companion = this.point(angle + 1.8, band.radius - 9.2,
          band.top + companionHeight * .37, index % 2 ? 2.7 : -2.4);
        this.addMountainBoulder(`${band.id} terrace field rock ${index + 1}b`, companion, {
          x: 1.15 + (index % 3) * .22,
          y: companionHeight,
          z: 1.05 + ((index + 1) % 3) * .2
        }, bandIndex >= 3 ? this.materials.alpine : this.materials.coast, { solid: false });
      }
    }
  }

  buildLandmarks() {
    const splitA = this.point(42, 117, 56, -5);
    const splitB = this.point(42, 117, 56.5, 5);
    this.addMountainBoulder('Split Rock west tooth', splitA, { x: 6, y: 8, z: 4.5 }, this.materials.deepRock);
    this.addMountainBoulder('Split Rock east tooth', splitB, { x: 5.2, y: 9, z: 4.8 }, this.materials.rockLight);
    const tilted = this.point(258, 132, 31.1, -2);
    this.addMountainBoulder('Great tilted formation', tilted,
      { x: 9.5, y: 5.2, z: 6.4 }, this.materials.roughRock);
    const ravineWest = this.point(312, 101, 64, -5.2);
    const ravineEast = this.point(312, 101, 64.2, 5.1);
    this.addMountainBoulder('Narrow ravine west wall', ravineWest,
      { x: 5.2, y: 6.2, z: 7.8 }, this.materials.normalRock);
    this.addMountainBoulder('Narrow ravine east wall', ravineEast,
      { x: 5.8, y: 5.5, z: 7.1 }, this.materials.roughRock);
    this.addRadialBox('Exposed windy shelf', 148, 69, 98.8,
      { x: 13.5, y: .62, z: 4.2 }, this.materials.alpine,
      { tangentOffset: -2.4, roll: -7 });
    const tree = this.point(128, 130, 32.5);
    this.addMountainTree(tree.x, tree.z, 32.5, 3, 'Great leaning pine');
    this.addWaterfallCascade('Lower waterfall', 180, MOUNTAIN_MASS_PROFILES[0], 8);
    this.addWaterfallCascade('Middle waterfall', 180, MOUNTAIN_MASS_PROFILES[1], 7);
    this.addWaterfallCascade('Upper waterfall', 180, MOUNTAIN_MASS_PROFILES[2], 5.2);
    this.addRadialBox('Echo cave mouth', 205, 82, 68, { x: 10, y: 13, z: .18 }, this.materials.cave, { solid: false, primitive: true });
    this.addRadialBox('Echo cave brow', 205, 83.2, 75, { x: 12, y: 2.4, z: 4.8 }, this.materials.deepRock);
    for (let index = 0; index < 10; index += 1) {
      const point = this.point(290 + index * 6, 39 + (index % 2) * 3, 121 + (index % 3) * .5);
      this.createPrimitive(`Snow ridge shard ${index + 1}`, 'cone', point,
        { x: 1.8 + (index % 2) * .8, y: 3 + (index % 3), z: 2 },
        index % 3 ? this.materials.snow : this.materials.ice,
        { x: 0, y: index * 29, z: index % 2 ? 9 : -7 });
    }
    for (let index = 0; index < 9; index += 1) {
      const height = 1.1 + (index % 3) * .55;
      const point = this.point(215 + index * 5.5, 41 + (index % 2) * 4,
        120 + height * .38, (index % 3 - 1) * 1.6);
      this.addMountainBoulder(`Alpine ice field block ${index + 1}`, point, {
        x: 1.8 + (index % 4) * .42,
        y: height,
        z: 1.6 + ((index + 1) % 3) * .48
      }, index % 2 ? this.materials.ice : this.materials.snow,
      { solid: index % 3 !== 0 });
    }
    this.createPrimitive('Crooked summit peak', 'cone',
      { x: MOUNTAIN_CENTER.x + 2, y: 150, z: MOUNTAIN_CENTER.z + 1.5 },
      { x: 5.5, y: 16, z: 5.5 }, this.materials.rockLight, { x: 0, y: -18, z: 12 });
  }

  addWaterfallCascade(name, angle, profile, width) {
    const segmentCount = 6;
    const rise = profile.top - profile.bottom;
    for (let index = 0; index < segmentCount; index += 1) {
      const fraction = (index + .5) / segmentCount;
      const y = profile.bottom + rise * fraction;
      const radius = profileRadiusAt(profile, angle, fraction) + 1.15;
      this.addRadialBox(`${name} cascade ${index + 1}`, angle, radius, y,
        { x: width * (1 - index * .035), y: rise / segmentCount * 1.08, z: .18 },
        this.materials.waterfall, { solid: false, primitive: true });
    }
  }

  buildFishingLocations() {
    MOUNTAIN_FISHING_LOCATIONS.forEach((location, index) => this.addFishingLocation(location, index));
  }

  addFishingLocation(location, index) {
    const center = this.point(location.angle, location.radius, location.y);
    this.fishingZones.push(new FishingZone({
      id: location.id, label: location.label,
      center: { x: center.x, z: center.z },
      radii: { x: location.radii[0], z: location.radii[1] },
      surfaceY: location.y, fishIds: location.fish,
      depth: location.depth,
      modifiers: {
        biteRate: .9 + index * .025,
        size: location.size,
        rarityBias: location.rarityBias,
        trophyChance: location.trophyChance
      }
    }));
    const water = this.addCylinder(`${location.label} water`, center,
      { x: location.radii[0] * 2, y: .05, z: location.radii[1] * 2 },
      location.depth === 'deep' ? this.materials.deepWater : this.materials.shallowWater, {}, false);
    water.render.castShadows = false;
    this.mountainWaters.push({ entity: water, base: { x: location.radii[0] * 2, y: .05, z: location.radii[1] * 2 }, rate: .32 + index * .035 });
    if (index === MOUNTAIN_FISHING_LOCATIONS.length - 1) return;
    for (let stone = 0; stone < 5; stone += 1) {
      this.addMountainBoulder(`${location.label} shore stone ${stone + 1}`,
        this.point(location.angle + (stone - 2) * 4.5, location.radius + location.radii[1] + .5, location.y + .35),
        { x: 1 + (stone % 2) * .4, y: .6 + (stone % 3) * .18, z: 1.15 },
        index >= 6 ? this.materials.alpine : this.materials.waterEdge);
    }
  }

  addMountainTree(x, z, baseY, size, name) {
    this.addCylinder(`${name} trunk`, { x, y: baseY + 1.25 * size, z },
      { x: .68 * size, y: 2.5 * size, z: .68 * size }, this.materials.wood);
    this.createPrimitive(`${name} crown`, 'cone', { x, y: baseY + 4.1 * size, z },
      { x: 2.7 * size, y: 4.3 * size, z: 2.7 * size }, this.materials.foliage,
      { x: 0, y: (x * 19 + z * 7) % 180, z: 0 });
  }

  chooseStart(previousId = null, rng = Math.random) {
    const choices = previousId ? START_LOCATIONS.filter((start) => start.id !== previousId) : START_LOCATIONS;
    return choices[Math.floor(rng() * choices.length)];
  }

  setDeveloperCourseVisible(visible) {
    this.courseRoot.enabled = visible;
  }

  getSector(point) {
    let angle = Math.atan2(point.z - MOUNTAIN_CENTER.z, point.x - MOUNTAIN_CENTER.x) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return SECTORS[Math.floor((angle + 30) / 60) % 6];
  }

  getElevationBand(y) {
    if (y < 22.5) return 'Outer / Lower';
    if (y < 52.5) return 'Middle';
    if (y < 87.5) return 'Upper / Alpine';
    return y < 120.5 ? 'Snow / Summit approach' : 'Summit';
  }

  inferGroundMaterial(point, climbMaterial = null) {
    if (climbMaterial) return climbMaterial;
    if (point.y >= 87) return 'snow / ice';
    if (point.y >= 52) return 'alpine rock';
    const sector = this.getSector(point);
    if (sector === 'Sandy Beach' || sector === 'Sheltered Cove') return 'sand / rough rock';
    if (sector === 'Waterfall Basin') return 'wet / smooth rock';
    if (sector === 'Forest Inlet') return 'forest floor / rough rock';
    return 'normal rock';
  }

  getWorldInfo(point, climbMaterial = null) {
    const elevation = Math.max(0, point.y - PLAYER_FOOT_OFFSET);
    const course = this.isInDeveloperCourse(point);
    return {
      sector: course ? 'Developer Course' : this.getSector(point),
      elevation,
      band: course ? 'Mechanics test' : this.getElevationBand(elevation),
      material: this.inferGroundMaterial(point, climbMaterial)
    };
  }

  isInDeveloperCourse(point) {
    return Math.abs(point.x) < 34 && Math.abs(point.z) < 34;
  }

  isFatalPosition(point) {
    return point.y < -14;
  }

  isAtSummit(point) {
    return point.y >= 141.5
      && Math.hypot(point.x - MOUNTAIN_CENTER.x, point.z - MOUNTAIN_CENTER.z) <= this.summitRadius;
  }

  getDebugTarget(code) {
    if (/^Digit[1-6]$/.test(code)) return START_LOCATIONS[Number(code.at(-1)) - 1];
    const targets = {
      Digit7: { label: 'Lower route network', position: this.point(58, 165, 1.35), facingYaw: inwardYaw(58) },
      Digit8: { label: 'Middle route network', position: this.point(84, 139, 23.3), facingYaw: inwardYaw(84) },
      Digit9: { label: 'Upper route network', position: this.point(108, 105, 53.3), facingYaw: inwardYaw(108) },
      Digit0: { label: 'Summit route network', position: this.point(22, 44, 121.3), facingYaw: inwardYaw(22) },
      KeyT: { label: 'Mechanics course', position: { x: -14, y: 2.1, z: 12 }, facingYaw: 0 },
      KeyI: { label: 'Grip test wall', position: { x: -14, y: 2.8, z: 8.45 }, facingYaw: 0 },
      KeyY: { label: 'Recovery ledge', position: this.point(208, 78.4, 71.3), facingYaw: inwardYaw(208) },
      KeyO: { label: 'Sunwash fishing shore', position: this.point(4, 191, 1.35), facingYaw: inwardYaw(4) },
      KeyU: { label: 'Run-failure boundary', position: this.point(0, 212, .2), facingYaw: 270 }
    };
    return targets[code] ?? null;
  }

  update(dt) {
    super.update(dt);
    for (const [index, water] of this.mountainWaters.entries()) {
      const pulse = 1 + Math.sin(this.elapsed * water.rate + index) * .003;
      water.entity.setLocalScale(water.base.x * pulse, water.base.y, water.base.z * pulse);
      water.entity.rotateLocal(0, dt * (index % 2 ? -.18 : .22), 0);
    }
  }
}
