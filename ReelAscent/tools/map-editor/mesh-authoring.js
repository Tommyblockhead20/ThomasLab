const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clone = (value) => value == null ? value : structuredClone(value);
export const edgeKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;

export function vertex(mesh, index) {
  const offset = index * 3;
  return [mesh.positions[offset], mesh.positions[offset + 1], mesh.positions[offset + 2]];
}

export function faceVertices(mesh, faceIndex) {
  const offset = faceIndex * 3;
  return [mesh.indices[offset], mesh.indices[offset + 1], mesh.indices[offset + 2]];
}

export function triangleMetrics(mesh, faceIndex) {
  const [ai, bi, ci] = faceVertices(mesh, faceIndex);
  const a = vertex(mesh, ai), b = vertex(mesh, bi), c = vertex(mesh, ci);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const cross = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0]
  ];
  const doubleArea = Math.hypot(...cross);
  const normal = doubleArea > 1e-12 ? cross.map((value) => value / doubleArea) : [0, 0, 0];
  return {
    vertices: [ai, bi, ci], points: [a, b, c], normal,
    area: doubleArea * .5,
    centroid: [
      (a[0] + b[0] + c[0]) / 3,
      (a[1] + b[1] + c[1]) / 3,
      (a[2] + b[2] + c[2]) / 3
    ],
    edgeLengths: [
      Math.hypot(...ab), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]), Math.hypot(...ac)
    ]
  };
}

export function normalizeEditableMesh(input, { id = 'mesh' } = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const positions = Array.from(source.positions ?? [], (value) => finite(value));
  const indices = Array.from(source.indices ?? [], (value) => Math.trunc(finite(value, -1)));
  if (positions.length % 3) throw new Error('Mesh positions must be xyz triples.');
  if (indices.length % 3) throw new Error('Mesh indices must be triangle triples.');
  const vertexCount = positions.length / 3;
  if (indices.some((index) => index < 0 || index >= vertexCount)) throw new Error('Mesh contains an out-of-range index.');
  return {
    ...clone(source), id: String(source.id || id), format: source.format || 'triangle-mesh-v1',
    positions, indices, revision: Math.max(0, Math.trunc(finite(source.revision)))
  };
}

export function makeMeshSelection({ vertices = [], edges = [], faces = [] } = {}) {
  return {
    vertices: new Set([...vertices].map(Number).filter(Number.isInteger)),
    edges: new Set([...edges].map(String)),
    faces: new Set([...faces].map(Number).filter(Number.isInteger))
  };
}

export function serializeMeshSelection(selection = makeMeshSelection()) {
  return {
    vertices: [...selection.vertices].sort((a, b) => a - b),
    edges: [...selection.edges].sort(),
    faces: [...selection.faces].sort((a, b) => a - b)
  };
}

export function meshTopology(meshInput) {
  const mesh = normalizeEditableMesh(meshInput);
  const vertexCount = mesh.positions.length / 3;
  const faceCount = mesh.indices.length / 3;
  const edgeFaces = new Map();
  const vertexFaces = Array.from({ length: vertexCount }, () => new Set());
  const vertexNeighbors = Array.from({ length: vertexCount }, () => new Set());
  const duplicateFaces = [];
  const faceKeys = new Map();
  const zeroAreaFaces = [];
  const thinFaces = [];

  for (let face = 0; face < faceCount; face += 1) {
    const ids = faceVertices(mesh, face);
    const canonical = [...ids].sort((a, b) => a - b).join(':');
    if (faceKeys.has(canonical)) duplicateFaces.push([faceKeys.get(canonical), face]);
    else faceKeys.set(canonical, face);
    const metrics = triangleMetrics(mesh, face);
    if (metrics.area <= 1e-9) zeroAreaFaces.push(face);
    const longest = Math.max(...metrics.edgeLengths);
    if (metrics.area > 1e-9 && longest > 0 && metrics.area / (longest * longest) < 1e-4) thinFaces.push(face);
    for (const id of ids) vertexFaces[id].add(face);
    for (const [a, b] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      const key = edgeKey(a, b);
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(face);
      vertexNeighbors[a].add(b); vertexNeighbors[b].add(a);
    }
  }
  const boundaryEdges = [];
  const nonManifoldEdges = [];
  for (const [key, faces] of edgeFaces) {
    if (faces.length === 1) boundaryEdges.push(key);
    else if (faces.length > 2) nonManifoldEdges.push(key);
  }
  const isolatedVertices = vertexFaces.flatMap((faces, index) => faces.size ? [] : [index]);
  return {
    mesh, vertexCount, faceCount, edgeFaces, vertexFaces, vertexNeighbors,
    boundaryEdges, nonManifoldEdges, isolatedVertices, duplicateFaces, zeroAreaFaces, thinFaces
  };
}

export function boundaryLoops(meshInput) {
  const topology = meshTopology(meshInput);
  const neighbors = new Map();
  for (const key of topology.boundaryEdges) {
    const [a, b] = key.split(':').map(Number);
    if (!neighbors.has(a)) neighbors.set(a, new Set());
    if (!neighbors.has(b)) neighbors.set(b, new Set());
    neighbors.get(a).add(b); neighbors.get(b).add(a);
  }
  const unused = new Set(topology.boundaryEdges);
  const loops = [];
  while (unused.size) {
    const firstKey = unused.values().next().value;
    const [start, next] = firstKey.split(':').map(Number);
    const chain = [start, next];
    unused.delete(firstKey);
    let previous = start;
    let current = next;
    while (chain.length <= topology.vertexCount + 1) {
      const candidate = [...(neighbors.get(current) ?? [])]
        .find((id) => id !== previous && unused.has(edgeKey(current, id)));
      if (candidate == null) break;
      unused.delete(edgeKey(current, candidate));
      if (candidate === chain[0]) { chain.push(candidate); break; }
      chain.push(candidate);
      previous = current;
      current = candidate;
    }
    loops.push({ vertices: chain, closed: chain.length > 2 && chain[0] === chain.at(-1) });
  }
  return loops;
}

function touch(mesh) {
  mesh.revision = Math.max(0, Math.trunc(finite(mesh.revision))) + 1;
  mesh.editedAt = new Date().toISOString();
  return mesh;
}

export function createFace(meshInput, vertexIds) {
  const mesh = normalizeEditableMesh(meshInput);
  const ids = [...new Set(vertexIds.map(Number))];
  if (ids.length !== 3 || ids.some((id) => !Number.isInteger(id) || id < 0 || id >= mesh.positions.length / 3)) {
    throw new Error('Create Face requires exactly three valid vertices.');
  }
  const canonical = [...ids].sort((a, b) => a - b).join(':');
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    if ([...faceVertices(mesh, face)].sort((a, b) => a - b).join(':') === canonical) throw new Error('That face already exists.');
  }
  mesh.indices.push(...ids);
  if (triangleMetrics(mesh, mesh.indices.length / 3 - 1).area <= 1e-9) throw new Error('Cannot create a zero-area face.');
  return touch(mesh);
}

export function deleteFaces(meshInput, faceIds) {
  const mesh = normalizeEditableMesh(meshInput);
  const remove = new Set([...faceIds].map(Number));
  mesh.indices = mesh.indices.filter((_, offset) => !remove.has(Math.floor(offset / 3)));
  return touch(mesh);
}

export function flipFaces(meshInput, faceIds) {
  const mesh = normalizeEditableMesh(meshInput);
  for (const face of new Set([...faceIds].map(Number))) {
    const offset = face * 3;
    if (offset < 0 || offset + 2 >= mesh.indices.length) continue;
    [mesh.indices[offset + 1], mesh.indices[offset + 2]] = [mesh.indices[offset + 2], mesh.indices[offset + 1]];
  }
  return touch(mesh);
}

export function moveSelectedVertices(meshInput, selection, delta = {}) {
  const mesh = normalizeEditableMesh(meshInput);
  const ids = new Set(selection?.vertices ?? []);
  for (const face of selection?.faces ?? []) for (const id of faceVertices(mesh, face)) ids.add(id);
  for (const key of selection?.edges ?? []) for (const id of String(key).split(':').map(Number)) ids.add(id);
  const dx = finite(delta.x), dy = finite(delta.y), dz = finite(delta.z);
  for (const id of ids) {
    const offset = id * 3;
    if (offset < 0 || offset + 2 >= mesh.positions.length) continue;
    mesh.positions[offset] += dx; mesh.positions[offset + 1] += dy; mesh.positions[offset + 2] += dz;
  }
  return touch(mesh);
}

function selectedVertexSet(mesh, selection) {
  const ids = new Set(selection?.vertices ?? []);
  for (const face of selection?.faces ?? []) for (const id of faceVertices(mesh, face)) ids.add(id);
  for (const key of selection?.edges ?? []) for (const id of String(key).split(':').map(Number)) ids.add(id);
  return ids;
}

export function flattenSelection(meshInput, selection, axis = 'y') {
  const mesh = normalizeEditableMesh(meshInput);
  const component = { x: 0, y: 1, z: 2 }[axis] ?? 1;
  const ids = [...selectedVertexSet(mesh, selection)];
  if (ids.length < 2) throw new Error('Flatten requires at least two selected vertices.');
  const average = ids.reduce((sum, id) => sum + mesh.positions[id * 3 + component], 0) / ids.length;
  for (const id of ids) mesh.positions[id * 3 + component] = average;
  return touch(mesh);
}

export function inflateSelection(meshInput, selection, distance = .1) {
  let mesh = recalculateVertexNormals(meshInput);
  const ids = selectedVertexSet(mesh, selection);
  if (!ids.size) throw new Error('Inflate/Deflate requires selected mesh elements.');
  const amount = finite(distance, .1);
  for (const id of ids) {
    const offset = id * 3;
    mesh.positions[offset] += mesh.normals[offset] * amount;
    mesh.positions[offset + 1] += mesh.normals[offset + 1] * amount;
    mesh.positions[offset + 2] += mesh.normals[offset + 2] * amount;
  }
  return touch(mesh);
}

export function subdivideFaces(meshInput, faceIds) {
  const mesh = normalizeEditableMesh(meshInput);
  const selected = new Set([...faceIds].map(Number));
  if (!selected.size) throw new Error('Subdivide requires one or more selected faces.');
  const midpointByEdge = new Map();
  const midpoint = (a, b) => {
    const key = edgeKey(a, b);
    if (midpointByEdge.has(key)) return midpointByEdge.get(key);
    const av = vertex(mesh, a), bv = vertex(mesh, b);
    const id = mesh.positions.length / 3;
    mesh.positions.push((av[0] + bv[0]) / 2, (av[1] + bv[1]) / 2, (av[2] + bv[2]) / 2);
    midpointByEdge.set(key, id);
    return id;
  };
  const indices = [];
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const [a, b, c] = faceVertices(mesh, face);
    if (!selected.has(face)) { indices.push(a, b, c); continue; }
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    indices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  mesh.indices = indices;
  return touch(mesh);
}

export function fillBoundary(meshInput, loopInput) {
  const mesh = normalizeEditableMesh(meshInput);
  let loop = [...loopInput].map(Number);
  if (loop[0] === loop.at(-1)) loop = loop.slice(0, -1);
  if (loop.length < 3) throw new Error('Fill Hole requires a boundary loop with at least three vertices.');
  if (loop.length === 3) return createFace(mesh, loop);
  const center = [0, 0, 0];
  for (const id of loop) {
    const point = vertex(mesh, id);
    center[0] += point[0]; center[1] += point[1]; center[2] += point[2];
  }
  center[0] /= loop.length; center[1] /= loop.length; center[2] /= loop.length;
  const centerId = mesh.positions.length / 3;
  mesh.positions.push(...center);
  for (let index = 0; index < loop.length; index += 1) {
    mesh.indices.push(loop[index], loop[(index + 1) % loop.length], centerId);
  }
  return touch(mesh);
}

export function bridgeEdgeChains(meshInput, firstInput, secondInput) {
  const mesh = normalizeEditableMesh(meshInput);
  const first = [...firstInput].map(Number), second = [...secondInput].map(Number);
  if (first.length < 2 || first.length !== second.length) throw new Error('Bridge requires two edge chains with equal vertex counts.');
  for (let index = 0; index < first.length - 1; index += 1) {
    const a = first[index], b = first[index + 1], c = second[index], d = second[index + 1];
    mesh.indices.push(a, c, d, a, d, b);
  }
  return touch(mesh);
}

function compactMesh(mesh) {
  const used = new Set(mesh.indices);
  const remap = new Map();
  const positions = [];
  for (let old = 0; old < mesh.positions.length / 3; old += 1) {
    if (!used.has(old)) continue;
    remap.set(old, positions.length / 3);
    positions.push(...vertex(mesh, old));
  }
  mesh.positions = positions;
  mesh.indices = mesh.indices.map((index) => remap.get(index));
  return mesh;
}

export function weldVertices(meshInput, vertexIds) {
  const mesh = normalizeEditableMesh(meshInput);
  const ids = [...new Set(vertexIds.map(Number))].filter((id) => id >= 0 && id < mesh.positions.length / 3);
  if (ids.length < 2) throw new Error('Weld requires at least two vertices.');
  const average = [0, 0, 0];
  for (const id of ids) { const point = vertex(mesh, id); average[0] += point[0]; average[1] += point[1]; average[2] += point[2]; }
  average[0] /= ids.length; average[1] /= ids.length; average[2] /= ids.length;
  const target = Math.min(...ids);
  mesh.positions.splice(target * 3, 3, ...average);
  const merged = new Set(ids);
  mesh.indices = mesh.indices.map((id) => merged.has(id) ? target : id);
  const valid = [];
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    const face = mesh.indices.slice(offset, offset + 3);
    if (new Set(face).size === 3) valid.push(...face);
  }
  mesh.indices = valid;
  compactMesh(mesh);
  return touch(mesh);
}

export function mergeNearbyVertices(meshInput, tolerance = .001) {
  const mesh = normalizeEditableMesh(meshInput);
  const size = Math.max(1e-7, finite(tolerance, .001));
  const buckets = new Map();
  const remap = new Map();
  for (let id = 0; id < mesh.positions.length / 3; id += 1) {
    const point = vertex(mesh, id);
    const key = point.map((value) => Math.round(value / size)).join(':');
    const target = buckets.get(key);
    if (target == null) buckets.set(key, id); else remap.set(id, target);
  }
  mesh.indices = mesh.indices.map((id) => remap.get(id) ?? id);
  compactMesh(mesh);
  return touch(mesh);
}

export function recalculateVertexNormals(meshInput) {
  const mesh = normalizeEditableMesh(meshInput);
  const normals = new Array(mesh.positions.length).fill(0);
  for (let face = 0; face < mesh.indices.length / 3; face += 1) {
    const metrics = triangleMetrics(mesh, face);
    for (const id of metrics.vertices) {
      const offset = id * 3;
      normals[offset] += metrics.normal[0] * metrics.area;
      normals[offset + 1] += metrics.normal[1] * metrics.area;
      normals[offset + 2] += metrics.normal[2] * metrics.area;
    }
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset], normals[offset + 1], normals[offset + 2]) || 1;
    normals[offset] /= length; normals[offset + 1] /= length; normals[offset + 2] /= length;
  }
  mesh.normals = normals;
  return touch(mesh);
}

export function selectConnectedFaces(meshInput, seedFace) {
  const topology = meshTopology(meshInput);
  const selected = new Set();
  const queue = [Number(seedFace)];
  while (queue.length) {
    const face = queue.pop();
    if (selected.has(face) || face < 0 || face >= topology.faceCount) continue;
    selected.add(face);
    for (const id of faceVertices(topology.mesh, face)) {
      for (const neighbor of topology.vertexFaces[id]) if (!selected.has(neighbor)) queue.push(neighbor);
    }
  }
  return selected;
}

export function growFaceSelection(meshInput, faceIds) {
  const topology = meshTopology(meshInput);
  const result = new Set(faceIds);
  for (const face of faceIds) for (const id of faceVertices(topology.mesh, face)) {
    for (const neighbor of topology.vertexFaces[id]) result.add(neighbor);
  }
  return result;
}

export function shrinkFaceSelection(meshInput, faceIds) {
  const topology = meshTopology(meshInput);
  const source = new Set(faceIds);
  const result = new Set();
  for (const face of source) {
    const neighbors = new Set();
    for (const id of faceVertices(topology.mesh, face)) for (const neighbor of topology.vertexFaces[id]) neighbors.add(neighbor);
    if ([...neighbors].every((neighbor) => source.has(neighbor))) result.add(face);
  }
  return result;
}

export function meshDiagnostics(meshInput) {
  const topology = meshTopology(meshInput);
  return {
    vertexCount: topology.vertexCount, faceCount: topology.faceCount,
    boundaryEdges: topology.boundaryEdges,
    boundaryLoops: boundaryLoops(topology.mesh),
    nonManifoldEdges: topology.nonManifoldEdges,
    isolatedVertices: topology.isolatedVertices,
    zeroAreaFaces: topology.zeroAreaFaces,
    thinFaces: topology.thinFaces,
    duplicateFaces: topology.duplicateFaces
  };
}
