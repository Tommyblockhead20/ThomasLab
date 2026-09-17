import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import SCENE from '../src/world/library-island-v2.scene.json' with { type: 'json' };
import { adaptLibrarySceneToEditor, serializeLibrarySceneFromEditor } from '../tools/map-editor/library-scene-adapter.js';
import {
  boundaryLoops, createFace, deleteFaces, fillBoundary, flipFaces, makeMeshSelection,
  meshDiagnostics, moveSelectedVertices, recalculateVertexNormals, weldVertices
} from '../tools/map-editor/mesh-authoring.js';
import {
  cutRectangularOpeningInBox, extendStairAssembly, findLikelyZFighting,
  generateStairAssembly, makeBookshelfPrefab, makeFireplacePrefab
} from '../tools/map-editor/architectural-tools.js';
import {
  authoredWaterToPath, pathToAuthoredWater, reverseWaterPath, validateWaterPath, waterPathPose
} from '../tools/map-editor/water-path-tools.js';

const tetra = () => ({
  id: 'captured-basalt-test', mode: 'authored-mesh-candidate',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]
});

test('v3 mesh selection edits vertices while preserving the stable captured mesh id', () => {
  const selection = makeMeshSelection({ vertices: [1] });
  const edited = moveSelectedVertices(tetra(), selection, { x: .5, y: .25, z: 0 });
  assert.equal(edited.id, 'captured-basalt-test');
  assert.deepEqual(edited.positions.slice(3, 6), [1.5, .25, 0]);
  assert.equal(edited.revision, 1);
});

test('v3 topology creates/deletes/fills faces and exposes open boundaries', () => {
  const source = tetra();
  const deleted = deleteFaces(source, new Set([3]));
  const diagnostic = meshDiagnostics(deleted);
  assert.equal(diagnostic.boundaryEdges.length, 3);
  const loop = boundaryLoops(deleted).find((item) => item.closed);
  assert.ok(loop);
  const filled = fillBoundary(deleted, loop.vertices);
  assert.equal(filled.indices.length, source.indices.length);
  const deletedAgain = deleteFaces(filled, new Set([3]));
  const repaired = createFace(deletedAgain, [2, 0, 3]);
  assert.equal(repaired.indices.length, source.indices.length);
});

test('v3 topology weld, winding, and normal repair are durable mesh operations', () => {
  const duplicated = { id: 'repair', positions: [0,0,0, 1,0,0, 0,1,0, 0,0,0], indices: [3,1,2] };
  const welded = weldVertices(duplicated, [0, 3]);
  assert.equal(welded.positions.length / 3, 3);
  const before = [...welded.indices];
  const flipped = flipFaces(welded, [0]);
  assert.equal(flipped.indices[1], before[2]);
  const normaled = recalculateVertexNormals(flipped);
  assert.equal(normaled.normals.length, normaled.positions.length);
  assert.ok(normaled.normals.every(Number.isFinite));
});

test('v3 Cut Opening replaces an actual slab with four structural fragments', () => {
  const slab = { id: 'floor', name: 'floor', transform: { position: { x: 0, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }, size: { x: 10, y: .25, z: 8 }, collision: true };
  const pieces = cutRectangularOpeningInBox(slab, { thicknessAxis: 'y', center: { x: 1, y: 3, z: 0 }, size: { x: 3, z: 2.5 } });
  assert.equal(pieces.length, 4);
  assert.ok(pieces.every((piece) => piece.collision && piece.size.y === .25));
  const pointInsidePiece = pieces.some((piece) => Math.abs(1 - piece.transform.position.x) < piece.size.x / 2 && Math.abs(piece.transform.position.z) < piece.size.z / 2);
  assert.equal(pointInsidePiece, false, 'the opening center must not remain covered');
});

test('v3 stair generator and downward extension produce stable editable treads', () => {
  const stair = generateStairAssembly({ id: 'test-stair', start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 3, z: 5 }, stepCount: 14, width: 2.4 });
  assert.equal(stair.steps.length, 14);
  assert.equal(stair.properties.riserHeight, 3 / 14);
  const extension = extendStairAssembly(stair.steps, 5, 'down');
  assert.equal(extension.length, 5);
  assert.ok(extension.every((step) => step.metadata.stairId === 'test-stair'));
});

test('v3 shelf and fireplace definitions contain recognizable geometry and metadata', () => {
  const shelf = makeBookshelfPrefab({ id: 'shelf-test', shelfCount: 5, bookDensity: .8 });
  assert.ok(shelf.objects.filter((part) => part.category === 'books').length >= 10);
  assert.ok(shelf.objects.some((part) => /frame/.test(part.name)));
  const fire = makeFireplacePrefab({ id: 'fire-test', monumental: true });
  assert.ok(fire.objects.some((part) => part.metadata.fireVisual));
  assert.ok(fire.metadata.light.intensity > 0);
});

test('v3 z-fighting scan catches a synthetic coplanar duplicate without flagging a perpendicular join', () => {
  const box = (id, position, size) => ({ id, name: id, transform: { position }, size });
  const findings = findLikelyZFighting([
    box('floor-a', { x: 0, y: 0, z: 0 }, { x: 5, y: .2, z: 5 }),
    box('floor-b', { x: .4, y: .005, z: 0 }, { x: 5, y: .2, z: 5 }),
    box('wall', { x: 2.5, y: 1.5, z: 0 }, { x: .2, y: 3, z: 5 })
  ], .01);
  assert.ok(findings.some((item) => item.objectId === 'floor-a' && item.otherObjectId === 'floor-b'));
  assert.ok(!findings.some((item) => item.otherObjectId === 'wall'));
});

test('v3 lazy-river path preserves loop, direction, width, depth, and ride identity', () => {
  const source = SCENE.rideWaters.find((water) => water.id === 'athenaeum-lazy-river');
  const path = authoredWaterToPath(source);
  assert.equal(validateWaterPath(path).filter((item) => item.severity === 'error').length, 0);
  assert.equal(path.closed, true);
  const reversed = reverseWaterPath(path);
  const saved = pathToAuthoredWater(reversed, source);
  assert.equal(saved.id, source.id);
  assert.equal(saved.flowDirection, -1);
  assert.equal(saved.pathWidth, source.pathWidth);
  assert.equal(saved.surfaceLocalY - saved.floorLocalY, source.surfaceLocalY - source.floorLocalY);
  assert.equal(saved.rideable, true);
  assert.ok(Number.isFinite(waterPathPose(path, 12).yaw));
});

test('v3 Library source round-trip retains stair openings, fireplace, and ride-only water', () => {
  const saved = serializeLibrarySceneFromEditor(adaptLibrarySceneToEditor(SCENE));
  assert.ok(saved.parts.some((part) => part.id === 'balcony-left-opening-south'));
  assert.ok(saved.instances.some((instance) => instance.prefab === 'monumental-fireplace'));
  assert.equal(saved.rideWaters[0].id, 'athenaeum-lazy-river');
  assert.deepEqual(saved.waters.map((water) => water.id), ['athenaeum-grand-canal', 'athenaeum-atrium-basin', 'athenaeum-hidden-archive-pool']);
});

test('v3 never changes the authoritative Stoneveil patch', async () => {
  const bytes = await readFile(new URL('../src/world/map-editor-patch.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex').toUpperCase(), '815674C382C711CF9DEF2D4FF07AC7DCC205B0E472DAA67A284B23516474E5DD');
});
