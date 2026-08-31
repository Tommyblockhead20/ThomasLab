import * as pc from 'playcanvas';
import { PLAYER_FOOT_OFFSET } from '../config.js';
import { attachZoneEcology, ECOLOGY_TARGETS } from '../fishing/fish-ecology.js';
import { FishingZone } from '../fishing/fishing-zone.js';
import { createSpecimenModel, destroySpecimenModel } from '../fishing/specimen-model.js';
import { getClimbMaterial } from '../player/climbing-materials.js';
import { TestWorld } from './world.js';
import {
  MAIN_WORLD_LOCATION,
  SMALL_ISLAND_LOCATIONS,
  WORLD_LOCATIONS,
  WORLD_MAP_RADIUS
} from './world-locations.js';
import {
  auditRockDensity,
  basinTerrainHeight,
  oceanFloorProfile,
  summitBasinHeight,
  supportAdjustment
} from './world-validation.js';

// Mountain V2 is deliberately independent from the Milestone 5.x radial-band layout.
// The old mountain.js remains in the project as the compatibility/reference implementation.
export const MOUNTAIN_CENTER = Object.freeze({
  x: MAIN_WORLD_LOCATION.worldPosition.x,
  z: MAIN_WORLD_LOCATION.worldPosition.z
});
export const SUMMIT_HEIGHT = 304.8; // exactly 1,000 ft
export const COASTAL_SHELF_RADIUS = 214;
export const OCEAN_FLOOR_OUTER_RADIUS = 350;
export const OCEAN_SEABED_JOIN_RADIUS = 208;
export const OCEAN_WATER_INNER_RADIUS = 221;
export const OCEAN_SHALLOW_WALK_END_RADIUS = 239;
export const OCEAN_SURFACE_Y = -.76;
// Track the registry's global map extent so later far-away load groups still sit over
// visible ocean without changing Mountain traversal/failure distances.
export const OCEAN_VISUAL_OUTER_RADIUS = Math.max(380, WORLD_MAP_RADIUS + 24);
export const OCEAN_WADE_DISTANCE = OCEAN_FLOOR_OUTER_RADIUS - OCEAN_WATER_INNER_RADIUS;
// Compatibility name retained for older diagnostics. It marks generated floor extent only;
// crossing this radius is not fatal and there is no invisible deep-water boundary.
export const MOUNTAIN_FAILURE_RADIUS = OCEAN_FLOOR_OUTER_RADIUS;
export const OUT_OF_WORLD_FALL_Y = -18;
export const INTENTIONAL_OVERHANGS = Object.freeze([]);

const TERRAIN_OUTER_RADIUS = 208;
export const MOUNTAIN_FOOT_RADIUS = 181;
const CROWN_BASE_RADIUS = 41;
const CROWN_TOP_RADIUS = 8;
const CROWN_BASE_HEIGHT = 215;
export const UPPER_SHOULDER_START_RADIUS = 72;
const UPPER_SHOULDER_LIFT = 75;
const TERRAIN_SEGMENTS = 360;
export const FALLGLASS_WATERFALL_RADII = Object.freeze([
  96, 98, 100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120, 122, 124, 126, 128,
  130, 132, 134, 136, 138, 140, 142, 144, 146, 148, 150, 152, 154, 156, 158, 160,
  162, 164, 166, 168, 170, 172, 174, 176, 178, 180, 182, 184, 186, 188, 190, 192,
  194, 196, 198, 200, 202, 204, 206, 208, 210, 212, 214, 216, 218, 220, 222
]);
const fallglassPhaseAt = (radius) => (radius - FALLGLASS_WATERFALL_RADII[0]) / 4;
const fallglassAngleAt = (radius) => 183 + Math.sin(fallglassPhaseAt(radius) * .82) * .28;
const fallglassTangentAt = (radius) => Math.sin(fallglassPhaseAt(radius) * 1.37) * .22;
export const SUMMIT_ROUTE_CONNECTOR = Object.freeze({
  lipRadius: CROWN_TOP_RADIUS + .34,
  thresholdRadius: CROWN_TOP_RADIUS - .28,
  maximumVerticalGap: .82
});
export const CROWN_DENSITY_CONFIG = Object.freeze({
  routeStages: 30,
  branchStages: Object.freeze([4, 8, 13, 18, 23, 27]),
  beltCounts: Object.freeze([58, 54, 48, 44, 38, 32])
});
export const MOUNTAIN_REST_LEDGE_CONFIG = Object.freeze({
  fiveHundred: Object.freeze({ targetHeight: 152.4, angle: 79, radius: 58.55, anchorIndex: 6, width: 10.6, depth: 7.2, coreTerrain: true, mantleApron: 1.7 }),
  fiveFifty: Object.freeze({ targetHeight: 167.64, angle: 145, radius: 58.2, width: 12.2, depth: 8.4, coreTerrain: true, mantleApron: 1.9 }),
  sixHundred: Object.freeze({ targetHeight: 182.88, angle: 222, radius: 50, width: 8.4, depth: 5.8, coreTerrain: true }),
  sevenHundred: Object.freeze({ targetHeight: 213.36 })
});
export const MID_MOUNTAIN_SPIRAL_CONFIG = Object.freeze({
  minimumHeight: 91.44,   // 300 ft
  maximumHeight: 213.36, // 700 ft
  routeCount: 12,
  turns: 1.52,
  generalStepHeight: 2.25,
  priority450To550StepHeight: 1.55,
  priority630To660StepHeight: 1.05,
  branchEvery: 4
});
// Compatibility export retained for debug tooling that knew the older name. v9 no longer
// describes these additions as altitude belts: the authored infill is a set of continuous
// spiraling climb paths with deliberately reachable vertical step spacing.
export const MID_MOUNTAIN_ROCK_DENSITY_CONFIG = MID_MOUNTAIN_SPIRAL_CONFIG;
export const LOWLAND_TREE_CONFIG = Object.freeze({
  candidateCount: 1440,
  // Most of the 4× visual-density increase stays visual-only so the extra forest does
  // not multiply physics/climb colliders at the same rate.
  maximumClimbableTrees: 140,
  minimumRadius: 141,
  radiusSpan: 43
});
export const MOUNTAIN_BIOME_SECTORS = Object.freeze([
  Object.freeze({ id: 'sunwash', label: 'Sunwash Scrub', startAngle: 330, endAngle: 90, forestDensity: .78 }),
  Object.freeze({ id: 'blackstone', label: 'Blackstone Pinewood', startAngle: 90, endAngle: 210, forestDensity: .98 }),
  Object.freeze({ id: 'fernwood', label: 'Fernwood Forest', startAngle: 210, endAngle: 330, forestDensity: 1 })
]);
const worldLocationById = (id) => SMALL_ISLAND_LOCATIONS.find((location) => location.id === id) ?? null;
const HOME_WORLD_LOCATION = worldLocationById('home-island');
const AQUARIUM_WORLD_LOCATION = worldLocationById('aquarium-island');
const CAVE_FISHING_WORLD_LOCATION = worldLocationById('cave-fishing-island');
const NORMAL_FISHING_WORLD_LOCATION = worldLocationById('normal-fishing-island');
const FROSTHOOK_WORLD_LOCATION = worldLocationById('cold-island');

export const SUMMIT_BENCH_CONFIG = Object.freeze({
  id: 'summit-bench',
  angle: 222,
  radius: 6.55,
  seatHeight: .65,
  interactionDistance: 2.35,
  fishingFacing: 'summit-tarn'
});
export const SUMMIT_BENCH_CONFIGS = Object.freeze([
  SUMMIT_BENCH_CONFIG,
  Object.freeze({
    id: 'summit-bench-opposite',
    angle: (SUMMIT_BENCH_CONFIG.angle + 180) % 360,
    radius: 6.55,
    seatHeight: .65,
    interactionDistance: 2.35,
    fishingFacing: 'summit-tarn'
  })
]);
export const PUBLIC_AQUARIUM_CONFIG = Object.freeze({
  angle: AQUARIUM_WORLD_LOCATION?.angle ?? 103,
  radius: AQUARIUM_WORLD_LOCATION?.radius ?? 278,
  floorY: (AQUARIUM_WORLD_LOCATION?.elevation ?? .7) + .28,
  width: 10.8,
  depth: 6.4,
  tankHeight: 4.2,
  interactionDistance: 2.35,
  visibleResidentLimit: 48,
  separateFromCabin: true
});
export const CAVE_TOPOLOGY_CONFIG = Object.freeze({
  tunnelSegments: 10,
  minimumDepth: 20,
  entranceCutDepth: 5.2,
  enclosed: true,
  exteriorTrench: false
});
export const HOME_CABIN_CONFIG = Object.freeze({
  angle: HOME_WORLD_LOCATION?.angle ?? 318,
  radius: HOME_WORLD_LOCATION?.radius ?? 272,
  floorY: (HOME_WORLD_LOCATION?.elevation ?? .72) + .26,
  width: 8.4,
  depth: 6.8,
  wallHeight: 3.45,
  interactionDistance: 2.15
});
export const FRACTURED_ROCK_FORM_KINDS = Object.freeze([
  'chunk', 'chunk', 'spire', 'spire', 'blade', 'lean', 'wedge', 'column',
  'needle', 'shelfblade', 'crooked', 'shard', 'hook', 'knuckle', 'slab',
  'anvil', 'tooth', 'fin', 'bulb', 'terrace', 'prow', 'twist', 'crouch'
]);
// V2.8 raises the static terrain resolution so small/medium fishing basins are actually
// represented by the core mesh rather than being approximated by huge triangular facets.
// Important escarpment radii are kept explicitly alongside an approximately 3 m cadence.
const TERRAIN_RADII = Object.freeze([
  208, 205, 202, 199, 196, 193, 190, 187, 184, 181, 178, 176, 175, 172, 170, 169, 166, 164, 163, 160, 158, 157, 154, 152, 151, 149, 148, 147, 145, 143, 142, 141, 139, 136, 133, 130, 127, 124, 121, 118, 115, 112, 109, 108, 106, 104, 103, 102, 100, 97, 95, 94, 91, 90, 88, 85, 84, 82, 79, 78, 76, 73, 70, 68, 67, 66, 64, 61, 60, 59, 58, 57, 56, 55, 54, 52, 51, 50, 49, 48, 47, 46, 44, 43, 41, 40, 38
]);

// Compatibility exports retained for tooling/tests that inspect the mountain module.
// They describe V2's broad regions/masses; they are not used to construct stacked rings.
export const MOUNTAIN_BANDS = Object.freeze([
  Object.freeze({ id: 'coast', radius: 181, bottom: -.55, top: 22, routeCount: 50 }),
  Object.freeze({ id: 'lower', radius: 145, bottom: 22, top: 58, routeCount: 50 }),
  Object.freeze({ id: 'middle', radius: 104, bottom: 58, top: 101, routeCount: 42 }),
  Object.freeze({ id: 'alpine', radius: 68, bottom: 101, top: CROWN_BASE_HEIGHT, routeCount: 34 }),
  Object.freeze({ id: 'summit', radius: CROWN_TOP_RADIUS, bottom: CROWN_BASE_HEIGHT, top: SUMMIT_HEIGHT, routeCount: 26 })
]);

export const MOUNTAIN_MASS_PROFILES = Object.freeze([
  Object.freeze({
    id: 'continuous-body', bottom: -.55, top: CROWN_BASE_HEIGHT,
    bottomRadius: TERRAIN_OUTER_RADIUS, topRadius: CROWN_BASE_RADIUS,
    segments: TERRAIN_SEGMENTS, offsetX: 0, offsetZ: 0, seed: 20
  }),
  Object.freeze({
    id: 'summit-crown', bottom: CROWN_BASE_HEIGHT, top: SUMMIT_HEIGHT,
    bottomRadius: CROWN_BASE_RADIUS, topRadius: CROWN_TOP_RADIUS,
    segments: 18, offsetX: 0, offsetZ: 0, seed: 21
  })
]);

export const TERRAIN_ANGLE_PROFILE = Object.freeze({
  walkable: Object.freeze([0, 30]),
  scramble: Object.freeze([30, 40]),
  gripEncouraged: Object.freeze([40, 55]),
  climbing: Object.freeze([55, 90]),
  overhangCount: 0
});

const SECTORS = Object.freeze([
  'Sandy Beach', 'Rocky Coast', 'Forest Inlet',
  'Waterfall Basin', 'Boulder Coast', 'Sheltered Cove'
]);

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (edge0, edge1, value) => {
  const t = clamp((value - edge0) / Math.max(.0001, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const degreesToRadians = (degrees) => degrees * Math.PI / 180;
const inwardYaw = (angle) => 90 - angle;

function stableNameHash(value) {
  return [...value].reduce((hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0, 2166136261);
}


function stableUnit(value) {
  return (stableNameHash(value) % 10000) / 9999;
}

// Difficulty intentionally rises with elevation but also waves around the circumference,
// creating easier and harder faces without reintroducing named mandatory routes.
function climbDifficultyAt(angle, level) {
  const verticalBase = [0.14, 0.34, 0.58, 0.79][level] ?? 0.5;
  const broadVariation = Math.sin(degreesToRadians(angle * 2.65 + level * 61 + 17)) * 0.11;
  const fineVariation = Math.sin(degreesToRadians(angle * 5.4 - level * 37 + 83)) * 0.07;
  const hardPocket = Math.max(
    1 - smoothstep(0, 34, angularDistance(angle, 112)),
    1 - smoothstep(0, 31, angularDistance(angle, 188)),
    1 - smoothstep(0, 36, angularDistance(angle, 302))
  ) * 0.12;
  return clamp(verticalBase + broadVariation + fineVariation + hardPocket, 0.03, 0.98);
}

function chooseClimbMaterial(level, angle, stage, salt = 0, extraDifficulty = 0) {
  const difficulty = clamp(climbDifficultyAt(angle, level) + extraDifficulty, 0, 1);
  const rough = clamp(0.64 - difficulty * 0.59, 0.06, 0.64);
  const normal = clamp(0.30 - difficulty * 0.04, 0.22, 0.31);
  const smooth = 0.06 + difficulty * 0.39;
  const ice = level >= 2 ? clamp((difficulty - 0.5) * 0.5, 0, 0.25) : 0;
  const total = rough + normal + smooth + ice;
  let roll = stableUnit(`${level}:${Math.round(angle * 10)}:${stage}:${salt}`) * total;
  if ((roll -= rough) <= 0) return 'rough';
  if ((roll -= normal) <= 0) return 'normal';
  if ((roll -= smooth) <= 0) return 'smooth';
  return 'ice';
}

function radialPoint(angle, radius, y, tangentOffset = 0) {
  const radians = degreesToRadians(angle);
  const radialX = Math.cos(radians);
  const radialZ = Math.sin(radians);
  return {
    x: MOUNTAIN_CENTER.x + radialX * radius - radialZ * tangentOffset,
    y,
    z: MOUNTAIN_CENTER.z + radialZ * radius + radialX * tangentOffset
  };
}

function localPolarPoint(angle, radius) {
  const radians = degreesToRadians(angle);
  return { x: Math.cos(radians) * radius, z: Math.sin(radians) * radius };
}

function angularDistance(a, b) {
  return Math.abs(((a - b + 540) % 360) - 180);
}

// The world-location registry owns each satellite island's normalized shoreline outline.
// Rendering and all map UIs consume the same data so a separately loaded island never grows
// a second, contradictory "map shape" inside this module.
function outlineRadiusAt(location, angle) {
  const outline = location?.outline;
  if (!outline?.length) return 1;
  const wrapped = ((angle % 360) + 360) % 360;
  const rawIndex = wrapped / 360 * outline.length;
  const indexA = Math.floor(rawIndex) % outline.length;
  const indexB = (indexA + 1) % outline.length;
  const t = rawIndex - Math.floor(rawIndex);
  const radiusA = Math.hypot(outline[indexA].x, outline[indexA].z);
  const radiusB = Math.hypot(outline[indexB].x, outline[indexB].z);
  return lerp(radiusA, radiusB, t);
}

export function islandFootprintScale(locationId, angle) {
  const location = SMALL_ISLAND_LOCATIONS.find((entry) => entry.id === locationId);
  return outlineRadiusAt(location, angle);
}

export function createIslandOutline(location, samples = location?.outline?.length ?? 28) {
  if (!location?.worldPosition || !location?.radii) return [];
  if (location.outline?.length) {
    return location.outline.map((point) => ({
      x: location.worldPosition.x + point.x * location.radii.x,
      z: location.worldPosition.z + point.z * location.radii.z
    }));
  }
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const angle = index * 360 / samples;
    const radians = degreesToRadians(angle);
    points.push({
      x: location.worldPosition.x + Math.cos(radians) * location.radii.x,
      z: location.worldPosition.z + Math.sin(radians) * location.radii.z
    });
  }
  return points;
}

// These broad fields shape one continuous mountain rather than creating altitude rings.
// The values are intentionally low-frequency so the silhouette reads as ridges/valleys,
// while authored route rocks provide the local traversal detail.
const TERRAIN_FIELDS = Object.freeze([
  Object.freeze({ angle: 24, amplitude: 4.2, width: 33, start: .18, end: .94 }),
  Object.freeze({ angle: 108, amplitude: -3.7, width: 30, start: .2, end: .82 }),
  Object.freeze({ angle: 183, amplitude: -4.6, width: 31, start: .16, end: .86 }),
  Object.freeze({ angle: 268, amplitude: 3.8, width: 37, start: .2, end: .9 }),
  Object.freeze({ angle: 326, amplitude: 2.2, width: 28, start: .35, end: .8 })
]);

// Three steep, visibly irregular cliff systems still provide the mountain's vertical
// structure, but V2.5 no longer funnels the player through privileged corridors and varies climb-line density by elevation.
// The continuous terrain itself remains non-grippable; a dense circumferential web of
// small climbable formations is layered over each escarpment so a climb can be attempted
// from essentially any direction while local material/gap difficulty varies by sector.
export const ESCARPMENTS = Object.freeze([
  Object.freeze({ id: 'lower-wall', baseRadius: 145, width: 6.2, rise: 14.5, waveA: 5.4, waveB: 2.2, phase: 19 }),
  Object.freeze({ id: 'middle-wall', baseRadius: 104, width: 5.7, rise: 16.5, waveA: 4.6, waveB: 2.6, phase: 73 }),
  Object.freeze({ id: 'alpine-wall', baseRadius: 68, width: 5.2, rise: 18.2, waveA: 4.1, waveB: 2.1, phase: 137 })
]);

function escarpmentRadiusAt(escarpment, angle) {
  const radians = degreesToRadians(angle);
  return escarpment.baseRadius
    + Math.sin(radians * 2 + degreesToRadians(escarpment.phase)) * escarpment.waveA
    + Math.sin(radians * 5 - degreesToRadians(escarpment.phase * .47)) * escarpment.waveB;
}

function escarpmentStepAt(escarpment, angle, radius) {
  const center = escarpmentRadiusAt(escarpment, angle);
  const outer = center + escarpment.width * .5;
  const inner = center - escarpment.width * .5;
  return (1 - smoothstep(inner, outer, radius)) * escarpment.rise;
}

function rawTerrainHeightAt(angle, radius) {
  if (radius >= MOUNTAIN_FOOT_RADIUS) {
    const shore = clamp((TERRAIN_OUTER_RADIUS - radius) / (TERRAIN_OUTER_RADIUS - MOUNTAIN_FOOT_RADIUS), 0, 1);
    return -.55 + shore * .72 + Math.sin(degreesToRadians(angle * 3 + 17)) * .08 * shore;
  }

  const progress = clamp((MOUNTAIN_FOOT_RADIUS - radius) / (MOUNTAIN_FOOT_RADIUS - CROWN_BASE_RADIUS), 0, 1);
  // V2.1 is substantially steeper than V2.0. A ~32° underlying body is interrupted by
  // three 55–75° escarpments. Off-route terrain cannot be gripped, so these cliffs gate
  // progress without invisible collision walls.
  let height = .1 + 90.4 * Math.pow(progress, 1.04);
  for (const escarpment of ESCARPMENTS) height += escarpmentStepAt(escarpment, angle, radius);

  for (const field of TERRAIN_FIELDS) {
    const angleBlend = 1 - smoothstep(0, field.width, angularDistance(angle, field.angle));
    const verticalBlend = smoothstep(field.start - .08, field.start + .08, progress)
      * (1 - smoothstep(field.end - .08, field.end + .08, progress));
    height += field.amplitude * angleBlend * verticalBlend;
  }

  // V2.12 extends the inner alpine shoulder slightly onto the middle plateau. At radius
  // 72 this contributes nothing; by the crown base it adds ~75 m and reaches the same
  // crown-base height, widening the gray core without turning the middle into a cylinder.
  const upperShoulderProgress = clamp(
    (UPPER_SHOULDER_START_RADIUS - radius) / (UPPER_SHOULDER_START_RADIUS - CROWN_BASE_RADIUS),
    0, 1
  );
  height += UPPER_SHOULDER_LIFT * Math.pow(upperShoulderProgress, 1.06);

  const broadFacet = Math.sin(degreesToRadians(angle * 2.35 + radius * .34)) * 1.0 * progress;
  const chippedFacet = Math.sin(degreesToRadians(angle * 5.1 - radius * .72 + 31)) * .38 * (0.25 + progress * .75);
  return height + broadFacet + chippedFacet;
}

// These are genuine terraces in the continuous terrain mesh, not props. A nearly flat
// center gives reliable standing/support contact while smooth radial and angular shoulders
// merge each shelf back into the mountain. The sector is broad enough to approach from
// nearby climb lines without creating a circumferential shortcut.
export function applyCoreRestTerraces(angle, radius, sourceHeight) {
  let height = sourceHeight;
  for (const ledge of [
    MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred,
    MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty,
    MOUNTAIN_REST_LEDGE_CONFIG.sixHundred
  ]) {
    const flatHalfAngle = ledge.width * .5 / ledge.radius * 180 / Math.PI;
    const angleBlend = 1 - smoothstep(flatHalfAngle, flatHalfAngle + 5.5, angularDistance(angle, ledge.angle));
    const radialDistance = Math.abs(radius - ledge.radius);
    const radialBlend = 1 - smoothstep(ledge.depth * .34, ledge.depth * .64, radialDistance);
    const target = ledge.targetHeight
      + (ledge.radius - radius) * .025
      + Math.sin(degreesToRadians(angle - ledge.angle)) * .08;
    height = lerp(height, target, angleBlend * radialBlend);
  }
  return height;
}

export function oceanFloorHeightAt(radius, shorelineY = -.32) {
  return oceanFloorProfile(radius, {
    joinRadius: OCEAN_SEABED_JOIN_RADIUS,
    waterRadius: OCEAN_WATER_INNER_RADIUS,
    shallowEndRadius: OCEAN_SHALLOW_WALK_END_RADIUS,
    outerRadius: OCEAN_FLOOR_OUTER_RADIUS,
    shorelineY,
    surfaceY: OCEAN_SURFACE_Y
  });
}

const FISHING_LAYOUT = Object.freeze([
  // LOWER MOUNTAIN — 10 waters
  Object.freeze({ id: 'sunwash-tidepool', label: 'Sunwash Tidepool', tier: 'lower', waterType: 'tidepool', theme: 'sunwash', angle: 348, radius: 190, radii: [6, 4.8], depth: 'shallow', basinDepth: .35, fish: ['sardine', 'anchovy', 'tidepool-sculpin', 'striped-mullet'], size: .94, rarityBias: 0.08, trophyChance: .9 }),
  Object.freeze({ id: 'blackstone-inlet', label: 'Blackstone Inlet', tier: 'lower', waterType: 'inlet', theme: 'blackstone', angle: 62, radius: 188, radii: [7, 5.3], depth: 'deep', basinDepth: .45, fish: ['mackerel', 'rockfish', 'sea-bass', 'flounder'], size: 1, rarityBias: 0.1, trophyChance: 1 }),
  Object.freeze({ id: 'fernwater-pond', label: 'Fernwater Pond', tier: 'lower', waterType: 'pond', theme: 'fernwood', angle: 104, radius: 164, radii: [7.3, 5.8], depth: 'shallow', basinDepth: 2.2, fish: ['bluegill', 'pumpkinseed', 'golden-shiner', 'largemouth-bass', 'common-carp'], size: 1, rarityBias: 0.09, trophyChance: 1 }),
  Object.freeze({ id: 'amber-reed-pond', label: 'Reedwater Pond', tier: 'lower', waterType: 'pond', theme: 'fernwood', offshore: 'normal-fishing-island', angle: NORMAL_FISHING_WORLD_LOCATION?.angle ?? 344, radius: NORMAL_FISHING_WORLD_LOCATION?.radius ?? 300, waterY: .88, radii: [6.2, 4.8], depth: 'shallow', basinDepth: .8, fish: ['bluegill', 'pumpkinseed', 'golden-shiner', 'black-crappie'], size: 1, rarityBias: 0.12, trophyChance: 1.01 }),
  Object.freeze({ id: 'basalt-grotto', label: 'Basalt Grotto', tier: 'lower', waterType: 'cave-pool', theme: 'fallglass', offshore: 'cave-fishing-island', cave: true, entranceDepth: 11.5, angle: CAVE_FISHING_WORLD_LOCATION?.angle ?? 164, radius: CAVE_FISHING_WORLD_LOCATION?.radius ?? 300, waterY: .22, radii: [4.8, 3.9], depth: 'shallow', basinDepth: 1.15, fish: ['stone-loach', 'cave-tetra', 'blind-cave-eel', 'burbot'], size: 1.01, rarityBias: 0.16, trophyChance: 1.04 }),
  Object.freeze({ id: 'boulder-lagoon', label: 'Boulder Coast Lagoon', tier: 'lower', waterType: 'lagoon', theme: 'blackstone', angle: 226, radius: 177, radii: [7.2, 5.3], depth: 'deep', basinDepth: .7, fish: ['rockfish', 'flounder', 'striped-mullet', 'sea-bass'], size: 1.01, rarityBias: 0.1, trophyChance: 1.02 }),
  Object.freeze({ id: 'gull-crag-pond', label: 'Gull Crag Pond', tier: 'lower', waterType: 'pond', theme: 'blackstone', angle: 263, radius: 160, radii: [6.5, 5.1], depth: 'shallow', basinDepth: 2.5, fish: ['yellow-perch', 'black-crappie', 'freshwater-drum', 'channel-catfish'], size: 1.03, rarityBias: 0.14, trophyChance: 1.05 }),
  Object.freeze({ id: 'sheltered-mirror', label: 'Sheltered Mirror', tier: 'lower', waterType: 'pond', theme: 'sunwash', angle: 306, radius: 168, radii: [6.4, 5], depth: 'shallow', basinDepth: 2.0, fish: ['bluegill', 'golden-shiner', 'common-carp', 'largemouth-bass'], size: 1, rarityBias: 0.11, trophyChance: 1.01 }),
  Object.freeze({ id: 'redbank-pool', label: 'Redbank Pool', tier: 'lower', waterType: 'pool', theme: 'sunwash', angle: 18, radius: 158, radii: [5.8, 4.4], depth: 'shallow', basinDepth: 2.15, fish: ['longnose-dace', 'white-sucker', 'smallmouth-bass', 'rainbow-trout'], size: 1.02, rarityBias: 0.13, trophyChance: 1.04 }),
  Object.freeze({ id: 'pineglass-lake', label: 'Pineglass Lake', tier: 'lower', waterType: 'lake', theme: 'fernwood', angle: 80, radius: 151, radii: [7.8, 5.9], depth: 'deep', basinDepth: 2.7, fish: ['yellow-perch', 'black-crappie', 'largemouth-bass', 'channel-catfish'], size: 1.03, rarityBias: 0.15, trophyChance: 1.05 }),

  // MIDDLE MOUNTAIN — 7 waters
  Object.freeze({ id: 'red-river-bend', label: 'Red River Bend', tier: 'middle', waterType: 'stream-pool', theme: 'sunwash', angle: 47, radius: 126, radii: [6.6, 4.8], depth: 'shallow', basinDepth: 2.1, fish: ['longnose-dace', 'white-sucker', 'smallmouth-bass', 'rainbow-trout'], size: 1.04, rarityBias: 0.34, trophyChance: 1.08 }),
  Object.freeze({ id: 'echo-cave-pool', label: 'Echo Cave Pool', tier: 'middle', waterType: 'cave-pool', theme: 'fernwood', cave: true, entranceDepth: 21, angle: 139, radius: 112, radii: [5.7, 4.5], depth: 'shallow', basinDepth: 2.3, fish: ['stone-loach', 'cave-tetra', 'blind-cave-eel', 'burbot'], size: 1.08, rarityBias: 0.42, trophyChance: 1.16 }),
  Object.freeze({ id: 'mossbell-lake', label: 'Mossbell Lake', tier: 'middle', waterType: 'lake', theme: 'fernwood', angle: 92, radius: 119, radii: [7.1, 5.2], depth: 'deep', basinDepth: 2.65, fish: ['rainbow-trout', 'brook-trout', 'yellow-perch', 'smallmouth-bass'], size: 1.07, rarityBias: 0.38, trophyChance: 1.13 }),
  Object.freeze({ id: 'split-rock-pool', label: 'Split Rock Pool', tier: 'middle', waterType: 'pool', theme: 'sunwash', angle: 315, radius: 116, radii: [5.6, 4.2], depth: 'shallow', basinDepth: 1.9, fish: ['brook-trout', 'longnose-dace', 'white-sucker', 'smallmouth-bass'], size: 1.06, rarityBias: 0.4, trophyChance: 1.12 }),
  Object.freeze({ id: 'obsidian-cup', label: 'Obsidian Cup', tier: 'middle', waterType: 'cave-pool', theme: 'fallglass', cave: true, entranceDepth: 19, angle: 222, radius: 102, radii: [4.9, 3.8], depth: 'shallow', basinDepth: 2.25, fish: ['stone-loach', 'cave-tetra', 'blind-cave-eel', 'burbot'], size: 1.09, rarityBias: 0.46, trophyChance: 1.18 }),
  Object.freeze({ id: 'windcut-tarn', label: 'Windcut Tarn', tier: 'middle', waterType: 'tarn', theme: 'blackstone', angle: 278, radius: 121, radii: [6.1, 4.5], depth: 'shallow', basinDepth: 2.1, fish: ['brook-trout', 'cutthroat-trout', 'mountain-whitefish', 'burbot'], size: 1.08, rarityBias: 0.43, trophyChance: 1.17 }),
  Object.freeze({ id: 'twilight-basin', label: 'Twilight Basin', tier: 'middle', waterType: 'pond', theme: 'sunwash', angle: 344, radius: 112, radii: [6.3, 4.8], depth: 'shallow', basinDepth: 2.2, fish: ['rainbow-trout', 'brook-trout', 'mountain-whitefish', 'cutthroat-trout'], size: 1.09, rarityBias: 0.41, trophyChance: 1.2 }),

  // UPPER / ALPINE — 4 waters
  Object.freeze({ id: 'cloudstep-lake', label: 'Cloudstep Lake', physicalZone: 'Cloudstep Lake', tier: 'upper', waterType: 'lake', theme: 'fallglass', uniformProbabilities: true, probabilityGroup: 'cloudstep-lake', angle: 183, radius: 89, radii: [7, 5.4], depth: 'deep', basinDepth: 2.8, fish: ['rainbow-trout', 'brook-trout', 'mountain-whitefish', 'cutthroat-trout'], size: 1.11, rarityBias: 0.68, trophyChance: 1.24 }),
  Object.freeze({ id: 'hidden-ridge-pool', label: 'Hidden Ridge Pool', tier: 'upper', waterType: 'tarn', theme: 'sunwash', angle: 335, radius: 82, radii: [5.6, 4.3], depth: 'shallow', basinDepth: 2.0, fish: ['brook-trout', 'cutthroat-trout', 'mountain-whitefish', 'burbot'], size: 1.12, rarityBias: 0.72, trophyChance: 1.28 }),
  Object.freeze({ id: 'blue-ice-melt', label: 'Frosthook Melt', tier: 'upper', waterType: 'ice-pool', theme: 'blackstone', ecologyThemes: ['sunwash', 'fernwood', 'blackstone'], offshore: 'cold-island', angle: FROSTHOOK_WORLD_LOCATION?.angle ?? 230, radius: FROSTHOOK_WORLD_LOCATION?.radius ?? 286, waterY: .96, radii: [5.8, 4.6], depth: 'shallow', basinDepth: .75, fish: ['brook-trout', 'mountain-whitefish', 'cutthroat-trout', 'alpine-char'], size: 1.14, rarityBias: 0.76, trophyChance: 1.34 }),
  Object.freeze({ id: 'high-cirque-tarn', label: 'High Cirque Tarn', tier: 'upper', waterType: 'cave-tarn', theme: 'fernwood', cave: true, entranceDepth: 19, angle: 69, radius: 58, radii: [4.8, 3.8], depth: 'shallow', basinDepth: 1.8, fish: ['mountain-whitefish', 'cutthroat-trout', 'alpine-char', 'burbot'], size: 1.16, rarityBias: 0.8, trophyChance: 1.42 }),

  // SUMMIT — 1 water
  Object.freeze({ id: 'crooked-peak-tarn', label: 'Crooked Peak Tarn', tier: 'summit', waterType: 'summit-pond', theme: 'summit', ecologyThemes: ['sunwash', 'fernwood', 'blackstone'], angle: 0, radius: 0, radii: [3.7, 3.1], depth: 'shallow', basinDepth: 0, summit: true, fish: ['rainbow-trout', 'cutthroat-trout', 'alpine-char', 'channel-catfish'], size: 1.18, rarityBias: 1.0, trophyChance: 1.55, maximumSpeciesProbability: .05 }),

  // WATERFALL — 1 dedicated fishable plunge pool
  Object.freeze({ id: 'fallglass-cascade', label: 'Fallglass Cascade', physicalZone: 'Waterfall', tier: 'waterfall', waterType: 'waterfall-pool', theme: 'fallglass', waterfall: true, uniformProbabilities: true, probabilityGroup: 'fallglass-cascade', angle: 183, radius: 156, radii: [5.7, 3.8], depth: 'shallow', basinDepth: 1.9, fish: ['creek-chub', 'longnose-dace', 'rainbow-trout', 'smallmouth-bass'], size: 1.08, rarityBias: 0.58, trophyChance: 1.18 })
]);

// The visible ocean is one annular fishing zone. The hollow center is essential: treating
// it as a giant ellipse would incorrectly make every inland cast an ocean cast.
export const OCEAN_FISHING_DESCRIPTOR = Object.freeze({
  id: 'outer-ocean', label: 'Outer Ocean', physicalZone: 'Ocean', tier: 'ocean', waterType: 'ocean', theme: 'coastal',
  ecologyThemes: ['sunwash', 'fernwood', 'blackstone'], uniformProbabilities: true, probabilityGroup: 'outer-ocean',
  center: MOUNTAIN_CENTER, innerRadius: OCEAN_WATER_INNER_RADIUS, outerRadius: OCEAN_VISUAL_OUTER_RADIUS - 5,
  fish: ['sardine', 'anchovy', 'mackerel', 'rockfish', 'sea-bass', 'flounder', 'striped-mullet']
});

export const FISHING_WATER_COUNTS = Object.freeze({
  ocean: 1, lower: 10, middle: 7, upper: 4, summit: 1, waterfall: 1, total: 24
});

export function terrainHeightAt(angle, radius) {
  let height = rawTerrainHeightAt(angle, radius);
  const point = localPolarPoint(angle, radius);
  for (const basin of FISHING_LAYOUT) {
    if (basin.summit || basin.offshore) continue;
    const center = localPolarPoint(basin.angle, basin.radius);
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    // FishingZone is currently axis-aligned, so the terrain carve deliberately matches
    // that same ellipse exactly. The old circular carve was the reason flat water visibly
    // crossed the sides of its triangular divot.
    const normalizedDistance = Math.hypot(
      dx / Math.max(.1, basin.radii[0]),
      dz / Math.max(.1, basin.radii[1])
    );
    const basinCenterHeight = rawTerrainHeightAt(basin.angle, basin.radius);
    if (!basin.cave && normalizedDistance < 1.48) {
      height = basinTerrainHeight(
        height,
        basinCenterHeight,
        basin.basinDepth,
        normalizedDistance
      );
    }

  }
  return applyCoreRestTerraces(angle, radius, height);
}

function waterSurfaceY(location) {
  if (Number.isFinite(location.waterY)) return location.waterY;
  if (location.summit) return SUMMIT_HEIGHT - .12;
  if (location.cave) return rawTerrainHeightAt(location.angle, location.radius)
    - Math.max(9, location.basinDepth + 6.5);
  return rawTerrainHeightAt(location.angle, location.radius) - location.basinDepth + .45;
}

function caveDepthAt(location) {
  if (location.offshore) return location.entranceDepth ?? 9.5;
  return Math.max(CAVE_TOPOLOGY_CONFIG.minimumDepth,
    location.entranceDepth ?? location.radii[0] * 4.6);
}

function isCaveEntranceSurfacePoint(x, z, cave) {
  const center = localPolarPoint(cave.angle, cave.radius);
  const radians = degreesToRadians(cave.angle);
  const dx = x - center.x;
  const dz = z - center.z;
  const outward = dx * Math.cos(radians) + dz * Math.sin(radians);
  const lateral = Math.abs(-dx * Math.sin(radians) + dz * Math.cos(radians));
  const caveDepth = caveDepthAt(cave);
  const halfWidth = cave.radii[1] * .72 + 1.35;
  return outward > caveDepth - CAVE_TOPOLOGY_CONFIG.entranceCutDepth - .75
    && outward < caveDepth + 2.35
    && lateral < halfWidth + 1.25;
}

function triangleIntersectsCaveEntrance(a, b, c) {
  const samples = [
    a, b, c,
    [(a[0] + b[0]) * .5, 0, (a[2] + b[2]) * .5],
    [(b[0] + c[0]) * .5, 0, (b[2] + c[2]) * .5],
    [(c[0] + a[0]) * .5, 0, (c[2] + a[2]) * .5],
    [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3]
  ];
  return FISHING_LAYOUT.some((cave) => (
    cave.cave && !cave.offshore
      && samples.some((point) => isCaveEntranceSurfacePoint(point[0], point[2], cave))
  ));
}

// Three broad ecological wedges correspond to roughly 12–4, 4–8, and 8–12 o'clock.
// Keeping theme independent from elevation/waterType lets the fishing pass weight a
// shared species by climate, altitude, and habitat separately.
export function climateThemeAt(angle) {
  const clockDegrees = (90 - angle + 360) % 360;
  if (clockDegrees < 120) return 'sunwash';
  if (clockDegrees < 240) return 'fernwood';
  return 'blackstone';
}

export const MOUNTAIN_FISHING_LOCATIONS = Object.freeze(FISHING_LAYOUT.map((location) => Object.freeze({
  ...location,
  // The centered summit tarn has its own alpine ecology rather than inheriting the
  // arbitrary sunwash wedge from angle zero. Every other water keeps its prior theme.
  theme: location.summit || location.offshore || location.waterfall ? location.theme : climateThemeAt(location.angle),
  y: waterSurfaceY(location)
})));

export const ALL_FISHING_WATER_DESCRIPTORS = Object.freeze([
  ...MOUNTAIN_FISHING_LOCATIONS,
  OCEAN_FISHING_DESCRIPTOR
]);

export const MAP_ELEVATION_AREAS = Object.freeze(MOUNTAIN_BANDS.map((band) => Object.freeze({
  id: band.id,
  label: band.id === 'coast' ? 'Coast / foothills'
    : band.id === 'summit' ? 'Crown / summit' : `${band.id[0].toUpperCase()}${band.id.slice(1)} mountain`,
  minimumHeight: band.bottom,
  maximumHeight: band.top
})));

function mapContourAtHeight(height, samples = 120) {
  const points = [];
  for (let index = 0; index < samples; index += 1) {
    const angle = index * 360 / samples;
    let radius = height >= CROWN_BASE_HEIGHT ? CROWN_BASE_RADIUS : TERRAIN_OUTER_RADIUS;
    if (height < CROWN_BASE_HEIGHT) {
      let best = TERRAIN_OUTER_RADIUS;
      let bestDelta = Infinity;
      for (let sampleRadius = TERRAIN_OUTER_RADIUS; sampleRadius >= 38; sampleRadius -= .5) {
        const delta = Math.abs(terrainHeightAt(angle, sampleRadius) - height);
        if (delta < bestDelta) {
          bestDelta = delta;
          best = sampleRadius;
        }
      }
      radius = best;
    } else {
      const t = clamp((height - CROWN_BASE_HEIGHT) / (SUMMIT_HEIGHT - CROWN_BASE_HEIGHT), 0, 1);
      radius = lerp(CROWN_BASE_RADIUS, CROWN_TOP_RADIUS, t)
        * (1 + Math.sin(degreesToRadians(angle * (t > .5 ? 4 : 3) + 17)) * .035);
    }
    points.push({ angle, radius, ...radialPoint(angle, radius, height) });
  }
  return points;
}

export function createMountainMapData() {
  const contours = MAP_ELEVATION_AREAS.map((area) => ({
    ...area,
    points: mapContourAtHeight(area.minimumHeight)
  }));
  const waters = MOUNTAIN_FISHING_LOCATIONS.map((water, index) => {
    const center = radialPoint(water.angle, water.radius, water.y);
    const entranceRadius = water.cave ? water.radius + caveDepthAt(water) : null;
    const offshoreIsland = water.offshore
      ? SMALL_ISLAND_LOCATIONS.find((location) => location.id === water.offshore)
      : null;
    return {
      id: water.id, label: water.label, index: index + 2, tier: water.tier,
      waterType: water.waterType, theme: water.theme, cave: Boolean(water.cave),
      center, radii: [...water.radii],
      entrance: water.cave ? radialPoint(water.angle, entranceRadius,
        offshoreIsland ? offshoreIsland.elevation + .05 : rawTerrainHeightAt(water.angle, entranceRadius)) : null
    };
  });
  waters.unshift({
    id: OCEAN_FISHING_DESCRIPTOR.id,
    label: OCEAN_FISHING_DESCRIPTOR.label,
    index: 1,
    tier: 'ocean',
    waterType: 'ocean',
    center: { ...MOUNTAIN_CENTER },
    innerRadius: OCEAN_FISHING_DESCRIPTOR.innerRadius,
    outerRadius: OCEAN_FISHING_DESCRIPTOR.outerRadius
  });
  return {
    center: { ...MOUNTAIN_CENTER },
    outerRadius: WORLD_MAP_RADIUS,
    mountainRadius: Math.max(...contours[0].points.map((point) => point.radius)),
    contours,
    biomes: MOUNTAIN_BIOME_SECTORS.map((biome) => ({ ...biome })),
    waters,
    starts: START_LOCATIONS.map((start) => ({ id: start.id, label: start.label, position: { ...start.dockPosition } })),
    locations: WORLD_LOCATIONS.map((location) => ({
      id: location.id,
      label: location.displayName,
      type: location.type,
      // Map data is explicitly GLOBAL even if a future renderer loads this destination
      // into a convenient local frame. The registry remains the source of truth.
      coordinateSpace: 'global-world',
      globalPosition: { ...location.worldPosition },
      position: { ...location.worldPosition },
      radii: { ...location.radii },
      loadGroup: location.loadGroup ?? null,
      alwaysLoaded: location.alwaysLoaded ?? true,
      outline: location === MAIN_WORLD_LOCATION ? null : createIslandOutline(location),
      dock: location.dock ? { ...location.dock.worldPosition } : null,
      arrival: location.dock?.arrivalPosition ? { ...location.dock.arrivalPosition } : null
    })),
    docks: [
      ...START_LOCATIONS.map((start) => ({ id: `${start.id}-dock`, label: start.label, position: { ...start.dockPosition } })),
      ...SMALL_ISLAND_LOCATIONS.map((location) => ({ id: location.dock.id, label: location.displayName, position: { ...location.dock.worldPosition } }))
    ],
    caves: waters.filter((water) => water.cave).map((water) => ({ id: water.id, label: water.label, position: water.entrance })),
    ledges: [
      { id: '500ft-rest', label: '500 ft rest ledge', position: radialPoint(MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred.angle, MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred.radius, MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred.targetHeight) },
      { id: '550ft-alpine', label: '550 ft Alpine core ledge', position: radialPoint(MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty.angle, MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty.radius, MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty.targetHeight) },
      { id: '600ft-rest', label: '600 ft core shelf', position: radialPoint(MOUNTAIN_REST_LEDGE_CONFIG.sixHundred.angle, MOUNTAIN_REST_LEDGE_CONFIG.sixHundred.radius, MOUNTAIN_REST_LEDGE_CONFIG.sixHundred.targetHeight) }
    ],
    landmarks: [
      ...LANDMARKS.map((landmark) => ({ id: landmark.id, label: landmark.label, position: radialPoint(landmark.angle, landmark.radius, terrainHeightAt(landmark.angle, landmark.radius)) })),
      { id: 'cabin', label: 'Trail Cabin', position: radialPoint(HOME_CABIN_CONFIG.angle, HOME_CABIN_CONFIG.radius, HOME_CABIN_CONFIG.floorY) },
      { id: 'shop', label: 'Shop Outpost', position: { ...SMALL_ISLAND_LOCATIONS.find((location) => location.id === 'shop-island').worldPosition } },
      { id: 'aquarium', label: 'Public Aquarium', position: radialPoint(PUBLIC_AQUARIUM_CONFIG.angle, PUBLIC_AQUARIUM_CONFIG.radius, PUBLIC_AQUARIUM_CONFIG.floorY) },
      { id: 'summit-tarn', label: 'Summit Tarn + Benches', position: radialPoint(0, 0, SUMMIT_HEIGHT) }
    ],
    cascade: FALLGLASS_WATERFALL_RADII.map((radius) => {
      const angle = fallglassAngleAt(radius);
      return radialPoint(angle, radius, terrainHeightAt(angle, radius));
    })
  };
}

export const START_LOCATIONS = Object.freeze([
  ...[352, 54, 111, 181, 254, 309].map((angle, index) => {
    const arrivalRadius = 205.6;
    const dockRadius = 214.1;
    const terrainY = terrainHeightAt(angle, arrivalRadius);
    const arrivalY = Math.max(OCEAN_SURFACE_Y + PLAYER_FOOT_OFFSET + .45, terrainY + PLAYER_FOOT_OFFSET + .18);
    const position = radialPoint(angle, arrivalRadius, arrivalY);
    const dockPosition = radialPoint(angle, dockRadius, OCEAN_SURFACE_Y + .3);
    return Object.freeze({
      id: ['sandy-beach', 'rocky-coast', 'forest-inlet', 'waterfall-basin', 'boulder-coast', 'sheltered-cove'][index],
      label: SECTORS[index], sector: SECTORS[index], angle,
      locationId: MAIN_WORLD_LOCATION.id,
      coordinateSpace: 'global-world',
      position,
      globalPosition: Object.freeze({ ...position }),
      dockPosition,
      safe: true,
      facingYaw: inwardYaw(angle)
    });
  })
]);

// V2.5 keeps the old named route identities only as navigation/flavor anchors. They no
// longer define where ascent is possible. Construction uses the circumferential climb web
// below, which deliberately overlaps between neighboring angles.
const NAMED_CLIMB_ANCHORS = Object.freeze([
  Object.freeze({ id: 'ridge', label: 'Ridge Route', angle: 20, identity: 'readable scramble / exposed ribs' }),
  Object.freeze({ id: 'split-rock', label: 'Split Rock Traverse', angle: 55, identity: 'diagonal ledges / broken face' }),
  Object.freeze({ id: 'fern-spine', label: 'Fern Spine', angle: 90, identity: 'forest slabs / compact climbs' }),
  Object.freeze({ id: 'chimney', label: 'Chimney / Cave Route', angle: 125, identity: 'protected crack / wall transfers' }),
  Object.freeze({ id: 'cloudstep', label: 'Cloudstep Rib', angle: 150, identity: 'steep rib / fishing detour' }),
  Object.freeze({ id: 'waterfall', label: 'Waterfall / Ravine Route', angle: 183, identity: 'wet slabs / lateral transfers' }),
  Object.freeze({ id: 'talus', label: 'Talus Notch', angle: 219, identity: 'tight boulder scrambling' }),
  Object.freeze({ id: 'boulder', label: 'Boulder Field Route', angle: 265, identity: 'stable jumps / alternate boulder line' }),
  Object.freeze({ id: 'wind-shelf', label: 'Wind Shelf Route', angle: 300, identity: 'exposed shelves / short faces' }),
  Object.freeze({ id: 'sunwash', label: 'Sunwash Spur', angle: 335, identity: 'broken slabs / rough final wall' })
]);

function makeStaggeredClimbAngles(count, phase, waveSeed) {
  const spacing = 360 / count;
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const base = phase + index * spacing;
    // Keep the requested route count exact, but prevent the lines from reading as an
    // evenly spaced radial picket fence. Jitter stays well below half a spacing so the
    // circumferential ordering remains stable and no accidental large holes are created.
    const jitter = Math.sin(degreesToRadians(base * 2.7 + waveSeed * 31)) * spacing * .13
      + Math.sin(degreesToRadians(base * 6.1 - waveSeed * 19)) * spacing * .055;
    return (base + jitter + 360) % 360;
  }));
}

// V2.6 explicitly tapers climb-line count as the circumference shrinks. The lowest
// escarpment has 50 possible lines; higher layers use fewer lines but closer physical
// spacing, preserving the near-continuous climb-web feel without stacking radial lanes.
export const CLIMB_WEB_LAYERS = Object.freeze([
  Object.freeze({ id: 'lower-wall', gateIndex: 0, count: 50, phase: 1.2, angles: makeStaggeredClimbAngles(50, 1.2, 11) }),
  Object.freeze({ id: 'middle-wall', gateIndex: 1, count: 42, phase: 5.6, angles: makeStaggeredClimbAngles(42, 5.6, 23) }),
  Object.freeze({ id: 'alpine-wall', gateIndex: 2, count: 34, phase: 2.9, angles: makeStaggeredClimbAngles(34, 2.9, 37) })
]);

// Compatibility export: older tooling expected one angle list. It now describes the
// lowest and widest climb layer, where the requested route count is exactly 50.
export const CLIMB_WEB_ANGLES = CLIMB_WEB_LAYERS[0].angles;
export const ROUTE_FAMILIES = Object.freeze(CLIMB_WEB_ANGLES.map((angle, index) => Object.freeze({
  id: `open-face-${String(index + 1).padStart(2, '0')}`,
  label: `Open Climb Face ${String(index + 1).padStart(2, '0')}`,
  angle,
  identity: 'lowest circumferential climb web',
  sway: index % 2 ? 1 : -1,
  features: Object.freeze([])
})));

const CROWN_ANGLES = makeStaggeredClimbAngles(26, 7.4, 51);
export const CROWN_ROUTES = Object.freeze(CROWN_ANGLES.map((angle, index) => Object.freeze({
  id: `crown-face-${String(index + 1).padStart(2, '0')}`,
  label: `Crown Face ${String(index + 1).padStart(2, '0')}`,
  angle,
  sway: index % 2 ? 1 : -1
})));

export const ROUTE_NETWORKS = ROUTE_FAMILIES;
export const ROCK_FIELD_FORMATION_COUNT = CLIMB_WEB_LAYERS.reduce((total, layer) => total + layer.count, 0) + CROWN_ROUTES.length;

const LANDMARKS = Object.freeze([
  Object.freeze({ id: 'split-boulder', label: 'Split Boulder', angle: 35, radius: 119 }),
  Object.freeze({ id: 'waterfall-basin', label: 'Fallglass Waterfall Basin', angle: 183, radius: 153 }),
  Object.freeze({ id: 'tilted-slab', label: 'Giant Tilted Slab', angle: 268, radius: 112 }),
  Object.freeze({ id: 'narrow-ravine', label: 'Narrow Ravine', angle: 183, radius: 162 }),
  Object.freeze({ id: 'chimney-crack', label: 'Chimney Crack', angle: 125, radius: 91 }),
  Object.freeze({ id: 'alpine-tarn', label: 'High Cirque Tarn', angle: 112, radius: 56 }),
  Object.freeze({ id: 'summit-crown', label: 'Crooked Peak Crown', angle: 0, radius: CROWN_BASE_RADIUS })
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
  if (options.doubleSided) {
    material.cull = pc.CULLFACE_NONE;
    material.twoSidedLighting = true;
  }
  material.update();
  return material;
}

export class MountainWorld extends TestWorld {
  constructor(app, RAPIER, physicsWorld) {
    super(app, RAPIER, physicsWorld);
    this.root.name = 'Mountain V2.8 slide-and-density traversal graybox';
    this.courseRoot.enabled = false;
    this.buildTarget = this.root;
    this.mountainWaters = [];
    this.rockPlacements = [];
    this.rejectedRocks = [];
    this.homeInteractions = [];
    this.homeTrophies = [];
    this.islandEntities = new Map();
    this.locationLoadGroups = new Map();
    this.activeLocationId = MAIN_WORLD_LOCATION.id;
    this.summitRadius = CROWN_TOP_RADIUS + 1.5;

    // Mid-value palette on purpose: navigation/readability comes before mood in V2.0.
    this.materials.sand = makeMaterial([.78, .7, .51], { gloss: .04 });
    this.materials.coast = makeMaterial([.58, .61, .58], { gloss: .12 });
    this.materials.forestFloor = makeMaterial([.43, .55, .37], { gloss: .05 });
    this.materials.wetRock = makeMaterial([.45, .56, .58], { gloss: .68 });
    this.materials.alpine = makeMaterial([.63, .66, .62], { gloss: .1 });
    this.materials.snow = makeMaterial([.9, .92, .89], { gloss: .24 });
    this.materials.deepRock = makeMaterial([.5, .52, .51], { gloss: .07 });
    this.materials.cave = makeMaterial([.38, .41, .41], { gloss: .04 });
    this.materials.shallowWater = makeMaterial([.27, .69, .7], { opacity: .66, gloss: .82, emissive: [.03, .13, .12], doubleSided: true });
    this.materials.deepWater = makeMaterial([.14, .42, .51], { opacity: .78, gloss: .9, emissive: [.015, .07, .1], doubleSided: true });
    this.materials.waterfall = makeMaterial([.64, .86, .88], { opacity: .74, gloss: .9, emissive: [.04, .13, .14], doubleSided: true });
    this.materials.holdRough = makeMaterial([.72, .57, .37], { gloss: .04 });
    this.materials.holdNormal = makeMaterial([.69, .71, .63], { gloss: .14 });
    this.materials.holdSmooth = makeMaterial([.27, .42, .45], { gloss: .85 });
    this.materials.holdIce = makeMaterial([.57, .82, .91], { gloss: .98, emissive: [.03, .08, .1] });
    this.materials.rockCrack = makeMaterial([.28, .3, .29], { gloss: .025 });
    this.materials.cabinWall = makeMaterial([.43, .25, .13], { gloss: .06 });
    this.materials.cabinTrim = makeMaterial([.72, .56, .34], { gloss: .08 });
    this.materials.cabinRoof = makeMaterial([.19, .24, .23], { gloss: .22 });
    this.materials.cabinGlass = makeMaterial([.35, .68, .72], { opacity: .42, gloss: .92, emissive: [.018, .055, .06] });
    this.materials.cabinFabric = makeMaterial([.66, .24, .18], { gloss: .04 });
    this.materials.cabinWarm = makeMaterial([.91, .67, .24], { emissive: [.08, .045, .008], gloss: .22 });
    this.materials.shrubDark = makeMaterial([.17, .35, .22], { gloss: .025 });
    this.materials.shrubLight = makeMaterial([.34, .48, .26], { gloss: .025 });
    this.materials.dryGrass = makeMaterial([.68, .59, .3], { gloss: .02 });
    this.materials.flowerPink = makeMaterial([.82, .36, .48], { gloss: .12 });
    this.materials.caveWall = makeMaterial([.23, .26, .26], { gloss: .025 });
    this.materials.islandGrass = makeMaterial([.36, .53, .31], { gloss: .04 });
    this.materials.islandRock = makeMaterial([.47, .48, .45], { gloss: .08 });
    this.materials.coldRock = makeMaterial([.62, .69, .72], { gloss: .3 });

    this.rockMaterialVariants = new Map();
    // A route should read as broken mountain rock, not a vertical row of cylinders.
    // Chunk forms are still useful for explicit rest/exit shelves; most climbing pieces
    // use pointed, slanted, narrow, or leaning forms that are poor stamina-reset perches.
    this.fracturedRockForms = FRACTURED_ROCK_FORM_KINDS
      .map((kind, seed) => this.createFracturedRockForm(seed, kind));

    this.buildOceanAndContinuousTerrain();
    this.buildOceanIslands();
    this.buildStarts();
    this.buildTravelDocks();
    this.buildHomeCabin();
    this.buildShopOutpost();
    this.buildPublicAquarium();
    this.buildContinuousClimbWeb();
    this.buildLandmarks();
    this.buildSummitCrown();
    this.buildSummitBench();
    this.buildCrownRoutes();
    this.buildHighAltitudeInfill();
    this.buildThreeToSevenHundredRockField();
    this.buildMidHighTraversalAnchors();
    this.buildSparseRegionInfill();
    this.buildEnvironmentAesthetics();
    this.rockSupportAudit = this.auditSolidRockSupport();
    this.buildFishingLocations();
    this.setActiveLocation(this.activeLocationId);
  }

  point(angle, radius, y, tangentOffset = 0) {
    return radialPoint(angle, radius, y, tangentOffset);
  }

  terrainY(angle, radius) {
    return terrainHeightAt(angle, radius);
  }

  homePoint(localX, localY, localZ) {
    return this.point(
      HOME_CABIN_CONFIG.angle,
      HOME_CABIN_CONFIG.radius + localZ,
      this.homeCabinFloorY + localY,
      -localX
    );
  }

  createStructureRoot(name, angle, radius, floorY, locationId = null) {
    const root = new pc.Entity(name);
    const center = this.point(angle, radius, floorY);
    root.setPosition(center.x, center.y, center.z);
    root.setEulerAngles(0, inwardYaw(angle), 0);
    (this.locationLoadGroups.get(locationId) ?? this.buildTarget).addChild(root);
    return root;
  }

  setActiveLocation(locationId = MAIN_WORLD_LOCATION.id) {
    const nextId = WORLD_LOCATIONS.some((location) => location.id === locationId)
      ? locationId : MAIN_WORLD_LOCATION.id;
    this.activeLocationId = nextId;
    for (const location of SMALL_ISLAND_LOCATIONS) {
      const group = this.locationLoadGroups.get(location.id);
      if (group) group.enabled = location.alwaysLoaded === true || location.id === nextId;
    }
    // The heavy saved-fish display follows Aquarium Island's load group. Physics/world
    // metadata stays globally valid even when that render group is inactive.
    if (this.aquariumResidentRoot) this.aquariumResidentRoot.enabled = nextId === 'aquarium-island';
    return nextId;
  }

  addStructureBox(root, name, localPosition, size, material, rotation = {}, solid = true) {
    const entity = new pc.Entity(name);
    entity.addComponent('render', {
      type: 'box', material, castShadows: true, receiveShadows: true
    });
    root.addChild(entity);
    entity.setLocalPosition(localPosition.x, localPosition.y, localPosition.z);
    entity.setLocalScale(size.x, size.y, size.z);
    entity.setLocalEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    if (!solid) return entity;

    // Author the whole structure in one local coordinate frame, then give Rapier the
    // exact composed world transform. This avoids the old mixed world-Euler rotations
    // that twisted roofs, doors, and glass frames away from their adjoining pieces.
    const position = entity.getPosition();
    const quaternion = entity.getRotation();
    const collider = this.RAPIER.ColliderDesc.cuboid(size.x / 2, size.y / 2, size.z / 2)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(.9)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(collider);
    return entity;
  }

  addCabinBox(name, localPosition, size, material, rotation = {}, solid = true) {
    return this.addStructureBox(this.homeCabinRoot, name, localPosition, size, material, rotation, solid);
  }

  aquariumPoint(localX, localY, localZ) {
    return this.point(
      PUBLIC_AQUARIUM_CONFIG.angle,
      PUBLIC_AQUARIUM_CONFIG.radius + localZ,
      this.publicAquariumFloorY + localY,
      -localX
    );
  }

  addAquariumBox(name, localPosition, size, material, rotation = {}, solid = true) {
    return this.addStructureBox(this.publicAquariumRoot, name, localPosition, size, material, rotation, solid);
  }

  buildOceanIslands() {
    for (const location of SMALL_ISLAND_LOCATIONS) this.buildOceanIsland(location);
  }

  buildOceanIsland(location) {
    const group = new pc.Entity(`${location.displayName} load group`);
    group.locationId = location.id;
    this.buildTarget.addChild(group);
    this.locationLoadGroups.set(location.id, group);
    const segments = 36;
    const ringFactors = [1.2, 1, .68, .2, .035];
    const ringHeights = [OCEAN_SURFACE_Y - 1.6, OCEAN_SURFACE_Y - .08,
      location.elevation + .06, location.elevation + .16, location.elevation + .18];
    const vertices = [];
    for (let ring = 0; ring < ringFactors.length; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const theta = segment * Math.PI * 2 / segments;
        const angle = segment * 360 / segments;
        const identityScale = islandFootprintScale(location.id, angle);
        const microWobble = 1 + Math.sin(segment * 2.17 + location.worldPosition.x * .01) * .022
          + Math.sin(segment * .79 + location.worldPosition.z * .013) * .014;
        // Underwater skirts are slightly softened, while the shoreline/top rings preserve
        // the destination's actual distinctive silhouette for future map simplification.
        const footprintScale = lerp(1, identityScale, ring === 0 ? .72 : 1) * microWobble;
        vertices.push([
          location.worldPosition.x + Math.cos(theta) * location.radii.x * ringFactors[ring] * footprintScale,
          ringHeights[ring] + (ring >= 2 ? Math.sin(segment * 1.91) * .035 : 0),
          location.worldPosition.z + Math.sin(theta) * location.radii.z * ringFactors[ring] * footprintScale
        ]);
      }
    }
    const triangles = [];
    for (let ring = 0; ring < ringFactors.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const localAngle = segment * 360 / segments;
        const openingDelta = angularDistance(localAngle, location.id === 'cave-fishing-island' ? location.angle : -180);
        if (location.id === 'cave-fishing-island' && ring >= 1 && ring <= 2 && openingDelta < 15) continue;
        const outer = ring * segments + segment;
        const inner = (ring + 1) * segments + segment;
        const outerNext = ring * segments + next;
        const innerNext = (ring + 1) * segments + next;
        triangles.push([outer, inner, outerNext], [outerNext, inner, innerNext]);
      }
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
    const entity = new pc.Entity(`${location.displayName} terrain core`);
    entity.addComponent('render');
    const material = location.id === 'cold-island' ? this.materials.snow
      : location.id === 'cave-fishing-island' ? this.materials.islandRock
        : this.materials.islandGrass;
    entity.render.meshInstances = [new pc.MeshInstance(mesh, material, entity)];
    entity.render.castShadows = false;
    group.addChild(entity);
    entity.physicsCollider = this.physicsWorld.createCollider(
      this.RAPIER.ColliderDesc.trimesh(
        new Float32Array(vertices.flat()),
        new Uint32Array(triangles.flat())
      ).setFriction(.94).setRestitution(0)
    );
    this.islandEntities.set(location.id, entity);
    const previousTarget = this.buildTarget;
    this.buildTarget = group;
    this.decorateOceanIsland(location);
    this.buildTarget = previousTarget;
  }

  decorateOceanIsland(location) {
    const { x, z } = location.worldPosition;
    const y = location.elevation + .18;
    if (location.id === 'home-island') {
      for (let index = 0; index < 9; index += 1) {
        const theta = (index * 41 + 14) * Math.PI / 180;
        this.addIslandTree(`${location.displayName} cozy tree ${index + 1}`,
          x + Math.cos(theta) * (10 + index % 3 * 2.2), z + Math.sin(theta) * (7 + index % 2 * 2.4), y,
          .55 + index % 3 * .1, index % 2 ? 'broadleaf' : 'conifer');
      }
    } else if (location.id === 'shop-island') {
      for (let index = 0; index < 6; index += 1) this.addBox(`Shop cargo crate ${index + 1}`,
        { x: x - 8 + (index % 3) * 2.1, y: y + .48, z: z - 4 + Math.floor(index / 3) * 2 },
        { x: 1.45, y: .95, z: 1.45 }, this.materials.wood, { y: index * 11 });
    } else if (location.id === 'aquarium-island') {
      for (let index = 0; index < 18; index += 1) {
        const theta = index * Math.PI * 2 / 18;
        this.createPrimitive(`Aquarium garden flower ${index + 1}`, 'sphere',
          { x: x + Math.cos(theta) * 16, y: y + .24, z: z + Math.sin(theta) * 11 },
          { x: .22, y: .32, z: .22 }, index % 2 ? this.materials.flowerPink : this.materials.flowers,
          {}, { castShadows: false });
      }
    } else if (location.id === 'cave-fishing-island') {
      for (let index = 0; index < 11; index += 1) {
        const theta = (index * 31 + 40) * Math.PI / 180;
        this.addMountainBoulder(`Cave island natural rock ${index + 1}`,
          { x: x + Math.cos(theta) * (8 + index % 4 * 2), y: y + .55, z: z + Math.sin(theta) * (6 + index % 3 * 1.7) },
          { x: 1.5 + index % 3 * .5, y: 1.1 + index % 4 * .55, z: 1.6 }, this.materials.islandRock);
      }
    } else if (location.id === 'normal-fishing-island') {
      for (let index = 0; index < 24; index += 1) {
        const theta = index * Math.PI * 2 / 24;
        this.createPrimitive(`Reedwater reed ${index + 1}`, 'cone',
          { x: x + Math.cos(theta) * 7.2, y: y + .55, z: z + Math.sin(theta) * 5.8 },
          { x: .14, y: 1.1 + index % 3 * .18, z: .14 }, this.materials.dryGrass,
          { z: index % 2 ? 5 : -5 }, { castShadows: false });
      }
    } else if (location.id === 'cold-island') {
      for (let index = 0; index < 12; index += 1) {
        const theta = (index * 29 + 8) * Math.PI / 180;
        this.createPrimitive(`Frosthook ice formation ${index + 1}`, 'cone',
          { x: x + Math.cos(theta) * (8 + index % 4 * 2), y: y + 1.15 + index % 3 * .35, z: z + Math.sin(theta) * (7 + index % 3 * 2) },
          { x: .65 + index % 3 * .22, y: 2.3 + index % 4 * .7, z: .65 }, this.materials.ice,
          { z: index % 2 ? 8 : -9 });
      }
    }
  }

  addIslandTree(name, x, z, baseY, size, style) {
    const trunk = this.addCylinder(`${name} climbable trunk`, { x, y: baseY + 1.3 * size, z },
      { x: .58 * size, y: 2.6 * size, z: .58 * size }, this.materials.wood);
    this.registerClimbSurface(trunk, trunk.physicsCollider, 'rough', `${name} trunk`);
    const crownType = style === 'broadleaf' ? 'sphere' : 'cone';
    this.createPrimitive(`${name} crown`, crownType, { x, y: baseY + 3.45 * size, z },
      { x: 2.1 * size, y: (style === 'broadleaf' ? 1.7 : 3.4) * size, z: 2.1 * size },
      style === 'broadleaf' ? this.materials.shrubLight : this.materials.foliage);
  }

  buildTravelDocks() {
    const buildDock = (id, label, position, angle, length, destinationId) => {
      const yaw = inwardYaw(angle);
      const loadGroup = this.locationLoadGroups.get(destinationId) ?? null;
      const deck = this.addBox(`${label} dock deck`, position, { x: 3.4, y: .28, z: length }, this.materials.woodLight, { y: yaw });
      if (loadGroup) loadGroup.addChild(deck);
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        const theta = degreesToRadians(angle);
        const tangentX = -Math.sin(theta) * side * 1.65;
        const tangentZ = Math.cos(theta) * side * 1.65;
        const radial = end * length * .38;
        const pile = this.addCylinder(`${label} dock pile ${side}:${end}`, {
          x: position.x + tangentX + Math.cos(theta) * radial,
          y: OCEAN_SURFACE_Y - .18,
          z: position.z + tangentZ + Math.sin(theta) * radial
        }, { x: .28, y: 2.3, z: .28 }, this.materials.wood);
        if (loadGroup) loadGroup.addChild(pile);
      }
      this.homeInteractions.push({
        id, label: `BOARD BOAT • ${label}`, action: 'boat', destinationId,
        position: { x: position.x, y: position.y + .14, z: position.z }, range: 2.5
      });
    };
    for (const start of START_LOCATIONS) buildDock(`${start.id}-boat`, start.label, start.dockPosition, start.angle, 13, MAIN_WORLD_LOCATION.id);
    for (const location of SMALL_ISLAND_LOCATIONS) buildDock(
      `${location.id}-boat`, location.displayName, location.dock.worldPosition, location.angle,
      location.dock.length, location.id
    );
  }

  buildShopOutpost() {
    const location = SMALL_ISLAND_LOCATIONS.find((entry) => entry.id === 'shop-island');
    const floorY = location.elevation + .2;
    this.shopRoot = this.createStructureRoot('Shop island outfitter', location.angle, location.radius, floorY, location.id);
    const box = (name, position, size, material, rotation = {}, solid = true) => (
      this.addStructureBox(this.shopRoot, name, position, size, material, rotation, solid)
    );
    box('Outfitter floor', { x: 0, y: -.12, z: 0 }, { x: 10.5, y: .28, z: 7.4 }, this.materials.wood);
    box('Outfitter back wall', { x: 0, y: 2, z: -3.5 }, { x: 10.5, y: 4, z: .28 }, this.materials.cabinWall);
    for (const side of [-1, 1]) box(`Outfitter side wall ${side}`, { x: side * 5.1, y: 2, z: 0 }, { x: .28, y: 4, z: 7.2 }, this.materials.cabinWall);
    for (const side of [-1, 1]) box(`Outfitter roof pitch ${side}`, { x: side * 2.7, y: 4.6, z: 0 },
      { x: 5.8, y: .25, z: 8.2 }, this.materials.cabinRoof, { z: -side * 21 });
    box('Outfitter counter', { x: 0, y: .85, z: 1.4 }, { x: 6.8, y: 1.7, z: 1 }, this.materials.cabinTrim);
    const counterPromptPosition = this.point(location.angle, location.radius + 2.65, floorY + .08, 0);
    const angleRadians = degreesToRadians(location.angle);
    const radialX = Math.cos(angleRadians);
    const radialZ = Math.sin(angleRadians);
    this.homeInteractions.push({
      id: 'shop-counter', label: 'OPEN OUTFITTER SHOP', action: 'shop',
      position: counterPromptPosition,
      range: 2.25,
      // Use a counter-shaped interaction volume instead of the old broad sphere. The old
      // prompt was also authored behind the counter (radius - 1.6), so its target could
      // remain stale as the player left. This volume is confined to the open customer side.
      contains: (point) => {
        const offsetX = point.x - location.worldPosition.x;
        const offsetZ = point.z - location.worldPosition.z;
        const radialOffset = offsetX * radialX + offsetZ * radialZ;
        const tangentOffset = -offsetX * radialZ + offsetZ * radialX;
        const feetY = point.y - PLAYER_FOOT_OFFSET;
        return radialOffset >= 2.0 && radialOffset <= 3.35
          && Math.abs(tangentOffset) <= 2.15
          && feetY >= floorY - .4 && feetY <= floorY + 1.8;
      }
    });
  }

  getWorldLocations() {
    return WORLD_LOCATIONS;
  }

  chooseTravelArrival(destinationId, rng = Math.random) {
    if (destinationId === MAIN_WORLD_LOCATION.id) {
      const safeStarts = START_LOCATIONS.filter((start) => start.safe !== false);
      const start = safeStarts[Math.floor(rng() * safeStarts.length)];
      return {
        location: MAIN_WORLD_LOCATION,
        locationId: MAIN_WORLD_LOCATION.id,
        coordinateSpace: 'global-world',
        dockId: `${start.id}-dock`,
        dockPosition: { ...start.dockPosition },
        position: { ...start.position },
        globalPosition: { ...start.position },
        safe: true,
        facingYaw: start.facingYaw
      };
    }
    const location = SMALL_ISLAND_LOCATIONS.find((entry) => entry.id === destinationId);
    if (!location) return null;
    return {
      location,
      locationId: location.id,
      coordinateSpace: 'global-world',
      dockId: location.dock.id,
      dockPosition: { ...location.dock.worldPosition },
      position: { ...location.dock.arrivalPosition },
      globalPosition: { ...location.dock.arrivalPosition },
      safe: true,
      facingYaw: location.dock.facingYaw
    };
  }

  getHomeArrival() {
    const floorY = this.homeCabinFloorY ?? HOME_CABIN_CONFIG.floorY;
    return {
      locationId: 'home-island',
      label: 'Cabin / Home Island',
      // Just beyond the lower porch step, centered on the open doorway and facing in.
      position: this.point(
        HOME_CABIN_CONFIG.angle,
        HOME_CABIN_CONFIG.radius + 6.8,
        floorY + PLAYER_FOOT_OFFSET + .12,
        0
      ),
      facingYaw: inwardYaw(HOME_CABIN_CONFIG.angle)
    };
  }

  buildHomeCabin() {
    const config = HOME_CABIN_CONFIG;
    this.homeCabinFloorY = config.floorY ?? this.terrainY(config.angle, config.radius) + .22;
    this.homeCabinRoot = this.createStructureRoot(
      'Trail cabin aligned structure', config.angle, config.radius, this.homeCabinFloorY, HOME_WORLD_LOCATION?.id
    );

    this.addCabinBox('Trail cabin stable floor', { x: 0, y: -.16, z: 0 },
      { x: config.width, y: .32, z: config.depth }, this.materials.wood);
    this.addCabinBox('Trail cabin back wall', { x: 0, y: config.wallHeight * .5, z: -config.depth * .5 },
      { x: config.width, y: config.wallHeight, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin right wall',
      { x: config.width * .5, y: config.wallHeight * .5, z: 0 },
      { x: .3, y: config.wallHeight, z: config.depth }, this.materials.cabinWall);
    // The left wall has a true framed window opening rather than glass pasted onto a
    // solid wall. Four broad pieces keep its collision simple and capsule-safe.
    this.addCabinBox('Trail cabin left wall rear section', { x: -config.width * .5, y: config.wallHeight * .5, z: -2.4125 },
      { x: .3, y: config.wallHeight, z: 1.975 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin left wall front section', { x: -config.width * .5, y: config.wallHeight * .5, z: 1.8125 },
      { x: .3, y: config.wallHeight, z: 3.175 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin left window sill wall', { x: -config.width * .5, y: .625, z: -.6 },
      { x: .3, y: 1.25, z: 1.65 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin left window header wall', { x: -config.width * .5, y: 3, z: -.6 },
      { x: .3, y: .9, z: 1.65 }, this.materials.cabinWall);
    const doorWidth = 1.55;
    const frontSegmentWidth = (config.width - doorWidth) * .5;
    this.addCabinBox('Trail cabin front wall left of door',
      { x: -(doorWidth * .5 + frontSegmentWidth * .5), y: config.wallHeight * .5, z: config.depth * .5 },
      { x: frontSegmentWidth, y: config.wallHeight, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin front wall inner window pier', { x: 1.275, y: config.wallHeight * .5, z: config.depth * .5 },
      { x: 1, y: config.wallHeight, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin front wall outer window pier', { x: 3.7625, y: config.wallHeight * .5, z: config.depth * .5 },
      { x: .875, y: config.wallHeight, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin front window sill wall', { x: 2.55, y: .6375, z: config.depth * .5 },
      { x: 1.55, y: 1.275, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin front window header wall', { x: 2.55, y: 2.9875, z: config.depth * .5 },
      { x: 1.55, y: .925, z: .3 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin doorway header', { x: 0, y: 3.08, z: config.depth * .5 },
      { x: doorWidth, y: .74, z: .34 }, this.materials.cabinTrim);
    for (const side of [-1, 1]) {
      this.addCabinBox(`Trail cabin door jamb ${side < 0 ? 'left' : 'right'}`,
        { x: side * (doorWidth * .5 + .07), y: 1.36, z: config.depth * .5 + .04 },
        { x: .15, y: 2.72, z: .38 }, this.materials.cabinTrim);
    }

    for (const side of [-1, 1]) {
      this.addCabinBox(`Trail cabin roof ${side < 0 ? 'west' : 'east'} pitch`,
        { x: side * 2.16, y: 4.05, z: 0 }, { x: 4.85, y: .24, z: 7.65 },
        this.materials.cabinRoof, { z: -side * 25 });
    }
    this.addCabinBox('Trail cabin roof ridge', { x: 0, y: 4.98, z: 0 },
      { x: .24, y: .2, z: 7.75 }, this.materials.cabinTrim);

    this.addCabinBox('Trail cabin porch', { x: 0, y: -.12, z: 4.45 },
      { x: 7.2, y: .24, z: 2.1 }, this.materials.woodLight);
    this.addCabinBox('Trail cabin upper step', { x: 0, y: -.28, z: 5.72 },
      { x: 3.2, y: .24, z: .72 }, this.materials.cabinTrim);
    this.addCabinBox('Trail cabin lower step', { x: 0, y: -.43, z: 6.35 },
      { x: 3.65, y: .22, z: .65 }, this.materials.cabinTrim);
    for (const side of [-1, 1]) {
      this.addCabinBox(`Trail cabin porch post ${side < 0 ? 'left' : 'right'}`,
        { x: side * 3.25, y: 1.55, z: 4.95 }, { x: .22, y: 3.1, z: .22 }, this.materials.cabinTrim);
    }
    this.addCabinBox('Trail cabin porch awning', { x: 0, y: 3.22, z: 4.55 },
      { x: 7.25, y: .18, z: 2.55 }, this.materials.cabinRoof, { x: 7 });
    for (const side of [-1, 1]) {
      this.addCabinBox(`Trail cabin porch ${side < 0 ? 'left' : 'right'} handrail`,
        { x: side * 3.25, y: .78, z: 4.43 }, { x: .16, y: .16, z: 1.35 }, this.materials.cabinTrim);
    }

    // The panes and mullions fill actual wall openings. They stay visual-only so the thin
    // detail cannot snag the player capsule; the surrounding sill/header collision is solid.
    this.addCabinBox('Trail cabin front window', { x: 2.55, y: 1.9, z: config.depth * .5 + .18 },
      { x: 1.55, y: 1.25, z: .05 }, this.materials.cabinGlass, {}, false);
    this.addCabinBox('Trail cabin side window', { x: -config.width * .5 - .18, y: 1.9, z: -.6 },
      { x: .05, y: 1.3, z: 1.65 }, this.materials.cabinGlass, {}, false);
    for (const x of [1.735, 2.55, 3.365]) {
      this.addCabinBox(`Trail cabin front window frame ${x}`, { x, y: 1.9, z: config.depth * .5 + .22 },
        { x: .07, y: 1.42, z: .07 }, this.materials.cabinTrim, {}, false);
    }
    for (const y of [1.25, 1.9, 2.55]) {
      this.addCabinBox(`Trail cabin front window crossbar ${y}`, { x: 2.55, y, z: config.depth * .5 + .22 },
        { x: 1.68, y: .07, z: .07 }, this.materials.cabinTrim, {}, false);
    }
    for (const z of [-1.46, -.6, .26]) {
      this.addCabinBox(`Trail cabin side window frame ${z}`, { x: -config.width * .5 - .22, y: 1.9, z },
        { x: .07, y: 1.44, z: .07 }, this.materials.cabinTrim, {}, false);
    }
    for (const y of [1.23, 1.9, 2.57]) {
      this.addCabinBox(`Trail cabin side window crossbar ${y}`, { x: -config.width * .5 - .22, y, z: -.6 },
        { x: .07, y: .07, z: 1.78 }, this.materials.cabinTrim, {}, false);
    }
    this.addCabinBox('Trail cabin open door', { x: -.92, y: 1.36, z: 3.94 },
      { x: 1.42, y: 2.67, z: .13 }, this.materials.woodLight, { y: -72 }, false);
    for (const [index, x] of [-3.35, -1.75, 1.75, 3.35].entries()) {
      this.addCabinBox(`Trail cabin floor board ${index + 1}`, { x, y: .012, z: 0 },
        { x: .035, y: .025, z: config.depth - .18 }, this.materials.cabinTrim, {}, false);
    }

    // Bed and chair have broad, simple collision volumes so they feel solid without creating
    // narrow gaps that can wedge the player capsule.
    this.addCabinBox('Trail cabin bed frame', { x: -2.65, y: .32, z: -1.55 },
      { x: 2.05, y: .55, z: 3.15 }, this.materials.woodLight);
    this.addCabinBox('Trail cabin bedroll', { x: -2.65, y: .65, z: -1.55 },
      { x: 1.85, y: .24, z: 2.9 }, this.materials.cabinFabric);
    this.addCabinBox('Trail cabin pillow', { x: -2.65, y: .86, z: -2.45 },
      { x: 1.42, y: .24, z: .58 }, this.materials.snow, {}, false);
    this.addCabinBox('Trail cabin table top', { x: 2.15, y: 1.02, z: -.25 },
      { x: 2.15, y: .18, z: 1.32 }, this.materials.woodLight);
    this.addCabinBox('Trail cabin table pedestal', { x: 2.15, y: .5, z: -.25 },
      { x: .55, y: 1, z: .55 }, this.materials.wood);
    this.addCabinBox('Trail cabin chair seat', { x: 2.15, y: .58, z: 1.45 },
      { x: 1.05, y: .22, z: 1.05 }, this.materials.woodLight);
    this.addCabinBox('Trail cabin chair back', { x: 2.15, y: 1.25, z: 1.91 },
      { x: 1.05, y: 1.38, z: .18 }, this.materials.woodLight);

    this.addCabinBox('Trail cabin wardrobe', { x: -3.55, y: 1.28, z: 1.05 },
      { x: 1.05, y: 2.55, z: 1.65 }, this.materials.cabinWall);
    this.addCabinBox('Trail cabin wardrobe mirror', { x: -2.99, y: 1.5, z: 1.05 },
      { x: .045, y: 1.55, z: .88 }, this.materials.cabinGlass, {}, false);
    this.addCabinBox('Trail cabin wardrobe handle', { x: -2.94, y: 1.28, z: .73 },
      { x: .06, y: .12, z: .08 }, this.materials.cabinWarm, {}, false);

    for (let shelf = 0; shelf < 2; shelf += 1) {
      this.addCabinBox(`Trail cabin trophy shelf ${shelf + 1}`, { x: 2.45, y: 1.48 + shelf * .72, z: -3.12 },
        { x: 2.85, y: .12, z: .48 }, this.materials.cabinTrim);
    }
    const trophyColors = [this.materials.holdRough, this.materials.shallowWater, this.materials.holdIce, this.materials.cabinWarm];
    for (let index = 0; index < 4; index += 1) {
      const trophy = this.createPrimitive(`Trail cabin progress trophy ${index + 1}`, index === 1 ? 'sphere' : 'cone',
        this.homePoint(1.55 + index * .62, 1.83 + (index % 2) * .72, -3.0),
        { x: .32, y: .48 + (index % 2) * .16, z: .22 }, trophyColors[index],
        { x: index === 1 ? 0 : 90, y: inwardYaw(config.angle) + index * 23, z: 0 });
      trophy.enabled = false;
      this.homeTrophies.push(trophy);
    }
    this.addCabinBox('Trail cabin gear rack', { x: -.85, y: 1.75, z: -3.13 },
      { x: 1.9, y: .14, z: .16 }, this.materials.cabinTrim, {}, false);
    for (const [index, x] of [-1.45, -.82, -.18].entries()) {
      this.addCylinder(`Trail cabin hanging gear ${index + 1}`, this.homePoint(x, 1.12, -3.0),
        { x: .055, y: 1.15, z: .055 }, index === 1 ? this.materials.holdIce : this.materials.holdRough,
        { x: 0, y: inwardYaw(config.angle), z: index % 2 ? 8 : -8 }, false);
    }

    // Finish the cabin as a lived-in mountain base: a real hearth/chimney, visible
    // rafters, warm lantern, woven rug, and an exterior trail sign.
    this.addCabinBox('Trail cabin stone hearth', { x: 2.95, y: .15, z: -2.7 },
      { x: 1.75, y: .3, z: 1.1 }, this.materials.deepRock);
    this.addCabinBox('Trail cabin fireplace back', { x: 2.95, y: 1.18, z: -3.05 },
      { x: 1.6, y: 2.05, z: .45 }, this.materials.rock);
    this.addCabinBox('Trail cabin fireplace opening', { x: 2.95, y: .72, z: -2.79 },
      { x: .92, y: .82, z: .08 }, this.materials.caveWall, {}, false);
    this.addCabinBox('Trail cabin fireplace glow', { x: 2.95, y: .5, z: -2.72 },
      { x: .55, y: .35, z: .1 }, this.materials.cabinWarm, {}, false);
    this.addCabinBox('Trail cabin stone chimney', { x: 3.55, y: 4.15, z: -2.45 },
      { x: .82, y: 5.5, z: .82 }, this.materials.deepRock);
    this.addCabinBox('Trail cabin chimney cap', { x: 3.55, y: 6.93, z: -2.45 },
      { x: 1.05, y: .18, z: 1.05 }, this.materials.rock);
    this.addCabinBox('Trail cabin woven rug', { x: 0, y: .035, z: -.15 },
      { x: 2.25, y: .035, z: 3.25 }, this.materials.cabinFabric, {}, false);
    for (const z of [-2.65, 0, 2.65]) {
      for (const side of [-1, 1]) {
        this.addCabinBox(`Trail cabin exposed rafter ${z} ${side < 0 ? 'west' : 'east'}`,
          { x: side * 2.02, y: 4, z }, { x: 4.55, y: .12, z: .16 },
          this.materials.cabinTrim, { z: -side * 25 }, false);
      }
    }
    this.addCabinBox('Trail cabin hanging lantern', { x: 0, y: 3.1, z: .2 },
      { x: .34, y: .55, z: .34 }, this.materials.cabinWarm, {}, false);
    this.addCabinBox('Trail cabin Crooked Peak sign', { x: -2.15, y: 2.05, z: 5.03 },
      { x: 2.35, y: .7, z: .11 }, this.materials.woodLight, { z: -2 }, false);

    const cabinYaw = inwardYaw(config.angle);
    this.homeInteractions.push(
      { id: 'wardrobe', label: 'OPEN APPEARANCE', action: 'appearance', position: this.homePoint(-2.75, .9, 1.05) },
      {
        id: 'bed', label: 'REST ON BED', action: 'rest', seatKind: 'bed',
        position: this.homePoint(-1.4, PLAYER_FOOT_OFFSET + .08, -1.15),
        seatPosition: this.homePoint(-2.65, .77 + PLAYER_FOOT_OFFSET + .03, -1.55),
        exitPosition: this.homePoint(-1.22, PLAYER_FOOT_OFFSET + .08, -1.15),
        facingYaw: cabinYaw + 180,
        range: 2.15
      },
      {
        id: 'chair', label: 'SIT BY THE TABLE', action: 'rest', seatKind: 'chair',
        position: this.homePoint(2.15, PLAYER_FOOT_OFFSET + .08, 1.25),
        seatPosition: this.homePoint(2.15, .69 + PLAYER_FOOT_OFFSET + .03, 1.45),
        exitPosition: this.homePoint(.9, PLAYER_FOOT_OFFSET + .08, 1.55),
        facingYaw: cabinYaw,
        range: 1.95
      },
      { id: 'trophies', label: 'CHECK TRAIL TROPHIES', action: 'trophies', position: this.homePoint(2.25, 1.1, -2.45) }
    );
  }

  buildPublicAquarium() {
    const config = PUBLIC_AQUARIUM_CONFIG;
    this.publicAquariumFloorY = config.floorY ?? this.terrainY(config.angle, config.radius) + .28;
    this.publicAquariumRoot = this.createStructureRoot(
      'Shoreline aquarium aligned structure', config.angle, config.radius, this.publicAquariumFloorY, AQUARIUM_WORLD_LOCATION?.id
    );
    this.aquariumResidents = [];
    this.aquariumResidentSignature = '';

    // The aquarium is a separate shoreline pavilion, not another room or prop inside the
    // cabin. A broad deck, framed glass tank, roof, and steps make it a destination.
    this.addAquariumBox('Shoreline aquarium foundation', { x: 0, y: -.2, z: 0 },
      { x: 13.4, y: .4, z: 9.2 }, this.materials.wood);
    this.addAquariumBox('Shoreline aquarium front step', { x: 0, y: -.38, z: 5.05 },
      { x: 4.8, y: .28, z: 1.05 }, this.materials.cabinTrim);
    this.addAquariumBox('Shoreline aquarium tank base', { x: 0, y: .34, z: -.35 },
      { x: config.width, y: .68, z: config.depth }, this.materials.deepRock);
    this.addAquariumBox('Shoreline aquarium tank floor', { x: 0, y: .72, z: -.35 },
      { x: config.width - .35, y: .16, z: config.depth - .35 }, this.materials.waterEdge);

    const tankCenterY = .76 + config.tankHeight * .5;
    const tankCenterZ = -.35;
    this.addAquariumBox('Shoreline aquarium front glass',
      { x: 0, y: tankCenterY, z: tankCenterZ + config.depth * .5 },
      { x: config.width, y: config.tankHeight, z: .16 }, this.materials.cabinGlass);
    this.addAquariumBox('Shoreline aquarium rear glass',
      { x: 0, y: tankCenterY, z: tankCenterZ - config.depth * .5 },
      { x: config.width, y: config.tankHeight, z: .16 }, this.materials.cabinGlass);
    for (const side of [-1, 1]) {
      this.addAquariumBox(`Shoreline aquarium ${side < 0 ? 'left' : 'right'} glass`,
        { x: side * config.width * .5, y: tankCenterY, z: tankCenterZ },
        { x: .16, y: config.tankHeight, z: config.depth }, this.materials.cabinGlass);
      for (const depthSide of [-1, 1]) {
        this.addAquariumBox(
          `Shoreline aquarium ${side < 0 ? 'left' : 'right'} ${depthSide < 0 ? 'rear' : 'front'} frame post`,
          { x: side * config.width * .5, y: tankCenterY, z: tankCenterZ + depthSide * config.depth * .5 },
          { x: .22, y: config.tankHeight + .3, z: .22 }, this.materials.cabinTrim
        );
        this.addAquariumBox(
          `Shoreline aquarium ${side < 0 ? 'left' : 'right'} ${depthSide < 0 ? 'rear' : 'front'} pavilion post`,
          { x: side * 6.05, y: 2.45, z: depthSide * 3.65 },
          { x: .24, y: 4.9, z: .24 }, this.materials.cabinTrim
        );
      }
    }
    for (const depthSide of [-1, 1]) {
      this.addAquariumBox(`Shoreline aquarium ${depthSide < 0 ? 'rear' : 'front'} upper frame`,
        { x: 0, y: .8 + config.tankHeight, z: tankCenterZ + depthSide * config.depth * .5 },
        { x: config.width + .25, y: .22, z: .22 }, this.materials.cabinTrim);
    }
    for (const side of [-1, 1]) {
      this.addAquariumBox(`Shoreline aquarium ${side < 0 ? 'left' : 'right'} upper frame`,
        { x: side * config.width * .5, y: .8 + config.tankHeight, z: tankCenterZ },
        { x: .22, y: .22, z: config.depth + .25 }, this.materials.cabinTrim);
      this.addAquariumBox(`Shoreline aquarium canopy ${side < 0 ? 'west' : 'east'} pitch`,
        { x: side * 3.12, y: 5.72, z: .15 }, { x: 6.9, y: .24, z: 8.55 },
        this.materials.cabinRoof, { z: -side * 16 });
    }
    this.addAquariumBox('Shoreline aquarium canopy ridge', { x: 0, y: 6.67, z: .15 },
      { x: .24, y: .22, z: 8.7 }, this.materials.cabinTrim);
    this.addAquariumBox('Shoreline aquarium collection sign', { x: 0, y: 5.45, z: 3.82 },
      { x: 4.7, y: .78, z: .12 }, this.materials.woodLight, {}, false);

    const water = this.addAquariumBox('Shoreline aquarium water',
      { x: 0, y: tankCenterY - .08, z: tankCenterZ },
      { x: config.width - .32, y: config.tankHeight - .28, z: config.depth - .32 },
      this.materials.shallowWater, {}, false);
    water.render.castShadows = false;

    for (let index = 0; index < 8; index += 1) {
      const x = -4.45 + index * 1.28;
      const z = tankCenterZ - 1.95 + (index % 3) * 1.55;
      this.createPrimitive(`Shoreline aquarium habitat stone ${index + 1}`, 'sphere',
        this.aquariumPoint(x, .88 + (index % 2) * .08, z),
        { x: .68 + (index % 3) * .18, y: .32 + (index % 2) * .14, z: .55 },
        index % 2 ? this.materials.rockLight : this.materials.rock,
        { x: index * 9, y: inwardYaw(config.angle) + index * 31, z: index % 2 ? 7 : -5 },
        { castShadows: false });
      this.createPrimitive(`Shoreline aquarium plant ${index + 1}`, 'cone',
        this.aquariumPoint(x + .35, 1.22, z + .2),
        { x: .16, y: .95 + (index % 3) * .2, z: .16 },
        index % 2 ? this.materials.shrubLight : this.materials.foliage,
        { x: 0, y: index * 43, z: index % 2 ? 10 : -10 }, { castShadows: false });
    }

    this.aquariumResidentRoot = new pc.Entity('Saved aquarium swimming residents');
    this.aquariumResidentRoot.setLocalPosition(0, 0, tankCenterZ);
    this.publicAquariumRoot.addChild(this.aquariumResidentRoot);

    this.homeInteractions.push({
      id: 'shoreline-aquarium',
      label: 'VIEW AQUARIUM COLLECTION',
      action: 'aquarium',
      position: this.aquariumPoint(0, .6, config.depth * .5 + 1.45),
      range: config.interactionDistance
    });
  }

  updateAquariumResidents(save = {}) {
    const specimens = save.progression?.aquarium ?? save.aquarium ?? [];
    const visible = specimens.slice(-PUBLIC_AQUARIUM_CONFIG.visibleResidentLimit);
    const signature = visible.map((specimen) => (
      `${specimen.specimenId}:${specimen.length}:${specimen.weight}:${specimen.shiny ? 1 : 0}`
    )).join('|');
    if (signature === this.aquariumResidentSignature) return this.aquariumResidents.length;
    for (const resident of this.aquariumResidents) destroySpecimenModel(resident.model);
    this.aquariumResidents = [];
    this.aquariumResidentSignature = signature;

    for (const [index, specimen] of visible.entries()) {
      const unit = stableUnit(`aquarium:${specimen.specimenId}`);
      const model = createSpecimenModel(specimen, {
        name: `Aquarium resident ${specimen.name} ${index + 1}`,
        maximumScale: .72
      });
      this.aquariumResidentRoot.addChild(model.root);
      const depthLane = ((index * 5) % 11) / 10;
      const heightLane = ((index * 7) % 9) / 8;
      const resident = {
        model,
        phase: unit * Math.PI * 2 + index * .71,
        speed: .32 + (index % 7) * .035 + unit * .08,
        range: 3.65 - (index % 4) * .22,
        centerZ: -2.15 + depthLane * 4.3,
        centerY: 1.35 + heightLane * 2.6,
        vertical: .12 + (index % 3) * .045
      };
      this.aquariumResidents.push(resident);
    }
    return this.aquariumResidents.length;
  }

  updateAquariumSwimming() {
    if (this.activeLocationId !== 'aquarium-island') return;
    for (const [index, resident] of this.aquariumResidents.entries()) {
      const t = this.elapsed * resident.speed + resident.phase;
      const x = Math.sin(t) * resident.range;
      const z = resident.centerZ + Math.sin(t * .63 + resident.phase) * .42;
      const y = resident.centerY + Math.sin(t * .82 + resident.phase * .5) * resident.vertical;
      const velocityX = Math.cos(t) * resident.range;
      const velocityZ = Math.cos(t * .63 + resident.phase) * .265;
      const yaw = Math.atan2(-velocityZ, velocityX) * 180 / Math.PI;
      resident.model.root.setLocalPosition(x, y, z);
      resident.model.root.setLocalEulerAngles(0, yaw, Math.sin(t * .9) * 2.5);
      if (resident.model.tail) {
        const base = resident.model.tailBaseEuler ?? resident.model.tail.getLocalEulerAngles().clone();
        resident.model.tailBaseEuler = base;
        resident.model.tail.setLocalEulerAngles(base.x, base.y + Math.sin(t * 7 + index) * 15, base.z);
      }
    }
  }

  getNearestHomeInteraction(point, maximumDistance = Math.max(
    HOME_CABIN_CONFIG.interactionDistance,
    SUMMIT_BENCH_CONFIG.interactionDistance,
    PUBLIC_AQUARIUM_CONFIG.interactionDistance
  )) {
    if (![point?.x, point?.y, point?.z].every(Number.isFinite)) return null;
    let nearest = null;
    let nearestDistance = maximumDistance;
    for (const interaction of this.homeInteractions ?? []) {
      if (![interaction.position?.x, interaction.position?.y, interaction.position?.z].every(Number.isFinite)) continue;
      const distance = Math.hypot(
        point.x - interaction.position.x,
        (point.y - PLAYER_FOOT_OFFSET) - interaction.position.y,
        point.z - interaction.position.z
      );
      const interactionRange = interaction.range ?? HOME_CABIN_CONFIG.interactionDistance;
      if (interaction.contains && !interaction.contains(point)) continue;
      if (distance > interactionRange || distance > nearestDistance) continue;
      nearest = interaction;
      nearestDistance = distance;
    }
    return nearest ? { ...nearest, distance: nearestDistance } : null;
  }

  updateHomeProgress(save = {}) {
    const discovered = Object.values(save.collection ?? {}).filter((entry) => entry?.discovered).length;
    const aquarium = save.progression?.aquarium?.length ?? 0;
    const summits = save.lifetime?.summitCount ?? 0;
    const milestones = [discovered >= 1, discovered >= 12, aquarium >= 1, summits >= 1];
    this.homeTrophies?.forEach((trophy, index) => { trophy.enabled = milestones[index]; });
    this.homeProgressSummary = { discovered, aquarium, summits };
    return this.homeProgressSummary;
  }

  createFracturedRockForm(seed, kind = 'chunk') {
    const vertices = [];
    const countByKind = {
      chunk: 9, spire: 7, blade: 6, lean: 8, wedge: 7, column: 8, needle: 6,
      shelfblade: 7, crooked: 8, shard: 6, hook: 7, knuckle: 10, slab: 8,
      anvil: 8, tooth: 7, fin: 7, bulb: 9, terrace: 8, prow: 7, twist: 8, crouch: 10
    };
    const count = countByKind[kind] ?? 8;
    const topRadiusByKind = {
      chunk: .47, spire: .22, blade: .3, lean: .38, wedge: .34, column: .36, needle: .14,
      shelfblade: .24, crooked: .28, shard: .12, hook: .2, knuckle: .5, slab: .57,
      anvil: .62, tooth: .1, fin: .25, bulb: .56, terrace: .64, prow: .22, twist: .31, crouch: .59
    };
    const bottomRadiusByKind = {
      chunk: .51, spire: .55, blade: .5, lean: .52, wedge: .54, column: .4, needle: .43,
      shelfblade: .58, crooked: .5, shard: .48, hook: .56, knuckle: .47, slab: .61,
      anvil: .42, tooth: .58, fin: .53, bulb: .38, terrace: .59, prow: .61, twist: .5, crouch: .66
    };
    const topRadiusBase = topRadiusByKind[kind] ?? .42;
    const bottomRadiusBase = bottomRadiusByKind[kind] ?? .5;

    for (let ring = 0; ring < 2; ring += 1) {
      for (let index = 0; index < count; index += 1) {
        const angle = index * Math.PI * 2 / count;
        const variation = 1 + ((((index * 7 + ring * 5 + seed * 3) % 11) - 5) * .035);
        const baseRadius = ring ? topRadiusBase : bottomRadiusBase;
        let x = Math.cos(angle) * baseRadius * variation;
        let z = Math.sin(angle) * baseRadius * (.82 + ((index + seed) % 4) * .055) * variation;
        let y = ring ? .39 : -.42;

        if (kind === 'spire') {
          if (ring) {
            x += .08 * Math.sin(seed * 1.7);
            z += .06 * Math.cos(seed * 1.2);
            y += Math.sin(angle * 2 + seed) * .11;
          } else {
            y += Math.sin(angle + seed) * .035;
          }
        } else if (kind === 'blade') {
          z *= ring ? .58 : .72;
          x += ring ? .12 : -.04;
          y += ring ? Math.cos(angle + seed) * .13 : Math.sin(angle) * .025;
        } else if (kind === 'lean') {
          if (ring) {
            x += .17;
            z -= .08;
            y += Math.cos(angle - .4) * .18;
          }
        } else if (kind === 'wedge') {
          // A strongly sloped top makes this a useful grip surface but a bad rest platform.
          y += ring ? Math.cos(angle) * .3 : Math.cos(angle) * .025;
          if (ring) x += .08;
        } else if (kind === 'needle') {
          z *= .7;
          if (ring) {
            x += .12;
            y += Math.cos(angle * 2 + seed) * .16;
          }
        } else if (kind === 'shelfblade') {
          z *= ring ? .44 : .68;
          if (ring) {
            x += .14;
            y += Math.cos(angle - .6) * .25;
          }
        } else if (kind === 'crooked') {
          if (ring) {
            x += .22;
            z += .12;
            y += Math.sin(angle * 2.3 + seed) * .18;
          }
        } else if (kind === 'shard') {
          z *= ring ? .34 : .48;
          if (ring) {
            x += .15;
            y += Math.cos(angle * 2 + seed) * .2;
          }
        } else if (kind === 'hook') {
          z *= .72;
          if (ring) {
            x += .34;
            z -= .16;
            y += Math.sin(angle + seed) * .16;
          }
        } else if (kind === 'knuckle') {
          x *= index % 3 === 0 ? 1.22 : .9;
          z *= index % 2 ? .78 : 1.08;
          if (ring) {
            x += .08;
            y += Math.sin(angle * 3 + seed) * .14;
          }
        } else if (kind === 'slab') {
          z *= .72;
          y = ring ? .23 + Math.cos(angle - .7) * .16 : -.34 + Math.sin(angle * 2 + seed) * .025;
          if (ring) x += .1;
        } else if (kind === 'anvil') {
          z *= ring ? .54 : .82;
          if (ring) {
            x += .22;
            y = .31 + Math.cos(angle - .3) * .11;
          }
        } else if (kind === 'tooth') {
          z *= .76;
          if (ring) {
            x += .18;
            z += .08;
            y = .58 + Math.cos(angle * 2 + seed) * .14;
          }
        } else if (kind === 'fin') {
          z *= ring ? .24 : .42;
          y += ring ? Math.sin(angle + .8) * .24 : Math.sin(angle * 2) * .03;
          if (ring) x += .2;
        } else if (kind === 'bulb') {
          z *= index % 2 ? .84 : 1.04;
          if (ring) {
            x -= .08;
            y = .28 + Math.sin(angle * 3 + seed) * .16;
          }
        } else if (kind === 'terrace') {
          z *= .8;
          y = ring ? .2 + Math.cos(angle) * .08 : -.3 + Math.sin(angle * 2 + seed) * .02;
          if (ring) x += .06;
        } else if (kind === 'prow') {
          z *= ring ? .32 : .58;
          if (ring) {
            x += .36;
            y += Math.cos(angle - .4) * .2;
          }
        } else if (kind === 'twist') {
          if (ring) {
            x += .18 + Math.cos(angle) * .06;
            z += .2 + Math.sin(angle) * .06;
            y += Math.sin(angle * 3 + seed) * .12;
          }
        } else if (kind === 'crouch') {
          x *= index % 3 ? 1.05 : 1.28;
          z *= index % 2 ? .9 : 1.15;
          y = ring ? .18 + Math.sin(angle * 2.5 + seed) * .12 : -.3;
        } else if (kind === 'column') {
          z *= .82;
          y += ring ? Math.sin(angle * 2 + seed) * .12 : Math.sin(angle + seed) * .025;
        } else {
          y += (((index * 5 + seed * 2) % 7) - 3) * .014;
        }
        vertices.push([x, y, z]);
      }
    }

    const bottomCenter = count * 2;
    const topCenter = count * 2 + 1;
    const topCenterY = kind === 'needle' || kind === 'shard' || kind === 'tooth' ? .68
      : kind === 'spire' ? .62 : kind === 'slab' ? .34
        : ['terrace', 'crouch'].includes(kind) ? .27 : kind === 'anvil' ? .36
          : kind === 'shelfblade' ? .45 : kind === 'wedge' ? .43 : kind === 'blade' ? .49 : .5;
    const topCenterX = ['hook', 'prow'].includes(kind) ? .38 : kind === 'knuckle' ? .1
      : kind === 'crooked' ? .23 : kind === 'lean' ? .2
        : kind === 'twist' ? .2 : kind === 'tooth' ? .18
          : kind === 'needle' || kind === 'shard' ? .1 : kind === 'spire' ? .06 : 0;
    const topCenterZ = kind === 'hook' ? -.18 : kind === 'twist' ? .2 : kind === 'lean' ? -.09 : 0;
    vertices.push([-.05 + seed * .009, -.52, .03 - seed * .006]);
    vertices.push([topCenterX, topCenterY, topCenterZ]);

    const triangles = [];
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      triangles.push([index, count + next, next], [index, count + index, count + next]);
      triangles.push([bottomCenter, index, next], [topCenter, count + next, count + index]);
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
    const colors = new Uint8Array((geometry.positions.length / 3) * 4);
    for (let vertex = 0; vertex < geometry.positions.length / 3; vertex += 1) {
      const x = geometry.positions[vertex * 3];
      const y = geometry.positions[vertex * 3 + 1];
      const z = geometry.positions[vertex * 3 + 2];
      const normalY = geometry.normals?.[vertex * 3 + 1] ?? 0;
      const broad = Math.sin((x * 4.7 + z * 3.1 + seed * 1.9) * 2.2) * .08;
      const grain = (stableUnit(`${seed}:${kind}:${vertex}:${Math.round((x + y + z) * 100)}`) - .5) * .1;
      const underside = lerp(.66, 1.02, smoothstep(-.55, .5, normalY));
      const crevice = y < -.18 ? .84 : 1;
      const tone = clamp((.94 + broad + grain) * underside * crevice, .58, 1.08);
      colors[vertex * 4] = Math.round(clamp(tone * 1.01, 0, 1) * 255);
      colors[vertex * 4 + 1] = Math.round(clamp(tone, 0, 1) * 255);
      colors[vertex * 4 + 2] = Math.round(clamp(tone * .96, 0, 1) * 255);
      colors[vertex * 4 + 3] = 255;
    }
    geometry.colors = colors;
    return {
      kind,
      mesh: pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry),
      hull: vertices
    };
  }

  getRockMaterial(baseMaterial, name, position = null) {
    let variants = this.rockMaterialVariants.get(baseMaterial);
    if (!variants) {
      const environments = [
        { factor: 1, cool: 0, warm: 0, green: 0, gloss: 1 },
        { factor: .78, cool: .035, warm: 0, green: 0, gloss: 1.75 },
        { factor: .94, cool: 0, warm: .045, green: -.005, gloss: .88 },
        { factor: .9, cool: .012, warm: 0, green: .035, gloss: .8 },
        { factor: .98, cool: .04, warm: 0, green: 0, gloss: .9 },
        { factor: 1.1, cool: .045, warm: 0, green: 0, gloss: .82 }
      ];
      variants = environments.flatMap((environment, environmentIndex) => (
        [.93, .985, 1.035, 1.085].map((factor, index) => {
          const variant = makeMaterial([
            clamp(baseMaterial.diffuse.r * factor * environment.factor
              - environment.cool * .35 + environment.warm, 0, 1),
            clamp(baseMaterial.diffuse.g * factor * environment.factor
              + environment.cool * .25 + environment.green, 0, 1),
            clamp(baseMaterial.diffuse.b * factor * environment.factor
              + environment.cool - environment.warm * .45, 0, 1)
          ], {
            gloss: clamp(baseMaterial.gloss * environment.gloss * (.84 + index * .1), 0, 1),
            opacity: baseMaterial.opacity,
            emissive: [baseMaterial.emissive.r, baseMaterial.emissive.g, baseMaterial.emissive.b]
          });
          variant.diffuseVertexColor = true;
          variant.vertexColorGamma = false;
          variant.update();
          variant._reelAscentEnvironment = environmentIndex;
          return variant;
        })
      ));
      this.rockMaterialVariants.set(baseMaterial, variants);
    }
    let environmentIndex = 0;
    if (position) {
      const localX = position.x - MOUNTAIN_CENTER.x;
      const localZ = position.z - MOUNTAIN_CENTER.z;
      const angle = (Math.atan2(localZ, localX) * 180 / Math.PI + 360) % 360;
      if (position.y < 4) environmentIndex = 1;
      else if (position.y > CROWN_BASE_HEIGHT) environmentIndex = 5;
      else if (position.y > 105) environmentIndex = 4;
      else if (angle >= 70 && angle <= 155) environmentIndex = 3;
      else if (angle >= 245 && angle <= 345) environmentIndex = 2;
    }
    return variants[environmentIndex * 4 + stableNameHash(name) % 4];
  }

  registerClimbSurface(entity, collider, type, label = entity.name) {
    const climbMaterial = getClimbMaterial(type);
    if (!collider || !climbMaterial.grippable) return;
    this.climbSurfaces.set(collider.handle, {
      collider,
      entity,
      label,
      type: climbMaterial.id,
      material: climbMaterial,
      staminaMultiplier: climbMaterial.staminaMultiplier
    });
  }

  terrainYAtWorldXZ(x, z) {
    const localX = x - MOUNTAIN_CENTER.x;
    const localZ = z - MOUNTAIN_CENTER.z;
    const radius = Math.hypot(localX, localZ);
    let angle = Math.atan2(localZ, localX) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    return terrainHeightAt(angle, radius);
  }

  visibleTerrainYAtWorldXZ(x, z) {
    if (!this.terrainSurface) return this.terrainYAtWorldXZ(x, z);
    const localX = x - MOUNTAIN_CENTER.x;
    const localZ = z - MOUNTAIN_CENTER.z;
    const radius = Math.hypot(localX, localZ);
    if (radius > TERRAIN_OUTER_RADIUS + .75 || radius < TERRAIN_RADII.at(-1) - 1) {
      return this.terrainYAtWorldXZ(x, z);
    }

    const { vertices, ringStarts, segments } = this.terrainSurface;
    const angle = (Math.atan2(localZ, localX) * 180 / Math.PI + 360) % 360;
    const segmentCenter = Math.floor(angle / 360 * segments) % segments;
    let nearestRing = 0;
    let nearestDistance = Infinity;
    for (let ring = 0; ring < TERRAIN_RADII.length; ring += 1) {
      const distance = Math.abs(TERRAIN_RADII[ring] - radius);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestRing = ring;
      }
    }

    const triangleHeight = (a, b, c) => {
      const denominator = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
      if (Math.abs(denominator) < 1e-8) return null;
      const u = ((b[2] - c[2]) * (localX - c[0]) + (c[0] - b[0]) * (localZ - c[2])) / denominator;
      const v = ((c[2] - a[2]) * (localX - c[0]) + (a[0] - c[0]) * (localZ - c[2])) / denominator;
      const w = 1 - u - v;
      if (u < -1e-5 || v < -1e-5 || w < -1e-5) return null;
      return u * a[1] + v * b[1] + w * c[1];
    };
    const vertexAt = (ring, segment) => vertices[ringStarts[ring] + ((segment % segments) + segments) % segments];

    for (let ring = Math.max(0, nearestRing - 3); ring <= Math.min(TERRAIN_RADII.length - 2, nearestRing + 2); ring += 1) {
      for (let offset = -2; offset <= 2; offset += 1) {
        const segment = (segmentCenter + offset + segments) % segments;
        const next = (segment + 1) % segments;
        const outer = vertexAt(ring, segment);
        const outerNext = vertexAt(ring, next);
        const inner = vertexAt(ring + 1, segment);
        const innerNext = vertexAt(ring + 1, next);
        const candidates = (ring + segment) % 2
          ? [[outer, inner, innerNext], [outer, innerNext, outerNext]]
          : [[outer, inner, outerNext], [outerNext, inner, innerNext]];
        for (const triangle of candidates) {
          const y = triangleHeight(...triangle);
          if (y !== null) return y;
        }
      }
    }
    return this.terrainYAtWorldXZ(x, z);
  }

  crownVisibleRadiusAt(angle, y) {
    if (!this.crownSideTriangles?.length) return this.crownRadiusAtHeight(y);
    const radians = degreesToRadians(angle);
    const direction = { x: Math.cos(radians), y: 0, z: Math.sin(radians) };
    const origin = { x: 0, y, z: 0 };
    let nearest = Infinity;
    const cross = (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    });
    const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const subtract = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

    for (const triangle of this.crownSideTriangles) {
      const a = { x: triangle[0][0], y: triangle[0][1], z: triangle[0][2] };
      const b = { x: triangle[1][0], y: triangle[1][1], z: triangle[1][2] };
      const c = { x: triangle[2][0], y: triangle[2][1], z: triangle[2][2] };
      const edge1 = subtract(b, a);
      const edge2 = subtract(c, a);
      const h = cross(direction, edge2);
      const determinant = dot(edge1, h);
      if (Math.abs(determinant) < 1e-8) continue;
      const inverse = 1 / determinant;
      const s = subtract(origin, a);
      const u = inverse * dot(s, h);
      if (u < -1e-6 || u > 1 + 1e-6) continue;
      const q = cross(s, edge1);
      const v = inverse * dot(direction, q);
      if (v < -1e-6 || u + v > 1 + 1e-6) continue;
      const distance = inverse * dot(edge2, q);
      if (distance >= 0 && distance < nearest) nearest = distance;
    }
    return Number.isFinite(nearest) ? nearest : this.crownRadiusAtHeight(y);
  }

  ensureRockCoreContact(position, size, quaternion, form, options = {}) {
    if (options.solid === false || options.ensureCoreContact === false) {
      return { position: { ...position }, support: { supported: true, contactCount: 0 }, exposure: null };
    }
    const grounded = { ...position };
    const rotate = (x, y, z) => {
      const qx = quaternion.x; const qy = quaternion.y; const qz = quaternion.z; const qw = quaternion.w;
      const tx = 2 * (qy * z - qz * y);
      const ty = 2 * (qz * x - qx * z);
      const tz = 2 * (qx * y - qy * x);
      return {
        x: x + qw * tx + (qy * tz - qz * ty),
        y: y + qw * ty + (qz * tx - qx * tz),
        z: z + qw * tz + (qx * ty - qy * tx)
      };
    };
    // These are the exact final-scale/final-rotation hull vertices used by the convex
    // collider. Grounding therefore evaluates the same transformed rock the player sees.
    const localVertices = form.hull.map((vertex) => rotate(
      vertex[0] * size.x, vertex[1] * size.y, vertex[2] * size.z
    ));
    const verticalSpan = Math.max(...localVertices.map((vertex) => vertex.y))
      - Math.min(...localVertices.map((vertex) => vertex.y));
    const centerX = position.x - MOUNTAIN_CENTER.x;
    const centerZ = position.z - MOUNTAIN_CENTER.z;
    const centerRadius = Math.max(.0001, Math.hypot(centerX, centerZ));
    const radialUnit = { x: centerX / centerRadius, z: centerZ / centerRadius };
    const radialProjections = localVertices.map((vertex) => vertex.x * radialUnit.x + vertex.z * radialUnit.z);
    const radialSpan = Math.max(...radialProjections) - Math.min(...radialProjections);

    const usingCrownShell = Boolean(this.crownSideTriangles?.length) && position.y >= CROWN_BASE_HEIGHT - 3;
    const desiredOverlap = usingCrownShell
      ? clamp(radialSpan * .28, .32, 2.6)
      : clamp(Math.min(size.x, size.y, size.z) * .14 + verticalSpan * .015, .2, .82);

    const crownGapsAt = (candidate) => localVertices.flatMap((vertex) => {
      const worldY = candidate.y + vertex.y;
      if (worldY < CROWN_BASE_HEIGHT - 4 || worldY > SUMMIT_HEIGHT + 1.5) return [];
      const worldX = candidate.x + vertex.x;
      const worldZ = candidate.z + vertex.z;
      let angle = Math.atan2(worldZ - MOUNTAIN_CENTER.z, worldX - MOUNTAIN_CENTER.x) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      const actualShellRadius = this.crownVisibleRadiusAt(angle, worldY);
      return [Math.hypot(worldX - MOUNTAIN_CENTER.x, worldZ - MOUNTAIN_CENTER.z) - actualShellRadius];
    });
    const terrainClearancesAt = (candidate) => localVertices.map((vertex) => {
      const worldX = candidate.x + vertex.x;
      const worldY = candidate.y + vertex.y;
      const worldZ = candidate.z + vertex.z;
      return worldY - this.visibleTerrainYAtWorldXZ(worldX, worldZ);
    });
    const exposureFrom = (clearances) => ({
      maximum: Math.max(...clearances),
      visibleFraction: clearances.filter((clearance) => clearance > .06).length / Math.max(1, clearances.length)
    });

    if (usingCrownShell) {
      let support = supportAdjustment(crownGapsAt(grounded), desiredOverlap, 3);
      for (let attempt = 0; attempt < 5 && !support.supported; attempt += 1) {
        const adjustment = Math.max(support.adjustment, desiredOverlap * .28);
        const currentX = grounded.x - MOUNTAIN_CENTER.x;
        const currentZ = grounded.z - MOUNTAIN_CENTER.z;
        const currentRadius = Math.max(.0001, Math.hypot(currentX, currentZ));
        grounded.x -= currentX / currentRadius * adjustment;
        grounded.z -= currentZ / currentRadius * adjustment;
        support = supportAdjustment(crownGapsAt(grounded), desiredOverlap, 3);
      }
      return { position: grounded, support, exposure: exposureFrom(crownGapsAt(grounded)) };
    }

    let support = supportAdjustment(terrainClearancesAt(grounded), desiredOverlap, 3);
    for (let attempt = 0; attempt < 4 && !support.supported; attempt += 1) {
      grounded.y -= Math.max(support.adjustment, desiredOverlap * .22);
      support = supportAdjustment(terrainClearancesAt(grounded), desiredOverlap, 3);
    }
    return { position: grounded, support, exposure: exposureFrom(terrainClearancesAt(grounded)) };
  }

  addNaturalRock(name, position, size, material, rotation = {}, options = {}) {
    const eligibleForms = options.formKind
      ? this.fracturedRockForms.filter((candidate) => candidate.kind === options.formKind)
      : this.fracturedRockForms;
    const pool = eligibleForms.length ? eligibleForms : this.fracturedRockForms;
    const form = pool[stableNameHash(name) % pool.length];
    const quaternion = new pc.Quat().setFromEulerAngles(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0);
    const placement = this.ensureRockCoreContact(position, size, quaternion, form, options);
    const groundedPosition = placement.position;
    if (options.solid !== false && !placement.support.supported) {
      this.rejectedRocks.push(name);
      return null;
    }
    if (options.solid !== false && !options.allowDeepEmbed && placement.exposure
      && (placement.exposure.maximum < .14 || placement.exposure.visibleFraction < .1)) {
      this.rejectedRocks.push(`${name} (buried)`);
      return null;
    }
    if (options.solid !== false && !options.allowRockOverlap) {
      const candidateRadius = Math.hypot(size.x, size.y, size.z) * .5;
      const swallowed = this.rockPlacements.some((rock) => {
        const existingRadius = Math.hypot(rock.size.x, rock.size.y, rock.size.z) * .5;
        if (candidateRadius > existingRadius * 1.08) return false;
        const distance = Math.hypot(
          groundedPosition.x - rock.position.x,
          groundedPosition.y - rock.position.y,
          groundedPosition.z - rock.position.z
        );
        return distance + candidateRadius * .9 < existingRadius * .98;
      });
      if (swallowed) {
        this.rejectedRocks.push(`${name} (inside rock)`);
        return null;
      }
    }
    const entity = new pc.Entity(name);
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(form.mesh, this.getRockMaterial(material, name, groundedPosition), entity)];
    entity.render.castShadows = options.castShadows ?? false;
    entity.setPosition(groundedPosition.x, groundedPosition.y, groundedPosition.z);
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
    if (!colliderDesc) {
      entity.destroy();
      this.rejectedRocks.push(`${name} (invalid collider hull)`);
      return null;
    }
    colliderDesc
      .setTranslation(groundedPosition.x, groundedPosition.y, groundedPosition.z)
      .setRotation({ x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w })
      .setFriction(.9)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(colliderDesc);
    let climbMaterial = options.climbMaterial;
    if (climbMaterial === undefined && options.climbable !== false && options.decorative !== true) {
      if (material === this.materials.unclimbable) climbMaterial = 'ungrippable';
      else if (material === this.materials.roughRock || material === this.materials.holdRough) climbMaterial = 'rough';
      else if (material === this.materials.smoothRock || material === this.materials.wetRock || material === this.materials.holdSmooth) climbMaterial = 'smooth';
      else if (material === this.materials.ice || material === this.materials.holdIce) climbMaterial = 'ice';
      else climbMaterial = 'normal';
    }
    if (climbMaterial) this.registerClimbSurface(entity, entity.physicsCollider, climbMaterial);
    const localX = groundedPosition.x - MOUNTAIN_CENTER.x;
    const localZ = groundedPosition.z - MOUNTAIN_CENTER.z;
    let angle = Math.atan2(localZ, localX) * 180 / Math.PI;
    if (angle < 0) angle += 360;
    this.rockPlacements.push({
      name,
      entity,
      position: { ...groundedPosition },
      size: { ...size },
      radius: Math.hypot(localX, localZ),
      angle,
      crown: groundedPosition.y >= CROWN_BASE_HEIGHT - 3,
      supported: placement.support.supported,
      contactCount: placement.support.contactCount,
      maximumExposure: placement.exposure?.maximum ?? null,
      visibleFraction: placement.exposure?.visibleFraction ?? null,
      supportKind: 'mountain-core',
      climbMaterial: climbMaterial ?? null,
      grippable: Boolean(this.climbSurfaces.get(entity.physicsCollider.handle))
    });
    return entity;
  }

  addRadialRock(name, angle, radius, y, size, material, options = {}) {
    const position = this.point(angle, radius, y, options.tangentOffset ?? 0);
    const rotation = {
      x: options.pitch ?? 0,
      y: inwardYaw(angle) + (options.yawOffset ?? 0),
      z: options.roll ?? 0
    };
    return this.addNaturalRock(name, position, size, material, rotation, options);
  }

  addMountainBoulder(name, position, scale, material = this.materials.rock, options = {}) {
    const rotation = {
      x: ((position.x * 17) % 30) - 8,
      y: (position.z * 23) % 180,
      z: ((position.z * 11) % 26) - 7
    };
    return this.addNaturalRock(name, position, scale, material, rotation, options);
  }

  materialForClimb(type) {
    if (type === 'rough') return this.materials.roughRock;
    if (type === 'smooth') return this.materials.smoothRock;
    if (type === 'ice') return this.materials.ice;
    if (type === 'ungrippable') return this.materials.unclimbable;
    return this.materials.normalRock;
  }

  holdMaterial(type) {
    return this.materials[`hold${type[0].toUpperCase()}${type.slice(1)}`] ?? this.materials.holdNormal;
  }

  addClimbFace(name, angle, radius, height, width, type, tangentOffset = 0, tilt = 0) {
    const ground = this.terrainY(angle, radius);
    const bottom = ground - .35;
    const face = this.addRadialRock(name, angle, radius, bottom + height / 2,
      { x: width, y: height, z: 1.55 }, this.materialForClimb(type), {
        climbMaterial: type,
        tangentOffset,
        pitch: tilt
      });
    const counts = { rough: 5, normal: 4, smooth: 2, ice: 4 };
    const count = counts[type] ?? 3;
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / 2);
      const side = index % 2 ? 1 : -1;
      const holdY = bottom + height * (.18 + (row + .45) / (Math.ceil(count / 2) + .35) * .68);
      const holdWidth = type === 'rough' ? .72 : type === 'normal' ? .5 : .36;
      this.addRadialRock(`${name} readable hold ${index + 1}`, angle, radius + .88, holdY,
        { x: holdWidth, y: type === 'ice' ? .58 : .26, z: type === 'smooth' ? .12 : .3 },
        this.holdMaterial(type), {
          tangentOffset: tangentOffset + side * width * (.2 + row * .05),
          roll: type === 'ice' ? side * 22 : side * 7,
          solid: false
        });
    }
    this.addRadialRock(`${name} crack`, angle, radius + .9, bottom + height * .5,
      { x: .18, y: Math.min(2.8, height * .32), z: .08 }, this.materials.rockCrack, {
        tangentOffset: tangentOffset - width * .13,
        roll: 11,
        solid: false
      });
    return face;
  }

  buildWadeableOceanShelf() {
    // The rendered seabed continues far offshore, but its triangles are joined to the
    // mountain's triangles in one Rapier collider below. A shared boundary with one support
    // owner removes the alternating-contact jitter that two overlapping floor colliders made.
    const innerRadius = TERRAIN_OUTER_RADIUS;
    const waterEdge = OCEAN_WATER_INNER_RADIUS;
    const outerRadius = OCEAN_FLOOR_OUTER_RADIUS;
    const ringRadii = [innerRadius, OCEAN_SEABED_JOIN_RADIUS + 2.5, waterEdge];
    for (let radius = waterEdge + 5; radius < outerRadius; radius += 5) ringRadii.push(radius);
    ringRadii.push(outerRadius);
    const vertices = [];
    const ringStarts = [];
    const segments = TERRAIN_SEGMENTS;

    for (let ringIndex = 0; ringIndex < ringRadii.length; ringIndex += 1) {
      ringStarts.push(vertices.length);
      const radius = ringRadii[ringIndex];
      const outward = clamp((radius - waterEdge) / Math.max(.001, outerRadius - waterEdge), 0, 1);
      for (let segment = 0; segment < segments; segment += 1) {
        const angle = segment * 360 / segments;
        const radians = degreesToRadians(angle);
        const terrainJoin = terrainHeightAt(angle, innerRadius);
        const shorelineY = Math.min(-.28, terrainJoin);
        const floorY = ringIndex === 0
          ? terrainJoin
          : oceanFloorHeightAt(radius, shorelineY)
            + Math.sin(degreesToRadians(angle * 4 + radius * .75)) * .06 * outward;
        vertices.push([Math.cos(radians) * radius, floorY, Math.sin(radians) * radius]);
      }
    }

    const triangles = [];
    for (let ring = 0; ring < ringRadii.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const next = (segment + 1) % segments;
        const outer = ringStarts[ring] + segment;
        const outerNext = ringStarts[ring] + next;
        const inner = ringStarts[ring + 1] + segment;
        const innerNext = ringStarts[ring + 1] + next;
        // ringRadii grow outward, so wind opposite the mountain mesh to keep normals upward.
        triangles.push([outer, outerNext, inner], [outerNext, innerNext, inner]);
      }
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
    const entity = new pc.Entity('Extended walkable ocean floor');
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, this.materials.sand, entity)];
    entity.render.castShadows = false;
    entity.setPosition(MOUNTAIN_CENTER.x, 0, MOUNTAIN_CENTER.z);
    this.buildTarget.addChild(entity);

    this.oceanFloorSurface = { vertices, triangles };
    this.oceanWadingShelf = entity;
  }

  buildOceanAndContinuousTerrain() {
    // The old transparent cylinder was a full 760 m disk, so it remained rendered under
    // the entire island and fought the beach/shore in the transparency pass. Render the
    // same offshore water as a real annulus whose dry center matches the fishing/ecology
    // boundary. It no longer exists underneath the mountain at all.
    const waterVertices = [];
    const waterTriangles = [];
    for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
      const radians = degreesToRadians(segment * 360 / TERRAIN_SEGMENTS);
      for (const radius of [OCEAN_VISUAL_OUTER_RADIUS, OCEAN_WATER_INNER_RADIUS]) {
        waterVertices.push([Math.cos(radians) * radius, 0, Math.sin(radians) * radius]);
      }
    }
    for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
      const next = (segment + 1) % TERRAIN_SEGMENTS;
      const outer = segment * 2;
      const inner = outer + 1;
      const outerNext = next * 2;
      const innerNext = outerNext + 1;
      waterTriangles.push([outer, inner, outerNext], [outerNext, inner, innerNext]);
    }
    const waterGeometry = new pc.Geometry();
    waterGeometry.positions = waterVertices.flat();
    waterGeometry.indices = waterTriangles.flat();
    waterGeometry.calculateNormals();
    const waterMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, waterGeometry);
    this.ocean = new pc.Entity('Outer ocean annular surface');
    this.ocean.addComponent('render');
    this.ocean.render.meshInstances = [new pc.MeshInstance(waterMesh, this.materials.deepWater, this.ocean)];
    this.ocean.render.castShadows = false;
    this.ocean.setPosition(MOUNTAIN_CENTER.x, OCEAN_SURFACE_Y - .06, MOUNTAIN_CENTER.z);
    this.buildTarget.addChild(this.ocean);
    this.buildWadeableOceanShelf();

    const vertices = [];
    const ringStarts = [];
    for (let ringIndex = 0; ringIndex < TERRAIN_RADII.length; ringIndex += 1) {
      ringStarts.push(vertices.length);
      const nominalRadius = TERRAIN_RADII[ringIndex];
      for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
        const angle = segment * 360 / TERRAIN_SEGMENTS;
        const boundaryFade = ringIndex < 4 ? (4 - ringIndex) / 4 : 0;
        const jitter = ringIndex === 0
          ? 0
          : Math.sin(degreesToRadians(segment * 37 + ringIndex * 19)) * (.55 + boundaryFade * .35);
        const radius = nominalRadius + jitter;
        const y = terrainHeightAt(angle, radius)
          + (ringIndex > 3 ? Math.sin(degreesToRadians(segment * 51 + ringIndex * 23)) * .11 : 0);
        const radians = degreesToRadians(angle);
        vertices.push([Math.cos(radians) * radius, y, Math.sin(radians) * radius]);
      }
    }

    const triangles = [];
    for (let ring = 0; ring < TERRAIN_RADII.length - 1; ring += 1) {
      for (let segment = 0; segment < TERRAIN_SEGMENTS; segment += 1) {
        const next = (segment + 1) % TERRAIN_SEGMENTS;
        const outer = ringStarts[ring] + segment;
        const outerNext = ringStarts[ring] + next;
        const inner = ringStarts[ring + 1] + segment;
        const innerNext = ringStarts[ring + 1] + next;
        // Winding is intentionally upward-facing for the continuous surface.
        if ((ring + segment) % 2) {
          triangles.push([outer, inner, innerNext], [outer, innerNext, outerNext]);
        } else {
          triangles.push([outer, inner, outerNext], [outerNext, inner, innerNext]);
        }
      }
    }
    const visibleTriangles = triangles.filter((triangle) => {
      const a = vertices[triangle[0]];
      const b = vertices[triangle[1]];
      const c = vertices[triangle[2]];
      return !triangleIntersectsCaveEntrance(a, b, c);
    });

    const geometry = new pc.Geometry();
    geometry.positions = [];
    geometry.indices = [];
    for (const triangle of visibleTriangles) {
      for (const vertexIndex of triangle) {
        geometry.positions.push(...vertices[vertexIndex]);
        geometry.indices.push(geometry.indices.length);
      }
    }
    geometry.calculateNormals();
    const mesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, geometry);
    const entity = new pc.Entity('Continuous irregular mountain body');
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, this.materials.alpine, entity)];
    entity.render.castShadows = false;
    entity.setPosition(MOUNTAIN_CENTER.x, 0, MOUNTAIN_CENTER.z);
    this.buildTarget.addChild(entity);

    const seabedVertices = this.oceanFloorSurface?.vertices ?? [];
    const seabedTriangles = this.oceanFloorSurface?.triangles ?? [];
    const collisionVertices = [...vertices, ...seabedVertices.slice(TERRAIN_SEGMENTS)];
    const collisionTriangles = [
      ...visibleTriangles,
      ...seabedTriangles.map((triangle) => triangle.map((index) => (
        index < TERRAIN_SEGMENTS
          ? ringStarts[0] + index
          : vertices.length + index - TERRAIN_SEGMENTS
      )))
    ];
    const colliderDesc = this.RAPIER.ColliderDesc.trimesh(
      new Float32Array(collisionVertices.flat()),
      new Uint32Array(collisionTriangles.flat())
    )
      .setTranslation(MOUNTAIN_CENTER.x, 0, MOUNTAIN_CENTER.z)
      .setFriction(.94)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(colliderDesc);
    // Keep the exact rendered/collision mesh available for rock grounding. The authored
    // terrain function is only the source used to build this triangulation; radial and
    // vertical vertex jitter means it is not itself the final visible surface.
    this.terrainSurface = { vertices, ringStarts, segments: TERRAIN_SEGMENTS };
    // Deliberately NOT registered as a climb surface. Off-route mountain faces are
    // terrain, not a universal Grip shortcut; authored route rocks carry climb metadata.
  }

  buildStarts() {
    const floorMaterials = [
      this.materials.sand,
      this.materials.coast,
      this.materials.forestFloor,
      this.materials.wetRock,
      this.materials.coast,
      this.materials.sand
    ];
    START_LOCATIONS.forEach((start, index) => {
      // Broad, low faceted pads are embedded through the coastal mesh rather than floating above it.
      this.addRadialRock(`${start.label} safe start shelf`, start.angle, 204, -.12,
        { x: 15, y: .55, z: 10 }, floorMaterials[index], {
          tangentOffset: 0,
          pitch: index % 2 ? 2 : -2,
          roll: index % 3 ? 1 : -1
        });
      this.addRadialRock(`${start.label} inward trail marker`, start.angle, 198, .35,
        { x: 1.8, y: 1.15, z: 1.8 }, this.materials.flowers, {
          tangentOffset: index % 2 ? -5.5 : 5.5,
          solid: false
        });
      for (let stone = 0; stone < 3; stone += 1) {
        const point = this.point(start.angle, 208 + stone * 1.1, .05 + stone * .17, (stone - 1) * 4.4);
        this.addMountainBoulder(`${start.label} shore marker ${stone + 1}`, point,
          { x: 1.6 + stone * .35, y: 1.0 + (stone % 2) * .42, z: 1.8 },
          index % 2 ? this.materials.coast : this.materials.waterEdge);
      }
    });
  }

  buildRouteFamily(route) {
    // Retained as a compatibility helper for older tooling. V2.6 does not call this;
    // ascent geometry is generated by buildContinuousClimbWeb().
    route.features?.forEach((feature, index) => this.buildRouteFeature(route, feature, index));
  }

  buildContinuousClimbWeb() {
    // Route density now follows circumference instead of cloning one angle list through
    // every altitude: 50 lower, 42 middle, 34 alpine. Each layer has a different phase
    // and deterministic jitter, so lower lines split/recombine into a broad web instead
    // of continuing upward as obvious full-height radial lanes.
    CLIMB_WEB_LAYERS.forEach((layer) => {
      layer.angles.forEach((baseAngle, columnIndex) => {
        this.buildEscarpmentWebPatch(baseAngle, layer.gateIndex, columnIndex);
      });
    });
    this.buildShelfScrambleWeb();
  }

  buildEscarpmentWebPatch(baseAngle, gateIndex, columnIndex) {
    const gate = ESCARPMENTS[gateIndex];
    const angleDrift = Math.sin(degreesToRadians(baseAngle * 2.1 + gateIndex * 79)) * 2.6
      + Math.sin(degreesToRadians(baseAngle * 5.3 - gateIndex * 31)) * 0.8;
    const angle = (baseAngle + angleDrift + 360) % 360;
    const difficulty = climbDifficultyAt(angle, gateIndex);
    const centerRadius = escarpmentRadiusAt(gate, angle);
    const outerRadius = centerRadius + gate.width * .79 + 2.4;
    const innerRadius = centerRadius - gate.width * .79 - 2.5;
    const outerY = this.terrainY(angle, outerRadius);
    const innerY = this.terrainY(angle, innerRadius);
    const stageCount = gateIndex === 0 ? 12 : gateIndex === 1 ? 13 : 14;
    const routeSide = ((columnIndex + gateIndex) % 2) ? 1 : -1;
    const lateralScale = 3.0 + difficulty * 1.8;
    const tangentPattern = [0, -1.0, -2.0, -2.15, -1.15, .15, 1.45, 2.3, 2.05, .8, -.55, -1.8, -2.25, -.75];
    const angularPattern = [0, .35, .9, 1.45, 1.75, 1.35, .65, -.15, -.85, -1.5, -1.75, -1.1, -.35, .45];
    // Two near-flat progress intervals force a traverse before the next meaningful rise.
    const verticalPattern = [.045, .13, .21, .27, .31, .405, .5, .555, .61, .705, .79, .855, .925, .985];
    const baseTangent = Math.sin(degreesToRadians(baseAngle * 7 + gateIndex * 53)) * 1.4;
    const label = `${gate.id} open face ${columnIndex + 1}`;

    const entryMaterial = chooseClimbMaterial(gateIndex, angle, -1, columnIndex);
    const entryPoint = this.point(angle, outerRadius + .15, outerY + .62, baseTangent);
    this.addMountainBoulder(`${label} entry`, entryPoint,
      { x: 3.8 - difficulty * .35, y: 1.7 + difficulty * .25, z: 3.15 },
      this.materialForClimb(entryMaterial), { climbMaterial: entryMaterial, formKind: 'wedge' });

    let lastTangent = baseTangent;
    let lastAngle = angle;
    for (let stage = 0; stage < stageCount; stage += 1) {
      const t = verticalPattern[stage] ?? ((stage + .65) / stageCount);
      const stageAngle = angle
        + angularPattern[stage % angularPattern.length] * routeSide * (1.05 + difficulty * .38)
        + Math.sin((stage + columnIndex) * 1.19) * .18;
      lastAngle = stageAngle;
      const targetY = lerp(outerY, innerY, t);
      const radius = this.findRouteRadiusForHeight(stageAngle, outerRadius, innerRadius, targetY);
      const localGround = this.terrainY(stageAngle, radius);
      const tangent = baseTangent
        + tangentPattern[stage % tangentPattern.length] * lateralScale * routeSide
        + Math.sin((stage + columnIndex) * 1.31) * .5;
      lastTangent = tangent;
      const materialType = chooseClimbMaterial(gateIndex, stageAngle, stage, columnIndex,
        gateIndex === 2 ? .055 : 0);
      const isTall = ((stage + columnIndex * 2 + gateIndex) % 5 === 1)
        || (gateIndex >= 1 && stage === 5 && columnIndex % 3 !== 0);
      const formSequence = [
        'spire', 'blade', 'wedge', 'lean', 'needle', 'crooked', 'shelfblade',
        'column', 'hook', 'shard', 'knuckle'
      ];
      const formKind = isTall ? (((stage + columnIndex) % 2) ? 'column' : 'spire')
        : formSequence[(stage + columnIndex + gateIndex * 2) % formSequence.length];
      const hardShrink = difficulty * .42;
      const height = isTall
        ? 5.6 + gateIndex * .6 + difficulty * 1.45 + (stage % 2) * .75
        : 2.35 + (stage % 4) * .36 + difficulty * .4;
      const width = (isTall ? 2.7 : 3.35) - hardShrink + ((stage + 1) % 2) * .3;
      const depth = (isTall ? 2.05 : 2.65) - difficulty * .18 + (stage % 2) * .28;
      // Route pieces are oriented along the mountainside rather than standing like
      // fence posts. Their centers sit on/in the terrain so every piece intersects the
      // core slightly instead of visibly floating off the face.
      const slopeLean = isTall
        ? -(18 + gateIndex * 2.5 + difficulty * 4.5)
        : -(7 + gateIndex * 1.5 + difficulty * 2.5);
      this.addRadialRock(`${label} climb rock ${stage + 1}`, stageAngle, radius - .18,
        localGround + height * (isTall ? .34 : .28),
        { x: width, y: height, z: depth }, this.materialForClimb(materialType), {
          tangentOffset: tangent,
          pitch: slopeLean,
          roll: routeSide * ((stage % 3) - 1) * 5,
          climbMaterial: materialType,
          formKind
        });

      // Instead of a branch that simply points upward, add a short same-height traverse.
      // The next vertical gain is offset from it, so the player has to move laterally.
      if (stage === 2 || stage === 5 || stage === 8 || (gateIndex >= 1 && stage === 11)) {
        const branchSide = ((columnIndex + stage + gateIndex) % 2) ? 1 : -1;
        for (let branchStep = 0; branchStep < 2; branchStep += 1) {
          const branchOffset = branchSide * (2.7 + branchStep * 2.25 + difficulty * .45);
          const branchAngle = stageAngle + branchSide * (.28 + branchStep * .3);
          const branchType = chooseClimbMaterial(gateIndex, branchAngle, stage,
            columnIndex + 91 + branchStep, gateIndex === 2 ? .06 : 0);
          this.addRadialRock(`${label} lateral traverse ${stage + 1}-${branchStep + 1}`, branchAngle,
            radius - .24 - .08 * branchStep, localGround + .72 + branchStep * .16,
            { x: 2.55 - difficulty * .16, y: 2.15 + difficulty * .45, z: 2.2 },
            this.materialForClimb(branchType), {
              tangentOffset: tangent + branchOffset,
              pitch: -(8 + gateIndex * 2),
              roll: branchSide * 7,
              climbMaterial: branchType,
              formKind: branchStep ? 'shelfblade' : 'wedge'
            });
        }
      }

      // Real stamina-reset platforms are intentionally uncommon. Most climb rocks have
      // pointed/slanted tops, so stopping on top is not the default rhythm of every line.
      const addRest = stage === 4
        && columnIndex % (gateIndex === 0 ? 3 : 4) === (gateIndex % (gateIndex === 0 ? 3 : 4))
        && difficulty < (gateIndex === 2 ? .55 : .72);
      if (addRest) {
        const ledgeType = difficulty > .6 ? 'normal' : 'rough';
        this.addRadialRock(`${label} rare rest ledge`, stageAngle, radius - .35,
          localGround + .82,
          { x: 3.2 - difficulty * .3, y: .62, z: 2.05 }, this.materialForClimb(ledgeType), {
            tangentOffset: tangent + routeSide * .75,
            pitch: 2,
            roll: routeSide * -4,
            climbMaterial: ledgeType,
            formKind: 'chunk'
          });
      }

      if (gateIndex >= 1 && difficulty > .58 && stage === (gateIndex === 2 ? 5 : 4)
          && stableUnit(`${label}:blank`) < .58) {
        const side = columnIndex % 2 ? 1 : -1;
        this.addRadialRock(`${label} hard blank face`, stageAngle, radius + .25,
          localGround + 2.25,
          { x: 2.75, y: 4.8 + difficulty * 1.1, z: 1.7 }, this.materialForClimb('ungrippable'), {
            tangentOffset: tangent + side * 4.2,
            pitch: -7,
            roll: side * 8,
            climbMaterial: 'ungrippable',
            formKind: 'blade'
          });
      }
    }

    const exitRadius = innerRadius - .45;
    const exitGround = this.terrainY(lastAngle, exitRadius);
    const exitType = difficulty > .72 ? 'normal' : 'rough';
    this.addRadialRock(`${label} upper exit`, lastAngle, exitRadius, exitGround + .43,
      { x: 3.75 - difficulty * .32, y: .76, z: 2.6 }, this.materialForClimb(exitType), {
        tangentOffset: lastTangent * .65,
        pitch: 3,
        roll: routeSide * -5,
        climbMaterial: exitType,
        formKind: 'chunk'
      });
  }

  buildShelfScrambleWeb() {
    // Shelf formations are deliberately lateral: they invite traversing across the face
    // and changing lines instead of reinforcing a stack of vertical cylinders.
    const bands = [
      { radius: 166, level: 0, phase: 2 },
      { radius: 122, level: 1, phase: 7 },
      { radius: 83, level: 2, phase: 3 },
      { radius: 51, level: 2, phase: 10 }
    ];
    const lateralForms = ['wedge', 'blade', 'spire', 'lean', 'hook', 'knuckle'];
    bands.forEach((band, bandIndex) => {
      for (let baseAngle = band.phase; baseAngle < 360 + band.phase; baseAngle += 9) {
        const angle = baseAngle % 360;
        const difficulty = climbDifficultyAt(angle, band.level);
        const side = ((Math.round(baseAngle / 9) + bandIndex) % 2) ? 1 : -1;
        for (let step = 0; step < 4; step += 1) {
          const stepAngle = angle + side * (step - 1) * (.38 + difficulty * .14);
          const radius = band.radius - step * (.7 + difficulty * .2);
          const ground = this.terrainY(stepAngle, radius);
          const tangent = side * ((step - 1.5) * (2.15 + difficulty * .5))
            + Math.sin(degreesToRadians(angle * 4 + bandIndex * 47)) * .7;
          const type = chooseClimbMaterial(band.level, stepAngle, step, bandIndex + 211,
            band.level >= 2 ? .04 : 0);
          const tall = step === 1 && ((Math.round(angle) + bandIndex) % 4 === 0);
          this.addRadialRock(`shelf traverse ${bandIndex + 1}-${Math.round(angle)}-${step + 1}`,
            stepAngle, radius - .16, ground + (tall ? 1.45 : .68) + difficulty * .12,
            { x: tall ? 2.35 : 2.7 - difficulty * .2, y: tall ? 5.1 : 1.9 + difficulty * .42, z: 2.18 },
            this.materialForClimb(type), {
              tangentOffset: tangent,
              pitch: tall ? -(20 + difficulty * 5) : -7,
              roll: side * (step % 2 ? 6 : -5),
              climbMaterial: type,
              formKind: tall ? ((bandIndex + step) % 2 ? 'crooked' : 'needle')
                : lateralForms[(step + bandIndex) % lateralForms.length]
            });
        }
        if (band.level >= 2 && difficulty > .68 && stableUnit(`shelf:${bandIndex}:${angle}`) < .42) {
          this.addRadialRock(`shelf web hard slab ${bandIndex + 1}-${Math.round(angle)}`, angle,
            band.radius - 1.4, this.terrainY(angle, band.radius - 1.4) + 2.05,
            { x: 3.1, y: 4.5, z: 1.45 }, this.materialForClimb('smooth'), {
              tangentOffset: side * (3.0 + difficulty * .5),
              pitch: -9,
              roll: side * 11,
              climbMaterial: 'smooth',
              formKind: 'blade'
            });
        }
      }
    });
  }

  findRouteRadiusForHeight(angle, outerRadius, innerRadius, targetY) {
    // The escarpment profile is locally monotonic but faceted. A short deterministic
    // sample is more robust than assuming an analytic inverse, and this runs only once
    // while constructing the static world.
    let bestRadius = outerRadius;
    let bestDelta = Infinity;
    const samples = 40;
    for (let sample = 0; sample <= samples; sample += 1) {
      const t = sample / samples;
      const radius = lerp(outerRadius, innerRadius, t);
      const delta = Math.abs(this.terrainY(angle, radius) - targetY);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestRadius = radius;
      }
    }
    return bestRadius;
  }

  buildEscarpmentScramble(route, feature, prefix, angle, chimneyStyle = false) {
    const gate = ESCARPMENTS[feature.gateIndex] ?? ESCARPMENTS.reduce((best, candidate) => {
      const distance = Math.abs(escarpmentRadiusAt(candidate, angle) - feature.radius);
      return !best || distance < best.distance ? { gate: candidate, distance } : best;
    }, null)?.gate;
    if (!gate) return;

    const centerRadius = feature.gateCenterRadius ?? escarpmentRadiusAt(gate, angle);
    const outerRadius = centerRadius + gate.width * .78 + 2.25;
    const innerRadius = centerRadius - gate.width * .78 - 2.35;
    const outerY = this.terrainY(angle, outerRadius);
    const innerY = this.terrainY(angle, innerRadius);
    const stageCount = feature.gateIndex === 2 ? 9 : 8;
    const tangentPattern = [-1.0, .35, 1.15, -.45, -1.25, .55, 1.0, -.25, -1.05];
    const material = this.materialForClimb(feature.material);
    const baseTangent = feature.tangent ?? 0;

    const firstT = .4 / (stageCount - .12);
    const firstTangent = baseTangent
      + tangentPattern[0] * (chimneyStyle ? 1.15 : 1.65)
      + route.sway * (firstT - .5) * .8;
    const entryPoint = this.point(angle, outerRadius + .05, outerY + .72, firstTangent);
    this.addMountainBoulder(`${prefix} entry stone`, entryPoint,
      { x: 3.5, y: 2.1, z: 3.1 }, material, { climbMaterial: feature.material });

    let lastTangent = firstTangent;
    for (let stage = 0; stage < stageCount; stage += 1) {
      const t = (stage + .4) / (stageCount - .12);
      const targetY = lerp(outerY, innerY, t);
      const radius = this.findRouteRadiusForHeight(angle, outerRadius, innerRadius, targetY);
      const localGround = this.terrainY(angle, radius);
      const tangent = baseTangent
        + tangentPattern[stage] * (chimneyStyle ? 1.15 : 1.65)
        + route.sway * (t - .5) * .8;
      lastTangent = tangent;
      const height = 2.9 + ((stage + feature.gateIndex) % 3) * .45 + (feature.gateIndex === 2 ? .15 : 0);
      const width = 2.75 + ((stage + 1) % 3) * .48;
      const depth = 2.35 + (stage % 2) * .46;
      const point = this.point(angle, radius, localGround + height * .28, tangent);
      this.addMountainBoulder(`${prefix} scramble rock ${stage + 1}`, point,
        { x: width, y: height, z: depth }, material, { climbMaterial: feature.material });

      if (stage === 2 || stage === 5 || (feature.gateIndex === 2 && stage === 7)) {
        const ledgeRadius = radius - .42;
        const ledgeGround = this.terrainY(angle, ledgeRadius);
        this.addRadialRock(`${prefix} rest ledge ${stage + 1}`, angle, ledgeRadius,
          Math.max(localGround, ledgeGround) + 1.05,
          { x: 3.4 + (stage % 2) * .45, y: .68, z: 2.15 }, this.materialForClimb('rough'), {
            tangentOffset: tangent + route.sway * .72,
            pitch: 1,
            roll: route.sway * (stage % 2 ? -5 : 5),
            climbMaterial: 'rough'
          });
      }
    }

    // Explicitly overlaps the upper shelf so the route cannot strand the player at
    // the top of a climbable object below the next terrain level.
    const exitRadius = innerRadius - .35;
    const exitGround = this.terrainY(angle, exitRadius);
    this.addRadialRock(`${prefix} upper exit ledge`, angle, exitRadius, exitGround + .48,
      { x: 4.25, y: .82, z: 3.15 }, this.materialForClimb('rough'), {
        tangentOffset: lastTangent + route.sway * .18,
        pitch: 2,
        roll: route.sway * -4,
        climbMaterial: 'rough'
      });

    if (chimneyStyle) {
      // Broken side fins preserve the chimney identity without recreating two enormous
      // rectangular walls. Gaps between them expose the actual mountain behind.
      for (const side of [-1, 1]) {
        for (let chunk = 0; chunk < 3; chunk += 1) {
          const t = .2 + chunk * .3;
          const chunkY = lerp(outerY, innerY, t);
          const radius = this.findRouteRadiusForHeight(angle, outerRadius, innerRadius, chunkY);
          const localGround = this.terrainY(angle, radius);
          const chunkHeight = 3.8 + ((chunk + (side > 0 ? 1 : 0)) % 2) * 1.2;
          this.addRadialRock(`${prefix} ${side < 0 ? 'west' : 'east'} chimney fin ${chunk + 1}`,
            angle, radius, localGround + chunkHeight * .34,
            { x: 2.4, y: chunkHeight, z: 2.8 + chunk * .35 }, material, {
              tangentOffset: baseTangent + side * (3.0 + chunk * .18),
              pitch: side * 3,
              roll: side * -5,
              climbMaterial: feature.material
            });
        }
      }
    }
  }

  buildParkourRun(route, feature, prefix, angle) {
    const material = this.materialForClimb(feature.material);
    const count = feature.kind === 'approach' ? 5 : feature.kind === 'ridge' ? 5 : 4;
    const radialSpan = Math.max(8.5, Math.min(feature.length ?? 13, 14));
    const spacing = radialSpan / Math.max(1, count - .35);
    const tangentBase = feature.tangent ?? 0;
    const tangentPattern = [-1.15, .55, 1.25, -.45, -.95];

    for (let step = 0; step < count; step += 1) {
      const radius = feature.radius - step * spacing;
      const ground = this.terrainY(angle, radius);
      const tangent = tangentBase + tangentPattern[step % tangentPattern.length] * 1.35;
      if (step % 3 === 1) {
        this.addRadialRock(`${prefix} parkour ledge ${step + 1}`, angle, radius, ground + .5,
          { x: 3.25 + (step % 2) * .4, y: .78, z: 2.35 }, material, {
            tangentOffset: tangent,
            pitch: 2,
            roll: route.sway * (step % 2 ? -5 : 5),
            climbMaterial: feature.material
          });
      } else {
        const height = 2.0 + (step % 2) * .55;
        const point = this.point(angle, radius, ground + height * .3, tangent);
        this.addMountainBoulder(`${prefix} parkour rock ${step + 1}`, point,
          { x: 3.0 + (step % 3) * .38, y: height, z: 2.7 + ((step + 1) % 2) * .38 },
          material, { climbMaterial: feature.material });
      }
    }
  }

  buildLedgeChain(route, feature, prefix, angle) {
    const material = this.materialForClimb(feature.material);
    for (let step = 0; step < 3; step += 1) {
      const radius = feature.radius - step * 1.85;
      const ground = this.terrainY(angle, radius);
      const tangent = (feature.tangent ?? 0) + (step - 1) * 1.35 * route.sway;
      if (step === 1) {
        const point = this.point(angle, radius, ground + .72, tangent);
        this.addMountainBoulder(`${prefix} bridge rock`, point,
          { x: 2.8, y: 2.05, z: 2.55 }, material, { climbMaterial: feature.material });
      } else {
        this.addRadialRock(`${prefix} small ledge ${step + 1}`, angle, radius, ground + .48,
          { x: 3.0 + step * .25, y: .72, z: 2.15 }, material, {
            tangentOffset: tangent,
            pitch: 1,
            roll: (feature.roll ?? 0) * .7,
            climbMaterial: feature.material
          });
      }
    }
  }

  buildBrokenPassage(route, feature, prefix, angle) {
    const material = this.materialForClimb(feature.material);
    const halfGap = feature.gap / 2;
    for (const side of [-1, 1]) {
      for (let chunk = 0; chunk < 3; chunk += 1) {
        const radius = feature.radius - chunk * 4.6;
        const ground = this.terrainY(angle, radius);
        const height = 4.0 + ((chunk + (side > 0 ? 1 : 0)) % 3) * .85;
        this.addRadialRock(`${prefix} ${side < 0 ? 'west' : 'east'} broken wall ${chunk + 1}`,
          angle, radius, ground + height * .31,
          { x: 3.0 + (chunk % 2) * .5, y: height, z: 3.6 + (chunk % 2) * .55 }, material, {
            tangentOffset: side * (halfGap + 1.4 + chunk * .18),
            pitch: side * (chunk % 2 ? 5 : 2),
            roll: side * (chunk % 2 ? -7 : -3),
            climbMaterial: feature.material
          });
      }
    }
    for (let step = 0; step < 5; step += 1) {
      const radius = feature.radius - step * 3.2;
      const ground = this.terrainY(angle, radius);
      const tangent = ((step % 3) - 1) * 1.0;
      const point = this.point(angle, radius, ground + .6 + (step % 2) * .18, tangent);
      this.addMountainBoulder(`${prefix} floor stone ${step + 1}`, point,
        { x: 2.8 + (step % 2) * .35, y: 1.8 + (step % 3) * .3, z: 2.65 },
        material, { climbMaterial: feature.material });
    }
  }

  buildRouteFeature(route, feature, index) {
    const angle = route.angle + (feature.angleOffset ?? 0);
    const prefix = `${route.label} ${index + 1}`;
    if (feature.kind === 'climb') {
      this.buildEscarpmentScramble(route, feature, prefix, angle, false);
      return;
    }
    if (feature.kind === 'chimney-gate') {
      this.buildEscarpmentScramble(route, feature, prefix, angle, true);
      return;
    }
    if (feature.kind === 'slab' || feature.kind === 'ridge' || feature.kind === 'approach') {
      this.buildParkourRun(route, feature, prefix, angle);
      return;
    }
    if (feature.kind === 'ledge') {
      this.buildLedgeChain(route, feature, prefix, angle);
      return;
    }
    if (feature.kind === 'boulder-run') {
      const count = feature.count ?? 5;
      for (let boulder = 0; boulder < count; boulder += 1) {
        const radialShift = boulder * (feature.spread ?? 3.15);
        const radius = feature.radius - radialShift;
        const tangent = (feature.tangent ?? 0) + ((boulder % 3) - 1) * (feature.large ? 3.1 : 2.35);
        const baseY = this.terrainY(angle, radius);
        const height = (feature.large ? 3.15 : 2.3) + (boulder % 3) * .62;
        const point = this.point(angle, radius, baseY + height * .31, tangent);
        this.addMountainBoulder(`${prefix} stable boulder ${boulder + 1}`, point,
          {
            x: (feature.large ? 4.2 : 3.05) + (boulder % 2) * .9,
            y: height,
            z: (feature.large ? 3.9 : 2.95) + ((boulder + 1) % 3) * .55
          }, this.materialForClimb(feature.material), { climbMaterial: feature.material });
      }
      return;
    }
    if (feature.kind === 'boulder-branches') {
      [-1, 1].forEach((side) => {
        for (let boulder = 0; boulder < 4; boulder += 1) {
          const radius = feature.radius - boulder * 4.4;
          const baseY = this.terrainY(angle, radius);
          const height = 2.55 + ((boulder + (side > 0 ? 1 : 0)) % 3) * .7;
          const point = this.point(angle, radius, baseY + height * .31,
            side * (4.8 + boulder * .65));
          this.addMountainBoulder(`${prefix} ${side < 0 ? 'west' : 'east'} branch boulder ${boulder + 1}`,
            point, { x: 3.45 + (boulder % 2) * .8, y: height, z: 3.25 + ((boulder + 1) % 2) * .9 },
            this.materialForClimb(feature.material), { climbMaterial: feature.material });
        }
      });
      return;
    }
    if (feature.kind === 'tilted-slab') {
      const ground = this.terrainY(angle, feature.radius);
      this.addRadialRock('Giant Tilted Slab landmark', angle, feature.radius, ground + 3.2,
        { x: 11.5, y: 5.8, z: 9.2 }, this.materialForClimb('ungrippable'), {
          tangentOffset: feature.tangent ?? 0,
          pitch: 27,
          roll: -19,
          yawOffset: 8
        });
      this.buildParkourRun(route, { ...feature, kind: 'ridge', length: 12, material: feature.material }, prefix, angle);
      return;
    }
    if (feature.kind === 'ravine' || feature.kind === 'cleft' || feature.kind === 'chimney') {
      this.buildBrokenPassage(route, feature, prefix, angle);
    }
  }

  buildRouteConnectors() {
    // Same-band route switching now uses broken ledge chains too. These stay shallow
    // radially, so they cannot become unintended extra ways through an escarpment.
    const connectors = [
      { name: 'Lower east traverse', angle: 73, radius: 126, length: 14, type: 'normal', sway: 1 },
      { name: 'Lower west traverse', angle: 250, radius: 125, length: 15, type: 'rough', sway: -1 },
      { name: 'Middle ravine traverse', angle: 171, radius: 88, length: 13, type: 'rough', sway: 1 },
      { name: 'Middle wind traverse', angle: 318, radius: 88, length: 14, type: 'normal', sway: -1 },
      { name: 'Alpine north saddle', angle: 73, radius: 52, length: 12, type: 'rough', sway: 1 },
      { name: 'Alpine south saddle', angle: 238, radius: 52, length: 12, type: 'normal', sway: -1 }
    ];
    connectors.forEach((connector) => {
      const pieces = 4;
      for (let piece = 0; piece < pieces; piece += 1) {
        const tangent = (piece - (pieces - 1) / 2) * (connector.length / pieces) * .82;
        const radius = connector.radius + connector.sway * ((piece % 2) ? .65 : -.45);
        const y = this.terrainY(connector.angle, radius);
        if (piece === 1 || piece === 3) {
          this.addRadialRock(`${connector.name} ledge ${piece + 1}`, connector.angle, radius, y + .46,
            { x: 3.1, y: .72, z: 2.3 }, this.materialForClimb(connector.type), {
              tangentOffset: tangent,
              pitch: 1,
              roll: connector.sway * (piece % 2 ? -5 : 5),
              climbMaterial: connector.type
            });
        } else {
          const point = this.point(connector.angle, radius, y + .68, tangent);
          this.addMountainBoulder(`${connector.name} rock ${piece + 1}`, point,
            { x: 2.9, y: 1.9 + piece * .12, z: 2.6 }, this.materialForClimb(connector.type), {
              climbMaterial: connector.type
            });
        }
      }
    });
  }

  buildLandmarks() {
    // Split Boulder: two intersecting natural forms, intentionally grounded at the Ridge route.
    const splitY = this.terrainY(35, 119);
    this.addRadialRock('Split Boulder west tooth', 35, 119, splitY + 3.2,
      { x: 5.5, y: 7.2, z: 4.6 }, this.materials.deepRock, {
        tangentOffset: -4.2, pitch: -9, roll: -10, climbMaterial: 'rough'
      });
    this.addRadialRock('Split Boulder east tooth', 35, 119, splitY + 3.5,
      { x: 5.1, y: 8.1, z: 4.8 }, this.materials.rockLight, {
        tangentOffset: 4.1, pitch: 8, roll: 12, climbMaterial: 'normal'
      });

    // Sample the actual ravine at a short cadence and join those samples. Each non-solid
    // sheet overlaps its neighbors and touches the terrain at both ends, so the cascade
    // follows the mountain instead of reading as one suspended vertical wall.
    const waterfallPoint = (radius, tangentOffset, clearance) => {
      const angle = fallglassAngleAt(radius);
      // Tangentially offset ribbon vertices sit over slightly different parts of the
      // irregular mountain. Sample the terrain at each vertex's real polar position.
      const sampleRadius = Math.hypot(radius, tangentOffset);
      const sampleAngle = angle + Math.atan2(tangentOffset, radius) * 180 / Math.PI;
      return this.point(angle, radius, this.terrainY(sampleAngle, sampleRadius) + clearance, tangentOffset);
    };
    const waterfallPath = FALLGLASS_WATERFALL_RADII.map((radius) => (
      waterfallPoint(radius, fallglassTangentAt(radius), .4)
    ));
    const cascadeGeometry = new pc.Geometry();
    cascadeGeometry.positions = [];
    cascadeGeometry.indices = [];
    waterfallPath.forEach((_, index) => {
      const radius = FALLGLASS_WATERFALL_RADII[index];
      const width = radius <= 116
        ? lerp(3.8, 4.65, (radius - 96) / 20)
        : lerp(2.85, 1.9, Math.min(1, (radius - 116) / 106))
          + Math.sin(fallglassPhaseAt(radius) * 1.7) * .12;
      const centerTangent = fallglassTangentAt(radius);
      for (const side of [-1, 1]) {
        const edgePoint = waterfallPoint(radius, centerTangent + width * .5 * side, .44);
        cascadeGeometry.positions.push(
          edgePoint.x,
          edgePoint.y,
          edgePoint.z
        );
      }
      if (index < waterfallPath.length - 1) {
        const base = index * 2;
        cascadeGeometry.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    });
    cascadeGeometry.calculateNormals();
    const cascadeMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, cascadeGeometry);
    const cascade = new pc.Entity('Fallglass continuous terrain-following cascade');
    cascade.addComponent('render');
    cascade.render.meshInstances = [new pc.MeshInstance(cascadeMesh, this.materials.waterfall, cascade)];
    cascade.render.castShadows = false;
    this.buildTarget.addChild(cascade);

    // Soft, irregular joins at the source, plunge pool, and lower runout remove the old
    // hard rectangular sheet ends without adding collision around the fishing bank.
    for (const [foamIndex, label] of [
      [0, 'source lip'],
      [FALLGLASS_WATERFALL_RADII.indexOf(116), 'plunge pool'],
      [FALLGLASS_WATERFALL_RADII.length - 1, 'lower runout']
    ]) {
      const foamPoint = waterfallPath[foamIndex];
      for (let puff = 0; puff < 5; puff += 1) {
        const side = (puff - 2) * .72;
        const angle = degreesToRadians(273);
        this.createPrimitive(`Fallglass ${label} foam ${puff + 1}`, 'sphere', {
          x: foamPoint.x + Math.cos(angle) * side,
          y: foamPoint.y + .11 + (puff % 2) * .035,
          z: foamPoint.z + Math.sin(angle) * side
        }, { x: .74 + (puff % 2) * .22, y: .09, z: .48 + (puff % 3) * .12 },
        this.materials.shallowWater, {}, { castShadows: false });
      }
    }

    // Narrow ravine mouth and chimney crack get silhouette pieces beyond the route walls.
    const ravineY = this.terrainY(183, 171);
    this.addRadialRock('Narrow Ravine west tooth', 183, 171, ravineY + 4.3,
      { x: 5, y: 9.2, z: 10 }, this.materials.deepRock, { tangentOffset: -7.2, roll: -10, climbMaterial: 'normal' });
    this.addRadialRock('Narrow Ravine east tooth', 183, 171, ravineY + 4.1,
      { x: 5.4, y: 8.7, z: 9.5 }, this.materials.rockLight, { tangentOffset: 7.1, roll: 9, climbMaterial: 'rough' });

    const chimneyY = this.terrainY(125, 91);
    this.addRadialRock('Chimney Crack west fin', 125, 91, chimneyY + 6.2,
      { x: 3.6, y: 13.5, z: 9.8 }, this.materials.deepRock, { tangentOffset: -4.8, roll: -5, climbMaterial: 'rough' });
    this.addRadialRock('Chimney Crack east fin', 125, 91, chimneyY + 6.1,
      { x: 3.4, y: 13.2, z: 9.5 }, this.materials.rockLight, { tangentOffset: 4.7, roll: 6, climbMaterial: 'normal' });

    // Sparse large navigation forms only; detailed vegetation/rock dressing is intentionally postponed.
    const forestAngles = [91, 100, 119, 128, 137];
    forestAngles.forEach((angle, index) => {
      const radius = 169 - (index % 2) * 6;
      const baseY = this.terrainY(angle, radius);
      const point = this.point(angle, radius, baseY);
      this.addMountainTree(point.x, point.z, baseY, .8 + index * .08, `Forest inlet pine ${index + 1}`);
    });

    // Alpine shards mark the transition toward the crown without becoming a decorative rock field.
    for (let index = 0; index < 7; index += 1) {
      const angle = 242 + index * 12;
      const radius = 43 + (index % 2) * 4;
      const y = this.terrainY(angle, radius);
      this.addRadialRock(`Alpine ridge shard ${index + 1}`, angle, radius, y + 1.6,
        { x: 2.2 + (index % 2) * .7, y: 3.8 + (index % 3), z: 2.4 },
        index % 3 === 0 ? this.materials.ice : this.materials.snow, {
          pitch: index % 2 ? 9 : -7,
          roll: index % 2 ? -10 : 8,
          climbMaterial: index % 3 === 0 ? 'ice' : 'normal'
        });
    }
  }

  isEnvironmentPlacementOpen(angle, radius, clearance = 2.4) {
    if (this.isRockInProtectedWaterApproach(angle, radius)) return false;
    const point = this.point(angle, radius, this.terrainY(angle, radius));
    const cabinCenter = this.point(HOME_CABIN_CONFIG.angle, HOME_CABIN_CONFIG.radius, this.homeCabinFloorY);
    if (Math.hypot(point.x - cabinCenter.x, point.z - cabinCenter.z) < 12.5) return false;
    const aquariumCenter = this.point(PUBLIC_AQUARIUM_CONFIG.angle, PUBLIC_AQUARIUM_CONFIG.radius, this.publicAquariumFloorY);
    if (Math.hypot(point.x - aquariumCenter.x, point.z - aquariumCenter.z) < 12) return false;
    return !this.rockPlacements.some((rock) => (
      Math.abs(rock.position.y - point.y) < 5
      && Math.hypot(rock.position.x - point.x, rock.position.z - point.z)
        < clearance + Math.max(rock.size.x, rock.size.z) * .42
    ));
  }

  addEnvironmentTree(angle, radius, size, name, solidTrunk = false, style = 'conifer') {
    const baseY = this.terrainY(angle, radius);
    const point = this.point(angle, radius, baseY);
    const trunkHeight = style === 'scrub-tree' ? 1.65 : style === 'broadleaf' ? 2.75 : 3.55;
    const trunkWidth = style === 'scrub-tree' ? .5 : style === 'broadleaf' ? .7 : .58;
    const trunk = this.addCylinder(`${name} climbable trunk`,
      { x: point.x, y: baseY + trunkHeight * size * .5, z: point.z },
      { x: trunkWidth * size, y: trunkHeight * size, z: trunkWidth * size },
      this.materials.wood, {}, solidTrunk);
    if (solidTrunk) {
      this.registerClimbSurface(trunk, trunk.physicsCollider, 'rough', `${name} trunk`);
      // Two low, solid branch stubs make the larger pines useful short climb objects
      // instead of featureless poles. Their cones remain visual-only and snag-free.
      if (style !== 'scrub-tree') for (const side of [-1, 1]) {
        const branchY = style === 'broadleaf' ? 2.05 : 2.55;
        const branchPoint = this.point(angle, radius, baseY + branchY * size, side * .58 * size);
        const branch = this.addCylinder(`${name} ${side < 0 ? 'left' : 'right'} climbable branch`, branchPoint,
          { x: .32 * size, y: 1.4 * size, z: .32 * size }, this.materials.wood,
          { x: 0, y: inwardYaw(angle), z: side * 58 }, true);
        this.registerClimbSurface(branch, branch.physicsCollider, 'rough');
      }
    }
    const crownMaterial = stableNameHash(name) % 3 ? this.materials.foliage : this.materials.foliageLight;
    if (style === 'scrub-tree') {
      for (const [lobe, offset] of [[0, -1], [1, 0], [2, 1], [3, .35]]) {
        const lobePoint = this.point(angle, radius, baseY + (1.62 + (lobe % 2) * .2) * size,
          offset * 1.05 * size);
        this.createPrimitive(`${name} umbrella lobe ${lobe + 1}`, 'sphere', lobePoint,
          { x: 1.8 * size, y: .72 * size, z: 1.45 * size },
          lobe % 2 ? this.materials.shrubLight : crownMaterial,
          { z: offset * 5 }, { castShadows: size >= .72 });
      }
    } else if (style === 'broadleaf') {
      for (const [lobe, offset] of [[0, 0], [1, -1], [2, 1]]) {
        const tangent = offset * .72 * size;
        const lobePoint = this.point(angle, radius, baseY + (2.95 + (lobe % 2) * .42) * size, tangent);
        this.createPrimitive(`${name} broad crown ${lobe + 1}`, 'sphere', lobePoint,
          { x: (1.65 - lobe * .12) * size, y: (1.35 + (lobe % 2) * .18) * size, z: 1.45 * size },
          lobe === 1 ? this.materials.shrubLight : crownMaterial,
          { x: 0, y: (stableNameHash(name) + lobe * 47) % 180, z: offset * 5 }, { castShadows: size >= .72 });
      }
    } else {
      const windOffset = style === 'wind-pine' ? .58 * size : 0;
      const lowerPoint = this.point(angle, radius, baseY + 3.55 * size, windOffset);
      const upperPoint = this.point(angle, radius, baseY + 5.05 * size, windOffset * 1.55);
      this.createPrimitive(`${name} lower crown`, 'cone', lowerPoint,
        { x: (style === 'wind-pine' ? 2.1 : 2.45) * size, y: 3.4 * size, z: 2.45 * size }, crownMaterial,
        { x: 0, y: stableNameHash(name) % 180, z: style === 'wind-pine' ? 8 : 0 }, { castShadows: size >= .72 });
      this.createPrimitive(`${name} upper crown`, 'cone', upperPoint,
        { x: (style === 'wind-pine' ? 1.45 : 1.75) * size, y: 2.85 * size, z: 1.75 * size }, crownMaterial,
        { x: 0, y: (stableNameHash(name) + 61) % 180, z: style === 'wind-pine' ? 11 : 0 }, { castShadows: size >= .72 });
    }
  }

  addEnvironmentBush(angle, radius, size, name, material = this.materials.shrubDark) {
    const baseY = this.terrainY(angle, radius);
    const point = this.point(angle, radius, baseY);
    this.createPrimitive(name, 'sphere', { x: point.x, y: baseY + .34 * size, z: point.z },
      { x: .95 * size, y: .62 * size, z: .8 * size }, material,
      { x: 0, y: stableNameHash(name) % 180, z: (stableNameHash(name) % 11) - 5 }, { castShadows: false });
  }

  buildEnvironmentAesthetics() {
    // A denser deterministic lowland canopy gives the coast a forested silhouette. The
    // largest nearby trees have exact solid trunks and branches registered as rough grips.
    let solidTrees = 0;
    let plantedTrees = 0;
    const plantedByBiome = { sunwash: 0, blackstone: 0, fernwood: 0 };
    for (let index = 0; index < LOWLAND_TREE_CONFIG.candidateCount; index += 1) {
      let angle;
      let radius;
      let open = false;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        angle = (21 + index * 5.13 + Math.sin(index * 1.31) * 3.6 + attempt * 2.35 + 360) % 360;
        const biome = climateThemeAt(angle);
        const biomeDensity = MOUNTAIN_BIOME_SECTORS.find((sector) => sector.id === biome)?.forestDensity ?? .5;
        if (stableUnit(`tree-density:${index}:${attempt}`) > biomeDensity) continue;
        radius = LOWLAND_TREE_CONFIG.minimumRadius
          + ((index * 11 + attempt * 7) % LOWLAND_TREE_CONFIG.radiusSpan);
        const attemptSize = .52 + (index % 7) * .072 + (biome === 'fernwood' ? .16 : biome === 'blackstone' ? .08 : 0);
        if (this.isEnvironmentPlacementOpen(angle, radius, 2.5 + attemptSize)) {
          open = true;
          break;
        }
      }
      const biome = climateThemeAt(angle);
      const size = .52 + (index % 7) * .072 + (biome === 'fernwood' ? .16 : biome === 'blackstone' ? .08 : 0);
      if (!open) continue;
      const solid = size >= .68 && solidTrees < LOWLAND_TREE_CONFIG.maximumClimbableTrees;
      const style = biome === 'fernwood' ? 'broadleaf'
        : biome === 'blackstone' ? 'conifer' : 'scrub-tree';
      this.addEnvironmentTree(angle, radius, size, `${biome} ${style} ${index + 1}`, solid, style);
      plantedTrees += 1;
      plantedByBiome[biome] += 1;
      if (solid) solidTrees += 1;
    }
    this.lowlandTreeAudit = { planted: plantedTrees, climbable: solidTrees, byBiome: plantedByBiome };

    // Secondary plants echo the dominant silhouette instead of homogenizing the sectors:
    // dry scrub in Sunwash, needle-dark saplings in Blackstone, and fern fans in Fernwood.
    for (let index = 0; index < 336; index += 1) {
      const angle = (index * 13.73 + 7 + Math.sin(index * .71) * 3 + 360) % 360;
      const radius = 150 + ((index * 17) % 34);
      if (!this.isEnvironmentPlacementOpen(angle, radius, .78)) continue;
      const biome = climateThemeAt(angle);
      const baseY = this.terrainY(angle, radius);
      const point = this.point(angle, radius, baseY);
      if (biome === 'blackstone') {
        this.createPrimitive(`Blackstone pine sapling ${index + 1}`, 'cone',
          { x: point.x, y: baseY + .72, z: point.z }, { x: .48, y: 1.45, z: .48 },
          this.materials.shrubDark, {}, { castShadows: false });
      } else if (biome === 'fernwood') {
        for (const side of [-1, 1]) this.createPrimitive(`Fernwood fern fan ${index + 1}:${side}`, 'cone',
          { x: point.x + side * .22, y: baseY + .24, z: point.z }, { x: .34, y: .55, z: .12 },
          this.materials.shrubLight, { z: side * 58 }, { castShadows: false });
      } else {
        this.createPrimitive(`Sunwash dry scrub ${index + 1}`, 'sphere',
          { x: point.x, y: baseY + .22, z: point.z }, { x: .72, y: .38, z: .58 },
          index % 3 ? this.materials.dryGrass : this.materials.shrubLight, {}, { castShadows: false });
      }
    }

    // Bushes taper from the lower slopes into hardy alpine scrub. They are deliberately
    // offset from authored rocks and water approaches so grips and shore casting stay clear.
    for (let index = 0; index < 96; index += 1) {
      const angle = (17 + index * 14.9 + Math.sin(index * .87) * 4.2 + 360) % 360;
      const radius = 118 + ((index * 11) % 36);
      if (!this.isEnvironmentPlacementOpen(angle, radius, 1.55)) continue;
      this.addEnvironmentBush(angle, radius, .58 + (index % 4) * .12,
        `Lower mountain bush ${index + 1}`, index % 3 ? this.materials.shrubDark : this.materials.shrubLight);
    }
    for (let index = 0; index < 11; index += 1) {
      const angle = (44 + index * 31.3) % 360;
      const radius = 78 + ((index * 9) % 31);
      if (!this.isEnvironmentPlacementOpen(angle, radius, 1.35)) continue;
      this.addEnvironmentBush(angle, radius, .38 + (index % 3) * .1,
        `Hardy alpine scrub ${index + 1}`, index % 2 ? this.materials.shrubDark : this.materials.dryGrass);
    }

    for (let index = 0; index < 176; index += 1) {
      const angle = (8 + index * 8.15 + Math.sin(index * 1.7) * 2.1 + 360) % 360;
      const radius = 164 + ((index * 5) % 17);
      if (!this.isEnvironmentPlacementOpen(angle, radius, .65)) continue;
      const baseY = this.terrainY(angle, radius);
      const point = this.point(angle, radius, baseY);
      this.createPrimitive(`Coastal grass cluster ${index + 1}`, 'cone',
        { x: point.x, y: baseY + .24, z: point.z },
        { x: .24 + (index % 3) * .06, y: .5 + (index % 4) * .08, z: .18 },
        index % 4 ? this.materials.shrubLight : this.materials.dryGrass,
        { x: 0, y: index * 47, z: index % 2 ? 8 : -8 }, { castShadows: false });
    }
    for (let index = 0; index < 64; index += 1) {
      const angle = (64 + index * 17.2) % 360;
      const radius = 166 + ((index * 7) % 13);
      if (!this.isEnvironmentPlacementOpen(angle, radius, .55)) continue;
      const baseY = this.terrainY(angle, radius);
      const point = this.point(angle, radius, baseY);
      this.createPrimitive(`Coastal flower ${index + 1}`, 'sphere',
        { x: point.x, y: baseY + .2, z: point.z }, { x: .16, y: .2, z: .16 },
        index % 2 ? this.materials.flowers : this.materials.flowerPink, {}, { castShadows: false });
    }

    // Small edge accents make the core rest shelves recognizable from neighboring
    // lines without hiding their mantle lips or adding collision.
    const restAccents = [
      { id: '500ft', ...MOUNTAIN_REST_LEDGE_CONFIG.fiveHundred },
      { id: '550ft-alpine', ...MOUNTAIN_REST_LEDGE_CONFIG.fiveFifty },
      { id: '600ft', ...MOUNTAIN_REST_LEDGE_CONFIG.sixHundred }
    ];
    for (const rest of restAccents) {
      for (const side of [-1, 1]) {
        const point = this.point(rest.angle, rest.radius, rest.targetHeight + .32, side * (rest.width * .56));
        this.createPrimitive(`${rest.id} wind-bent landmark shrub ${side < 0 ? 'left' : 'right'}`,
          'sphere', point, { x: .42, y: .3, z: .5 }, this.materials.dryGrass,
          { x: 0, y: inwardYaw(rest.angle), z: side * 18 }, { castShadows: false });
      }
    }
  }

  buildSummitCrown() {
    const segments = 18;
    const vertices = [];
    const bottomStart = 0;
    for (let index = 0; index < segments; index += 1) {
      const angle = index * 360 / segments;
      const radius = CROWN_BASE_RADIUS * (1 + Math.sin(degreesToRadians(angle * 3 + 17)) * .035);
      // Sink the shell into the raised alpine shoulder. This intentionally overlaps the
      // continuous terrain so there is no clip-able annular seam between core and crown.
      vertices.push([Math.cos(degreesToRadians(angle)) * radius, this.terrainY(angle, radius) - 2.2, Math.sin(degreesToRadians(angle)) * radius]);
    }
    const topStart = vertices.length;
    for (let index = 0; index < segments; index += 1) {
      const angle = index * 360 / segments;
      const radius = CROWN_TOP_RADIUS * (1 + Math.sin(degreesToRadians(angle * 4 - 11)) * .035);
      vertices.push([Math.cos(degreesToRadians(angle)) * radius, SUMMIT_HEIGHT, Math.sin(degreesToRadians(angle)) * radius]);
    }
    const summitWater = MOUNTAIN_FISHING_LOCATIONS.find((location) => location.summit);
    const summitSurfaceY = summitWater?.y ?? SUMMIT_HEIGHT - .12;
    const summitWaterRadii = summitWater?.radii ?? [3.7, 3.1];
    const surfaceRingStarts = [];
    for (const normalizedDistance of [.24, .5, .76, 1, 1.5]) {
      surfaceRingStarts.push(vertices.length);
      for (let index = 0; index < segments; index += 1) {
        const angle = index * 360 / segments;
        const radians = degreesToRadians(angle);
        const waterBoundaryRadius = 1 / Math.hypot(
          Math.cos(radians) / summitWaterRadii[0],
          Math.sin(radians) / summitWaterRadii[1]
        );
        const radius = waterBoundaryRadius * normalizedDistance;
        vertices.push([
          Math.cos(radians) * radius,
          summitBasinHeight(normalizedDistance, SUMMIT_HEIGHT, summitSurfaceY),
          Math.sin(radians) * radius
        ]);
      }
    }
    const topCenter = vertices.length;
    vertices.push([0, summitBasinHeight(0, SUMMIT_HEIGHT, summitSurfaceY), 0]);
    const triangles = [];
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const bottom = bottomStart + index;
      const bottomNext = bottomStart + next;
      const top = topStart + index;
      const topNext = topStart + next;
      // Side winding points outward/upward.
      triangles.push([bottom, top, topNext], [bottom, topNext, bottomNext]);
      triangles.push([topCenter, surfaceRingStarts[0] + next, surfaceRingStarts[0] + index]);
      for (let ring = 0; ring < surfaceRingStarts.length - 1; ring += 1) {
        const inner = surfaceRingStarts[ring];
        const outer = surfaceRingStarts[ring + 1];
        triangles.push(
          [inner + index, outer + next, outer + index],
          [inner + index, inner + next, outer + next]
        );
      }
      const lastSurfaceRing = surfaceRingStarts.at(-1);
      triangles.push(
        [lastSurfaceRing + index, topNext, top],
        [lastSurfaceRing + index, lastSurfaceRing + next, topNext]
      );
    }

    // Only the first two triangles per angular segment are the visible crown side wall.
    // Preserve those exact triangles so later rock grounding can ray-test the same faceted
    // shell the player actually sees instead of an idealized circular cone.
    this.crownSideTriangles = [];
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const bottom = bottomStart + index;
      const bottomNext = bottomStart + next;
      const top = topStart + index;
      const topNext = topStart + next;
      this.crownSideTriangles.push(
        [vertices[bottom], vertices[top], vertices[topNext]],
        [vertices[bottom], vertices[topNext], vertices[bottomNext]]
      );
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
    const entity = new pc.Entity('Crooked Peak summit crown - sheer ungrippable shell');
    entity.addComponent('render');
    entity.render.meshInstances = [new pc.MeshInstance(mesh, this.materials.alpine, entity)];
    entity.render.castShadows = false;
    entity.setPosition(MOUNTAIN_CENTER.x, 0, MOUNTAIN_CENTER.z);
    this.buildTarget.addChild(entity);

    const colliderDesc = this.RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices.flat()),
      new Uint32Array(triangles.flat())
    )
      .setTranslation(MOUNTAIN_CENTER.x, 0, MOUNTAIN_CENTER.z)
      .setFriction(.92)
      .setRestitution(0);
    entity.physicsCollider = this.physicsWorld.createCollider(colliderDesc);
    // Deliberately NOT registered as climbable. The crown shell is a sheer barrier; only
    // the surrounding V2.6 crown climb web below exposes Grip surfaces.
  }

  buildSummitBench() {
    // Matching benches occupy opposite solid sides of the tarn. Both face inward and
    // expose explicit seat/exit points to the click-to-toggle interaction controller.
    for (const [index, config] of SUMMIT_BENCH_CONFIGS.entries()) {
      const angle = config.angle;
      const radius = config.radius;
      const yaw = inwardYaw(angle);
      const name = index === 0 ? 'Summit west rest bench' : 'Summit east rest bench';
      const seat = this.point(angle, radius, SUMMIT_HEIGHT + .56);
      this.addBox(`${name} seat`, seat,
        { x: 2.35, y: .18, z: .72 }, this.materials.wood, { y: yaw });
      const back = this.point(angle, radius + .34, SUMMIT_HEIGHT + 1.08);
      this.addBox(`${name} back`, back,
        { x: 2.35, y: .86, z: .16 }, this.materials.wood, { x: -7, y: yaw });
      for (const side of [-1, 1]) {
        const tangent = side * .88;
        this.addBox(`${name} ${side < 0 ? 'left' : 'right'} leg`,
          this.point(angle, radius, SUMMIT_HEIGHT + .24, tangent),
          { x: .18, y: .48, z: .46 }, this.materials.wood, { y: yaw });
      }
      const seatSurface = this.point(angle, radius, SUMMIT_HEIGHT + config.seatHeight);
      const exitSurface = this.point(angle, radius, SUMMIT_HEIGHT + PLAYER_FOOT_OFFSET + .16, 1.72);
      this.homeInteractions.push({
        id: config.id,
        label: 'CLICK TO SIT & FISH AT THE TARN',
        action: 'bench',
        position: seatSurface,
        seatPosition: { ...seatSurface, y: seatSurface.y + PLAYER_FOOT_OFFSET + .03 },
        exitPosition: exitSurface,
        facingYaw: yaw,
        fishingFacing: config.fishingFacing,
        range: config.interactionDistance
      });
    }
  }

  crownRadiusAtHeight(y) {
    const t = clamp((y - CROWN_BASE_HEIGHT) / (SUMMIT_HEIGHT - CROWN_BASE_HEIGHT), 0, 1);
    return lerp(CROWN_BASE_RADIUS, CROWN_TOP_RADIUS, t);
  }

  buildCrownRoutes() {
    // The 1,000-ft crown is much taller, so it uses more vertical stages rather than
    // stretching the old rocks apart. Lines still zigzag and converge, but upper rocks
    // shrink with circumference to avoid coplanar overlap / texture flicker near the cap.
    CROWN_ROUTES.forEach((route, routeIndex) => {
      const stageCount = CROWN_DENSITY_CONFIG.routeStages;
      const baseDifficulty = climbDifficultyAt(route.angle, 3);
      const side = route.sway;
      let lastAngle = route.angle;
      let lastTangent = 0;

      for (let stage = 0; stage < stageCount; stage += 1) {
        const t = (stage + .55) / stageCount;
        const centerY = lerp(CROWN_BASE_HEIGHT + 1.2, SUMMIT_HEIGHT - 2.15, t);
        const extraDifficulty = .07 + t * .16;
        const zigzag = Math.sin(t * Math.PI * 4 + routeIndex * .37) * (1.25 + baseDifficulty * .7);
        const secondary = Math.sin(t * Math.PI * 9 + routeIndex * .71) * .32;
        const angle = route.angle + (zigzag + secondary) * side;
        lastAngle = angle;

        const materialType = chooseClimbMaterial(3, angle, stage, routeIndex, extraDifficulty);
        const difficulty = clamp(baseDifficulty + extraDifficulty, 0, 1);
        const tall = ((stage + routeIndex) % 5 === 1) || stage === 8 || stage === 15;
        const formKinds = ['spire', 'needle', 'blade', 'wedge', 'crooked', 'lean', 'shelfblade', 'hook', 'shard', 'knuckle'];
        const formKind = tall
          ? (((stage + routeIndex) % 2) ? 'needle' : 'crooked')
          : formKinds[(stage + routeIndex) % formKinds.length];
        const height = tall ? 5.8 + difficulty * 1.5 : 2.45 + (stage % 4) * .32;
        const taper = 1 - t * .34;
        const width = ((tall ? 2.15 : 2.7) - difficulty * .32) * taper;
        const depth = ((tall ? 1.65 : 1.95) - difficulty * .12) * (1 - t * .18);
        const tangent = side * (
          Math.sin(t * Math.PI * 5 + routeIndex * .43) * (2.7 + baseDifficulty * .6)
          + Math.sin(t * Math.PI * 11 + routeIndex) * .55
        );
        lastTangent = tangent;

        // Local depth is ~half the supplied z scale. Offset by only ~28% of depth so
        // every route rock visibly intersects the crown shell instead of hovering on it.
        const shellRadius = this.crownRadiusAtHeight(centerY);
        const radius = shellRadius + depth * .28;
        this.addRadialRock(`${route.label} crown rock ${stage + 1}`, angle, radius, centerY,
          { x: Math.max(1.28, width), y: height, z: Math.max(1.25, depth) },
          this.materialForClimb(materialType), {
            tangentOffset: tangent,
            pitch: tall ? -(11 + t * 3) : -(5 + t * 3),
            roll: side * ((stage % 3) - 1) * 6,
            climbMaterial: materialType,
            formKind
          });

        // Traverse branches stop before the cramped top quarter. This keeps lateral
        // choices lower down without layering nearly coplanar meshes around the cap.
        if (CROWN_DENSITY_CONFIG.branchStages.includes(stage) && t < .9) {
          const branchSide = (routeIndex + stage) % 2 ? 1 : -1;
          for (let branchStep = 0; branchStep < 2; branchStep += 1) {
            const branchAngle = angle + branchSide * (.45 + branchStep * .35);
            const branchType = chooseClimbMaterial(3, branchAngle, stage,
              routeIndex + 73 + branchStep, extraDifficulty + .04);
            this.addRadialRock(`${route.label} crown traverse ${stage + 1}-${branchStep + 1}`,
              branchAngle, radius - .08, centerY + .05 + branchStep * .16,
              { x: Math.max(1.25, 1.95 * taper), y: 2.2 + branchStep * .28, z: 1.36 },
              this.materialForClimb(branchType), {
                tangentOffset: tangent + branchSide * (1.85 + branchStep * 1.5),
                pitch: -(7 + t * 3),
                roll: branchSide * 9,
                climbMaterial: branchType,
                formKind: branchStep ? 'shelfblade' : 'wedge'
              });
          }
        }

        const addRest = (stage === 8 && routeIndex % 5 === 0)
          || (stage === 17 && routeIndex % 6 === 2 && difficulty < .9);
        if (addRest) {
          const ledgeType = difficulty > .72 ? 'normal' : 'rough';
          this.addRadialRock(`${route.label} rare crown rest`, angle, radius - .12, centerY - .22,
            { x: 2.35 * taper, y: .56, z: 1.7 }, this.materialForClimb(ledgeType), {
              tangentOffset: tangent - side * .4,
              pitch: 2,
              roll: side * -4,
              climbMaterial: ledgeType,
              formKind: 'chunk'
            });
        }

        if (difficulty > .8 && stage === 13 && routeIndex % 3 === 1) {
          this.addRadialRock(`${route.label} blank crown face`, angle, radius - .06, centerY + .25,
            { x: 2.15 * taper, y: 5.4, z: 1.3 }, this.materialForClimb('ungrippable'), {
              tangentOffset: tangent - side * 3.3,
              pitch: -11,
              roll: side * -10,
              climbMaterial: 'ungrippable',
              formKind: 'blade'
            });
        }
      }

      // Tiny individual exit lips fit around the new 8 m summit without overlapping
      // each other enough to flicker. The centered pond still leaves ~4.3 m of rim.
      this.addRadialRock(`${route.label} summit lip`, lastAngle, CROWN_TOP_RADIUS + .34,
        SUMMIT_HEIGHT - 1.18, { x: 1.45, y: .72, z: 1.45 }, this.materialForClimb('normal'), {
          tangentOffset: lastTangent * .26,
          pitch: 4,
          climbMaterial: 'normal',
          formKind: 'wedge'
        });
      // A low threshold intersects the plateau itself, eliminating the last sub-mantle
      // void without increasing jump height or making the crown shell universally grippable.
      this.addRadialRock(`${route.label} summit threshold`, lastAngle,
        SUMMIT_ROUTE_CONNECTOR.thresholdRadius, SUMMIT_HEIGHT - .2,
        { x: 1.28, y: .42, z: 1.35 }, this.materialForClimb('normal'), {
          tangentOffset: lastTangent * .14,
          pitch: 1,
          climbMaterial: 'normal',
          formKind: 'chunk'
        });
    });
  }

  buildHighAltitudeInfill() {
    // V2.8 fills the sparse upper silhouette without reverting to vertical rock rows.
    // Shoulder belts are staggered laterally and crown belts sit between the 26 authored
    // climb-web lines. Everything still goes through exact core-contact grounding.
    const shoulderBelts = [
      { radius: 79, count: 52, phase: 1.7 },
      { radius: 66, count: 48, phase: 5.2 },
      { radius: 55, count: 42, phase: 2.8 },
      { radius: 45.5, count: 36, phase: 7.1 }
    ];
    shoulderBelts.forEach((belt, beltIndex) => {
      for (let index = 0; index < belt.count; index += 1) {
        const spacing = 360 / belt.count;
        const angle = (belt.phase + index * spacing
          + Math.sin((index + 1) * 1.73 + beltIndex) * spacing * .22 + 360) % 360;
        const difficulty = climbDifficultyAt(angle, 2);
        const radialJitter = Math.sin((index + 3) * 2.19 + beltIndex * .8) * 1.15;
        const radius = belt.radius + radialJitter;
        const ground = this.terrainY(angle, radius);
        const tall = (index + beltIndex) % 6 === 2;
        const type = chooseClimbMaterial(2, angle, index, 420 + beltIndex, .05 + beltIndex * .018);
        const forms = tall ? ['needle', 'crooked', 'column', 'shard', 'hook']
          : ['wedge', 'blade', 'lean', 'spire', 'shelfblade', 'knuckle'];
        const formKind = forms[(index + beltIndex * 2) % forms.length];
        const height = tall ? 5.0 + difficulty * 1.6 : 2.0 + (index % 4) * .36;
        this.addRadialRock(`upper infill ${beltIndex + 1}-${index + 1}`, angle, radius - .15,
          ground + height * (tall ? .31 : .27),
          { x: tall ? 2.0 : 2.45, y: height, z: tall ? 1.55 : 1.9 },
          this.materialForClimb(type), {
            tangentOffset: Math.sin((index + 2) * 1.31) * (2.0 + beltIndex * .35),
            pitch: tall ? -(20 + difficulty * 5) : -(7 + difficulty * 4),
            roll: ((index % 3) - 1) * 6,
            climbMaterial: type,
            formKind
          });
      }
    });

    const crownBelts = [
      { t: .11, count: CROWN_DENSITY_CONFIG.beltCounts[0], phase: 4.4 },
      { t: .27, count: CROWN_DENSITY_CONFIG.beltCounts[1], phase: 1.6 },
      { t: .43, count: CROWN_DENSITY_CONFIG.beltCounts[2], phase: 6.8 },
      { t: .59, count: CROWN_DENSITY_CONFIG.beltCounts[3], phase: 2.7 },
      { t: .74, count: CROWN_DENSITY_CONFIG.beltCounts[4], phase: 8.1 },
      { t: .87, count: CROWN_DENSITY_CONFIG.beltCounts[5], phase: 3.9 }
    ];
    crownBelts.forEach((belt, beltIndex) => {
      const centerY = lerp(CROWN_BASE_HEIGHT + 1.3, SUMMIT_HEIGHT - 4.0, belt.t);
      const shellRadius = this.crownRadiusAtHeight(centerY);
      for (let index = 0; index < belt.count; index += 1) {
        const spacing = 360 / belt.count;
        const angle = (belt.phase + index * spacing
          + Math.sin(index * 1.89 + beltIndex * .73) * spacing * .19 + 360) % 360;
        const difficulty = climbDifficultyAt(angle, 3);
        const type = chooseClimbMaterial(3, angle, index, 610 + beltIndex, .1 + belt.t * .08);
        const tall = (index + beltIndex * 2) % 7 === 3;
        const depth = tall ? 1.45 : 1.7;
        const height = tall ? 4.6 + difficulty * 1.5 : 2.0 + (index % 3) * .4;
        const forms = tall ? ['needle', 'crooked', 'shard', 'hook']
          : ['blade', 'wedge', 'lean', 'spire', 'shelfblade', 'knuckle'];
        this.addRadialRock(`crown infill ${beltIndex + 1}-${index + 1}`, angle, shellRadius + depth * .22,
          centerY + Math.sin(index * 2.4) * .32,
          { x: tall ? 1.65 : 2.0, y: height, z: depth }, this.materialForClimb(type), {
            tangentOffset: Math.sin(index * 1.57 + beltIndex) * (1.5 + (1 - belt.t) * .8),
            pitch: tall ? -(14 + belt.t * 7) : -(6 + belt.t * 5),
            roll: ((index + beltIndex) % 3 - 1) * 7,
            climbMaterial: type,
            formKind: forms[(index + beltIndex) % forms.length]
          });
      }
    });
  }

  spiralStepHeightAt(targetHeight) {
    const feet = targetHeight / .3048;
    if (feet >= 630 && feet <= 660) return MID_MOUNTAIN_SPIRAL_CONFIG.priority630To660StepHeight;
    if (feet >= 450 && feet <= 550) return MID_MOUNTAIN_SPIRAL_CONFIG.priority450To550StepHeight;
    if (feet > 550 && feet < 630) return 1.9;
    return MID_MOUNTAIN_SPIRAL_CONFIG.generalStepHeight;
  }

  spiralRouteSample(routeIndex, targetHeight) {
    const config = MID_MOUNTAIN_SPIRAL_CONFIG;
    const t = clamp((targetHeight - config.minimumHeight) / (config.maximumHeight - config.minimumHeight), 0, 1);
    const direction = routeIndex % 2 === 0 ? 1 : -1;
    const phase = routeIndex * 360 / config.routeCount + Math.sin(routeIndex * 2.17) * 5.5;
    const turns = config.turns + ((routeIndex % 4) - 1.5) * .075;
    const angle = (phase + direction * turns * 360 * t
      + Math.sin(t * Math.PI * 5.2 + routeIndex * .81) * 2.6 + 720) % 360;
    const routeRadius = this.findRouteRadiusForHeight(angle, 145, 38, targetHeight);
    const radialJitter = Math.sin(t * 21.7 + routeIndex * 1.41) * .72;
    return { angle, radius: routeRadius + radialJitter, direction, t };
  }

  buildThreeToSevenHundredRockField() {
    // v9: these are actual continuous climb paths, NOT horizontal altitude bands.
    // Each route winds around Mountain as elevation rises. Vertical sample spacing is
    // intentionally tighter through 450–550 ft and especially 630–660 ft so adding more
    // rocks makes the next move reachable rather than merely decorating the same elevation.
    const config = MID_MOUNTAIN_SPIRAL_CONFIG;
    const forms = [
      'crooked', 'wedge', 'spire', 'knuckle', 'blade', 'hook', 'tooth', 'lean',
      'shelfblade', 'shard', 'crouch', 'prow', 'slab', 'fin'
    ];
    let added = 0;
    let requested = 0;
    let priority630To660Requested = 0;
    const routeAudits = [];

    for (let routeIndex = 0; routeIndex < config.routeCount; routeIndex += 1) {
      let targetHeight = config.minimumHeight + (routeIndex % 3) * .34;
      let stepIndex = 0;
      let routeAdded = 0;

      while (targetHeight <= config.maximumHeight + .01) {
        requested += 1;
        const feet = targetHeight / .3048;
        if (feet >= 630 && feet <= 660) priority630To660Requested += 1;
        const sample = this.spiralRouteSample(routeIndex, targetHeight);
        const { angle, direction } = sample;
        let radius = sample.radius;
        if (this.isRockInProtectedWaterApproach(angle, radius)) {
          // Keep the route continuous around water by slipping a little inward/outward,
          // rather than deleting a whole height step and creating an accidental dead end.
          const alternatives = [2.2, -2.2, 4.0, -4.0];
          const alternative = alternatives.find((offset) => !this.isRockInProtectedWaterApproach(angle, radius + offset));
          if (alternative === undefined) {
            targetHeight += this.spiralStepHeightAt(targetHeight);
            stepIndex += 1;
            continue;
          }
          radius += alternative;
        }

        const ground = this.terrainY(angle, radius);
        const materialType = chooseClimbMaterial(
          feet >= 620 ? 2 : feet >= 450 ? 1 : 0,
          angle, stepIndex, 910 + routeIndex, feet >= 630 && feet <= 660 ? -.08 : .015
        );
        const formKind = forms[(stepIndex * 3 + routeIndex * 5) % forms.length];
        const denseHighGap = feet >= 630 && feet <= 660;
        const priorityMid = feet >= 450 && feet <= 550;
        const rockHeight = denseHighGap
          ? 2.65 + (stepIndex % 3) * .28
          : priorityMid ? 2.45 + (stepIndex % 4) * .3 : 2.2 + (stepIndex % 4) * .34;
        const rockWidth = denseHighGap ? 2.0 + (stepIndex % 3) * .24 : 1.8 + (stepIndex % 4) * .27;
        const tangent = Math.sin(stepIndex * 1.31 + routeIndex * .73) * (denseHighGap ? .82 : 1.15);
        const primary = this.addRadialRock(
          `spiral ${routeIndex + 1} step ${stepIndex + 1}`,
          angle, radius, ground + rockHeight * .28,
          { x: rockWidth, y: rockHeight, z: 1.45 + (stepIndex % 3) * .22 },
          this.materialForClimb(materialType), {
            tangentOffset: tangent,
            pitch: -8 - (stepIndex % 4) * 3 - (denseHighGap ? 3 : 0),
            roll: direction * (((stepIndex + routeIndex) % 3) - 1) * 6,
            climbMaterial: materialType,
            formKind
          }
        );
        if (primary) { added += 1; routeAdded += 1; }

        // Frequent side options overlap adjacent spiral steps vertically. These are branches
        // off the same ascent path—not another ring—and make passing/rest choices possible.
        if (stepIndex % config.branchEvery === (routeIndex % config.branchEvery)
          || denseHighGap && stepIndex % 2 === 0) {
          const side = ((stepIndex + routeIndex) % 2 ? 1 : -1) * direction;
          const branchAngle = angle + side * (1.2 + (stepIndex % 3) * .42);
          const branchRadius = radius + side * (1.25 + (stepIndex % 4) * .26);
          if (!this.isRockInProtectedWaterApproach(branchAngle, branchRadius)) {
            const branchGround = this.terrainY(branchAngle, branchRadius);
            const branchHeight = denseHighGap ? 2.35 : 1.95 + (stepIndex % 3) * .3;
            const branchType = materialType === 'ice' ? 'normal' : (stepIndex % 5 === 2 ? 'normal' : 'rough');
            const branch = this.addRadialRock(
              `spiral ${routeIndex + 1} branch ${stepIndex + 1}`,
              branchAngle, branchRadius, branchGround + branchHeight * .27,
              { x: 1.75 + (stepIndex % 3) * .22, y: branchHeight, z: 1.4 + (stepIndex % 2) * .25 },
              this.materialForClimb(branchType), {
                tangentOffset: side * (1.05 + (stepIndex % 3) * .3),
                pitch: -9 - (stepIndex % 3) * 4,
                roll: side * (5 + (stepIndex % 4) * 2),
                climbMaterial: branchType,
                formKind: forms[(stepIndex * 5 + routeIndex * 2 + 4) % forms.length]
              }
            );
            if (branch) { added += 1; routeAdded += 1; }
          }
        }

        targetHeight += this.spiralStepHeightAt(targetHeight);
        stepIndex += 1;
      }
      routeAudits.push({ routeId: routeIndex + 1, requestedSteps: stepIndex, added: routeAdded });
    }

    this.midMountainRockFieldAudit = {
      layout: 'continuous-spirals',
      routeCount: config.routeCount,
      requestedSteps: requested,
      priority630To660Requested,
      added,
      routeAudits
    };
  }

  buildMidHighTraversalAnchors() {
    // A few larger transfer/rest formations are tied to specific points ON the spirals.
    // They are deliberately not repeated around an elevation ring.
    const anchors = [
      { id: '500ft-transfer', route: 2, height: 152.4, width: 4.8, depth: 3.4 },
      { id: '550ft-transfer', route: 7, height: 167.64, width: 4.5, depth: 3.2 },
      { id: '600ft-transfer', route: 4, height: 182.88, width: 4.35, depth: 3.0 },
      { id: '642ft-transfer', route: 9, height: 195.68, width: 4.0, depth: 2.9 },
      { id: '655ft-transfer', route: 1, height: 199.64, width: 3.9, depth: 2.8 },
      { id: '690ft-transfer', route: 10, height: 210.31, width: 3.8, depth: 2.7 }
    ];
    for (const [index, anchor] of anchors.entries()) {
      const sample = this.spiralRouteSample(anchor.route % MID_MOUNTAIN_SPIRAL_CONFIG.routeCount, anchor.height);
      const angle = sample.angle;
      const radius = sample.radius;
      if (this.isRockInProtectedWaterApproach(angle, radius)) continue;
      const ground = this.terrainY(angle, radius);
      const side = sample.direction * (index % 2 ? 1 : -1);
      const type = index % 3 === 1 ? 'normal' : 'rough';
      this.addRadialRock(anchor.id, angle, radius - .15, ground + .62,
        { x: anchor.width, y: 1.2, z: anchor.depth }, this.materialForClimb(type), {
          tangentOffset: side * .85,
          pitch: 1 + index % 2,
          roll: side * 2,
          climbMaterial: type,
          formKind: 'chunk'
        });
      for (let option = 0; option < 2; option += 1) {
        const optionSide = option ? -side : side;
        const optionAngle = angle + optionSide * (1.0 + option * .35);
        const optionRadius = radius + optionSide * (1.5 + option * .45);
        if (this.isRockInProtectedWaterApproach(optionAngle, optionRadius)) continue;
        const optionGround = this.terrainY(optionAngle, optionRadius);
        this.addRadialRock(`${anchor.id} option ${option + 1}`, optionAngle, optionRadius,
          optionGround + .58, { x: 2.1, y: 2.25 + option * .25, z: 1.65 },
          this.materialForClimb('rough'), {
            tangentOffset: optionSide * 1.4,
            pitch: -8 - option * 4,
            roll: optionSide * 7,
            climbMaterial: 'rough',
            formKind: option ? 'wedge' : 'crooked'
          });
      }
    }
  }

  isRockInProtectedWaterApproach(angle, radius) {
    const point = localPolarPoint(angle, radius);
    return FISHING_LAYOUT.some((water) => {
      if (water.summit) return false;
      const center = localPolarPoint(water.angle, water.radius);
      const dx = point.x - center.x;
      const dz = point.z - center.z;
      if (Math.hypot(dx, dz) < Math.max(water.radii[0], water.radii[1]) + 3.2) return true;
      if (!water.cave) return false;
      const radians = degreesToRadians(water.angle);
      const outward = dx * Math.cos(radians) + dz * Math.sin(radians);
      const lateral = Math.abs(-dx * Math.sin(radians) + dz * Math.cos(radians));
      const caveDepth = caveDepthAt(water);
      return outward > -2 && outward < caveDepth + 5
        && lateral < water.radii[1] * .72 + 3.4;
    });
  }

  buildSparseRegionInfill() {
    const bands = [
      { id: 'lower', minimumRadius: 145, maximumRadius: 181 },
      { id: 'middle', minimumRadius: 105, maximumRadius: 145 },
      { id: 'upper', minimumRadius: 68, maximumRadius: 105 },
      { id: 'alpine', minimumRadius: 41, maximumRadius: 68 }
    ];
    const substantial = this.rockPlacements.filter((rock) => (
      Math.max(rock.size.x, rock.size.y, rock.size.z) >= 1.25 && !rock.crown
    ));
    const sparse = auditRockDensity(substantial, bands, 18)
      .sort((a, b) => (b.median - b.count) - (a.median - a.count));
    const findOpenPlacement = (region, slot = 0) => {
      const spacing = 360 / region.sectorCount;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const angleUnit = (stableUnit(`sparse-angle:${region.id}:${region.sector}:${slot}`)
          + attempt * .173 + slot * .271) % 1;
        const radiusUnit = (stableUnit(`sparse-radius:${region.id}:${region.sector}:${slot}`)
          + attempt * .307 + slot * .193) % 1;
        const angle = region.sector * spacing + spacing * (.12 + angleUnit * .76);
        const radius = lerp(region.minimumRadius, region.maximumRadius, .2 + radiusUnit * .6);
        if (!this.isRockInProtectedWaterApproach(angle, radius)) return { angle, radius };
      }
      return null;
    };
    let added = 0;
    for (const region of sparse) {
      const targetCount = region.targetCount ?? (region.median >= 2 ? Math.max(1, region.median - 1) : region.median);
      const bandBonus = region.id === 'alpine' ? 8 : region.id === 'upper' ? 7 : region.id === 'middle' ? 4 : 2;
      const severityBonus = region.count === 0 && region.median >= 3 ? 2 : 0;
      const needed = Math.max(1, targetCount - region.count + severityBonus + bandBonus);
      for (let slot = 0; slot < needed && added < 500; slot += 1) {
        const placement = findOpenPlacement(region, slot);
        if (!placement) continue;
        const { angle, radius } = placement;
        const ground = this.terrainY(angle, radius);
        const sizeUnit = stableUnit(`sparse-size:${region.id}:${region.sector}:${slot}`);
        const height = 1.75 + sizeUnit * 1.55 + (slot % 4 === 3 ? 1.15 : 0);
        const entity = this.addRadialRock(`density-balanced secondary ${region.id}-${region.sector + 1}-${slot + 1}`,
          angle, radius, ground + height * .22,
          { x: 1.85 + sizeUnit * .95, y: height, z: 1.55 + (1 - sizeUnit) * .72 },
          ground < 3 ? this.materials.wetRock : ground > 95 ? this.materials.alpine : this.materials.rock, {
            tangentOffset: (stableUnit(`sparse-tangent:${region.id}:${region.sector}:${slot}`) - .5) * 3.2,
            pitch: -6 - sizeUnit * 8,
            roll: (sizeUnit - .5) * 12,
            climbMaterial: 'rough',
            formKind: sizeUnit > .52 ? 'wedge' : 'chunk'
          });
        if (entity) added += 1;
      }
    }
    const updatedSubstantial = this.rockPlacements.filter((rock) => (
      Math.max(rock.size.x, rock.size.y, rock.size.z) >= 1.25 && !rock.crown
    ));
    const remaining = auditRockDensity(updatedSubstantial, bands, 18);
    const actionable = remaining.filter((region) => findOpenPlacement(region));
    this.rockDensityAudit = {
      sampledRocks: substantial.length,
      sparseRegions: sparse.length,
      added,
      remainingSparseRegions: actionable.length,
      protectedSparseRegions: remaining.length - actionable.length
    };
  }

  auditSolidRockSupport() {
    const unsupported = this.rockPlacements.filter((rock) => !rock.supported);
    return {
      total: this.rockPlacements.length,
      crown: this.rockPlacements.filter((rock) => rock.crown).length,
      rejected: this.rejectedRocks.length,
      unsupported: unsupported.map((rock) => rock.name)
    };
  }

  buildFishingLocations() {
    MOUNTAIN_FISHING_LOCATIONS.forEach((location, index) => this.addFishingLocation(location, index));
    this.addOceanFishingLocation();
  }

  addOceanFishingLocation() {
    const descriptor = OCEAN_FISHING_DESCRIPTOR;
    const zone = new FishingZone({
      id: descriptor.id,
      label: descriptor.label,
      center: descriptor.center,
      shape: 'annulus',
      innerRadius: descriptor.innerRadius,
      outerRadius: descriptor.outerRadius,
      containsRenderedWater: (point, margin = 0) => Math.hypot(
        point.x - descriptor.center.x, point.z - descriptor.center.z
      ) >= descriptor.innerRadius + margin && !SMALL_ISLAND_LOCATIONS.some((location) => {
        const dx = (point.x - location.worldPosition.x) / Math.max(.1, location.radii.x * 1.08 + margin);
        const dz = (point.z - location.worldPosition.z) / Math.max(.1, location.radii.z * 1.08 + margin);
        return Math.hypot(dx, dz) <= 1;
      }),
      distanceToRenderedWater: (point) => {
        const radial = Math.hypot(point.x - descriptor.center.x, point.z - descriptor.center.z);
        if (radial < descriptor.innerRadius) return descriptor.innerRadius - radial;
        const island = SMALL_ISLAND_LOCATIONS.find((location) => {
          const dx = (point.x - location.worldPosition.x) / (location.radii.x * 1.08);
          const dz = (point.z - location.worldPosition.z) / (location.radii.z * 1.08);
          return Math.hypot(dx, dz) <= 1;
        });
        if (!island) return Math.max(0, radial - descriptor.outerRadius);
        const normalized = Math.hypot(
          (point.x - island.worldPosition.x) / (island.radii.x * 1.08),
          (point.z - island.worldPosition.z) / (island.radii.z * 1.08)
        );
        return Math.max(0, 1 - normalized) * Math.min(island.radii.x, island.radii.z) * 1.08;
      },
      surfaceY: OCEAN_SURFACE_Y,
      fishIds: descriptor.fish,
      depth: 'deep',
      modifiers: {
        biteRate: .98,
        size: 1.04,
        rarityBias: .07,
        trophyChance: 1.08,
        maximumSpeciesProbability: ECOLOGY_TARGETS.maximumSpeciesShare
      }
    });
    zone.tier = descriptor.tier;
    zone.waterType = descriptor.waterType;
    zone.theme = descriptor.theme;
    zone.ecologyThemes = [...descriptor.ecologyThemes];
    zone.uniformProbabilities = descriptor.uniformProbabilities;
    zone.probabilityGroup = descriptor.probabilityGroup;
    zone.physicalZone = descriptor.physicalZone ?? 'Ocean';
    this.fishingZones.push(attachZoneEcology(zone));
  }

  buildCaveInteriorShell(location) {
    // Caves use their own thick collision shell beneath the untouched mountain surface.
    // Only the entrance triangles are removed from the exterior mesh, so crossing the mouth
    // genuinely moves below the mountain core instead of following a roofed-over canyon.
    const caveDepth = caveDepthAt(location);
    const entranceRadius = location.radius + caveDepth;
    const halfWidth = location.radii[1] * .72 + 1.15;
    const island = location.offshore
      ? SMALL_ISLAND_LOCATIONS.find((entry) => entry.id === location.offshore)
      : null;
    const entranceTerrainY = rawTerrainHeightAt(location.angle, entranceRadius);
    // Mountain caves begin below the cut gray surface. The previous mouth floor was only
    // 0.28 m below terrain while the arch rose 5.25 m, which let dark tunnel geometry stick
    // outside the mountain and read as an attached facade. Offshore cave geometry keeps its
    // shallow-island floor, while mountain mouths are deliberately inset.
    const entranceFloor = island ? island.elevation + .05 : entranceTerrainY - 2.9;
    const throatFloor = entranceFloor - (island ? 2.45 : 1.45);
    const rearFloor = location.y - 1.08;
    const tunnelHeight = 5.25;
    const entranceArchHeight = island ? tunnelHeight : 2.45;
    const segments = CAVE_TOPOLOGY_CONFIG.tunnelSegments;
    const segmentLength = caveDepth / segments;
    const yaw = inwardYaw(location.angle);
    const floorAt = (t) => {
      if (t <= .22) return lerp(entranceFloor, throatFloor, smoothstep(0, .22, t));
      return lerp(throatFloor, rearFloor, smoothstep(.22, 1, t));
    };

    for (let segment = 0; segment < segments; segment += 1) {
      const outerT = segment / segments;
      const innerT = (segment + 1) / segments;
      const midpointT = (outerT + innerT) * .5;
      const outerFloor = floorAt(outerT);
      const innerFloor = floorAt(innerT);
      const middleFloor = (outerFloor + innerFloor) * .5;
      // The first opaque shell boxes used to extend just beyond the cut mouth because
      // their 1.2-segment depth was centered only half a segment inward. Recess that row
      // behind the true mountain opening while retaining overlap with the second row.
      const entranceRecess = segment === 0 ? segmentLength * .18 : 0;
      const radius = entranceRadius - midpointT * caveDepth - entranceRecess;
      const pitch = -Math.atan2(outerFloor - innerFloor, segmentLength) * 180 / Math.PI;
      const widthScale = 1 + Math.sin(midpointT * Math.PI) * .08;
      const floorCenter = this.point(location.angle, radius, middleFloor - .48);
      this.addBox(`${location.label} interior floor ${segment + 1}`, floorCenter,
        { x: halfWidth * 2 * widthScale, y: .96, z: segmentLength * 1.16 },
        this.materials.cave, { x: pitch, y: yaw, z: 0 });

    }

    // One curved, collidable arch follows the tunnel floor. Its first ring sits behind the
    // omitted core triangles, so the outside silhouette is a hole in terrain—not a facade.
    const archVertices = [];
    const archTriangles = [];
    const archSides = 10;
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const radius = entranceRadius - t * caveDepth - (segment === 0 ? .55 : 0);
      const widthScale = 1 + Math.sin(t * Math.PI) * .08;
      const floor = floorAt(t);
      const localArchHeight = lerp(entranceArchHeight, tunnelHeight, smoothstep(.08, .42, t));
      for (let side = 0; side <= archSides; side += 1) {
        const phase = side / archSides * Math.PI;
        const lateral = Math.cos(phase) * (halfWidth * widthScale + .42);
        const y = floor + Math.sin(phase) * localArchHeight;
        const point = this.point(location.angle, radius, y, lateral);
        archVertices.push([point.x, point.y, point.z]);
      }
    }
    for (let segment = 0; segment < segments; segment += 1) {
      for (let side = 0; side < archSides; side += 1) {
        const a = segment * (archSides + 1) + side;
        const b = a + 1;
        const c = (segment + 1) * (archSides + 1) + side;
        const d = c + 1;
        archTriangles.push([a, c, b], [b, c, d]);
      }
    }
    const archGeometry = new pc.Geometry();
    archGeometry.positions = [];
    archGeometry.indices = [];
    for (const triangle of archTriangles) for (const vertexIndex of triangle) {
      archGeometry.positions.push(...archVertices[vertexIndex]);
      archGeometry.indices.push(archGeometry.indices.length);
    }
    archGeometry.calculateNormals();
    const archMesh = pc.Mesh.fromGeometry(this.app.graphicsDevice, archGeometry);
    const arch = new pc.Entity(`${location.label} rounded core tunnel`);
    arch.addComponent('render');
    arch.render.meshInstances = [new pc.MeshInstance(archMesh, this.materials.caveWall, arch)];
    this.buildTarget.addChild(arch);
    arch.physicsCollider = this.physicsWorld.createCollider(
      this.RAPIER.ColliderDesc.trimesh(new Float32Array(archVertices.flat()), new Uint32Array(archTriangles.flat()))
        .setFriction(.92).setRestitution(0)
    );

    const chamberHalfWidth = Math.max(halfWidth + 1.5, location.radii[1] + 2.1);
    const chamberDepth = location.radii[0] * 2 + 5.2;
    const chamberFloor = this.point(location.angle, location.radius, location.y - 1.18);
    this.addBox(`${location.label} rear chamber floor`, chamberFloor,
      { x: chamberHalfWidth * 2, y: 1.9, z: chamberDepth }, this.materials.cave, { y: yaw });
    for (const side of [-1, 1]) {
      const center = this.point(location.angle, location.radius, location.y + 2.05,
        side * (chamberHalfWidth + .5));
      this.addBox(`${location.label} rear chamber ${side < 0 ? 'left' : 'right'} wall`, center,
        { x: 1.35, y: 7.1, z: chamberDepth + 1.4 }, this.materials.caveWall, { y: yaw });
    }
    this.addBox(`${location.label} rear chamber roof`,
      this.point(location.angle, location.radius, location.y + 5.45),
      { x: chamberHalfWidth * 2 + 2.2, y: 1.6, z: chamberDepth + 1.5 },
      this.materials.caveWall, { y: yaw });
    this.addBox(`${location.label} rear chamber back`,
      this.point(location.angle, location.radius - location.radii[0] - 2.25, location.y + 2.1),
      { x: chamberHalfWidth * 2 + 1.4, y: 7.0, z: 1.7 }, this.materials.caveWall, { y: yaw });

    // The cut mountain triangles themselves are the mouth. Interior side/roof segments
    // overlap the cut edge from behind, so there is no exterior trench, false facade, or
    // unsupported decorative frame around the opening.
  }

  addFishingLocation(location, index) {
    const center = this.point(location.angle, location.radius, location.y);
    const tierBiteRate = ({ lower: .94, middle: 1.03, upper: 1.11, summit: 1.18, waterfall: 1.06 })[location.tier] ?? 1;
    const visibleWaterScale = location.summit ? 1 : .96;
    const visibleRadii = { x: location.radii[0] * visibleWaterScale, z: location.radii[1] * visibleWaterScale };
    const waterfallPath = location.waterfall ? FALLGLASS_WATERFALL_RADII.map((radius) => {
      const angle = fallglassAngleAt(radius);
      return this.point(angle, radius,
        radius >= OCEAN_WATER_INNER_RADIUS ? OCEAN_SURFACE_Y + .04 : this.terrainY(angle, radius) + .4,
        fallglassTangentAt(radius));
    }) : [];
    const zone = new FishingZone({
      id: location.id,
      label: location.label,
      center: { x: center.x, z: center.z },
      radii: visibleRadii,
      shape: location.waterfall ? 'path' : 'ellipse',
      pathPoints: waterfallPath,
      pathWidth: location.waterfall ? 1.35 : 0,
      surfaceY: location.y,
      fishIds: location.fish,
      depth: location.depth,
      modifiers: {
        biteRate: tierBiteRate,
        size: location.size,
        rarityBias: location.rarityBias,
        trophyChance: location.trophyChance,
        maximumSpeciesProbability: location.maximumSpeciesProbability ?? ECOLOGY_TARGETS.maximumSpeciesShare
      }
    });
    // Dynamic metadata is backwards-compatible with the existing FishingZone class and
    // gives the 256-creature population pass clean habitat axes without changing
    // the constructor API in this mountain-only pass.
    zone.tier = location.tier;
    zone.waterType = location.waterType;
    zone.theme = location.theme;
    if (location.ecologyThemes) zone.ecologyThemes = [...location.ecologyThemes];
    zone.uniformProbabilities = Boolean(location.uniformProbabilities);
    zone.probabilityGroup = location.probabilityGroup ?? location.id;
    zone.cave = Boolean(location.cave);
    zone.waterfall = Boolean(location.waterfall);
    zone.physicalZone = location.physicalZone ?? location.label;
    this.fishingZones.push(attachZoneEcology(zone));
    if (location.waterfall) return;
    const waterThickness = .08;
    const waterCenter = { x: center.x, y: location.y - waterThickness * .5, z: center.z };
    const water = this.addCylinder(`${location.label} water`, waterCenter,
      { x: visibleRadii.x * 2, y: waterThickness, z: visibleRadii.z * 2 },
      location.depth === 'deep' ? this.materials.deepWater : this.materials.shallowWater, {}, false);
    water.render.castShadows = false;
    this.mountainWaters.push({
      entity: water,
      base: { x: visibleRadii.x * 2, y: waterThickness, z: visibleRadii.z * 2 },
      rate: .31 + index * .035
    });

    if (location.summit) return;
    if (location.cave) {
      this.buildCaveInteriorShell(location);
      return;
    }
    for (let stone = 0; stone < 4; stone += 1) {
      const stoneAngle = location.angle + (stone - 1.5) * 4.6;
      const stoneRadius = location.radius + Math.max(location.radii[0], location.radii[1]) + 1.1;
      const y = this.terrainY(stoneAngle, stoneRadius);
      const point = this.point(stoneAngle, stoneRadius, y + .45);
      this.addMountainBoulder(`${location.label} shore stone ${stone + 1}`, point,
        { x: 1.25 + (stone % 2) * .45, y: .9 + (stone % 3) * .22, z: 1.35 },
        ['upper', 'summit'].includes(location.tier) ? this.materials.alpine : this.materials.waterEdge);
    }
  }

  addMountainTree(x, z, baseY, size, name) {
    const trunk = this.addCylinder(`${name} climbable trunk`, { x, y: baseY + 1.25 * size, z },
      { x: .68 * size, y: 2.5 * size, z: .68 * size }, this.materials.wood);
    this.registerClimbSurface(trunk, trunk.physicsCollider, 'rough', `${name} trunk`);
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
    const anchor = NAMED_CLIMB_ANCHORS.reduce((best, candidate) => {
      const distance = angularDistance(angle, candidate.angle);
      return !best || distance < best.distance ? { anchor: candidate, distance } : best;
    }, null);
    // Named areas are navigation flavor only; they no longer correspond to exclusive
    // climb corridors. Keep the names locally around their landmark sectors.
    if (anchor && anchor.distance <= 8 && Math.hypot(point.x - MOUNTAIN_CENTER.x, point.z - MOUNTAIN_CENTER.z) < 174) {
      return anchor.anchor.label;
    }
    return SECTORS[Math.floor((angle + 30) / 60) % 6];
  }

  getElevationBand(y) {
    if (y < 24) return 'Coast / foothills';
    if (y < 62) return 'Lower mountain';
    if (y < 105) return 'Middle mountain';
    if (y < CROWN_BASE_HEIGHT) return 'Upper / alpine';
    if (y < SUMMIT_HEIGHT - 1) return 'Summit crown';
    return 'Summit';
  }

  inferGroundMaterial(point, climbMaterial = null) {
    if (climbMaterial) return climbMaterial;
    if (point.y >= CROWN_BASE_HEIGHT) return 'crown climb web / sheer summit rock';
    if (point.y >= 105) return 'alpine rock / snow';
    const sector = this.getSector(point);
    if (sector.includes('Waterfall')) return 'smooth rock';
    if (sector.includes('Chimney')) return 'rough / normal rock';
    if (sector === 'Sandy Beach' || sector === 'Sheltered Cove') return 'sand / rough rock';
    if (sector === 'Forest Inlet') return 'forest floor / rough rock';
    return 'normal / rough rock';
  }

  getWorldInfo(point, climbMaterial = null) {
    const elevation = Math.max(0, point.y - PLAYER_FOOT_OFFSET);
    const course = this.isInDeveloperCourse(point);
    return {
      sector: course ? 'Developer Course' : this.getSector(point),
      elevation,
      band: course ? 'Mechanics test' : this.getElevationBand(elevation),
      material: this.inferGroundMaterial(point, climbMaterial),
      rockSupport: this.rockSupportAudit,
      rockDensity: this.rockDensityAudit
    };
  }

  getMapData() {
    return createMountainMapData();
  }

  isInDeveloperCourse(point) {
    return Math.abs(point.x) < 34 && Math.abs(point.z) < 34;
  }

  isFatalPosition(point) {
    return point.y < OUT_OF_WORLD_FALL_Y;
  }

  isAtSummit(point) {
    return point.y >= SUMMIT_HEIGHT - .7
      && Math.hypot(point.x - MOUNTAIN_CENTER.x, point.z - MOUNTAIN_CENTER.z) <= this.summitRadius;
  }

  getDebugTarget(code) {
    if (/^Digit[1-6]$/.test(code)) return START_LOCATIONS[Number(code.at(-1)) - 1];
    const targets = {
      Digit7: { label: 'Lower climb web sample', position: this.point(20, escarpmentRadiusAt(ESCARPMENTS[0], 20) + ESCARPMENTS[0].width + 3, this.terrainY(20, escarpmentRadiusAt(ESCARPMENTS[0], 20) + ESCARPMENTS[0].width + 3) + 1.25), facingYaw: inwardYaw(20) },
      Digit8: { label: 'Middle climb web sample', position: this.point(183, escarpmentRadiusAt(ESCARPMENTS[1], 183) + ESCARPMENTS[1].width + 3, this.terrainY(183, escarpmentRadiusAt(ESCARPMENTS[1], 183) + ESCARPMENTS[1].width + 3) + 1.25, 1.5), facingYaw: inwardYaw(183) },
      Digit9: { label: 'Alpine climb web sample', position: this.point(265, escarpmentRadiusAt(ESCARPMENTS[2], 265) + ESCARPMENTS[2].width + 3, this.terrainY(265, escarpmentRadiusAt(ESCARPMENTS[2], 265) + ESCARPMENTS[2].width + 3) + 1.25), facingYaw: inwardYaw(265) },
      Digit0: { label: 'Crown climb web sample', position: this.point(125, CROWN_BASE_RADIUS + 3, CROWN_BASE_HEIGHT + 1.25), facingYaw: inwardYaw(125) },
      KeyT: { label: 'Mechanics course', position: { x: -14, y: 2.1, z: 12 }, facingYaw: 0 },
      KeyV: { label: 'Grip test wall', position: { x: -14, y: 2.8, z: 8.45 }, facingYaw: 0 },
      KeyY: { label: 'Upper climb web traverse', position: this.point(147, 74, this.terrainY(147, 74) + 1.25), facingYaw: inwardYaw(147) },
      KeyO: { label: 'Sunwash fishing shore', position: this.point(348, 197, 1.25), facingYaw: inwardYaw(348) },
      KeyU: { label: 'Out-of-world fall test', position: this.point(0, OCEAN_FLOOR_OUTER_RADIUS + 2, .2), facingYaw: 270 },
      F8: { label: 'Temporary summit rim', position: this.point(270, 6.1, SUMMIT_HEIGHT + PLAYER_FOOT_OFFSET + .16), facingYaw: inwardYaw(270) }
    };
    return targets[code] ?? null;
  }

  update(dt) {
    super.update(dt);
    this.updateAquariumSwimming();
    // Water footprints are intentionally static. Scaling transparent discs every frame
    // made their edges cross the terrain carve and produced intermittent clipping/z-fighting.
  }
}
