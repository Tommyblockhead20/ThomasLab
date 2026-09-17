export const PATCH_SCHEMA = 1;
export const METERS_PER_FOOT = 0.3048;
export const FEET_PER_METER = 1 / METERS_PER_FOOT;

export const DEFAULT_PROFILE_FEET = Object.freeze([
  [0, 0],
  [150, 150],
  [300, 300],
  [450, 450],
  [600, 600],
  [750, 750],
  [900, 900],
  [1000, 1000]
]);

export function makeEmptyPatch() {
  return {
    schema: PATCH_SCHEMA,
    game: 'Reel Ascent',
    map: 'main-mountain',
    updatedAt: new Date().toISOString(),
    terrain: {
      profile: DEFAULT_PROFILE_FEET.map(([sourceFt, targetFt]) => ({ sourceFt, targetFt })),
      strokes: [],
      dents: [],
      cuts: [],
      bakedMesh: null
    },
    hiddenObjectIds: [],
    objectOverrides: {},
    placedObjects: [],
    fishingOverrides: {},
    tunnels: []
  };
}

export function normalizePatch(input) {
  const base = makeEmptyPatch();
  const source = input && typeof input === 'object' ? input : {};
  const terrain = source.terrain && typeof source.terrain === 'object' ? source.terrain : {};
  const profile = Array.isArray(terrain.profile) && terrain.profile.length >= 2
    ? terrain.profile
        .map((point) => ({
          sourceFt: Number(point.sourceFt),
          targetFt: Number(point.targetFt)
        }))
        .filter((point) => Number.isFinite(point.sourceFt) && Number.isFinite(point.targetFt))
        .sort((a, b) => a.sourceFt - b.sourceFt)
    : base.terrain.profile;

  return {
    ...base,
    ...source,
    schema: PATCH_SCHEMA,
    terrain: {
      profile,
      strokes: Array.isArray(terrain.strokes) ? terrain.strokes.map((stroke) => ({ ...stroke })) : [],
      dents: Array.isArray(terrain.dents) ? terrain.dents.map((dent) => ({ ...dent })) : [],
      cuts: Array.isArray(terrain.cuts) ? terrain.cuts.map((cut) => ({ ...cut })) : [],
      bakedMesh: normalizeBakedMesh(terrain.bakedMesh)
    },
    hiddenObjectIds: Array.isArray(source.hiddenObjectIds)
      ? [...new Set(source.hiddenObjectIds.filter(Boolean).map(String))]
      : [],
    objectOverrides: source.objectOverrides && typeof source.objectOverrides === 'object'
      ? structuredClone(source.objectOverrides)
      : {},
    placedObjects: Array.isArray(source.placedObjects)
      ? source.placedObjects.map((item) => ({ ...item }))
      : [],
    fishingOverrides: source.fishingOverrides && typeof source.fishingOverrides === 'object'
      ? structuredClone(source.fishingOverrides)
      : {},
    tunnels: Array.isArray(source.tunnels)
      ? source.tunnels.map((tunnel) => ({
          ...tunnel,
          entrance: tunnel?.entrance ? { ...tunnel.entrance } : null,
          target: tunnel?.target ? { ...tunnel.target } : null
        })).filter((tunnel) => tunnel.id && tunnel.entrance && tunnel.target)
      : []
  };
}


function normalizeBakedMesh(value) {
  if (!value || typeof value !== 'object') return null;
  const positionSource = Array.isArray(value.positions) || ArrayBuffer.isView(value.positions) ? value.positions : [];
  const indexSource = Array.isArray(value.indices) || ArrayBuffer.isView(value.indices) ? value.indices : [];
  const positions = Array.from(positionSource, Number).filter(Number.isFinite);
  const indices = Array.from(indexSource, (n) => Math.trunc(Number(n))).filter(Number.isFinite);
  if (positions.length < 9 || positions.length % 3 || indices.length < 3 || indices.length % 3) return null;
  const vertexCount = positions.length / 3;
  if (indices.some((index) => index < 0 || index >= vertexCount)) return null;
  return {
    format: 'triangle-mesh-v1',
    positions,
    indices,
    source: value.source || 'editor-bake',
    bakedAt: value.bakedAt || null
  };
}
export function remapProfileMeters(heightMeters, profile = DEFAULT_PROFILE_FEET) {
  const heightFt = heightMeters * FEET_PER_METER;
  const points = (profile || []).map((point) => Array.isArray(point)
    ? { sourceFt: Number(point[0]), targetFt: Number(point[1]) }
    : { sourceFt: Number(point.sourceFt), targetFt: Number(point.targetFt) }
  ).filter((point) => Number.isFinite(point.sourceFt) && Number.isFinite(point.targetFt))
    .sort((a, b) => a.sourceFt - b.sourceFt);

  if (points.length < 2) return heightMeters;
  if (heightFt <= points[0].sourceFt) {
    return (heightFt + points[0].targetFt - points[0].sourceFt) * METERS_PER_FOOT;
  }
  const last = points[points.length - 1];
  if (heightFt >= last.sourceFt) {
    return (heightFt + last.targetFt - last.sourceFt) * METERS_PER_FOOT;
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    if (heightFt < a.sourceFt || heightFt > b.sourceFt) continue;
    const span = Math.max(0.0001, b.sourceFt - a.sourceFt);
    const t = (heightFt - a.sourceFt) / span;
    const target = a.targetFt + (b.targetFt - a.targetFt) * t;
    return target * METERS_PER_FOOT;
  }
  return heightMeters;
}

function smoothFalloff(distance, radius) {
  if (radius <= 0 || distance >= radius) return 0;
  const t = Math.max(0, Math.min(1, 1 - distance / radius));
  return t * t * (3 - 2 * t);
}

export function applyTerrainPatchHeight(baseHeight, worldX, worldZ, patch) {
  const normalized = patch?.terrain ? patch : normalizePatch(patch);
  let height = remapProfileMeters(baseHeight, normalized.terrain.profile);
  for (const stroke of normalized.terrain.strokes) {
    const x = Number(stroke.x);
    const z = Number(stroke.z);
    const radius = Math.max(0.01, Number(stroke.radius) || 0);
    const delta = Number(stroke.deltaMeters) || 0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const weight = smoothFalloff(Math.hypot(worldX - x, worldZ - z), radius);
    height += delta * weight;
  }
  // Indents are deliberately NOT holes. They smoothly push the terrain inward/downward
  // while preserving a continuous render/collision surface. Use cuts only for true openings.
  for (const dent of normalized.terrain.dents ?? []) {
    const x = Number(dent.x);
    const z = Number(dent.z);
    const radius = Math.max(0.01, Number(dent.radius) || 0);
    const depth = Math.max(0, Number(dent.depthMeters) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(z) || depth <= 0) continue;
    const weight = smoothFalloff(Math.hypot(worldX - x, worldZ - z), radius);
    height -= depth * weight;
  }
  return height;
}

export function pointIsCut(worldX, worldZ, patch) {
  const cuts = patch?.terrain?.cuts ?? [];
  return cuts.some((cut) => {
    const radius = Math.max(0, Number(cut.radius) || 0);
    return Math.hypot(worldX - Number(cut.x), worldZ - Number(cut.z)) <= radius;
  });
}

function tunnelPortalPointIsCut(worldX, worldZ, tunnel) {
  const entrance = tunnel?.entrance;
  const target = tunnel?.target;
  if (!entrance || !target) return false;
  const ex = Number(entrance.x) || 0;
  const ez = Number(entrance.z) || 0;
  const dx = (Number(target.x) || 0) - ex;
  const dz = (Number(target.z) || 0) - ez;
  const length = Math.max(.001, Math.hypot(dx, dz));
  const inwardX = dx / length;
  const inwardZ = dz / length;
  const rightX = inwardZ;
  const rightZ = -inwardX;
  const relX = worldX - ex;
  const relZ = worldZ - ez;
  const inward = relX * inwardX + relZ * inwardZ;
  const lateral = relX * rightX + relZ * rightZ;
  const width = Math.max(1.8, Number(tunnel.width) || 5);
  const mouthRecess = Math.max(1.2, Math.min(10, Number(tunnel.mouthRecess) || 5.0));
  const cutDepth = Math.max(1.4, Math.min(5.5, Number(tunnel.portalCutDepth) || Math.min(2.4, mouthRecess * .55)));
  const halfWidth = Math.max(.75, Number(tunnel.portalHalfWidth) || width * .42);
  const innerEdge = mouthRecess - cutDepth;
  const outerEdge = mouthRecess + .65;
  if (inward < innerEdge || inward > outerEdge) return false;
  const t = Math.max(0, Math.min(1, (inward - innerEdge) / Math.max(.001, outerEdge - innerEdge)));
  const widthScale = .62 + Math.sin(t * Math.PI) * .38 - t * .06;
  return Math.abs(lateral) <= halfWidth * Math.max(.5, widthScale);
}

export function triangleIsCut(a, b, c, patch, center = { x: 0, z: 0 }) {
  const points = [a, b, c, [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3
  ]];
  return points.some((point) => {
    const x = point[0] + center.x;
    const z = point[2] + center.z;
    if (pointIsCut(x, z, patch)) return true;
    return (patch?.tunnels ?? []).some((tunnel) => tunnelPortalPointIsCut(x, z, tunnel));
  });
}

export function applyMidPlateauPreset(patch, raiseFeet = 150) {
  const normalized = normalizePatch(patch);
  const r = Number(raiseFeet) || 150;
  normalized.terrain.profile = [
    { sourceFt: 0, targetFt: 0 },
    { sourceFt: 250, targetFt: 250 },
    { sourceFt: 375, targetFt: 375 },
    { sourceFt: 500, targetFt: 500 + r },
    { sourceFt: 650, targetFt: 650 + r * 0.78 },
    { sourceFt: 800, targetFt: 800 + r * 0.42 },
    { sourceFt: 925, targetFt: 925 + r * 0.12 },
    { sourceFt: 1000, targetFt: 1000 }
  ];
  normalized.updatedAt = new Date().toISOString();
  return normalized;
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}
