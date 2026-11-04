import test from 'node:test';
import assert from 'node:assert/strict';
import * as pc from 'playcanvas';
import { sweptTube } from '../src/graphics/sculpted-geometry.js';
import { authoredRockCandidates } from '../src/world/authored-rock-coverage.js';
import { aquariumPathSurface, tankRimBoxes } from '../src/world/aquarium-surfaces.js';
import { MountainWorld, PUBLIC_AQUARIUM_CONFIG, buildOceanIslandTerrainData, triangleSurfaceHeightAt } from '../src/world/mountain-v2.js';
import { WORLD_LOCATIONS } from '../src/world/world-locations.js';
import { makeProductionIslandEditorLevel, ensureProductionIslandTerrain } from '../tools/map-editor/production-island-adapter.js';

test('swept surfaces have outward-facing sides and finite nondegenerate triangles', () => {
  const mesh = sweptTube([[0, 0, 0, .3], [1, 0, 0, .25], [2, 0, 0, .1]]);
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.slice(i, i + 3).map(index => new pc.Vec3(...mesh.positions.slice(index * 3, index * 3 + 3)));
    const n = new pc.Vec3().cross(b.clone().sub(a), c.clone().sub(a));
    assert.ok(n.length() > 1e-8);
    const center = a.clone().add(b).add(c).mulScalar(1 / 3);
    if (Math.abs(n.x) < n.length() * .9) assert.ok(n.y * center.y + n.z * center.z > 0, 'outside of tube must face the camera');
  }
});

test('authored coverage samples vertical cliffs at several elevations sharing the same footprint', () => {
  const mesh = { positions: [0, 15, 0, 0, 80, 0, 0, 80, 40, 0, 15, 40], indices: [0, 1, 2, 0, 2, 3] };
  const options = { center: { x: -40, z: 0 }, existing: [{ position: { x: 0, y: 21, z: 20 }, boundingRadius: 3 }] };
  const points = authoredRockCandidates(mesh, options);
  assert.deepEqual(points, authoredRockCandidates(mesh, options));
  assert.ok(points.some(p => p.point.y < 29)); assert.ok(points.some(p => p.point.y > 65));
  assert.ok(points.every(p => p.normal.x > .99 && Math.abs(p.normal.y) < .01));
  assert.ok(points.every(p => Math.hypot(p.point.x, p.point.y - 21, p.point.z - 20) > 5.9));
});

test('wall attachment establishes multiple hull contacts along the face normal without dropping the rock', () => {
  const result = MountainWorld.prototype.ensureRockCoreContact.call({}, { x: .25, y: 45, z: 20 }, { x: 2, y: 2, z: 2 }, new pc.Quat(),
    { hull: [[-.1, -1, -1], [-.1, 1, -1], [.9, 0, 1], [-.9, 0, 0]] }, { authoredSurface: { point: { x: 0, y: 45, z: 20 }, normal: { x: 1, y: 0, z: 0 } } });
  assert.equal(result.support.supported, true); assert.ok(result.support.contactCount >= 3);
  assert.equal(result.position.y, 45); assert.equal(result.position.z, 20); assert.ok(result.exposure.maximum > .14);
});

test('Glasswater path remains exactly above the terrain across its entire clipped surface', () => {
  const location = WORLD_LOCATIONS.find(l => l.id === 'aquarium-island');
  const terrain = buildOceanIslandTerrainData(location), floorY = PUBLIC_AQUARIUM_CONFIG.floorY;
  const mesh = aquariumPathSurface(terrain, location, { startZ: 24.4, endZ: 64, floorY });
  assert.ok(mesh.indices.length > 0);
  const a = location.angle * Math.PI / 180;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const [x, y, z] = mesh.positions.slice(i, i + 3);
    const wx = location.worldPosition.x + Math.sin(a) * x + Math.cos(a) * z;
    const wz = location.worldPosition.z - Math.cos(a) * x + Math.sin(a) * z;
    const ground = triangleSurfaceHeightAt(terrain.vertices, terrain.triangles, wx, wz, NaN);
    assert.ok(Number.isFinite(ground)); assert.ok(Math.abs((y + floorY - ground) - .055) < 1e-7);
  }
  const rims = tankRimBoxes(PUBLIC_AQUARIUM_CONFIG);
  assert.equal(rims.length, 4); assert.ok(rims.every(r => Math.min(r.size.x, r.size.z) < .4));
});

test('editor reconciles renamed/reordered production geometry without replacing a user-moved reference', () => {
  const level = makeProductionIslandEditorLevel('aquarium-island');
  const pane = level.objects.find(o => /Tank 1 front viewing glass/.test(o.name));
  const oldId = pane.id; pane.id = 'old-sequence-id'; pane.transform.position.x += 3;
  const editedX = pane.transform.position.x;
  level.objects.push({ ...structuredClone(pane), id: oldId, name: 'Aquarium Tank 1 upper exhibit frame' });
  ensureProductionIslandTerrain(level, 'aquarium-island');
  assert.equal(level.objects.find(o => o.name === pane.name).transform.position.x, editedX);
  assert.ok(!level.objects.some(o => o.name.endsWith('upper exhibit frame')));
  assert.equal(level.objects.filter(o => o.name === pane.name).length, 1);
  assert.ok(level.objects.find(o => o.name === pane.name).metadata.surfaceMesh);
});
