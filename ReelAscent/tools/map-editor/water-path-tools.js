const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => value == null ? value : structuredClone(value);

const point = (value = {}) => Array.isArray(value)
  ? { x: finite(value[0]), y: finite(value[1]), z: finite(value[2]) }
  : { x: finite(value.x), y: finite(value.y), z: finite(value.z) };

export function normalizeWaterPath(input = {}) {
  const sourcePoints = input.points ?? input.pathPoints ?? input.pathLocal ?? [];
  const points = sourcePoints.map((entry) => {
    if (Array.isArray(entry) && entry.length === 2) return { x: finite(entry[0]), y: finite(input.surfaceY ?? input.surfaceLocalY), z: finite(entry[1]) };
    return point(entry);
  });
  const closed = input.closed === true || input.shape === 'lazy-river'
    || (points.length > 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) < 1e-5);
  if (closed && points.length > 2 && Math.hypot(points[0].x - points.at(-1).x, points[0].z - points.at(-1).z) > 1e-5) points.push(clone(points[0]));
  return {
    id: String(input.id || 'water-path'), name: String(input.name || input.label || input.id || 'Water Path'),
    type: String(input.type || input.waterType || (closed ? 'lazy-river' : 'stream')),
    points, closed, width: Math.max(.1, finite(input.width ?? input.pathWidth, 1.5)),
    depth: Math.max(.05, finite(input.depthMeters ?? input.depth, .75)),
    flowSpeed: Math.max(0, finite(input.flowSpeed ?? input.currentSpeed, .65)),
    direction: input.direction === -1 || input.direction === 'reverse' ? -1 : 1,
    fishable: input.fishable !== false, ecologyId: input.ecologyId ?? input.identity ?? input.id ?? null,
    materialRole: String(input.materialRole || 'water'), metadata: clone(input.metadata ?? {})
  };
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c), o2 = orientation(a, b, d), o3 = orientation(c, d, a), o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function validateWaterPath(input) {
  const path = normalizeWaterPath(input);
  const issues = [];
  if (path.points.length < (path.closed ? 4 : 2)) issues.push({ severity: 'error', code: 'water-path-points', message: 'Path needs more control points.' });
  if (path.closed && Math.hypot(path.points[0]?.x - path.points.at(-1)?.x, path.points[0]?.z - path.points.at(-1)?.z) > 1e-5) {
    issues.push({ severity: 'error', code: 'water-path-open', message: 'Lazy-river loop is not closed.' });
  }
  if (path.width < 1.2 && path.type === 'lazy-river') issues.push({ severity: 'warning', code: 'river-width', message: 'Lazy river is narrower than 1.2 m.' });
  if (path.depth < .45 && path.type === 'lazy-river') issues.push({ severity: 'warning', code: 'river-depth', message: 'Lazy river is shallower than 0.45 m.' });
  for (let index = 1; index < path.points.length - 1; index += 1) {
    const a = path.points[index - 1], b = path.points[index], c = path.points[index + 1];
    const ab = [a.x - b.x, a.z - b.z], cb = [c.x - b.x, c.z - b.z];
    const length = Math.hypot(...ab) * Math.hypot(...cb);
    if (!length) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (ab[0] * cb[0] + ab[1] * cb[1]) / length))) * 180 / Math.PI;
    if (angle < 28) issues.push({ severity: 'warning', code: 'river-sharp-corner', nodeIndex: index, message: `Path node ${index + 1} has a ${angle.toFixed(1)}° corner.` });
  }
  for (let first = 0; first < path.points.length - 1; first += 1) {
    for (let second = first + 2; second < path.points.length - 1; second += 1) {
      if (path.closed && first === 0 && second === path.points.length - 2) continue;
      if (segmentsIntersect(path.points[first], path.points[first + 1], path.points[second], path.points[second + 1])) {
        issues.push({ severity: 'warning', code: 'river-self-intersection', segmentIndex: first, otherSegmentIndex: second, message: `Path segments ${first + 1} and ${second + 1} intersect.` });
      }
    }
  }
  return issues;
}

function segments(path) {
  const result = [];
  for (let index = 0; index < path.points.length - 1; index += 1) {
    const a = path.points[index], b = path.points[index + 1];
    const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (length > 1e-6) result.push({ a, b, length, index });
  }
  return result;
}

export function waterPathPose(input, distanceOrProgress = 0, { normalized = false } = {}) {
  const path = normalizeWaterPath(input);
  const list = segments(path);
  const totalLength = list.reduce((sum, segment) => sum + segment.length, 0);
  if (!list.length) return { position: clone(path.points[0] ?? { x: 0, y: 0, z: 0 }), tangent: { x: 0, y: 0, z: 1 }, yaw: 0, distance: 0, totalLength };
  let distance = normalized ? finite(distanceOrProgress) * totalLength : finite(distanceOrProgress);
  if (path.closed) distance = ((distance % totalLength) + totalLength) % totalLength;
  else distance = Math.max(0, Math.min(totalLength, distance));
  if (path.direction < 0) distance = totalLength - distance;
  let remaining = distance;
  let current = list.at(-1);
  for (const segment of list) {
    current = segment;
    if (remaining <= segment.length) break;
    remaining -= segment.length;
  }
  const t = Math.max(0, Math.min(1, remaining / current.length));
  const tangent = {
    x: (current.b.x - current.a.x) / current.length,
    y: (current.b.y - current.a.y) / current.length,
    z: (current.b.z - current.a.z) / current.length
  };
  return {
    position: {
      x: current.a.x + (current.b.x - current.a.x) * t,
      y: current.a.y + (current.b.y - current.a.y) * t,
      z: current.a.z + (current.b.z - current.a.z) * t
    },
    tangent, yaw: Math.atan2(tangent.x, tangent.z) * 180 / Math.PI,
    distance, totalLength, segmentIndex: current.index
  };
}

export function reverseWaterPath(input) {
  const path = normalizeWaterPath(input);
  const closed = path.closed;
  let points = [...path.points];
  if (closed && points.length > 1) points = points.slice(0, -1);
  points.reverse();
  if (closed) points.push(clone(points[0]));
  path.points = points;
  path.direction *= -1;
  return path;
}

export function addWaterPathNode(input, pointValue, afterIndex = null) {
  const path = normalizeWaterPath(input);
  const closed = path.closed;
  let points = closed ? path.points.slice(0, -1) : [...path.points];
  const index = afterIndex == null ? points.length : Math.max(0, Math.min(points.length, Math.trunc(afterIndex) + 1));
  points.splice(index, 0, point(pointValue));
  if (closed && points.length) points.push(clone(points[0]));
  path.points = points;
  return path;
}

export function deleteWaterPathNode(input, nodeIndex) {
  const path = normalizeWaterPath(input);
  const closed = path.closed;
  let points = closed ? path.points.slice(0, -1) : [...path.points];
  points.splice(Math.max(0, Math.min(points.length - 1, Math.trunc(nodeIndex))), 1);
  if (closed && points.length) points.push(clone(points[0]));
  path.points = points;
  return path;
}

export function authoredWaterToPath(water) {
  return normalizeWaterPath({
    id: water.id, name: water.label, type: water.waterType === 'lazy-river' ? 'lazy-river' : water.shape,
    pathLocal: water.pathLocal, surfaceLocalY: water.surfaceLocalY,
    pathWidth: water.pathWidth, depthMeters: finite(water.surfaceLocalY) - finite(water.floorLocalY),
    flowSpeed: water.flowSpeed, direction: water.flowDirection, closed: water.closedLoop,
    fishable: water.fishable !== false, ecologyId: water.id, materialRole: water.visualMaterialRole || 'water', metadata: water.metadata
  });
}

export function pathToAuthoredWater(pathInput, base = {}) {
  const path = normalizeWaterPath(pathInput);
  const surface = path.points[0]?.y ?? finite(base.surfaceLocalY);
  return {
    ...clone(base), id: path.id, label: path.name, shape: path.type === 'lazy-river' ? 'path' : (base.shape || 'path'),
    pathLocal: path.points.map((entry) => [entry.x, entry.z]), pathWidth: path.width,
    surfaceLocalY: surface, floorLocalY: surface - path.depth,
    waterType: path.type, closedLoop: path.closed, flowSpeed: path.flowSpeed,
    flowDirection: path.direction, fishable: path.fishable, visualMaterialRole: path.materialRole,
    rideable: path.type === 'lazy-river' ? base.rideable !== false : base.rideable
  };
}
